import { getPool } from "@/lib/db/client";

export interface SourceStatus {
  rows: number;
  lastSyncedAt: string | null;
  running: boolean;
  lastError: string | null;
}

export interface SyncStatus {
  googleAds: SourceStatus;
  ga4: SourceStatus;
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const { rows } = await getPool().query<{
    ads_rows: number;
    ga4_rows: number;
    source: string | null;
    last_ok: Date | null;
    running: boolean | null;
    last_error: string | null;
  }>(`
    WITH counts AS (
      SELECT (SELECT count(*) FROM ads_daily_metrics)::int AS ads_rows,
             ((SELECT count(*) FROM ga4_daily_metrics) + (SELECT count(*) FROM ga4_landing_pages_daily))::int AS ga4_rows
    ), runs AS (
      SELECT s.source,
             (SELECT max(finished_at) FROM sync_runs r WHERE r.source = s.source AND r.status = 'ok') AS last_ok,
             EXISTS (SELECT 1 FROM sync_runs r WHERE r.source = s.source AND r.status = 'running' AND r.started_at > now() - interval '15 minutes') AS running,
             (SELECT r.error FROM sync_runs r WHERE r.source = s.source ORDER BY started_at DESC LIMIT 1) AS last_error
        FROM (VALUES ('google_ads'), ('ga4')) AS s(source)
    )
    SELECT counts.*, runs.* FROM counts CROSS JOIN runs`);
  const pick = (source: string, n: number): SourceStatus => {
    const r = rows.find((x) => x.source === source);
    return { rows: n, lastSyncedAt: r?.last_ok ? r.last_ok.toISOString() : null, running: Boolean(r?.running), lastError: r?.last_error ?? null };
  };
  return { googleAds: pick("google_ads", rows[0]?.ads_rows ?? 0), ga4: pick("ga4", rows[0]?.ga4_rows ?? 0) };
}
