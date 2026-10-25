import { expect, test } from "@playwright/test";

const STAGING = "http://localhost:3100";

test("staging returns 401 without basic auth", async ({ request }) => {
  const res = await request.get(`${STAGING}/`, { maxRedirects: 0 });
  expect(res.status()).toBe(401);
  expect(res.headers()["www-authenticate"]).toContain("Basic");
});

test("staging returns 401 for API routes and pages with a wrong password", async ({ request }) => {
  const bad = { authorization: `Basic ${Buffer.from("team:wrong").toString("base64")}` };
  expect((await request.get(`${STAGING}/api/admin/status`, { headers: bad })).status()).toBe(401);
  expect((await request.get(`${STAGING}/signin`, { headers: bad })).status()).toBe(401);
});

test("the health check stays open on staging", async ({ request }) => {
  expect((await request.get(`${STAGING}/api/health`)).status()).toBe(200);
});

test("staging loads with the right credentials", async ({ browser }) => {
  const context = await browser.newContext({ httpCredentials: { username: "team", password: "e2e-staging-password" } });
  const page = await context.newPage();
  await page.goto(`${STAGING}/signin`);
  await expect(page.getByRole("heading", { name: "Sign in to your dashboard" })).toBeVisible();
  await context.close();
});

test("the password page signs in with basic auth when the browser prompt is cancelled", async ({ page }) => {
  await page.goto(`${STAGING}/signin`);
  await expect(page.getByRole("heading", { name: "This staging site is password protected" })).toBeVisible();
  await page.getByLabel("Username").fill("team");
  await page.getByLabel("Password").fill("e2e-staging-password");
  await page.getByRole("button", { name: "Sign in to staging" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to your dashboard" })).toBeVisible();
});
