"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SyncStatus } from "@/lib/sync/status";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }) : "never";

export function SyncPanel({ initial, adapterLabel }: { initial: SyncStatus; adapterLabel: string }) {
  const [status, setStatus] = useState(initial);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const running = starting || status.googleAds.running || status.ga4.running;

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/status", { cache: "no-store" });
    if (res.ok) setStatus(await res.json());
  }, []);

  useEffect(() => {
    if (running && !timer.current) timer.current = setInterval(refresh, 300);
    if (!running && timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [running, refresh]);

  const syncNow = async () => {
    setStarting(true);
    setMessage(null);
    const res = await fetch("/api/admin/sync", { method: "POST" });
    if (res.status === 409) setMessage("A sync is already running.");
    await refresh();
    setStarting(false);
  };

  const sources = [
    { key: "googleAds" as const, title: "Google Ads", unit: "campaign-day rows" },
    { key: "ga4" as const, title: "Google Analytics 4", unit: "daily and landing page rows" },
  ];

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Data sync</h2>
          <p className="sub">Runs every night. Source: {adapterLabel}.</p>
        </div>
        <button className="btn btn-primary" onClick={syncNow} disabled={running} data-testid="sync-now">
          {running ? "Syncing…" : "Sync now"}
        </button>
      </div>
      <div className="grid grid-2">
        {sources.map((s) => {
          const st = status[s.key];
          return (
            <div key={s.key} className="card" style={{ boxShadow: "none", background: "var(--surface-2)" }} data-testid={`sync-${s.key}`}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="stat-label">{s.title}</span>
                {st.running ? (
                  <span className="chip chip-warn">● Syncing</span>
                ) : st.lastError ? (
                  <span className="chip chip-bad">▲ Last sync failed</span>
                ) : st.lastSyncedAt ? (
                  <span className="chip chip-good">✓ Up to date</span>
                ) : (
                  <span className="chip chip-neutral">Not synced yet</span>
                )}
              </div>
              <div className="stat-value" data-testid={`rows-${s.key}`}>
                {st.rows.toLocaleString("en-US")}
              </div>
              <div className="stat-note">{s.unit}</div>
              <div className="stat-note" data-testid={`last-${s.key}`}>
                Last synced: {when(st.lastSyncedAt)}
              </div>
              {st.lastError && !st.running && <div className="stat-note" style={{ color: "var(--bad)" }}>{st.lastError}</div>}
            </div>
          );
        })}
      </div>
      {message && <p className="muted">{message}</p>}
    </div>
  );
}
