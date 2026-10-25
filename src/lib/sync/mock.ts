// Mock adapters: believable, deterministic sample data. Never real client data.
// The same date always produces the same numbers, so syncing twice changes nothing.
import { eachDay } from "@/lib/dates";
import type { AdsAdapter, AdsCampaign, AdsDailyRow, Ga4Adapter, Ga4DailyRow, Ga4LandingRow } from "./types";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic number in [0, 1) for a key. */
function rand(key: string): number {
  let t = hash(key) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Multiplier around 1 with +/- spread. */
function jitter(key: string, spread: number): number {
  return 1 + (rand(key) * 2 - 1) * spread;
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

interface CampaignProfile extends AdsCampaign {
  dailyCost: number;
  cpc: number;
  ctr: number;
  conversionRate: number;
  weekendFactor: number;
}

export const MOCK_CAMPAIGNS: CampaignProfile[] = [
  // Cheap, high intent: the best cost per conversion.
  { id: "1001", name: "Search Brand", channelType: "SEARCH", status: "ENABLED", dailyCost: 55, cpc: 0.85, ctr: 0.18, conversionRate: 0.11, weekendFactor: 0.8 },
  // Bigger spend, decent results.
  { id: "1002", name: "Search Generic", channelType: "SEARCH", status: "ENABLED", dailyCost: 170, cpc: 2.6, ctr: 0.045, conversionRate: 0.045, weekendFactor: 0.7 },
  // The clearly underperforming one: lots of spend, very few conversions.
  { id: "1003", name: "Performance Max", channelType: "PERFORMANCE_MAX", status: "ENABLED", dailyCost: 210, cpc: 0.95, ctr: 0.012, conversionRate: 0.006, weekendFactor: 1.0 },
];

export const MOCK_LANDING_PAGES: { path: string; share: number; conversionRate: number }[] = [
  { path: "/", share: 0.3, conversionRate: 0.015 },
  { path: "/pricing", share: 0.14, conversionRate: 0.045 },
  { path: "/features", share: 0.12, conversionRate: 0.02 },
  { path: "/blog/how-to-track-ad-spend", share: 0.13, conversionRate: 0.008 },
  { path: "/integrations", share: 0.1, conversionRate: 0.012 },
  { path: "/about", share: 0.08, conversionRate: 0.005 },
  { path: "/demo", share: 0.07, conversionRate: 0.09 },
  { path: "/signup", share: 0.06, conversionRate: 0.22 },
];

export function mockAdsDay(date: string): AdsDailyRow[] {
  return MOCK_CAMPAIGNS.map((c) => {
    const weekend = isWeekend(date) ? c.weekendFactor : 1;
    const cost = round2(c.dailyCost * weekend * jitter(`cost|${c.id}|${date}`, 0.15));
    const clicks = Math.max(1, Math.round((cost / c.cpc) * jitter(`cpc|${c.id}|${date}`, 0.1)));
    const impressions = Math.round((clicks / c.ctr) * jitter(`ctr|${c.id}|${date}`, 0.12));
    const conversions = round2(clicks * c.conversionRate * jitter(`cr|${c.id}|${date}`, 0.35));
    return { campaignId: c.id, date, cost, impressions, clicks, conversions };
  });
}

export function mockGa4Day(date: string): { daily: Ga4DailyRow; pages: Ga4LandingRow[] } {
  const total = (isWeekend(date) ? 950 : 1400) * jitter(`sessions|${date}`, 0.12);
  const pages = MOCK_LANDING_PAGES.map((p) => {
    const sessions = Math.round(total * p.share * jitter(`page|${p.path}|${date}`, 0.15));
    const users = Math.round(sessions * 0.78 * jitter(`users|${p.path}|${date}`, 0.05));
    const conversions = Math.round(sessions * p.conversionRate * jitter(`pconv|${p.path}|${date}`, 0.3));
    return { date, landingPage: p.path, sessions, users, conversions };
  });
  const daily = pages.reduce(
    (acc, p) => ({
      date,
      sessions: acc.sessions + p.sessions,
      users: acc.users + p.users,
      conversions: acc.conversions + p.conversions,
    }),
    { date, sessions: 0, users: 0, conversions: 0 },
  );
  return { daily, pages };
}

export const mockAdsAdapter: AdsAdapter = {
  kind: "mock",
  async fetch(start, end) {
    const campaigns = MOCK_CAMPAIGNS.map(({ id, name, channelType, status }) => ({ id, name, channelType, status }));
    return { campaigns, daily: eachDay(start, end).flatMap(mockAdsDay) };
  },
};

export const mockGa4Adapter: Ga4Adapter = {
  kind: "mock",
  async fetch(start, end) {
    const days = eachDay(start, end).map(mockGa4Day);
    return { daily: days.map((d) => d.daily), landingPages: days.flatMap((d) => d.pages) };
  },
};
