// How much of a run's sugar the runaway wrapper pays, measured by the autopilot.
//   node tools/wrap-curve.mjs [runs=30] [diff=normal] [limit=180]
//     runs   free-play runs, each on a fresh page (a returning player: no first-run snack)
//     limit  game seconds per run; a run ends at the player's first death or at the limit
// Prints { runs, wrappers, caught, catchRate, wrapSugar, runSugar, share, shareAt60 }:
//   wrappers  how many wrappers popped out (a streak of x5+ lapsed in a clean run)
//   caught    how many of them the autopilot caught (the reveal paid out)
//   wrapSugar the sugar those reveals paid, seen as the payout step in run.sugar
//   runSugar  the sum of run.got over the runs: the sugar the game itself paid at the end of each run (wrapper sugar included)
//   share     wrapSugar / runSugar;  shareAt60 = share * 0.6 / catchRate, the share if 60% were caught
// A run ends through the game's own path: the first death calls finishRun, a run still alive at the limit goes through toMenu(),
// which calls finishRun for a living player. run.got is read after that.
//   OUT=file.json saves every run and the summary. PAR=4 runs that many pages at once.
// Time moves by hand in 1/60 s steps with the game paused, so a busy machine changes only how long it takes.
// Needs a fresh `npm run build`. Uses the installed Chrome (CHROME=/path overrides it).
import { chromium } from 'playwright-core';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = pathToFileURL(process.env.HTML || join(root, 'index.html')).href; // HTML=file measures another build
const [nArg, diffArg, limArg] = process.argv.slice(2);
const N = +nArg || 30,
  DIFF = diffArg || 'normal',
  LIMIT = +limArg || 180,
  PAR = +process.env.PAR || 4;

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
    ({ LIMIT, SET }) => {
      const k = window.__kus,
        dt = 1 / 60;
      Object.assign(k.WRAP, SET); // SET='{"v0":1.1}' tries other WRAP values without a build
      k.pause(true);
      for (let i = 0; i < 300; i++) k.update(dt);
      k.startGame();
      const P = k.player;
      P.ai = k.newAI();
      const r = { t: LIMIT, died: false, wrappers: 0, caught: 0, wrapSugar: 0, got: 0, tiers: [0, 0, 0] };
      let lastWrap = null,
        lastReveal = null,
        cur = null;
      r.log = [];
      const endCur = (why) => {
        if (cur) {
          cur.end = why;
          r.log.push(cur);
          cur = null;
        }
      };
      for (let f = 1; f <= LIMIT * 60; f++) {
        k.update(dt);
        if (k.wrap && k.wrap !== lastWrap) {
          r.wrappers++;
          endCur('replaced');
          cur = {
            d0: Math.round(Math.hypot(k.wrap.x - P.x, k.wrap.y - P.y)),
            min: 1e9,
            lat: null,
            wrapFrames: 0,
            frames: 0,
            other: {},
            sp: 0,
            stage: k.stages.stg && k.stages.stg.cur ? k.stages.stg.cur.kind || 'stage' : '',
          };
        }
        if (cur && k.wrap && k.wrap === lastWrap && k.wrap.state === 'run') {
          cur.frames++;
          const d = Math.hypot(k.wrap.x - P.x, k.wrap.y - P.y);
          cur.min = Math.min(cur.min, Math.round(d));
          if (P.ai.mode === 'wrap') {
            cur.wrapFrames++;
            if (cur.lat === null) cur.lat = cur.frames;
          } else cur.other[P.ai.mode] = (cur.other[P.ai.mode] || 0) + 1;
          cur.sp += Math.hypot(P.vx, P.vy) / P.maxSpeed();
        }
        if (cur && !k.wrap && lastWrap) endCur(k.reveal && k.reveal !== lastReveal ? 'caught' : !P.alive ? 'died' : 'escaped');
        lastWrap = k.wrap;
        const R = k.reveal;
        if (R && R.paid && R !== lastReveal) {
          lastReveal = R;
          r.caught++;
          r.wrapSugar += k.WRAP.amt[R.final];
          r.tiers[R.final]++;
        }
        if (!P.alive || k.state !== 'play') {
          r.died = !P.alive;
          r.t = +(f / 60).toFixed(1);
          break;
        }
      }
      endCur('run ended');
      if (k.state === 'play' && P.alive) k.toMenu(); // the limit: the game's own end of run pays run.got
      r.got = k.run.got;
      r.sugar = Math.floor(k.run.sugar);
      return r;
    },
    { LIMIT, SET: JSON.parse(process.env.SET || '{}') },
  );
  if (errors.length) r.errors = errors;
  await ctx.close();
  return r;
}

const rows = [];
const t0 = Date.now();
let next = 0;
await Promise.all(
  Array.from({ length: PAR }, async () => {
    while (next < N) {
      next++;
      const r = await oneRun();
      rows.push(r);
      process.stderr.write(
        `${rows.length}/${N} ${DIFF}: t=${r.t} got=${r.got} wrappers=${r.wrappers} caught=${r.caught} wrap=${r.wrapSugar} (${Math.round((Date.now() - t0) / 1000)} s)\n`,
      );
    }
  }),
);
await browser.close();

const log = rows.flatMap((r) => r.log || []);
const ends = {};
for (const l of log) ends[l.end] = (ends[l.end] || 0) + 1;
const avg = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : 0);
const diag = {
  ends,
  startDist: avg(log.map((l) => l.d0)),
  closestMedian: log.map((l) => l.min).sort((a, b) => a - b)[log.length >> 1],
  playerSpeedVsMax: avg(log.filter((l) => l.frames).map((l) => l.sp / l.frames)),
  latencyFrames: avg(log.filter((l) => l.lat !== null).map((l) => l.lat)),
  neverChased: log.filter((l) => l.lat === null).length,
  shareOfTimeChasing: avg(log.map((l) => (l.frames ? l.wrapFrames / l.frames : 0))),
  otherModes: log.reduce((o, l) => (Object.entries(l.other).forEach(([m, n]) => (o[m] = (o[m] || 0) + n)), o), {}),
};
const tot = (key) => rows.reduce((s, r) => s + r[key], 0);
const wrappers = tot('wrappers'),
  caught = tot('caught'),
  wrapSugar = tot('wrapSugar'),
  runSugar = tot('got');
const catchRate = wrappers ? +(caught / wrappers).toFixed(3) : 0;
const share = runSugar ? +(wrapSugar / runSugar).toFixed(3) : 0;
const sum = {
  runs: N,
  diff: DIFF,
  limit: LIMIT,
  wrappers,
  caught,
  catchRate,
  wrapSugar,
  runSugar,
  share,
  shareAt60: catchRate ? +((share * 0.6) / catchRate).toFixed(3) : 0,
  caughtByTier: [0, 1, 2].map((i) => rows.reduce((s, r) => s + r.tiers[i], 0)),
  diag,
  died: rows.filter((r) => r.died).length,
  errors: rows.filter((r) => r.errors).length,
  wallSeconds: Math.round((Date.now() - t0) / 1000),
};
console.log(JSON.stringify(sum, null, 1));
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ sum, rows }, null, 1));
