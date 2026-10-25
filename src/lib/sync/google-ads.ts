// Live Google Ads adapter (GOOGLE_ADS_ENABLED=1). Uses the REST searchStream endpoint.
// Needs an approved developer token for production accounts. See docs/GOOGLE_DATA.md.
import { getGoogleAccessToken } from "./google-oauth";
import type { AdsAdapter, AdsCampaign, AdsDailyRow } from "./types";

interface SearchStreamRow {
  campaign: { id: string; name: string; advertisingChannelType: string; status: string };
  segments: { date: string };
  metrics: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number };
}

export function mapAdsRows(batches: { results?: SearchStreamRow[] }[]) {
  const campaigns = new Map<string, AdsCampaign>();
  const daily: AdsDailyRow[] = [];
  for (const batch of batches) {
    for (const r of batch.results ?? []) {
      campaigns.set(r.campaign.id, {
        id: r.campaign.id,
        name: r.campaign.name,
        channelType: r.campaign.advertisingChannelType,
        status: r.campaign.status,
      });
      daily.push({
        campaignId: r.campaign.id,
        date: r.segments.date,
        cost: Math.round(Number(r.metrics.costMicros ?? 0) / 10_000) / 100,
        impressions: Number(r.metrics.impressions ?? 0),
        clicks: Number(r.metrics.clicks ?? 0),
        conversions: Math.round(Number(r.metrics.conversions ?? 0) * 100) / 100,
      });
    }
  }
  return { campaigns: [...campaigns.values()], daily };
}

export function createGoogleAdsAdapter(fetchImpl: typeof fetch = fetch): AdsAdapter {
  return {
    kind: "live",
    async fetch(start, end) {
      const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID ?? "").replace(/-/g, "");
      const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
      const version = process.env.GOOGLE_ADS_API_VERSION || "v22";
      if (!customerId || !developerToken) {
        throw new Error("GOOGLE_ADS_CUSTOMER_ID and GOOGLE_ADS_DEVELOPER_TOKEN must be set");
      }
      const headers: Record<string, string> = {
        authorization: `Bearer ${await getGoogleAccessToken(fetchImpl)}`,
        "developer-token": developerToken,
        "content-type": "application/json",
      };
      const loginCustomerId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "").replace(/-/g, "");
      if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;

      const query = `SELECT campaign.id, campaign.name, campaign.advertising_channel_type, campaign.status,
        segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
        FROM campaign WHERE segments.date BETWEEN '${start}' AND '${end}'`;
      const res = await fetchImpl(
        `https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:searchStream`,
        { method: "POST", headers, body: JSON.stringify({ query }) },
      );
      if (!res.ok) throw new Error(`Google Ads API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return mapAdsRows((await res.json()) as { results?: SearchStreamRow[] }[]);
    },
  };
}
