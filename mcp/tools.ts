import type pg from "pg";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CAMPAIGN_SORTS, campaignPerformance, topLandingPages, trafficSummary } from "../src/lib/analytics/queries";
import { DATE_RE, daysBetween } from "../src/lib/dates";
import { writeAudit } from "./audit";
import type { TokenInfo } from "./auth";
import { checkSelect } from "./sql-guard";
import { parse } from "libpg-query";

export const ROW_CAP = 500;
export const STATEMENT_TIMEOUT_MS = 5000;

export interface ToolContext {
  readonlyPool: pg.Pool; // mcp_readonly: SELECT only
  auditPool: pg.Pool; // mcp_auditor: INSERT into mcp_audit only
  token: TokenInfo;
  clientIp?: string;
}

class Blocked extends Error {}

const isoDate = z.string().regex(DATE_RE, "Use YYYY-MM-DD");
const range = {
  start: isoDate.describe("First day, YYYY-MM-DD (inclusive)"),
  end: isoDate.describe("Last day, YYYY-MM-DD (inclusive)"),
};

function checkRange(start: string, end: string) {
  if (start > end) throw new Blocked("start must be on or before end.");
  if (daysBetween(start, end) > 400) throw new Blocked("Date range is limited to 400 days.");
}

function json(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function rowCountOf(value: unknown): number | null {
  if (value && typeof value === "object") {
    const v = value as { rows?: unknown[]; daily?: unknown[]; tables?: unknown[] };
    const list = v.rows ?? v.daily ?? v.tables;
    if (Array.isArray(list)) return list.length;
  }
  return null;
}

/** Runs a tool body and writes exactly one audit row, whatever the outcome. */
async function audited(ctx: ToolContext, tool: string, input: unknown, body: () => Promise<unknown>): Promise<CallToolResult> {
  const started = Date.now();
  const base = { tokenId: ctx.token.id, tokenName: ctx.token.name, method: "tools/call", tool, input, clientIp: ctx.clientIp };
  try {
    const result = await body();
    await writeAudit(ctx.auditPool, { ...base, status: "ok", rowCount: rowCountOf(result), durationMs: Date.now() - started });
    return json(result);
  } catch (err) {
    const blocked = err instanceof Blocked;
    const reason = err instanceof Error ? err.message : String(err);
    await writeAudit(ctx.auditPool, { ...base, status: blocked ? "blocked" : "error", reason, durationMs: Date.now() - started });
    const text = blocked
      ? `Blocked: ${reason} This connector is read only, so nothing was changed.`
      : `The query failed: ${reason}`;
    return { isError: true, content: [{ type: "text", text }] };
  }
}

export async function describeSchema(pool: pg.Pool) {
  const { rows } = await pool.query<{ table_name: string; table_description: string | null; column_name: string; data_type: string; column_description: string | null }>(
    `SELECT c.relname AS table_name,
            obj_description(c.oid, 'pg_class') AS table_description,
            a.attname AS column_name,
            format_type(a.atttypid, a.atttypmod) AS data_type,
            col_description(c.oid, a.attnum) AS column_description
       FROM pg_class c
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      WHERE c.relnamespace = 'public'::regnamespace
        AND c.relkind IN ('r', 'v', 'm')
        AND has_table_privilege(c.oid, 'SELECT')
      ORDER BY c.relname, a.attnum`,
  );
  const tables = new Map<string, { table: string; description: string | null; columns: { name: string; type: string; description?: string }[] }>();
  for (const r of rows) {
    if (!tables.has(r.table_name)) tables.set(r.table_name, { table: r.table_name, description: r.table_description, columns: [] });
    tables.get(r.table_name)!.columns.push({ name: r.column_name, type: r.data_type, ...(r.column_description ? { description: r.column_description } : {}) });
  }
  return { tables: [...tables.values()] };
}

/** Executes an already-checked SELECT in a read-only transaction with a timeout and a row cap. */
export async function runCheckedSelect(pool: pg.Pool, sql: string) {
  // Use the parser's own statement boundaries so a trailing ';' or comment cannot leak into DECLARE.
  const tree = (await parse(sql)) as unknown as { stmts: { stmt_location?: number; stmt_len?: number }[] };
  const { stmt_location = 0, stmt_len = 0 } = tree.stmts[0];
  const statement = stmt_len ? sql.slice(stmt_location, stmt_location + stmt_len) : sql.slice(stmt_location);

  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    await client.query(`DECLARE mcp_cursor NO SCROLL CURSOR FOR ${statement}`);
    const res = await client.query(`FETCH ${ROW_CAP + 1} FROM mcp_cursor`);
    await client.query("ROLLBACK");
    const truncated = res.rows.length > ROW_CAP;
    return {
      columns: res.fields.map((f) => f.name),
      rows: res.rows.slice(0, ROW_CAP),
      row_count: Math.min(res.rows.length, ROW_CAP),
      truncated,
      ...(truncated ? { note: `Only the first ${ROW_CAP} rows are returned.` } : {}),
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export function registerTools(server: McpServer, ctx: ToolContext) {
  const ro = ctx.readonlyPool;

  server.registerTool(
    "describe_schema",
    {
      description: "List the tables and columns this connector can read, with plain-language descriptions.",
      annotations: { readOnlyHint: true },
    },
    async () => audited(ctx, "describe_schema", {}, () => describeSchema(ro)),
  );

  server.registerTool(
    "traffic_summary",
    {
      description: "Google Analytics 4 totals and daily figures (sessions, users, conversions) for a date range.",
      inputSchema: range,
      annotations: { readOnlyHint: true },
    },
    async ({ start, end }) =>
      audited(ctx, "traffic_summary", { start, end }, async () => {
        checkRange(start, end);
        return trafficSummary(ro, start, end);
      }),
  );

  server.registerTool(
    "campaign_performance",
    {
      description:
        "Google Ads results per campaign for a date range: cost, impressions, clicks, conversions, CTR (%), cost per click and cost per conversion. Sort by cost, clicks, conversions, ctr or cost_per_conversion (lowest first).",
      inputSchema: { ...range, sort_by: z.enum(CAMPAIGN_SORTS).default("cost").describe("Sort order") },
      annotations: { readOnlyHint: true },
    },
    async ({ start, end, sort_by }) =>
      audited(ctx, "campaign_performance", { start, end, sort_by }, async () => {
        checkRange(start, end);
        return campaignPerformance(ro, start, end, sort_by);
      }),
  );

  server.registerTool(
    "top_landing_pages",
    {
      description: "The landing pages with the most sessions in a date range, with users, conversions and conversion rate (%).",
      inputSchema: { ...range, limit: z.number().int().min(1).max(50).default(8).describe("How many pages") },
      annotations: { readOnlyHint: true },
    },
    async ({ start, end, limit }) =>
      audited(ctx, "top_landing_pages", { start, end, limit }, async () => {
        checkRange(start, end);
        return topLandingPages(ro, start, end, limit);
      }),
  );

  server.registerTool(
    "run_select",
    {
      description: `Run one read-only SQL SELECT against the analytics tables (call describe_schema first). Anything that is not a single SELECT is rejected. ${STATEMENT_TIMEOUT_MS / 1000} second timeout, at most ${ROW_CAP} rows.`,
      inputSchema: { sql: z.string().min(1).max(10_000).describe("A single PostgreSQL SELECT statement") },
      annotations: { readOnlyHint: true },
    },
    async ({ sql }) =>
      audited(ctx, "run_select", { sql }, async () => {
        const verdict = await checkSelect(sql);
        if (!verdict.ok) throw new Blocked(verdict.reason);
        return runCheckedSelect(ro, sql);
      }),
  );
}
