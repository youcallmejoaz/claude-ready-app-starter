import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { syncAll } from "@/lib/sync/run";
import { useTestEnv } from "./helpers";

useTestEnv();

/** Empties the data tables and loads the 90 day mock dataset. */
export async function loadSampleData() {
  const db = getDb();
  await db.execute(sql`TRUNCATE ads_daily_metrics, ads_campaigns, ga4_daily_metrics, ga4_landing_pages_daily, sync_runs, mcp_audit, mcp_tokens`);
  await syncAll({ days: 90, db, stepDelayMs: 0 });
}
