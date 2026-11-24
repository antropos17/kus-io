// The Big Cake fight in free play, measured by the autopilot: the share of fights won and how long they last.
//   node tools/boss-fight.mjs [fights=60] [diff=normal] [weak|weaker]
//     fights  natural free runs are played until this many of them have met the boss
//     diff    easy | normal | hard
//     weak    the autopilot made worse, the same knobs as tools/mass-curve.mjs
//   CONC=n runs n pages at once (default 6). OUT=file.json saves every fight and the summary. PAGE=file plays another build.
// Each run is an ordinary free run from the start (no mass is set by hand): up to 600 game seconds to reach the boss.
// The fight starts when the boss event begins (the cake is spawned) and ends at the win screen (state 'won'), at the
// player's death, or unfinished after 300 s. Win share = wins / fights met; an unfinished fight is not a win.
// Time moves by hand in 1/60 s steps with the game paused. Needs a fresh `npm run build`. Uses the installed Chrome.
import { chromium } from 'playwright-core';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = pathToFileURL(process.env.PAGE || join(root, 'index.html')).href;
const [nArg, diffArg, weakArg] = process.argv.slice(2);
const N = +nArg || 60,
  DIFF = diffArg || 'normal',
  WEAK = weakArg === 'weak' || weakArg === 'weaker',
  CONC = +process.env.CONC || 6;
const WEAK_MUL = weakArg === 'weaker' ? { react: 4, fear: 0.35, aggro: 0.5 } : { react: 2.5, fear: 0.55, aggro: 0.7 };
const REACH = 600,
  FIGHT = 300,
  MENU_WARMUP = 5;

const launch = {};
if (process.env.CHROME) launch.executablePath = process.env.CHROME;
else launch.channel = 'chrome';
const browser = await chromium.launch(launch);

async function oneRun() {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 720 } });
  await ctx.addInitScript((d) => {
    localStorage.setItem('kus.best', '1');
    localStorage.setItem('kus.mode', 'free');
    localStorage.setItem('kus.diff', d);
    localStorage.setItem('kus.cheat', '{}');
  }, DIFF);
  const p = await ctx.newPage();
  p.setDefaultTimeout(0);
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(URL);
  await p.waitForTimeout(400);
  const r = await p.evaluate(
    ({ REACH, FIGHT, WEAK, WEAK_MUL, MENU_WARMUP }) => {
      const k = window.__kus,
        dt = 1 / 60;
      k.pause(true);
      for (let i = 0; i < MENU_WARMUP * 60; i++) k.update(dt);
      k.startGame();
      const P = k.player;
      P.ai = k.newAI();
      if (WEAK) for (const key in WEAK_MUL) P.ai[key] *= WEAK_MUL[key];
      const r = { met: false, start: null, mass0: null, boss0: null, end: null, len: null, cause: null, minBoss: 1 };
      let b = null;
      for (let f = 1; ; f++) {
        k.update(dt);
        const t = f / 60,
          S = k.stages.stg;
        if (!r.met && S && S.cur && S.cur.k === 'boss') {
          r.met = true;
          r.start = +t.toFixed(1);
          r.mass0 = Math.round(P.mass);
          b = S.cur.b;
          r.boss0 = Math.round(b.mass);
        }
        if (b) r.minBoss = Math.min(r.minBoss, b.mass / r.boss0);
        if (k.state === 'won') r.end = 'won';
        else if (!P.alive) {
          r.end = 'died';
          let best = null,
            bd = 1e9;
          for (const o of k.blobs)
            if (o !== P && o.alive && o.gulpT > 0) {
              const d = Math.hypot(o.x - P.x, o.y - P.y);
              if (d < bd) ((bd = d), (best = o));
            }
          r.cause = best ? (best.boss ? 'boss' : best.kind || 'bot') : 'unknown';
        } else if (r.met ? t - r.start >= FIGHT : t >= REACH) r.end = r.met ? 'unfinished' : 'noboss';
        if (r.end) {
          if (r.met) r.len = +(t - r.start).toFixed(1);
          r.minBoss = +r.minBoss.toFixed(2);
          return r;
        }
      }
    },
    { REACH, FIGHT, WEAK, WEAK_MUL, MENU_WARMUP },
  );
  if (errors.length) r.errors = errors;
  await ctx.close();
  return r;
}

const runs = [];
let fights = 0,
  started = 0,
  lost = 0;
const t0 = Date.now();
async function worker() {
  while (fights + (started - runs.length) * 0.8 < N) {
    started++;
    let r;
    try {
      r = await oneRun();
    } catch (e) {
      // a page lost under load (closed target, crash): count it and play the run again
      lost++;
      started--;
      process.stderr.write(`lost page: ${String(e).split('\n')[0]}\n`);
      if (lost > 20) throw e;
      continue;
    }
    runs.push(r);
    if (r.met) fights++;
    process.stderr.write(
      `run ${runs.length}: ${r.met ? `fight ${fights} ${r.end} ${r.len}s${r.cause ? ' ' + r.cause : ''}` : r.end} (${Math.round((Date.now() - t0) / 1000)} s)\n`,
    );
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
await browser.close();

const q = (a, p) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y),
    i = (s.length - 1) * p,
    lo = Math.floor(i);
  return +(s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo)).toFixed(1);
};
const met = runs.filter((r) => r.met),
  won = met.filter((r) => r.end === 'won'),
  died = met.filter((r) => r.end === 'died');
const sum = {
  diff: DIFF,
  weak: WEAK ? WEAK_MUL : false,
  runs: runs.length,
  metShare: +(met.length / runs.length).toFixed(3),
  fights: met.length,
  won: won.length,
  wonShare: +(won.length / met.length).toFixed(3),
  died: died.length,
  diedBy: Object.fromEntries(['boss', 'piranha', 'bot', 'hedgehog', 'cake', 'unknown'].map((c) => [c, died.filter((r) => r.cause === c).length])),
  unfinished: met.filter((r) => r.end === 'unfinished').length,
  fightWon: {
    p10: q(
      won.map((r) => r.len),
      0.1,
    ),
    p25: q(
      won.map((r) => r.len),
      0.25,
    ),
    med: q(
      won.map((r) => r.len),
      0.5,
    ),
    p75: q(
      won.map((r) => r.len),
      0.75,
    ),
    p90: q(
      won.map((r) => r.len),
      0.9,
    ),
  },
  fightAllMed: q(
    met.map((r) => r.len),
    0.5,
  ),
  massAtStart: q(
    met.map((r) => r.mass0),
    0.5,
  ),
  bossLeftWhenLost: q(
    met.filter((r) => r.end !== 'won').map((r) => r.minBoss),
    0.5,
  ),
  errors: runs.filter((r) => r.errors).length,
  lostPages: lost,
  wallSeconds: Math.round((Date.now() - t0) / 1000),
};
console.log(JSON.stringify(sum, null, 1));
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ sum, runs }, null, 1));
