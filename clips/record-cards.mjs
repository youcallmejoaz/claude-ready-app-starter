// Records the explainer cards (K clips) and prompt replays (P clips) to MP4 plus a PNG still.
// Usage: node clips/record-cards.mjs [K01 P02 ...]
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { startRecording } from "./lib/recorder.mjs";

const ITEMS = [
  { id: "K01", file: "cards/K01_problem.html", out: "K01_problem", seconds: 6 },
  { id: "K02", file: "cards/K02_deploy_flow.html", out: "K02_deploy_flow", seconds: 8 },
  { id: "K03", file: "cards/K03_safeguards.html", out: "K03_safeguards", seconds: 7 },
  { id: "K04", file: "cards/K04_offer.html", out: "K04_offer", seconds: 7 },
  { id: "P01", file: "prompts/P01_plan.html", out: "P01_plan_prompt", seconds: 8 },
  { id: "P02", file: "prompts/P02_new_tool.html", out: "P02_new_tool_prompt", seconds: 8 },
];

const wanted = process.argv.slice(2);
const browser = await chromium.launch();
for (const item of ITEMS.filter((i) => !wanted.length || wanted.includes(i.id))) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  // Start the recording on a blank white page so the clip opens cleanly, then load the card.
  const rec = await startRecording(context, page, `clips/.work/${item.id}`);
  await page.goto(pathToFileURL(path.resolve("clips", item.file)).href);
  await page.evaluate(() => document.fonts.ready);
  rec.markStart();
  await page.waitForTimeout(item.seconds * 1000 - 300);
  if (item.id.startsWith("K")) await page.screenshot({ path: `clips/stills/${item.out}.png` });
  await rec.stop(`clips/${item.out}.mp4`, { tail: 0.3 });
  await context.close();
  console.log(`recorded clips/${item.out}.mp4`);
}
await browser.close();
