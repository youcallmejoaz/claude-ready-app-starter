import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db/client";
import { syncAll } from "@/lib/sync/run";
import { useTestEnv } from "./helpers";

useTestEnv();

async function counts() {
  const { rows } = await getDb().execute<{ ads: number; campaigns: number; ga4: number; pages: number }>(sql`
    SELECT (SELECT count(*) FROM ads_daily_metrics)::int AS ads,
           (SELECT count(*) FROM ads_campaigns)::int AS campaigns,
           (SELECT count(*) FROM ga4_daily_metrics)::int AS ga4,
           (SELECT count(*) FROM ga4_landing_pages_daily)::int AS pages`);
  return rows[0];
}

beforeAll(async () => {
  await getDb().execute(sql`TRUNCATE ads_daily_metrics, ads_campaigns, ga4_daily_metrics, ga4_landing_pages_daily, sync_runs`);
});
afterAll(closeDb);

describe("sync jobs", () => {
  it("load 90 days of sample data", async () => {
    const results = await syncAll({ days: 90 });
    expect(results.map((r) => r.status)).toEqual(["ok", "ok"]);
    expect(await counts()).toEqual({ ads: 270, campaigns: 3, ga4: 90, pages: 720 });
  });

  it("are idempotent: running again does not duplicate rows or change totals", async () => {
    const totalCost = async () =>
      (await getDb().execute<{ c: string }>(sql`SELECT sum(cost)::text AS c FROM ads_daily_metrics`)).rows[0].c;
    const before = await totalCost();
    await syncAll({ days: 90 });
    await syncAll({ days: 30 });
    expect(await counts()).toEqual({ ads: 270, campaigns: 3, ga4: 90, pages: 720 });
    expect(await totalCost()).toBe(before);
  });

  it("record every run in sync_runs", async () => {
    const { rows } = await getDb().execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM sync_runs WHERE status = 'ok'`);
    expect(rows[0].n).toBe(6);
  });
});
