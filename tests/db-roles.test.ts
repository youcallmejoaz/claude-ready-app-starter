// Proves the database itself blocks writes for the MCP roles, even if the SQL guard were bypassed.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@/lib/db/client";
import { AUDIT_URL, pool, READONLY_URL } from "./helpers";
import { loadSampleData } from "./setup-db";

const ro = pool(READONLY_URL);
const auditor = pool(AUDIT_URL);

beforeAll(loadSampleData);
afterAll(async () => {
  await Promise.all([ro.end(), auditor.end(), closeDb()]);
});

describe("mcp_readonly role (direct SQL, no parser)", () => {
  it("can SELECT the analytics tables", async () => {
    const { rows } = await ro.query("SELECT count(*)::int AS n FROM ads_daily_metrics");
    expect(rows[0].n).toBe(270);
  });

  it.each([
    "INSERT INTO ads_campaigns (id, name, channel_type, status) VALUES ('x', 'x', 'SEARCH', 'ENABLED')",
    "UPDATE ads_daily_metrics SET cost = 0",
    "DELETE FROM ads_campaigns",
    "TRUNCATE ads_campaigns",
    "DROP TABLE ads_campaigns",
    "CREATE TABLE sneaky (id int)",
    "ALTER TABLE ads_campaigns ADD COLUMN sneaky int",
  ])("rejects %s", async (sql) => {
    await expect(ro.query(sql)).rejects.toThrow(/read-only transaction|permission denied|must be owner/);
  });

  it("still rejects writes after switching the transaction to read write", async () => {
    const c = await ro.connect();
    try {
      await c.query("BEGIN TRANSACTION READ WRITE");
      await expect(c.query("DELETE FROM ads_campaigns")).rejects.toThrow(/permission denied/);
      await c.query("ROLLBACK");
      await c.query("BEGIN TRANSACTION READ WRITE");
      await expect(c.query("CREATE TABLE sneaky (id int)")).rejects.toThrow(/permission denied/);
      await c.query("ROLLBACK");
    } finally {
      c.release();
    }
  });

  it.each(["users", "accounts", "sessions", "mcp_tokens", "mcp_audit"])("cannot read %s", async (table) => {
    await expect(ro.query(`SELECT * FROM ${table} LIMIT 1`)).rejects.toThrow(/permission denied/);
  });

  it("has a 5 second statement timeout by default", async () => {
    const { rows } = await ro.query("SHOW statement_timeout");
    expect(rows[0].statement_timeout).toBe("5s");
  });
});

describe("mcp_auditor role", () => {
  it("can insert audit rows but not read or change them", async () => {
    await auditor.query("INSERT INTO mcp_audit (method, status) VALUES ('test', 'ok')");
    await expect(auditor.query("SELECT * FROM mcp_audit")).rejects.toThrow(/permission denied/);
    await expect(auditor.query("DELETE FROM mcp_audit")).rejects.toThrow(/permission denied/);
    await expect(auditor.query("UPDATE mcp_audit SET status = 'x'")).rejects.toThrow(/permission denied/);
  });

  it("cannot touch analytics or user data", async () => {
    await expect(auditor.query("SELECT * FROM ads_campaigns")).rejects.toThrow(/permission denied/);
    await expect(auditor.query("DELETE FROM ads_campaigns")).rejects.toThrow(/permission denied/);
    await expect(auditor.query("SELECT * FROM users")).rejects.toThrow(/permission denied/);
  });
});
