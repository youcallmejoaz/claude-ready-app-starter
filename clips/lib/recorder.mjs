// Records a Playwright page as a sharp MP4: Chrome DevTools screencast frames (JPEG q92),
// then ffmpeg turns them into constant 30 fps H.264 (yuv420p). Used by clips/record.mjs and
// clips/record-cards.mjs.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

export const VIEWPORT = { width: 1536, height: 864 };
export const SCALE = 1.25; // 1536 x 864 CSS pixels rendered at 1920 x 1080

export async function startRecording(context, page, workDir) {
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
  const cdp = await context.newCDPSession(page);
  const frames = [];
  let marks = { start: null, end: null };
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    const file = path.resolve(workDir, `f${String(frames.length).padStart(6, "0")}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, t: metadata.timestamp });
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  return {
    /** Mark the moment the scene really starts (trims loading time before it). */
    markStart() {
      marks.start = Date.now() / 1000;
    },
    async stop(outFile, { tail = 0.6 } = {}) {
      marks.end = Date.now() / 1000;
      await cdp.send("Page.stopScreencast").catch(() => {});
      await new Promise((r) => setTimeout(r, 200));
      return encode(frames, outFile, workDir, { start: marks.start, end: marks.end, tail });
    },
  };
}

function encode(frames, outFile, workDir, { start, end, tail }) {
  if (!frames.length) throw new Error("No frames captured");
  // Keep the last frame before the start mark so the clip opens on a full picture.
  let first = 0;
  if (start) for (let i = 0; i < frames.length; i++) if (frames[i].t <= start) first = i;
  const used = frames.slice(first);
  const t0 = start ?? used[0].t;
  const lines = [];
  for (let i = 0; i < used.length; i++) {
    const from = Math.max(used[i].t, t0);
    const to = i + 1 < used.length ? used[i + 1].t : end + tail;
    const d = Math.max(0, to - from);
    if (d <= 0 && i + 1 < used.length) continue;
    lines.push(`file '${used[i].file}'`, `duration ${d.toFixed(4)}`);
  }
  lines.push(`file '${used[used.length - 1].file}'`); // concat demuxer needs the last file twice
  const list = path.join(workDir, "list.txt");
  writeFileSync(list, lines.join("\n"));
  execFileSync("ffmpeg", [
    "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list,
    "-vf", "scale=1920:1080:flags=lanczos,fps=30,format=yuv420p",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-movflags", "+faststart", "-an", outFile,
  ]);
  return outFile;
}

/** Visible cursor and a highlight ring on every click. Coordinates are CSS pixels. */
export const CURSOR_SCRIPT = `
(() => {
  if (window.__cursorInstalled) return; window.__cursorInstalled = true;
  const install = () => {
    const c = document.createElement('div');
    c.id = '__cursor';
    c.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28"><path d="M5 3 L5 22 L10 17 L13.5 25 L17 23.5 L13.5 15.8 L20.5 15.8 Z" fill="#111827" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', width: '28px', height: '28px', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-5px,-3px)', transition: 'none' });
    document.documentElement.appendChild(c);
    const pos = window.__cursorPos || { x: -100, y: -100 };
    c.style.left = pos.x + 'px'; c.style.top = pos.y + 'px';
    document.addEventListener('mousemove', (e) => { window.__cursorPos = { x: e.clientX, y: e.clientY }; c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    document.addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      Object.assign(r.style, { position: 'fixed', left: (e.clientX - 22) + 'px', top: (e.clientY - 22) + 'px', width: '44px', height: '44px', borderRadius: '50%', border: '3px solid #f59e0b', background: 'rgba(245,158,11,0.18)', zIndex: 2147483646, pointerEvents: 'none', transform: 'scale(0.4)', opacity: '1', transition: 'transform 450ms ease-out, opacity 650ms ease-out' });
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(1.35)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 800);
    }, true);
  };
  if (document.documentElement) install(); else document.addEventListener('DOMContentLoaded', install);
})();
`;

export function makeActions(page) {
  let pos = { x: 760, y: 430 };
  const pause = (ms) => page.waitForTimeout(ms);
  async function moveTo(locator) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const dist = Math.hypot(x - pos.x, y - pos.y);
    await page.mouse.move(x, y, { steps: Math.max(12, Math.round(dist / 18)) });
    pos = { x, y };
  }
  return {
    pause,
    async park(x, y) {
      await page.mouse.move(x, y);
      pos = { x, y };
    },
    async click(locator, after = 750) {
      await moveTo(locator);
      await pause(180);
      await page.mouse.down();
      await page.mouse.up();
      await pause(after);
    },
    /** Types at about 12 characters per second. */
    async type(locator, text, after = 700) {
      await moveTo(locator);
      await pause(150);
      await page.mouse.down();
      await page.mouse.up();
      await locator.fill("");
      await page.keyboard.type(text, { delay: 83 });
      await pause(after);
    },
    async hover(locator, after = 700) {
      await moveTo(locator);
      await pause(after);
    },
    async smoothScroll(px, durationMs) {
      const steps = Math.max(1, Math.round(durationMs / 33));
      for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, px / steps);
        await pause(33);
      }
    },
  };
}
