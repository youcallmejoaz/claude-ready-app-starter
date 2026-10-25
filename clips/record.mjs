// Records the UI clips (C01 to C07) at 1920 x 1080 in demo mode.
//
// Needs, already running (see clips/README.md):
//   app      http://localhost:3000  (DEMO_MODE=1, SYNC_STEP_DELAY_MS=55)
//   MCP      http://localhost:3001
//   staging  http://localhost:3100  (STAGING_BASIC_AUTH=1, BASIC_AUTH_USER=team, BASIC_AUTH_PASSWORD from STAGING_DEMO_PASSWORD)
// and DATABASE_URL in the environment (the script reseeds the sample data).
//
// Usage: node clips/record.mjs [C01 C02 ...]
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { CURSOR_SCRIPT, SCALE, VIEWPORT, makeActions, startRecording } from "./lib/recorder.mjs";

const APP = "http://localhost:3000";
const STAGING = "http://localhost:3100";
const STAGING_PASSWORD = process.env.STAGING_DEMO_PASSWORD ?? "staging-demo-pass";
const OUT = "clips";
const WORK = "clips/.work";
mkdirSync(WORK, { recursive: true });

const seed = (args = "") => execSync(`npx tsx scripts/seed.ts ${args}`, { stdio: "ignore" }); // output holds a token: never print it

const browser = await chromium.launch();

async function scene(id, name, { signedIn = true } = {}, body) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    storageState: signedIn ? `${WORK}/auth.json` : undefined,
  });
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();
  const rec = await startRecording(context, page, `${WORK}/${id}`);
  const act = makeActions(page);
  const out = `${OUT}/${id}_${name}.mp4`;
  const extra = (await body(page, act, rec)) ?? {};
  await rec.stop(out, { tail: extra.tail ?? 0.6 });
  await context.close();
  console.log(`recorded ${out}`);
  return { page, extra, out };
}

async function saveAuth() {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  await page.goto(`${APP}/signin`);
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await page.waitForURL(`${APP}/`);
  await context.storageState({ path: `${WORK}/auth.json` });
  await context.close();
}

const scenes = {
  async C01() {
    await scene("C01", "signin_dashboard", { signedIn: false }, async (page, act, rec) => {
      await page.goto(`${APP}/signin`);
      await act.park(980, 640);
      rec.markStart();
      await act.pause(900);
      await act.click(page.getByRole("button", { name: "Sign in with Google" }), 300);
      await page.getByRole("heading", { name: "Marketing overview" }).waitFor();
      await act.pause(1300);
      const chart = page.getByRole("img", { name: "Daily sessions" });
      const box = await chart.boundingBox();
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5, { steps: 20 });
      await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5, { steps: 45 });
      await act.pause(700);
      await act.hover(page.locator(".bar-row").nth(2), 1600);
    });
  },

  async C02() {
    seed("--empty");
    await scene("C02", "sync_now", {}, async (page, act, rec) => {
      await page.goto(`${APP}/admin`);
      await act.park(900, 300);
      rec.markStart();
      await act.pause(1000);
      await act.click(page.getByTestId("sync-now"), 200);
      await page.getByTestId("sync-now").filter({ hasText: "Sync now" }).waitFor({ timeout: 60_000 });
      await act.pause(600);
      await act.hover(page.getByTestId("last-googleAds"), 1500);
    });
  },

  async C03() {
    await scene("C03", "staging_password", { signedIn: false }, async (page, act, rec) => {
      await page.goto(`${STAGING}/`);
      await act.park(760, 250);
      rec.markStart();
      await act.pause(1200);
      await act.type(page.getByLabel("Username"), "team", 300);
      await act.type(page.getByLabel("Password"), STAGING_PASSWORD, 400);
      await act.click(page.getByRole("button", { name: "Sign in to staging" }), 300);
      await page.getByRole("heading", { name: "Sign in to your dashboard" }).waitFor();
      await act.pause(900);
      await act.click(page.getByRole("button", { name: "Sign in with Google" }), 300);
      await page.getByRole("heading", { name: "Marketing overview" }).waitFor();
      await act.pause(1500);
    });
  },

  async C04() {
    await scene("C04", "console_best_cpa", {}, async (page, act, rec) => {
      await page.goto(`${APP}/console`);
      await page.getByTestId("tool-list").waitFor();
      await act.park(1000, 380);
      rec.markStart();
      await act.pause(700);
      await act.type(page.getByTestId("question"), "Which campaign had the best cost per conversion in the last 30 days?", 300);
      await act.click(page.getByTestId("ask"), 200);
      await page.getByTestId("answer").waitFor();
      await act.pause(600);
      await act.hover(page.getByTestId("step").locator("tbody tr").first(), 1200);
      await act.hover(page.getByTestId("answer"), 2600);
    });
  },

  async C05() {
    await scene("C05", "console_delete_blocked", {}, async (page, act, rec) => {
      await page.goto(`${APP}/console`);
      await page.getByTestId("tool-list").waitFor();
      await act.park(1000, 380);
      rec.markStart();
      await act.pause(700);
      await act.type(page.getByTestId("question"), "Delete all campaigns", 300);
      await act.click(page.getByTestId("ask"), 200);
      await page.getByTestId("answer").waitFor();
      await act.pause(700);
      await act.hover(page.getByTestId("step").locator(".chip-bad"), 1200);
      await act.hover(page.getByTestId("answer"), 2200);
    });
  },

  async C06() {
    let crop;
    const { out } = await scene("C06", "audit_row", {}, async (page, act, rec) => {
      await page.goto(`${APP}/admin#audit`);
      const row = page.locator('tr[data-status="blocked"][data-tool="run_select"]').first();
      await row.waitFor();
      await page.evaluate(() => document.getElementById("audit").scrollIntoView({ block: "start" }));
      await act.park(700, 700);
      rec.markStart();
      await act.pause(800);
      await act.hover(row.locator(".chip"), 2600);
      // Frame the request, result and reason cells of the blocked row.
      const first = await row.locator("td").nth(3).boundingBox();
      const last = await row.locator("td").nth(5).boundingBox();
      crop = { x: first.x, y: first.y, width: last.x + last.width - first.x, height: first.height };
      await act.pause(800);
    });
    // Close up: a 16:9 window around the blocked row, scaled back to 1920 x 1080.
    const cx = (crop.x + crop.width / 2) * SCALE;
    const cy = (crop.y + crop.height / 2) * SCALE;
    const w = Math.round(Math.min(1920, crop.width * SCALE + 60) / 2) * 2;
    const h = Math.round((w * 9) / 16 / 2) * 2;
    const x = Math.max(0, Math.min(1920 - w, Math.round(cx - w / 2)));
    const y = Math.max(0, Math.min(1080 - h, Math.round(cy - h / 2)));
    const close = `${OUT}/C06_audit_row_close.mp4`;
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", out, "-vf", `crop=${w}:${h}:${x}:${y},scale=1920:1080:flags=lanczos,format=yuv420p`, "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-movflags", "+faststart", "-an", close]);
    console.log(`recorded ${close}`);
  },

  async C07() {
    await scene("C07", "claude_md_docs", {}, async (page, act, rec) => {
      await page.goto(`${APP}/docs/claude-md`);
      await act.park(1300, 500);
      rec.markStart();
      await act.pause(900);
      await act.smoothScroll(1900, 2600);
      await act.pause(500);
      await act.click(page.getByRole("link", { name: "docs/HOW_TO_DEPLOY.md" }), 300);
      await page.getByRole("heading", { name: "How to deploy" }).waitFor();
      await act.park(1300, 500);
      await act.pause(700);
      await act.smoothScroll(1300, 2000);
      await act.pause(800);
    });
  },
};

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(scenes);
seed();
await saveAuth();
// C02 empties the data and refills it with a sync, so it runs last.
for (const id of wanted.filter((s) => s !== "C02").concat(wanted.includes("C02") ? ["C02"] : [])) await scenes[id]();
await browser.close();
