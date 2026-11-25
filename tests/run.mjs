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
        secs: ['secMode', 'secLook', 'secMis', 'secSet', 'secHelp'].filter(shown),
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
  assert(!b.first && b.secs.length === 5, `after a finished run the menu must show all five sections, shows ${b.secs}`);
  assert(!(await g.page.evaluate(() => window.__kus.blobs.some((x) => x.tame))), 'the snack stayed tame after the run');
  await g.page.reload();
  await g.page.waitForTimeout(600);
  assert(!(await menu()).first, 'the full menu was not remembered');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('menu: sections and Play fit the screen, nothing overlaps, targets are 44px; an opened section scrolls into view', async () => {
  for (const [w, h, touch] of [
    [1280, 720, false],
    [360, 640, true],
    [844, 390, true],
  ]) {
    const g = await open({ width: w, height: h, touch, dpr: 2, play: false, returning: true });
    const tag = `${w}x${h}`;
    const r = await g.page.evaluate(() => {
      const vis = (e) => e.offsetWidth > 0 && e.offsetHeight > 0,
        els = [...document.querySelectorAll('#menu button, #menu input')].filter(vis),
        box = els.map((e) => [e.id || e.className || e.textContent.slice(0, 12), e.getBoundingClientRect()]),
        c = document.querySelector('#menu .card'),
        out = { n: els.length, off: [], small: [], hit: [], over: c.scrollHeight - c.clientHeight };
      for (const [n, b] of box) {
        if (b.left < 0 || b.top < 0 || b.right > innerWidth || b.bottom > innerHeight) out.off.push(n);
        if (b.height < 44 || b.width < 44) out.small.push(`${n} ${Math.round(b.width)}x${Math.round(b.height)}`);
      }
      for (let i = 0; i < box.length; i++)
        for (let j = i + 1; j < box.length; j++) {
          const a = box[i][1],
            b = box[j][1];
          if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1)
            out.hit.push(box[i][0] + ' / ' + box[j][0]);
        }
      return out;
    });
    assert(g.errors.length === 0, g.errors.join(' | '));
    assert(r.n >= 8, `${tag}: only ${r.n} menu controls are visible`);
    assert(r.over <= 1, `${tag}: the folded menu scrolls by ${r.over}px`);
    assert(!r.off.length, `${tag}: off the screen: ${r.off}`);
    assert(!r.small.length, `${tag}: smaller than 44px: ${r.small}`);
    assert(!r.hit.length, `${tag}: overlapping: ${r.hit}`);
    for (const id of ['secMode', 'secLook', 'secMis', 'secSet', 'secHelp']) {
      await g.page.click(`#${id} .sh`);
      await g.page.waitForTimeout(260);
      const o = await g.page.evaluate((id) => {
        const p = document.getElementById('play').getBoundingClientRect(),
          f = document.getElementById(id).querySelector('.sb').firstElementChild.getBoundingClientRect(),
          open = [...document.querySelectorAll('#menu .sec.open')].map((x) => x.id);
        return {
          open,
          play: p.top >= 0 && p.bottom <= innerHeight && p.left >= 0 && p.right <= innerWidth,
          first: f.top >= 0 && f.bottom <= innerHeight && (f.bottom <= p.top + 1 || f.right <= p.left), // above Play, or beside it sideways
        };
      }, id);
      assert(o.open.length === 1 && o.open[0] === id, `${tag}: open sections ${o.open}, expected only ${id}`);
      assert(o.play, `${tag}: Play left the screen with ${id} open`);
      assert(o.first, `${tag}: ${id} opened out of sight`);
      if (id === 'secMode') {
        const d = await g.page.evaluate(() =>
          [...document.querySelectorAll('#diffSeg button')].map((e) => {
            const b = e.getBoundingClientRect();
            return {
              v: e.dataset.v,
              ok: b.left >= 0 && b.right <= innerWidth && b.width >= 44 && b.height >= 44,
              clip: e.scrollWidth > e.clientWidth + 1,
              sw: e.scrollWidth,
              cw: e.clientWidth,
              w: Math.round(b.width),
              h: Math.round(b.height),
              top: Math.round(b.top),
            };
          }),
        );
        assert(d.length === 4, `${tag}: ${d.length} difficulty buttons, expected 4`);
        assert(new Set(d.map((x) => x.top)).size === 1, `${tag}: the difficulty buttons do not share one row`);
        for (const x of d) assert(x.ok && !x.clip, `${tag}: difficulty ${x.v} is off the screen, small or clipped ${JSON.stringify(x)}`);
      }
    }
    await g.page.click('#secHelp .sh');
    assert(!(await g.page.evaluate(() => document.querySelector('#menu .sec.open'))), `${tag}: a second tap must fold the section`);
    await g.close();
  }
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
    // the game ran on its own for a moment before the pause and may have started a streak already: clear it the way it lapses
    P.combo = 0; P.comboT = 0;
    let last = P.stats.bites, sq = 0, rip = false; out.combos = [];
    for (let n = 0; n < 4; n++) { k.place(V, 2000, 1500, 0); k.place(P, 2000 - V.Rs - P.Rs + 4, 1500, 0); V.wounds.length = 0; P.biteCd = 0; let f = 0;
      while (f < 90 && P.stats.bites === last) { P.tx = V.x; P.ty = V.y; V.tx = V.x; V.ty = V.y; V.biteCd = 9; k.update(1/60); f++; sq = Math.max(sq, Math.abs(V.sq)); if (V.rip) rip = true; }
      last = P.stats.bites; out.combos.push(P.combo); }
    out.sq = sq; out.rip = rip;
    for (const b of k.blobs) if (b === V) b.alive = false; for (let i = 0; i < 5; i++) k.update(1/60);
    const S = k.spawnBot(20); S.ai = null; S.spawnT = 0; P.mass = 400; for (let i = 0; i < 30; i++) k.update(1/60);
    k.place(P, 2000, 2500, 0); k.place(S, 2000 + P.Rs + S.Rs - 4, 2500, 0); P.biteCd = 0; const m0 = P.mass, k0 = P.stats.kills;
    for (let i = 0; i < 120; i++) { P.tx = S.x; P.ty = S.y; k.update(1/60); }
    out.kills = P.stats.kills - k0; out.gain = P.mass - m0; out.finite = Number.isFinite(P.x + P.sq + k.cam.z + k.cam.kx); return out; })()`);
  assert(r.combos.join() === '1,2,3,4', `streak should count 1,2,3,4, got ${r.combos}`);
  assert(r.sq > 0.01 && r.rip, 'a bite must make the victim wobble and ripple');
  assert(r.kills === 1 && r.gain > 10, `a tiny candy must be swallowed whole: kills ${r.kills}, gain ${r.gain.toFixed(1)}`);
  assert(r.finite, 'numbers went bad');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

// The mouth sits on the front rim, not in the middle of the body: food must vanish into it, not into thin air.
test('mouth: on the front rim where the candy looks, food goes into it, a sudden turn is smoothed', async () => {
  const g = await open();
  const r = await g.page.evaluate(`(() => { ${QUIET} const out = { geo: [] };
    P.mass = 90; for (let i = 0; i < 40; i++) k.update(1/60);
    k.place(P, 2000, 2000, 1.1); for (let i = 0; i < 40; i++) k.update(1/60);
    for (const open of [0, 0.4, 1.2]) {
      P.mouth = open; const m = k.mouthGeo(P), q = P.contourAt(m.f), rim = Math.hypot(q[0] - P.x, q[1] - P.y);
      out.geo.push({ open, dirErr: Math.abs(((m.f - P.face + 9 * Math.PI) % (2 * Math.PI)) - Math.PI), centre: (m.xc + m.H / 2) / rim, jaw: (m.xc + m.H) / rim });
    }
    // a sprinkle ahead and off to one side: where does it disappear?
    k.food.length = 0; const fx = Math.cos(P.face), fy = Math.sin(P.face);
    const f = { kind: 0, x: P.x + fx * P.Rs * 1.3 - fy * P.Rs * 0.55, y: P.y + fy * P.Rs * 1.3 + fx * P.Rs * 0.55, m: 1, c: 0, ai: 0, sz: 8 };
    k.food.push(f); let last = null;
    for (let i = 0; i < 120 && k.food.includes(f); i++) { last = [f.x, f.y]; k.update(1/60); }
    out.eaten = !k.food.includes(f);
    out.side = Math.abs(((Math.atan2(last[1] - P.y, last[0] - P.x) - P.fa + 9 * Math.PI) % (2 * Math.PI)) - Math.PI);
    out.mouthW = k.mouthGeo(P).W / P.Rs;
    // the tongue throws the face round by half a radian at once: the drawn face follows over a few frames
    const a0 = P.fa; P.face += 0.5; k.update(1/60); out.step = Math.abs(P.fa - a0);
    for (let i = 0; i < 20; i++) k.update(1/60); out.settled = Math.abs(P.fa - P.face);
    return out; })()`);
  for (const q of r.geo) {
    assert(q.dirErr < 0.05, `the mouth must face where the candy looks: off by ${q.dirErr.toFixed(3)} rad at open ${q.open}`);
    assert(q.centre > 0.7, `the mouth centre must be at the rim, not in the middle: ${q.centre.toFixed(2)} of the rim radius at open ${q.open}`);
    if (q.open) assert(q.jaw > 0.85 && q.jaw < 1.02, `the jaw must reach the outline: ${q.jaw.toFixed(2)} of the rim radius at open ${q.open}`);
  }
  assert(r.eaten, 'the sprinkle in front was not eaten');
  assert(r.side < Math.atan(r.mouthW) + 0.1, `the sprinkle must go into the mouth: it vanished ${r.side.toFixed(2)} rad off the face line`);
  assert(
    r.step < 0.3 && r.settled < 0.02,
    `a sudden turn must be smoothed: first frame ${r.step.toFixed(3)} rad, after 1/3 s off by ${r.settled.toFixed(3)}`,
  );
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

// A shove into the corner must stop at the wall's rim: past it, the next frame's wall snapped the body back in one jump.
test('pinned in a corner: a shoved body stays at the rim and does not jump', async () => {
  const g = await open();
  const r = await g.page.evaluate(`(() => { ${QUIET}
    const B = k.spawnBot(2000), S = k.spawnBot(300); for (const b of [B, S]) { b.ai = null; b.spawnT = 0; }
    for (let i = 0; i < 30; i++) k.update(1/60);
    k.place(P, 3000, 3000, 0); k.place(S, S.Rs * 0.85, S.Rs * 0.85, 0); k.place(B, S.Rs + B.Rs * 0.8, S.Rs + B.Rs * 0.8, 0);
    let jump = 0, rim = 9; const m = () => Math.min(S.x, S.y) / S.Rs;
    for (let i = 0; i < 120; i++) { const x = S.x, y = S.y; B.tx = B.ty = 0; S.tx = S.ty = 0; B.biteCd = S.biteCd = 9;
      k.update(i % 3 ? 1/120 : 0.05); jump = Math.max(jump, Math.hypot(S.x - x, S.y - y)); rim = Math.min(rim, m()); }
    return { jump, rim, alive: S.alive }; })()`);
  assert(r.alive, 'the pinned body died');
  assert(r.jump < 3, `the pinned body jittered ${r.jump.toFixed(1)} px in one frame`);
  assert(r.rim > 0.84, `the pinned body was pushed into the wall to ${r.rim.toFixed(2)} of its radius`);
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
    out.hud = k.hud.sugarShown;
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
  assert(r.hud === 11, `HUD shows "${r.hud}"`);
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

test('hud: the sugar pill rolls to earned sugar once the cubes land', async () => {
  const g = await open();
  const r = await g.page.evaluate(`(() => { ${QUIET} k.run.sugar = 0; k.hud.sugarSettle();
    k.run.sugar += 6; k.sugarFly(k.player.x, k.player.y, 6, 3);
    const mid = k.hud.sugarShown; for (let i = 0; i < 90; i++) k.update(1/60);
    return { mid, end: k.hud.sugarShown, want: Math.floor(k.run.sugar), air: k.hud.air, label: document.getElementById('sugar').getAttribute('aria-label') }; })()`);
  // the player may eat a sprinkle during the 90 frames, so compare with run.sugar, not a fixed 6
  assert(r.mid === 0 && r.end >= 6 && r.end === r.want && r.air === 0, `pill ${r.mid} -> ${r.end} (run ${r.want}), air ${r.air}`);
  assert(r.label === `сахар ${r.end}`, `aria-label "${r.label}"`);
  // cubes still in flight when the run ends are settled at once
  const d = await g.page.evaluate(`(() => { ${QUIET} k.setMode('t3'); k.startGame(); k.player.spawnT = 0; k.run.sugar += 10; k.sugarFly(k.player.x, k.player.y, 10, 5); k.setTimeLeft(0.001);
    for (let i = 0; i < 400 && k.state !== 'dead'; i++) k.update(1/60);
    return { state: k.state, air: k.hud.air, shown: k.hud.sugarShown, want: Math.floor(k.run.sugar) }; })()`);
  assert(d.state === 'dead' && d.air === 0 && d.shown === d.want, `settle at the end: ${JSON.stringify(d)}`);
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

// Album: a sticker for every named bot swallowed whole in a clean run.
// eat(name): a small bot of that name is put in front of a big player's mouth and swallowed the way the game does it.
const EAT = `const eat = (name) => { const S = k.spawnBot(20); S.name = name; S.ai = null; S.spawnT = 0; P.mass = 400;
    for (let i = 0; i < 20; i++) k.update(1/60);
    k.place(P, 2000, 2500, 0); k.place(S, 2000 + P.Rs + S.Rs - 4, 2500, 0); P.biteCd = 0; const k0 = P.stats.kills;
    for (let i = 0; i < 120 && P.stats.kills === k0; i++) { P.tx = S.x; P.ty = S.y; k.update(1/60); }
    for (let i = 0; i < 10; i++) k.update(1/60);
    return P.stats.kills - k0; };`;

test('album: a bot swallowed whole opens its sticker, a repeat only counts, the end screen says so', async () => {
  const g = await open({ play: false });
  const r = await g.page.evaluate(`(() => { const k0 = window.__kus; k0.pause(true); k0.setMode('t3'); k0.startGame(); ${QUIET} ${EAT}
    const out = {}, feed = () => document.getElementById('feed').textContent;
    out.ate1 = eat('Зефирка'); out.c1 = k.album.c['Зефирка']; out.feed1 = feed(); out.new1 = (k.run.stk || []).slice();
    document.getElementById('feed').innerHTML = '';
    out.ate2 = eat('Зефирка'); out.c2 = k.album.c['Зефирка']; out.feed2 = feed(); out.new2 = (k.run.stk || []).slice();
    out.count = k.albumCount(); out.saved = JSON.parse(localStorage.getItem('kus.album')).c['Зефирка'];
    out.btn = document.getElementById('albumBtn').textContent;
    k.setTimeLeft(0.001); for (let i = 0; i < 90; i++) k.update(1/60);
    out.line = document.getElementById('stk').textContent;
    return out; })()`);
  assert(r.ate1 === 1 && r.c1 === 1, `the first swallow must open the sticker: ate ${r.ate1}, count ${r.c1}`);
  assert(r.feed1.includes('Новая наклейка: Зефирка'), `no plaque in the feed: "${r.feed1}"`);
  assert(r.ate2 === 1 && r.c2 === 2 && r.saved === 2, `a repeat must count: ${r.c2}, saved ${r.saved}`);
  assert(!r.feed2.includes('Новая наклейка') && r.new2.length === 1, `a repeat must not be new again: "${r.feed2}", ${r.new2}`);
  assert(r.count === 1 && r.btn.includes('1 / 30'), `album count ${r.count}, menu button "${r.btn}"`);
  assert(r.line.includes('Новая наклейка: Зефирка') && r.line.includes('1 из 30'), `end screen line: "${r.line}"`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('album: a rarer sticker opens on its NEED-th swallow, shows its progress, and old saves keep what they had', async () => {
  const g = await open({ play: false });
  const r = await g.page.evaluate(`(() => { const k0 = window.__kus; k0.pause(true); k0.setMode('t3'); k0.startGame(); ${QUIET} ${EAT}
    const out = { need: k.NEED[k.STICKERS.find((s) => s.id === 'Пудинг').tier] }, feed = () => document.getElementById('feed').textContent;
    const tag = () => document.querySelector('#album .st[data-id="Пудинг"]');
    out.ate1 = eat('Пудинг'); out.count1 = k.albumCount(); out.feed1 = feed(); document.getElementById('feed').innerHTML = '';
    out.ate2 = eat('Пудинг'); out.count2 = k.albumCount();
    k.openAlbum(); out.badge = tag().lastChild.textContent; out.locked = tag().classList.contains('no'); k.closeAlbum();
    for (let n = 2; n < out.need; n++) eat('Пудинг');
    out.countN = k.albumCount(); out.feedN = feed(); out.new = (k.run.stk || []).slice();
    k.openAlbum(); out.badgeN = tag().lastChild.textContent; out.lockedN = tag().classList.contains('no'); k.closeAlbum();
    return out; })()`);
  assert(r.need === 3, `a tier-1 sticker should need 3 swallows, NEED says ${r.need}`);
  assert(
    r.ate1 === 1 && r.count1 === 0 && r.feed1.includes('Пудинг»: 1 из 3'),
    `the first swallow must only count: album ${r.count1}, feed "${r.feed1}"`,
  );
  assert(r.ate2 === 1 && r.count2 === 0 && r.locked && r.badge === '2 из 3', `after two: album ${r.count2}, locked ${r.locked}, badge "${r.badge}"`);
  assert(r.countN === 1 && r.feedN.includes('Новая наклейка: Пудинг') && r.new.join() === 'Пудинг', `the third must open it: ${JSON.stringify(r)}`);
  assert(!r.lockedN && r.badgeN === '×3', `an opened sticker shows its count: locked ${r.lockedN}, badge "${r.badgeN}"`);
  // a save from before NEED: a rare sticker eaten once stays open, also after the next load
  const old = await g.page.evaluate(() => {
    localStorage.setItem('kus.album', JSON.stringify({ c: { Пудинг: 1, Зефирка: 1, Халва: 2 }, r: [] }));
    localStorage.removeItem('kus.albumOld');
  });
  await g.page.reload();
  await g.page.waitForTimeout(400);
  const a = await g.page.evaluate(() => window.__kus.albumCount());
  await g.page.reload();
  await g.page.waitForTimeout(400);
  const b = await g.page.evaluate(() => ({ n: window.__kus.albumCount(), old: JSON.parse(localStorage.getItem('kus.albumOld')).sort().join() }));
  assert(old === undefined && a === 3 && b.n === 3, `an old save lost stickers: ${a} then ${b.n}`);
  assert(b.old === 'Пудинг,Халва', `kus.albumOld must hold only the rare ones opened the old way: ${b.old}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('album: no sticker with cheats; a full row pays sugar once', async () => {
  const g = await open({ play: false });
  const r = await g.page.evaluate(`(() => { const k0 = window.__kus; k0.setSugar(0); k0.pause(true); k0.setMode('t3'); k0.startGame(); ${QUIET} ${EAT}
    const out = {};
    k.CHEAT.god = true; k.update(1/60);
    out.cheatAte = eat('Безе'); out.cheat = k.album.c['Безе'] || 0;
    k.CHEAT.god = false; k.toMenu(); return out; })()`);
  Object.assign(
    r,
    await g.page.evaluate(`(() => { const k0 = window.__kus; k0.setMode('t3'); k0.startGame(); ${QUIET} ${EAT}
    const out = {};
    for (const n of ['Зефирка', 'Суфле', 'Безе', 'Мусс']) k.album.c[n] = 1;
    out.ate = eat('Пастила'); out.sugar1 = k.sugar; out.rows = k.album.r.slice();
    out.feed = document.getElementById('feed').textContent;
    out.ate2 = eat('Пастила'); out.sugar2 = k.sugar;
    out.saved = JSON.parse(localStorage.getItem('kus.album')).r;
    return out; })()`),
  );
  assert(r.cheatAte === 1 && r.cheat === 0, `a sticker opened with cheats on (ate ${r.cheatAte}, count ${r.cheat})`);
  assert(r.ate === 1 && r.sugar1 === 100 && r.rows.join() === 'airy', `a full row must pay 100 once: sugar ${r.sugar1}, rows ${r.rows}`);
  assert(r.feed.includes('собран'), `no plaque for the row: "${r.feed}"`);
  assert(r.ate2 === 1 && r.sugar2 === 100, `the row paid twice: ${r.sugar2}`);
  assert(r.saved.join() === 'airy', `paid rows not saved: ${r.saved}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('album: the end screen with new stickers and a full row still fits phones without scrolling', async () => {
  for (const [w, h] of [
    [360, 640],
    [844, 390],
  ]) {
    const g = await open({ width: w, height: h, touch: true, dpr: 2, play: false, returning: true });
    const r = await g.page.evaluate(() => {
      const k = window.__kus;
      for (const n of ['Мармеладка', 'Желешка', 'Жвачка', 'Тянучка']) k.album.c[n] = 1;
      k.pause(true);
      k.setMode('t3');
      k.startGame();
      k.player.spawnT = 0;
      for (let i = 0; i < 12; i++) k.mission('bites', 1);
      for (const n of ['Зефирка', 'Суфле', 'Безе', 'Мусс', 'Бабл-гам']) k.albumEat({ name: n });
      k.setTimeLeft(0.001);
      for (let i = 0; i < 90; i++) k.update(1 / 60);
      const c = document.querySelector('#over .card');
      return {
        line: document.getElementById('stk').textContent,
        shown: document.getElementById('stk').offsetHeight > 0,
        over: c.scrollHeight - c.clientHeight,
      };
    });
    assert(
      r.shown && r.line.includes('Ряд «Тягучие» собран') && r.line.includes('9 из 30'),
      `${w}x${h}: sticker line "${r.line}" (shown ${r.shown})`,
    );
    assert(r.over <= 1, `${w}x${h}: the end screen scrolls by ${r.over}px with "${r.line}"`);
    assert(g.errors.length === 0, g.errors.join(' | '));
    await g.close();
  }
});

test('album: the page opens and closes, fits phones, stickers are big enough to tap', async () => {
  for (const [w, h] of [
    [360, 640],
    [844, 390],
  ]) {
    const g = await open({ width: w, height: h, touch: true, dpr: 2, play: false, returning: true });
    const row = await g.page.evaluate(() => document.querySelector('.bankRow').getBoundingClientRect().height);
    await g.page.tap('#albumBtn');
    await g.page.waitForTimeout(150);
    const r = await g.page.evaluate(() => {
      const c = document.querySelector('#album .card').getBoundingClientRect(),
        st = [...document.querySelectorAll('#album .st')].map((b) => b.getBoundingClientRect());
      const t0 = performance.now();
      window.__kus.closeAlbum();
      window.__kus.openAlbum();
      return {
        open: !document.getElementById('album').classList.contains('hidden'),
        top: c.top,
        bottom: c.bottom,
        left: c.left,
        right: c.right,
        n: st.length,
        minW: Math.min(...st.map((b) => b.width)),
        minH: Math.min(...st.map((b) => b.height)),
        reopen: performance.now() - t0,
        page: document.scrollingElement.scrollTop,
      };
    });
    const tag = `${w}x${h}`;
    assert(r.open && r.n === 30, `${tag}: album open ${r.open}, ${r.n} stickers`);
    assert(r.top >= 0 && r.left >= 0 && r.bottom <= h && r.right <= w && r.page === 0, `${tag}: the page leaves the screen ${JSON.stringify(r)}`);
    assert(r.minW >= 44 && r.minH >= 44, `${tag}: a sticker is ${r.minW}x${r.minH}, less than 44px`);
    assert(r.reopen < 50, `${tag}: reopening took ${r.reopen.toFixed(1)} ms`);
    assert(row <= 48, `${tag}: the sugar line with the album button is ${row}px high`);
    await g.page.keyboard.press('Escape');
    await g.page.waitForTimeout(80);
    const esc = await g.page.evaluate(() => document.getElementById('album').classList.contains('hidden'));
    await g.page.tap('#albumBtn');
    await g.page.waitForTimeout(80);
    await g.page.tap('#albumX');
    await g.page.waitForTimeout(80);
    const x = await g.page.evaluate(() => ({ hidden: document.getElementById('album').classList.contains('hidden'), state: window.__kus.state }));
    assert(esc, `${tag}: Esc did not close the album`);
    assert(x.hidden && x.state === 'menu', `${tag}: the close button did not close the album (${JSON.stringify(x)})`);
    assert(g.errors.length === 0, g.errors.join(' | '));
    await g.close();
  }
  const f = await open({ width: 360, height: 640, touch: true, dpr: 2, play: false });
  const first = await f.page.evaluate(() => document.getElementById('albumBtn').offsetHeight);
  assert(first === 0, 'the album button must wait until the first run is over');
  await f.close();
});

// Candy of the day: the clock is pinned through Date.now, which is all the game reads the date from.
const DAY = `const k = window.__kus;
  const at = (key, h = 12) => { const t = new Date(Math.floor(key / 10000), (Math.floor(key / 100) % 100) - 1, key % 100, h, 30).getTime(); Date.now = () => t; };
  const play = (key, mass, cheat) => { at(key); k.pause(true); k.setMode('daily'); if (k.state !== 'menu') k.toMenu(); k.startGame();
    const P = k.player; P.spawnT = 0; P.stats.maxMass = mass; if (cheat) P.cheated = true; k.setTimeLeft(0.001);
    for (let i = 0; i < 90; i++) k.update(1 / 60); return { ...k.daily.rec }; };`;

test('daily: the twist depends only on the date', async () => {
  const g = await open({ play: false });
  const r = await g.page.evaluate(`(() => { ${DAY} const out = {};
    out.same = k.daily.of(20261123).id === k.daily.of(20261123).id;
    at(20261123, 0); const a = k.daily.todayKey(); at(20261123, 23); out.wholeDay = a === 20261123 && k.daily.todayKey() === 20261123;
    out.twoDays = [k.daily.of(20261123).id, k.daily.of(20261124).id];
    const ids = [], d = new Date(2026, 0, 1);
    for (let i = 0; i < 120; i++) { ids.push(k.daily.of(d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()).id); d.setDate(d.getDate() + 1); }
    out.repeats = ids.filter((x, i) => i && x === ids[i - 1]).length; out.kinds = new Set(ids).size;
    at(20261124); k.toMenu(); out.menu = document.querySelector('#modeSeg [data-m=daily]').textContent;
    out.name24 = k.daily.of(20261124).name;
    k.setMode('daily'); k.startGame(); out.rule = k.daily.day; return out; })()`);
  assert(r.same && r.wholeDay, 'one date must always give the same twist, from midnight to midnight');
  assert(r.twoDays[0] !== r.twoDays[1], `two neighbouring days gave the same twist ${r.twoDays}`);
  assert(r.repeats === 0 && r.kinds >= 6, `over 120 days: ${r.repeats} repeats on neighbouring days, ${r.kinds} different twists`);
  assert(r.menu.includes(r.name24), `menu shows "${r.menu}", expected today's "${r.name24}"`);
  assert(r.rule === r.twoDays[1], `the run plays "${r.rule}", the date says "${r.twoDays[1]}"`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('daily: best of the day and days in a row, a missed day breaks the streak', async () => {
  const g = await open({ play: false });
  const r = await g.page.evaluate(`(() => { ${DAY} const out = {};
    out.a1 = play(20261123, 120); out.a2 = play(20261123, 90); out.a3 = play(20261123, 150);
    out.over = document.getElementById('best').textContent;
    out.b = play(20261124, 70); out.overB = document.getElementById('best').textContent;
    out.c = play(20261125, 80);
    at(20261127); out.gone = k.daily.streak(20261127);
    out.d = play(20261127, 60); out.overD = document.getElementById('best').textContent;
    out.saved = JSON.parse(localStorage.getItem('kus.daily')); return out; })()`);
  assert(r.a1.best === 120 && r.a1.streak === 1, `first run: ${JSON.stringify(r.a1)}`);
  assert(r.a2.best === 120 && r.a3.best === 150 && r.a3.streak === 1, `same day must keep the best: ${JSON.stringify([r.a2, r.a3])}`);
  assert(r.over.includes('150'), `end screen: "${r.over}"`);
  assert(r.b.best === 70 && r.b.streak === 2 && r.overB.includes('2 дня подряд'), `next day: ${JSON.stringify(r.b)} "${r.overB}"`);
  assert(r.c.streak === 3 && r.c.top === 3, `third day: ${JSON.stringify(r.c)}`);
  assert(r.gone === 0, 'a missed day must show no streak');
  assert(r.d.streak === 1 && r.d.top === 3 && r.d.best === 60 && r.overD.includes('рекорд 3'), `after a gap: ${JSON.stringify(r.d)} "${r.overD}"`);
  assert(r.saved && r.saved.d === 20261127 && r.saved.best === 60, `kus.daily: ${JSON.stringify(r.saved)}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('daily: a run with cheats is not recorded', async () => {
  const g = await open({ play: false });
  const r = await g.page.evaluate(`(() => { ${DAY} play(20261123, 100); const a = play(20261123, 500, true);
    return { a, best: document.getElementById('best').textContent, saved: localStorage.getItem('kus.daily') }; })()`);
  assert(r.a.best === 100 && r.a.streak === 1, `cheated run changed the day: ${JSON.stringify(r.a)}`);
  assert(r.best.includes('читами'), `end screen: "${r.best}"`);
  assert(JSON.parse(r.saved).best === 100, `saved: ${r.saved}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('daily: a challenge link opens the same candy, an old one says so', async () => {
  const out = {};
  for (const d of [20261123, 20261122]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(() => {
      const t = new Date(2026, 10, 23, 12).getTime();
      Date.now = () => t;
    });
    await page.goto(URL + `?c=143&n=${encodeURIComponent('Сеня')}&d=${d}`);
    await page.waitForTimeout(600);
    out[d] = await page.evaluate(() => {
      const k = window.__kus,
        o = {};
      o.chal = document.getElementById('chal').textContent;
      o.pressed = document.querySelector('#modeSeg [aria-pressed=true]').dataset.m;
      o.name = k.daily.of(20261123).name;
      k.pause(true);
      k.startGame();
      k.player.spawnT = 0;
      k.update(1 / 60);
      for (let i = 0; i < 2; i++) k.update(0.3);
      o.goal = document.getElementById('goal').textContent;
      k.player.stats.maxMass = 200;
      k.setTimeLeft(0.001);
      for (let i = 0; i < 90; i++) k.update(1 / 60);
      o.res = document.getElementById('chalRes').textContent;
      document.getElementById('chalBtn').click();
      o.link = document.getElementById('chalLink').value;
      o.btn = document.getElementById('chalBtn').textContent;
      return o;
    });
    assert(errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  const a = out[20261123],
    b = out[20261122];
  assert(a.pressed === 'daily' && a.chal.includes(a.name) && a.chal.includes('143'), `today's link: "${a.chal}", mode ${a.pressed}`);
  assert(a.goal.includes('побей 143'), `HUD goal: "${a.goal}"`);
  assert(a.res.includes('Вызов побит'), `end line: "${a.res}"`);
  assert(/[?&]c=200&/.test(a.link) && a.link.includes('&d=20261123'), `share link: ${a.link}`);
  assert(b.pressed === 'daily' && b.chal.includes('вчерашняя') && b.chal.includes(b.name), `yesterday's link: "${b.chal}"`);
  assert(!b.goal.includes('побей') && b.res === '', `an old challenge must not set a target: "${b.goal}" / "${b.res}"`);
});

// A phone opened from a friend's link on a fixed date (25 Nov 2026: «Двойная посыпка», the longest twist name).
async function linkPhone(width, height, q, returning) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript((ret) => {
    const t = new Date(2026, 10, 25, 12).getTime();
    Date.now = () => t;
    if (ret && localStorage.getItem('kus.best') === null) localStorage.setItem('kus.best', '40');
  }, returning);
  await page.goto(URL + q);
  await page.waitForTimeout(600);
  return { page, errors, close: () => ctx.close() };
}

test('daily: the HUD goal line stays clear of the table on phones', async () => {
  for (const [w, h] of [
    [360, 640],
    [844, 390],
  ])
    for (const q of [`?c=9999&n=${encodeURIComponent('Сеня')}&d=20261125`, `?c=9999&n=${encodeURIComponent('Сеня')}`]) {
      const g = await linkPhone(w, h, q, true);
      const r = await g.page.evaluate(() => {
        const k = window.__kus;
        k.pause(true);
        k.startGame();
        k.player.spawnT = 0;
        k.update(1 / 60);
        for (let i = 0; i < 2; i++) k.update(0.3);
        const a = document.getElementById('goal').getBoundingClientRect(),
          b = document.getElementById('board').getBoundingClientRect();
        return {
          text: document.getElementById('goal').textContent,
          gr: a.right,
          gt: a.top,
          gb: a.bottom,
          bl: b.left,
          bt: b.top,
          bb: b.bottom,
          sw: document.getElementById('goal').scrollWidth,
          cw: document.getElementById('goal').clientWidth,
        };
      });
      assert(g.errors.length === 0, g.errors.join(' | '));
      assert(r.text.includes('9999'), `${w}x${h} ${q}: goal "${r.text}"`);
      const hit = r.gr > r.bl && r.gb > r.bt && r.gt < r.bb;
      assert(!hit && r.sw <= r.cw + 1, `${w}x${h} ${q}: goal "${r.text}" ends at ${Math.round(r.gr)}, table starts at ${Math.round(r.bl)}`);
      await g.close();
    }
});

test('daily: a challenge link says why at 844x390, and the menu still fits', async () => {
  const name = encodeURIComponent('Длинноеимяпочт'); // 14 letters, the most a name can have
  for (const returning of [false, true])
    for (const d of [20261125, 20261124, 20261030, 20261230]) {
      const g = await linkPhone(844, 390, `?c=99999&n=${name}&d=${d}`, returning);
      const r = await g.page.evaluate(() => {
        const c = document.querySelector('#menu .card'),
          e = document.getElementById('chal'),
          b = e.getBoundingClientRect();
        return {
          over: c.scrollHeight - c.clientHeight,
          h: b.height,
          sw: e.scrollWidth,
          cw: e.clientWidth,
          text: e.innerText,
          bottom: c.getBoundingClientRect().bottom,
        };
      });
      const tag = `${returning ? 'returning' : 'first visit'}, d=${d}`;
      assert(g.errors.length === 0, g.errors.join(' | '));
      assert(r.h > 0 && r.h < 30, `${tag}: challenge line is ${r.h}px high ("${r.text}")`);
      assert(r.sw <= r.cw + 1, `${tag}: challenge line cut off: "${r.text}"`);
      assert(r.over <= 1 && r.bottom <= 390, `${tag}: menu scrolls by ${r.over}px, card ends at ${r.bottom}`);
      await g.close();
    }
});

// Run stages in free play: a piranha raid, a sweet rain, the Big Cake, the win screen and the second shift.
const STG = `const k = window.__kus, S = () => k.stages.stg;
  const free = () => { k.pause(true); k.setMode('free'); if (k.state !== 'menu') k.toMenu(); k.startGame(); const P = k.player; P.spawnT = 0;
    for (const key in k.CHEAT) k.CHEAT[key] = key === 'speed' ? 1 : false;
    for (const b of k.blobs) if (b !== P) { b.x = 300 + Math.random() * 300; b.y = 3700; b.resetPoints(); } return P; };
  const run = (sec, fn) => { for (let i = 0; i < sec * 60; i++) { if (fn) fn(); k.update(1 / 60); } };
  const kinds = (kd) => k.blobs.filter((b) => b.alive && b.kind === kd && !b.boss).length;`;

test('stages: free play has no cake or piranhas before the events, which come on the thresholds and by the time ceilings', async () => {
  const g = await open({ play: false, returning: true });
  const r = await g.page.evaluate(`(() => { ${STG} const out = {};
    k.pause(true); k.spawnSpecial('cake'); k.spawnSpecial('piranha'); out.menuCake = kinds('cake') > 0;
    let P = free(); k.update(1 / 60); out.atStart = kinds('cake') + kinds('piranha');
    let pirT = null, rainT = null, cakeSeen = 0, pirBefore = 0;
    for (let f = 1; f <= 130 * 60; f++) {
      P.mass = 60; P.pShield = 5; k.update(1 / 60); const c = S().cur;
      if (!c && kinds('piranha') && pirT === null) pirBefore++;
      if (kinds('cake')) cakeSeen++;
      if (c && c.k === 'pir' && pirT === null) { pirT = f / 60; out.pack = c.pack.length; for (const b of c.pack) b.alive = false; }
      if (c && c.k === 'rain' && rainT === null) rainT = f / 60;
    }
    out.pirT = pirT; out.rainT = rainT; out.cakeSeen = cakeSeen; out.pirBefore = pirBefore;
    P = free(); P.mass = 150; run(0.1); out.pirAt150 = S().cur && S().cur.k; out.bigPack = S().cur.pack.length;
    for (const b of S().cur.pack) b.alive = false; run(0.1); out.after = S().cur;
    const pin = (m) => () => { P.mass = m; P.tx = P.x; P.ty = P.y; };
    run(5, pin(605)); out.gap = S().cur; run(3.2, pin(605)); out.rainAt600 = S().cur && S().cur.k;
    run(11.5, pin(605)); out.rainFood = S().cur.n; out.lod = k.lod; out.picks = S().cur.picks; run(4, pin(605)); out.rainOver = S().cur;
    run(8.2, pin(1605)); const c = S().cur; out.boss = !!(c && c.k === 'boss' && c.b.boss && c.b.mass > 1500 * 1.15);
    k.update(0.3); out.line = document.getElementById('stage').textContent;
    run(2, pin(1605)); out.bossCur = S().cur && S().cur.k; out.next = S().i;
    return out; })()`);
  assert(r.menuCake, 'the world behind the menu lost its cake');
  assert(r.atStart === 0, `a free run starts with ${r.atStart} cakes and piranhas on the field`);
  assert(r.pirBefore === 0 && r.cakeSeen === 0, `piranhas before the event: ${r.pirBefore} frames, an ordinary cake: ${r.cakeSeen} frames`);
  assert(r.pirT > 44.9 && r.pirT < 45.2, `the raid must come by 0:45 at mass 60, came at ${r.pirT}`);
  assert(r.pack === 3, `a small player meets a pack of ${r.pack}, expected 3`);
  assert(r.rainT > 119.9 && r.rainT < 120.2, `the rain must come by 2:00, came at ${r.rainT}`);
  assert(r.pirAt150 === 'pir' && r.bigPack === 6, `mass 150 must start the raid (${r.pirAt150}, pack ${r.bigPack})`);
  assert(
    r.after === null && r.gap === null && r.rainAt600 === 'rain',
    `the rain must wait the 8 s gap, then come at 600 (${JSON.stringify([r.after, r.gap, r.rainAt600])})`,
  );
  assert(
    r.rainFood > 60 && r.rainFood <= 300 && r.picks === 3 && r.rainOver === null,
    `the rain dropped ${r.rainFood} sprinkles and ${r.picks} bonuses and must end after 15 s (lod ${r.lod})`,
  );
  assert(r.boss, 'mass 1600 must bring the big cake');
  assert(/торт: \d+%/.test(r.line), `HUD during the fight: "${r.line}"`);
  assert(r.bossCur === 'boss' && r.next === 2, 'no new event may start while the boss is on the field');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('stages: bots cannot bite or swallow the boss, and it bites only the player', async () => {
  const g = await open({ play: false, returning: true });
  const r = await g.page.evaluate(`(() => { ${STG}
    const P = free(); k.place(P, 600, 600, 0); P.mass = 1600; S().i = 2; S().endT = -99; run(0.1);
    const B = S().cur.b; B.spawnT = 0; k.place(B, 2000, 2000, 0); B.ai = null; const m0 = B.mass;
    const bots = [k.spawnBot(3000), k.spawnBot(200)]; let bit = 0;
    for (const o of bots) { o.spawnT = 0; o.ai = null; }
    for (let i = 0; i < 4 * 60; i++) {
      // one bot presses its mouth to the cherry, the other sits right in front of the cake's mouth
      k.place(bots[0], B.x - B.Rs - bots[0].Rs + 6, B.y, 0); k.place(bots[1], B.x + B.Rs + bots[1].Rs - 6, B.y, Math.PI);
      for (const o of bots) { o.biteCd = Math.min(o.biteCd, 0); bit += o.stats.bites; o.stats.bites = 0; }
      k.place(B, 2000, 2000, 0); B.biteCd = Math.min(B.biteCd, 0); k.update(1 / 60);
    }
    return { alive: B.alive, lost: m0 - B.mass, bit, bossBites: B.stats.bites, small: bots[1].alive && bots[1].mass > 150 }; })()`);
  assert(r.alive && r.lost < 5 && r.bit === 0, `bots bit the boss ${r.bit} times, it lost ${r.lost}`);
  assert(r.bossBites === 0 && r.small, 'the boss bit a bot');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('stages: beating the boss ends the run with a record, not with cheats; the second shift keeps mass and place', async () => {
  const g = await open({ play: false, returning: true });
  const r = await g.page.evaluate(`(() => { ${STG}
    const beat = (cheat) => { const P = free(); P.mass = 1600; S().i = 2; S().endT = -99; run(0.1); if (!S().cur) throw new Error('no boss');
      const B = S().cur.b; B.spawnT = 0; B.ai = null;
      if (cheat) k.CHEAT.heal = true;
      B.mass = 60; k.place(B, 2000, 2000, 0); k.place(P, 2000 - B.Rs - P.Rs + 6, 2000, 0); let f = 0;
      while (k.state === 'play' && f++ < 400) { P.tx = B.x; P.ty = B.y; B.tx = B.x; B.ty = B.y; P.biteCd = Math.min(P.biteCd, 0); k.update(1 / 60); }
      k.CHEAT.heal = false; return { P, f }; };
    const out = {};
    let { P, f } = beat(false);
    out.state = k.state; out.frames = f; out.title = document.getElementById('overT').textContent; out.who = document.getElementById('who').textContent;
    out.best = document.getElementById('best').textContent; out.again = document.getElementById('again').textContent;
    out.share = document.getElementById('chalBtn').textContent; out.clear = JSON.parse(localStorage.getItem('kus.clear'));
    out.got = k.run.got; out.over = !document.getElementById('over').classList.contains('hidden');
    const wm = k.stages.stg.wonMass, x = P.x, y = P.y; run(3); out.safe = P.alive && P.safe;
    document.getElementById('again').click();
    out.shift = { state: k.state, same: k.player === P, mass: Math.abs(P.mass - wm) < 0.01, place: Math.round(Math.hypot(P.x - x, P.y - y)),
      lap: k.stages.stg.lap, bites: k.run.bites, sugar: k.run.sugar };
    k.update(1 / 60); k.update(0.3); out.shift.line = document.getElementById('stage').textContent;
    P.alive = false; k.update(1 / 60); // a death in the second shift is an ordinary end of a run
    k.toMenu(); out.menuState = k.state;
    k.setMode('free'); beat(false); document.getElementById('again').click(); k.player.spawnT = 0;
    // die for real: swallowed by a giant
    const G = k.spawnBot(3000); G.spawnT = 0; G.ai = null; k.player.mass = 20;
    k.place(G, 2600, 2600, 0); k.place(k.player, 2600 + G.Rs + k.player.Rs - 6, 2600, 0);
    const Q = k.player;
    // no lucky escape: wait for the death itself (a bot's bite usually lands in a fraction of a second, rarely in several),
    // and read the card only once it is shown (1.1 s after the death): a hidden card keeps the text of the win
    for (let f = 0; Q.alive && f < 20 * 60; f++) { G.biteCd = Math.min(G.biteCd, 0); Q.graceT = 99; G.tx = Q.x; G.ty = Q.y; k.update(1 / 60); }
    const card = document.getElementById('over');
    for (let f = 0; card.classList.contains('hidden') && f < 5 * 60; f++) k.update(1 / 60);
    out.shiftOver = [k.state, document.getElementById('overT').textContent, document.getElementById('who').textContent];
    k.toMenu(); k.setMode('free');
    beat(true); out.cheatState = k.state; out.cheatClear = JSON.parse(localStorage.getItem('kus.clear')); out.cheatBest = document.getElementById('best').textContent;
    return out; })()`);
  assert(r.state === 'won' && r.over && r.title.startsWith('Победа!'), `state ${r.state} after ${r.frames} frames, title "${r.title}"`);
  assert(/^Торт за \d:\d\d$/.test(r.who), `win line "${r.who}"`);
  assert(
    r.clear && r.clear.wins === 1 && r.clear.best > 0 && r.best.startsWith('Новый рекорд прохождения'),
    `kus.clear ${JSON.stringify(r.clear)}, "${r.best}"`,
  );
  assert(r.again === 'Вторая смена' && r.share === 'Поделиться', `buttons "${r.again}", "${r.share}"`);
  assert(r.got >= 75, `a win must pay the boss sugar, paid ${r.got}`);
  assert(r.safe, 'the winner must be safe behind the win screen');
  const s = r.shift;
  assert(s.state === 'play' && s.same && s.mass && s.place < 30 && s.lap === 1, `second shift: ${JSON.stringify(s)}`);
  assert(s.bites === 0 && s.sugar === 0 && s.line.startsWith('смена 2'), `the second shift must count afresh: ${JSON.stringify(s)}`);
  assert(
    r.shiftOver[0] === 'dead' && r.shiftOver[1] === 'Тебя доели' && r.shiftOver[2].startsWith('Смена 2'),
    `second-shift death screen: ${r.shiftOver}`,
  );
  assert(
    r.cheatState === 'won' && r.cheatClear.wins === 2 && r.cheatBest.includes('С читами'),
    `a cheated win counted: ${JSON.stringify(r.cheatClear)}, "${r.cheatBest}"`,
  );
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('stages: the 3-minute mode and the candy of the day keep their cake and piranhas', async () => {
  const g = await open({ play: false, returning: true });
  const r = await g.page.evaluate(`(() => { ${STG} const out = {};
    for (const m of ['t3', 'daily']) {
      if (m === 'daily') k.daily.force('cake');
      k.setMode(m); if (k.state !== 'menu') k.toMenu(); k.startGame(); const P = k.player; P.spawnT = 0; P.ai = null;
      let cake = 0, pir = 0;
      for (let i = 0; i < 70 * 60; i++) { P.mass = 200; P.tx = P.x; P.ty = P.y; k.update(1 / 60); if (kinds('cake')) cake++; if (kinds('piranha')) pir++; }
      out[m] = { stg: k.stages.stg, cake, pir, line: document.getElementById('stage').textContent };
    }
    return out; })()`);
  for (const m of ['t3', 'daily']) {
    const x = r[m];
    assert(x.stg === null && x.line === '', `${m}: stages are on (${x.line})`);
    assert(x.cake > 0 && x.pir > 0, `${m}: cake ${x.cake} frames, piranhas ${x.pir} frames in 70 s`);
  }
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('stages: the HUD stage line stays clear of the table on phones, next to a challenge goal', async () => {
  for (const [w, h] of [
    [360, 640],
    [844, 390],
  ]) {
    const g = await linkPhone(w, h, `?c=9999&n=${encodeURIComponent('Сеня')}`, true);
    const r = await g.page.evaluate(() => {
      const k = window.__kus,
        out = [];
      k.pause(true);
      k.setMode('free');
      k.startGame();
      k.player.spawnT = 0;
      const box = (id) => document.getElementById(id).getBoundingClientRect();
      for (const m of [60, 1000, 1700]) {
        if (m === 1700) k.stages.stg.i = 2;
        k.player.mass = m;
        k.update(1 / 60);
        k.update(0.3);
        const a = box('stage'),
          b = box('board'),
          e = document.getElementById('stage');
        out.push({
          text: e.textContent,
          hit: a.right > b.left && a.bottom > b.top && a.top < b.bottom,
          cut: e.scrollWidth > e.clientWidth + 1,
          goal: document.getElementById('goal').textContent,
        });
      }
      return out;
    });
    for (const x of r) {
      assert(x.text && x.goal.includes('9999'), `${w}x${h}: stage "${x.text}", goal "${x.goal}"`);
      assert(!x.hit && !x.cut, `${w}x${h}: stage line "${x.text}" runs under the table or is cut`);
    }
    assert(g.errors.length === 0, g.errors.join(' | '));
    await g.close();
  }
});

test('hud: cream pills fit phones; the stage pill fills and its jaws chomp when the event starts', async () => {
  for (const opt of [
    { width: 360, height: 640, touch: true, dpr: 2 },
    { width: 844, height: 390, touch: true, dpr: 2 },
  ]) {
    const g = await open({ ...opt, play: false, returning: true });
    const r = await g.page.evaluate(`(() => { ${STG} const out = {};
      const P = free(); P.stats.maxMass = 135; P.mass = 135; P.pMagnet = 4.9; run(1 / 30);
      const st = document.getElementById('stage'), fx = document.getElementById('fx');
      out.hungry = st.classList.contains('hungry'); out.chomp0 = st.classList.contains('chomp');
      out.p = parseFloat(st.style.getPropertyValue('--p')); out.ic = !!st.querySelector('svg.ic'); out.kind = k.stages.kind();
      document.getElementById('feed').innerHTML = ''; // hints are wider than the column by design: measure the pills
      const sr = document.getElementById('score').getBoundingClientRect(), br = document.getElementById('board').getBoundingClientRect();
      out.right = sr.right; out.hit = sr.right > br.left && sr.bottom > br.top && sr.top < br.bottom;
      const coins = fx.querySelectorAll('.coin[data-k=magnet]');
      out.coins = coins.length; out.t = coins.length ? parseFloat(coins[0].style.getPropertyValue('--t')) : -1; out.fxText = fx.textContent.trim();
      out.streakChip = fx.textContent.includes('Серия');
      P.stats.maxMass = 150; let f = 0; for (; f < 4 && !(S().cur && S().cur.k === 'pir'); f++) run(1 / 60);
      out.started = !!(S().cur && S().cur.k === 'pir');
      let late = 0; for (; late < 3 && !st.classList.contains('chomp'); late++) run(1 / 60);
      out.late = late; out.chomp = st.classList.contains('chomp'); out.hungry2 = st.classList.contains('hungry');
      run(1); out.chomp1 = st.classList.contains('chomp');
      return out; })()`);
    const w = `${opt.width}x${opt.height}`;
    assert(r.hungry && !r.chomp0 && r.kind === 'pir', `${w}: waiting at p~0.9 must be hungry, not chomping (${JSON.stringify(r)})`);
    assert(Math.abs(r.p - 0.9) <= 0.02 && r.ic, `${w}: --p ${r.p}, icon ${r.ic}`);
    assert(r.right <= 216 && !r.hit, `${w}: the HUD column ends at ${r.right}px or runs into the table`);
    assert(r.started && r.late <= 2 && r.chomp && !r.hungry2, `${w}: the jaws must chomp within 2 frames of the raid start (${JSON.stringify(r)})`);
    assert(!r.chomp1, `${w}: the chomp must stop after about 0.64 s`);
    assert(
      r.coins === 1 && r.t > 0.55 && r.t < 0.65 && r.fxText === '5 с' && !r.streakChip,
      `${w}: buff coin ${JSON.stringify([r.coins, r.t, r.fxText])}`,
    );
    assert(g.errors.length === 0, g.errors.join(' | '));
    await g.close();
  }
});

// smarter bots: a scene with the player and a few bots, everything else parked far away
const BOTS = `const k = window.__kus, P = k.player; k.pause(true);
  for (const key in k.CHEAT) k.CHEAT[key] = key === 'speed' ? 1 : false;
  for (const b of k.blobs) if (b !== P) { b.x = 300 + Math.random() * 300; b.y = 3700; b.resetPoints(); }
  P.spawnT = 0; P.ai = null;
  const bot = (m, x, y, face) => { const b = k.spawnBot(m); b.spawnT = 0; k.place(b, x, y, face); b.ai.think = 0; return b; };
  const run = (s, each) => { for (let i = 0; i < s * 60; i++) { if (each) each(i); k.update(1 / 60); } };
  const clear = (keep) => { for (const o of k.blobs) if (o !== P && keep.indexOf(o) < 0 && Math.hypot(o.x - 2000, o.y - 2000) < 900) o.alive = false; }; // the live field keeps sending bots in`;

test('bots: a bot does not run from a far player who only turns to it, but runs from a near one', async () => {
  const g = await open();
  const r = await g.page.evaluate(`(() => { ${BOTS}
    const out = {};
    for (const d of ['hard', 'extreme']) {
      k.setDiff(d); P.mass = 60; k.place(P, 2000, 2000, 0); P.dashCd = 0;
      const b = bot(20, 2000 + P.Rs + 25 + 330, 2000, Math.PI); let fled = 0;
      run(1.5, () => { clear([b]); k.place(P, 2000, 2000, 0); k.place(b, 2000 + P.Rs + 25 + 330, 2000, Math.PI); if (b.ai.mode === 'flee') fled++; });
      const far = fled; fled = 0;
      k.place(b, 2000 + P.Rs + b.Rs + 70, 2000, Math.PI); b.ai.think = 0;
      run(0.6, () => { clear([b]); k.place(P, 2000, 2000, 0); P.dashCd = 0; if (b.ai.mode === 'flee') fled++; });
      out[d] = { far, near: fled }; b.alive = false;
    }
    return out; })()`);
  for (const d in r) assert(r[d].far === 0 && r[d].near > 0, `${d}: fled ${r[d].far} frames from a far glance, ${r[d].near} from a near threat`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('bots: on extreme a bot uses its tongue on prey in reach', async () => {
  const g = await open();
  const r = await g.page.evaluate(`(() => { ${BOTS}
    k.setDiff('extreme'); k.place(P, 3500, 400, 0); let n = 0;
    for (let t = 0; t < 6 && !n; t++) {
      const h = bot(120, 2000, 2000, 0), p = bot(15, 2000 + 61 + 22 + 190, 2000, 0), t0 = k.botStat.tongue;
      run(3, () => { p.vx = p.vy = 0; p.x = 2000 + 61 + 22 + 190; p.y = 2000; });
      n = k.botStat.tongue - t0; h.alive = p.alive = false;
    }
    return n; })()`);
  assert(r > 0, 'no tongue at prey in reach');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('bots: a small bot bites the back of a busy big player and backs off', async () => {
  const g = await open();
  const r = await g.page.evaluate(`(() => { ${BOTS}
    // botStat.sneak counts every bot on the field, so this bot's own bite is told by its back-off timer, set only by that bite;
    // bots that wander in are removed, or they bite the player and chase this bot away
    k.setDiff('extreme'); P.mass = 400; let bit = 0, away = 0, b = null;
    for (let t = 0; t < 16 && !bit; t++) {
      if (b) b.alive = false;
      b = bot(30, 2000 - P.Rs - 140, 2000, 0);
      run(6, () => { k.place(P, 2000, 2000, 0); P.chewT = 1; P.biteCd = 1; clear([b]); if (b.ai.retT > 0) bit = 1; if (bit && b.ai.mode === 'flee') away++; });
    }
    return { bites: bit, away }; })()`);
  assert(r.bites > 0, 'no bite on the back of a busy big one');
  assert(r.away > 0, 'the small bot did not back off after its bite');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('bots: a pack gathers on a big one, goes in from several sides and breaks up', async () => {
  const g = await open();
  const r = await g.page.evaluate(`(() => { ${BOTS}
    k.setDiff('extreme'); const t0 = k.botStat.packs; let formed = 0, size = 0, ended = 0;
    for (let t = 0; t < 4 && k.botStat.packs === t0; t++) {
      // members may still run off from a giant that turns their way, so try a few fresh groups
      for (const b of k.blobs) if (b !== P && b.ai) b.alive = false;
      P.mass = 500; k.place(P, 2000, 2000, 0); P.pShield = 99;
      const four = [0, 1, 2, 3].map((i) => bot(70, 2000 + Math.cos(i * 1.6) * 420, 2000 + Math.sin(i * 1.6) * 420, 0));
      run(1, () => { clear(four); k.place(P, 2000, 2000, 0); });
      P.pShield = 0;
      run(20, () => { clear(four); k.place(P, 2000, 2000, 0); P.biteCd = 1; if (k.packs.length) { formed = 1; size = Math.max(size, k.packs[0].m.length); } else if (formed) ended = 1; });
    }
    return { formed, size, went: k.botStat.packs - t0, ended }; })()`);
  assert(r.formed && r.size >= 2 && r.size <= 4, `pack ${JSON.stringify(r)}`);
  assert(r.went > 0, 'the pack never went in');
  assert(r.ended, 'the pack never broke up');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('bots: easy and normal keep the old script, no traits, packs, sneaks or licks', async () => {
  const g = await open();
  const r = await g.page.evaluate(`(() => { ${BOTS}
    const s0 = JSON.stringify(k.botStat), out = {};
    for (const d of ['easy', 'normal']) {
      k.setDiff(d); P.mass = 300; k.place(P, 2000, 2000, 0);
      for (let i = 0; i < 4; i++) bot(40, 2000 + Math.cos(i * 1.6) * 350, 2000 + Math.sin(i * 1.6) * 350, 0);
      run(8, () => k.place(P, 2000, 2000, 0));
      out[d] = k.blobs.filter((b) => b.ai && b.ai.trait).length + k.packs.length;
    }
    return { out, same: JSON.stringify(k.botStat) === s0 }; })()`);
  assert(r.same && r.out.easy === 0 && r.out.normal === 0, JSON.stringify(r));
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('settings: difficulty and graphics apply and are remembered', async () => {
  const g = await open({ play: false, returning: true });
  const mass = {};
  for (const d of ['easy', 'hard', 'extreme', 'normal']) {
    if (!(await g.page.isVisible('#diffSeg'))) await g.page.click('#secMode .sh'); // difficulty lives in the folded Mode section
    await g.page.click(`#diffSeg button[data-v=${d}]`);
    await g.page.click('#play');
    // read it on the first frames: hard and extreme start only 2 apart, and a sprinkle eaten later would blur that
    mass[d] = await g.page.evaluate(
      () =>
        new Promise((res) =>
          (function f() {
            const k = window.__kus;
            if (k.state === 'play' && k.player) res(k.player.mass);
            else requestAnimationFrame(f);
          })(),
        ),
    );
    await g.page.waitForTimeout(120);
    assert((await g.page.evaluate(() => localStorage.getItem('kus.diff'))) === d, 'difficulty not saved');
    await g.page.keyboard.press('Escape');
    await g.page.waitForTimeout(120);
    await g.page.click('#pMenu');
    await g.page.waitForTimeout(120);
  }
  assert(
    mass.easy > mass.normal && mass.normal > mass.hard && mass.hard > mass.extreme,
    `start mass must fall with difficulty: ${JSON.stringify(mass)}`,
  );
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
    window.__kus.pause(true); // the live game's own bites would play takes in the waits below and be counted
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
    // every embedded take must decode; then each effect plays from its takes and, with them switched off, from the synth
    const failed = await S.ready;
    const takes = {};
    for (const k in S.buf) takes[k] = S.buf[k].b.length;
    const missing = Object.keys(window.__kus.SFX_DATA).filter((k) => takes[k] !== window.__kus.SFX_DATA[k].r.length);
    let played = 0,
      withTakes = 0;
    const orig = S.play;
    S.play = function (...a) {
      const ok = orig.apply(this, a);
      if (ok) played++;
      return ok;
    };
    for (const useBuf of [true, false]) {
      S.useBuf = useBuf;
      for (const [m, a] of calls) {
        S.lastPop = S.lastBoing = -9;
        try {
          S.at(window.__kus.cam.x + 300)[m](...a);
        } catch (e) {
          bad.push(`${m} (${useBuf ? 'takes' : 'synth'}): ${e.message}`);
        }
      }
      if (useBuf) withTakes = played;
      await new Promise((res) => setTimeout(res, 500));
    }
    S.play = orig;
    S.useBuf = true;
    const expected = calls.filter(([m]) => window.__kus.SFX_DATA[m]).length;
    return { running: !!S.ok(), bad, failed, missing, withTakes, expected, afterSynth: played - withTakes, ms: S.decodeMs };
  });
  assert(r.running, 'audio context is not running, so nothing was actually tested');
  assert(r.failed === 0 && r.missing.length === 0, `takes that did not decode: ${r.failed}; events missing takes: ${r.missing.join(', ')}`);
  assert(r.withTakes === r.expected, `with takes, ${r.withTakes} of ${r.expected} calls played a take`);
  assert(r.afterSynth === 0, 'with takes switched off, a take was still played');
  assert(r.bad.length === 0, r.bad.join(' | '));
  console.log(`    takes decoded in ${r.ms.toFixed(0)} ms`);
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
