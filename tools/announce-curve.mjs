// How often the big word of swallows in a row comes, measured by the autopilot.
//   node tools/announce-curve.mjs [runs=20] [diff=normal] [limit=300] [weak|-] [daily=<twist id>]
//     runs   runs, each on a fresh page (a returning player: no first-run snack)
//     limit  game seconds per run; a run ends at the player's first death or at the limit
//     weak   the autopilot made worse, the same knobs as tools/mass-curve.mjs (- keeps it as it is)
//     daily  a candy-of-the-day run with that twist pinned (k.daily.force), else free play
//   WIN=5 overrides ANN.win (the seconds between swallows that keep a chain). PAR=4 runs that many pages at once.
// Counts, per run, the words each step would show (ann.n climbing past 2 while the run is on): ×2, ×3, ×4, ×5+.
// Time moves by hand in 1/60 s steps with the game paused, so a busy machine changes only how long it takes.
// Needs a fresh `npm run build`. Uses the installed Chrome (CHROME=/path overrides it).
import { chromium } from 'playwright-core';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = pathToFileURL(process.env.HTML || join(root, 'index.html')).href;
const args = process.argv.slice(2),
  dailyArg = args.find((a) => a.startsWith('daily=')),
  [nArg, diffArg, limArg, weakArg] = args.filter((a) => !a.startsWith('daily='));
const N = +nArg || 20,
  DIFF = diffArg || 'normal',
  LIMIT = +limArg || 300,
  WEAK = weakArg === 'weak',
  DAILY = dailyArg ? dailyArg.slice(6) : null,
  WIN = +process.env.WIN || 0,
  PAR = +process.env.PAR || 4;

const launch = {};
if (process.env.CHROME) launch.executablePath = process.env.CHROME;
else launch.channel = 'chrome';
const browser = await chromium.launch(launch);

async function oneRun() {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 720 }, locale: 'ru-RU' });
  await ctx.addInitScript(
    ([d, daily]) => {
      localStorage.setItem('kus.best', '1');
      localStorage.setItem('kus.mode', daily ? 'daily' : 'free');
      localStorage.setItem('kus.diff', d);
      localStorage.setItem('kus.cheat', '{}');
    },
    [DIFF, DAILY],
  );
  const p = await ctx.newPage();
  p.setDefaultTimeout(0);
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(URL);
  await p.waitForTimeout(400);
  const r = await p.evaluate(
    ({ LIMIT, WEAK, DAILY, WIN }) => {
      const k = window.__kus,
        dt = 1 / 60;
      k.pause(true);
      if (WIN) k.ANN.win = WIN;
      if (DAILY) k.daily.force(DAILY);
      for (let i = 0; i < 300; i++) k.update(dt);
      k.startGame();
      const P = k.player;
      P.ai = k.newAI();
      if (WEAK) Object.assign(P.ai, { react: P.ai.react * 2.5, fear: P.ai.fear * 0.55, aggro: P.ai.aggro * 0.7 });
      const r = { t: LIMIT, died: false, kills: 0, words: { 2: 0, 3: 0, 4: 0, 5: 0 }, day: DAILY ? k.daily.day : null };
      let lastN = 0;
      for (let f = 1; f <= LIMIT * 60; f++) {
        k.update(dt);
        const n = k.ann.n;
        if (n < lastN) lastN = 0; // a new chain
        if (k.state === 'play') for (let m = Math.max(lastN + 1, 2); m <= n; m++) r.words[Math.min(m, 5)]++;
        lastN = n;
        if (!P.alive || k.state !== 'play') {
          r.died = !P.alive;
          r.t = +(f / 60).toFixed(1);
          break;
        }
      }
      r.kills = P.stats.kills;
      return r;
    },
    { LIMIT, WEAK, DAILY, WIN },
  );
  if (errors.length) r.errors = errors;
  await ctx.close();
  return r;
}

const rows = [];
let next = 0;
await Promise.all(
  Array.from({ length: PAR }, async () => {
    while (next < N) {
      next++;
      rows.push(await oneRun());
    }
  }),
);
await browser.close();

const mean = (a) => +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(2),
  share = (a) => +(a.filter((x) => x > 0).length / a.length).toFixed(2);
const out = {
  runs: N,
  diff: DIFF,
  weak: WEAK,
  daily: DAILY,
  limit: LIMIT,
  win: WIN || 'ANN.win',
  died: rows.filter((r) => r.died).length,
  kills: mean(rows.map((r) => r.kills)),
  perRun: {},
  runsWithOne: {},
  errors: rows.flatMap((r) => r.errors || []).length,
};
for (const s of [2, 3, 4, 5]) {
  out.perRun['x' + s] = mean(rows.map((r) => r.words[s]));
  out.runsWithOne['x' + s] = share(rows.map((r) => r.words[s]));
}
out.allWords = mean(rows.map((r) => r.words[2] + r.words[3] + r.words[4] + r.words[5]));
console.log(JSON.stringify(out, null, 1));
