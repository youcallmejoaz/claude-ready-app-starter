import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { closeDb, getDb } from "@/lib/db/client";
import { mcpTokens } from "@/lib/db/schema";
import { generateToken, hashToken } from "@/lib/mcp-tokens";
import { lastNDays } from "@/lib/dates";
import { eq } from "drizzle-orm";
import { createMcpApp } from "../mcp/app";
import { runCheckedSelect } from "../mcp/tools";
import { AUDIT_URL, OWNER_URL, pool, READONLY_URL } from "./helpers";
import { loadSampleData } from "./setup-db";

const owner = pool(OWNER_URL);
const app = createMcpApp({ readonlyUrl: READONLY_URL, auditUrl: AUDIT_URL });
const server = http.createServer(app.handler);
let url: string;
let token: string;
let tokenId: string;

async function connect(bearer = token) {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: `Bearer ${bearer}` } } }),
  );
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { type: string; text: string }[] };
  return { isError: Boolean(res.isError), text: res.content[0].text, json: () => JSON.parse(res.content[0].text) };
}

async function post(headers: Record<string, string>) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
}

const auditCount = async () => (await owner.query("SELECT count(*)::int AS n FROM mcp_audit")).rows[0].n as number;

beforeAll(async () => {
  await loadSampleData();
  token = generateToken();
  const [row] = await getDb().insert(mcpTokens).values({ name: "test", tokenHash: hashToken(token) }).returning();
  tokenId = row.id;
  await new Promise<void>((r) => server.listen(0, r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  await Promise.all([app.close(), owner.end(), closeDb()]);
});

describe("MCP authentication", () => {
  it("returns 401 without a token", async () => {
    const res = await post({});
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/^Bearer/);
  });

  it("returns 401 with a wrong token", async () => {
    expect((await post({ authorization: "Bearer mcp_not-a-real-token" })).status).toBe(401);
  });

  it("returns 401 with a revoked token", async () => {
    const revoked = generateToken();
    await getDb().insert(mcpTokens).values({ name: "old", tokenHash: hashToken(revoked), revokedAt: new Date() });
    expect((await post({ authorization: `Bearer ${revoked}` })).status).toBe(401);
  });

  it("stops accepting a token as soon as it is revoked", async () => {
    const t = generateToken();
    const [row] = await getDb().insert(mcpTokens).values({ name: "temp", tokenHash: hashToken(t) }).returning();
    expect((await post({ authorization: `Bearer ${t}` })).status).toBe(200);
    await getDb().update(mcpTokens).set({ revokedAt: new Date() }).where(eq(mcpTokens.id, row.id));
    expect((await post({ authorization: `Bearer ${t}` })).status).toBe(401);
  });

  it("stores only a hash of the token", async () => {
    const { rows } = await owner.query("SELECT token_hash FROM mcp_tokens WHERE id = $1", [tokenId]);
    expect(rows[0].token_hash).toBe(hashToken(token));
    expect(rows[0].token_hash).not.toContain(token);
  });

  it("writes an audit row for rejected requests", async () => {
    const before = await auditCount();
    await post({});
    const { rows } = await owner.query("SELECT status FROM mcp_audit ORDER BY created_at DESC LIMIT 1");
    expect(await auditCount()).toBe(before + 1);
    expect(rows[0].status).toBe("unauthorized");
  });
});

describe("MCP tools return correct numbers for the seeded data", () => {
  const { start, end } = lastNDays(30);
  let client: Client;
  beforeAll(async () => {
    client = await connect();
  });
  afterAll(() => client.close());

  it("lists the five tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["campaign_performance", "describe_schema", "run_select", "top_landing_pages", "traffic_summary"]);
  });

  it("describe_schema shows analytics tables only", async () => {
    const tables = (await call(client, "describe_schema")).json().tables.map((t: { table: string }) => t.table);
    expect(tables).toEqual(["ads_campaigns", "ads_daily_metrics", "ga4_daily_metrics", "ga4_landing_pages_daily", "sync_runs"]);
  });

  it("traffic_summary matches SQL", async () => {
    const r = (await call(client, "traffic_summary", { start, end })).json();
    const { rows } = await owner.query(
      "SELECT sum(sessions)::int AS s, sum(users)::int AS u, sum(conversions)::int AS c, count(*)::int AS d FROM ga4_daily_metrics WHERE date BETWEEN $1 AND $2",
      [start, end],
    );
    expect(r.totals).toMatchObject({ sessions: rows[0].s, users: rows[0].u, conversions: rows[0].c });
    expect(r.days).toBe(30);
  });

  it("campaign_performance matches SQL and sorts by cost per conversion", async () => {
    const r = (await call(client, "campaign_performance", { start, end, sort_by: "cost_per_conversion" })).json();
    const { rows } = await owner.query(
      `SELECT c.name, sum(m.cost) AS cost, sum(m.conversions) AS conv
         FROM ads_daily_metrics m JOIN ads_campaigns c ON c.id = m.campaign_id
        WHERE m.date BETWEEN $1 AND $2 GROUP BY c.name`,
      [start, end],
    );
    const expected = rows
      .map((x) => ({ name: x.name, cost: Number(x.cost), cpa: Number(x.cost) / Number(x.conv) }))
      .sort((a, b) => a.cpa - b.cpa);
    expect(r.rows.map((x: { name: string }) => x.name)).toEqual(expected.map((x) => x.name));
    for (const [i, e] of expected.entries()) {
      expect(r.rows[i].cost).toBeCloseTo(e.cost, 2);
      expect(r.rows[i].cost_per_conversion).toBeCloseTo(e.cpa, 1);
    }
    expect(r.rows[0].name).toBe("Search Brand");
    expect(r.rows[2].name).toBe("Performance Max");
  });

  it("top_landing_pages matches SQL", async () => {
    const r = (await call(client, "top_landing_pages", { start, end, limit: 3 })).json();
    const { rows } = await owner.query(
      "SELECT landing_page, sum(sessions)::int AS s FROM ga4_landing_pages_daily WHERE date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 2 DESC LIMIT 3",
      [start, end],
    );
    expect(r.rows.map((x: { landing_page: string; sessions: number }) => [x.landing_page, x.sessions])).toEqual(rows.map((x) => [x.landing_page, x.s]));
  });

  it("run_select returns rows for a valid SELECT", async () => {
    const r = (await call(client, "run_select", { sql: "SELECT count(*)::int AS n FROM ads_campaigns;" })).json();
    expect(r.rows).toEqual([{ n: 3 }]);
  });

  it.each([
    "DELETE FROM ads_campaigns",
    "UPDATE ads_daily_metrics SET cost = 0",
    "INSERT INTO ads_campaigns VALUES ('9','x','SEARCH','ENABLED')",
    "DROP TABLE ads_campaigns",
    "SELECT 1; DELETE FROM ads_campaigns",
    "SELECT pg_sleep(30)",
  ])("run_select blocks %s and nothing changes", async (sql) => {
    const r = await call(client, "run_select", { sql });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/^Blocked: .*read only/);
    const { rows } = await owner.query("SELECT count(*)::int AS n FROM ads_campaigns");
    expect(rows[0].n).toBe(3);
  });

  it("run_select caps results at 500 rows", async () => {
    const r = (await call(client, "run_select", { sql: "SELECT g FROM generate_series(1, 2000) g" })).json();
    expect(r.rows).toHaveLength(500);
    expect(r.truncated).toBe(true);
  });

  it("rejects bad date ranges", async () => {
    const r = await call(client, "traffic_summary", { start: end, end: start });
    expect(r.isError).toBe(true);
  });

  it("writes one audit row per tool call, with the outcome", async () => {
    const before = await auditCount();
    await call(client, "campaign_performance", { start, end, sort_by: "cost" });
    await call(client, "run_select", { sql: "DELETE FROM ads_campaigns" });
    const { rows } = await owner.query(
      "SELECT tool, status, reason, token_id, input FROM mcp_audit WHERE method = 'tools/call' ORDER BY created_at DESC LIMIT 2",
    );
    expect(await auditCount()).toBe(before + 2);
    expect(rows[0]).toMatchObject({ tool: "run_select", status: "blocked", token_id: tokenId, input: { sql: "DELETE FROM ads_campaigns" } });
    expect(rows[0].reason).toMatch(/Only SELECT/);
    expect(rows[1]).toMatchObject({ tool: "campaign_performance", status: "ok" });
  });
});

describe("run_select execution limits", () => {
  const ro = pool(READONLY_URL);
  afterAll(() => ro.end());

  it("stops queries after 5 seconds", async () => {
    const t = Date.now();
    await expect(runCheckedSelect(ro, "SELECT count(*) FROM generate_series(1, 10000000000)")).rejects.toThrow(/statement timeout/);
    expect(Date.now() - t).toBeLessThan(8000);
  }, 15_000);
});
