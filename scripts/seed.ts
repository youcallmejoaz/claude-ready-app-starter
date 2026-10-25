// Loads the sample data: 90 days of mock Google Ads and GA4 numbers, one demo user,
// and one demo MCP token (printed once, stored only as a hash).
// Usage: npm run seed            full sample data
//        npm run seed -- --empty  demo user and token only, no metrics (used to film the sync)
//        npm run seed -- --if-empty  do nothing if data is already there (used by docker compose)
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/lib/db/client";
import * as schema from "../src/lib/db/schema";
import { generateToken, hashToken } from "../src/lib/mcp-tokens";
import { syncAll } from "../src/lib/sync/run";
import { MOCK_CAMPAIGNS } from "../src/lib/sync/mock";
import { DEMO_USER } from "../src/lib/demo-user";

async function main() {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    throw new Error("Refusing to seed sample data with NODE_ENV=production (pass --force if you really mean it).");
  }
  const empty = process.argv.includes("--empty");
  const db = getDb();

  if (process.argv.includes("--if-empty")) {
    const { rows } = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM ads_campaigns`);
    if (rows[0].n > 0) {
      console.log("Sample data already loaded, skipping seed. Run `npm run seed` to reset it and get a new demo token.");
      return;
    }
  }

  // Sample data only: this also clears the connector audit log so the demo starts clean.
  await db.execute(sql`TRUNCATE ads_daily_metrics, ads_campaigns, ga4_daily_metrics, ga4_landing_pages_daily, sync_runs, mcp_audit`);
  await db.insert(schema.users).values(DEMO_USER).onConflictDoNothing();

  if (empty) {
    // Campaign names only, so the dashboard has labels before the first sync.
    const campaigns = MOCK_CAMPAIGNS.map(({ id, name, channelType, status }) => ({ id, name, channelType, status }));
    await db.insert(schema.adsCampaigns).values(campaigns).onConflictDoNothing();
  } else {
    const results = await syncAll({ days: 90, db, stepDelayMs: 0 });
    for (const r of results) console.log(`Synced ${r.source}: ${r.rowsUpserted} rows (${r.status})`);
  }

  // Replace the demo token on every seed so an old printed token stops working.
  await db.delete(schema.mcpTokens).where(sql`name = 'demo'`);
  const token = generateToken();
  await db.insert(schema.mcpTokens).values({ name: "demo", tokenHash: hashToken(token) });

  console.log("\nDemo user: Demo Founder (sign in with the demo button)");
  console.log("Demo MCP token (shown once, not stored anywhere in plain text):");
  console.log(`  ${token}\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
