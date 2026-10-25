import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGoogleAdsAdapter, mapAdsRows } from "@/lib/sync/google-ads";
import { createGa4Adapter } from "@/lib/sync/ga4";
import { resetGoogleTokenCache } from "@/lib/sync/google-oauth";

const tokenResponse = () => new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }));

beforeEach(() => {
  resetGoogleTokenCache();
  Object.assign(process.env, {
    GOOGLE_OAUTH_CLIENT_ID: "client",
    GOOGLE_OAUTH_CLIENT_SECRET: "secret",
    GOOGLE_OAUTH_REFRESH_TOKEN: "refresh",
    GOOGLE_ADS_CUSTOMER_ID: "123-456-7890",
    GOOGLE_ADS_DEVELOPER_TOKEN: "dev-token",
    GA4_PROPERTY_ID: "987654",
  });
});

describe("Google Ads adapter", () => {
  it("maps searchStream rows (micros to currency)", () => {
    const out = mapAdsRows([
      {
        results: [
          {
            campaign: { id: "9", name: "Brand", advertisingChannelType: "SEARCH", status: "ENABLED" },
            segments: { date: "2026-10-01" },
            metrics: { costMicros: "12345678", impressions: "100", clicks: "10", conversions: 1.5 },
          },
        ],
      },
    ]);
    expect(out.campaigns).toEqual([{ id: "9", name: "Brand", channelType: "SEARCH", status: "ENABLED" }]);
    expect(out.daily[0]).toEqual({ campaignId: "9", date: "2026-10-01", cost: 12.35, impressions: 100, clicks: 10, conversions: 1.5 });
  });

  it("calls searchStream with the developer token and a GAQL date filter", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(new Response("[]"));
    await createGoogleAdsAdapter(fetchMock as unknown as typeof fetch).fetch("2026-10-01", "2026-10-07");
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toMatch(/customers\/1234567890\/googleAds:searchStream$/);
    expect(init.headers["developer-token"]).toBe("dev-token");
    expect(JSON.parse(init.body).query).toContain("BETWEEN '2026-10-01' AND '2026-10-07'");
  });
});

describe("GA4 adapter", () => {
  it("runs two reports and maps dates", async () => {
    const report = (dims: string[][]) =>
      new Response(JSON.stringify({ rows: dims.map((d) => ({ dimensionValues: d.map((value) => ({ value })), metricValues: [{ value: "10" }, { value: "8" }, { value: "2" }] })) }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockImplementation(async (_url: string, init: { body: string }) => {
        const dims = JSON.parse(init.body).dimensions.length;
        return dims === 1 ? report([["20261001"]]) : report([["20261001", "/pricing"]]);
      });
    const out = await createGa4Adapter(fetchMock as unknown as typeof fetch).fetch("2026-10-01", "2026-10-01");
    expect(out.daily).toEqual([{ date: "2026-10-01", sessions: 10, users: 8, conversions: 2 }]);
    expect(out.landingPages[0]).toMatchObject({ landingPage: "/pricing", sessions: 10 });
  });
});
