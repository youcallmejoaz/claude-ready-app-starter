// Test database settings. Tests use <DATABASE_URL database>_test and never touch the dev data.
import pg from "pg";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file (for example in CI): defaults below apply.
}

function withDb(url: string, db: string, user?: string, password?: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  if (user) u.username = user;
  if (password) u.password = password;
  return u.toString();
}

// Remember the original DATABASE_URL: useTestEnv() overwrites it, and test workers inherit that.
const base = process.env.TEST_SOURCE_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgres://app_owner:app_owner@localhost:5432/app";
process.env.TEST_SOURCE_DATABASE_URL = base;
const baseName = new URL(base).pathname.slice(1) || "app";

export const TEST_DB = `${baseName}_test`;
export const ADMIN_URL = withDb(base, "postgres");
export const OWNER_URL = withDb(base, TEST_DB);
export const READONLY_PASSWORD = process.env.MCP_READONLY_PASSWORD ?? "test-readonly";
export const AUDIT_PASSWORD = process.env.MCP_AUDIT_PASSWORD ?? "test-audit";
export const READONLY_URL = withDb(base, TEST_DB, "mcp_readonly", READONLY_PASSWORD);
export const AUDIT_URL = withDb(base, TEST_DB, "mcp_auditor", AUDIT_PASSWORD);

/** Point the app code (src/lib/env.ts) at the test database. */
export function useTestEnv() {
  process.env.DATABASE_URL = OWNER_URL;
  process.env.MCP_READONLY_DATABASE_URL = READONLY_URL;
  process.env.MCP_AUDIT_DATABASE_URL = AUDIT_URL;
  process.env.MCP_READONLY_PASSWORD = READONLY_PASSWORD;
  process.env.MCP_AUDIT_PASSWORD = AUDIT_PASSWORD;
  process.env.DEMO_MODE = "1";
  process.env.SYNC_STEP_DELAY_MS = "0";
}

export function pool(url: string) {
  return new pg.Pool({ connectionString: url, max: 3 });
}
