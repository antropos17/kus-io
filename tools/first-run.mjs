// The first half minute of a brand-new player, measured without a human.
//   node tools/first-run.mjs shots <dir>      menu screenshots of a first visit (and of a second one) + menu scroll sizes
//   node tools/first-run.mjs runs [n]         n first runs (default 30) on the normal difficulty, each from an empty localStorage,
//                                             played by the autopilot with hand-stepped 1/60 s frames
//   node tools/first-run.mjs straight [n]     the same, but the "player" only holds the joystick halfway, straight where the mouth
//                                             faced at the start: a rough stand-in for a beginner (touch mode; the autopilot is no beginner)
//   OUT=file.json saves every run as well as the summary
// Needs a fresh `npm run build`. Uses the installed Chrome (CHROME=/path overrides it).
import { chromium } from 'playwright-core';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = pathToFileURL(join(root, 'index.html')).href;
const [cmd = 'runs', arg] = process.argv.slice(2);
const launch = {};
if (process.env.CHROME) launch.executablePath = process.env.CHROME;
else launch.channel = 'chrome';
const browser = await chromium.launch(launch);

async function page(width, height, touch) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch });
  const p = await ctx.newPage();
  p.setDefaultTimeout(180000);
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(URL);
  await p.waitForTimeout(700);
  return { p, ctx, errors };
}
const menuSize = (p) =>
  p.evaluate(() => {
    const c = document.querySelector('#menu .card');
    return { scroll: c.scrollHeight, visible: c.clientHeight, play: Math.round(document.getElementById('play').getBoundingClientRect().bottom) };
  });

if (cmd === 'shots') {
  const dir = arg || 'shots';
  mkdirSync(dir, { recursive: true });
  const out = {};
  for (const [w, h, touch] of [
    [360, 640, true],
    [844, 390, true],
    [1280, 720, false],
  ]) {
    const g = await page(w, h, touch);
    out[`first-${w}x${h}`] = await menuSize(g.p);
    await g.p.screenshot({ path: join(dir, `menu-first-${w}x${h}.png`) });
    if (w === 360) {
      // a second visit: finish one run the quick way (a timed run whose clock is out), then back to the menu
      await g.p.evaluate(() => {
        const k = window.__kus;
        k.pause(true);
        k.setMode('t3');
        k.startGame();
        k.setTimeLeft(0.001);
        for (let i = 0; i < 90; i++) k.update(1 / 60);
        k.setMode('free');
        k.pause(false);
      });
      await g.p.tap('#toMenu');
      await g.p.waitForTimeout(500);
      out[`second-${w}x${h}`] = await menuSize(g.p);
      await g.p.screenshot({ path: join(dir, `menu-second-${w}x${h}.png`) });
    }
    if (g.errors.length) out[`errors-${w}x${h}`] = g.errors;
    await g.ctx.close();
  }
  console.log(JSON.stringify(out, null, 1));
} else {
  const n = +arg || 30,
    rows = [];
  for (let i = 0; i < n; i++) {
    const g = await page(360, 640, true);
    const r = await g.p.evaluate((straight) => {
      const k = window.__kus;
      k.pause(true);
      k.startGame(); // what the "Play" tap does
      const P = k.player,
        a0 = P.face;
      if (!straight) P.ai = k.newAI();
      const r = {
        diff: document.querySelector('#diffSeg [aria-pressed=true]')?.dataset.v,
        firstBite: null,
        alive30: false,
        alive60: false,
        mass60: 0,
      };
      for (let f = 1; f <= 3600; f++) {
        if (straight) ((k.stick.vx = Math.cos(a0)), (k.stick.vy = Math.sin(a0)), (k.stick.mag = 0.5)); // a beginner who just holds the thumb one way
        k.update(1 / 60);
        const t = f / 60;
        if (r.firstBite === null && P.stats.bites > 0) r.firstBite = +t.toFixed(2);
        if (f === 1800) r.alive30 = P.alive;
        if (!P.alive) break;
      }
      r.alive60 = P.alive;
      r.mass60 = P.alive ? Math.round(P.mass) : 0;
      return r;
    }, cmd === 'straight');
    if (g.errors.length) r.errors = g.errors;
    rows.push(r);
    process.stderr.write(`${i + 1}/${n} ${JSON.stringify(r)}\n`);
    await g.ctx.close();
  }
  const q = (a, p) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor(p * s.length))];
  };
  const bites = rows.map((r) => (r.firstBite === null ? 61 : r.firstBite)); // no bite in the minute counts as 61 s
  const alive = rows.filter((r) => r.alive60).map((r) => r.mass60);
  const sum = {
    runs: n,
    firstBiteMedian: q(bites, 0.5),
    firstBiteP90: q(bites, 0.9),
    noBiteIn60: rows.filter((r) => r.firstBite === null).length,
    alive30: +(rows.filter((r) => r.alive30).length / n).toFixed(2),
    alive60: +(rows.filter((r) => r.alive60).length / n).toFixed(2),
    mass60MedianAlive: q(alive, 0.5),
    mass60MeanAll: Math.round(rows.reduce((s, r) => s + r.mass60, 0) / n),
    errors: rows.filter((r) => r.errors).length,
  };
  console.log(JSON.stringify(sum, null, 1));
  if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ sum, rows }, null, 1));
}
await browser.close();
