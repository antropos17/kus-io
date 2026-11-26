// How many hours of play the sugar wardrobe takes, measured by the autopilot.
//   node tools/sugar-curve.mjs [chains=8] [hours=35] [diff=normal] [weak]
//     chains  one chain = ONE profile in ONE tab playing runs back to back (missions pile up between runs, as for a real player)
//     hours   game hours each chain plays
//     weak    the autopilot made worse, the same knobs as tools/album-curve.mjs
//   OUT=file.json saves every run of every chain and the summary. HTML=file measures another build. PAR=n tabs at once (default: all chains).
//   MIS=300,200,150 mission payouts to try (default: the build's own MIS_SUGAR). X2=1 doubles every run's sugar (Steam's free x2, see docs/sugar.md).
// A chain plays runs in the order free, free, t3, free, daily (60/20/20), each on its own day for the candy of the day, the page is
// reloaded every 20 runs (saves stay). A free run goes until death or 900 s; after the boss win it goes on into the second shift.
// Per run it records { mode, min, banked, mis, chestEV }: game minutes, what the game put in the bank, the circles of the missions
// finished in it, and the chest's expected value (base * 8/3). Buying changes nothing in the game, so a chain buys nothing; the hours
// to the whole collection and to the first purchase are worked out AFTER the measurement, for any PRICE_K and mission payout:
//   income = banked - sum misReward(c at the build's MIS_SUGAR) + sum misReward(c at the tried MIS_SUGAR) + chestEV
// (x2 doubles the first part, the chest stays). Time is linear inside a run. If a chain ends before it has earned the whole collection,
// the rest is extrapolated at the pace of its last half and the number is marked with a star (play longer to avoid it).
// Time moves by hand in 1/60 s steps with the game paused, so a busy machine changes only how long it takes.
// Needs a fresh `npm run build`. Uses the installed Chrome (CHROME=/path overrides it).
import { chromium } from 'playwright-core';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = pathToFileURL(process.env.HTML || join(root, 'index.html')).href;
const [nArg, hArg, diffArg, weakArg] = process.argv.slice(2);
const CHAINS = +nArg || 8,
  HOURS = +hArg || 35,
  DIFF = diffArg || 'normal',
  WEAK = weakArg === 'weak',
  PAR = +process.env.PAR || CHAINS,
  X2 = process.env.X2 === '1',
  LIMIT = 900,
  PAGE_RUNS = 20;
const WEAK_MUL = { react: 2.5, fear: 0.55, aggro: 0.7 };
const ORDER = ['free', 'free', 't3', 'free', 'daily'];

const launch = {};
if (process.env.CHROME) launch.executablePath = process.env.CHROME;
else launch.channel = 'chrome';
const browser = await chromium.launch(launch);

// one run on the page: returns { mode, min, banked, mis, chestEV }
const playRun = ({ MODE, LIMIT, WEAK, WEAK_MUL, shift }) => {
  const k = window.__kus,
    dt = 1 / 60;
  window.__shift = shift;
  k.pause(true);
  if (k.state !== 'menu') k.toMenu();
  k.setMode(MODE);
  k.startGame();
  const arm = (P) => {
    P.ai = k.newAI();
    if (WEAK) for (const key in WEAK_MUL) P.ai[key] *= WEAK_MUL[key];
    return P;
  };
  let P = arm(k.player);
  const r = { mode: MODE, min: 0, banked: 0, mis: [], chestEV: 0 };
  let bank = k.sugar,
    frames = 0;
  const close = () => {
    const got = k.run.got || 0;
    r.banked += k.sugar - bank;
    r.chestEV += got > 0 ? (Math.min(40, Math.max(3, Math.round(got * 0.3))) * 8) / 3 : 0;
    r.mis.push(...k.run.mis);
    bank = k.sugar;
  };
  for (let f = 0; f < LIMIT * 60; f++) {
    k.update(dt);
    frames++;
    if (k.player && k.player !== P) P = arm(k.player); // timed modes respawn a new player
    const st = k.state;
    if (st === 'won') {
      close();
      if (MODE !== 'free') break;
      k.startGame(); // «Вторая смена»
      P = arm(k.player);
      continue;
    }
    if (st === 'dead' && (MODE === 'free' || k.timeLeft <= 0) && k.run.got !== undefined && (MODE !== 'free' || !P.alive)) {
      close();
      r.done = true;
      break;
    }
  }
  if (!r.done && k.state === 'play') {
    k.toMenu(); // the limit: the game's own end pays run.got
    close();
  }
  r.min = +(frames / 3600).toFixed(3);
  r.banked = Math.round(r.banked);
  r.chestEV = +r.chestEV.toFixed(1);
  delete r.done;
  return r;
};

async function chain(ci) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 720 }, locale: 'ru-RU' });
  await ctx.addInitScript(
    ({ d }) => {
      if (localStorage.getItem('kus.chain') === null) {
        // a fresh profile of a returning player: no first-run snack; later page loads keep the saves
        localStorage.setItem('kus.chain', '1');
        localStorage.setItem('kus.best', '1');
        localStorage.setItem('kus.diff', d);
        localStorage.setItem('kus.cheat', '{}');
        localStorage.setItem('kus.sugar', '0');
      }
      // the candy of the day: each run is moved to its own day through window.__shift (ms)
      const D = Date;
      class FD extends D {
        constructor(...a) {
          if (a.length) super(...a);
          else super(D.now() + (window.__shift || 0));
        }
        static now() {
          return D.now() + (window.__shift || 0);
        }
      }
      window.Date = FD;
    },
    { d: DIFF },
  );
  const p = await ctx.newPage();
  p.setDefaultTimeout(0);
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  const load = async (first) => {
    first ? await p.goto(URL) : await p.reload();
    await p.waitForTimeout(400);
    await p.evaluate(() => {
      const k = window.__kus;
      k.pause(true);
      for (let i = 0; i < 300; i++) k.update(1 / 60);
    });
  };
  await load(true);
  const rows = [];
  let min = 0;
  for (let i = 0; min < HOURS * 60; i++) {
    if (i && i % PAGE_RUNS === 0) await load(false);
    const MODE = ORDER[i % ORDER.length];
    const r = await p.evaluate(playRun, { MODE, LIMIT, WEAK, WEAK_MUL, shift: i * 864e5 });
    rows.push(r);
    min += r.min;
    process.stderr.write(
      `chain ${ci}: ${(min / 60).toFixed(1)}/${HOURS} h, run ${rows.length} ${MODE} ${r.min.toFixed(1)} min banked ${r.banked} mis ${r.mis.length} (${Math.round((Date.now() - t0) / 1000)} s)\n`,
    );
  }
  const info = await p.evaluate(() => {
    const k = window.__kus;
    return { build: k.misReward({ c: 0 }), wardrobe: k.WARDROBE };
  });
  await ctx.close();
  return { rows, errors: errors.slice(0, 3), info };
}

const t0 = Date.now();
const chains = [];
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(PAR, CHAINS) }, async () => {
    while (next < CHAINS) {
      const ci = next++;
      chains[ci] = await chain(ci);
    }
  }),
);
await browser.close();

// ---- after the measurement: prices, income, hours ----
const MIS_BUILD = chains[0].info.build;
const WARDROBE = chains[0].info.wardrobe;
const MIS_LIST = (process.env.MIS || String(MIS_BUILD)).split(',').map(Number);
const price = (base, K) => Math.max(500, Math.round((base * K) / 500) * 500);
const paid = [];
for (const slot in WARDROBE) for (const [, base] of WARDROBE[slot]) if (base) paid.push(base);
const total = (K) => paid.reduce((s, b) => s + price(b, K), 0);
const cheapest = (K) => price(Math.min(...paid), K);
const rew = (M, c) => Math.round(M * (1 + 0.6 * c));

// hours until a chain has earned `target`; star = extrapolated past the end
function hoursTo(rows, M, target, x2) {
  let acc = 0,
    t = 0;
  const pts = [];
  for (const r of rows) {
    const inc = (r.banked - r.mis.reduce((s, c) => s + rew(MIS_BUILD, c), 0) + r.mis.reduce((s, c) => s + rew(M, c), 0)) * (x2 ? 2 : 1) + r.chestEV;
    if (acc + inc >= target) return { h: (t + (r.min * (target - acc)) / inc) / 60, ext: false };
    acc += inc;
    t += r.min;
    pts.push([t, acc]);
  }
  const mid = pts[pts.length >> 1] || [0, 0],
    end = pts[pts.length - 1];
  const rate = (end[1] - mid[1]) / (end[0] - mid[0]); // sugar per minute over the last half
  return { h: (t + (target - acc) / rate) / 60, ext: true };
}
const q = (a, p) => {
  const s = [...a].sort((x, y) => x - y),
    i = (s.length - 1) * p,
    lo = Math.floor(i);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo);
};
const stat = (M, K, x2, what) => {
  const hs = chains.map((c) => hoursTo(c.rows, M, what === 'full' ? total(K) : cheapest(K), x2));
  const v = hs.map((x) => x.h);
  return { p25: q(v, 0.25), med: q(v, 0.5), p75: q(v, 0.75), ext: hs.filter((x) => x.ext).length };
};
const f1 = (x) => x.toFixed(1);
// the K whose median full-collection time is closest to 30 hours, and the K range that gives 27-33 (0.01 steps)
const kFor = (M, x2) => {
  let best = null,
    lo = null,
    hi = null;
  for (let K = 0.3; K <= 4; K = +(K + 0.01).toFixed(2)) {
    const m = stat(M, K, x2, 'full').med;
    if (!best || Math.abs(m - 30) < Math.abs(best.m - 30)) best = { K, m };
    if (m >= 27 && m <= 33) {
      if (lo === null) lo = K;
      hi = K;
    }
  }
  return { K: best.K, med: +best.m.toFixed(1), range27to33: lo === null ? null : [lo, hi] };
};

const allRows = chains.flatMap((c) => c.rows);
const minutes = allRows.reduce((s, r) => s + r.min, 0);
const perMode = {};
for (const m of ['free', 't3', 'daily']) {
  const rs = allRows.filter((r) => r.mode === m),
    mm = rs.reduce((s, r) => s + r.min, 0);
  perMode[m] = {
    runs: rs.length,
    minutes: +mm.toFixed(0),
    sharePct: +((100 * mm) / minutes).toFixed(0),
    sugarPerMin: +(rs.reduce((s, r) => s + r.banked, 0) / mm).toFixed(0),
  };
}
const out = {
  chains: CHAINS,
  hours: HOURS,
  diff: DIFF,
  weak: WEAK,
  x2: X2,
  misBuild: MIS_BUILD,
  runs: allRows.length,
  minutes: +minutes.toFixed(0),
  perMode,
  missionsPerHour: +((allRows.reduce((s, r) => s + r.mis.length, 0) / minutes) * 60).toFixed(2),
  errors: chains.reduce((s, c) => s + c.errors.length, 0),
  wallSeconds: Math.round((Date.now() - t0) / 1000),
  byMis: {},
};
for (const M of MIS_LIST) {
  const tab = [];
  for (let K = 0.5; K <= 2.0001; K = +(K + 0.1).toFixed(1)) {
    const full = stat(M, K, X2, 'full'),
      first = stat(M, K, X2, 'first');
    tab.push({
      K,
      total: total(K),
      fullH: `${f1(full.med)} (${f1(full.p25)}-${f1(full.p75)})${full.ext ? '*' : ''}`,
      firstMin: `${f1(first.med * 60)} (${f1(first.p25 * 60)}-${f1(first.p75 * 60)})`,
    });
  }
  out.byMis[M] = { table: tab, kFor30: kFor(M, X2), steamKFor30: kFor(M, true) };
}
console.log(JSON.stringify(out, null, 1));
for (const M of MIS_LIST) {
  console.log(`\nMIS_SUGAR ${M}${X2 ? ' (x2)' : ''}: median (p25-p75) over ${CHAINS} chains; * = extrapolated`);
  console.log('K     total     full collection, h     first purchase, min');
  for (const r of out.byMis[M].table) console.log(`${r.K.toFixed(1)}  ${String(r.total).padStart(8)}  ${r.fullH.padEnd(22)} ${r.firstMin}`);
  const o = out.byMis[M];
  console.log(
    `PRICE_K for ~30 h: ${o.kFor30.K} (median ${o.kFor30.med} h, 27-33 h at K ${o.kFor30.range27to33 ? o.kFor30.range27to33.join('..') : 'none'}); Steam (free x2): ${o.steamKFor30.K} (median ${o.steamKFor30.med} h, 27-33 h at K ${o.steamKFor30.range27to33 ? o.steamKFor30.range27to33.join('..') : 'none'})`,
  );
}
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ summary: out, chains }, null, 1));
