import { defineConfig } from "@playwright/test";

// End to end tests run against a production build (npm run build first) and the database in
// DATABASE_URL, seeded with npm run seed. Two app servers start: a normal one and one with the
// staging password switched on.
const env = { ...process.env, DEMO_MODE: "1" } as Record<string, string>;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: [
    { command: "npm run mcp", url: "http://localhost:3001/healthz", reuseExistingServer: true, env },
    { command: "npx next start -p 3000", url: "http://localhost:3000/api/health", reuseExistingServer: true, env },
    {
      command: "npx next start -p 3100",
      url: "http://localhost:3100/api/health",
      reuseExistingServer: true,
      env: { ...env, STAGING_BASIC_AUTH: "1", BASIC_AUTH_USER: "team", BASIC_AUTH_PASSWORD: "e2e-staging-password" },
    },
  ],
});
