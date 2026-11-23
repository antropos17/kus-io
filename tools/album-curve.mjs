// How fast the album of eaten bots fills, measured by the autopilot.
//   node tools/album-curve.mjs [runs=30] [diff=normal] [limit=300] [weak|weaker]
//     runs   free-play runs, each on a fresh page (a returning player: no first-run snack)
//     limit  game seconds per run; a run ends at the player's first death or at the limit
//     weak   the autopilot made worse, the same knobs as tools/mass-curve.mjs
//   OUT=file.json saves every run and the summary. PAR=4 runs that many pages at once.
// Each run records the names of the ordinary bots the player swallowed whole. The album over 1, 3, 5, 10, 30 and 60 runs in a row
// is then built from random sequences of the measured runs (drawn with replacement), so 30 runs measured give a 60-run curve;
// a sticker counts once its name has been swallowed NEED times over the sequence (see 10-album).
// Time moves by hand in 1/60 s steps with the game paused, so a busy machine changes only how long it takes.
// Needs a fresh `npm run build`. Uses the installed Chrome (CHROME=/path overrides it).
import { chromium } from 'playwright-core';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = pathToFileURL(process.env.HTML || join(root, 'index.html')).href; // HTML=file measures another build
const [nArg, diffArg, limArg, weakArg] = process.argv.slice(2);
const N = +nArg || 30,
  DIFF = diffArg || 'normal',
  LIMIT = +limArg || 300,
  WEAK = weakArg === 'weak' || weakArg === 'weaker',
  PAR = +process.env.PAR || 4;
const WEAK_MUL = weakArg === 'weaker' ? { react: 4, fear: 0.35, aggro: 0.5 } : { react: 2.5, fear: 0.55, aggro: 0.7 };

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
    ({ LIMIT, WEAK, WEAK_MUL }) => {
      const k = window.__kus,
        dt = 1 / 60;
      k.pause(true);
      for (let i = 0; i < 300; i++) k.update(dt);
      k.startGame();
      const P = k.player;
      P.ai = k.newAI();
      if (WEAK) for (const key in WEAK_MUL) P.ai[key] *= WEAK_MUL[key];
      const r = { t: LIMIT, died: false, kills: 0, names: [], specials: 0, spawned: {}, twins: 0 };
      let twinN = 0;
      const seen = new Set();
      let lastKills = 0;
      for (let f = 1; f <= LIMIT * 60; f++) {
        const alive = [];
        for (const b of k.blobs) if (b.alive && b !== P) alive.push(b);
        k.update(dt);
        for (const b of k.blobs)
          if (b !== P && !b.kind && b.ai && !seen.has(b.id)) {
            seen.add(b.id);
            r.spawned[b.name] = (r.spawned[b.name] || 0) + 1;
          }
        if (f % 60 === 0) {
          // how many bots on the field share their name with another one
          const names = k.blobs.filter((b) => b.alive && b !== P && !b.kind).map((b) => b.name);
          r.twins += names.length - new Set(names).size;
          twinN++;
        }
        if (P.stats.kills > lastKills) {
          // the victim: a candy that died this step, nearest to the mouth
          const mx = P.x + Math.cos(P.face) * P.Rs,
            my = P.y + Math.sin(P.face) * P.Rs;
          for (let n = P.stats.kills - lastKills; n > 0; n--) {
            let v = null,
              d = 1e9;
            for (const b of alive)
              if (!b.alive && !b._counted) {
                const g = Math.hypot(b.x - mx, b.y - my);
                if (g < d) ((d = g), (v = b));
              }
            if (!v) break;
            v._counted = true;
            if (v.kind) r.specials++;
            else r.names.push(v.name);
          }
          lastKills = P.stats.kills;
        }
        if (!P.alive) {
          r.died = true;
          r.t = +(f / 60).toFixed(1);
          break;
        }
      }
      r.kills = P.stats.kills;
      r.twins = +(r.twins / Math.max(1, twinN)).toFixed(2);
      r.album = k.album ? k.albumCount() : null; // after the album exists: what the game itself counted
      // how many swallows each name needs before its sticker opens (NEED by tier); 1 for all on builds without it
      r.need = {};
      if (k.NEED) for (const s of k.STICKERS) r.need[s.name] = k.NEED[s.tier];
      return r;
    },
    { LIMIT, WEAK, WEAK_MUL },
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
        `${rows.length}/${N} ${DIFF}${WEAK ? ' ' + weakArg : ''}: t=${r.t} kills=${r.kills} names=${new Set(r.names).size} (${Math.round((Date.now() - t0) / 1000)} s)\n`,
      );
    }
  }),
);
await browser.close();

const q = (a, p) => {
  const s = [...a].sort((x, y) => x - y),
    i = (s.length - 1) * p,
    lo = Math.floor(i);
  return +(s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo)).toFixed(1);
};
const qs = (a) => ({ p25: q(a, 0.25), med: q(a, 0.5), p75: q(a, 0.75) });
const allNames = new Set(rows.flatMap((r) => Object.keys(r.spawned)));
const sum = { runs: N, diff: DIFF, weak: WEAK ? weakArg : false, limit: LIMIT, namesSeen: allNames.size };
sum.length = qs(rows.map((r) => r.t));
sum.killsPerRun = qs(rows.map((r) => r.kills));
sum.namedKillsPerRun = qs(rows.map((r) => r.names.length));
sum.distinctPerRun = qs(rows.map((r) => new Set(r.names).size));
sum.twinsOnField = qs(rows.map((r) => r.twins)); // bots sharing a name with another bot on the field, averaged over the run
sum.album = {};
const SEQ = 400;
const need = Object.assign({}, ...rows.map((r) => r.need || {}));
for (const n of [1, 3, 5, 10, 30, 60]) {
  const got = [];
  let full = 0;
  for (let s = 0; s < SEQ; s++) {
    const c = {};
    for (let i = 0; i < n; i++) for (const nm of rows[Math.floor(Math.random() * rows.length)].names) c[nm] = (c[nm] || 0) + 1;
    const have = Object.keys(c).filter((nm) => c[nm] >= (need[nm] || 1)).length; // a sticker opens on its NEED-th swallow
    got.push(have);
    if (have >= allNames.size) full++;
  }
  sum.album[n] = { ...qs(got), full: +(full / SEQ).toFixed(2) };
}
const eaten = {};
for (const r of rows) for (const nm of r.names) eaten[nm] = (eaten[nm] || 0) + 1;
sum.eatenByName = Object.fromEntries(Object.entries(eaten).sort((a, b) => b[1] - a[1]));
sum.errors = rows.filter((r) => r.errors).length;
sum.wallSeconds = Math.round((Date.now() - t0) / 1000);
console.log(JSON.stringify(sum, null, 1));
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ sum, rows }, null, 1));
