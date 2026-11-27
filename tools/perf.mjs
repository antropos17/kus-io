// Frame cost on an emulated phone: how long until the first game frame, the real frame loop, and our own script per frame.
//   node tools/perf.mjs [cpu=6] [runs=3] [WxH=390x844] [dpr=3]
//     cpu    CPU slowdown through the DevTools protocol (1 = this machine as it is); it slows the main thread only
//     runs   fresh pages; every number printed is the median over them
//     WxH    viewport in CSS pixels; the page is a touch phone (isMobile, hasTouch), so the game takes its phone pixel budget
//   MASS=<n> sets the player's mass to n after the run starts and holds it there (the game's cap and melting would pull it down),
//     so the frame cost is measured at that mass. HTML=file measures another build than index.html (a frozen copy, say).
//   Per run: the first game frame after loading, then a free run on the autopilot (Math.random seeded, no deaths) with 10 s of
//   real frames (adapt free to step down), then 300 hand-stepped frames at lod 0 timing update() and render() apart.
//   render() time is recording the canvas commands only: drawing the pixels happens later on the GPU and is not in any number here.
// Prints one JSON line to stdout, progress to stderr. Needs a fresh `npm run build`. Uses the installed Chrome (CHROME=/path overrides it).
import { chromium } from 'playwright-core';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = pathToFileURL(process.env.HTML || join(root, 'index.html')).href;
const [cpuArg, runsArg, sizeArg, dprArg] = process.argv.slice(2);
const CPU = +cpuArg || 6,
  RUNS = +runsArg || 3,
  [VW, VH] = (sizeArg || '390x844').split('x').map(Number),
  DPR = +dprArg || 3;
const REAL_S = 10,
  STEPS = 300,
  MASS = +process.env.MASS || 0;

const launch = {};
if (process.env.CHROME) launch.executablePath = process.env.CHROME;
else launch.channel = 'chrome';
const browser = await chromium.launch(launch);

const median = (a) => {
  const s = [...a].sort((x, y) => x - y),
    m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const r1 = (v) => Math.round(v * 10) / 10;

async function oneRun() {
  const ctx = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: DPR,
    isMobile: true,
    hasTouch: true,
    locale: 'ru-RU',
  });
  await ctx.addInitScript(() => {
    localStorage.setItem('kus.best', '1'); // a returning player: the full menu, no first-run snack
    localStorage.setItem('kus.mode', 'free');
    localStorage.setItem('kus.diff', 'normal');
    localStorage.setItem('kus.cheat', '{}');
    let a = 1; // mulberry32: the same world every run
    Math.random = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const raf = window.requestAnimationFrame.bind(window);
    window.__ff = 0;
    window.requestAnimationFrame = (cb) =>
      raf((t) => {
        if (!window.__ff) window.__ff = performance.now();
        cb(t);
      });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(0);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await page.goto(URL);
  await page.waitForFunction(() => window.__ff > 0);
  const firstFrameMs = await page.evaluate(() => window.__ff);
  await page.evaluate((mass) => {
    const k = window.__kus;
    k.startGame();
    k.player.ai = k.newAI();
    k.CHEAT.god = true; // the run must not end; it changes no drawing cost
    if (mass) {
      k.player.mass = mass;
      window.__hold = setInterval(() => (k.player.mass = mass), 50); // the cap and melting pull it down between frames
    }
    window.__fr = [];
    let last = 0;
    const f = (t) => {
      if (last) window.__fr.push(t - last);
      last = t;
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }, MASS);
  await page.waitForTimeout(1000);
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const m0 = await metrics();
  await page.evaluate(() => (window.__fr.length = 0));
  await page.waitForTimeout(REAL_S * 1000);
  const m1 = await metrics();
  const fr = await page.evaluate(() => window.__fr.splice(0));
  const per = (k, ms) => ((m1[k] - m0[k]) * (ms ? 1000 : 1)) / REAL_S;
  const step = await page.evaluate(
    ({ n, mass }) => {
      const k = window.__kus,
        up = [],
        rd = [];
      k.pause(true);
      k.setLod(0);
      for (let i = 0; i < n; i++) {
        if (mass) k.player.mass = mass;
        const t0 = performance.now();
        k.update(1 / 60);
        const t1 = performance.now();
        k.render();
        up.push(t1 - t0);
        rd.push(performance.now() - t1);
      }
      return { up, rd };
    },
    { n: STEPS, mass: MASS },
  );
  await ctx.close();
  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
  const sorted = [...fr].sort((x, y) => x - y);
  return {
    firstFrameMs,
    fps: fr.length / REAL_S,
    p95Ms: sorted[Math.floor(sorted.length * 0.95)],
    worstMs: sorted[sorted.length - 1],
    over33: fr.filter((x) => x > 33.4).length,
    scriptMs: per('ScriptDuration', true),
    styleMs: per('RecalcStyleDuration', true),
    layoutMs: per('LayoutDuration', true),
    styles: per('RecalcStyleCount'),
    layouts: per('LayoutCount'),
    updateMs: avg(step.up),
    renderMs: avg(step.rd),
  };
}

const runs = [];
for (let i = 0; i < RUNS; i++) {
  runs.push(await oneRun());
  console.error(`run ${i + 1}/${RUNS} done`);
}
await browser.close();
const md = (k) => r1(median(runs.map((r) => r[k])));
console.log(
  JSON.stringify({
    cpu: CPU,
    size: `${VW}x${VH}`,
    dpr: DPR,
    runs: RUNS,
    firstFrameMs: md('firstFrameMs'),
    real: { fps: md('fps'), p95Ms: md('p95Ms'), worstMs: md('worstMs'), over33: md('over33') },
    perSec: { scriptMs: md('scriptMs'), styleMs: md('styleMs'), layoutMs: md('layoutMs'), styles: md('styles'), layouts: md('layouts') },
    step: { updateMs: md('updateMs'), renderMs: md('renderMs') },
  }),
);
