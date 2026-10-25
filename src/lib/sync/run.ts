// Sync jobs: pull Google Ads and GA4 numbers into Postgres.
// Every write is an upsert keyed on (entity, date), so running a sync twice never duplicates rows.
import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { addDays, lastNDays } from "@/lib/dates";
import { env } from "@/lib/env";
import { mockAdsAdapter, mockGa4Adapter } from "./mock";
import { createGoogleAdsAdapter } from "./google-ads";
import { createGa4Adapter } from "./ga4";
import type { AdsAdapter, Ga4Adapter } from "./types";

type Db = NodePgDatabase<typeof schema>;

export function adsAdapter(): AdsAdapter {
  return env.googleAdsEnabled && !env.demoMode ? createGoogleAdsAdapter() : mockAdsAdapter;
}

export function ga4Adapter(): Ga4Adapter {
  return env.ga4Enabled && !env.demoMode ? createGa4Adapter() : mockGa4Adapter;
}

/** Mock data is synced one day at a time so progress is visible; live APIs in monthly chunks. */
function chunks(start: string, end: string, size: number): [string, string][] {
  const out: [string, string][] = [];
  for (let s = start; s <= end; s = addDays(s, size)) {
    const e = addDays(s, size - 1);
    out.push([s, e < end ? e : end]);
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function track(db: Db, source: schema.SyncSource, adapter: string, start: string, end: string, work: (add: (n: number) => Promise<void>) => Promise<void>) {
  const [run] = await db
    .insert(schema.syncRuns)
    .values({ source, adapter, status: "running", startDate: start, endDate: end })
    .returning({ id: schema.syncRuns.id });
  let total = 0;
  const add = async (n: number) => {
    total += n;
    await db.update(schema.syncRuns).set({ rowsUpserted: total }).where(eq(schema.syncRuns.id, run.id));
  };
  try {
    await work(add);
    await db
      .update(schema.syncRuns)
      .set({ status: "ok", finishedAt: new Date() })
      .where(eq(schema.syncRuns.id, run.id));
    return { id: run.id, source, status: "ok" as const, rowsUpserted: total };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.syncRuns)
      .set({ status: "error", error: message.slice(0, 1000), finishedAt: new Date() })
      .where(eq(schema.syncRuns.id, run.id));
    return { id: run.id, source, status: "error" as const, rowsUpserted: total, error: message };
  }
}

export async function syncGoogleAds(opts: { start: string; end: string; adapter?: AdsAdapter; db?: Db; stepDelayMs?: number }) {
  const db = opts.db ?? getDb();
  const adapter = opts.adapter ?? adsAdapter();
  const delay = opts.stepDelayMs ?? env.syncStepDelayMs;
  return track(db, "google_ads", adapter.kind, opts.start, opts.end, async (add) => {
    for (const [s, e] of chunks(opts.start, opts.end, adapter.kind === "mock" ? 1 : 31)) {
      const { campaigns, daily } = await adapter.fetch(s, e);
      if (campaigns.length) {
        await db
          .insert(schema.adsCampaigns)
          .values(campaigns)
          .onConflictDoUpdate({
            target: schema.adsCampaigns.id,
            set: {
              name: sql`excluded.name`,
              channelType: sql`excluded.channel_type`,
              status: sql`excluded.status`,
              updatedAt: sql`now()`,
            },
          });
      }
      if (daily.length) {
        await db
          .insert(schema.adsDailyMetrics)
          .values(daily.map((r) => ({ ...r, cost: r.cost.toFixed(2), conversions: r.conversions.toFixed(2) })))
          .onConflictDoUpdate({
            target: [schema.adsDailyMetrics.campaignId, schema.adsDailyMetrics.date],
            set: {
              cost: sql`excluded.cost`,
              impressions: sql`excluded.impressions`,
              clicks: sql`excluded.clicks`,
              conversions: sql`excluded.conversions`,
              updatedAt: sql`now()`,
            },
          });
      }
      await add(daily.length);
      if (delay) await sleep(delay);
    }
  });
}

export async function syncGa4(opts: { start: string; end: string; adapter?: Ga4Adapter; db?: Db; stepDelayMs?: number }) {
  const db = opts.db ?? getDb();
  const adapter = opts.adapter ?? ga4Adapter();
  const delay = opts.stepDelayMs ?? env.syncStepDelayMs;
  return track(db, "ga4", adapter.kind, opts.start, opts.end, async (add) => {
    for (const [s, e] of chunks(opts.start, opts.end, adapter.kind === "mock" ? 1 : 31)) {
      const { daily, landingPages } = await adapter.fetch(s, e);
      if (daily.length) {
        await db
          .insert(schema.ga4DailyMetrics)
          .values(daily)
          .onConflictDoUpdate({
            target: schema.ga4DailyMetrics.date,
            set: {
              sessions: sql`excluded.sessions`,
              users: sql`excluded.users`,
              conversions: sql`excluded.conversions`,
              updatedAt: sql`now()`,
            },
          });
      }
      if (landingPages.length) {
        await db
          .insert(schema.ga4LandingPagesDaily)
          .values(landingPages)
          .onConflictDoUpdate({
            target: [schema.ga4LandingPagesDaily.date, schema.ga4LandingPagesDaily.landingPage],
            set: {
              sessions: sql`excluded.sessions`,
              users: sql`excluded.users`,
              conversions: sql`excluded.conversions`,
              updatedAt: sql`now()`,
            },
          });
      }
      await add(daily.length + landingPages.length);
      if (delay) await sleep(delay);
    }
  });
}

/** Runs both syncs for the lookback window (default: last 90 full days). */
export async function syncAll(opts: { days?: number; db?: Db; stepDelayMs?: number } = {}) {
  const { start, end } = lastNDays(opts.days ?? env.syncLookbackDays);
  return Promise.all([
    syncGoogleAds({ start, end, db: opts.db, stepDelayMs: opts.stepDelayMs }),
    syncGa4({ start, end, db: opts.db, stepDelayMs: opts.stepDelayMs }),
  ]);
}

export async function isSyncRunning(db: Db = getDb()): Promise<boolean> {
  const { rows } = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM sync_runs WHERE status = 'running' AND started_at > now() - interval '15 minutes'`,
  );
  return rows[0].n > 0;
}
