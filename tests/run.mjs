// Smoke and regression tests. They drive the built index.html in headless Chrome through the debug hooks in window.__kus.
//   npm test                 build, then run everything
//   node tests/run.mjs soak  run only the tests whose name contains "soak"
// Uses the Chrome already installed on the machine. Set CHROME=/path/to/chrome to point at another binary.
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = pathToFileURL(join(root, 'index.html')).href;
const only = process.argv[2];
const launch = { args: ['--autoplay-policy=no-user-gesture-required'] };
if (process.env.CHROME) launch.executablePath = process.env.CHROME;
else launch.channel = 'chrome';
const browser = await chromium.launch(launch);

let failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// A fresh page with the game started. Bots are parked far away and cheats are off, so a test controls everything it needs.
// returning: storage says a run was finished before, so the menu is the full one and not the short first-visit one.
async function open({ width = 1200, height = 720, touch = false, dpr = 1, play = true, returning = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  if (returning) await page.addInitScript(() => localStorage.getItem('kus.best') === null && localStorage.setItem('kus.best', '0'));
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL);
  await page.waitForTimeout(600);
  if (play) {
    if (touch) await page.tap('#play');
    else await page.click('#play');
    await page.waitForTimeout(250);
  }
  return { page, errors, close: () => ctx.close() };
}
const QUIET = `const k = window.__kus, P = k.player; k.pause(true);
  for (const key in k.CHEAT) k.CHEAT[key] = key === 'speed' ? 1 : false;
  for (const b of k.blobs) if (b !== P) { b.x = 300 + Math.random() * 300; b.y = 3700; b.resetPoints(); }
  P.spawnT = 0;`;

test('boot: menu and a new game start without errors (desktop and phone)', async () => {
  for (const opt of [{}, { width: 390, height: 844, touch: true, dpr: 3 }, { width: 844, height: 390, touch: true, dpr: 3 }]) {
    const g = await open(opt);
    const s = await g.page.evaluate(() => ({
      state: window.__kus.state,
      touch: document.body.classList.contains('touch'),
      mass: Math.round(window.__kus.player.mass),
    }));
    assert(g.errors.length === 0, `page errors: ${g.errors.join(' | ')}`);
    assert(s.state === 'play', `state is ${s.state}`);
    assert(s.touch === !!opt.touch, 'touch mode detected wrongly');
    await g.close();
  }
});

test('first visit: short menu fits 360x640, one tap plays, a snack waits; full menu after a finished run', async () => {
  const g = await open({ width: 360, height: 640, touch: true, dpr: 2, play: false });
  const menu = () =>
    g.page.evaluate(() => {
      const c = document.querySelector('#menu .card'),
        shown = (id) => document.getElementById(id).offsetHeight > 0;
      return {
        over: c.scrollHeight - c.clientHeight,
        first: document.body.classList.contains('first'),
        rows: ['dif', 'skins', 'hats', 'mis', 'modeSeg'].filter(shown),
        flavour: shown('sw'),
        focus: document.activeElement && document.activeElement.id,
      };
    });
  const a = await menu();
  assert(a.first, 'a first visit was not recognised');
  assert(a.over <= 1, `first-visit menu scrolls by ${a.over}px at 360x640`);
  assert(a.rows.length === 0 && a.flavour, `first-visit menu shows ${a.rows} (flavour shown: ${a.flavour})`);
  assert(a.focus !== 'nick', 'the name field took the focus and would open the keyboard');
  await g.page.tap('#play');
  await g.page.waitForTimeout(250);
  const p = await g.page.evaluate(() => {
    const k = window.__kus,
      P = k.player,
      q = k.blobs.find((b) => b.tame);
    return {
      state: k.state,
      name: P.name,
      diff: localStorage.getItem('kus.diff'),
      mode: localStorage.getItem('kus.mode'),
      gap: q ? Math.hypot(q.x - P.x, q.y - P.y) - q.Rs - P.Rs : null,
      small: q && q.mass < P.mass / 2,
    };
  });
  assert(p.state === 'play' && p.name === 'Кусака', `Play with an empty name: state ${p.state}, name ${p.name}`);
  assert(p.diff === 'normal' && p.mode === 'free', `first run must be normal and free, got ${p.diff}/${p.mode}`);
  assert(p.gap !== null && p.gap < 120 && p.small, `no small snack in front of the new player (gap ${p.gap})`);
  await g.page.tap('#pauseBtn');
  await g.page.waitForTimeout(150);
  await g.page.tap('#pMenu');
  await g.page.waitForTimeout(250);
  const b = await menu();
  assert(!b.first && b.rows.length === 5, `after a finished run the menu must be full, shows ${b.rows}`);
  assert(!(await g.page.evaluate(() => window.__kus.blobs.some((x) => x.tame))), 'the snack stayed tame after the run');
  await g.page.reload();
  await g.page.waitForTimeout(600);
  assert(!(await menu()).first, 'the full menu was not remembered');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('phone: play controls stay inside the screen', async () => {
  for (const [width, height] of [
    [390, 844],
    [360, 640],
    [844, 390],
  ]) {
    const g = await open({ width, height, touch: true, dpr: 2 });
    const r = await g.page.evaluate(() =>
      ['dash', 'dodge'].map((id) => {
        const b = document.getElementById(id).getBoundingClientRect();
        return b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight && b.width > 30;
      }),
    );
    assert(r.every(Boolean), `bite/tongue buttons off screen at ${width}x${height}`);
    await g.close();
  }
});

test('bite rules: hedgehog spines, cake cherry, shield', async () => {
  const g = await open();
  const r = await g.page.evaluate(`(() => { ${QUIET} const out = {};
    P.mass = 200; for (let i = 0; i < 60; i++) k.update(1/60);
    const h = k.spawnSpecial('hedgehog')[0]; h.ai = null; h.spawnT = 0; h.mass = 200; for (let i = 0; i < 30; i++) k.update(1/60);
    const sit = (face, side) => { k.place(h, 2000, 1200, 0); k.place(P, 2000 + side * (h.Rs + P.Rs - 4), 1200, face); P.biteCd = 0; P.stats.bites = 0; h.wounds.length = 0; P.hurtT = 0; let hurt = false;
      for (let i = 0; i < 45; i++) { P.tx = h.x; P.ty = h.y; h.tx = h.x; h.ty = h.y; h.biteCd = 9; k.update(1/60); if (P.hurtT > 0) hurt = true; }
      return { bites: P.stats.bites, wounds: h.wounds.length, pricked: hurt }; };
    out.back = sit(0, -1); out.front = sit(Math.PI, 1);
    const c = k.spawnSpecial('cake')[0]; c.ai = null; c.spawnT = 0; for (let i = 0; i < 30; i++) k.update(1/60);
    const cake = (side) => { k.place(P, 2000 + side * (c.Rs + P.Rs - 4), 2400, side > 0 ? Math.PI : 0); P.biteCd = 0; c.wounds.length = 0; const m0 = c.mass; let f = 0;
      while (f < 60 && c.mass >= m0 - 0.5) { P.tx = c.x; P.ty = c.y; c.tx = c.x; c.ty = c.y; c.biteCd = 9; P.biteCd = Math.min(P.biteCd, 0); k.update(1/60); f++; } return m0 - c.mass; };
    P.mass = 200; k.place(c, 2000, 2400, 0); out.cherry = cake(-1); P.mass = 200; k.place(c, 2000, 2400, Math.PI / 2); out.crust = cake(1);
    P.pShield = 5; const K = k.spawnBot(600); K.ai = null; K.spawnT = 0; for (let i = 0; i < 30; i++) k.update(1/60);
    k.place(P, 3000, 1500, 0); k.place(K, 3000 - K.Rs - P.Rs + 4, 1500, 0); const pm = P.mass; K.biteCd = 0;
    for (let i = 0; i < 60; i++) { K.tx = P.x; K.ty = P.y; P.tx = P.x; P.ty = P.y; P.pShield = 5; k.update(1/60); }
    out.shieldLoss = pm - P.mass; out.alive = P.alive; return out; })()`);
  assert(r.back.bites === 0 && r.back.pricked, 'biting a hedgehog from the back must prick and not land');
  assert(r.front.bites === 1 && r.front.wounds === 1, 'biting a hedgehog in the face must land');
  assert(r.cherry > r.crust * 2, `cake cherry (${r.cherry.toFixed(1)}) must give far more than the crust (${r.crust.toFixed(1)})`);
  assert(r.shieldLoss <= 0.5 && r.alive, 'a shield must stop bites');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('streak, jelly wobble and swallowing whole', async () => {
  const g = await open();
  const r = await g.page.evaluate(`(() => { ${QUIET} const out = {};
    P.mass = 120; for (let i = 0; i < 40; i++) k.update(1/60);
    const V = k.spawnBot(400); V.ai = null; V.spawnT = 0; for (let i = 0; i < 30; i++) k.update(1/60);
    let last = P.stats.bites, sq = 0, rip = false; out.combos = [];
    for (let n = 0; n < 4; n++) { k.place(V, 2000, 1500, 0); k.place(P, 2000 - V.Rs - P.Rs + 4, 1500, 0); V.wounds.length = 0; P.biteCd = 0; let f = 0;
      while (f < 90 && P.stats.bites === last) { P.tx = V.x; P.ty = V.y; V.tx = V.x; V.ty = V.y; V.biteCd = 9; k.update(1/60); f++; sq = Math.max(sq, Math.abs(V.sq)); if (V.rip) rip = true; }
      last = P.stats.bites; out.combos.push(P.combo); }
    out.sq = sq; out.rip = rip;
    for (const b of k.blobs) if (b === V) b.alive = false; for (let i = 0; i < 5; i++) k.update(1/60);
    const S = k.spawnBot(20); S.ai = null; S.spawnT = 0; P.mass = 400; for (let i = 0; i < 30; i++) k.update(1/60);
    k.place(P, 2000, 2500, 0); k.place(S, 2000 + P.Rs + S.Rs - 4, 2500, 0); P.biteCd = 0; const m0 = P.mass;
    for (let i = 0; i < 120; i++) { P.tx = S.x; P.ty = S.y; k.update(1/60); }
    out.kills = P.stats.kills; out.gain = P.mass - m0; out.finite = Number.isFinite(P.x + P.sq + k.cam.z + k.cam.kx); return out; })()`);
  assert(r.combos.join() === '1,2,3,4', `streak should count 1,2,3,4, got ${r.combos}`);
  assert(r.sq > 0.01 && r.rip, 'a bite must make the victim wobble and ripple');
  assert(r.kills === 1 && r.gain > 10, 'a tiny candy must be swallowed whole');
  assert(r.finite, 'numbers went bad');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('sugar: earned in a clean run, paid at the end, one chest pick, two-tap shop', async () => {
  const g = await open({ play: false });
  const r = await g.page.evaluate(() => {
    const k = window.__kus,
      out = {};
    k.setSugar(0);
    k.pause(true);
    k.setMode('t3');
    k.startGame();
    const P = k.player;
    P.spawnT = 0;
    P.combo = 1;
    k.mission('bites', 1);
    P.combo = 4;
    k.mission('bites', 1);
    k.mission('kills', 1);
    k.mission('mass', 999, true); // progress-type missions never pay sugar by themselves
    out.during = k.run.sugar;
    out.hud = document.getElementById('sugar').textContent;
    k.setTimeLeft(0.001);
    for (let i = 0; i < 90; i++) k.update(1 / 60);
    out.over = !document.getElementById('over').classList.contains('hidden');
    out.got = k.run.got;
    out.bank = k.sugar;
    const row = document.getElementById('chestRow');
    row.children[1].click();
    const after = k.sugar;
    row.children[0].click(); // a second pick does nothing
    out.prizes = [...row.children].map((b) => +b.textContent);
    out.chestWon = after - out.bank;
    out.twice = k.sugar === after;
    out.near = document.getElementById('near').textContent;
    // shop: not enough sugar, then a first tap asks, a second tap buys
    k.setSugar(10);
    const lock = () => document.querySelector('#skins button.lock');
    const id = lock().dataset.s;
    lock().click();
    out.poor = k.sugar === 10 && !k.M.open.includes(id);
    k.setSugar(5000);
    document.querySelector(`#skins [data-s="${id}"]`).click();
    out.asked = k.sugar === 5000 && !!document.querySelector(`#skins [data-s="${id}"] .pz.ask`);
    document.querySelector(`#skins [data-s="${id}"]`).click();
    out.bought = k.M.open.includes(id) && k.sugar === 5000 - 150;
    out.saved = localStorage.getItem('kus.sugar');
    return out;
  });
  assert(r.during === 1 + 4 + 6, `sugar during the run should be 11 (bite, bite ×4 streak, kill), got ${r.during}`);
  assert(r.hud === 'сахар 11', `HUD shows "${r.hud}"`);
  assert(r.over && r.got >= 11 && r.bank === r.got, `end of run must pay ${r.got} into the bank, bank is ${r.bank}`);
  assert(r.prizes.length === 3 && r.prizes.includes(r.chestWon) && r.chestWon > 0, `chest prizes ${r.prizes}, won ${r.chestWon}`);
  assert(r.twice, 'the chest paid twice');
  assert(r.near.includes('узор'), `no "so close" line: "${r.near}"`);
  assert(r.poor, 'a pattern was sold without enough sugar');
  assert(r.asked, 'the first tap must only ask');
  assert(r.bought && r.saved === String(5000 - 150), 'the second tap must buy the pattern and save the bank');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('sugar: none for a run with cheats', async () => {
  const g = await open({ play: false });
  const r = await g.page.evaluate(() => {
    const k = window.__kus;
    k.setSugar(0);
    k.pause(true);
    k.setMode('t3');
    k.startGame();
    k.player.spawnT = 0;
    k.mission('bites', 1);
    k.player.cheated = true;
    k.mission('bites', 1);
    k.setTimeLeft(0.001);
    for (let i = 0; i < 90; i++) k.update(1 / 60);
    return { bank: k.sugar, chest: !document.getElementById('sweet').classList.contains('hidden') };
  });
  assert(r.bank === 0 && !r.chest, `a cheated run paid ${r.bank} sugar`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('settings: difficulty and graphics apply and are remembered', async () => {
  const g = await open({ play: false, returning: true });
  const mass = {};
  for (const d of ['easy', 'hard', 'normal']) {
    await g.page.click(`#diffSeg button[data-v=${d}]`);
    await g.page.click('#play');
    await g.page.waitForTimeout(120);
    mass[d] = await g.page.evaluate(() => window.__kus.player.mass);
    assert((await g.page.evaluate(() => localStorage.getItem('kus.diff'))) === d, 'difficulty not saved');
    await g.page.keyboard.press('Escape');
    await g.page.waitForTimeout(120);
    await g.page.click('#pMenu');
    await g.page.waitForTimeout(120);
  }
  assert(mass.easy > mass.normal && mass.normal > mass.hard, `start mass must fall with difficulty: ${JSON.stringify(mass)}`);
  await g.page.click('#play');
  await g.page.waitForTimeout(150);
  await g.page.keyboard.press('Escape');
  await g.page.waitForTimeout(150);
  await g.page.click('#gfxSeg button[data-v=low]');
  assert((await g.page.evaluate(() => window.__kus.lod)) === 2, 'light graphics must set the lowest detail');
  await g.page.click('#gfxSeg button[data-v=auto]');
  await g.page.click('#pauseX');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('sound: every effect plays without throwing', async () => {
  const g = await open();
  const r = await g.page.evaluate(async () => {
    const S = window.__kus.Sfx,
      bad = [];
    const calls = [
      ['chomp', [1, 1]],
      ['stretch', [0.35, 1]],
      ['snap', [0.8]],
      ['munch', []],
      ['bloop', [1]],
      ['ding', [2]],
      ['ding', [6]],
      ['hurt', []],
      ['gulp', [1]],
      ['pop', []],
      ['boing', [1]],
      ['thwip', []],
      ['squelch', []],
      ['power', []],
      ['dash', []],
    ];
    for (const [m, a] of calls) {
      try {
        S.at(window.__kus.cam.x + 300)[m](...a);
      } catch (e) {
        bad.push(`${m}: ${e.message}`);
      }
    }
    await new Promise((res) => setTimeout(res, 500));
    return { running: !!S.ok(), bad };
  });
  assert(r.running, 'audio context is not running, so nothing was actually tested');
  assert(r.bad.length === 0, r.bad.join(' | '));
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

// The long one: the autopilot plays for simulated minutes at an uneven frame rate while invariants are checked every frame.
test('soak: 3 simulated minutes at a ragged frame rate, nothing breaks or gets stuck', async () => {
  const g = await open();
  const r = await g.page.evaluate(() => {
    const k = window.__kus;
    k.pause(true);
    k.player.ai = k.newAI();
    k.player.spawnT = 0;
    const bad = {};
    const hit = (key, info) => {
      (bad[key] ||= { n: 0, example: info }).n++;
    };
    const age = new Map(),
      inside = new Map(),
      prev = new Map();
    const held = (o, key, on, dt, lim) => {
      const id = key + o.id;
      if (!on) return void age.delete(id);
      const a = (age.get(id) || 0) + dt;
      age.set(id, a);
      if (a > lim && a - dt <= lim) hit(key, [o.name, o.kind, Math.round(o.mass)]);
    };
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let T = 0;
    while (T < 180) {
      const dt = rnd() < 0.08 ? 0.05 : 1 / 144 + rnd() * (1 / 24 - 1 / 144);
      if (k.state === 'dead') {
        k.startGame();
        if (k.state === 'play') {
          k.player.ai = k.newAI();
          prev.clear();
        }
      }
      k.update(dt);
      T += dt;
      const c = k.cam;
      if (!Number.isFinite(c.x + c.y + c.z + c.kx + c.ky)) hit('cameraNaN', [c.x, c.z]);
      const bl = k.blobs;
      for (const b of bl) {
        if (!b.alive) continue;
        if (!Number.isFinite(b.x + b.y + b.vx + b.vy + b.Rs + b.mass + b.mouth + b.sq)) {
          hit('NaN', [b.name]);
          continue;
        }
        if (b.x < -1 || b.y < -1 || b.x > 4001 || b.y > 4001) hit('offTray', [b.name, Math.round(b.x), Math.round(b.y)]);
        let far = 0;
        for (const q of b.pts) far = Math.max(far, Math.hypot(q.x - b.x, q.y - b.y));
        if (!(far / b.Rs < 3)) hit('outlineBlewUp', [b.name, +(far / b.Rs).toFixed(2)]);
        const p = prev.get(b.id); // no body may jump further than its fastest lunge allows
        if (p && Math.hypot(b.x - p[0], b.y - p[1]) > Math.max(18, b.maxSpeed() * 2.7 * 1.15 * dt) * (dt / (1 / 60) > 1 ? 1.6 : 1))
          hit('teleport', [b.name, Math.round(Math.hypot(b.x - p[0], b.y - p[1]))]);
        prev.set(b.id, [b.x, b.y]);
        held(b, 'biteStuck', !!b.bite, dt, 0.6);
        held(b, 'pieceStuck', !!(b.chunk && !b.chunk.dead), dt, 3);
        held(b, 'tongueStuck', !!b.tongue, dt, 3.5);
        held(b, 'gulpStuck', b.gulpT > 0, dt, 2);
      }
      for (let i = 0; i < bl.length; i++)
        for (let j = i + 1; j < bl.length; j++) {
          const A = bl[i],
            B = bl[j];
          if (!A.alive || !B.alive) continue;
          const id = A.id + ':' + B.id;
          if (Math.hypot(A.x - B.x, A.y - B.y) < Math.max(A.Rs, B.Rs) * 0.45) {
            const a = (inside.get(id) || 0) + dt;
            inside.set(id, a);
            if (a > 1.5 && a - dt <= 1.5) hit('stuckInsideEachOther', [A.name, B.name]);
          } else inside.delete(id);
        }
      if (k.strands.length > 60 || k.chunks.length > 60) hit('leak', [k.strands.length, k.chunks.length]);
    }
    return { bad, blobs: k.blobs.length };
  });
  assert(Object.keys(r.bad).length === 0, JSON.stringify(r.bad));
  assert(r.blobs > 10, 'the tray emptied out');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('pace: real frames on this machine (information only)', async () => {
  const g = await open({ width: 1600, height: 900 });
  const r = await g.page.evaluate(
    () =>
      new Promise((res) => {
        const k = window.__kus;
        k.player.ai = k.newAI();
        k.player.spawnT = 0;
        const gaps = [];
        let last = performance.now();
        const t0 = last;
        (function f(t) {
          gaps.push(t - last);
          last = t;
          if (t - t0 < 4000) requestAnimationFrame(f);
          else {
            gaps.splice(0, 10);
            res({
              fps: Math.round(gaps.length / ((t - t0) / 1000)),
              worstMs: Math.round(Math.max(...gaps)),
              detail: `${2 - k.lod}/${Math.round(k.quality * 100)}%`,
            });
          }
        })(last);
      }),
  );
  console.log(`      ${r.fps} fps, worst frame ${r.worstMs} ms, detail ${r.detail}`);
  await g.close();
});

for (const [name, fn] of tests) {
  if (only && !name.includes(only)) continue;
  const t0 = Date.now();
  try {
    await fn();
    console.log(`PASS  ${name}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}\n      ${e.message}`);
  }
}
await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
