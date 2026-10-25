// Central place for configuration. Values are read lazily so tests and scripts
// can set process.env before first use. Every variable is documented in .env.example.

function flag(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

function str(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function int(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && process.env[name] !== "" ? v : fallback;
}

export const env = {
  get demoMode() {
    return flag("DEMO_MODE", true);
  },
  get databaseUrl() {
    return str("DATABASE_URL", "postgres://app_owner:app_owner@localhost:5432/app");
  },
  get mcpReadonlyDatabaseUrl() {
    return str("MCP_READONLY_DATABASE_URL", "postgres://mcp_readonly:mcp_readonly@localhost:5432/app");
  },
  get mcpAuditDatabaseUrl() {
    return str("MCP_AUDIT_DATABASE_URL", "postgres://mcp_auditor:mcp_auditor@localhost:5432/app");
  },
  get stagingBasicAuth() {
    return flag("STAGING_BASIC_AUTH", false);
  },
  get basicAuthUser() {
    return str("BASIC_AUTH_USER");
  },
  get basicAuthPassword() {
    return str("BASIC_AUTH_PASSWORD");
  },
  get mcpUrl() {
    return str("MCP_URL", "http://localhost:3001/mcp");
  },
  get mcpPort() {
    return int("MCP_PORT", 3001);
  },
  get mcpConsoleToken() {
    return str("MCP_CONSOLE_TOKEN");
  },
  get anthropicApiKey() {
    return str("ANTHROPIC_API_KEY");
  },
  get anthropicModel() {
    return str("ANTHROPIC_MODEL", "claude-opus-5-5");
  },
  get googleAdsEnabled() {
    return flag("GOOGLE_ADS_ENABLED", false);
  },
  get ga4Enabled() {
    return flag("GA4_ENABLED", false);
  },
  get syncLookbackDays() {
    return int("SYNC_LOOKBACK_DAYS", 90);
  },
  get syncStepDelayMs() {
    return int("SYNC_STEP_DELAY_MS", 0);
  },
  get cronSecret() {
    return str("CRON_SECRET");
  },
  get allowedEmails(): string[] {
    return str("AUTH_ALLOWED_EMAILS")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  },
  get googleAuthConfigured() {
    return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  },
};
