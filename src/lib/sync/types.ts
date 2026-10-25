export interface AdsCampaign {
  id: string;
  name: string;
  channelType: string;
  status: string;
}

export interface AdsDailyRow {
  campaignId: string;
  date: string;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

export interface Ga4DailyRow {
  date: string;
  sessions: number;
  users: number;
  conversions: number;
}

export interface Ga4LandingRow {
  date: string;
  landingPage: string;
  sessions: number;
  users: number;
  conversions: number;
}

export interface AdsAdapter {
  kind: "mock" | "live";
  fetch(start: string, end: string): Promise<{ campaigns: AdsCampaign[]; daily: AdsDailyRow[] }>;
}

export interface Ga4Adapter {
  kind: "mock" | "live";
  fetch(start: string, end: string): Promise<{ daily: Ga4DailyRow[]; landingPages: Ga4LandingRow[] }>;
}
