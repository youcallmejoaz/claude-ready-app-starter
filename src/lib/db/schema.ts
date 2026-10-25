import {
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Auth.js tables (Google sign-in). Shapes follow @auth/drizzle-adapter.
// The MCP roles are never granted access to these.
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ---------------------------------------------------------------------------
// Analytics tables. These are the only tables the read-only MCP role can see.
// ---------------------------------------------------------------------------

export const adsCampaigns = pgTable("ads_campaigns", {
  id: text("id").primaryKey(), // Google Ads campaign id
  name: text("name").notNull(),
  channelType: text("channel_type").notNull(), // SEARCH, PERFORMANCE_MAX, ...
  status: text("status").notNull(), // ENABLED, PAUSED, REMOVED
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adsDailyMetrics = pgTable(
  "ads_daily_metrics",
  {
    campaignId: text("campaign_id")
      .notNull()
      .references(() => adsCampaigns.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    cost: numeric("cost", { precision: 12, scale: 2 }).notNull(), // account currency
    impressions: integer("impressions").notNull(),
    clicks: integer("clicks").notNull(),
    conversions: numeric("conversions", { precision: 12, scale: 2 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.date] })],
);

export const ga4DailyMetrics = pgTable("ga4_daily_metrics", {
  date: date("date").primaryKey(),
  sessions: integer("sessions").notNull(),
  users: integer("users").notNull(),
  conversions: integer("conversions").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ga4LandingPagesDaily = pgTable(
  "ga4_landing_pages_daily",
  {
    date: date("date").notNull(),
    landingPage: text("landing_page").notNull(),
    sessions: integer("sessions").notNull(),
    users: integer("users").notNull(),
    conversions: integer("conversions").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.date, t.landingPage] })],
);

export const syncRuns = pgTable("sync_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull(), // google_ads | ga4
  adapter: text("adapter").notNull(), // mock | live
  status: text("status").notNull(), // running | ok | error
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  rowsUpserted: integer("rows_upserted").notNull().default(0),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// MCP connector tables. Only the mcp_auditor role touches these.
// ---------------------------------------------------------------------------

export const mcpTokens = pgTable("mcp_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(), // sha256 hex, the plain token is never stored
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const mcpAudit = pgTable(
  "mcp_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tokenId: uuid("token_id"),
    tokenName: text("token_name"),
    method: text("method").notNull(), // tools/call, tools/list, ...
    tool: text("tool"),
    input: jsonb("input"),
    status: text("status").notNull(), // ok | blocked | error | unauthorized
    reason: text("reason"),
    rowCount: integer("row_count"),
    durationMs: integer("duration_ms"),
    clientIp: text("client_ip"),
  },
  (t) => [index("mcp_audit_created_at_idx").on(t.createdAt)],
);

export type SyncSource = "google_ads" | "ga4";

// Re-exported for scripts that size tables.
export const ANALYTICS_TABLES = [
  "ads_campaigns",
  "ads_daily_metrics",
  "ga4_daily_metrics",
  "ga4_landing_pages_daily",
  "sync_runs",
] as const;
