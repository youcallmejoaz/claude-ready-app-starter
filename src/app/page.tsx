import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { SessionsChart } from "@/components/SessionsChart";
import { CampaignBars } from "@/components/CampaignBars";
import { getPool } from "@/lib/db/client";
import { campaignPerformance, topLandingPages, trafficSummary } from "@/lib/analytics/queries";
import { lastNDays } from "@/lib/dates";
import { fmtDate, fmtInt, fmtMoney, fmtPct } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90];

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await requireUser();
  const requested = Number((await searchParams).days);
  const days = RANGES.includes(requested) ? requested : 30;
  const { start, end } = lastNDays(days);
  const db = getPool();

  const [traffic, campaigns, pages] = await Promise.all([
    trafficSummary(db, start, end),
    campaignPerformance(db, start, end, "cost_per_conversion"),
    topLandingPages(db, start, end, 8),
  ]);

  const spend = campaigns.rows.reduce((a, r) => a + r.cost, 0);
  const adConversions = campaigns.rows.reduce((a, r) => a + r.conversions, 0);
  const cpas = campaigns.rows.map((r) => r.cost_per_conversion).filter((v): v is number => v != null).sort((a, b) => a - b);
  const median = cpas[Math.floor(cpas.length / 2)] ?? 0;

  return (
    <>
      <TopBar current="/" userName={user.name} />
      <main className="page">
        <div className="page-head">
          <div>
            <h1>Marketing overview</h1>
            <p className="sub">
              {fmtDate(start)} to {fmtDate(end)} · Google Ads and Google Analytics 4
            </p>
          </div>
          <div className="seg" role="group" aria-label="Date range">
            {RANGES.map((d) => (
              <Link key={d} href={`/?days=${d}`} aria-current={d === days ? "true" : undefined}>
                Last {d} days
              </Link>
            ))}
          </div>
        </div>

        <section className="grid grid-4">
          <div className="card">
            <div className="stat-label">Sessions</div>
            <div className="stat-value">{fmtInt(traffic.totals.sessions)}</div>
            <div className="stat-note">{fmtInt(traffic.totals.users)} users</div>
          </div>
          <div className="card">
            <div className="stat-label">Site conversions</div>
            <div className="stat-value">{fmtInt(traffic.totals.conversions)}</div>
            <div className="stat-note">{fmtPct(traffic.totals.conversion_rate)} of sessions</div>
          </div>
          <div className="card">
            <div className="stat-label">Ad spend</div>
            <div className="stat-value">{fmtMoney(spend)}</div>
            <div className="stat-note">{campaigns.rows.length} campaigns</div>
          </div>
          <div className="card">
            <div className="stat-label">Cost per ad conversion</div>
            <div className="stat-value">{fmtMoney(adConversions ? spend / adConversions : null, true)}</div>
            <div className="stat-note">{fmtInt(adConversions)} ad conversions</div>
          </div>
        </section>

        <div className="spacer" />
        <section className="grid grid-main">
          <div className="card">
            <div className="card-head">
              <h2>Daily sessions</h2>
              <span className="hint">GA4</span>
            </div>
            <SessionsChart days={traffic.daily.map((d) => ({ date: d.date, sessions: d.sessions }))} />
          </div>
          <div className="card">
            <div className="card-head">
              <h2>Cost per conversion by campaign</h2>
              <span className="hint">lower is better</span>
            </div>
            {campaigns.rows.length ? <CampaignBars rows={campaigns.rows} /> : <p className="muted">No Google Ads data yet.</p>}
          </div>
        </section>

        <div className="spacer" />
        <section className="grid grid-main">
          <div className="card">
            <div className="card-head">
              <h2>Campaigns</h2>
              <span className="hint">Google Ads</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th className="num">Spend</th>
                    <th className="num">Clicks</th>
                    <th className="num">Conversions</th>
                    <th className="num">Cost / conv.</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.rows.map((r) => {
                    const weak = r.cost_per_conversion != null && median > 0 && r.cost_per_conversion > median * 2;
                    const best = r.cost_per_conversion != null && r.cost_per_conversion === cpas[0];
                    return (
                      <tr key={r.campaign_id}>
                        <td>{r.name}</td>
                        <td className="num">{fmtMoney(r.cost)}</td>
                        <td className="num">{fmtInt(r.clicks)}</td>
                        <td className="num">{r.conversions.toFixed(0)}</td>
                        <td className="num">{fmtMoney(r.cost_per_conversion, true)}</td>
                        <td>
                          {weak ? (
                            <span className="chip chip-bad">▲ Costly</span>
                          ) : best ? (
                            <span className="chip chip-good">● Best</span>
                          ) : (
                            <span className="chip chip-neutral">OK</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <h2>Top landing pages</h2>
              <span className="hint">GA4</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Page</th>
                    <th className="num">Sessions</th>
                    <th className="num">Conv. rate</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.rows.map((p) => (
                    <tr key={p.landing_page}>
                      <td className="mono">{p.landing_page}</td>
                      <td className="num">{fmtInt(p.sessions)}</td>
                      <td className="num">{fmtPct(p.conversion_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
