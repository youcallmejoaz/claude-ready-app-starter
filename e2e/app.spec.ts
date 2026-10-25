import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/signin");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(page.getByRole("heading", { name: "Marketing overview" })).toBeVisible();
}

test("demo sign-in lands on the dashboard with campaigns and traffic", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("cell", { name: "Performance Max" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Daily sessions" })).toBeVisible();
});

test("console answers the cost per conversion question through the connector", async ({ page }) => {
  await signIn(page);
  await page.goto("/console");
  await expect(page.getByTestId("tool-list")).toContainText("campaign_performance");
  await page.getByTestId("question").fill("Which campaign had the best cost per conversion in the last 30 days?");
  await page.getByTestId("ask").click();
  await expect(page.getByTestId("step")).toContainText("campaign_performance");
  await expect(page.getByTestId("answer")).toContainText("Search Brand had the best cost per conversion");
  await expect(page.getByText("Recorded answer (demo mode)")).toBeVisible();
});

test("a delete request is blocked and shows up in the audit log", async ({ page }) => {
  await signIn(page);
  await page.goto("/console");
  await page.getByTestId("question").fill("Delete all campaigns");
  await page.getByTestId("ask").click();
  await expect(page.getByTestId("step")).toContainText("Blocked");
  await expect(page.getByTestId("answer")).toContainText("read only");
  await page.goto("/admin");
  const row = page.locator('tr[data-status="blocked"]').first();
  await expect(row).toContainText("DELETE FROM ads_campaigns");
});

test("sync now refreshes the last synced time", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin");
  const before = await page.getByTestId("last-googleAds").textContent();
  await page.getByTestId("sync-now").click();
  await expect(page.getByTestId("sync-now")).toHaveText("Sync now", { timeout: 30_000 });
  await expect(page.getByTestId("last-googleAds")).not.toHaveText(before ?? "", { timeout: 30_000 });
  await expect(page.getByTestId("rows-googleAds")).toHaveText("270");
});

test("the project guide renders CLAUDE.md", async ({ page }) => {
  await signIn(page);
  await page.goto("/docs/claude-md");
  await expect(page.locator("article")).toContainText("Hard rules");
});
