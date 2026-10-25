// Live GA4 adapter (GA4_ENABLED=1). Uses the Analytics Data API runReport endpoint.
import { getGoogleAccessToken } from "./google-oauth";
import type { Ga4Adapter, Ga4DailyRow, Ga4LandingRow } from "./types";

interface ReportResponse {
  rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[];
}

/** GA4 returns dates as YYYYMMDD. */
function gaDate(v: string): string {
  return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
}

export function mapGa4Daily(r: ReportResponse): Ga4DailyRow[] {
  return (r.rows ?? []).map((row) => ({
    date: gaDate(row.dimensionValues[0].value),
    sessions: Number(row.metricValues[0].value),
    users: Number(row.metricValues[1].value),
    conversions: Math.round(Number(row.metricValues[2].value)),
  }));
}

export function mapGa4LandingPages(r: ReportResponse): Ga4LandingRow[] {
  return (r.rows ?? []).map((row) => ({
    date: gaDate(row.dimensionValues[0].value),
    landingPage: row.dimensionValues[1].value || "(not set)",
    sessions: Number(row.metricValues[0].value),
    users: Number(row.metricValues[1].value),
    conversions: Math.round(Number(row.metricValues[2].value)),
  }));
}

export function createGa4Adapter(fetchImpl: typeof fetch = fetch): Ga4Adapter {
  return {
    kind: "live",
    async fetch(start, end) {
      const propertyId = process.env.GA4_PROPERTY_ID;
      if (!propertyId) throw new Error("GA4_PROPERTY_ID must be set");
      const token = await getGoogleAccessToken(fetchImpl);
      const run = async (dimensions: string[]): Promise<ReportResponse> => {
        const res = await fetchImpl(
          `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
          {
            method: "POST",
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify({
              dateRanges: [{ startDate: start, endDate: end }],
              dimensions: dimensions.map((name) => ({ name })),
              // GA4 calls conversions "key events".
              metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "keyEvents" }],
              limit: 100000,
            }),
          },
        );
        if (!res.ok) throw new Error(`GA4 Data API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
        return (await res.json()) as ReportResponse;
      };
      const [daily, pages] = await Promise.all([run(["date"]), run(["date", "landingPage"])]);
      return { daily: mapGa4Daily(daily), landingPages: mapGa4LandingPages(pages) };
    },
  };
}
