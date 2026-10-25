import { describe, expect, it } from "vitest";
import { mockAdsAdapter, mockGa4Adapter, MOCK_CAMPAIGNS, MOCK_LANDING_PAGES } from "@/lib/sync/mock";
import { lastNDays } from "@/lib/dates";

describe("mock adapters", () => {
  const { start, end } = lastNDays(90);

  it("produces 90 days for 3 campaigns and 8 landing pages", async () => {
    const ads = await mockAdsAdapter.fetch(start, end);
    expect(ads.campaigns.map((c) => c.name)).toEqual(["Search Brand", "Search Generic", "Performance Max"]);
    expect(ads.daily).toHaveLength(270);
    const ga = await mockGa4Adapter.fetch(start, end);
    expect(ga.daily).toHaveLength(90);
    expect(new Set(ga.landingPages.map((p) => p.landingPage)).size).toBe(8);
    expect(MOCK_LANDING_PAGES).toHaveLength(8);
  });

  it("is deterministic", async () => {
    expect(await mockAdsAdapter.fetch(start, end)).toEqual(await mockAdsAdapter.fetch(start, end));
  });

  it("GA4 daily totals equal the sum of the landing pages", async () => {
    const ga = await mockGa4Adapter.fetch(start, end);
    const day = ga.daily[10];
    const pages = ga.landingPages.filter((p) => p.date === day.date);
    expect(pages.reduce((a, p) => a + p.sessions, 0)).toBe(day.sessions);
  });

  it("has one clearly underperforming campaign", async () => {
    const ads = await mockAdsAdapter.fetch(start, end);
    const cpa = MOCK_CAMPAIGNS.map((c) => {
      const rows = ads.daily.filter((r) => r.campaignId === c.id);
      return rows.reduce((a, r) => a + r.cost, 0) / rows.reduce((a, r) => a + r.conversions, 0);
    });
    const [brand, generic, pmax] = cpa;
    expect(brand).toBeLessThan(generic);
    expect(pmax).toBeGreaterThan(generic * 2);
  });
});
