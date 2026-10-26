// Renders the two Upwork covers at 1600 x 1200, plus 1000 x 750 copies and 400 x 300 previews.
// Usage: node docs/cover/render.mjs
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";

const browser = await chromium.launch();
for (const v of ["a", "b"]) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await page.goto(pathToFileURL(path.resolve(`docs/cover/cover-${v}.html`)).href, { waitUntil: "load", timeout: 15000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  const out = `docs/upwork-cover-${v}.png`;
  await page.screenshot({ path: out });
  for (const [w, h, suffix] of [[1000, 750, "1000x750"], [400, 300, "preview-400x300"]]) {
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", out, "-vf", `scale=${w}:${h}:flags=lanczos`, `docs/upwork-cover-${v}-${suffix}.png`]);
  }
  await page.close();
  console.log(`rendered ${out}`);
}
await browser.close();
