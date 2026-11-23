// How a free-play run goes, measured by the autopilot: run length, mass over time, special enemies, causes of death.
//   node tools/mass-curve.mjs [runs=40] [diff=normal] [limit=600] [weak|weaker]
//     runs   number of runs, each on a fresh page (a returning player: kus.best is set, so no first-run snack)
//     diff   easy | normal | hard
//     limit  game seconds per run; a run ends at the player's first death or at the limit
//     weak   the same autopilot made clearly worse (slower reactions, less fear, less hunger), see WEAK_MUL below;
//            weaker is a second, harsher step of the same knobs
//   OUT=file.json saves every run and the summary. Progress goes to stderr, the summary to stdout.
// Stages (pages that have them): when each event began, whether the Big Cake was beaten, the fight and the clear time.
//   A run that beats the cake ends there, as the game ends it with the win screen.
// Time moves by hand in 1/60 s steps with the game paused, so a busy machine changes only how long it takes, not the result.
// Needs a fresh `npm run build`. Uses the installed Chrome (CHROME=/path overrides it).
import { chromium } from 'playwright-core';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = pathToFileURL(join(root, 'index.html')).href;
const [nArg, diffArg, limArg, weakArg] = process.argv.slice(2);
const N = +nArg || 40,
  DIFF = diffArg || 'normal',
  LIMIT = +limArg || 600,
  WEAK = weakArg === 'weak' || weakArg === 'weaker';
// the weak player: newAI() rolls react 0.2-0.38 s between decisions, fear 0.75-1.3, aggro 0.65-1.35
const WEAK_MUL = weakArg === 'weaker' ? { react: 4, fear: 0.35, aggro: 0.5 } : { react: 2.5, fear: 0.55, aggro: 0.7 };
const MENU_WARMUP = 5; // game seconds the world runs in the menu before "Play", as a player would look at the menu

const launch = {};
if (process.env.CHROME) launch.executablePath = process.env.CHROME;
else launch.channel = 'chrome';
const browser = await chromium.launch(launch);

async function oneRun() {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 720 } });
  await ctx.addInitScript((d) => {
    localStorage.setItem('kus.best', '1'); // a returning player: no first-run snack, full menu
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
    ({ LIMIT, WEAK, WEAK_MUL, MENU_WARMUP }) => {
      const k = window.__kus,
        dt = 1 / 60;
      k.pause(true);
      for (let i = 0; i < MENU_WARMUP * 60; i++) k.update(dt);
      const atStart = { hedgehog: 0, piranha: 0, cake: 0 },
        known = new Set();
      for (const b of k.blobs) {
        known.add(b.id);
        if (b.alive && b.kind) atStart[b.kind] += b.kind === 'piranha' ? (b.ai && !b.ai.lead ? 1 : 0) : 1;
      }
      k.startGame();
      const P = k.player;
      P.ai = k.newAI();
      if (WEAK) for (const key in WEAK_MUL) P.ai[key] *= WEAK_MUL[key];
      const r = {
        diff: document.querySelector('#diffSeg [aria-pressed=true]')?.dataset.v,
        mode: document.querySelector('#modeSeg [aria-pressed=true]')?.dataset.m,
        cheats: Object.entries(k.CHEAT)
          .filter(([, v]) => v === true || (typeof v === 'number' && v !== 1))
          .map(([n]) => n),
        atStart,
        t: LIMIT,
        died: false,
        cause: null,
        killerMass: null,
        massAtDeath: null,
        maxMass: P.mass,
        mass15: [Math.round(P.mass)], // mass at 0, 15, 30 ... s while alive
        reach: {}, // threshold -> first time (s)
        spawn: { hedgehog: [], piranha: [], cake: [] }, // [time, player mass] of each new spawn during the run
        meet: { hedgehog: null, piranha: null, cake: null }, // first time one comes within 600 px of the player's rim: [time, mass]
        cakeBites: 0,
        cherryBites: 0,
        cakeEaten: 0,
        ev: {}, // stage event -> first time it began (s)
        won: null, // run second the Big Cake fell
        fight: null, // seconds from the cake's arrival to the win
        bites: 0,
        kills: 0,
      };
      const TH = [60, 80, 100, 150, 200, 300, 400, 600, 800, 1200, 1600, 2500];
      let lastBites = 0,
        lastKills = 0;
      const steps = LIMIT * 60;
      for (let f = 1; f <= steps; f++) {
        const cakesBefore = [];
        for (const b of k.blobs) if (b.kind === 'cake' && b.alive) cakesBefore.push(b);
        k.update(dt);
        const t = f / 60;
        const S = k.stages && k.stages.stg;
        if (S && S.cur && r.ev[S.cur.k] === undefined) r.ev[S.cur.k] = +t.toFixed(1);
        if (k.state === 'won') {
          r.won = +t.toFixed(1);
          r.fight = +(t - r.ev.boss).toFixed(1);
          r.t = r.won;
          break;
        }
        for (const b of k.blobs) {
          if (!known.has(b.id)) {
            known.add(b.id);
            if (b.kind && (b.kind !== 'piranha' || (b.ai && !b.ai.lead))) r.spawn[b.kind].push([+t.toFixed(1), Math.round(P.mass)]);
          }
          if (b.kind && b.alive && !r.meet[b.kind] && P.alive && Math.hypot(b.x - P.x, b.y - P.y) - b.Rs - P.Rs < 600)
            r.meet[b.kind] = [+t.toFixed(1), Math.round(P.mass)];
        }
        if (P.stats.bites > lastBites) {
          // which blob did the mouth hit: the one with the smallest gap to the mouth, as biteScan picks it
          const mx = P.x + Math.cos(P.face) * P.Rs * 0.8,
            my = P.y + Math.sin(P.face) * P.Rs * 0.8;
          let tgt = null,
            gap = 1e9,
            ang = 0;
          for (const o of k.blobs) {
            if (o === P || (!o.alive && !cakesBefore.includes(o))) continue;
            const a = Math.atan2(my - o.y, mx - o.x),
              g = Math.hypot(mx - o.x, my - o.y) - o.radiusAt(a);
            if (g < gap) ((gap = g), (tgt = o), (ang = a));
          }
          if (tgt && tgt.kind === 'cake') {
            r.cakeBites += P.stats.bites - lastBites;
            let d = ang - (tgt.face + Math.PI);
            d = Math.atan2(Math.sin(d), Math.cos(d));
            if (Math.abs(d) < 0.55) r.cherryBites++;
          }
          lastBites = P.stats.bites;
        }
        if (P.stats.kills > lastKills) {
          for (const c of cakesBefore) if (!c.alive) r.cakeEaten++;
          lastKills = P.stats.kills;
        }
        if (P.alive && P.mass > r.maxMass) r.maxMass = P.mass;
        if (P.alive) for (const th of TH) if (r.reach[th] === undefined && P.mass >= th) r.reach[th] = +t.toFixed(1);
        if (f % 900 === 0 && P.alive) r.mass15.push(Math.round(P.mass));
        if (!P.alive) {
          r.died = true;
          r.t = +t.toFixed(2);
          r.massAtDeath = Math.round(P.mass);
          // the swallower has just started its gulp
          let best = null,
            bd = 1e9;
          for (const o of k.blobs)
            if (o !== P && o.alive && o.gulpT > 0) {
              const d = Math.hypot(o.x - P.x, o.y - P.y);
              if (d < bd) ((bd = d), (best = o));
            }
          r.cause = best ? (best.boss ? 'boss' : best.kind || 'bot') : 'unknown';
          if (r.ev.boss !== undefined) r.diedInFight = true;
          r.killerMass = best ? Math.round(best.mass) : null;
          break;
        }
      }
      r.maxMass = Math.round(r.maxMass);
      r.bites = P.stats.bites;
      r.kills = P.stats.kills;
      return r;
    },
    { LIMIT, WEAK, WEAK_MUL, MENU_WARMUP },
  );
  if (errors.length) r.errors = errors;
  await ctx.close();
  return r;
}

const rows = [];
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const r = await oneRun();
  rows.push(r);
  process.stderr.write(
    `${i + 1}/${N} ${DIFF}${WEAK ? ' weak' : ''}: t=${r.t} max=${r.maxMass} cause=${r.cause} (${Math.round((Date.now() - t0) / 1000)} s)\n`,
  );
}
await browser.close();

// ---- summary ----
const q = (a, p) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y),
    i = (s.length - 1) * p,
    lo = Math.floor(i);
  return +(s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo)).toFixed(1);
};
const qs = (a) => ({ n: a.length, p25: q(a, 0.25), med: q(a, 0.5), p75: q(a, 0.75), p90: q(a, 0.9) });
const share = (x) => +(x / N).toFixed(3);
const sum = { runs: N, diff: DIFF, weak: WEAK ? WEAK_MUL : false, limit: LIMIT, menuWarmup: MENU_WARMUP };
sum.check = {
  diff: [...new Set(rows.map((r) => r.diff))],
  mode: [...new Set(rows.map((r) => r.mode))],
  cheats: [...new Set(rows.flatMap((r) => r.cheats))],
  errors: rows.filter((r) => r.errors).length,
};
// run length: a run that hit the limit counts as LIMIT (it is censored, the percentile is then ">= LIMIT")
sum.length = qs(rows.map((r) => r.t));
sum.aliveAt = {};
for (const s of [30, 60, 120, 180, 300, 600]) if (s <= LIMIT) sum.aliveAt[s] = share(rows.filter((r) => !r.died || r.t > s).length);
sum.mass15 = [];
const maxI = Math.max(...rows.map((r) => r.mass15.length));
for (let i = 0; i < maxI; i++) {
  const a = rows.filter((r) => r.mass15.length > i).map((r) => r.mass15[i]);
  sum.mass15.push({ t: i * 15, alive: a.length, p25: q(a, 0.25), med: q(a, 0.5), p75: q(a, 0.75) });
}
sum.maxMass = qs(rows.map((r) => r.maxMass));
sum.reach = {};
for (const th of [60, 80, 100, 150, 200, 300, 400, 600, 800, 1200, 1600, 2500]) {
  const a = rows.filter((r) => r.reach[th] !== undefined).map((r) => r.reach[th]);
  sum.reach[th] = { share: share(a.length), medT: q(a, 0.5), p25T: q(a, 0.25), p75T: q(a, 0.75) };
}
sum.specials = {};
for (const kd of ['hedgehog', 'piranha', 'cake']) {
  const first = rows.filter((r) => r.spawn[kd].length).map((r) => r.spawn[kd][0]);
  const meet = rows.filter((r) => r.meet[kd]).map((r) => r.meet[kd]);
  sum.specials[kd] = {
    atStartShare: share(rows.filter((r) => r.atStart[kd] > 0).length),
    spawnedShare: share(first.length),
    firstSpawnT: q(
      first.map((x) => x[0]),
      0.5,
    ),
    firstSpawnMass: q(
      first.map((x) => x[1]),
      0.5,
    ),
    spawnsPerRun: q(
      rows.map((r) => r.spawn[kd].length),
      0.5,
    ),
    spawnsPerMinute: +(rows.reduce((s, r) => s + r.spawn[kd].length, 0) / (rows.reduce((s, r) => s + r.t, 0) / 60)).toFixed(2),
    metShare: share(meet.length),
    firstMeetT: q(
      meet.map((x) => x[0]),
      0.5,
    ),
    firstMeetMass: q(
      meet.map((x) => x[1]),
      0.5,
    ),
  };
}
sum.cake = {
  runsBitingCake: share(rows.filter((r) => r.cakeBites > 0).length),
  runsCherry: share(rows.filter((r) => r.cherryBites > 0).length),
  runsAteCake: share(rows.filter((r) => r.cakeEaten > 0).length),
  cakeBitesTotal: rows.reduce((s, r) => s + r.cakeBites, 0),
  cherryBitesTotal: rows.reduce((s, r) => s + r.cherryBites, 0),
  cakesEatenTotal: rows.reduce((s, r) => s + r.cakeEaten, 0),
};
const dead = rows.filter((r) => r.died);
sum.death = { died: share(dead.length) };
for (const c of ['bot', 'piranha', 'hedgehog', 'cake', 'boss', 'unknown'])
  sum.death[c] = dead.length ? +(dead.filter((r) => r.cause === c).length / dead.length).toFixed(3) : 0;
sum.death.massAtDeath = qs(dead.map((r) => r.massAtDeath));
sum.death.killerToPlayer = q(
  dead.filter((r) => r.killerMass).map((r) => r.killerMass / Math.max(1, r.massAtDeath)),
  0.5,
);
sum.actions = {
  bites: qs(rows.map((r) => r.bites)),
  kills: qs(rows.map((r) => r.kills)),
  bitesPerMin: q(
    rows.map((r) => r.bites / (r.t / 60)),
    0.5,
  ),
  killsPerMin: q(
    rows.map((r) => r.kills / (r.t / 60)),
    0.5,
  ),
};
// stages: the share of runs that saw each event and when; the fight against the Big Cake among the runs where it came
sum.stages = {};
for (const e of ['pir', 'rain', 'boss']) {
  const a = rows.filter((r) => r.ev && r.ev[e] !== undefined).map((r) => r.ev[e]);
  sum.stages[e] = { share: share(a.length), medT: q(a, 0.5), p25T: q(a, 0.25), p75T: q(a, 0.75) };
}
{
  const met = rows.filter((r) => r.ev && r.ev.boss !== undefined),
    won = met.filter((r) => r.won !== null);
  sum.stages.fight = {
    met: met.length,
    wonShareOfMet: met.length ? +(won.length / met.length).toFixed(3) : null,
    diedInFightShareOfMet: met.length ? +(met.filter((r) => r.diedInFight).length / met.length).toFixed(3) : null,
    unfinishedAtLimit: met.filter((r) => r.won === null && !r.died).length,
    fightT: qs(won.map((r) => r.fight)),
    clearT: qs(won.map((r) => r.won)),
  };
}
sum.wallSeconds = Math.round((Date.now() - t0) / 1000);
console.log(JSON.stringify(sum, null, 1));
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ sum, rows }, null, 1));
