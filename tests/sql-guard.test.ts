import { describe, expect, it } from "vitest";
import { checkSelect } from "../mcp/sql-guard";

describe("run_select SQL guard", () => {
  it.each([
    "SELECT * FROM ads_campaigns",
    "select name, sum(cost) from ads_daily_metrics m join ads_campaigns c on c.id = m.campaign_id group by name order by 2 desc",
    "WITH t AS (SELECT date, sessions FROM ga4_daily_metrics) SELECT avg(sessions) FROM t",
    "SELECT 1; -- trailing comment",
    "SELECT date_trunc('week', date) AS week, sum(sessions) FROM ga4_daily_metrics GROUP BY 1",
  ])("allows %s", async (sql) => {
    expect(await checkSelect(sql)).toEqual({ ok: true });
  });

  it.each([
    ["INSERT INTO ads_campaigns VALUES ('1','x','SEARCH','ENABLED')", /Only SELECT/],
    ["UPDATE ads_daily_metrics SET cost = 0", /Only SELECT/],
    ["DELETE FROM ads_campaigns", /Only SELECT/],
    ["DROP TABLE ads_campaigns", /Only SELECT/],
    ["TRUNCATE ads_campaigns", /Only SELECT/],
    ["ALTER TABLE ads_campaigns ADD COLUMN x int", /Only SELECT/],
    ["CREATE TABLE x (id int)", /Only SELECT/],
    ["GRANT ALL ON ads_campaigns TO public", /Only SELECT/],
    ["SET statement_timeout = 0", /Only SELECT/],
    ["COPY ads_campaigns TO '/tmp/x'", /Only SELECT/],
    ["SELECT 1; DELETE FROM ads_campaigns", /single statement/],
    ["SELECT 1; SELECT 2", /single statement/],
    ["WITH gone AS (DELETE FROM ads_campaigns RETURNING *) SELECT * FROM gone", /Data-changing/],
    ["SELECT * INTO copy_of_campaigns FROM ads_campaigns", /SELECT INTO/],
    ["SELECT * FROM ads_campaigns FOR UPDATE", /locking/],
    ["SELECT pg_sleep(10)", /pg_sleep/],
    ["SELECT pg_catalog.pg_sleep(10)", /pg_sleep/],
    ["SELECT * FROM ads_campaigns WHERE pg_sleep(1) IS NULL", /pg_sleep/],
    ["SELECT pg_read_file('/etc/passwd')", /pg_read_file/],
    ["SELECT set_config('statement_timeout', '0', false)", /set_config/],
    ["SELECT current_setting('is_superuser')", /current_setting/],
    ["SELECT lo_import('/etc/passwd')", /lo_import/],
    ["SELECT * FROM pg_catalog.pg_roles", /System catalogs/],
    ["SELECT * FROM pg_stat_activity", /System catalogs/],
    ["SELECT * FROM information_schema.tables", /System catalogs/],
    ["SELEC * FROM ads_campaigns", /could not be parsed/],
    ["", /Empty/],
  ])("rejects %s", async (sql, reason) => {
    const r = await checkSelect(sql);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(reason);
  });
});
