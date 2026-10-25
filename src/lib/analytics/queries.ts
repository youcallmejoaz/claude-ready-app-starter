// SQL shared by the dashboard (app owner pool) and the MCP tools (read-only pool).
// Keep every query a plain SELECT so it works under the read-only role.

export interface Queryable {
  query<T = unknown>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

export const CAMPAIGN_SORTS = ["cost", "clicks", "conversions", "ctr", "cost_per_conversion"] as const;
export type CampaignSort = (typeof CAMPAIGN_SORTS)[number];

export interface TrafficDay {
  date: string;
  sessions: number;
  users: number;
  conversions: number;
}

export async function trafficSummary(db: Queryable, start: string, end: string) {
  const { rows: daily } = await db.query<TrafficDay>(
    `SELECT to_char(date, 'YYYY-MM-DD') AS date, sessions, users, conversions
       FROM ga4_daily_metrics WHERE date BETWEEN $1 AND $2 ORDER BY date`,
    [start, end],
  );
  const totals = daily.reduce(
    (a, d) => ({ sessions: a.sessions + d.sessions, users: a.users + d.users, conversions: a.conversions + d.conversions }),
    { sessions: 0, users: 0, conversions: 0 },
  );
  return {
    start,
    end,
    days: daily.length,
    totals: {
      ...totals,
      conversion_rate: totals.sessions ? Math.round((totals.conversions / totals.sessions) * 10000) / 100 : null,
    },
    daily,
  };
}

export interface CampaignRow {
  campaign_id: string;
  name: string;
  channel_type: string;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number | null;
  cpc: number | null;
  cost_per_conversion: number | null;
}

const ORDER: Record<CampaignSort, string> = {
  cost: "cost DESC",
  clicks: "clicks DESC",
  conversions: "conversions DESC",
  ctr: "ctr DESC NULLS LAST",
  cost_per_conversion: "cost_per_conversion ASC NULLS LAST",
};

export async function campaignPerformance(db: Queryable, start: string, end: string, sortBy: CampaignSort = "cost") {
  const { rows } = await db.query<CampaignRow>(
    `SELECT c.id AS campaign_id, c.name, c.channel_type,
            round(sum(m.cost), 2)::float8 AS cost,
            sum(m.impressions)::int AS impressions,
            sum(m.clicks)::int AS clicks,
            round(sum(m.conversions), 2)::float8 AS conversions,
            round(100.0 * sum(m.clicks) / nullif(sum(m.impressions), 0), 2)::float8 AS ctr,
            round(sum(m.cost) / nullif(sum(m.clicks), 0), 2)::float8 AS cpc,
            round(sum(m.cost) / nullif(sum(m.conversions), 0), 2)::float8 AS cost_per_conversion
       FROM ads_daily_metrics m JOIN ads_campaigns c ON c.id = m.campaign_id
      WHERE m.date BETWEEN $1 AND $2
      GROUP BY c.id, c.name, c.channel_type
      ORDER BY ${ORDER[sortBy]}, c.name`,
    [start, end],
  );
  return { start, end, sort_by: sortBy, rows };
}

export interface LandingPageRow {
  landing_page: string;
  sessions: number;
  users: number;
  conversions: number;
  conversion_rate: number | null;
}

export async function topLandingPages(db: Queryable, start: string, end: string, limit = 8) {
  const { rows } = await db.query<LandingPageRow>(
    `SELECT landing_page,
            sum(sessions)::int AS sessions,
            sum(users)::int AS users,
            sum(conversions)::int AS conversions,
            round(100.0 * sum(conversions) / nullif(sum(sessions), 0), 2)::float8 AS conversion_rate
       FROM ga4_landing_pages_daily
      WHERE date BETWEEN $1 AND $2
      GROUP BY landing_page
      ORDER BY sessions DESC, landing_page
      LIMIT $3`,
    [start, end, limit],
  );
  return { start, end, rows };
}
