-- Plain-language descriptions. The MCP describe_schema tool returns these to Claude.
COMMENT ON TABLE "ads_campaigns" IS 'Google Ads campaigns. One row per campaign.';--> statement-breakpoint
COMMENT ON COLUMN "ads_campaigns"."channel_type" IS 'SEARCH or PERFORMANCE_MAX';--> statement-breakpoint
COMMENT ON TABLE "ads_daily_metrics" IS 'Google Ads results per campaign per day. cost is in the account currency.';--> statement-breakpoint
COMMENT ON COLUMN "ads_daily_metrics"."conversions" IS 'Conversions as reported by Google Ads (can be fractional).';--> statement-breakpoint
COMMENT ON TABLE "ga4_daily_metrics" IS 'Google Analytics 4 site totals per day.';--> statement-breakpoint
COMMENT ON TABLE "ga4_landing_pages_daily" IS 'Google Analytics 4 results per landing page per day.';--> statement-breakpoint
COMMENT ON TABLE "sync_runs" IS 'History of the daily sync jobs.';
