// Runs the daily sync once. Schedule this every night (see docs/HOW_TO_DEPLOY.md).
// Usage: npm run sync              last SYNC_LOOKBACK_DAYS days (default 90)
//        npm run sync -- --days 3  just the last 3 days (enough for a nightly job)
import { closeDb } from "../src/lib/db/client";
import { syncAll } from "../src/lib/sync/run";

const i = process.argv.indexOf("--days");
const days = i > -1 ? Number(process.argv[i + 1]) : undefined;

syncAll({ days })
  .then((results) => {
    for (const r of results) console.log(`${r.source}: ${r.status}, ${r.rowsUpserted} rows${r.error ? ` (${r.error})` : ""}`);
    if (results.some((r) => r.status !== "ok")) process.exitCode = 1;
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
