import { desc, eq, ne, or } from "drizzle-orm";
import { TopBar } from "@/components/TopBar";
import { SyncPanel } from "@/components/SyncPanel";
import { CreateToken } from "@/components/CreateToken";
import { getDb } from "@/lib/db/client";
import { mcpAudit, mcpTokens } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { fmtDateTime } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { getSyncStatus } from "@/lib/sync/status";
import { revokeTokenAction } from "./actions";

export const dynamic = "force-dynamic";

function adapterLabel() {
  if (env.demoMode) return "sample data (mock adapter)";
  const ads = env.googleAdsEnabled ? "Google Ads API" : "Google Ads mock";
  const ga4 = env.ga4Enabled ? "GA4 Data API" : "GA4 mock";
  return `${ads}, ${ga4}`;
}

const STATUS_CHIP: Record<string, string> = {
  ok: "chip-good",
  blocked: "chip-bad",
  error: "chip-warn",
  unauthorized: "chip-bad",
};
const STATUS_LABEL: Record<string, string> = {
  ok: "✓ allowed",
  blocked: "✕ blocked",
  error: "▲ error",
  unauthorized: "✕ no token",
};

function summarize(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  if (typeof o.sql === "string") return o.sql;
  return Object.entries(o)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
}

export default async function AdminPage() {
  const user = await requireUser();
  const db = getDb();
  const [status, tokens, audit] = await Promise.all([
    getSyncStatus(),
    db.select().from(mcpTokens).orderBy(desc(mcpTokens.createdAt)).limit(20),
    // Protocol handshakes (initialize, tools/list) are logged too; the page shows tool calls and rejections.
    db
      .select()
      .from(mcpAudit)
      .where(or(eq(mcpAudit.method, "tools/call"), ne(mcpAudit.status, "ok")))
      .orderBy(desc(mcpAudit.createdAt))
      .limit(25),
  ]);

  return (
    <>
      <TopBar current="/admin" userName={user.name} />
      <main className="page">
        <div className="page-head">
          <div>
            <h1>Data and connector</h1>
            <p className="sub">Sync jobs, connector tokens and the audit log of everything Claude asked for.</p>
          </div>
        </div>

        <SyncPanel initial={status} adapterLabel={adapterLabel()} />

        <div className="spacer" />
        <section className="card" id="audit">
          <div className="card-head">
            <div>
              <h2>Connector audit log</h2>
              <p className="sub">Every tool call to the read-only connector, allowed or not, plus rejected requests.</p>
            </div>
            <span className="hint">latest 25</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Token</th>
                  <th>Tool</th>
                  <th>Request</th>
                  <th>Result</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} data-status={a.status} data-tool={a.tool ?? ""}>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(a.createdAt)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{a.tokenName ?? <span className="muted">none</span>}</td>
                    <td className="mono">{a.tool ?? a.method}</td>
                    <td className="mono" style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {summarize(a.input)}
                    </td>
                    <td>
                      <span className={`chip ${STATUS_CHIP[a.status] ?? "chip-neutral"}`}>{STATUS_LABEL[a.status] ?? a.status}</span>
                    </td>
                    <td className="muted" style={{ fontSize: 13 }}>
                      {a.reason ?? (a.rowCount != null ? `${a.rowCount} rows` : "")}
                    </td>
                  </tr>
                ))}
                {!audit.length && (
                  <tr>
                    <td colSpan={6} className="muted">
                      No connector calls yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="spacer" />
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Connector tokens</h2>
              <p className="sub">Claude needs one of these to read your data. Stored only as a hash. Revoke any token at any time.</p>
            </div>
          </div>
          <CreateToken />
          <div className="spacer" />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Created</th>
                  <th>Last used</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{fmtDateTime(t.createdAt)}</td>
                    <td>{fmtDateTime(t.lastUsedAt)}</td>
                    <td>{t.revokedAt ? <span className="chip chip-neutral">Revoked</span> : <span className="chip chip-good">Active</span>}</td>
                    <td className="num">
                      {!t.revokedAt && (
                        <form action={revokeTokenAction}>
                          <input type="hidden" name="id" value={t.id} />
                          <button className="btn btn-sm btn-danger" type="submit">
                            Revoke
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
