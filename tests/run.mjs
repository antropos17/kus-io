// Smoke and regression tests. They drive the built index.html in headless Chrome through the debug hooks in window.__kus.
//   npm test                 build, then run everything
//   node tests/run.mjs soak  run only the tests whose name contains "soak"
// Uses the Chrome already installed on the machine. Set CHROME=/path/to/chrome to point at another binary.
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { truePng, ico, rgbaOf } from '../tools/png.mjs';
import { checkFace } from '../tools/fonts.mjs';

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
// locale: the browser language; Russian by default, since headless Chrome is English and the game picks its language from it.
// init: a script run before the page's own (to fake a wrapper, for example); origin: serve index.html from that address
// instead of file:// (an app wrapper serves it from https://localhost).
async function open({
  width = 1200,
  height = 720,
  touch = false,
  dpr = 1,
  play = true,
  returning = false,
  locale = 'ru-RU',
  init = '',
  origin = '',
  reducedMotion = 'no-preference',
} = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    hasTouch: touch,
    isMobile: touch,
    locale,
    reducedMotion,
  });
  const page = await ctx.newPage();
  if (returning) await page.addInitScript(() => localStorage.getItem('kus.best') === null && localStorage.setItem('kus.best', '0'));
  if (init) await page.addInitScript(init);
  if (origin) await ctx.route(origin + '/**', (r) => r.fulfill({ path: join(root, 'index.html'), contentType: 'text/html' }));
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(origin ? origin + '/' : URL);
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
  for (const locale of ['ru-RU', 'en-US'])
    try {
      const g = await open({ locale, width: 360, height: 640, touch: true, dpr: 2, play: false });
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
      assert(
        p.state === 'play' && p.name === (locale === 'en-US' ? 'Kusaka' : 'Кусака'),
        `Play with an empty name: state ${p.state}, name ${p.name}`,
      );
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
    } catch (e) {
      throw new Error(locale + ': ' + e.message);
    }
});

test('menu: sections and Play fit the screen, nothing overlaps, targets are 44px; an opened section scrolls into view', async () => {
  for (const locale of ['ru-RU', 'en-US'])
    try {
      for (const [w, h, touch] of [
        [1280, 720, false],
        [360, 640, true],
        [844, 390, true],
      ]) {
        const g = await open({ locale, width: w, height: h, touch, dpr: 2, play: false, returning: true });
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
    } catch (e) {
      throw new Error(locale + ': ' + e.message);
    }
});

test('phone: play controls stay inside the screen', async () => {
  for (const locale of ['ru-RU', 'en-US'])
    try {
      for (const [width, height] of [
        [390, 844],
        [360, 640],
        [844, 390],
      ]) {
        const g = await open({ locale, width, height, touch: true, dpr: 2 });
        const r = await g.page.evaluate(() =>
          ['dash', 'dodge'].map((id) => {
            const b = document.getElementById(id).getBoundingClientRect();
            return b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight && b.width > 30;
          }),
        );
        assert(r.every(Boolean), `bite/tongue buttons off screen at ${width}x${height}`);
        await g.close();
      }
    } catch (e) {
      throw new Error(locale + ': ' + e.message);
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

test('streak: label, fuse, stamps and the summary when it lapses', async () => {
  const g = await open();
  const r = await g.page.evaluate(`(() => { ${QUIET} const out = {};
    P.mass = 120; for (let i = 0; i < 40; i++) k.update(1/60);
    const V = k.spawnBot(400); V.ai = null; V.spawnT = 0; for (let i = 0; i < 30; i++) k.update(1/60);
    P.combo = 0; P.comboT = 0; k.stamps.length = 0;
    const dash = document.querySelector('#dash'), sum = document.querySelector('#streakSum'), chip = document.querySelector('#sugar .mult');
    const words = () => k.stamps.map((s) => s.txt); out.maxStamps = 0;
    // one bite on V; hold: keep comboT at that value until the bite lands
    const bite = (hold) => { k.place(V, 2000, 1500, 0); k.place(P, 2000 - V.Rs - P.Rs + 4, 1500, 0); V.wounds.length = 0; V.mass = 400; P.biteCd = 0;
      const n0 = P.stats.bites; let f = 0;
      while (f < 90 && P.stats.bites === n0) { k.pickups.length = 0; if (hold) P.comboT = hold; P.tx = V.x; P.ty = V.y; V.tx = V.x; V.ty = V.y; V.biteCd = 9; k.update(1/60); out.maxStamps = Math.max(out.maxStamps, k.stamps.length); f++; }
      P.biteCd = 999; V.biteCd = 999; /* only the scripted bites land */ };
    for (let n = 1; n <= 5; n++) { bite(0);
      if (n === 2) out.word2 = words();
      if (n === 3) out.word3 = words();
      if (n === 5) { out.word5 = words(); out.f = parseFloat(dash.style.getPropertyValue('--f')); out.victim = k.streak.lastVictim === V;
        out.wound = Math.hypot(k.streak.lastWound.x - V.x, k.streak.lastWound.y - V.y) < V.Rs * 1.6;
        out.fuse = dash.classList.contains('fuse') && dash.classList.contains('s3'); out.rush = document.querySelector('#vig').classList.contains('rush');
        out.chip = chip.textContent; out.chipOn = chip.classList.contains('on'); out.air = k.hud.air > 0; out.start = k.streak.start; out.sugar = k.run.sugar; } }
    for (let i = 0; i < 20; i++) { k.update(1/60); k.render(); }
    out.lowEarly = dash.classList.contains('low'); // 0.3 s in: the window is far from shutting
    P.comboT = 0.7; k.update(1/60); k.render(); // the last 0.8 s: the fuse blinks and the button says ещё кусь!
    out.low = dash.classList.contains('low'); out.more = getComputedStyle(dash, '::after').content;
    bite(0.3); out.close = words(); out.combo = P.combo; P.biteCd = 999; V.biteCd = 999; // no seventh bite: the streak must lapse
    for (let i = 0; i < 268; i++) { k.update(1/60); if (i % 30 === 0) k.render(); }
    out.sum = sum.textContent; out.sumOn = sum.classList.contains('on') && getComputedStyle(sum).visibility === 'visible';
    out.fx = document.getElementById('fx').textContent;
    out.chipGone = !chip.classList.contains('on'); out.fuseGone = !dash.classList.contains('fuse'); out.rushGone = !document.querySelector('#vig').classList.contains('rush');
    for (let i = 0; i < 150; i++) k.update(1/60);
    out.sumGone = !sum.classList.contains('on'); return out; })()`);
  assert(r.word2.join() === 'Кусь-кусь!', `bite 2 must stamp Кусь-кусь! alone: ${r.word2}`);
  assert(r.word3.join() === 'Ням!', `bite 3 must stamp Ням! alone: ${r.word3}`);
  assert(r.word5.join() === 'Хрум-хрум!', `bite 5 must stamp Хрум-хрум! alone: ${r.word5}`);
  assert(r.maxStamps <= 1, `only one stamp may be visible at a time, saw ${r.maxStamps}`);
  assert(!r.lowEarly && r.low && r.more.includes('ещё кусь!'), `the last 0.8 s must show low + «ещё кусь!» (${r.lowEarly}, ${r.low}, ${r.more})`);
  assert(r.victim && r.wound, `the last victim and wound must be remembered (${r.victim}, ${r.wound})`);
  assert(r.f >= 0.9 && r.f <= 1, `the fuse ring on the bite button must be full after a bite, --f is ${r.f}`);
  assert(r.fuse && r.rush, 'step 3 must light the button fuse with sprinkles and the sugar rush edge');
  assert(r.chip === '×5' && r.chipOn, `the sugar chip must read ×5, got "${r.chip}"`);
  assert(r.air, 'a streak bite must send cubes to the sugar pill');
  assert(r.combo === 6 && r.close.join() === 'На волоске!', `a bite in the last 0.45 s must stamp На волоске! (combo ${r.combo}, ${r.close})`);
  assert(/^Серия ×6 · \+\d+ сахара$/.test(r.sum) && r.sumOn, `the summary must show when the streak lapses: "${r.sum}" ${r.sumOn}`);
  assert(!r.fx.includes('Серия'), 'the streak must not be a buff coin');
  assert(r.chipGone && r.fuseGone && r.rushGone, 'chip, fuse and rush must go when the streak lapses');
  assert(r.sumGone, 'the summary must slide away after about 2 s');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

// After a ×5 streak lapses in a clean run, a wrapped candy pops out of the last wound and runs; caught, it pays WRAP.amt[final].
test('wrapper: a ×5 streak in a clean run drops a wrapper that pays when caught, nothing with cheats', async () => {
  const g = await open();
  await g.page.mouse.move(600, 360); // the pointer in the middle of the screen: the player stands still
  const r = await g.page.evaluate(`(() => { ${QUIET} const out = {}; k.M.act.length = 0; /* no mission prize sugar */
    P.mass = 120; for (let i = 0; i < 40; i++) k.update(1/60);
    const V = k.spawnBot(400); V.ai = null; V.spawnT = 0; for (let i = 0; i < 30; i++) k.update(1/60);
    // between the scripted bites nothing else earns sugar or bites; bots the live field sends in (a hedgehog, say) are removed, or they bite and shove V
    const clear = () => { for (const o of k.blobs) if (o !== P && o !== V && o.alive && Math.hypot(o.x - P.x, o.y - P.y) < 900) o.alive = false; };
    const tick = (n) => { for (let i = 0; i < n; i++) { clear(); k.food.length = 0; k.pickups.length = 0; P.biteCd = 999; V.biteCd = 999; k.update(1/60); } };
    // P stays at 120: fifteen bites would grow it past 400 and it would swallow V whole
    const bite = () => { P.mass = 120; k.place(V, 2000, 1500, 0); k.place(P, 2000 - V.Rs - P.Rs + 4, 1500, 0); V.wounds.length = 0; V.mass = 400; P.biteCd = 0;
      const n0 = P.stats.bites; let f = 0;
      // a slow bite (a stage event in the way) must not let the streak lapse: hold the window open until it lands
      while (f < 180 && P.stats.bites === n0) { if (P.combo > 0) P.comboT = Math.max(P.comboT, 1); P.tx = V.x; P.ty = V.y; V.tx = V.x; V.ty = V.y; V.biteCd = 9; clear(); k.update(1/60); f++; }
      P.biteCd = 999; V.biteCd = 999; };
    const streak5 = () => { P.combo = 0; P.comboT = 0; for (let n = 0; n < 5; n++) bite(); return P.combo; };
    out.combo = streak5();
    let born = -1, ran = -1;
    for (let f = 0; f < 288; f++) { tick(1); if (k.wrap && born < 0) born = f; if (k.wrap && k.wrap.state === 'run' && ran < 0) ran = f; }
    out.born = born; out.ran = ran; out.alive = !!k.wrap;
    // a second ×5 streak lapses while the first wrapper still runs: the same single wrapper
    const w1 = k.wrap; if (w1) { w1.life = 99; w1.x = 3500; w1.y = 3300; }
    const sumEl = document.querySelector('#streakSum'); sumEl.textContent = ''; // only this lapse can write the summary now
    out.combo2 = streak5(); tick(258); out.same = !!w1 && k.wrap === w1;
    out.lapsed2 = P.comboT <= 0 && /^Серия ×5 · \\+\\d+ сахара$/.test(sumEl.textContent); out.sum2 = sumEl.textContent;
    // catch it
    const w = k.wrap; if (w) k.place(P, w.x, w.y, 0);
    const s0 = k.run.sugar; let caught = -1;
    for (let f = 0; f < 2; f++) { tick(1); if (k.reveal && !k.wrap && caught < 0) caught = f; }
    out.caught = caught; out.f = k.reveal ? k.reveal.final : -1;
    tick(185); out.gain = k.run.sugar - s0; out.amt = k.WRAP.amt[out.f]; out.sum = document.querySelector('#streakSum').textContent; out.revealGone = k.reveal === null;
    // a cheat on: the next ×5 streak lapses without a wrapper
    k.CHEAT.god = true; tick(2); out.combo3 = streak5(); let any = false;
    for (let f = 0; f < 288; f++) { tick(1); if (k.wrap || k.reveal) any = true; }
    out.cheatWrap = any; out.cheated = P.cheated; return out; })()`);
  assert(r.combo === 5 && r.combo2 === 5 && r.combo3 === 5, `the scripted streaks must reach ×5 (${r.combo}, ${r.combo2}, ${r.combo3})`);
  assert(r.born >= 0 && r.alive, `a wrapper must appear when a ×5 streak lapses and still run after 3 s (born ${r.born}, alive ${r.alive})`);
  assert(r.ran >= r.born && r.ran - r.born <= 30, `the wrapper must start running within 0.5 s (born ${r.born}, ran ${r.ran})`);
  assert(r.lapsed2, `the second ×5 streak must have lapsed (summary "${r.sum2}")`);
  assert(r.same, 'a second lapse while a wrapper runs must not make another one');
  assert(r.caught >= 0, 'touching the wrapper must catch it within 2 frames (reveal on, wrapper gone)');
  assert(r.f >= 0 && Math.abs(r.gain - r.amt) < 1e-6, `a caught wrapper must pay exactly WRAP.amt[${r.f}] = ${r.amt}, paid ${r.gain}`);
  assert(/^Фантик пойман · \+\d+ сахара$/.test(r.sum), `the summary pill must say the wrapper was caught: "${r.sum}"`);
  assert(r.revealGone, 'the reveal must be over 3 s after the catch');
  assert(r.cheated && !r.cheatWrap, `no wrapper in a run with cheats (cheated ${r.cheated}, wrapper ${r.cheatWrap})`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('wrapper: an uncaught one leaves after 5 s and pays nothing; death and the menu clear it', async () => {
  const g = await open();
  await g.page.mouse.move(600, 360);
  const r = await g.page.evaluate(`(() => { ${QUIET} const out = {}; k.M.act.length = 0;
    const V = k.spawnBot(400); V.ai = null; V.spawnT = 0; k.place(V, 1000, 1000, 0); k.place(P, 3000, 3000, 0);
    const tick = (n) => { for (let i = 0; i < n; i++) { const Q = k.player; k.food.length = 0; k.pickups.length = 0; if (Q) Q.biteCd = 999; V.biteCd = 999; k.update(1/60); } };
    // a running wrapper and a reveal under way at once
    const both = () => { const Q = k.player; k.spawnWrap(V, Q.x + Q.Rs + 10, Q.y, 0); tick(24); const w = k.wrap; if (w) k.place(Q, w.x, w.y, 0); tick(2);
      k.spawnWrap(V, Q.x + Q.Rs + 10, Q.y, 1); return !!k.wrap && !!k.reveal; };
    tick(10); const s0 = k.run.sugar;
    k.spawnWrap(V, V.x + V.Rs, V.y, 0); out.spawned = !!k.wrap; let rev = false;
    for (let f = 0; f < 336; f++) { tick(1); if (k.reveal) rev = true; }
    out.left = k.wrap === null; out.rev = rev; out.gain = k.run.sugar - s0;
    out.both1 = both(); P.alive = false; tick(120);
    out.deadClear = k.wrap === null && k.reveal === null; out.deadGain = k.run.sugar - s0;
    k.toMenu(); k.startGame(); k.player.spawnT = 0; tick(10);
    out.both2 = both(); k.toMenu(); out.menuClear = k.wrap === null && k.reveal === null;
    k.startGame(); out.startClear = k.wrap === null && k.reveal === null; tick(60); out.after = k.wrap === null && k.reveal === null; return out; })()`);
  assert(r.spawned, 'spawnWrap must make a wrapper');
  assert(
    r.left && !r.rev && r.gain === 0,
    `an uncaught wrapper must leave within 5.6 s and pay nothing (gone ${r.left}, reveal ${r.rev}, +${r.gain})`,
  );
  assert(r.both1 && r.both2, `the setup needs a wrapper and a reveal at once (${r.both1}, ${r.both2})`);
  assert(r.deadClear && r.deadGain === 0, `the player's death must clear the wrapper and the reveal unpaid (${r.deadClear}, +${r.deadGain})`);
  assert(r.menuClear && r.startClear && r.after, `the menu and a new run must clear them (${r.menuClear}, ${r.startClear}, ${r.after})`);
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
    const cheap = k.cheapestUnowned();
    out.nearWant = k.itemName(cheap.slot, cheap.id);
    k.setSugar(10);
    const lock = () => document.querySelector('#skins button.lock');
    const id = lock().dataset.s,
      price = k.priceOf('skin', id);
    lock().click();
    out.poor = k.sugar === 10 && !k.owns('skin', id);
    k.setSugar(price + 5000);
    document.querySelector(`#skins [data-s="${id}"]`).click();
    out.asked = k.sugar === price + 5000 && !!document.querySelector(`#skins [data-s="${id}"] .pz.ask`);
    document.querySelector(`#skins [data-s="${id}"]`).click();
    out.bought = k.owns('skin', id) && k.sugar === 5000;
    out.saved = localStorage.getItem('kus.sugar');
    return out;
  });
  assert(r.during === 1 + 4 + 6, `sugar during the run should be 11 (bite, bite ×4 streak, kill), got ${r.during}`);
  assert(r.hud === 11, `HUD shows "${r.hud}"`);
  assert(r.over && r.got >= 11 && r.bank === r.got, `end of run must pay ${r.got} into the bank, bank is ${r.bank}`);
  assert(r.prizes.length === 3 && r.prizes.includes(r.chestWon) && r.chestWon > 0, `chest prizes ${r.prizes}, won ${r.chestWon}`);
  assert(r.twice, 'the chest paid twice');
  assert(r.near.includes(r.nearWant), `no "so close" line naming "${r.nearWant}": "${r.near}"`);
  assert(r.poor, 'a pattern was sold without enough sugar');
  assert(r.asked, 'the first tap must only ask');
  assert(r.bought && r.saved === '5000', 'the second tap must buy the pattern and save the bank');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

const CHEST_END = `const k = window.__kus; k.setSugar(0); k.pause(true); k.setMode('t3'); k.startGame(); k.player.spawnT = 0; k.run.sugar = 200; k.setTimeLeft(0.001); for (let i = 0; i < 90; i++) k.update(1 / 60);`;

test('chest: one paid reroll, the price is three times the base, never twice', async () => {
  const g = await open({ play: false });
  const r = await g.page.evaluate(`(() => { ${CHEST_END}
    const out = {}, again = document.getElementById('chestAgain'), odds = document.getElementById('chestOdds'), row = document.getElementById('chestRow');
    out.base = k.run.chestBase; out.hiddenBefore = again.classList.contains('hidden') && odds.classList.contains('hidden');
    row.children[0].click();
    out.shown = !again.classList.contains('hidden') && !odds.classList.contains('hidden');
    out.label = again.textContent; out.oddsT = odds.textContent;
    k.setSugar(1000);
    again.click(); out.ask = again.textContent; out.afterAsk = k.sugar;
    again.click(); again.click();
    out.paid = 1000 - k.sugar; out.reset = [...row.children].every((b) => b.textContent === '?' && !b.disabled);
    out.hiddenAfter = again.classList.contains('hidden') && odds.classList.contains('hidden');
    const before = k.sugar; row.children[2].click(); out.won = k.sugar - before; out.prizes = [...row.children].map((b) => +b.textContent);
    again.click(); again.click(); out.noThird = 1000 - k.sugar === out.paid - out.won;
    return out; })()`);
  assert(r.base >= 3 && r.hiddenBefore, `base ${r.base}, hidden before the pick ${r.hiddenBefore}`);
  assert(
    r.shown && r.label === `Ещё раз — ${3 * r.base}` && r.oddsT === 'Каждая карта — 1 из 3: ×1, ×2, ×5',
    `label "${r.label}", odds "${r.oddsT}"`,
  );
  assert(r.ask === `Точно? −${3 * r.base} сахара` && r.afterAsk === 1000, `first tap "${r.ask}", bank ${r.afterAsk}`);
  assert(r.paid === 3 * r.base, `paid ${r.paid}, want ${3 * r.base}`);
  assert(r.reset && r.hiddenAfter, 'cards must be "?" again and the button hidden');
  assert(r.prizes.includes(r.won) && r.won > 0 && r.noThird, `second pick won ${r.won} of ${r.prizes}, third reroll ${r.noThird}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('chest: the reroll is hidden when the bank is short of its price', async () => {
  const g = await open({ play: false });
  // Math.random is pinned so the shuffle keeps the order [base, 2*base, 5*base]: card 0 pays base, card 1 pays 2*base
  const run = (bank0, card) =>
    g.page.evaluate(`(() => { ${CHEST_END}
    const base = k.run.chestBase, rnd = Math.random; Math.random = () => 0.999;
    k.setSugar(${bank0} * base);
    document.getElementById('chestRow').children[${card}].click();
    Math.random = rnd;
    return { base, bank: k.sugar, hidden: document.getElementById('chestAgain').classList.contains('hidden') }; })()`);
  const lo = await run(0, 0),
    hi = await run(1, 1);
  assert(lo.bank === lo.base && lo.hidden, `bank ${lo.bank} is below the price ${3 * lo.base}: the button must be hidden (hidden ${lo.hidden})`);
  assert(hi.bank === 3 * hi.base && !hi.hidden, `bank ${hi.bank} equals the price ${3 * hi.base}: the button must show (hidden ${hi.hidden})`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

for (const [w, h] of [
  [360, 640],
  [844, 390],
])
  for (const locale of ['ru-RU', 'en-US'])
    test(`chest: the reroll button and odds fit the end card at ${w}x${h} ${locale}`, async () => {
      const g = await open({ play: false, width: w, height: h, touch: true, dpr: 2, locale });
      const r = await g.page.evaluate(`(() => { ${CHEST_END}
        document.getElementById('chestRow').children[0].click();
        const R = (s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return { s, l: b.left, t: b.top, r: b.right, b: b.bottom, hid: e.classList.contains('hidden') }; };
        const card = R('#over .card'), parts = ['#chestAgain', '#chestOdds'].map(R), others = ['#chestRow', '#again', '#chalBtn', '#toMenu'].map(R);
        const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
        const bad = []; for (const p of parts) { if (p.hid) bad.push(p.s + ' hidden'); if (p.l < card.l || p.r > card.r) bad.push(p.s + ' outside card x'); for (const o of others) if (hit(p, o)) bad.push(p.s + ' over ' + o.s); }
        if (hit(parts[0], parts[1])) bad.push('button over odds');
        const cardEl = document.querySelector('#over .card'), be = document.getElementById('best'), bb = be.getBoundingClientRect(), cb = cardEl.getBoundingClientRect();
        if (cardEl.scrollHeight > cardEl.clientHeight) bad.push('the card scrolls ' + cardEl.scrollHeight + ' > ' + cardEl.clientHeight);
        if (!be.textContent.trim() || getComputedStyle(be).display === 'none' || bb.bottom > cb.bottom || bb.top < cb.top) bad.push('the best line is not visible');
        return { bad }; })()`);
      assert(r.bad.length === 0, `${w}x${h} ${locale}: ${r.bad.join(', ')}`);
      assert(g.errors.length === 0, g.errors.join(' | '));
      await g.close();
    });

// early runs open stickers almost every time, and the reroll is offered on almost every card: both at once must fit
for (const [w, h] of [
  [360, 640],
  [844, 390],
])
  for (const locale of ['ru-RU', 'en-US'])
    for (const m of ['t3', 'free'])
      test(`chest: the reroll row and the album line fit the end card at ${w}x${h} ${locale} ${m}`, async () => {
        const g = await open({ play: false, width: w, height: h, touch: true, dpr: 2, locale, returning: true });
        const r = await g.page.evaluate(`(() => { const k = window.__kus; k.setSugar(0); k.pause(true);
          for (const n of ['Мармеладка', 'Желешка', 'Жвачка', 'Тянучка']) k.album.c[n] = 1;
          k.setMode('${m}'); k.startGame(); k.player.spawnT = 0; k.run.sugar = 200;
          for (const n of ['Зефирка', 'Суфле', 'Безе', 'Мусс', 'Бабл-гам']) k.albumEat({ name: n });
          if ('${m}' === 't3') k.setTimeLeft(0.001); else { k.player.alive = false; k.die(null); }
          for (let i = 0; i < 90; i++) k.update(1 / 60);
          document.getElementById('chestRow').children[0].click();
          const card = document.querySelector('#over .card'), cb = card.getBoundingClientRect(), bad = [];
          const seen = (id) => { const e = document.getElementById(id), b = e.getBoundingClientRect();
            if (!e.textContent.trim() || e.classList.contains('hidden') || getComputedStyle(e).display === 'none' || b.height === 0) bad.push(id + ' hidden');
            else if (b.top < cb.top || b.bottom > cb.bottom + 1 || b.bottom > innerHeight) bad.push(id + ' cut off at ' + Math.round(b.bottom) + ' (card ' + Math.round(cb.bottom) + ')'); };
          ['chestAgain', 'chestOdds', 'stk', 'best', 'again'].forEach(seen);
          if (card.scrollHeight > card.clientHeight + 1) bad.push('the card scrolls ' + (card.scrollHeight - card.clientHeight) + 'px');
          return { bad }; })()`);
        assert(r.bad.length === 0, `${w}x${h} ${locale} ${m}: ${r.bad.join(', ')}`);
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
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
  // cubes still in flight when the run ends are settled at once
  // a fresh t3 run: the page above is already in 'play', where startGame does nothing
  const g2 = await open({ play: false });
  await g2.page.evaluate(() => {
    window.__kus.setMode('t3');
    window.__kus.startGame();
  });
  const d = await g2.page.evaluate(`(() => { ${QUIET} k.run.sugar += 10; k.sugarFly(k.player.x, k.player.y, 10, 5); k.setTimeLeft(0.001);
    for (let i = 0; i < 400 && k.state !== 'dead'; i++) k.update(1/60);
    return { state: k.state, air: k.hud.air, shown: k.hud.sugarShown, want: Math.floor(k.run.sugar) }; })()`);
  assert(d.state === 'dead' && d.air === 0 && d.shown === d.want, `settle at the end: ${JSON.stringify(d)}`);
  assert(g2.errors.length === 0, g2.errors.join(' | '));
  await g2.close();
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

test('missions: the sugar of a mission finished in a run the app never ended is paid on the next start, once', async () => {
  const g = await open({ play: false, returning: true });
  const reload = async () => {
    await g.page.reload();
    await g.page.waitForTimeout(600);
  };
  const finish = (end) =>
    g.page.evaluate((end) => {
      const k = window.__kus;
      k.pause(true);
      k.setSugar(50);
      localStorage.setItem('kus.sugar', '50'); // setSugar does not save
      k.M.act = [{ type: 'kills', need: 3, got: 2, c: 1, at: 0, idle: 0 }];
      k.setMode('t3');
      k.startGame();
      k.player.spawnT = 0;
      k.mission('kills', 1);
      const m = k.M.act.find((x) => x.type === 'kills');
      const out = { paid: m.paid, done: m.got >= m.need };
      if (end) {
        k.setTimeLeft(0.001);
        for (let i = 0; i < 90; i++) k.update(1 / 60);
        out.got = k.run.got;
      }
      out.bank = k.sugar;
      return out;
    }, end);
  // the app is closed (or killed in the background) mid-run, after the mission is done: «+N сахара» was promised
  const a = await finish(false);
  await reload();
  const a2 = await g.page.evaluate(() => ({ bank: window.__kus.sugar, kills: window.__kus.M.act.some((m) => m.type === 'kills') }));
  await reload();
  const a3 = await g.page.evaluate(() => window.__kus.sugar);
  // this check has failed now and then in full runs (the bank came back 0) and never in isolation: if it fails again,
  // say what the reloaded page found in storage, now and a moment later, and any page errors
  let why = '';
  if (a2.bank !== 50 + a.paid || a3 !== 50 + a.paid) {
    const look = () =>
      g.page.evaluate(() => ({
        sugar: localStorage.getItem('kus.sugar'),
        m: (localStorage.getItem('kus.m') || '').slice(0, 80),
        keys: Object.keys(localStorage).length,
      }));
    const now = await look();
    await g.page.waitForTimeout(1500);
    why = ` (storage ${JSON.stringify(now)}, 1.5 s later ${JSON.stringify(await look())}; page errors: ${g.errors.join(' | ') || 'none'})`;
  }
  assert(a.done && a.paid > 0 && a.bank === 50, `mission done ${a.done}, paid ${a.paid}, bank mid-run ${a.bank}`);
  assert(a2.bank === 50 + a.paid && !a2.kills, `after the restart the bank is ${a2.bank}, want ${50 + a.paid}${why}`);
  assert(a3 === a2.bank, `a second restart changed the bank: ${a2.bank} -> ${a3}${why}`);
  // a run that ends as usual pays the mission inside its own sugar, and a restart adds nothing
  const b = await finish(true);
  await reload();
  const b2 = await g.page.evaluate(() => window.__kus.sugar);
  assert(b.got >= b.paid && b.bank === 50 + b.got, `the run paid ${b.got} (mission ${b.paid}), bank ${b.bank}`);
  assert(b2 === b.bank, `a restart after a finished run changed the bank ${b.bank} -> ${b2}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('wardrobe: old saves keep what they had, a broken save does not break, buying is exact', async () => {
  const g = await open({ play: false });
  const reload = async () => {
    await g.page.reload();
    await g.page.waitForTimeout(600);
  };
  // seeded by an init script: the old page saves its own state on unload, which would overwrite keys set by hand
  await g.page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('kus.best', '600');
    localStorage.setItem('kus.m', JSON.stringify({ seq: 3, act: [], open: ['waffle', 'tiger'] }));
    localStorage.setItem('kus.hat', 'horns');
  });
  await reload();
  const r = await g.page.evaluate(() => {
    const k = window.__kus;
    return {
      hats: k.owns('hat', 'bow') && k.owns('hat', 'crown') && k.owns('hat', 'chef'),
      horns: k.owns('hat', 'horns'),
      skins: k.owns('skin', 'waffle') && k.owns('skin', 'tiger'),
      cow: k.owns('skin', 'cow'),
      free: k.owns('hat', 'none') && k.owns('skin', 'dots') && k.owns('eyes', 'none') && k.owns('tray', 'choco'),
      v: JSON.parse(localStorage.getItem('kus.own')).v,
      own: JSON.stringify(k.own),
    };
  });
  assert(r.hats && !r.horns, 'old hats must follow the old record thresholds');
  assert(r.skins && !r.cow, 'old mission skins must stay open, the others closed');
  assert(r.free && r.v === 1, 'free items are owned and the save is versioned');
  await reload();
  const own2 = await g.page.evaluate(() => JSON.stringify(window.__kus.own));
  assert(own2 === r.own, `own changed on the second load: ${r.own} -> ${own2}`);
  const hat = await g.page.evaluate(() => {
    const k = window.__kus;
    k.chosenHat = 'halo'; // never owned: only the owns() guard in spawnPlayer can stop it
    k.pause(true);
    k.startGame();
    return k.player.hat;
  });
  assert(hat === 'none', `an unbought hat was worn: ${hat}`);
  const b = await g.page.evaluate(() => {
    const k = window.__kus,
      out = {};
    k.setSugar(k.priceOf('hat', 'cap'));
    out.first = k.buyItem('hat', 'cap');
    out.left = k.sugar;
    out.stored = localStorage.getItem('kus.sugar');
    out.second = k.buyItem('hat', 'cap');
    k.setSugar(10);
    out.poor = k.buyItem('hat', 'halo');
    out.poorSugar = k.sugar;
    out.poorOwns = k.owns('hat', 'halo');
    return out;
  });
  assert(b.first === true && b.left === 0 && b.stored === '0', `buying: ${JSON.stringify(b)}`);
  assert(b.second === false, 'the same item was bought twice');
  assert(b.poor === false && b.poorSugar === 10 && !b.poorOwns, 'a purchase without enough sugar changed state');
  await g.page.evaluate(() => localStorage.setItem('kus.own', '{oops'));
  await reload();
  assert(await g.page.evaluate(() => window.__kus.owns('hat', 'bow')), 'a broken save must fall back to the migration');
  await g.page.evaluate(() => localStorage.setItem('kus.own', '{"v":1,"hat":[1,"nope","cap"]}'));
  await reload();
  const mal = await g.page.evaluate(() => ({ hat: window.__kus.own.hat, saved: localStorage.getItem('kus.own') }));
  assert(JSON.stringify(mal.hat) === '["cap"]', `malformed ids must be dropped: ${JSON.stringify(mal.hat)}`);
  assert(JSON.parse(mal.saved).hat.join() === 'cap', `the save was not rewritten clean: ${mal.saved}`);
  const adm = await g.page.evaluate(() => {
    const k = window.__kus;
    k.pause(true);
    k.startGame();
    document.getElementById('pAdmin').click();
    return [...document.querySelectorAll('#admA button')].map((b) => b.textContent);
  });
  assert(adm.length > 0 && !adm.some((x) => x.includes('Открыть все узоры')), `the open-all cheat is still in the admin panel: ${adm}`);
  assert(await g.page.evaluate(() => window.__kus.STR['act.13'] === undefined), 'the "open all patterns" cheat is gone');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('wardrobe: hats are bought with sugar in two taps, a new player has only «none»', async () => {
  const g = await open({ play: false, returning: true });
  const r = await g.page.evaluate(() => {
    const k = window.__kus,
      out = {},
      hat = (id) => document.querySelector(`#hats [data-id="${id}"]`);
    out.open = [...document.querySelectorAll('#hats button')].filter((b) => !b.classList.contains('lock')).map((b) => b.dataset.id);
    out.hasPrice = !!hat('bow').querySelector('.pz');
    k.setSugar(0);
    hat('bow').click();
    out.poor = !k.owns('hat', 'bow');
    out.bank = document.getElementById('bank').textContent;
    k.setSugar(k.priceOf('hat', 'bow'));
    hat('bow').click();
    out.asked = !!hat('bow').querySelector('.pz.ask') && !k.owns('hat', 'bow');
    hat('bow').click();
    out.bought = k.owns('hat', 'bow') && k.sugar === 0;
    out.checked = hat('bow').getAttribute('aria-checked') === 'true';
    k.pause(true);
    k.startGame();
    out.stored = localStorage.getItem('kus.hat');
    out.worn = k.player.hat;
    return out;
  });
  assert(r.open.join() === 'none', `a new player must have only «none» open: ${r.open}`);
  assert(r.hasPrice, 'a closed hat must show its price');
  assert(r.poor && r.bank.includes('«Бантик»'), `no "not enough" line in the bank: "${r.bank}"`);
  assert(r.asked, 'the first tap must only ask');
  assert(r.bought && r.checked, 'the second tap must buy and select the hat');
  assert(r.stored === 'bow' && r.worn === 'bow', `the hat was not saved or worn: ${r.stored} / ${r.worn}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('wardrobe: a pending first tap does not outlive the menu or another tap', async () => {
  const g = await open({ play: false, returning: true });
  const r = await g.page.evaluate(() => {
    const k = window.__kus,
      out = {},
      hat = (id) => document.querySelector(`#hats [data-id="${id}"]`);
    k.setSugar(100000);
    hat('bow').click();
    out.asked = !!hat('bow').querySelector('.pz.ask');
    k.pause(true);
    k.startGame();
    k.toMenu();
    out.tag = !!hat('bow').querySelector('.pz.ask');
    hat('bow').click();
    out.round = k.owns('hat', 'bow');
    hat('crown').click(); // the first tap on another closed hat moves the ask there
    hat('bow').click();
    out.moved = k.owns('hat', 'bow');
    return out;
  });
  assert(r.asked, 'the first tap must ask');
  assert(!r.tag, 'the «Купить?» tag must disappear after a round trip through a run');
  assert(!r.round, 'one tap after a menu-run-menu round trip must not buy');
  assert(!r.moved, 'tapping another hat must clear the first ask');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('wardrobe: every hat and pattern draws', async () => {
  const g = await open({ play: false, returning: true });
  const r = await g.page.evaluate(() => {
    const k = window.__kus,
      out = { flat: [], empty: [], missing: [], frames: 0 };
    k.pause(true);
    k.startGame();
    const P = k.player;
    for (const b of k.blobs)
      if (b !== P) {
        b.x = 300 + Math.random() * 300;
        b.y = 3700;
        b.resetPoints();
      }
    P.spawnT = 0;
    // a hat is drawn when the frame has more fills and strokes than the bare head
    const C = CanvasRenderingContext2D.prototype,
      fill = C.fill,
      stroke = C.stroke;
    let n = 0;
    C.fill = function (...a) {
      n++;
      return fill.apply(this, a);
    };
    C.stroke = function (...a) {
      n++;
      return stroke.apply(this, a);
    };
    const ops = () => {
      k.parts.length = 0;
      n = 0;
      k.render();
      out.frames++;
      return n;
    };
    P.hat = 'none';
    const bare = ops();
    for (const [id] of k.WARDROBE.hat) {
      if (id === 'none') continue;
      P.hat = id;
      if (ops() <= bare) out.flat.push(id);
      k.setLod(2);
      ops();
      k.setLod(0);
    }
    C.fill = fill;
    C.stroke = stroke;
    P.hat = 'none';
    for (const [id] of k.WARDROBE.skin) {
      if (!k.SKINS.some((s) => s[0] === id)) out.missing.push(id);
      if (id === 'plain') continue;
      const c = k.skinTile(id).c,
        px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let seen = false;
      for (let i = 3; i < px.length && !seen; i += 4) seen = px[i] > 0;
      if (!seen) out.empty.push(id);
      P.skin = id;
      ops();
    }
    return out;
  });
  assert(r.flat.length === 0, `hats that draw nothing: ${r.flat}`);
  assert(r.missing.length === 0, `patterns missing from SKINS (the shop row): ${r.missing}`);
  assert(r.empty.length === 0, `patterns with an empty tile: ${r.empty}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

const LIVE = ['rainbow', 'foil', 'aurora', 'galaxy'];
test('skins: whole-body patterns are 512, the rest 256; only rainbow, foil, aurora and galaxy live; nothing newer than iOS 15', async () => {
  const g = await open({ play: false, returning: true });
  const r = await g.page.evaluate(() => {
    const k = window.__kus,
      out = { size: [], live: [] };
    for (const [id] of k.SKINS) {
      if (id === 'plain') continue;
      const a = k.skinTile(id);
      if (a.c.width !== (a.span === 3.2 ? 512 : 256)) out.size.push(`${id} ${a.c.width}`);
      if (a.fx) out.live.push(id);
    }
    return out;
  });
  assert(r.size.length === 0, `tiles of the wrong size: ${r.size}`);
  assert(r.live.sort().join() === [...LIVE].sort().join(), `living patterns: ${r.live}`);
  const src = readFileSync(join(root, 'src', 'js', '02-tuning.js'), 'utf8');
  assert(!/\.filter\s*=|roundRect|createConicGradient/.test(src), 'the patterns use canvas calls iOS 15 Safari does not have');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

// fills of one frame with the player in a pattern, minus the same frame in dots; the tile is painted before counting
const LIVE_EXTRA = `(ids) => {
  const k = window.__kus, P = k.player, C = CanvasRenderingContext2D.prototype, fill = C.fill;
  let n = 0;
  C.fill = function (...a) { n++; return fill.apply(this, a); };
  const count = (id) => { P.skin = id; k.skinTile(id); k.parts.length = 0; n = 0; k.render(); return n; };
  const base = count('dots'), out = {};
  for (const id of ids) out[id] = count(id) - base;
  C.fill = fill;
  return out;
}`;
test('skins: the living layer adds one fill at full detail, none at lod 1, when small or with reduced motion', async () => {
  const g = await open({});
  await g.page.evaluate(QUIET);
  const full = await g.page.evaluate(`(${LIVE_EXTRA})(${JSON.stringify(LIVE)})`);
  assert(full.foil === 1 && full.aurora === 1 && full.galaxy === 1 && full.rainbow === 0, `extra fills at lod 0: ${JSON.stringify(full)}`);
  await g.page.evaluate(() => window.__kus.setLod(1));
  const lite = await g.page.evaluate(`(${LIVE_EXTRA})(${JSON.stringify(LIVE)})`);
  assert(
    Object.values(lite).every((v) => v === 0),
    `extra fills at lod 1: ${JSON.stringify(lite)}`,
  );
  await g.page.evaluate(() => {
    const k = window.__kus;
    k.setLod(0);
    k.cam.z = 12 / k.player.Rs; // drawn with its pattern (over 7 px) but under FX_MIN
  });
  const small = await g.page.evaluate(`(${LIVE_EXTRA})(${JSON.stringify(LIVE)})`);
  assert(
    Object.values(small).every((v) => v === 0),
    `extra fills on a small candy: ${JSON.stringify(small)}`,
  );
  // the rainbow's own tile flows with time
  const flow = (page) =>
    page.evaluate(async () => {
      const k = window.__kus,
        P = k.player,
        set = CanvasPattern.prototype.setTransform,
        rainbow = k.skinTile('rainbow').pat,
        seen = [];
      CanvasPattern.prototype.setTransform = function (m) {
        if (this === rainbow) seen.push(m.e + ',' + m.f); // parked bots draw their own patterns in the same frame
        return set.call(this, m);
      };
      k.setLod(0);
      k.cam.z = 1;
      P.skin = 'rainbow';
      k.render();
      const a = seen[seen.length - 1];
      await new Promise((r) => setTimeout(r, 300));
      k.render();
      CanvasPattern.prototype.setTransform = set;
      return a !== seen[seen.length - 1];
    });
  assert(await flow(g.page), 'the rainbow stands still at full detail');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
  const c = await open({ reducedMotion: 'reduce' });
  await c.page.evaluate(QUIET);
  const calm = await c.page.evaluate(`(${LIVE_EXTRA})(${JSON.stringify(LIVE)})`);
  assert(
    Object.values(calm).every((v) => v === 0),
    `extra fills with reduced motion: ${JSON.stringify(calm)}`,
  );
  assert(!(await flow(c.page)), 'the rainbow flows with reduced motion');
  assert(c.errors.length === 0, c.errors.join(' | '));
  await c.close();
});

test('skins: drawing patterns makes no DOMMatrix per frame', async () => {
  const g = await open({});
  await g.page.evaluate(QUIET);
  const made = await g.page.evaluate(() => {
    const k = window.__kus,
      P = k.player,
      D = window.DOMMatrix;
    let n = 0;
    window.DOMMatrix = function (...a) {
      n++;
      return new D(...a);
    };
    const four = [P, ...k.blobs.filter((b) => b !== P && !b.kind).slice(0, 3)];
    ['foil', 'galaxy', 'rainbow', 'tiger'].forEach((id, i) => {
      four[i].skin = id;
      k.skinTile(id);
      k.place(four[i], P.x + (i % 2 ? 1 : -1) * P.Rs * 1.4, P.y + (i < 2 ? -1 : 1) * P.Rs * 1.4, 0);
    });
    k.setLod(0);
    for (let i = 0; i < 60; i++) k.render();
    window.DOMMatrix = D;
    return n;
  });
  assert(made <= 1, `DOMMatrix made while drawing 60 frames of four patterned candies: ${made}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('wardrobe: every eye style draws, blinks and grows in a streak without errors', async () => {
  const g = await open({ play: false, returning: true });
  const r = await g.page.evaluate(() => {
    const k = window.__kus,
      out = { worn: [], stored: [], frames: 0, bots: true };
    for (const [id] of k.WARDROBE.eyes) {
      k.setSugar(100000);
      if (!k.owns('eyes', id)) {
        k.pickClick('eyes', id);
        k.pickClick('eyes', id);
      } else k.pickClick('eyes', id);
      k.pause(true);
      k.startGame();
      const P = k.player;
      out.worn.push(P.eyes === id);
      out.stored.push(localStorage.getItem('kus.eyes') === id);
      P.spawnT = 0;
      for (const lod of [0, 2]) {
        k.setLod(lod);
        P.blink = 0.1;
        k.render();
        P.blink = 0;
        P.hurtT = 0.3;
        k.render();
        P.hurtT = 0;
        P.combo = 5;
        P.comboT = 1;
        k.render();
        P.combo = 0;
        P.comboT = 0;
        k.render();
        out.frames += 4;
      }
      for (const b of k.blobs) if (!b.isPlayer && b.eyes !== 'none') out.bots = false;
      k.toMenu();
    }
    return out;
  });
  assert(r.worn.length === 6 && r.worn.every(Boolean), `the player must wear the chosen eyes: ${r.worn}`);
  assert(r.stored.every(Boolean), `kus.eyes must be saved: ${r.stored}`);
  assert(r.bots, 'bots must keep plain eyes');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('trail: only while moving, bounded, gone at lod 2', async () => {
  const g = await open({ play: false, returning: true });
  const r = await g.page.evaluate(() => {
    const k = window.__kus,
      out = { still: 0, moving: 0, peak: 0, later: 0, drew: [], noneParts: 0 };
    k.setSugar(100000);
    k.pickClick('trail', 'stars');
    k.pickClick('trail', 'stars');
    k.startGame();
    k.pause(true);
    const P = k.player;
    for (const key in k.CHEAT) k.CHEAT[key] = key === 'speed' ? 1 : false;
    for (const b of k.blobs)
      if (b !== P) {
        b.x = 300 + Math.random() * 300;
        b.y = 3700;
        b.resetPoints();
      }
    P.spawnT = 0;
    P.x = 2000;
    P.y = 2000;
    P.resetPoints();
    const shaped = () => k.parts.filter((p) => p.sh === 3).length;
    const cvsMove = (x) =>
      document.querySelector('canvas').dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', clientX: x, clientY: innerHeight / 2 })); // the mouse steers the candy
    cvsMove(innerWidth / 2);
    for (let i = 0; i < 120; i++) {
      P.tx = P.x;
      P.ty = P.y;
      k.update(1 / 60);
      out.still = Math.max(out.still, k.parts.filter((p) => p.sh).length);
    }
    cvsMove(innerWidth - 20);
    for (let i = 0; i < 180; i++) {
      P.tx = P.x + 800;
      P.ty = P.y;
      if (P.x > 3000) P.x = 1000;
      k.update(1 / 60);
      out.peak = Math.max(out.peak, shaped());
    }
    out.moving = out.peak;
    k.setLod(2);
    for (let i = 0; i < 60; i++) k.update(1 / 60); // the old ones die out
    k.parts.length = 0;
    for (let i = 0; i < 120; i++) {
      P.tx = P.x + 800;
      P.ty = P.y;
      if (P.x > 3000) P.x = 1000;
      k.update(1 / 60);
      out.later = Math.max(out.later, k.parts.filter((p) => p.sh).length);
    }
    k.setLod(0);
    for (const [id] of k.WARDROBE.trail) {
      P.trail = id;
      k.parts.length = 0;
      for (let i = 0; i < 60; i++) {
        P.tx = P.x + 800;
        P.ty = P.y;
        if (P.x > 3000) P.x = 1000;
        k.update(1 / 60);
      }
      if (id === 'none') out.noneParts = k.parts.filter((p) => p.sh).length;
      k.render();
      out.drew.push(id);
    }
    return out;
  });
  assert(r.still === 0, `no trail while standing still: ${r.still}`);
  assert(r.moving > 0, 'stars must trail a moving candy');
  assert(r.peak <= 16, `at most 16 alive at once: ${r.peak}`);
  assert(r.later === 0, `no trail at lod 2: ${r.later}`);
  assert(r.noneParts === 0, 'trail none leaves nothing');
  assert(r.drew.length === 6, 'every trail renders');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('trail: particles start outside the rim, behind the candy', async () => {
  const g = await open({ play: false, returning: true });
  const r = await g.page.evaluate(() => {
    const k = window.__kus,
      out = { n: 0, near: 1e9 };
    k.setSugar(100000);
    k.pickClick('trail', 'hearts');
    k.pickClick('trail', 'hearts');
    k.startGame();
    k.pause(true);
    const P = k.player;
    for (const key in k.CHEAT) k.CHEAT[key] = key === 'speed' ? 1 : false;
    for (const b of k.blobs)
      if (b !== P) {
        b.x = 300 + Math.random() * 300;
        b.y = 3700;
        b.resetPoints();
      }
    P.spawnT = 0;
    P.mass = 400;
    P.x = 1000;
    P.y = 2000;
    P.resetPoints();
    document
      .querySelector('canvas')
      .dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', clientX: innerWidth - 20, clientY: innerHeight / 2 }));
    const seen = new Set(k.parts);
    for (let i = 0; i < 120; i++) {
      P.tx = P.x + 800;
      P.ty = P.y;
      const x = P.x,
        y = P.y;
      k.update(1 / 60);
      const sp = Math.hypot(P.vx, P.vy) || 1;
      for (const p of k.parts)
        if (p.sh && !seen.has(p)) {
          seen.add(p);
          out.n++;
          // how far behind the centre it was born, in body radii (the centre moved at most one frame since)
          const back = Math.min(-((p.x - x) * P.vx + (p.y - y) * P.vy) / sp, -((p.x - P.x) * P.vx + (p.y - P.y) * P.vy) / sp);
          out.near = Math.min(out.near, back / P.Rs);
        }
    }
    return out;
  });
  assert(r.n > 0, 'a moving candy must leave a trail');
  assert(r.near >= 1.05, `a trail particle was born inside the body: ${r.near.toFixed(2)} radii behind the centre`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('tray: switching rebuilds the pattern, the menu world shows it, the choice is kept', async () => {
  const g = await open({ play: false, returning: true });
  // the entities are cleared inside the same synchronous call as the render, so only the tray is under the sampled patch
  const shade = () =>
    g.page.evaluate(() => {
      const k = window.__kus;
      k.blobs.length = 0;
      k.food.length = 0;
      k.parts.length = 0;
      k.render();
      const c = document.querySelector('canvas'),
        d = c.getContext('2d').getImageData(Math.floor(c.width * 0.5), Math.floor(c.height * 0.5), 12, 12).data;
      let r = 0,
        gr = 0,
        b = 0;
      for (let i = 0; i < d.length; i += 4) ((r += d[i]), (gr += d[i + 1]), (b += d[i + 2]));
      const n = d.length / 4;
      return { r: r / n, g: gr / n, b: b / n };
    });
  const before = await shade();
  const r = await g.page.evaluate(() => {
    const k = window.__kus;
    k.setSugar(100000);
    k.pickClick('tray', 'mint');
    k.pickClick('tray', 'mint');
    return { chosen: k.chosenTray, saved: localStorage.getItem('kus.tray'), owned: k.owns('tray', 'mint') };
  });
  const after = await shade();
  assert(r.owned && r.chosen === 'mint' && r.saved === 'mint', `the bought tray must be chosen and saved: ${JSON.stringify(r)}`);
  // choco is red-brown (r > g > b), mint is green-teal (g > r): the patch must have moved in that direction
  assert(before.r > before.g && before.g > before.b, `the chocolate tray must be red-brown: ${JSON.stringify(before)}`);
  assert(after.g > after.r && after.b > before.b, `the mint tray must be green-teal: ${JSON.stringify(after)}`);
  await g.page.reload();
  assert((await g.page.evaluate(() => window.__kus.chosenTray)) === 'mint', 'the tray must survive a reload');
  await g.page.evaluate(() => localStorage.setItem('kus.tray', 'gold')); // gold was never bought
  await g.page.reload();
  const r2 = await g.page.evaluate(() => ({ chosen: window.__kus.chosenTray, saved: localStorage.getItem('kus.tray') }));
  assert(r2.chosen === 'choco', `an unbought tray in the save must fall back to choco: ${JSON.stringify(r2)}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('missions: a done mission pays sugar and opens no pattern', async () => {
  const g = await open({ play: false, returning: true });
  const r = await g.page.evaluate(() => {
    const k = window.__kus,
      out = {};
    k.setSugar(0);
    k.pause(true);
    k.setMode('t3');
    k.startGame();
    k.player.spawnT = 0;
    k.player.combo = 0;
    k.M.act = [{ type: 'bites', need: 2, got: 0, c: 1 }];
    const skin = [...k.own.skin].join(),
      open = k.M.open.join(),
      s0 = k.run.sugar;
    k.mission('bites', 1);
    k.mission('bites', 1);
    out.gain = k.run.sugar - s0;
    k.setTimeLeft(0.001);
    for (let i = 0; i < 300; i++) k.update(1 / 60);
    out.card = document.getElementById('overMis').textContent;
    out.same = skin === [...k.own.skin].join() && open === k.M.open.join();
    out.feed = document.getElementById('feed').textContent;
    out.row = document.getElementById('misList').textContent;
    k.renderMissions();
    out.row = document.getElementById('misList').textContent;
    return out;
  });
  assert(r.gain >= 480 && r.gain <= 490, `a circle-1 mission must pay 480 (plus bite sugar), got ${r.gain}`);
  assert(r.same, 'a mission must not open a pattern');
  assert(r.card.includes('+480'), `the end card must keep the finished mission with its payout: "${r.card}"`);
  assert(r.feed.includes('+480'), `the feed must say +480: "${r.feed}"`);
  assert(r.row.includes('480'), `the mission row must show the payout: "${r.row}"`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('missions: time, combo and mass stop growing at their caps', async () => {
  const g = await open({ play: false, returning: true });
  const r = await g.page.evaluate(() => {
    const k = window.__kus,
      need = {};
    k.M.seq = 13 * 6;
    k.M.act = [];
    for (let i = 0; i < 40; i++) {
      k.M.act = [];
      k.rollMissions();
      for (const m of k.M.act) need[m.type] = Math.max(need[m.type] || 0, m.need);
    }
    return need;
  });
  // the page saves its own missions when it is hidden (a reload), so the old save is written before each load
  await g.page.addInitScript(() => localStorage.setItem('kus.m', JSON.stringify({ seq: 0, act: [{ type: 'time', need: 260, got: 0 }], open: [] })));
  assert(r.time > 0 && r.combo > 0 && r.mass > 0, `time, combo and mass must all roll: ${JSON.stringify(r)}`);
  assert(r.time <= 150 && r.combo <= 8 && r.mass <= 1600, `caps broken: ${JSON.stringify(r)}`);
  await g.page.reload();
  await g.page.waitForTimeout(600);
  const old = await g.page.evaluate(() => window.__kus.M.act.find((m) => m.type === 'time').need);
  assert(old === 150, `an old time mission must be cut to 150, got ${old}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('missions: one stuck for 5 runs is replaced, deaths inside a run count once', async () => {
  const g = await open({ play: false, returning: true });
  const r = await g.page.evaluate(() => {
    const k = window.__kus,
      out = { has: [], len: [] };
    k.pause(true);
    k.M.act = [{ type: 'hedge', need: 2, got: 0, c: 0 }];
    const go = (cheat) => {
      k.setMode('t3');
      k.startGame();
      k.player.spawnT = 0;
      if (cheat) k.player.cheated = true;
      for (const m of k.M.act) if (m.type !== 'hedge') m.got = Math.min(m.need - 1, m.got + 1); // the others make headway, only hedge is stuck
      for (let d = 0; d < 2; d++) {
        k.player.alive = false;
        k.die(null);
        for (let i = 0; i < 200 && k.state !== 'play'; i++) k.update(1 / 60);
      }
      k.setTimeLeft(0.001);
      for (let i = 0; i < 400 && !(k.state === 'dead' && 'got' in k.run); i++) k.update(1 / 60);
      for (let i = 0; i < 120; i++) k.update(1 / 60); // the end card comes up, so the next startGame is allowed
    };
    for (let n = 0; n < 5; n++) {
      go(false);
      out.has.push(k.M.act.some((m) => m.type === 'hedge'));
      out.len.push(k.M.act.length);
      if (n === 4) out.card = document.getElementById('overMis').textContent;
      if (n === 3) out.idle4 = (k.M.act.find((m) => m.type === 'hedge') || {}).idle;
    }
    k.setMode('t3');
    k.startGame();
    out.afterStart = k.M.act.length;
    k.M.act = [{ type: 'hedge', need: 2, got: 0, c: 0 }];
    go(true);
    out.cheat = (k.M.act.find((m) => m.type === 'hedge') || {}).idle | 0;
    return out;
  });
  assert(r.has.join() === 'true,true,true,true,false', `hedge must go after the fifth run only: ${r.has}`);
  assert(r.idle4 === 4, `two deaths in a run must count once, idle after 4 runs ${r.idle4}`);
  assert(
    r.len[4] === 2 && r.card.includes('hedge') === false && r.card.length > 0,
    `after the fifth run the stuck one is gone and the card still lists the run's missions: ${r.len} "${r.card}"`,
  );
  assert(r.afterStart === 3, `the next start must refill to three missions: ${r.afterStart}`);
  assert(r.cheat === 0, `a cheated run must not count as idle: ${r.cheat}`);
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

// A big candy eats small ones in one bite each: those swallows must build the streak like ordinary bites.
test('streak: swallowing whole counts as a streak bite', async () => {
  const g = await open();
  const r = await g.page.evaluate(`(() => { ${QUIET} ${EAT} const out = { combos: [], kills: 0 };
    P.combo = 0; P.comboT = 0; k.stamps.length = 0;
    for (let n = 0; n < 3; n++) { out.kills += eat('Тест' + n); out.combos.push(P.combo); }
    out.words = k.stamps.map((s) => s.txt); out.chip = document.querySelector('#sugar .mult').textContent; out.sum = k.streak.sum;
    // the three swallows came well inside a second: every «ням» over the candy right now, floating texts and the stamp together
    out.nyam = [...k.texts.filter((t) => t.t < t.T).map((t) => t.s), ...out.words].filter((s) => /ням/i.test(s));
    out.ann = document.querySelector('#announce b').textContent;
    return out; })()`);
  assert(r.nyam.length <= 1, `only one «ням» may hang over the candy at a time, saw ${JSON.stringify(r.nyam)}`);
  assert(r.kills === 3, `all three small candies must be swallowed whole, got ${r.kills}`);
  assert(r.combos.join() === '1,2,3', `swallows in a row must count 1,2,3, got ${r.combos}`);
  // three swallows in a row are also a chain: the big word takes the screen and the streak's own stamp waits
  assert(
    r.words.length === 0 && r.ann === 'Тройной кусь!!' && r.chip === '×3',
    `the third swallow must announce Тройной кусь!! with no stamp and show ×3: ${r.words} "${r.ann}" ${r.chip}`,
  );
  assert(r.sum > 0, 'the swallows must add their sugar to the streak sum');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

// A bonus pickup is a streak step for the player (no sugar, never «На волоске!»); a bot taking one leaves the player's streak alone.
test('streak: a bonus pickup is a streak step', async () => {
  const g = await open();
  const r = await g.page.evaluate(`(() => { ${QUIET} const out = {};
    k.food.length = 0;
    // every other blob is parked far from the player (and from the bot below) before each take, so none can win the overlap
    let bot = null; const away = () => { for (const b of k.blobs) if (b !== P && b !== bot) { b.x = b.hx = P.x < 2000 ? 3700 : 300; b.y = b.hy = P.y < 2000 ? 3700 : 300; b.resetPoints(); } };
    const pick = (combo, comboT) => { away(); k.food.length = 0; k.stamps.length = 0; k.texts.length = 0; P.combo = combo; P.comboT = comboT;
      const pk = { type: 'speed', x: P.x, y: P.y, t: 0 }; k.pickups.length = 0; k.pickups.push(pk); k.update(1/60); // the game may spawn its own random pickup meanwhile: look for ours
      return { taken: !k.pickups.includes(pk), combo: P.combo, comboT: P.comboT, words: k.stamps.map((s) => s.txt), chip: document.querySelector('#sugar .mult').textContent, texts: k.texts.filter((t) => t.t < t.T).map((t) => t.s) }; };
    out.a = pick(0, 0); out.b = pick(1, 2); out.c = pick(4, 0.2);
    // a controlled bot: alive, still, home point fixed, sitting right on the pickup, taken in the very next frame
    bot = k.spawnBot(100); away(); bot.ai = null; bot.spawnT = 0; bot.x = bot.hx = P.x < 2000 ? P.x + 1500 : P.x - 1500; bot.y = bot.hy = P.y; bot.resetPoints();
    P.combo = 3; P.comboT = 2; k.stamps.length = 0; k.pickups.length = 0; const pkb = { type: 'speed', x: bot.x, y: bot.y, t: 0 }; k.pickups.push(pkb);
    const c0 = P.combo, t0 = P.comboT, before = { alive: bot.alive, listed: k.blobs.includes(bot) }; k.update(1/60);
    out.d = { same: P.combo === c0 && k.stamps.length === 0 && P.comboT < t0, taken: !k.pickups.includes(pkb), before, after: { alive: bot.alive, x: Math.round(bot.x), y: Math.round(bot.y) } };
    // the pickup's own mission payout is old; the streak must add nothing on top of it, deep in a streak or not
    const paid = (combo, comboT) => { away(); k.pickups.length = 0; k.pickups.push({ type: 'speed', x: P.x, y: P.y, t: 0 }); P.combo = combo; P.comboT = comboT; const s0 = k.run.sugar; k.update(1/60); return +(k.run.sugar - s0).toFixed(3); };
    out.e = { cold: paid(0, 0), deep: paid(6, 3) };
    // the camera kick and the last spot point at the bonus: here it lies straight above the player
    away(); k.pickups.length = 0; P.combo = 1; P.comboT = 2; k.cam.kx = k.cam.ky = k.cam.kvx = k.cam.kvy = 0; const up = { type: 'speed', x: P.x, y: P.y - P.Rs * 0.6, t: 0 }; k.pickups.push(up); k.update(1/60);
    out.f = { taken: !k.pickups.includes(up), kick: Math.atan2(k.cam.kvy, k.cam.kvx), moved: Math.hypot(k.cam.kvx, k.cam.kvy) > 1, woundAbove: k.streak.lastWound.y < P.y - P.Rs * 0.3 };
    // a streak made of bonuses only brought no sugar: its summary must not brag about +0
    const sum = document.querySelector('#streakSum'); sum.classList.remove('on'); k.streak.sumT = 0;
    P.combo = 0; P.comboT = 0; P.biteCd = 999; k.pickups.length = 0; k.pickups.push({ type: 'shield', x: P.x, y: P.y, t: 0 }); k.update(1/60);
    k.pickups.push({ type: 'magnet', x: P.x, y: P.y, t: 0 }); k.update(1/60); out.g = { combo: P.combo };
    for (let i = 0; i < 268; i++) { away(); k.pickups.length = 0; P.biteCd = 999; k.update(1/60); }
    out.g.sum = sum.textContent; out.g.on = sum.classList.contains('on');
    return out; })()`);
  assert(
    r.a.taken && r.b.taken && r.c.taken,
    `the player's own pickup was not collected (a stray blob won the overlap): ${JSON.stringify([r.a, r.b, r.c])}`,
  );
  assert(
    r.a.combo === 1 && r.a.words.length === 0 && Math.abs(r.a.comboT - 4) < 0.05,
    `a first pickup must start a streak at 1 with no word: ${JSON.stringify(r.a)}`,
  );
  assert(
    r.b.combo === 2 && r.b.words.join() === 'Кусь-кусь!' && r.b.chip === '×2',
    `a pickup inside a streak must make ×2 and stamp the word: ${JSON.stringify(r.b)}`,
  );
  assert(
    r.c.combo === 5 && r.c.words.join() === 'Хрум-хрум!',
    `a pickup at the last moment must make ×5 Хрум-хрум!, never На волоске!: ${JSON.stringify(r.c)}`,
  );
  assert(r.d.taken && r.d.same, `a bot taking a bonus must not touch the player's streak: ${JSON.stringify(r.d)}`);
  assert(r.a.texts.includes('Скорость!'), `a pickup that only starts a streak still names the bonus over the candy: ${JSON.stringify(r.a.texts)}`);
  assert(
    !r.b.texts.includes('Скорость!') && !r.c.texts.includes('Скорость!'),
    `inside a streak the stamp talks, the bonus name must not float over the candy: ${JSON.stringify([r.b.texts, r.c.texts])}`,
  );
  assert(
    r.f.taken && r.f.moved && Math.abs(r.f.kick + Math.PI / 2) < 0.35 && r.f.woundAbove,
    `the kick and the last spot must point at a bonus above the player: ${JSON.stringify(r.f)}`,
  );
  assert(r.g.combo === 2 && r.g.on && r.g.sum === 'Серия ×2', `a bonus-only streak sums up without «+0 сахара»: ${JSON.stringify(r.g)}`);
  assert(r.e.cold === r.e.deep, `a streak pickup must pay no sugar beyond the old pickup payout: ${JSON.stringify(r.e)}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

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
  for (const locale of ['ru-RU', 'en-US'])
    try {
      for (const [w, h] of [
        [360, 640],
        [844, 390],
      ]) {
        const g = await open({ locale, width: w, height: h, touch: true, dpr: 2, play: false, returning: true });
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
          r.shown &&
            r.line.includes(locale === 'en-US' ? 'Row “Chewy” complete' : 'Ряд «Тягучие» собран') &&
            r.line.includes(locale === 'en-US' ? '9 of 30' : '9 из 30'),
          `${w}x${h}: sticker line "${r.line}" (shown ${r.shown})`,
        );
        assert(r.over <= 1, `${w}x${h}: the end screen scrolls by ${r.over}px with "${r.line}"`);
        assert(g.errors.length === 0, g.errors.join(' | '));
        await g.close();
      }
    } catch (e) {
      throw new Error(locale + ': ' + e.message);
    }
});

test('album: the page opens and closes, fits phones, stickers are big enough to tap', async () => {
  for (const locale of ['ru-RU', 'en-US'])
    try {
      for (const [w, h] of [
        [360, 640],
        [844, 390],
      ]) {
        const g = await open({ locale, width: w, height: h, touch: true, dpr: 2, play: false, returning: true });
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
      const f = await open({ locale, width: 360, height: 640, touch: true, dpr: 2, play: false });
      const first = await f.page.evaluate(() => document.getElementById('albumBtn').offsetHeight);
      assert(first === 0, 'the album button must wait until the first run is over');
      await f.close();
    } catch (e) {
      throw new Error(locale + ': ' + e.message);
    }
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
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
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
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'ru-RU' });
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
      B.mass = 60; k.place(B, 600, 600, 0); for (let i = 0; i < 40; i++) { B.mass = 60; k.place(B, 600, 600, 0); k.update(1 / 60); }
    k.place(B, 2000, 2000, 0); k.place(P, 2000 - B.Rs - P.Rs + 6, 2000, 0); let f = 0;
      while (k.state === 'play' && f++ < 400) { P.tx = B.x; P.ty = B.y; B.tx = B.x; B.ty = B.y; P.biteCd = Math.min(P.biteCd, 0); k.update(1 / 60); }
      k.CHEAT.heal = false; return { P, f }; };
    const out = {};
    let { P, f } = beat(false);
    out.state = k.state; out.frames = f; out.title = document.getElementById('overT').textContent; out.who = document.getElementById('who').textContent;
    out.best = document.getElementById('best').textContent; out.again = document.getElementById('again').textContent;
    out.share = document.getElementById('chalBtn').textContent; out.clear = JSON.parse(localStorage.getItem('kus.clear'));
    out.got = k.run.got; out.over = !document.getElementById('over').classList.contains('hidden');
    { const cd = document.querySelector('#over .card'); out.trophy = cd.classList.contains('trophy'); out.rec = cd.classList.contains('rec');
      out.recText = document.getElementById('trRec').textContent; out.tiles = [...document.querySelectorAll('#trTiles b')].map((e) => e.textContent);
      out.bites = k.run.bites; const cr = document.getElementById('chestRow'); out.chest = !document.getElementById('sweet').classList.contains('hidden') && cr.children.length > 0; }
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
    out.shiftCard = [card.querySelector('.card').classList.contains('trophy'), card.querySelector('.card').classList.contains('rec')];
    k.toMenu(); k.setMode('free');
    beat(true); out.cheatState = k.state; out.cheatClear = JSON.parse(localStorage.getItem('kus.clear')); out.cheatBest = document.getElementById('best').textContent;
    { const cd = document.querySelector('#over .card'); out.cheatCard = [cd.classList.contains('trophy'), cd.classList.contains('rec')]; out.cheatGot = k.run.got;
      out.cheatTile = document.querySelectorAll('#trTiles b')[2].textContent; }
    return out; })()`);
  assert(r.state === 'won' && r.over && r.title === 'Торт съеден!', `state ${r.state} after ${r.frames} frames, title "${r.title}"`);
  assert(/^Первая смена за \d:\d\d$/.test(r.who), `win line "${r.who}"`);
  assert(r.trophy && r.rec && r.recText === 'Первая победа!', `trophy ${r.trophy}, rec ${r.rec}, pill "${r.recText}"`);
  assert(r.tiles[1] === String(r.bites) && r.tiles[2] === String(r.got), `tiles ${JSON.stringify(r.tiles)}`);
  assert(r.chest && r.share === 'Поделиться', 'the chest pick and the share button stay');
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
  assert(r.shiftCard[0] === false && r.shiftCard[1] === false, `a death must clear trophy and rec: ${r.shiftCard}`);
  assert(
    r.cheatCard[0] && !r.cheatCard[1] && r.cheatTile === String(r.cheatGot) && r.cheatGot === 0,
    `a cheated win: trophy without rec, no sugar: ${JSON.stringify([r.cheatCard, r.cheatTile, r.cheatGot])}`,
  );
  assert(
    r.cheatState === 'won' && r.cheatClear.wins === 2 && r.cheatBest.includes('С читами'),
    `a cheated win counted: ${JSON.stringify(r.cheatClear)}, "${r.cheatBest}"`,
  );
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('melt: the player melts on a soft curve, slower than a bot of the same mass', async () => {
  const g = await open({ play: true });
  const r = await g.page.evaluate(`(() => { ${QUIET}
    const B = k.blobs.find((b) => b.ai && !b.kind && b !== P); const out = { kp: k.MELT.kPlayer, soft: k.MELT.soft };
    P.mass = 3400; out.p3400 = k.meltRate(P); B.mass = 3400; out.b3400 = k.meltRate(B);
    P.mass = 10000; out.p10000 = k.meltRate(P);
    P.mass = 300; out.p300 = k.meltRate(P); P.mass = 250; out.p250 = k.meltRate(P);
    const C = k.spawnSpecial('cake')[0]; C.mass = 6000; out.cake = k.meltRate(C);
    return out; })()`);
  assert(Math.abs(r.p3400 - 3100 * r.kp * (1 + 3400 / r.soft)) < 0.01, `player melt at 3400: ${r.p3400}`);
  assert(Math.abs(r.p10000 - 9700 * r.kp * (1 + 10000 / r.soft)) < 0.01, `player melt at 10000: ${r.p10000}`);
  assert(Math.abs(r.b3400 - 3100 * 0.004 * 4.4) < 0.01 && r.p3400 < r.b3400, `bot melt at 3400: ${r.b3400}, player ${r.p3400}`);
  assert(r.p300 === 0 && r.p250 === 0 && r.cake === 0, `no melt at or under 300 and none for the cake: ${JSON.stringify(r)}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('melt: no candy ends a frame above its cap, also after swallowing a bot whole', async () => {
  const g = await open({ play: true });
  const r = await g.page.evaluate(`(() => { ${QUIET}
    const out = { pMax: 0, bMax: 0, pSwallowed: false, bSwallowed: false };
    const V = k.spawnBot(2000); V.ai = null; V.spawnT = 0; P.mass = 19900;
    k.place(V, 2000, 1500, 0); k.place(P, 2000 - V.Rs - P.Rs + 4, 1500, 0); P.biteCd = 0;
    for (let i = 0; i < 200 && V.alive; i++) { k.food.length = 0; P.tx = V.x; P.ty = V.y; V.tx = V.x; V.ty = V.y; V.biteCd = 9; P.biteCd = Math.min(P.biteCd, 0); k.update(1 / 60); out.pMax = Math.max(out.pMax, P.mass); }
    out.pSwallowed = !V.alive;
    const B = k.blobs.find((b) => b.ai && !b.kind && b !== P && b.alive); const W = k.spawnBot(800); W.ai = null; W.spawnT = 0; B.ai = null; B.spawnT = 0; B.mass = 3490;
    k.place(W, 2500, 2500, 0); k.place(B, 2500 - W.Rs - B.Rs + 4, 2500, 0); B.biteCd = 0;
    for (let i = 0; i < 200 && W.alive; i++) { k.food.length = 0; B.tx = W.x; B.ty = W.y; W.tx = W.x; W.ty = W.y; W.biteCd = 9; B.biteCd = Math.min(B.biteCd, 0); P.biteCd = 999; k.update(1 / 60); out.bMax = Math.max(out.bMax, B.mass); }
    out.bSwallowed = !W.alive;
    return out; })()`);
  assert(r.pSwallowed, 'the player did not swallow the bot whole');
  assert(r.pMax <= 20000, `the player ended a frame at ${r.pMax}`);
  assert(r.bSwallowed, 'the bot did not swallow the small bot');
  assert(r.bMax <= 3500, `a bot ended a frame at ${r.bMax}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('late bots: bigger bots come only when the player is huge and alive', async () => {
  const g = await open({ play: true });
  const r = await g.page.evaluate(`(() => { ${QUIET}
    const out = { s: [1000, 1500, 3000, 9000].map((m) => k.lateShare(m)) };
    const draw = () => { const a = []; for (let i = 0; i < 2000; i++) a.push(k.randomBotMass()); return a; };
    P.mass = 8000; const a = draw(); const big = a.filter((v) => v >= 640);
    out.share = big.length / 2000; out.bigOk = big.every((v) => v <= 2000);
    P.mass = 1000; out.max1000 = Math.max(...draw());
    P.mass = 8000; P.alive = false; out.maxDead = Math.max(...draw()); P.alive = true;
    out.maxFirst = Math.max(...Array.from({ length: 2000 }, () => k.randomBotMass(true)));
    const prev = k.daily.day; k.daily.day = 'small'; out.maxSmall = Math.max(...draw()); k.daily.day = prev;
    return out; })()`);
  assert(r.s[0] === 0 && r.s[1] === 0 && Math.abs(r.s[2] - 0.25) < 1e-9 && r.s[3] === 0.45, `lateShare: ${r.s}`);
  assert(Math.abs(r.share - 0.45) <= 0.05, `late share at 8000: ${r.share}`);
  assert(r.bigOk, 'a late bot is outside 8-25% of the mass');
  assert(r.max1000 <= 350, `no late bots at 1000: ${r.max1000}`);
  assert(r.maxDead <= 350, `no late bots for a dead player: ${r.maxDead}`);
  assert(r.maxFirst <= 600, `the first fill is unchanged: ${r.maxFirst}`);
  assert(r.maxSmall <= 50, `the small twist wins: ${r.maxSmall}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('late bots: a bot is capped at 3500, also after eating a late bot', async () => {
  const g = await open({ play: true });
  const r = await g.page.evaluate(`(() => { ${QUIET}
    const B = k.blobs.find((b) => b.ai && !b.kind && b !== P);
    B.mass = 3400; k.place(B, 3500, 3500, 0); B.mass += 2000; // a late bot's mass lands the way a finished chunk adds it
    k.update(1 / 60); k.update(1 / 60); return B.mass; })()`);
  // food eaten later in a frame may add a few grams; the cap holds within a few grams
  assert(r <= 3520, `a bot's mass: ${r}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('late bots: t3 with a huge player takes the same branch', async () => {
  const g = await open({ play: false });
  const r = await g.page.evaluate(`(() => { const k = window.__kus; k.pause(true); k.setMode('t3'); k.startGame();
    const P = k.player; P.spawnT = 0; P.mass = 8000;
    let n = 0; for (let i = 0; i < 2000; i++) if (k.randomBotMass() >= 640) n++;
    return { state: k.state, alive: P.alive, share: n / 2000 }; })()`);
  assert(r.state === 'play' && r.alive, `t3 run: ${JSON.stringify(r)}`);
  assert(Math.abs(r.share - 0.45) <= 0.05, `late share in t3: ${r.share}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('melt: a second shift keeps a mass above 3500', async () => {
  const g = await open({ play: false, returning: true });
  const r = await g.page.evaluate(`(() => { ${STG}
    const P = free(); P.mass = 1600; S().i = 2; S().endT = -99; run(0.1); if (!S().cur) throw new Error('no boss');
    const B = S().cur.b; B.spawnT = 0; B.ai = null; B.mass = 60; k.place(B, 600, 600, 0);
    for (let i = 0; i < 40; i++) { B.mass = 60; k.place(B, 600, 600, 0); k.update(1 / 60); }
    k.place(B, 2000, 2000, 0); k.place(P, 2000 - B.Rs - P.Rs + 6, 2000, 0); let f = 0;
    while (k.state === 'play' && f++ < 400) { P.mass = 5000; P.tx = B.x; P.ty = B.y; B.tx = B.x; B.ty = B.y; P.biteCd = Math.min(P.biteCd, 0); k.update(1 / 60); }
    const out = { won: k.state, wonMass: k.stages.stg.wonMass };
    document.getElementById('again').click(); out.state = k.state; out.mass = k.player.mass; return out; })()`);
  assert(r.won === 'won', `the win did not come: ${r.won}`);
  assert(r.state === 'play' && r.mass > 4500, `second shift: ${r.state}, mass ${r.mass} (won with ${r.wonMass})`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('stages: the trophy card fits a phone: close button out of the bitten corner, the card scrolls in landscape', async () => {
  for (const locale of ['ru-RU', 'en-US'])
    try {
      for (const [w, h] of [
        [390, 844],
        [844, 390],
      ]) {
        const g = await open({ locale, width: w, height: h, touch: true, play: false, returning: true });
        const r = await g.page.evaluate(`(() => { ${STG}
      const P = free(); P.mass = 1600; S().i = 2; S().endT = -99; run(0.1); const B = S().cur.b; B.spawnT = 0; B.ai = null; B.mass = 60;
      k.place(B, 2000, 2000, 0); k.place(P, 2000 - B.Rs - P.Rs + 6, 2000, 0); let f = 0;
      while (k.state === 'play' && f++ < 400) { P.tx = B.x; P.ty = B.y; B.tx = B.x; B.ty = B.y; P.biteCd = Math.min(P.biteCd, 0); k.update(1 / 60); }
      const c = document.querySelector('#over .card'), cr = c.getBoundingClientRect(), x = document.getElementById('overX').getBoundingClientRect();
      const again = document.getElementById('again'); again.scrollIntoView(); const ar = again.getBoundingClientRect();
      return { trophy: c.classList.contains('trophy'), x: [x.left, x.top, x.right, x.bottom], card: [cr.left, cr.top, cr.right, cr.bottom],
        scrolls: c.scrollHeight > c.clientHeight, againIn: ar.top >= 0 && ar.bottom <= innerHeight, w: innerWidth, h: innerHeight }; })()`);
        const [xl, xt, xr, xb] = r.x;
        assert(r.trophy, `${w}x${h}: no trophy`);
        assert(xl >= 0 && xt >= 0 && xr <= r.w && xb <= r.h, `${w}x${h}: close button off screen ${r.x}`);
        assert(!(xr > r.card[2] - 60 && xt < r.card[1] + 60), `${w}x${h}: close button in the bitten corner ${r.x} card ${r.card}`);
        assert(r.againIn, `${w}x${h}: the main button cannot be reached`);
        assert(g.errors.length === 0, g.errors.join(' | '));
        await g.close();
      }
    } catch (e) {
      throw new Error(locale + ': ' + e.message);
    }
});

test('trophy: the glaze runs only while the win card is shown', async () => {
  const WIN = `const beat = () => { const P = free(); P.mass = 1600; S().i = 2; S().endT = -99; run(0.1); const B = S().cur.b; B.spawnT = 0; B.ai = null; B.mass = 60;
      k.place(B, 2000, 2000, 0); k.place(P, 2000 - B.Rs - P.Rs + 6, 2000, 0); let f = 0;
      while (k.state === 'play' && f++ < 400) { P.tx = B.x; P.ty = B.y; B.tx = B.x; B.ty = B.y; P.biteCd = Math.min(P.biteCd, 0); k.update(1 / 60); } };
    const raf = (n) => new Promise((res) => { const s = () => (n-- > 0 ? requestAnimationFrame(s) : res()); s(); });
    const fx = () => document.getElementById('trophyFx');
    const shown = () => { const c = fx(); return !!c && getComputedStyle(c).display !== 'none' && c.getBoundingClientRect().width > 0; };`;
  const g = await open({ width: 390, height: 844, touch: true, dpr: 2, play: false, returning: true });
  const r = await g.page.evaluate(`(async () => { ${STG} ${WIN} const out = {};
    out.before = !!k.trophy && k.trophy.running;
    beat(); out.state = k.state;
    await new Promise((res) => setTimeout(res, 1500));
    out.running = k.trophy.running; out.frames = k.trophy.frames; out.shown = shown();
    { const c = fx(), card = document.querySelector('#over .card'), cr = c.getBoundingClientRect(), kr = card.getBoundingClientRect();
      out.size = [cr.left - kr.left, cr.top - kr.top, cr.width - kr.width, cr.height - kr.height].map((v) => Math.round(v));
      out.px = [c.width, c.height, Math.round((card.offsetWidth + 48) * devicePixelRatio), Math.round((card.offsetHeight + 48) * devicePixelRatio)];
      out.cardT = card.style.transform; }
    document.getElementById('again').click(); await raf(2);
    out.afterShift = k.trophy.running; const f0 = k.trophy.frames; await raf(30); out.grew = k.trophy.frames - f0; out.shownShift = shown();
    // die in the second shift: the death card has no glaze
    const Q = k.player, G = k.spawnBot(3000); G.spawnT = 0; G.ai = null; Q.mass = 20; Q.spawnT = 0;
    k.place(G, 2600, 2600, 0); k.place(Q, 2600 + G.Rs + Q.Rs - 6, 2600, 0);
    for (let f = 0; Q.alive && f < 20 * 60; f++) { G.biteCd = Math.min(G.biteCd, 0); Q.graceT = 99; G.tx = Q.x; G.ty = Q.y; k.update(1 / 60); }
    for (let f = 0; document.getElementById('over').classList.contains('hidden') && f < 5 * 60; f++) k.update(1 / 60);
    await raf(3); out.dead = [k.state, k.trophy.running, shown()];
    // a win, then «В меню»; a win, then a new game from the menu: each stops it
    k.toMenu(); beat(); await raf(3); out.win2 = k.trophy.running; document.getElementById('toMenu').click(); await raf(2); out.menu = [k.state, k.trophy.running, shown()];
    beat(); await raf(3); k.toMenu(); k.startGame(); await raf(2); out.newGame = [k.state, k.trophy.running, shown()];
    return out; })()`);
  assert(r.before === false, `no glaze before a win: ${r.before}`);
  assert(r.state === 'won' && r.running && r.frames > 30 && r.shown, `the glaze on the win card: ${JSON.stringify(r)}`);
  assert(r.size.join() === '-24,-24,48,48', `the canvas is the card + 24 px: ${r.size}`);
  assert(r.px[0] === r.px[2] && r.px[1] === r.px[3], `the canvas follows the pixel ratio: ${r.px}`);
  assert(!r.cardT || r.cardT === 'none', `the pop-in must end at rest: "${r.cardT}"`);
  assert(r.afterShift === false && r.grew === 0 && !r.shownShift, `«Вторая смена» stops it: ${JSON.stringify([r.afterShift, r.grew, r.shownShift])}`);
  assert(r.dead[0] === 'dead' && r.dead[1] === false && r.dead[2] === false, `the death card has no glaze: ${r.dead}`);
  assert(r.win2 && r.menu[0] === 'menu' && !r.menu[1] && !r.menu[2], `«В меню» stops it: ${JSON.stringify([r.win2, r.menu])}`);
  assert(r.newGame[0] === 'play' && !r.newGame[1] && !r.newGame[2], `a new game stops it: ${r.newGame}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
  // calm: the frame is drawn once, whole and still, with no loop
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'ru-RU' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => localStorage.getItem('kus.best') === null && localStorage.setItem('kus.best', '0'));
  await page.goto(URL);
  await page.waitForTimeout(600);
  const c = await page.evaluate(`(async () => { ${STG} ${WIN} beat(); await raf(20);
    return { state: k.state, running: k.trophy.running, frames: k.trophy.frames, shown: shown(), t: document.querySelector('#over .card').style.transform }; })()`);
  assert(c.state === 'won' && !c.running && c.frames === 1 && c.shown && !c.t, `calm: one still frame ${JSON.stringify(c)}`);
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
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
  for (const locale of ['ru-RU', 'en-US'])
    try {
      for (const opt of [
        { width: 360, height: 640, touch: true, dpr: 2 },
        { width: 844, height: 390, touch: true, dpr: 2 },
      ]) {
        const g = await open({ locale, ...opt, play: false, returning: true });
        const r = await g.page.evaluate(`(() => { ${STG} const out = {};
      const P = free(); P.stats.maxMass = 135; P.mass = 135; P.pMagnet = 4.9; run(1 / 30);
      const st = document.getElementById('stage'), fx = document.getElementById('fx');
      out.hungry = st.classList.contains('hungry'); out.chomp0 = st.classList.contains('chomp');
      out.p = parseFloat(st.style.getPropertyValue('--p')); out.ic = !!st.querySelector('.ic'); out.kind = k.stages.kind();
      document.getElementById('feed').innerHTML = ''; // hints are wider than the column by design: measure the pills
      const sr = document.getElementById('score').getBoundingClientRect(), br = document.getElementById('board').getBoundingClientRect();
      out.right = sr.right; out.hit = sr.right > br.left && sr.bottom > br.top && sr.top < br.bottom;
      const coins = fx.querySelectorAll('.coin[data-k=magnet]');
      out.coins = coins.length; out.t = coins.length ? parseFloat(coins[0].style.getPropertyValue('--t')) : -1; out.fxText = fx.textContent.trim();
      out.streakChip = /Серия|Streak/.test(fx.textContent);
      // all three buffs at once under the tallest table (the player out of the top five adds a gap row and its own row):
      // the coins never reach the table, each label stays beside its coin. The coins are measured, not #fx: its box is its max-width once they wrap
      let tall = 0; for (const b of k.blobs) if (b !== P && b.alive && tall < 6) { b.mass = 500 + tall * 10; tall++; }
      P.pSpeed = 9; P.pShield = 9; P.pMagnet = 9; run(0.5);
      const b3 = document.getElementById('board').getBoundingClientRect(), us = [...fx.querySelectorAll('.fxu')].map((u) => u.getBoundingClientRect());
      out.rows = [...document.querySelectorAll('#lb li')].filter((li) => li.offsetHeight).length;
      out.n3 = fx.querySelectorAll('.coin').length; out.fxRight = Math.max(...us.map((u) => u.right));
      out.fxHit = us.some((u) => u.right > b3.left && u.bottom > b3.top && u.top < b3.bottom);
      out.split = [...fx.querySelectorAll('.fxu')].some((u) => u.querySelector('b').getBoundingClientRect().top > u.querySelector('.coin').getBoundingClientRect().bottom);
      P.pSpeed = 0; P.pShield = 0;
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
        assert(r.n3 === 3 && r.fxRight <= 216 && !r.fxHit && !r.split, `${w}: three buffs: ${JSON.stringify([r.n3, r.fxRight, r.fxHit, r.split])}`);
        assert(r.rows === 7 || opt.height < 520, `${w}: the setup needs the tall table, it has ${r.rows} rows`);
        assert(
          r.started && r.late <= 2 && r.chomp && !r.hungry2,
          `${w}: the jaws must chomp within 2 frames of the raid start (${JSON.stringify(r)})`,
        );
        assert(!r.chomp1, `${w}: the chomp must stop after about 0.64 s`);
        assert(
          r.coins === 1 && r.t > 0.55 && r.t < 0.65 && r.fxText === (locale === 'en-US' ? '5 s' : '5 с') && !r.streakChip,
          `${w}: buff coin ${JSON.stringify([r.coins, r.t, r.fxText])}`,
        );
        assert(g.errors.length === 0, g.errors.join(' | '));
        await g.close();
      }
    } catch (e) {
      throw new Error(locale + ': ' + e.message);
    }
});

// The pill's endless animations (stripes, hungry jaws, rain drops) must run on the compositor: one the page has to lay out
// costs a layout every frame on a phone. The game is paused after each setup (startGame unpauses it), so the HUD stays still
// and only the pill animates; the canvas still draws every frame. Style recalcs are not counted:
// while the canvas draws every frame, Chrome ticks the style of every running animation, composited or not.
test('perf: the stage pill animates without a page layout every frame', async () => {
  const g = await open({ width: 390, height: 844, touch: true, dpr: 3, play: false, returning: true });
  const cdp = await g.page.context().newCDPSession(g.page);
  await cdp.send('Performance.enable');
  const counts = async () => {
    const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    return { styles: m.RecalcStyleCount, layouts: m.LayoutCount };
  };
  const quiet = async (state) => {
    const a = await counts();
    await g.page.waitForTimeout(1500);
    const b = await counts(),
      d = { styles: b.styles - a.styles, layouts: b.layouts - a.layouts };
    assert(d.layouts <= 5, `${state}: ${d.layouts} layouts in 1.5 s (${d.styles} style recalcs)`);
  };
  const hungry = `(() => { ${STG} const P = free(); P.stats.maxMass = 135; P.mass = 135; run(1 / 30);
    document.getElementById('feed').innerHTML = ''; k.pause(true); return document.getElementById('stage').classList.contains('hungry'); })()`;
  assert(await g.page.evaluate(hungry), 'the pill must be hungry at mass 135');
  await quiet('hungry jaws');
  const rain = await g.page.evaluate(`(() => { ${STG} const P = free(); const pin = (m) => () => { P.mass = m; P.tx = P.x; P.ty = P.y; };
    P.mass = 150; run(0.1); for (const b of S().cur.pack) b.alive = false; run(0.1); run(8.2, pin(605));
    document.getElementById('feed').innerHTML = ''; k.pause(true); return !!(S().cur && S().cur.k === 'rain' && document.querySelector('#stage .rain')); })()`);
  assert(rain, 'the rain must be on with its icon');
  await quiet('rain drops');
  await g.page.evaluate(`(() => { ${STG} free(); run(0.5); k.pause(true); document.getElementById('stage').style.setProperty('--p', '0'); })()`);
  await g.page.waitForTimeout(600);
  const fillW = await g.page.evaluate(() => {
    const f = document.querySelector('#stage .fill').getBoundingClientRect(),
      s = document.getElementById('stage').getBoundingClientRect();
    return Math.max(0, Math.min(f.right, s.right) - Math.max(f.left, s.left)); // the part of the fill inside the pill
  });
  assert(fillW < 1, `an empty pill shows ${fillW}px of stripes`);
  await g.page.emulateMedia({ reducedMotion: 'reduce' });
  await g.page.evaluate(hungry);
  const endless = await g.page.evaluate(
    () =>
      document
        .getElementById('stage')
        .getAnimations({ subtree: true })
        .filter((a) => a.playState === 'running' && a.effect.getTiming().iterations === Infinity).length,
  );
  assert(endless === 0, `reduced motion: ${endless} endless animations still run on the pill`);
  // a phone that adapt has already stepped down to less detail also stops the endless ones: while the canvas draws every frame,
  // Chrome restyles every running animation each frame, composited or not
  await g.page.emulateMedia({ reducedMotion: 'no-preference' });
  const lite = await g.page.evaluate(hungry);
  await g.page.evaluate(() => (window.__kus.setLod(1), window.__kus.pause(false))); // frames run, the pill stays hungry
  await g.page.waitForTimeout(100);
  const endlessLite = await g.page.evaluate(
    () =>
      document
        .getElementById('stage')
        .getAnimations({ subtree: true })
        .filter((a) => a.playState === 'running' && a.effect.getTiming().iterations === Infinity).length,
  );
  assert(lite && endlessLite === 0, `lod 1: ${endlessLite} endless animations still run on the pill`);
  await g.page.evaluate(() => (window.__kus.setLod(0), window.__kus.pause(false)));
  await g.page.waitForTimeout(100);
  const endlessFull = await g.page.evaluate(
    () =>
      document
        .getElementById('stage')
        .getAnimations({ subtree: true })
        .filter((a) => a.playState === 'running').length,
  );
  assert(endlessFull >= 2, `lod 0: the pill must animate again, ${endlessFull} animations run`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

// smarter bots: a scene with the player and a few bots, everything else parked far away.
// Sound is off: Sfx.pop skips clicks by the audio clock, so with sound on Math.random is drawn a different number of times on a slower machine.
const BOTS = `const k = window.__kus, P = k.player; k.pause(true); k.Sfx.ok = () => false;
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
  // A seeded Math.random from here on. The field before this point still comes from real frames, so runs are alike, not identical.
  const r = await g.page.evaluate(`(() => { let seed = 1; Math.random = () => { seed = (seed + 0x6d2b79f5) >>> 0; let x = seed;
      x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    ${BOTS}
    // only the four on the field: a bigger bot wandering in scares the members off, and packs between bots are not this test
    const only = (four) => { for (const o of k.blobs) if (o !== P && four.indexOf(o) < 0) o.alive = false; k.place(P, 2000, 2000, 0); };
    k.setDiff('extreme'); let formed = 0, size = 0, went = 0, ended = 0;
    for (let t = 0; t < 8 && !went; t++) {
      // members may still run off from the giant or eat each other before the pack goes in, so try a few fresh groups;
      // a pack that falls apart holds the next one off for up to 10.4 s (packCd on extreme), so wait that out on an empty field
      P.mass = 500; P.pShield = 99; only([]);
      if (t) run(11, () => only([]));
      // round its back and sides, not in front of its mouth, where a member runs off before the pack forms
      const four = [0, 1, 2, 3].map((i) => bot(70, 2000 + Math.cos(Math.PI + (i - 1.5) * 0.9) * 420, 2000 + Math.sin(Math.PI + (i - 1.5) * 0.9) * 420, 0));
      run(1, () => only(four));
      P.pShield = 0; let on = 0, off = 0;
      for (let i = 0; i < 20 * 60 && !off; i++) {
        only(four); P.biteCd = 1;
        const pk = k.packs.find((p) => p.tgt === P);
        if (pk) { on = formed = 1; size = Math.max(size, pk.m.length); if (pk.go) went = 1; } else if (on) ended = off = 1;
        k.update(1 / 60);
      }
    }
    return { formed, size, went, ended }; })()`);
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

// On phones the buttons sit on the left and the joystick hint on the right by default; «Справа» moves them back and is remembered.
// A save from before this default (lefty: false without hv) is the old default, not a choice: it gets the new one.
test('settings: phone buttons on the left by default, the hand switch is remembered', async () => {
  const side = (page) =>
    page.evaluate(() => {
      const d = document.getElementById('dash').getBoundingClientRect(),
        t = document.getElementById('dodge').getBoundingClientRect();
      return {
        lefty: document.body.classList.contains('lefty'),
        dash: d.left + d.width / 2,
        tongue: t.left + t.width / 2,
        w: innerWidth,
        pressed: document.querySelector('#handSeg [aria-pressed="true"]')?.dataset.v,
        saved: JSON.parse(localStorage.getItem('kus.set') || 'null'),
      };
    });
  const g = await open({ width: 390, height: 844, touch: true });
  const fresh = await side(g.page);
  assert(
    fresh.lefty && fresh.dash < fresh.w / 2 && fresh.tongue < fresh.w / 2 && fresh.pressed === '1',
    `fresh phone: Кусь and Язык must sit on the left: ${JSON.stringify(fresh)}`,
  );
  await g.page.evaluate(() => document.querySelector('#handSeg button[data-v="0"]').click());
  const right = await side(g.page);
  assert(
    !right.lefty && right.dash > right.w / 2 && right.pressed === '0' && right.saved && right.saved.lefty === false && right.saved.hv === 2,
    `«Справа» must move the buttons right and save it: ${JSON.stringify(right)}`,
  );
  await g.page.reload();
  await g.page.waitForTimeout(600);
  await g.page.tap('#play');
  await g.page.waitForTimeout(250);
  const again = await side(g.page);
  assert(!again.lefty && again.dash > again.w / 2, `the chosen «Справа» must survive a reload: ${JSON.stringify(again)}`);
  await g.close();
  const old = await open({ width: 390, height: 844, touch: true, play: false });
  await old.page.evaluate(() => localStorage.setItem('kus.set', JSON.stringify({ lefty: false, bs: 1, gfx: 'auto', fps: false })));
  await old.page.reload();
  await old.page.waitForTimeout(600);
  await old.page.tap('#play');
  await old.page.waitForTimeout(250);
  const oldSave = await side(old.page);
  assert(oldSave.lefty && oldSave.dash < oldSave.w / 2, `an old save with the old default must get the new left default: ${JSON.stringify(oldSave)}`);
  assert(g.errors.length === 0 && old.errors.length === 0, [...g.errors, ...old.errors].join(' | '));
  await old.close();
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

// Swallows whole in a row (each within ANN.win s of the last) climb a ladder of big words across the screen.
const ANN = `const ann = document.getElementById('announce'), word = () => ann.querySelector('b').textContent, shown = () => ann.classList.contains('on');
  // n tiny candies at the player's mouth, frames until they are all swallowed; returns how many were
  const gulp = (n = 1) => { const L = []; for (let i = 0; i < n; i++) { const s = k.spawnBot(20); s.ai = null; s.spawnT = 0; L.push(s); }
    for (let i = 0; i < 2; i++) k.update(1 / 60);
    const k0 = P.stats.kills; let f = 0;
    while (f++ < 240 && P.stats.kills < k0 + n) { const s = L.find((b) => b.alive); if (!s) break;
      k.place(s, P.x + P.Rs + s.Rs - 4, P.y, 0); P.face = 0; P.tx = s.x; P.ty = s.y; P.biteCd = Math.min(P.biteCd, 0); k.update(1 / 60); }
    return P.stats.kills - k0; };`;

test('announce: swallows in a row climb the ladder; a pause over 5 s starts again', async () => {
  const g = await open();
  const r = await g.page.evaluate(`(() => { ${QUIET} ${ANN} const out = {};
    P.mass = 400; k.place(P, 2000, 2500, 0); for (let i = 0; i < 30; i++) k.update(1 / 60); k.annReset();
    out.g1 = gulp(); out.one = shown();
    out.g2 = gulp(); out.w2 = word(); out.on2 = shown();
    gulp(); out.w3 = word();
    gulp(); out.w4 = word();
    gulp(); gulp(); out.w6 = word(); out.step6 = k.ann.step; out.n6 = k.ann.n;
    k.annFrame(1.6, false); out.gone = !shown();
    for (let i = 0; i < 5.2 * 60; i++) { P.mass = 400; k.update(1 / 60); }
    gulp(); out.nAfter = k.ann.n; out.reshown = shown(); return out; })()`);
  assert(r.g1 === 1 && r.g2 === 1, `the tiny candies must be swallowed (${r.g1}, ${r.g2})`);
  assert(!r.one, 'one swallow must not announce anything');
  assert(r.w2 === 'Двойной кусь!' && r.on2, `2 in a row: "${r.w2}" ${r.on2}`);
  assert(r.w3 === 'Тройной кусь!!' && r.w4 === 'Обжорство!!!', `3 and 4 in a row: "${r.w3}", "${r.w4}"`);
  assert(r.w6 === 'Монстр кусь!!!' && r.step6 === 5 && r.n6 === 6, `6 in a row stays on step 5: "${r.w6}" step ${r.step6} n ${r.n6}`);
  assert(r.gone, 'the word must be gone 1.6 s after it came');
  assert(r.nAfter === 1 && !r.reshown, `after 5.2 s the chain starts again: n ${r.nAfter}, shown ${r.reshown}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('announce: English words', async () => {
  const g = await open({ locale: 'en-US' });
  const r = await g.page.evaluate(`(() => { ${QUIET} ${ANN} const w = [];
    for (const s of [2, 3, 4, 5]) { k.annShow(s); w.push(word()); } return w; })()`);
  assert(r.join('|') === 'Double bite!|Triple bite!!|Gluttony!!!|Monster bite!!!', `English ladder: ${r.join('|')}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('announce: the boss does not count and breaks the chain; chains work in the boss fight; death, a new run and the second shift reset it', async () => {
  const g = await open({ play: false, returning: true });
  const r = await g.page.evaluate(`(() => { ${STG} ${ANN.replace('const ann', 'let P; const ann')} const out = {};
    P = free(); P.mass = 1600; S().i = 2; S().endT = -99; run(0.1); if (!S().cur) throw new Error('no boss');
    const B = S().cur.b; B.spawnT = 0; B.ai = null; k.place(B, 600, 600, 0); k.place(P, 2000, 2500, 0); k.annReset();
    gulp(); gulp(); out.fight = word(); out.fightOn = shown(); out.n2 = k.ann.n;
    B.mass = 60; k.place(B, 600, 600, 0); for (let i = 0; i < 40; i++) { B.mass = 60; k.place(B, 600, 600, 0); k.update(1 / 60); }
    k.place(B, 2000, 2000, 0); k.place(P, 2000 - B.Rs - P.Rs + 6, 2000, 0); let f = 0;
    while (k.state === 'play' && f++ < 400) { P.tx = B.x; P.ty = B.y; B.tx = B.x; B.ty = B.y; P.biteCd = Math.min(P.biteCd, 0); k.update(1 / 60); }
    out.won = !!k.run.won; out.nBoss = k.ann.n; out.overOn = shown();
    document.getElementById('again').click(); P = k.player; P.spawnT = 0; out.nShift = k.ann.n;
    k.place(P, 2000, 2500, 0); gulp(); gulp(); out.shiftWord = word(); k.die(null); out.nDead = k.ann.n; out.deadOn = shown();
    P = free(); out.nRun = k.ann.n; return out; })()`);
  assert(r.fight === 'Двойной кусь!' && r.fightOn && r.n2 === 2, `chains must announce in the boss fight: "${r.fight}" ${r.fightOn} n ${r.n2}`);
  assert(r.won && r.nBoss === 0 && !r.overOn, `the boss must not count and must break the chain: won ${r.won}, n ${r.nBoss}, shown ${r.overOn}`);
  assert(r.nShift === 0, `the second shift must start a fresh chain: n ${r.nShift}`);
  assert(r.shiftWord === 'Двойной кусь!', `chains announce in the second shift: "${r.shiftWord}"`);
  assert(r.nDead === 0 && !r.deadOn, `death must hide the word and reset the chain: n ${r.nDead}, shown ${r.deadOn}`);
  assert(r.nRun === 0, `a new run must start a fresh chain: n ${r.nRun}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('announce: not behind the menu; two swallows in one frame; a pause holds it; the stamp waits; cheats still show it', async () => {
  const g = await open();
  const r = await g.page.evaluate(`(async () => { ${QUIET} ${ANN} const out = {};
    P.mass = 400; k.place(P, 2000, 2500, 0); for (let i = 0; i < 30; i++) k.update(1 / 60); k.annReset();
    const a = k.spawnBot(20), b = k.spawnBot(20), c = k.spawnBot(20); k.annSwallow(a); k.annSwallow(b); k.annSwallow(c);
    out.same = k.ann.step; out.sameW = word(); k.annFrame(1.6, false);
    k.annShow(2); k.pause(true); const t0 = k.ann.t; await new Promise((res) => setTimeout(res, 1500)); out.held = shown() && k.ann.t === t0;
    out.paused = getComputedStyle(ann.querySelector('b')).animationPlayState; k.annFrame(1.6, false);
    k.annReset(); k.stamps.length = 0; P.combo = 0; P.comboT = 0; gulp(); gulp(); out.stamps = k.stamps.length; out.onForStamp = shown();
    k.annReset(); k.CHEAT.heal = true; gulp(); gulp(); out.cheat = word(); k.CHEAT.heal = false;
    k.toMenu(); k.annShow(3); out.menu = shown(); return out; })()`);
  assert(r.same === 3 && r.sameW === 'Тройной кусь!!', `three swallows in one frame: step ${r.same} "${r.sameW}"`);
  assert(r.held && r.paused === 'paused', `a pause must hold the word (held ${r.held}, animation ${r.paused})`);
  assert(r.onForStamp && r.stamps === 0, `while the word is up no streak stamp shows (stamps ${r.stamps})`);
  assert(r.cheat === 'Двойной кусь!', `cheats still announce: "${r.cheat}"`);
  assert(!r.menu, 'nothing shows behind the menu');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

// where the big word lands on a phone: on screen, clear of the controls, the HUD and the player's own candy
const ANN_BOX = `(() => { const w = document.querySelector('#announce b');
  for (const a of w.getAnimations()) a.currentTime = 400; // the settled word, whatever the machine's pace: past the fly-in, before the fade
  const r = w.getBoundingClientRect(), bad = [];
  if (r.left < 8 || r.right > innerWidth - 8 || r.top < 8) bad.push('off screen ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
  for (const id of ['dash', 'dodge', 'score', 'board', 'pauseBtn', 'mute']) { const e = document.getElementById(id); if (!e || getComputedStyle(e).display === 'none' || getComputedStyle(e).visibility === 'hidden') continue;
    for (const q of id === 'score' ? [...e.children].filter((c) => c.id !== 'feed' && c.offsetParent && c.getBoundingClientRect().height > 0) : [e]) { const b = q.getBoundingClientRect();
      if (b.width && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top) bad.push('overlaps #' + (q.id || id)); } }
  const A = window.__kus.ann;
  if (!(A.top > 0 && A.bot > A.top)) bad.push('no ann.top / ann.bot');
  else if (r.bottom > A.top + 0.5 && r.top < A.bot - 0.5) bad.push('covers the candy: ' + Math.round(r.top) + '..' + Math.round(r.bottom) + ' in ' + Math.round(A.top) + '..' + Math.round(A.bot));
  return { bad, h: Math.round(r.height), fs: parseFloat(getComputedStyle(document.querySelector('#announce b')).fontSize) }; })()`;

test('announce: fits 360x640 and 844x390 in both languages, clear of the buttons, the HUD and the player', async () => {
  const fails = [];
  for (const locale of ['ru-RU', 'en-US'])
    for (const [width, height] of [
      [360, 640],
      [844, 390],
    ]) {
      const g = await open({ locale, width, height, touch: true, dpr: 2 });
      for (const mass of [400, 2500]) {
        await g.page.evaluate(
          `(() => { ${QUIET} P.mass = ${mass}; for (let i = 0; i < 240; i++) { P.mass = ${mass}; k.update(1 / 60); } k.annShow(5); k.pause(false); })()`,
        );
        await g.page.waitForTimeout(350);
        const r = await g.page.evaluate(ANN_BOX);
        if (r.bad.length || r.fs < 16) fails.push(`${locale} ${width}x${height} mass ${mass}: ${r.bad.join(', ')} font ${r.fs}`);
      }
      if (g.errors.length) fails.push(g.errors.join(' | '));
      await g.close();
    }
  assert(fails.length === 0, fails.join(' | '));
});

test('announce: only the same swallow’s stamp waits; a bite under the word still stamps; an older stamp makes way', async () => {
  const g = await open();
  const r = await g.page.evaluate(`(() => { ${QUIET} const out = {};
    P.mass = 120; for (let i = 0; i < 40; i++) k.update(1 / 60);
    const V = k.spawnBot(400); V.ai = null; V.spawnT = 0; for (let i = 0; i < 30; i++) k.update(1 / 60);
    const bite = (combo) => { k.place(V, 2000, 1500, 0); k.place(P, 2000 - V.Rs - P.Rs + 4, 1500, 0); V.wounds.length = 0; V.mass = 400; P.biteCd = 0;
      P.combo = combo; P.comboT = 4; const n0 = P.stats.bites; let f = 0;
      while (f < 90 && P.stats.bites === n0) { k.pickups.length = 0; P.comboT = Math.max(P.comboT, 1); P.tx = V.x; P.ty = V.y; V.tx = V.x; V.ty = V.y; V.biteCd = 9; k.update(1 / 60); f++; }
      P.biteCd = 999; V.biteCd = 999; return k.stamps.map((s) => s.txt).join(); };
    out.before = bite(1); k.annShow(3); out.cleared = k.stamps.length;
    out.under = bite(4); out.wordUp = k.ann.step > 0; return out; })()`);
  assert(r.before === 'Кусь-кусь!', `a ×2 bite stamps first: "${r.before}"`);
  assert(r.cleared === 0, `the big word clears a stamp already up: ${r.cleared} left`);
  assert(r.wordUp && r.under === 'Хрум-хрум!', `a ×5 bite under the word still stamps Хрум-хрум!: "${r.under}" (word up ${r.wordUp})`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('announce: clear of the ×N label even with a hat on, at its biggest pop', async () => {
  const fails = [];
  for (const [width, height] of [
    [360, 640],
    [844, 390],
  ]) {
    const g = await open({ width, height, touch: true, dpr: 2 });
    for (const hat of ['none', 'crown'])
      for (const mass of [400, 2500]) {
        const r = await g.page
          .evaluate(`(() => { ${QUIET} P.hat = '${hat}'; P.mass = ${mass}; for (let i = 0; i < 240; i++) { P.mass = ${mass}; k.update(1 / 60); }
          P.combo = 3; P.comboT = 4; k.streak.pop = 1; k.annShow(5); k.render(); // drawName sets the label's top as it is drawn
          const top = (k.streak.lt - k.cam.y) * k.cam.z + innerHeight / 2 + k.cam.ky, w = document.querySelector('#announce b');
          for (const a of w.getAnimations()) a.currentTime = 400; const b = w.getBoundingClientRect();
          return { top: Math.round(top), wt: Math.round(b.top), wb: Math.round(b.bottom), bot: Math.round(k.ann.bot) }; })()`);
        if (!(r.wb <= r.top + 0.5 || r.wt >= r.bot - 0.5))
          fails.push(`${width}x${height} hat ${hat} mass ${mass}: word ${r.wt}..${r.wb}, label top ${r.top}`);
      }
    if (g.errors.length) fails.push(g.errors.join(' | '));
    await g.close();
  }
  assert(fails.length === 0, fails.join(' | '));
});

test('announce: a phone turned mid-announcement refits it', async () => {
  const g = await open({ width: 360, height: 640, touch: true, dpr: 2 });
  await g.page.evaluate(`(() => { ${QUIET} P.mass = 400; for (let i = 0; i < 120; i++) k.update(1 / 60); k.annShow(5); k.pause(false); })()`);
  await g.page.waitForTimeout(150);
  await g.page.setViewportSize({ width: 844, height: 390 });
  await g.page.waitForTimeout(250);
  const r = await g.page.evaluate(ANN_BOX);
  assert(r.bad.length === 0, `after turning: ${r.bad.join(', ')}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('announce: glow and sprinkles from step 4, none in calm', async () => {
  const look = `(() => { ${QUIET} P.mass = 400; for (let i = 0; i < 30; i++) k.update(1 / 60); const ann = document.getElementById('announce'), out = {};
    let n0 = k.parts.length; k.annShow(3); out.glow3 = ann.classList.contains('glow'); out.parts3 = k.parts.length - n0;
    n0 = k.parts.length; k.annShow(4); out.glow4 = ann.classList.contains('glow'); out.parts4 = k.parts.length - n0; return out; })()`;
  const g = await open();
  const r = await g.page.evaluate(look);
  assert(!r.glow3 && r.parts3 === 0, `step 3 has no glow or sprinkles (${r.glow3}, ${r.parts3})`);
  assert(r.glow4 && r.parts4 >= 8, `step 4 glows and throws sprinkles (${r.glow4}, ${r.parts4})`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'ru-RU' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => localStorage.setItem('kus.best', '1'));
  await page.goto(URL);
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__kus.startGame());
  await page.waitForTimeout(250);
  const c = await page.evaluate(look);
  assert(!c.glow4 && c.parts4 === 0, `calm: no glow or sprinkles (${c.glow4}, ${c.parts4})`);
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

// A streak bite is felt in the body: the candy swells, crunches and throws bigger gobs; the numbers stay as they were.
test('heavy bite: a streak bite swells the candy and crunches; swallows and bonuses do not; mass gain is unchanged', async () => {
  const g = await open();
  const r = await g.page.evaluate(`(() => { ${QUIET} ${ANN} const out = { sw: [], snd: [] };
    const S = k.Sfx, heard = []; const c0 = S.crunch, h0 = S.chomp;
    S.crunch = function (...a) { heard.push('crunch'); return c0.apply(this, a); }; S.chomp = function (...a) { heard.push('chomp'); return h0.apply(this, a); };
    P.mass = 120; for (let i = 0; i < 40; i++) k.update(1 / 60);
    const V = k.spawnBot(400); V.ai = null; V.spawnT = 0; for (let i = 0; i < 30; i++) k.update(1 / 60);
    P.combo = 0; P.comboT = 0; P.swell = 0;
    const bite = (combo) => { k.place(V, 2000, 1500, 0); k.place(P, 2000 - V.Rs - P.Rs + 4, 1500, 0); V.wounds.length = 0; V.mass = 400; P.biteCd = 0;
      if (combo !== undefined) { // the same state every time: sizes settled, no piece still in the teeth
        for (let i = 0; i < 120; i++) { P.mass = 120; V.mass = 400; P.biteCd = V.biteCd = 9; k.place(V, 2000, 1500, 0); k.place(P, 2000 - V.Rs - P.Rs - 40, 1500, 0); k.update(1 / 60); }
        k.place(P, 2000 - V.Rs - P.Rs + 4, 1500, 0); V.wounds.length = 0; P.biteCd = 0; P.combo = combo; P.comboT = 4; P.swell = 0; }
      heard.length = 0; const n0 = P.stats.bites; let f = 0, sw = 0;
      while (f < 90 && P.stats.bites === n0) { k.pickups.length = 0; P.tx = V.x; P.ty = V.y; V.tx = V.x; V.ty = V.y; V.biteCd = 9; k.update(1 / 60); f++; }
      sw = P.swell; P.biteCd = 999; V.biteCd = 999; return { sw, heard: heard.join() }; };
    for (let n = 1; n <= 5; n++) { const b = bite(); out.sw.push(+b.sw.toFixed(3)); out.snd.push(b.heard); }
    for (let i = 0; i < 60; i++) k.update(1 / 60); out.after = P.swell;
    // the effect touches nothing but the swell: every number on the candy is the same before and after it
    // (whole bites in a live scene differ by dash and wound bonuses from one try to the next, so they cannot be compared)
    const nums = () => { const o = {}; for (const key in P) if (typeof P[key] === 'number') o[key] = P[key]; return o; };
    P.swell = 0; const n0 = nums(), hg = k.heavyBite(P, 5), n1 = nums();
    out.changed = Object.keys(n1).filter((key) => !Object.is(n1[key], n0[key])); out.hg = hg; out.sw5 = P.swell;
    k.HEAVY.on = false; bite(4); out.swOff = P.swell; k.HEAVY.on = true;
    // a swallow and a bonus in a streak: no swell, no crunch
    k.annReset(); P.mass = 400; P.combo = 3; P.comboT = 4; P.swell = 0; heard.length = 0; gulp(); out.gulpSw = P.swell; out.gulpHeard = heard.join();
    P.combo = 3; P.comboT = 4; P.swell = 0; heard.length = 0; k.pickups.length = 0; const pk = { type: 'speed', x: P.x, y: P.y, t: 0 }; k.pickups.push(pk);
    for (let i = 0; i < 10 && k.pickups.includes(pk); i++) { pk.x = P.x; pk.y = P.y; P.comboT = 4; k.update(1 / 60); }
    out.bonusSw = P.swell; out.bonusHeard = heard.join(); out.bonusCombo = P.combo;
    S.crunch = c0; S.chomp = h0; return out; })()`);
  assert(r.sw[0] === 0 && r.snd[0] === 'chomp', `the first bite is not a streak: swell ${r.sw[0]}, sounds ${r.snd[0]}`);
  assert(r.sw[2] > 0.05 && r.sw[4] > r.sw[1], `streak bites swell more each step: ${r.sw}`);
  assert(
    r.snd.slice(1).every((s) => s === 'crunch'),
    `streak bites crunch instead of chomp: ${JSON.stringify(r.snd)}`,
  );
  assert(r.after < 0.005, `the swell settles within a second: ${r.after}`);
  assert(
    r.changed.join() === 'swell' && r.sw5 === 0.16 && Math.abs(r.hg - 1.6) < 1e-9,
    `the effect changes only the swell: ${r.changed} swell ${r.sw5} gobs ×${r.hg}`,
  );
  assert(r.swOff === 0, `with the effect off nothing swells: ${r.swOff}`);
  assert(r.gulpSw === 0 && !r.gulpHeard.includes('crunch'), `a swallow does not swell or crunch: ${r.gulpSw} ${r.gulpHeard}`);
  assert(
    r.bonusCombo === 4 && r.bonusSw === 0 && !r.bonusHeard.includes('crunch'),
    `a bonus does not swell or crunch: combo ${r.bonusCombo} swell ${r.bonusSw} ${r.bonusHeard}`,
  );
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
      ['wrapPop', []],
      ['wrapStep', []],
      ['wrapCatch', []],
      ['wrapUp', [2]],
      ['wrapPay', [true]],
      ['announce', [2]],
      ['announce', [5]],
      ['crunch', [1]],
      ['crunch', [5]],
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
    // sound off, as on iOS before the first tap: the new events stay silent and throw nothing
    const on0 = S.on;
    let offPlays = 0;
    S.play = () => (offPlays++, false);
    S.on = false;
    for (const [m, a] of calls.slice(-4))
      try {
        S[m](...a);
      } catch (e) {
        bad.push(`${m} (off): ${e.message}`);
      }
    S.on = on0;
    S.play = orig;
    const expected = calls.filter(([m]) => window.__kus.SFX_DATA[m]).length;
    return { running: !!S.ok(), bad, failed, missing, withTakes, expected, afterSynth: played - withTakes, ms: S.decodeMs, offPlays };
  });
  assert(r.offPlays === 0, `with the sound off, ${r.offPlays} takes were started`);
  assert(r.running, 'audio context is not running, so nothing was actually tested');
  assert(r.failed === 0 && r.missing.length === 0, `takes that did not decode: ${r.failed}; events missing takes: ${r.missing.join(', ')}`);
  assert(r.withTakes === r.expected, `with takes, ${r.withTakes} of ${r.expected} calls played a take`);
  assert(r.afterSynth === 0, 'with takes switched off, a take was still played');
  assert(r.bad.length === 0, r.bad.join(' | '));
  console.log(`    takes decoded in ${r.ms.toFixed(0)} ms`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

// Reading a box forces a layout right after the HUD's own writes; the minimap still has to follow the table and the buttons.
test('hud: the table and buttons are measured only when the layout can have moved, and unchanged text is not rewritten', async () => {
  const g = await open({ width: 390, height: 844, touch: true, dpr: 3 });
  const page = g.page;
  await page.evaluate(`(() => { ${QUIET}
    window.__reads = 0;
    const gbr = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () { if (this.id === 'board' || this.id === 'dodge') window.__reads++; return gbr.call(this); };
    // every bot, and each one the respawn queue still brings, is put apart and made tame (ambling on the spot) with a frozen mass,
    // and there are no sprinkles: nobody bites, eats or dies. After 6 s the queue (respawns come 1.5-5 s after a death) is empty,
    // so the table changes only when the test says so
    let slot = 0;
    window.__mass = new Map();
    const settle = () => { for (const b of k.blobs) if (!window.__mass.has(b)) {
      if (b !== P) { const x = 300 + (slot % 6) * 600, y = 300 + Math.floor(slot / 6) * 500; k.place(b, x, y); b.tame = true; b.hx = x; b.hy = y; slot++; }
      window.__mass.set(b, Math.round(Math.min(b.mass, 290)) + 0.25); } }; // under 300 nothing melts; off the rounding edge
    k.place(P, 2000, 3600);
    window.__run = (sec) => { for (let i = 0; i < sec * 60; i++) { settle(); for (const [b, m] of window.__mass) b.mass = m; k.food.length = 0; k.update(1 / 60); } };
    window.__run(6); window.__reads = 0; })()`);
  const reads = await page.evaluate(() => (window.__run(3), window.__reads));
  assert(reads <= 2, `the table and buttons were read ${reads} times in 3 s with nothing moving (one measure reads both)`);
  const near = (a, b) => Math.abs(a - b) < 0.5;
  const follows = () =>
    page.evaluate(() => {
      const h = window.__kus.hudBox,
        b = document.getElementById('board').getBoundingClientRect(),
        d = document.getElementById('dodge').getBoundingClientRect();
      return { h, b: [b.bottom, b.left], d: d.top };
    });
  await page.evaluate(() => (document.getElementById('board').click(), window.__run(0.3)));
  let f = await follows();
  assert(f.h && near(f.h.boardBottom, f.b[0]) && near(f.h.boardLeft, f.b[1]), `folded table: ${JSON.stringify(f)}`);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => (dispatchEvent(new Event('resize')), window.__run(0.3)));
  f = await follows();
  assert(near(f.h.boardBottom, f.b[0]) && near(f.h.btnTop, f.d), `landscape: ${JSON.stringify(f)}`);
  await page.evaluate(() => {
    const P = window.__kus.player;
    window.__mass.set(P, 3000); // the player tops the table: the gap row and its own row go, the table gets shorter
    window.__run(0.3);
  });
  f = await follows();
  assert(near(f.h.boardBottom, f.b[0]), `the table changed rows: ${JSON.stringify(f)}`);
  // live play: the masses in the table change every tick, its rows do not, so it is not measured again
  const live = await page.evaluate(() => {
    window.__reads = 0;
    for (let i = 0; i < 180; i++) {
      for (const [b, m] of window.__mass) if (!b.isPlayer) window.__mass.set(b, m + 0.5);
      window.__run(1 / 60);
    }
    return window.__reads;
  });
  assert(live <= 2, `with only the numbers changing the table was read ${live} times in 3 s`);
  // the button size from the pause card moves the buttons
  await page.evaluate(() => (document.querySelector('#sizeSeg [data-v="1.18"]').click(), window.__run(0.3)));
  f = await follows();
  assert(near(f.h.btnTop, f.d), `bigger buttons: ${JSON.stringify(f)}`);
  // text: the timer changes once a second, the daily goal never; neither is rewritten in between
  const writes = (mode, id) =>
    page.evaluate(
      ([mode, id]) => {
        const k = window.__kus;
        k.pause(true);
        k.setMode(mode);
        if (k.state !== 'menu') k.toMenu();
        k.startGame();
        k.pause(true);
        for (let i = 0; i < 30; i++) k.update(1 / 60);
        let n = 0;
        const mo = new MutationObserver((l) => (n += l.length));
        mo.observe(document.getElementById(id), { childList: true, characterData: true, subtree: true });
        for (let i = 0; i < 180; i++) k.update(1 / 60);
        n += mo.takeRecords().length;
        mo.disconnect();
        return { n, text: document.getElementById(id).textContent };
      },
      [mode, id],
    );
  const tm = await writes('t3', 'timer');
  assert(tm.text && tm.n <= 4, `3-minute timer "${tm.text}": ${tm.n} rewrites in 3 s`);
  const gl = await writes('daily', 'goal');
  assert(gl.text && gl.n === 0, `daily goal "${gl.text}": ${gl.n} rewrites in 3 s`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

// Who eats or pulls a sprinkle: these pin the behaviour across grid cells (256 px), at the world's edge and with a magnet's long reach.
test('food: eating and pulling sprinkles work across cell borders, at the world edge and with a magnet', async () => {
  const g = await open();
  const r = await g.page.evaluate(`(() => { ${QUIET} const out = {};
    const clear = (x, y) => { for (const f of k.food) if (Math.hypot(f.x - x, f.y - y) < 700) { f.x = 3900; f.y = 100; f.vx = f.vy = 0; } };
    const drop = (x, y) => { const f = { kind: 0, x, y, m: 1, c: 0, ai: 0, sz: 7 }; k.food.push(f); return f; };
    // 1: eaten in one step by a candy in the next cell over
    k.place(P, 1020, 2000, 0); clear(1020, 2000); let f = drop(1020 + P.Rs * 0.8, 2000), m = P.mass;
    out.crossX = f.x; k.update(1 / 60); out.eaten = !k.food.includes(f); out.gain = P.mass - m;
    // 2: a magnet pulls a sprinkle 300 px behind the face, two cells away; without one it stays put
    k.place(P, 2040, 2000, 0); clear(2040, 2000); P.pMagnet = 5; f = drop(1740, 2000); k.update(1 / 60); out.pulled = f.x - 1740;
    P.pMagnet = 0; k.place(P, 2040, 2000, 0); f = drop(1740, 2000); k.update(1 / 60); out.still = Math.abs(f.x - 1740) + Math.abs(f.y - 2000);
    // 3: the corner of the world
    k.place(P, P.Rs, P.Rs, Math.PI * 1.25); clear(0, 0); f = drop(5, 5); let n = 0;
    for (; n < 30 && k.food.includes(f); n++) k.update(1 / 60); out.corner = n;
    // 4: a bot eats across the border too
    const B = k.blobs.find((b) => b !== P && !b.kind && b.alive); B.ai = null; k.place(B, 3060, 3000, 0); clear(3060, 3000);
    f = drop(3060 + B.Rs * 0.8, 3000); m = B.mass; out.botX = f.x; k.update(1 / 60); out.botEaten = !k.food.includes(f); out.botGain = B.mass - m;
    // 5: a sprinkle whose position went bad (NaN, from some other bug) lies inert instead of stopping the game
    const bad = drop(NaN, NaN); try { k.update(1 / 60); out.nan = 'ok'; } catch (e) { out.nan = String(e); } k.food.splice(k.food.indexOf(bad), 1);
    return out; })()`);
  assert(r.crossX > 1024, `setup: the sprinkle at x ${r.crossX} must be in the next cell`);
  assert(r.eaten && Math.abs(r.gain - 1) < 0.01, `a sprinkle across the cell border: eaten ${r.eaten}, mass +${r.gain}`);
  assert(r.pulled > 5 && r.still < 0.001, `magnet: pulled ${r.pulled} px; without it moved ${r.still} px`);
  assert(r.corner < 30, `a sprinkle in the corner was not eaten in 30 steps`);
  assert(r.botX > 3072 && r.botEaten && Math.abs(r.botGain - 1) < 0.01, `a bot across the border: ${JSON.stringify(r)}`);
  assert(r.nan === 'ok', `a NaN sprinkle: ${r.nan}`);
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

// ---------- language ----------
test('lang: phone language picks ru or en; a saved choice wins; junk and blocked storage fall back', async () => {
  const pick = async (locale, init) => {
    const ctx = await browser.newContext({ locale });
    const page = await ctx.newPage();
    if (init) await page.addInitScript(init);
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(URL);
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({ lang: window.__kus.LANG, html: document.documentElement.lang, title: document.title }));
    await ctx.close();
    return { ...r, errors };
  };
  const en = await pick('en-US'),
    ru = await pick('ru-RU'),
    be = await pick('be-BY'),
    kk = await pick('kk-KZ'),
    de = await pick('de-DE');
  assert(en.lang === 'en' && en.html === 'en' && en.title.startsWith('KUS.io'), `en-US: ${JSON.stringify(en)}`);
  assert(ru.lang === 'ru' && ru.html === 'ru' && ru.title.startsWith('КУСЬ.io'), `ru-RU: ${JSON.stringify(ru)}`);
  assert(be.lang === 'ru' && kk.lang === 'ru' && de.lang === 'en', `be ${be.lang}, kk ${kk.lang}, de ${de.lang}`);
  const saved = await pick('ru-RU', () => localStorage.setItem('kus.lang', 'en'));
  assert(saved.lang === 'en', `kus.lang=en on ru-RU: ${saved.lang}`);
  for (const junk of ['de', '', 'EN']) {
    const j = await pick('ru-RU', `localStorage.setItem('kus.lang', ${JSON.stringify(junk)})`);
    assert(j.lang === 'ru', `kus.lang=${JSON.stringify(junk)}: ${j.lang}`);
  }
  const blocked = await pick('en-US', () => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('blocked');
      },
    });
  });
  assert(blocked.lang === 'en' && blocked.errors.length === 0, `blocked storage: ${JSON.stringify(blocked)}`);
});

test('lang: the settings switch saves the choice and reloads; not on the pause card; a challenge link survives', async () => {
  const g = await open({ returning: true, play: false });
  await g.page.goto(URL + '?c=143&n=' + encodeURIComponent('Сеня'));
  await g.page.waitForTimeout(500);
  await g.page.evaluate(() => document.querySelector('#secSet .sh').click());
  await g.page.waitForTimeout(400); // let the section finish opening and scrolling before the tap
  await g.page.click('#langSeg [data-v="en"]');
  // the click reloads the page: wait until the new page is up, whatever the reload timing
  let lang = null;
  for (let i = 0; i < 40 && lang !== 'en'; i++) {
    await g.page.waitForTimeout(150);
    lang = await g.page.evaluate(() => window.__kus && window.__kus.LANG).catch(() => null);
  }
  await g.page.waitForTimeout(300);
  const a = await g.page.evaluate(() => ({
    lang: window.__kus.LANG,
    saved: localStorage.getItem('kus.lang'),
    q: location.search,
    pressed: (document.querySelector('#langSeg [aria-pressed="true"]') || {}).dataset,
  }));
  assert(a.lang === 'en' && a.saved === 'en' && a.pressed && a.pressed.v === 'en' && a.q.includes('c=143'), `after the switch: ${JSON.stringify(a)}`);
  await g.page.click('#play');
  await g.page.waitForTimeout(300);
  await g.page.evaluate(() => document.getElementById('pauseBtn').click());
  await g.page.waitForTimeout(100);
  const shown = await g.page.evaluate(() => [...document.querySelectorAll('.lng')].filter((e) => e.offsetParent !== null).length);
  assert(shown === 0, `the language row shows on the pause card (${shown} visible)`);
  await g.close();
});

test('lang: a saved default name follows the language and is not saved again', async () => {
  const ctx = await browser.newContext({ locale: 'en-US' });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    if (sessionStorage.getItem('x')) return;
    sessionStorage.setItem('x', '1');
    localStorage.setItem('kus.name', 'Кусака');
    localStorage.setItem('kus.best', '0');
  });
  await page.goto(URL + '?c=50&n=' + encodeURIComponent('Кусака'));
  await page.waitForTimeout(500);
  const pre = await page.evaluate(() => ({ field: document.getElementById('nick').value, chal: document.getElementById('chal').textContent }));
  assert(pre.field === '', `the field shows a saved default: "${pre.field}"`);
  assert(!/Кусака/.test(pre.chal) && /Kusaka/.test(pre.chal), `the challenge banner: "${pre.chal}"`);
  await page.click('#play');
  await page.waitForTimeout(300);
  const p = await page.evaluate(() => ({ name: window.__kus.player.name, saved: localStorage.getItem('kus.name') }));
  assert(p.name === 'Kusaka' && !p.saved, `player ${p.name}, saved "${p.saved}"`);
  await ctx.close();
});

test('lang: every string has both languages; every candy name has a unique English name', async () => {
  const g = await open({ play: false });
  const r = await g.page.evaluate(() => {
    const k = window.__kus,
      bad = [];
    for (const [key, v] of Object.entries(k.STR)) if (!Array.isArray(v) || v.length !== 2 || !v[0] || !v[1]) bad.push(key);
    const names = [...k.BOT_NAMES.map((n) => n[0]), ...k.FLAVORS.map((f) => f[0]), 'Ёж', 'Пиранья', 'Торт', 'Большой Торт'];
    const miss = names.filter((n) => !k.EN_NAMES[n]);
    const en = Object.values(k.EN_NAMES),
      dup = en.filter((v, i) => en.indexOf(v) !== i),
      cyr = en.filter((v) => /[А-Яа-яЁё]/.test(v));
    const rows = k.ALBUM_ROWS.filter(([id]) => !k.STR['row.' + id]).map(([id]) => id);
    return { bad, miss, dup, cyr, rows };
  });
  assert(!r.bad.length && !r.miss.length && !r.dup.length && !r.cyr.length && !r.rows.length, JSON.stringify(r));
  await g.close();
});

test('lang: names are English on screen, the album still counts by the Russian key', async () => {
  const g = await open({ play: false, locale: 'en-US' });
  const r = await g.page.evaluate(`(() => { const k0 = window.__kus; k0.pause(true); k0.setMode('t3'); k0.startGame(); ${QUIET} ${EAT}
    const out = { en: k.EN_NAMES['Зефирка'] }, feed = () => document.getElementById('feed').textContent;
    out.ate = eat('Зефирка'); out.feed = feed();
    out.saved = JSON.parse(localStorage.getItem('kus.album')).c['Зефирка'];
    out.board = document.getElementById('lb') ? document.getElementById('lb').textContent : '';
    k.setTimeLeft(0.001); for (let i = 0; i < 90; i++) k.update(1/60);
    out.line = document.getElementById('stk').textContent;
    return out; })()`);
  assert(r.en && r.ate === 1 && r.saved === 1, `swallow ${r.ate}, saved under the Russian key ${r.saved}, English name ${r.en}`);
  assert(r.feed.includes(r.en) && !/Зефирк/.test(r.feed), `the feed: "${r.feed}"`);
  assert(r.line.includes(r.en) && !/Зефирк/.test(r.line), `the end line: "${r.line}"`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

// visible Russian left on the page: text, aria-label, title, placeholder, CSS content; 'Kusь' is the brand and allowed
const CYR = `(() => {
  const out = new Set(), cyr = /[А-Яа-яЁё]/, strip = (s) => (s || '').replace(/kusь/gi, '');
  const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  for (const e of document.querySelectorAll('body *')) {
    if (e.tagName === 'SCRIPT' || e.tagName === 'STYLE' || !vis(e) || e.closest('[lang="ru"]')) continue; // «Русский» on the language switch is Russian on purpose
    for (const n of e.childNodes) if (n.nodeType === 3 && cyr.test(strip(n.textContent))) out.add(n.textContent.trim());
    for (const a of ['aria-label', 'title', 'placeholder']) if (cyr.test(strip(e.getAttribute(a)))) out.add(a + ': ' + e.getAttribute(a));
    for (const p of ['::before', '::after']) { const c = getComputedStyle(e, p).content; if (c && c !== 'none' && cyr.test(strip(c))) out.add(p + ' ' + c); }
  }
  return [...out];
})()`;

test('lang: no Russian left in the English menu, sections, help, pause and admin panel', async () => {
  for (const [w, h] of [
    [360, 640],
    [844, 390],
    [1200, 720],
  ]) {
    const touch = w < 900;
    const first = await open({ width: w, height: h, play: false, locale: 'en-US', touch });
    let left = await first.page.evaluate(CYR);
    assert(!left.length, `${w}x${h} first-visit menu: ${left.join(' | ')}`);
    await first.close();
    const g = await open({ width: w, height: h, play: false, returning: true, locale: 'en-US', touch });
    for (const id of ['secMode', 'secLook', 'secMis', 'secSet', 'secHelp']) {
      await g.page.evaluate((i) => document.querySelector('#' + i + ' .sh').click(), id);
      await g.page.waitForTimeout(150);
      left = await g.page.evaluate(CYR);
      assert(!left.length, `${w}x${h} section ${id}: ${left.join(' | ')}`);
    }
    await g.page.evaluate(() => document.getElementById('play').click());
    await g.page.waitForTimeout(300);
    await g.page.evaluate(() => document.getElementById('pauseBtn').click());
    await g.page.waitForTimeout(100);
    left = await g.page.evaluate(CYR);
    assert(!left.length, `${w}x${h} pause: ${left.join(' | ')}`);
    await g.page.evaluate(() => document.getElementById('pAdmin').click());
    await g.page.waitForTimeout(100);
    left = await g.page.evaluate(CYR);
    assert(!left.length, `${w}x${h} admin: ${left.join(' | ')}`);
    await g.close();
  }
});

test('lang: no Russian left in an English run, end card, album page, trophy, candy of the day and a challenge', async () => {
  const drawn = () => {
    window.__drawn = new Set();
    for (const f of ['fillText', 'strokeText']) {
      const o = CanvasRenderingContext2D.prototype[f];
      CanvasRenderingContext2D.prototype[f] = function (s, ...a) {
        window.__drawn.add(String(s));
        return o.call(this, s, ...a);
      };
    }
    window.__shared = [];
    navigator.share = (d) => (window.__shared.push(d.title + ' ' + d.text), Promise.resolve());
  };
  const cyrDrawn = `[...window.__drawn].filter((s) => /[А-Яа-яЁё]/.test(s.replace(/kusь/gi, '')))`;
  const g = await open({ width: 390, height: 844, touch: true, play: false, returning: true, locale: 'en-US' });
  await g.page.addInitScript(drawn);
  await g.page.reload();
  await g.page.waitForTimeout(600);
  const seen = {};
  const look = async (tag) => {
    const left = await g.page.evaluate(CYR);
    if (left.length) seen[tag] = left;
  };
  // a run: a streak up to ×7 by swallowing small bots, a wrapper, the HUD and the tray drawn
  await g.page.evaluate(`(() => { const k0 = window.__kus; k0.pause(true); k0.setMode('free'); k0.startGame(); ${QUIET} ${EAT}
    k.render(); for (let i = 0; i < 7; i++) { eat(['Зефирка', 'Ёж', 'Торт', 'Пиранья', 'Суфле', 'Мусс', 'Безе'][i]); k.render(); }
    if (k.spawnWrap) { k.spawnWrap(P.x + 120, P.y, 0); for (let i = 0; i < 20; i++) { k.update(1/60); k.render(); } }
    for (let i = 0; i < 30; i++) { k.update(1/60); k.render(); } })()`);
  await look('run HUD');
  // the 3-minute end card
  await g.page.evaluate(
    `(() => { const k = window.__kus; k.toMenu(); k.setMode('t3'); k.startGame(); k.player.spawnT = 0; k.setTimeLeft(0.001); for (let i = 0; i < 90; i++) k.update(1/60); })()`,
  );
  await look('3-minute end card');
  await g.page.evaluate(() => document.getElementById('chalBtn').click());
  // the album page from the menu
  await g.page.evaluate(() => {
    window.__kus.toMenu();
    document.getElementById('albumBtn').click();
    document.querySelector('#albumRows .st').click();
  });
  await g.page.waitForTimeout(200);
  await look('album page');
  await g.page.evaluate(() => document.getElementById('albumX').click());
  // the boss beaten: the trophy card, and its share text
  await g.page.evaluate(`(() => { ${STG} const P = free(); P.mass = 1600; S().i = 2; S().endT = -99; run(0.1);
    const B = S().cur.b; B.spawnT = 0; B.ai = null; B.mass = 60; k.place(B, 2000, 2000, 0); k.place(P, 2000 - B.Rs - P.Rs + 6, 2000, 0);
    let f = 0; while (k.state === 'play' && f++ < 400) { P.tx = B.x; P.ty = B.y; B.tx = B.x; B.ty = B.y; P.biteCd = Math.min(P.biteCd, 0); k.update(1 / 60); k.render(); }
    for (let i = 0; i < 200; i++) k.update(1 / 60); })()`);
  await look('trophy card');
  await g.page.evaluate(() => document.getElementById('chalBtn').click());
  // a candy-of-the-day run to its end card
  await g.page.evaluate(`(() => { ${DAY} play(20261125, 120); })()`);
  await look('candy of the day end card');
  // the FPS line
  await g.page.evaluate(
    `(() => { const k = window.__kus; k.toMenu(); document.querySelector('#fpsSeg [data-v="1"]').click(); k.setMode('free'); k.startGame(); })()`,
  );
  await g.page.waitForTimeout(1500);
  await look('FPS line');
  const canvas = await g.page.evaluate(cyrDrawn);
  const shared = await g.page.evaluate(() => window.__shared.filter((s) => /[А-Яа-яЁё]/.test(s)));
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
  // a challenge link for today's candy, opened in English: the banner
  const today = await (async () => {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  })();
  const c = await open({ width: 844, height: 390, touch: true, play: false, locale: 'en-US' });
  for (const q of [`?c=143&n=Sam&d=${today}`, `?c=143&n=Sam&d=${today - 1}`, '?c=143&n=Sam']) {
    await c.page.goto(URL + q);
    await c.page.waitForTimeout(400);
    const left = await c.page.evaluate(CYR);
    if (left.length) seen['challenge ' + q] = left;
  }
  await c.close();
  assert(!Object.keys(seen).length, 'Russian on screen: ' + JSON.stringify(seen));
  assert(!canvas.length, 'Russian drawn on the canvas: ' + canvas.join(' | '));
  assert(!shared.length, 'Russian in the share text: ' + shared.join(' | '));
});

test('lang: sticker names fit their tiles on a 360x640 phone in both languages', async () => {
  for (const locale of ['ru-RU', 'en-US']) {
    const g = await open({ width: 360, height: 640, touch: true, play: false, returning: true, locale });
    await g.page.evaluate(() => document.getElementById('albumBtn').click());
    await g.page.waitForTimeout(300);
    const cut = await g.page.evaluate(() =>
      [...document.querySelectorAll('#albumRows .sn')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent),
    );
    assert(!cut.length, `${locale}: names cut off: ${cut.join(', ')}`);
    await g.close();
  }
});

test('lang: the og.png and README screenshot tools stay Russian on any machine', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['tools/og.mjs', 'tools/shots.mjs']) {
    const src = readFileSync(join(root, f), 'utf8'),
      opens = src.match(/new(?:Page|Context)\(\{[^\n]*/g) || []; // the whole call line: the options hold nested objects
    assert(opens.length && opens.every((o) => o.includes("locale: 'ru-RU'")), `${f}: a browser page without locale 'ru-RU': ${opens.join(' | ')}`);
  }
});

test('lang: the English sticker caption has no broken ordinal', async () => {
  const g = await open({ play: false, locale: 'en-US' });
  const s = await g.page.evaluate(() => window.__kus.t('al.capPart', 'Gummy', 1, 3));
  assert(!/\d(th|st|nd|rd)\b/.test(s), `caption: "${s}"`);
  await g.close();
});

test('settings: the language row keeps the same gap to the next heading as the other rows (phone and PC)', async () => {
  const gaps = {};
  for (const touch of [true, false]) {
    const g = await open({ width: touch ? 390 : 1200, height: touch ? 844 : 900, touch, play: false, returning: true });
    await g.page.evaluate(() => document.querySelector('#secSet .sh').click());
    await g.page.waitForTimeout(400);
    gaps[touch ? 'phone' : 'pc'] = await g.page.evaluate(() => {
      const next = (el) =>
        [...document.querySelectorAll('#secSetB .grp')].find(
          (h) => h.getBoundingClientRect().top > el.getBoundingClientRect().bottom && h.getClientRects().length,
        );
      const gap = (el) => Math.round(next(el).getBoundingClientRect().top - el.getBoundingClientRect().bottom);
      const sizeSeg = document.getElementById('sizeSeg');
      return { lang: gap(document.getElementById('langSeg')), other: sizeSeg.getClientRects().length ? gap(sizeSeg) : null };
    });
    await g.close();
  }
  const ref = gaps.phone.other;
  assert(
    ref > 6 && Math.abs(gaps.phone.lang - ref) <= 1 && Math.abs(gaps.pc.lang - ref) <= 1,
    `gaps after the language row vs the others: ${JSON.stringify(gaps)}`,
  );
});

test('lang: the English stage pill says the number before an event is mass, not time', async () => {
  const g = await open({ play: false, returning: true, locale: 'en-US' });
  const r = await g.page.evaluate(`(() => { ${STG} free(); run(0.5);
    const el = document.getElementById('stage');
    return { label: el.querySelector('.t').textContent.trim(), num: el.querySelector('b').textContent.trim() }; })()`);
  assert(/mass/i.test(r.label) && !/\bin$/.test(r.label) && /^\d+$/.test(r.num), `stage pill: "${r.label}" + "${r.num}"`);
  await g.close();
});

test('fonts: the page makes no network request and the logo and text use the embedded fonts, offline', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, locale: 'ru-RU' });
  const asked = [];
  await ctx.route(/^https?:/, (r) => {
    asked.push(r.request().url());
    r.abort();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL);
  await page.waitForTimeout(600);
  const r = await page.evaluate(async () => {
    const nun = await document.fonts.load('900 20px Nunito', 'Кусь io');
    const rub = await document.fonts.load('20px "Rubik Bubbles"', 'КУСЬ.io');
    // letters of Azerbaijani and Turkish names (latin-ext) must be in an embedded Nunito face, not a system font
    const ranges = [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === 'Nunito').flatMap((f) => f.unicodeRange.split(','));
    const covered = (ch) =>
      ranges.some((u) => {
        const [lo, hi] = u.trim().replace(/^U\+/i, '').split('-');
        const a = parseInt(lo.replace(/\?/g, '0'), 16),
          b = parseInt((hi || lo).replace(/\?/g, 'F'), 16);
        return ch.codePointAt(0) >= a && ch.codePointAt(0) <= b;
      });
    return {
      nun: nun.length,
      rub: rub.length,
      logo: getComputedStyle(document.querySelector('.logo')).fontFamily,
      missing: [...'ŞşƏəĞğİıÇçÖöÜü'].filter((ch) => !covered(ch)).join(''),
    };
  });
  assert(asked.length === 0, `requests: ${asked.join(' ')}`);
  assert(r.nun > 0 && r.rub > 0, `embedded faces loaded: ${JSON.stringify(r)}`);
  assert(/^"?Rubik Bubbles"?,/.test(r.logo), `the logo's font: ${r.logo}`);
  assert(r.missing === '', `letters with no embedded Nunito face: ${r.missing}`);
  // such a name draws without errors
  await page.fill('#nick', 'Şəkər');
  await page.click('#play');
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const k = window.__kus;
    k.pause(true);
    for (let i = 0; i < 5; i++) {
      k.update(1 / 60);
      k.render();
    }
  });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

test('platform: web, app and steam; the store builds hide the admin, ignore saved cheats and share the public link', async () => {
  const CHEAT = "localStorage.setItem('kus.cheat', '{\"god\":true}');";
  const cases = [
    ['web', ''],
    ['app', 'window.Capacitor = { isNativePlatform: () => true };'],
    ['steam', "window.KUS_PLATFORM = 'steam';"],
    ['web', "window.KUS_PLATFORM = 'xbox';"], // an unknown name is the web
    ['web', 'window.Capacitor = { isNativePlatform: () => false };'], // Capacitor's web build is the web
    ['web', 'window.Capacitor = {};'], // a Capacitor object of another shape does not break the start
  ];
  for (const [want, fake] of cases) {
    const g = await open({ init: fake + CHEAT, origin: 'https://localhost', returning: true });
    const o = await g.page.evaluate(() => {
      const k = window.__kus,
        o = { platform: k.PLATFORM, god: k.CHEAT.god };
      document.getElementById('pauseBtn').click();
      o.adminShown = !!document.getElementById('pAdmin').offsetParent;
      document.getElementById('resume').click();
      k.pause(true);
      for (const key in k.CHEAT) k.CHEAT[key] = key === 'speed' ? 1 : false;
      k.player.alive = false;
      k.die(null);
      if (k.PLATFORM !== 'web') {
        for (let i = 0; i < 300 && document.getElementById('cont').classList.contains('hidden'); i++) k.update(1 / 60);
        k.contNo(); // the store builds offer «Продолжить» first
      }
      for (let i = 0; i < 300 && document.getElementById('over').classList.contains('hidden'); i++) k.update(1 / 60);
      document.getElementById('chalBtn').click();
      o.link = document.getElementById('chalLink').value;
      return o;
    });
    const tag = `${want} (${fake || 'nothing'})`;
    assert(o.platform === want, `${tag}: PLATFORM ${o.platform}`);
    assert(o.adminShown === (want === 'web'), `${tag}: #pAdmin shown ${o.adminShown}`);
    assert(o.god === (want === 'web'), `${tag}: saved cheat god read ${o.god}`);
    assert(o.link.startsWith(want === 'web' ? 'https://localhost/' : 'https://antropos17.github.io/kus-io/'), `${tag}: link ${o.link}`);
    assert(g.errors.length === 0, `${tag}: ${g.errors.join(' | ')}`);
    await g.close();
  }
});

test('icons: the tab icon is drawn by drawIcon, the store icon is opaque, the Android foreground stays inside the safe circle', async () => {
  const K = +(readFileSync(join(root, 'tools', 'icons.mjs'), 'utf8').match(/const FG_K = ([\d.]+)/) || [])[1];
  assert(K > 0 && K <= 1, `FG_K in tools/icons.mjs: ${K}`);
  const g = await open({ play: false });
  const o = await g.page.evaluate((K) => {
    const k = window.__kus,
      canvas = (s) => {
        const c = document.createElement('canvas');
        c.width = c.height = s;
        return c;
      };
    const tab = canvas(180);
    k.drawIcon(tab.getContext('2d'), 180);
    const o = { tab: tab.toDataURL('image/png') === document.querySelector('link[rel=apple-touch-icon]').href };
    const full = canvas(1024),
      fg = canvas(1024);
    k.drawIcon(full.getContext('2d'), 1024);
    k.drawIcon(fg.getContext('2d'), 1024, { bg: false, k: K });
    const a = full.getContext('2d').getImageData(0, 0, 1024, 1024).data,
      f = fg.getContext('2d').getImageData(0, 0, 1024, 1024).data,
      R = (66 / 108 / 2) * 1024;
    o.seeThrough = 0;
    o.outside = 0;
    o.inside = 0;
    for (let i = 0; i < 1024 * 1024; i++) {
      if (a[i * 4 + 3] !== 255) o.seeThrough++;
      if (f[i * 4 + 3] > 0) {
        const x = (i % 1024) + 0.5 - 512,
          y = Math.floor(i / 1024) + 0.5 - 512;
        if (x * x + y * y > R * R) o.outside++;
        else o.inside++;
      }
    }
    o.share = o.inside / (Math.PI * R * R);
    // with no square of its own the icon must not erase what is under it (the splash draws it on the dark ground)
    const sp = canvas(1024),
      sg = sp.getContext('2d');
    sg.fillStyle = '#140b08';
    sg.fillRect(0, 0, 1024, 1024);
    k.drawIcon(sg, 1024, { bg: false });
    o.bite = [...sg.getImageData(Math.round((150 / 180) * 1024), Math.round((40 / 180) * 1024), 1, 1).data].join();
    return o;
  }, K);
  assert(o.tab, 'the tab icon is not what drawIcon(g, 180) draws');
  assert(o.seeThrough === 0, `${o.seeThrough} see-through pixels in the opaque icon`);
  assert(o.outside === 0, `${o.outside} foreground pixels outside the Android safe circle`);
  assert(o.bite === '20,11,8,255', `the bite erased the ground under the icon: ${o.bite}`);
  assert(o.share > 0.3, `the foreground candy covers only ${(o.share * 100).toFixed(0)}% of the safe circle`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('icons: truePng and ico write what they claim', async () => {
  const px = Buffer.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 10, 20, 30, 255]);
  const rgb = truePng(px, 2, 2, false),
    rgba = truePng(px, 2, 2);
  assert(rgb[25] === 2 && rgba[25] === 6, `IHDR colour types ${rgb[25]} and ${rgba[25]}`);
  const page = await browser.newPage();
  const back = await rgbaOf(page, rgb);
  await page.close();
  assert(back.equals(px), `decoded ${[...back]}`);
  const icon = ico([
    { size: 2, png: rgba },
    { size: 256, png: rgba },
  ]);
  assert(icon.subarray(0, 6).equals(Buffer.from([0, 0, 1, 0, 2, 0])), `ico header ${[...icon.subarray(0, 6)]}`);
  assert(icon[6] === 2 && icon[6 + 16] === 0, `ico sizes ${icon[6]} and ${icon[22]} (0 means 256)`);
  assert(
    icon.readUInt32LE(6 + 12) === 6 + 16 * 2 && icon.subarray(38, 46).equals(rgba.subarray(0, 8)),
    'the first image does not start right after the directory',
  );
});

test('fonts: the font tool refuses a lost weight and a download that is not woff2', async () => {
  const woff2 = Buffer.from('wOF2 and the rest'),
    html = Buffer.from('<html>captive portal</html>');
  const throws = (f) => {
    try {
      f();
    } catch (e) {
      return true;
    }
    return false;
  };
  assert(
    !throws(() => checkFace('Nunito', "@font-face{font-family:'Nunito';font-weight: 700 900;src:url(x)}", woff2)),
    'a good Nunito face was refused',
  );
  assert(
    !throws(() => checkFace('Rubik Bubbles', "@font-face{font-family:'Rubik Bubbles';font-weight: 400;src:url(x)}", woff2)),
    'a good Rubik Bubbles face was refused',
  );
  assert(
    throws(() => checkFace('Nunito', "@font-face{font-family:'Nunito';font-weight: 700;src:url(x)}", woff2)),
    'a Nunito face of weight 700 only (800 and 900 lost) was taken',
  );
  assert(
    throws(() => checkFace('Nunito', "@font-face{font-family:'Nunito';font-weight: 700 900;src:url(x)}", html)),
    'an HTML page was taken as a font',
  );
});

// A fake standard gamepad: window.__pad holds its axes and buttons, __press(i, on, value) presses one.
// Triggers (6, 7) can be given a value with pressed false, as an analogue trigger half way down.
const PADFAKE = `window.__pad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  navigator.getGamepads = () => [{ id: 'fake', index: 0, mapping: 'standard', connected: true, axes: __pad.axes, buttons: __pad.buttons }];
  window.__press = (i, on = true, value) => { __pad.buttons[i] = { pressed: value === undefined ? on : false, value: value === undefined ? (on ? 1 : 0) : value }; };`;

test('gamepad: the stick moves like the touch joystick, the dead zone stops the candy', async () => {
  const g = await open({ init: PADFAKE });
  const o = await g.page.evaluate(`(() => { ${QUIET}
    const out = {};
    k.place(P, 2000, 2000, 0); // the middle of the field: no wall and none of the parked bots to bounce off
    __pad.axes[0] = 0.9;
    k.padPoll(1 / 60);
    out.mode = document.body.classList.contains('pad');
    out.vx = k.stick.vx;
    out.mag = k.stick.mag;
    const x0 = P.x;
    for (let i = 0; i < 60; i++) { k.padPoll(1 / 60); k.update(1 / 60); }
    out.dx = P.x - x0;
    out.v0 = Math.hypot(P.vx, P.vy);
    __pad.axes[0] = 0.1; __pad.axes[1] = 0.05;
    k.padPoll(1 / 60);
    out.mag2 = k.stick.mag;
    for (let i = 0; i < 60; i++) { k.padPoll(1 / 60); k.update(1 / 60); }
    out.v1 = Math.hypot(P.vx, P.vy);
    return out; })()`);
  assert(o.mode, 'the stick did not switch to pad mode');
  assert(Math.abs(o.vx - 1) < 0.01 && Math.abs(o.mag - (0.9 - 0.18) / 0.82) < 0.01, `stick vx ${o.vx}, mag ${o.mag}`);
  assert(o.dx > 30, `the candy moved ${o.dx} in a second`);
  assert(o.mag2 === 0 && o.v1 < o.v0 * 0.2, `dead zone: mag ${o.mag2}, speed ${o.v0} -> ${o.v1}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
  // a pad that drifts a little from the start does not take over
  const d = await open({ init: PADFAKE + '__pad.axes[0] = 0.1;' });
  const mode = await d.page.evaluate(() => {
    window.__kus.padPoll(1 / 60);
    return document.body.classList.contains('pad');
  });
  assert(!mode, 'a drifting stick (0.1) switched to pad mode');
  await d.close();
});

test('gamepad: A bites once on a press and again only after the cooldown; B tongues; Start pauses; Select mutes', async () => {
  const g = await open({ init: PADFAKE });
  const o = await g.page.evaluate(`(() => { ${QUIET}
    const out = {};
    let starts = 0, was = 0;
    const run = (n, each) => {
      for (let i = 0; i < n; i++) {
        if (each) each(i);
        k.padPoll(1 / 60);
        k.update(1 / 60);
        if (was <= 0 && P.dashT > 0) starts++;
        was = P.dashT;
      }
    };
    const fresh = () => { starts = 0; was = 0; P.dashCd = 0; P.dashT = 0; };
    fresh();
    run(60, (i) => __press(0, i === 0));
    out.tap = starts;
    fresh();
    run(90, () => __press(0, true));
    out.holdPad = starts;
    __press(0, false);
    k.padPoll(1 / 60);
    k.setPad(false);
    k.setTouch(true);
    fresh();
    run(90, () => { k.input.dashHeld = true; });
    out.holdTouch = starts;
    k.input.dashHeld = false;
    k.setTouch(false);
    fresh();
    run(30, (i) => __press(7, false, i === 0 ? 0.8 : 0));
    out.rt = starts;
    __press(1, true);
    k.padPoll(1 / 60);
    out.b = k.input.dodge;
    k.update(1 / 60);
    __press(1, false);
    k.padPoll(1 / 60);
    __press(6, false, 0.8);
    k.padPoll(1 / 60);
    out.lt = k.input.dodge;
    k.update(1 / 60);
    __press(6, false, 0);
    k.padPoll(1 / 60);
    k.pause(false);
    const card = () => !document.getElementById('pause').classList.contains('hidden');
    __press(9, true); k.padPoll(1 / 60); out.paused = card();
    __press(9, false); k.padPoll(1 / 60);
    __press(9, true); k.padPoll(1 / 60); out.resumed = !card();
    __press(9, false); k.padPoll(1 / 60);
    const s0 = k.Sfx.on;
    __press(8, true); k.padPoll(1 / 60); out.muted = k.Sfx.on !== s0;
    __press(8, false); k.padPoll(1 / 60);
    k.pause(true);
    return out; })()`);
  assert(o.tap === 1, `one press of A gave ${o.tap} lunges`);
  assert(Math.abs(o.holdPad - o.holdTouch) <= 1 && o.holdPad >= 1, `holding A gave ${o.holdPad} lunges, holding the touch button ${o.holdTouch}`);
  assert(o.rt === 1, `RT at 0.8 gave ${o.rt} lunges`);
  assert(o.b && o.lt, `B tongue ${o.b}, LT tongue ${o.lt}`);
  assert(o.paused && o.resumed, `Start: paused ${o.paused}, resumed ${o.resumed}`);
  assert(o.muted, 'Select did not toggle the sound');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
  // A held down in the menu and still held when the run starts gives no lunge
  const m = await open({ init: PADFAKE, play: false, returning: true });
  const r = await m.page.evaluate(() => {
    const k = window.__kus;
    __press(0, true);
    k.padPoll(1 / 60);
    k.startGame();
    k.pause(true);
    const P = k.player;
    P.spawnT = 0;
    P.dashCd = 0;
    let lunged = false;
    for (let i = 0; i < 30; i++) {
      k.padPoll(1 / 60);
      k.update(1 / 60);
      if (P.dashT > 0) lunged = true;
    }
    return { state: k.state, lunged, held: k.input.dashHeld };
  });
  assert(r.state === 'play' && !r.lunged && !r.held, `A held from the menu: ${JSON.stringify(r)}`);
  assert(m.errors.length === 0, m.errors.join(' | '));
  await m.close();
});

test('gamepad: a mouse move or a key hands control back; a disconnect pauses the run', async () => {
  const g = await open({ init: PADFAKE });
  const look = () => g.page.evaluate(() => ({ pad: document.body.classList.contains('pad'), sx: window.__kus.input.sx }));
  const on = async () => {
    await g.page.evaluate(() => {
      __pad.axes[0] = 0.9;
      window.__kus.padPoll(1 / 60);
      __pad.axes[0] = 0;
      window.__kus.padPoll(1 / 60);
    });
    return look();
  };
  await g.page.evaluate(`(() => { ${QUIET} })()`);
  const a = await on();
  await g.page.mouse.move(700, 450);
  const b = await look();
  assert(a.pad && !b.pad, `a mouse move left pad mode on: ${JSON.stringify([a, b])}`);
  assert(b.sx === a.sx, `the mouse move that ended pad mode pulled the candy: sx ${a.sx} -> ${b.sx}`);
  const c = await on();
  await g.page.keyboard.press('KeyX');
  const d = await look();
  assert(c.pad && !d.pad, 'a key left pad mode on');
  await on();
  const paused = await g.page.evaluate(() => {
    window.__kus.pause(false);
    dispatchEvent(new Event('gamepaddisconnected'));
    return !document.getElementById('pause').classList.contains('hidden');
  });
  assert(paused, 'a disconnect in pad mode did not pause the run');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('gamepad: with two pads only the first standard one drives', async () => {
  const g = await open({});
  const o = await g.page.evaluate(`(() => { ${QUIET}
    const btns = () => Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    navigator.getGamepads = () => [null, { index: 1, mapping: '', connected: true, axes: [0.9, 0, 0, 0], buttons: btns() },
      { index: 2, mapping: 'standard', connected: true, axes: [-0.9, 0, 0, 0], buttons: btns() },
      { index: 3, mapping: 'standard', connected: true, axes: [0, 0.9, 0, 0], buttons: btns() }];
    k.padPoll(1 / 60);
    return { vx: k.stick.vx, vy: k.stick.vy, idx: k.pad.idx }; })()`);
  assert(Math.abs(o.vx + 1) < 0.01 && Math.abs(o.vy) < 0.01 && o.idx === 2, `two pads: ${JSON.stringify(o)}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

// From the screen's first focus, walk the d-pad in all four directions from every button reached: the set reached must be
// every candidate of the top window (padItems), and never the name field or the admin button.
const PADWALK = `const reach = () => {
    const k = window.__kus, root = k.padRoot(), items = k.padItems(root);
    k.padHome(root);
    const start = document.activeElement, seen = new Set([start]), q = [start];
    while (q.length) {
      const el = q.shift();
      for (const d of ['up', 'down', 'left', 'right']) {
        el.focus({ preventScroll: true });
        if (k.padNav(d) && !seen.has(document.activeElement)) { seen.add(document.activeElement); q.push(document.activeElement); }
      }
    }
    const name = (x) => x.id || (x.getAttribute('aria-label') || x.textContent || x.className).trim().slice(0, 24);
    return { root: root && root.id, n: items.length, miss: items.filter((x) => !seen.has(x)).map(name),
      extra: [...seen].filter((x) => !items.includes(x)).map(name), skipped: items.filter((x) => x.id === 'nick' || x.id === 'pAdmin').length };
  };
  const first = () => document.activeElement && document.activeElement.id;`;
const walked = (w, label) => {
  assert(w.n > 0 && w.miss.length === 0 && w.extra.length === 0 && w.skipped === 0, `${label}: ${JSON.stringify(w)}`);
};

test('gamepad: every button on every screen is reachable with the d-pad', async () => {
  // the menu, one folding section open at a time
  const m = await open({ init: PADFAKE, play: false, returning: true });
  const menu = await m.page.evaluate(`(() => { ${PADWALK}
    const k = window.__kus, out = { secs: [] };
    k.setPad(true);
    k.padPoll(1 / 60);
    out.home = first();
    out.closed = reach();
    for (const sh of document.querySelectorAll('#menu .sec .sh')) {
      if (sh.getAttribute('aria-expanded') !== 'true') sh.click();
      out.secs.push([sh.parentElement.id, reach()]);
    }
    return out; })()`);
  assert(menu.home === 'play', `the menu's first focus is ${menu.home}`);
  walked(menu.closed, 'menu');
  assert(menu.secs.length >= 4, `sections: ${menu.secs.length}`);
  for (const [id, w] of menu.secs) walked(w, `menu, ${id} open`);
  // the album over the menu
  const album = await m.page.evaluate(`(() => { ${PADWALK}
    const k = window.__kus;
    document.getElementById('albumBtn').click();
    k.padPoll(1 / 60);
    return { home: first(), w: reach() }; })()`);
  assert(album.home === 'albumX', `the album's first focus is ${album.home}`);
  walked(album.w, 'album');
  assert(m.errors.length === 0, m.errors.join(' | '));
  await m.close();
  // the pause and the end card of a run
  const g = await open({ init: PADFAKE });
  const run = await g.page.evaluate(`(() => { ${QUIET} ${PADWALK}
    const out = {};
    k.pause(false);
    k.setPad(true);
    __press(9, true); k.padPoll(1 / 60); __press(9, false); k.padPoll(1 / 60);
    out.pauseHome = first();
    out.pause = reach();
    __press(9, true); k.padPoll(1 / 60); __press(9, false); k.padPoll(1 / 60);
    k.pause(true);
    P.alive = false;
    k.die(null);
    const over = document.getElementById('over');
    for (let f = 0; over.classList.contains('hidden') && f < 300; f++) k.update(1 / 60);
    k.padPoll(1 / 60);
    out.overHome = first();
    out.over = reach();
    return out; })()`);
  assert(run.pauseHome === 'resume', `the pause's first focus is ${run.pauseHome}`);
  walked(run.pause, 'pause');
  assert(run.overHome === 'again', `the end card's first focus is ${run.overHome}`);
  walked(run.over, 'end card');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
  // the trophy card after beating the Big Cake
  const w = await open({ init: PADFAKE, play: false, returning: true });
  const won = await w.page.evaluate(`(() => { ${STG} ${PADWALK}
    const P = free(); P.mass = 1600; S().i = 2; S().endT = -99; run(0.1);
    const B = S().cur.b; B.spawnT = 0; B.ai = null;
    B.mass = 60; k.place(B, 600, 600, 0); for (let i = 0; i < 40; i++) { B.mass = 60; k.place(B, 600, 600, 0); k.update(1 / 60); }
    k.place(B, 2000, 2000, 0); k.place(P, 2000 - B.Rs - P.Rs + 6, 2000, 0); let f = 0;
    while (k.state === 'play' && f++ < 400) { P.tx = B.x; P.ty = B.y; B.tx = B.x; B.ty = B.y; P.biteCd = Math.min(P.biteCd, 0); k.update(1 / 60); }
    k.setPad(true);
    k.padPoll(1 / 60);
    return { state: k.state, home: first(), w: reach() }; })()`);
  assert(won.state === 'won' && won.home === 'again', `the trophy card: state ${won.state}, first focus ${won.home}`);
  walked(won.w, 'trophy card');
  assert(w.errors.length === 0, w.errors.join(' | '));
  await w.close();
  // «Продолжить» in a store build
  const c = await open({ init: STEAMFAKE + PADFAKE });
  const co = await c.page.evaluate(`(() => { ${QUIET} ${PADWALK}
    k.setPad(true);
    P.alive = false;
    k.die(null);
    const el = document.getElementById('cont');
    for (let f = 0; el.classList.contains('hidden') && f < 300; f++) k.update(1 / 60);
    k.padPoll(1 / 60);
    return { home: first(), w: reach() }; })()`);
  assert(co.home === 'contYes', `the continue window's first focus is ${co.home}`);
  walked(co.w, 'continue');
  assert(c.errors.length === 0, c.errors.join(' | '));
  await c.close();
  // the app's sugar shop over the menu
  const sh = await open({ init: NATFAKE + PADFAKE, play: false, returning: true });
  const so = await sh.page.evaluate(`(() => { ${PADWALK}
    const k = window.__kus;
    k.setPad(true);
    k.padPoll(1 / 60);
    k.openShop();
    k.padPoll(1 / 60);
    return { home: first(), w: reach() }; })()`);
  assert(so.home === 'adBtn', `the shop's first focus is ${so.home}`);
  walked(so.w, 'shop');
  assert(sh.errors.length === 0, sh.errors.join(' | '));
  await sh.close();
});

test('gamepad: A presses, B goes back, LB/RB step through open items of a row', async () => {
  const own = `localStorage.setItem('kus.own', JSON.stringify({ v: 1, hat: ['bow', 'chef'] }));`; // bow and chef owned, cap (between) locked
  const g = await open({ init: PADFAKE + own, play: false, returning: true });
  const o = await g.page.evaluate(() => {
    const k = window.__kus,
      out = {},
      tap = (i) => {
        __press(i, true);
        k.padPoll(1 / 60);
        __press(i, false);
        k.padPoll(1 / 60);
      },
      idx = (row) => [...document.querySelectorAll(row + ' [role=radio]')].findIndex((x) => x.getAttribute('aria-checked') === 'true');
    k.setPad(true);
    k.padPoll(1 / 60);
    const sh = document.querySelector('#secLook .sh');
    sh.focus();
    tap(0);
    out.open = sh.getAttribute('aria-expanded');
    const hats = [...document.querySelectorAll('#hats [role=radio]')];
    out.openHats = hats.map((x, i) => (x.classList.contains('lock') ? -1 : i)).filter((i) => i >= 0);
    hats[idx('#hats')].focus();
    out.h0 = idx('#hats');
    tap(5);
    out.h1 = idx('#hats');
    tap(5);
    out.h2 = idx('#hats');
    out.focusInRow = !!document.activeElement.closest('#hats');
    tap(4);
    out.h3 = idx('#hats');
    document.querySelector('#sw [role=radio]').click(); // a first visit picks a random flavour: start from the first, rows do not wrap
    document.getElementById('play').focus();
    out.f0 = idx('#sw');
    tap(5);
    out.f1 = idx('#sw');
    // holding the d-pad down for a second from the top of the menu
    let moves = 0;
    const count = () => moves++;
    k.padItems(k.padRoot())[0].focus();
    addEventListener('focusin', count);
    __press(13, true);
    for (let i = 0; i < 60; i++) k.padPoll(1 / 60);
    __press(13, false);
    k.padPoll(1 / 60);
    removeEventListener('focusin', count);
    out.moves = moves;
    // B closes the album
    document.getElementById('albumBtn').click();
    k.padPoll(1 / 60);
    tap(1);
    out.albumShut = document.getElementById('album').classList.contains('hidden');
    return out;
  });
  assert(o.open === 'true', `A on the Look head left it ${o.open}`);
  assert(o.openHats.length >= 3 && o.h0 === o.openHats[0] && o.h1 === o.openHats[1] && o.h2 === o.openHats[2], `RB on hats: ${JSON.stringify(o)}`);
  assert(o.focusInRow && o.h3 === o.openHats[1], `LB on hats went to ${o.h3}, focus in the row ${o.focusInRow}`);
  assert(o.f1 === o.f0 + 1, `RB outside a row changed the flavour ${o.f0} -> ${o.f1}`);
  assert(Math.abs(o.moves - (1 + Math.floor((1 - 0.4) / 0.12) + 1)) <= 1, `holding the d-pad for 1 s moved ${o.moves} times`);
  assert(o.albumShut, 'B did not close the album');
  // B resumes from the pause and leaves the end card for the menu
  const r = await g.page.evaluate(() => {
    const k = window.__kus,
      out = {},
      tap = (i) => {
        __press(i, true);
        k.padPoll(1 / 60);
        __press(i, false);
        k.padPoll(1 / 60);
      };
    k.startGame();
    k.player.spawnT = 0;
    tap(9);
    out.paused = !document.getElementById('pause').classList.contains('hidden');
    tap(1);
    out.resumed = document.getElementById('pause').classList.contains('hidden') && k.state === 'play';
    k.pause(true);
    k.player.alive = false;
    k.die(null);
    const over = document.getElementById('over');
    for (let f = 0; over.classList.contains('hidden') && f < 300; f++) k.update(1 / 60);
    for (let i = 0; i < 40; i++) k.padPoll(1 / 60); // the end card ignores the buttons for its first half second
    tap(1);
    out.menu = !document.getElementById('menu').classList.contains('hidden') && over.classList.contains('hidden');
    return out;
  });
  assert(r.paused && r.resumed, `B in the pause: ${JSON.stringify(r)}`);
  assert(r.menu, 'B on the end card did not go to the menu');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('gamepad: focus follows the top window and survives a vanished button', async () => {
  const g = await open({ init: PADFAKE, play: false, returning: true });
  const o = await g.page.evaluate(() => {
    const k = window.__kus,
      out = {},
      tap = (i) => {
        __press(i, true);
        k.padPoll(1 / 60);
        __press(i, false);
        k.padPoll(1 / 60);
      },
      inside = (id) => !!document.activeElement.closest('#' + id);
    k.setPad(true);
    k.padPoll(1 / 60);
    document.getElementById('albumBtn').click();
    k.padPoll(1 / 60);
    out.album = inside('album');
    tap(1);
    out.backInMenu = inside('menu');
    // a button that goes away under the focus
    const sh = document.querySelector('#secMis .sh');
    sh.focus();
    sh.remove();
    out.nav = k.padNav('down');
    out.after = document.activeElement.id;
    k.startGame();
    k.player.spawnT = 0;
    tap(9);
    out.pause = inside('pause');
    return out;
  });
  assert(o.album && o.backInMenu, `the album over the menu: ${JSON.stringify(o)}`);
  assert(o.nav && o.after === 'play', `after the focused button vanished: ${JSON.stringify(o)}`);
  assert(o.pause, 'the pause over the run did not take the focus');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('gamepad: a whole run from the menu to the end card with the pad alone', async () => {
  const g = await open({ init: PADFAKE, play: false, returning: true });
  const o = await g.page.evaluate(() => {
    const k = window.__kus,
      out = {},
      step = (n = 1) => {
        for (let i = 0; i < n; i++) {
          k.padPoll(1 / 60);
          k.update(1 / 60);
        }
      },
      tap = (i) => {
        __press(i, true);
        step();
        __press(i, false);
        step();
      };
    k.pause(true);
    tap(0); // A: «Играть» has the first focus
    out.started = k.state;
    const P = k.player;
    P.spawnT = 0;
    P.dashCd = 0;
    const x0 = P.x;
    __pad.axes[0] = 0.9;
    step(30);
    out.moved = P.x - x0;
    __press(0, true);
    step();
    out.bit = P.dashT > 0;
    __press(0, false);
    __pad.axes[0] = 0;
    step();
    P.alive = false;
    k.die(null);
    const over = document.getElementById('over');
    for (let f = 0; over.classList.contains('hidden') && f < 300; f++) step();
    k.padPoll(1 / 60); // the card came up at the end of that frame: the next poll gives it the focus
    out.home = document.activeElement.id;
    for (let i = 0; i < 40; i++) k.padPoll(1 / 60); // the end card ignores the buttons for its first half second
    tap(0); // A: «Ещё кусь»
    out.again = k.state;
    return out;
  });
  assert(o.started === 'play' && o.moved > 10 && o.bit, `the run: ${JSON.stringify(o)}`);
  assert(o.home === 'again' && o.again === 'play', `the end card: ${JSON.stringify(o)}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('gamepad: pad glyphs replace key hints and go back with the mouse', async () => {
  const shown = `const shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const glyph = (id) => { const g = document.querySelector('#' + id + ' .pg'); return shown(g) ? g.textContent.trim() : ''; };
    const look = () => ({ pad: document.body.classList.contains('pad'), dash: glyph('dash'), dodge: glyph('dodge'), pause: glyph('pauseBtn'),
      space: shown(document.querySelector('#dash small')), shift: shown(document.querySelector('#dodge small')), bars: shown(document.querySelector('#pauseBtn svg')),
      pad1: shown(document.querySelector('[data-th="help.pad1"]')) ? document.querySelector('[data-th="help.pad1"]').textContent : '',
      pad2: shown(document.querySelector('[data-th="help.pad2"]')),
      mouse: shown(document.querySelector('[data-th="help.mouse"]')), space2: shown(document.querySelector('[data-th="help.space"]')),
      ring: document.activeElement !== document.body && document.activeElement.matches(':focus-visible') });`;
  for (const [locale, word] of [
    ['ru-RU', 'стик'],
    ['en-US', 'stick'],
  ]) {
    // the help lines, in the menu with «Как играть» open
    const m = await open({ init: PADFAKE, play: false, returning: true, locale });
    const a = await m.page.evaluate(`(() => { ${shown}
      const k = window.__kus;
      document.querySelector('#secHelp .sh').click();
      __press(13, true); k.padPoll(1 / 60); __press(13, false); k.padPoll(1 / 60);
      return look(); })()`);
    await m.page.mouse.move(600, 300);
    await m.page.mouse.move(620, 310);
    const b = await m.page.evaluate(`(() => { ${shown} return look(); })()`);
    assert(a.pad && a.pad1.includes(word) && a.pad2 && !a.mouse && !a.space2, `${locale} menu, pad: ${JSON.stringify(a)}`);
    assert(!b.pad && !b.pad1 && !b.pad2 && b.mouse && b.space2 && !b.ring, `${locale} menu, after the mouse: ${JSON.stringify(b)}`);
    assert(m.errors.length === 0, m.errors.join(' | '));
    await m.close();
  }
  // the buttons of a run
  const g = await open({ init: PADFAKE });
  const c = await g.page.evaluate(`(() => { ${shown}
    __pad.axes[0] = 0.9; window.__kus.padPoll(1 / 60); __pad.axes[0] = 0; window.__kus.padPoll(1 / 60);
    return look(); })()`);
  await g.page.mouse.move(600, 300);
  await g.page.mouse.move(620, 310);
  const d = await g.page.evaluate(`(() => { ${shown} return look(); })()`);
  assert(c.pad && c.dash === 'A' && c.dodge === 'B' && c.pause === '☰' && !c.space && !c.shift && !c.bars, `run, pad: ${JSON.stringify(c)}`);
  assert(!d.pad && !d.dash && !d.dodge && !d.pause && d.space && d.shift && d.bars, `run, after the mouse: ${JSON.stringify(d)}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('gamepad: 1280x800 — nothing off screen and page text is 12 px or more', async () => {
  const kinds = (bad) => [...new Set(bad.map((x) => x.replace(/ "[^"]*"/, '')))].join(' | '); // one line per kind of offender
  // every visible element with text of its own: font 12 px or more; inside the screen, or inside a scrolling box that is
  const check = `const check = (where) => {
    const bad = [], W = innerWidth, H = innerHeight;
    const scroller = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowX + s.overflowY)) return p; } return null; };
    const inside = (r, b) => r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
    for (const el of document.body.querySelectorAll('*')) {
      if (el.closest('#err, script, style, canvas, svg')) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own || !el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
      const name = where + ' ' + (el.id || el.className || el.tagName) + ' "' + el.textContent.trim().slice(0, 16) + '"';
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 12) bad.push(name + ' ' + fs + 'px');
      const r = el.getBoundingClientRect(), box = scroller(el);
      if (!inside(r, box ? box.getBoundingClientRect() : { left: 0, top: 0, right: W, bottom: H }) && !box) bad.push(name + ' off screen');
      if (box && !inside(box.getBoundingClientRect(), { left: 0, top: 0, right: W, bottom: H })) bad.push(name + ' in a box off screen');
      if ((el.matches('.st .sn, .pz') && el.scrollWidth > el.clientWidth + 1)) bad.push(name + ' does not fit its tile');
    }
    return bad;
  };`;
  const m = await open({ init: PADFAKE, play: false, returning: true, width: 1280, height: 800 });
  const menu = await m.page.evaluate(`(() => { ${check}
    const k = window.__kus;
    k.setPad(true);
    k.padPoll(1 / 60);
    let bad = check('menu');
    for (const sh of document.querySelectorAll('#menu .sec .sh')) { if (sh.getAttribute('aria-expanded') !== 'true') sh.click(); bad = bad.concat(check('menu ' + sh.parentElement.id)); }
    document.getElementById('albumBtn').click();
    k.padPoll(1 / 60);
    return bad.concat(check('album')); })()`);
  assert(menu.length === 0, kinds(menu));
  assert(m.errors.length === 0, m.errors.join(' | '));
  await m.close();
  const g = await open({ init: PADFAKE, width: 1280, height: 800 });
  const run = await g.page.evaluate(`(() => { ${QUIET} ${check}
    k.setPad(true);
    k.update(1 / 60);
    let bad = check('run');
    k.pause(false);
    __press(9, true); k.padPoll(1 / 60); __press(9, false); k.padPoll(1 / 60);
    bad = bad.concat(check('pause'));
    __press(9, true); k.padPoll(1 / 60); __press(9, false); k.padPoll(1 / 60);
    k.pause(true);
    P.alive = false;
    k.die(null);
    const over = document.getElementById('over');
    for (let f = 0; over.classList.contains('hidden') && f < 300; f++) k.update(1 / 60);
    k.padPoll(1 / 60);
    return bad.concat(check('end card')); })()`);
  assert(run.length === 0, kinds(run));
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('gamepad: a stick still held when a window opens leaves the focus on its main button', async () => {
  const g = await open({ init: PADFAKE });
  const o = await g.page.evaluate(`(() => { ${QUIET}
    const out = {}, poll = (n) => { for (let i = 0; i < n; i++) k.padPoll(1 / 60); };
    k.pause(false);
    __pad.axes[0] = 0.7; __pad.axes[1] = 0.7; // steering down and right, then Start without letting go
    poll(1);
    __press(9, true); poll(1); __press(9, false);
    poll(60);
    out.pause = document.activeElement.id;
    __pad.axes[0] = 0; __pad.axes[1] = 0; poll(1);
    __press(9, true); poll(1); __press(9, false); poll(1);
    k.pause(true);
    __pad.axes[0] = 0.9; // dying while steering right
    P.alive = false;
    k.die(null);
    const over = document.getElementById('over');
    for (let f = 0; over.classList.contains('hidden') && f < 300; f++) { k.padPoll(1 / 60); k.update(1 / 60); }
    poll(60);
    out.over = document.activeElement.id;
    __pad.axes[0] = 0; poll(1);
    __pad.axes[0] = 0.9; poll(1); // a fresh push after letting go does move
    out.moved = document.activeElement.id !== 'again';
    return out; })()`);
  assert(o.pause === 'resume', `the pause opened with the stick held: focus on ${o.pause}`);
  assert(o.over === 'again', `the end card came up with the stick held: focus on ${o.over}`);
  assert(o.moved, 'a fresh push after the stick came back did not move the focus');
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('gamepad: mashing A through a death keeps the end card up for a moment', async () => {
  const g = await open({ init: PADFAKE });
  const o = await g.page.evaluate(`(() => { ${QUIET}
    const out = {};
    k.setPad(true);
    P.alive = false;
    k.die(null);
    const over = document.getElementById('over');
    let f = 0, shownFor = 0;
    for (; f < 600 && shownFor < 20; f++) { // A about seven times a second, until the card has been up for 20 frames
      __press(0, f % 8 < 3);
      k.padPoll(1 / 60);
      k.update(1 / 60);
      if (!over.classList.contains('hidden')) shownFor++;
    }
    out.state = k.state;
    out.card = !over.classList.contains('hidden');
    __press(0, false);
    for (let i = 0; i < 30; i++) k.padPoll(1 / 60);
    __press(0, true); k.padPoll(1 / 60); __press(0, false); k.padPoll(1 / 60);
    out.later = k.state;
    return out; })()`);
  assert(o.state === 'dead' && o.card, `mashing A skipped the end card: ${JSON.stringify(o)}`);
  assert(o.later === 'play', `a deliberate A after the moment did not start again: ${o.later}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('gamepad: in the menu the focused button is never hidden behind the Play block', async () => {
  for (const [width, height] of [
    [1280, 800],
    [1200, 720],
    [844, 390],
  ]) {
    const g = await open({ init: PADFAKE, play: false, returning: true, width, height });
    const hidden = await g.page.evaluate(() => {
      const k = window.__kus,
        bad = [];
      k.setPad(true);
      k.padPoll(1 / 60);
      for (const id of ['secLook', 'secSet']) {
        const sh = document.querySelector('#' + id + ' .sh');
        if (sh.getAttribute('aria-expanded') !== 'true') sh.click();
        k.padItems(k.padRoot())[0].focus();
        for (let i = 0; i < 40; i++) {
          if (!k.padNav('down')) break;
          const el = document.activeElement,
            r = el.getBoundingClientRect(),
            hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (!el.contains(hit)) bad.push(id + ' ' + (el.id || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 16)));
        }
      }
      return bad;
    });
    assert(hidden.length === 0, `${width}x${height}: focus under another element: ${hidden.join(' | ')}`);
    assert(g.errors.length === 0, g.errors.join(' | '));
    await g.close();
  }
});

test('gamepad: a newcomer playing with the pad gets pad tips, not mouse ones', async () => {
  for (const [locale, mouse] of [
    ['ru-RU', /мыш|клик/i],
    ['en-US', /mouse|click/i],
  ]) {
    const g = await open({ init: PADFAKE, play: false, locale });
    const o = await g.page.evaluate(() => {
      const k = window.__kus;
      __press(0, true); // the first A: pad mode, «Играть» in focus and pressed
      k.padPoll(1 / 60);
      __press(0, false);
      k.padPoll(1 / 60);
      k.pause(true);
      const P = k.player,
        feed = () => document.getElementById('feed').textContent;
      P.spawnT = 0;
      const start = feed();
      const prey = k.blobs.find((b) => b.tame);
      if (prey) k.place(prey, P.x + P.Rs + prey.Rs + 20, P.y, Math.PI);
      for (let i = 0; i < 3; i++) k.update(1 / 60);
      return { state: k.state, start, bite: feed(), prey: !!prey, pad1: k.t('tip.pad'), pad2: k.t('tip.biteP') };
    });
    assert(o.state === 'play' && o.prey, `${locale}: ${JSON.stringify(o)}`);
    assert(!mouse.test(o.start) && o.start.includes(o.pad1.replace(/<[^>]+>/g, '')), `${locale}, first tip: "${o.start}"`);
    assert(!mouse.test(o.bite) && o.bite.includes(o.pad2.replace(/<[^>]+>/g, '')), `${locale}, bite tip: "${o.bite}"`);
    assert(g.errors.length === 0, g.errors.join(' | '));
    await g.close();
  }
});

test('gamepad: a pad that vanishes without a disconnect event stops the candy', async () => {
  const g = await open({ init: PADFAKE });
  const o = await g.page.evaluate(`(() => { ${QUIET}
    __pad.axes[0] = 0.9;
    __press(0, true);
    k.padPoll(1 / 60);
    k.update(1 / 60);
    const before = { mag: k.stick.mag, held: k.input.dashHeld };
    navigator.getGamepads = () => [null, null, null, null];
    k.padPoll(1 / 60);
    return { before, mag: k.stick.mag, held: k.input.dashHeld }; })()`);
  assert(o.before.mag > 0 && o.before.held, `the pad was not driving: ${JSON.stringify(o)}`);
  assert(o.mag === 0 && !o.held, `the candy kept going after the pad vanished: ${JSON.stringify(o)}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

const STEAMFAKE = "window.KUS_PLATFORM = 'steam';";
const APPFAKE = 'window.Capacitor = { isNativePlatform: () => true };';
// a death and waiting for a window, in the page: dieNow() kills the player, until(id) steps the game until #id shows
const DIE = `const dieNow = () => { k.player.alive = false; k.die(null); };
  const shown = (id) => !document.getElementById(id).classList.contains('hidden');
  const until = (id, n = 300) => { for (let f = 0; !shown(id) && f < n; f++) k.update(1 / 60); return shown(id); };`;

test('continue: the web goes straight to the end card, no #cont', async () => {
  const g = await open();
  const o = await g.page.evaluate(`(() => { ${QUIET} ${DIE}
    dieNow(); const over = until('over'); return { over, cont: shown('cont') }; })()`);
  assert(o.over && !o.cont, `web: ${JSON.stringify(o)}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('continue: in steam and the app a free-run death offers «Продолжить» once', async () => {
  for (const [tag, fake] of [
    ['steam', STEAMFAKE],
    ['app', APPFAKE],
  ]) {
    const g = await open({ init: fake });
    const o = await g.page.evaluate(`(() => { ${QUIET} ${DIE}
      const out = {}, bank0 = localStorage.getItem('kus.sugar');
      dieNow();
      out.cont = until('cont'); out.over = shown('over'); out.state = k.state;
      out.bankSame = localStorage.getItem('kus.sugar') === bank0;
      k.contYes();
      out.after = k.state; out.alive = k.player.alive; out.used = k.run.contUsed; out.contGone = !shown('cont');
      dieNow();
      out.over2 = until('over'); out.cont2 = shown('cont');
      return out; })()`);
    assert(o.cont && !o.over && o.state === 'dead' && o.bankSame, `${tag}, the offer: ${JSON.stringify(o)}`);
    assert(o.after === 'play' && o.alive && o.used === true && o.contGone, `${tag}, after «Продолжить»: ${JSON.stringify(o)}`);
    assert(o.over2 && !o.cont2, `${tag}, the second death: ${JSON.stringify(o)}`);
    assert(g.errors.length === 0, `${tag}: ${g.errors.join(' | ')}`);
    await g.close();
  }
});

test('continue: the mass comes back from the last 3 s and the peak of the life is kept', async () => {
  const g = await open({ init: STEAMFAKE });
  const o = await g.page.evaluate(`(() => { ${QUIET} ${DIE}
    const out = {};
    for (let i = 0; i < 60; i++) { P.mass = 400; k.update(1 / 60); }
    P.mass = 30; P.stats.maxMass = 500; P.stats.bites = 7;
    dieNow(); until('cont'); k.contYes();
    out.mass = k.player.mass; out.peak = k.player.stats.maxMass; out.bites = k.player.stats.bites; out.fresh = k.player !== P;
    k.toMenu(); k.startGame();
    const Q = k.player, m0 = Q.mass; Q.spawnT = 0; out.m0 = m0;
    for (let i = 0; i < 60; i++) { Q.mass = 5; k.update(1 / 60); }
    dieNow(); until('cont'); k.contYes();
    out.small = k.player.mass;
    return out; })()`);
  assert(o.fresh && Math.abs(o.mass - 400) <= 3, `the mass after «Продолжить»: ${JSON.stringify(o)}`);
  assert(o.peak === 500 && o.bites === 0, `the life's numbers: ${JSON.stringify(o)}`);
  assert(o.small >= o.m0 - 0.01, `a tiny candy comes back at least at the start mass: ${JSON.stringify(o)}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('continue: «Нет», the timer and leaving to the menu pay the run exactly once', async () => {
  for (const how of ['no', 'timer', 'menu']) {
    const g = await open({ init: STEAMFAKE });
    const o = await g.page.evaluate(`(() => { ${QUIET} ${DIE}
      const out = {};
      k.run.sugar = 40;
      const bank0 = k.sugar;
      dieNow(); until('cont');
      for (let i = 0; i < 60; i++) k.update(1 / 60); // past the timed mode's respawn moment
      out.held = k.state === 'dead' && shown('cont') && !k.player.alive;
      if ('${how}' === 'no') k.contNo();
      else if ('${how}' === 'timer') for (let i = 0; i < 6; i++) k.contFrame(1);
      else k.toMenu();
      out.got = k.run.got; out.paid = k.sugar - bank0; out.ls = +localStorage.getItem('kus.sugar') - bank0;
      out.over = shown('over'); out.cont = shown('cont');
      for (let i = 0; i < 200; i++) k.update(1 / 60);
      out.state = k.state; out.alive = k.player && k.player.alive && k.state === 'play'; out.later = k.sugar - bank0;
      return out; })()`);
    assert(o.held, `${how}: the window did not hold the death: ${JSON.stringify(o)}`);
    assert(o.got > 0 && o.paid === o.got && o.ls === o.got && o.later === o.got, `${how}: paid ${JSON.stringify(o)}`);
    assert(!o.cont && o.over === (how !== 'menu'), `${how}: windows ${JSON.stringify(o)}`);
    assert(!o.alive && o.state === (how === 'menu' ? 'menu' : 'dead'), `${how}: respawned or wrong state ${JSON.stringify(o)}`);
    assert(g.errors.length === 0, `${how}: ${g.errors.join(' | ')}`);
    await g.close();
  }
});

test('continue: hiding or leaving the page pays the run at once', async () => {
  for (const ev of ['visibilitychange', 'pagehide']) {
    const g = await open({ init: STEAMFAKE });
    const o = await g.page.evaluate(`(() => { ${QUIET} ${DIE}
      k.run.sugar = 40;
      const bank0 = +localStorage.getItem('kus.sugar');
      dieNow(); until('cont');
      if ('${ev}' === 'visibilitychange') {
        Object.defineProperty(document, 'hidden', { value: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      } else window.dispatchEvent(new Event('pagehide'));
      return { paid: +localStorage.getItem('kus.sugar') - bank0, got: k.run.got, cont: shown('cont'), pend: k.cont.pend }; })()`);
    assert(o.got > 0 && o.paid === o.got && !o.cont && !o.pend, `${ev}: ${JSON.stringify(o)}`);
    assert(g.errors.length === 0, `${ev}: ${g.errors.join(' | ')}`);
    await g.close();
  }
});

test('continue: a click in the first 0.5 s of the window does not choose', async () => {
  const g = await open({ init: STEAMFAKE });
  const o = await g.page.evaluate(`(async () => { ${QUIET} ${DIE}
    const out = {};
    dieNow(); until('cont');
    document.getElementById('contNo').click();
    out.early = shown('cont') && k.cont.pend;
    await new Promise((r) => setTimeout(r, 650));
    document.getElementById('contNo').click();
    out.later = !shown('cont') && shown('over');
    return out; })()`);
  assert(o.early && o.later, JSON.stringify(o));
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('ads: the ad timeout leaves room for a whole rewarded video', async () => {
  const g = await open({ init: NATFAKE, play: false, returning: true });
  const w = await g.page.evaluate(() => window.__kus.SHOP.adWait);
  assert(w >= 120000, `adWait ${w} ms`);
  await g.close();
});

test('continue: «Вторая смена» gets its own «Продолжить», t3 and daily never show it', async () => {
  const g = await open({ init: STEAMFAKE, play: false, returning: true });
  const o = await g.page.evaluate(`(() => { ${STG} ${DIE}
    const out = {};
    let P = free();
    P.alive = false; k.die(null); until('cont'); k.contYes(); out.used = k.run.contUsed;
    P = k.player; P.spawnT = 0;
    P.mass = 1600; S().i = 2; S().endT = -99; run(0.1);
    const B = S().cur.b; B.spawnT = 0; B.ai = null;
    B.mass = 60; k.place(B, 600, 600, 0); for (let i = 0; i < 40; i++) { B.mass = 60; k.place(B, 600, 600, 0); k.update(1 / 60); }
    k.place(B, 2000, 2000, 0); k.place(P, 2000 - B.Rs - P.Rs + 6, 2000, 0); let f = 0;
    while (k.state === 'play' && f++ < 400) { P.tx = B.x; P.ty = B.y; B.tx = B.x; B.ty = B.y; P.biteCd = Math.min(P.biteCd, 0); k.update(1 / 60); }
    out.won = k.state;
    k.startGame(); // «Вторая смена»
    out.shift = k.state; out.fresh = !k.run.contUsed;
    k.player.spawnT = 0; dieNow(); out.shiftCont = until('cont');
    k.contNo(); k.toMenu();
    for (const m of ['t3', 'daily']) {
      k.setMode(m); k.startGame(); k.player.spawnT = 0;
      dieNow();
      let seen = false;
      for (let i = 0; i < 200; i++) { k.update(1 / 60); if (shown('cont')) seen = true; }
      out[m] = seen;
      k.toMenu();
    }
    return out; })()`);
  assert(o.used === true && o.won === 'won', `the first shift: ${JSON.stringify(o)}`);
  assert(o.shift === 'play' && o.fresh && o.shiftCont, `the second shift: ${JSON.stringify(o)}`);
  assert(!o.t3 && !o.daily, `t3 or daily showed «Продолжить»: ${JSON.stringify(o)}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('continue: the gamepad lands on «Продолжить», B says no, A is ignored for 0.5 s', async () => {
  const g = await open({ init: STEAMFAKE + PADFAKE });
  const o = await g.page.evaluate(`(() => { ${QUIET} ${DIE}
    const out = {};
    k.setPad(true);
    dieNow(); until('cont');
    k.padPoll(1 / 60);
    out.home = document.activeElement.id;
    __press(0, true); k.padPoll(1 / 60); __press(0, false); k.padPoll(1 / 60);
    out.afterA = k.state; out.contUp = shown('cont');
    for (let i = 0; i < 40; i++) k.padPoll(1 / 60);
    __press(1, true); k.padPoll(1 / 60); __press(1, false); k.padPoll(1 / 60);
    out.over = shown('over'); out.cont = shown('cont');
    return out; })()`);
  assert(o.home === 'contYes', `first focus ${o.home}`);
  assert(o.afterA === 'dead' && o.contUp, `a mashed A took the choice: ${JSON.stringify(o)}`);
  assert(o.over && !o.cont, `B did not say no: ${JSON.stringify(o)}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('continue: #cont fits at 360x640 and 844x390 in ru and en', async () => {
  for (const [width, height] of [
    [360, 640],
    [844, 390],
  ])
    for (const locale of ['ru-RU', 'en-US']) {
      const g = await open({ init: STEAMFAKE, width, height, locale });
      const bad = await g.page.evaluate(`(() => { ${QUIET} ${DIE}
        dieNow(); until('cont');
        const out = [];
        for (const id of ['contYes', 'contNo']) {
          const el = document.getElementById(id), r = el.getBoundingClientRect();
          if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight || !r.width) out.push(id + ' off screen');
          else if (!el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))) out.push(id + ' covered');
        }
        return out; })()`);
      assert(bad.length === 0, `${width}x${height} ${locale}: ${bad.join(', ')}`);
      assert(g.errors.length === 0, g.errors.join(' | '));
      await g.close();
    }
});

test('continue: an autopilot run that takes «Продолжить» does not break or get stuck', async () => {
  const g = await open({ init: STEAMFAKE });
  const r = await g.page.evaluate(() => {
    const k = window.__kus,
      shown = (id) => !document.getElementById(id).classList.contains('hidden'),
      bad = [];
    k.pause(true);
    k.player.ai = k.newAI();
    k.player.spawnT = 0;
    let seed = 11,
      T = 0,
      conts = 0,
      killed = false;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    while (T < 90) {
      const dt = rnd() < 0.08 ? 0.05 : 1 / 144 + rnd() * (1 / 24 - 1 / 144);
      if (!killed && T > 20 && k.state === 'play') {
        killed = true;
        k.player.alive = false;
        k.die(null);
      }
      if (shown('cont')) {
        k.contYes();
        conts++;
        k.player.ai = k.newAI();
      } else if (k.state === 'dead' && shown('over')) {
        k.startGame();
        if (k.state === 'play') k.player.ai = k.newAI();
      }
      k.update(dt);
      k.contFrame(dt);
      T += dt;
      const P = k.player;
      if (P && P.alive) {
        if (!Number.isFinite(P.x + P.y + P.mass)) bad.push('NaN');
        if (P.x < -1 || P.y < -1 || P.x > 4001 || P.y > 4001) bad.push('offTray');
      }
    }
    return { conts, bad: [...new Set(bad)], state: k.state };
  });
  assert(r.conts >= 1, `no «Продолжить» was taken: ${JSON.stringify(r)}`);
  assert(r.bad.length === 0, `broke: ${JSON.stringify(r)}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

// the app with a controllable KUS_NATIVE bridge: window.__nat says what the next ad, price list and purchase answer
const NATFAKE = `window.Capacitor = { isNativePlatform: () => true };
window.__nat = { ad: 'reward', adMs: 0, prices: null, buy: { status: 'ok', tx: 't1' }, buyMs: 0, cb: null, calls: [] };
window.KUS_NATIVE = {
  ad: () => (__nat.calls.push('ad'), new Promise((r) => setTimeout(() => r(__nat.ad), __nat.adMs))),
  products: (ids) => (__nat.calls.push('products'), new Promise((r, j) => setTimeout(() => (__nat.prices ? r(__nat.prices) : j(new Error('x'))), 0))),
  buy: (id) => (__nat.calls.push('buy:' + id), new Promise((r) => setTimeout(() => r(__nat.buy), __nat.buyMs))),
  onPurchase: (cb) => { __nat.cb = cb; },
};`;
const SLEEP = 'const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const k = window.__kus;';

test('shop: only the app with a bridge has the shop button; web, steam and an app without a bridge do not', async () => {
  for (const [tag, fake, want] of [
    ['web', '', false],
    ['steam', STEAMFAKE, false],
    ['app without a bridge', APPFAKE, false],
    ['app', NATFAKE, true],
  ]) {
    const g = await open({ init: fake, play: false, returning: true });
    const o = await g.page.evaluate(() => {
      const b = document.getElementById('shopBtn');
      return { shown: !!b && !!b.offsetParent && !b.classList.contains('hidden') };
    });
    assert(o.shown === want, `${tag}: shop button shown ${o.shown}`);
    assert(g.errors.length === 0, `${tag}: ${g.errors.join(' | ')}`);
    await g.close();
  }
});

test('ads: a watched ad pays AD_SUGAR and spends one of three a day', async () => {
  const g = await open({ init: NATFAKE, play: false, returning: true });
  const o = await g.page.evaluate(`(async () => { ${SLEEP}
    const out = {}, bank0 = k.sugar;
    k.openShop();
    document.getElementById('adBtn').click();
    await sleep(60);
    out.paid = k.sugar - bank0; out.left = k.adsLeft(); out.n = JSON.parse(localStorage.getItem('kus.ads')).n;
    out.ls = +localStorage.getItem('kus.sugar') - bank0;
    out.msg = document.getElementById('shopMsg').textContent; out.want = k.t('ad.got', k.AD_SUGAR);
    for (let i = 0; i < 2; i++) { document.getElementById('adBtn').click(); await sleep(60); }
    out.left3 = k.adsLeft(); out.off = document.getElementById('adBtn').disabled; out.total = k.sugar - bank0;
    document.getElementById('adBtn').click(); await sleep(60);
    out.calls = __nat.calls.filter((c) => c === 'ad').length;
    return out; })()`);
  assert(o.paid === 300 && o.ls === 300 && o.left === 2 && o.n === 1, `the first ad: ${JSON.stringify(o)}`);
  assert(o.msg === o.want, `the message: ${JSON.stringify(o)}`);
  assert(o.left3 === 0 && o.off && o.total === 900 && o.calls === 3, `three a day: ${JSON.stringify(o)}`);
  await g.page.reload();
  await g.page.waitForTimeout(400);
  const later = await g.page.evaluate(() => {
    const k = window.__kus,
      left = k.adsLeft(),
      d = new Date();
    d.setDate(d.getDate() - 1);
    localStorage.setItem('kus.ads', JSON.stringify({ d: d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(), n: 3 }));
    return left;
  });
  assert(later === 0, `after a reload ${later} left`);
  await g.page.reload();
  await g.page.waitForTimeout(400);
  const next = await g.page.evaluate(() => window.__kus.adsLeft());
  assert(next === 3, `a new day gives ${next}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('ads: an ad closed early or failed pays nothing and spends nothing', async () => {
  const g = await open({ init: NATFAKE, play: false, returning: true });
  const o = await g.page.evaluate(`(async () => { ${SLEEP}
    const out = {}, bank0 = k.sugar;
    k.openShop();
    for (const r of ['closed', 'error']) {
      __nat.ad = r;
      document.getElementById('adBtn').click();
      await sleep(60);
      out[r] = { paid: k.sugar - bank0, left: k.adsLeft(), msg: document.getElementById('shopMsg').textContent, on: !document.getElementById('adBtn').disabled };
    }
    out.wantClosed = k.t('ad.closed'); out.wantErr = k.t('ad.err');
    return out; })()`);
  assert(o.closed.paid === 0 && o.closed.left === 3 && o.closed.msg === o.wantClosed && o.closed.on, `closed: ${JSON.stringify(o)}`);
  assert(o.error.paid === 0 && o.error.left === 3 && o.error.msg === o.wantErr && o.error.on, `error: ${JSON.stringify(o)}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('ads: an ad that answers after the timeout is ignored', async () => {
  const g = await open({ init: NATFAKE, play: false, returning: true });
  const o = await g.page.evaluate(`(async () => { ${SLEEP}
    const out = {}, bank0 = k.sugar;
    k.SHOP.adWait = 30; __nat.adMs = 200;
    k.openShop();
    document.getElementById('adBtn').click();
    await sleep(80);
    out.msg = document.getElementById('shopMsg').textContent === k.t('ad.err'); out.on = !document.getElementById('adBtn').disabled;
    await sleep(250);
    out.paid = k.sugar - bank0; out.left = k.adsLeft();
    return out; })()`);
  assert(o.msg && o.on && o.paid === 0 && o.left === 3, JSON.stringify(o));
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('ads: closing the shop during an ad still pays and tells in the bank row', async () => {
  const g = await open({ init: NATFAKE, play: false, returning: true });
  const o = await g.page.evaluate(`(async () => { ${SLEEP}
    const bank0 = k.sugar;
    __nat.adMs = 100;
    k.openShop();
    document.getElementById('adBtn').click();
    k.closeShop();
    await sleep(200);
    return { paid: k.sugar - bank0, left: k.adsLeft(), shop: k.shopOpen(), bank: document.getElementById('bank').textContent, want: k.t('ad.got', k.AD_SUGAR) }; })()`);
  assert(o.paid === 300 && o.left === 2 && !o.shop && o.bank === o.want, JSON.stringify(o));
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('ads: the game sound is suspended during the ad and comes back', async () => {
  const g = await open({ init: NATFAKE, play: false, returning: true });
  const o = await g.page.evaluate(`(async () => { ${SLEEP}
    k.Sfx.init(); await sleep(100);
    const out = { before: k.Sfx.ac && k.Sfx.ac.state };
    __nat.adMs = 150;
    k.openShop();
    document.getElementById('adBtn').click();
    await sleep(60);
    out.during = k.Sfx.ac.state;
    await sleep(250);
    out.after = k.Sfx.ac.state;
    return out; })()`);
  assert(o.before === 'running' && o.during === 'suspended' && o.after === 'running', JSON.stringify(o));
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('shop: the gamepad lands on the ad button and B closes the shop', async () => {
  const g = await open({ init: NATFAKE + PADFAKE, play: false, returning: true });
  const o = await g.page.evaluate(() => {
    const k = window.__kus,
      out = {};
    k.setPad(true);
    k.padPoll(1 / 60);
    k.openShop();
    k.padPoll(1 / 60);
    out.home = document.activeElement.id;
    __press(1, true);
    k.padPoll(1 / 60);
    __press(1, false);
    k.padPoll(1 / 60);
    out.open = k.shopOpen();
    return out;
  });
  assert(o.home === 'adBtn' && !o.open, JSON.stringify(o));
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('shop: the window fits at 360x640 and 844x390 in ru and en', async () => {
  for (const [width, height] of [
    [360, 640],
    [844, 390],
  ])
    for (const locale of ['ru-RU', 'en-US']) {
      const g = await open({
        init: NATFAKE.replace(
          'prices: null',
          "prices: [{ id: 'sugar_s', price: 'US$ 1.99' }, { id: 'sugar_m', price: 'US$ 4.99' }, { id: 'sugar_l', price: 'US$ 99.99' }]",
        ),
        width,
        height,
        locale,
        play: false,
        returning: true,
      });
      const bad = await g.page.evaluate(async () => {
        const k = window.__kus;
        k.openShop();
        await new Promise((r) => setTimeout(r, 120));
        const out = [],
          shop = document.getElementById('shop');
        for (const el of shop.querySelectorAll('button')) {
          if (el.classList.contains('hidden') || !el.offsetParent) continue;
          el.scrollIntoView({ block: 'nearest' });
          const r = el.getBoundingClientRect(),
            id = el.id || el.dataset.id || el.textContent.trim().slice(0, 12);
          if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight || !r.width) out.push(id + ' off screen');
          else if (!el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))) out.push(id + ' covered');
        }
        return out;
      });
      assert(bad.length === 0, `${width}x${height} ${locale}: ${bad.join(', ')}`);
      assert(g.errors.length === 0, g.errors.join(' | '));
      await g.close();
    }
});

const PRICED = NATFAKE.replace(
  'prices: null',
  "prices: [{ id: 'sugar_s', price: '1,99 €' }, { id: 'sugar_m', price: '4,99 €' }, { id: 'sugar_l', price: '9,99 €' }]",
);

test('packs: prices come from the store; no prices means «недоступен» and «Ещё раз»', async () => {
  const g = await open({ init: NATFAKE, play: false, returning: true });
  const o = await g.page.evaluate(`(async () => { ${SLEEP}
    const out = {}, packs = () => [...document.querySelectorAll('#packs [data-id]')];
    k.openShop(); await sleep(60);
    out.offMsg = document.getElementById('shopMsg').textContent === k.t('pack.off');
    out.retry = !!document.getElementById('packRetry'); out.none = packs().length;
    __nat.prices = [{ id: 'sugar_s', price: '1,99 €' }, { id: 'sugar_m', price: '4,99 €' }, { id: 'sugar_l', price: '9,99 €' }];
    document.getElementById('packRetry').click(); await sleep(60);
    out.texts = packs().map((b) => b.dataset.id + ' ' + b.textContent);
    out.msgAfter = document.getElementById('shopMsg').textContent;
    k.closeShop();
    window.KUS_NATIVE.products = () => new Promise(() => {});
    k.SHOP.priceWait = 30;
    k.openShop(); await sleep(90);
    out.hung = document.getElementById('shopMsg').textContent === k.t('pack.off');
    return out; })()`);
  assert(o.offMsg && o.retry && o.none === 0, `no prices: ${JSON.stringify(o)}`);
  assert(o.texts.length === 3, `the packs: ${JSON.stringify(o)}`);
  for (const [i, [n, p]] of [
    ['5', '1,99 €'],
    ['15', '4,99 €'],
    ['40', '9,99 €'],
  ].entries())
    assert(new RegExp('^\\S+ ' + n + '\\s?000').test(o.texts[i]) && o.texts[i].includes(p), `pack ${i}: ${o.texts[i]}`);
  assert(o.hung, `a store that never answers: ${JSON.stringify(o)}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('packs: ok pays once; cancel pays nothing; error says money was not taken; pending waits', async () => {
  const g = await open({ init: PRICED, play: false, returning: true });
  const o = await g.page.evaluate(`(async () => { ${SLEEP}
    const out = {}, msg = () => document.getElementById('shopMsg').textContent, btn = (id) => document.querySelector('#packs [data-id="' + id + '"]');
    k.openShop(); await sleep(60);
    let bank = k.sugar;
    btn('sugar_m').click(); await sleep(60);
    out.ok = { paid: k.sugar - bank, tx: JSON.parse(localStorage.getItem('kus.tx') || '[]'), msg: msg() === k.t('pack.got', 15000) };
    for (const st of ['cancel', 'error', 'pending']) {
      bank = k.sugar;
      __nat.buy = { status: st };
      btn('sugar_s').click(); await sleep(60);
      out[st] = { paid: k.sugar - bank, msg: msg(), on: !btn('sugar_s').disabled && !btn('sugar_l').disabled };
    }
    out.wantErr = k.t('pack.err'); out.wantWait = k.t('pack.wait');
    __nat.buy = { status: 'ok', tx: 't2' }; __nat.buyMs = 200;
    btn('sugar_s').click(); await sleep(40);
    out.busy = { others: btn('sugar_m').disabled && btn('sugar_l').disabled, text: btn('sugar_s').textContent.includes(k.t('pack.busy')) };
    await sleep(250);
    out.busyAfter = !btn('sugar_m').disabled;
    return out; })()`);
  assert(o.ok.paid === 15000 && o.ok.tx.includes('t1') && o.ok.msg, `ok: ${JSON.stringify(o.ok)}`);
  assert(o.cancel.paid === 0 && o.cancel.on, `cancel: ${JSON.stringify(o.cancel)}`);
  assert(o.error.paid === 0 && o.error.msg === o.wantErr && o.error.on, `error: ${JSON.stringify(o.error)}`);
  assert(o.pending.paid === 0 && o.pending.msg === o.wantWait, `pending: ${JSON.stringify(o.pending)}`);
  assert(o.busy.others && o.busy.text && o.busyAfter, `during a purchase: ${JSON.stringify(o)}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('packs: the same transaction from buy and from onPurchase pays once, also after a reload', async () => {
  const g = await open({ init: PRICED, play: false, returning: true });
  const a = await g.page.evaluate(`(async () => { ${SLEEP}
    const out = {}, bank0 = k.sugar;
    __nat.buy = { status: 'ok', tx: 't9' };
    k.openShop(); await sleep(60);
    document.querySelector('#packs [data-id="sugar_s"]').click(); await sleep(60);
    out.first = k.sugar - bank0;
    __nat.cb({ id: 'sugar_s', tx: 't9' });
    out.again = k.sugar - bank0;
    k.closeShop();
    return out; })()`);
  assert(a.first === 5000 && a.again === 5000, `before the reload: ${JSON.stringify(a)}`);
  await g.page.reload();
  await g.page.waitForTimeout(400);
  const b = await g.page.evaluate(`(async () => { ${SLEEP}
    const out = {}, bank0 = k.sugar;
    __nat.cb({ id: 'sugar_s', tx: 't9' });
    out.replay = k.sugar - bank0;
    __nat.cb({ id: 'sugar_l', tx: 't10' });
    out.late = k.sugar - bank0;
    out.bank = document.getElementById('bank').textContent === k.t('pack.late', 40000);
    __nat.cb({ id: 'nope', tx: 't11' });
    out.unknown = k.sugar - bank0; out.t11 = JSON.parse(localStorage.getItem('kus.tx')).includes('t11');
    __nat.buy = { status: 'ok' };
    k.openShop(); await sleep(60);
    document.querySelector('#packs [data-id="sugar_s"]').click(); await sleep(60);
    out.noTx = k.sugar - bank0;
    out.ls = +localStorage.getItem('kus.sugar') - bank0;
    return out; })()`);
  assert(b.replay === 0, `a replayed transaction paid again: ${JSON.stringify(b)}`);
  assert(b.late === 40000 && b.bank, `a late purchase in the menu: ${JSON.stringify(b)}`);
  assert(b.unknown === 40000 && !b.t11, `an unknown pack: ${JSON.stringify(b)}`);
  assert(b.noTx === 45000 && b.ls === 45000, `ok without a transaction id: ${JSON.stringify(b)}`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('packs: a late purchase during a run pays at once and tells in the menu after the run', async () => {
  const g = await open({ init: PRICED });
  const o = await g.page.evaluate(() => {
    const k = window.__kus,
      bank0 = +localStorage.getItem('kus.sugar');
    k.pause(true);
    __nat.cb({ id: 'sugar_s', tx: 'r1' });
    const now = +localStorage.getItem('kus.sugar') - bank0;
    k.toMenu();
    return { now, bank: document.getElementById('bank').textContent, want: k.t('pack.late', 5000) };
  });
  assert(o.now === 5000 && o.bank === o.want, JSON.stringify(o));
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
});

test('packs: a buy with no answer unlocks the buttons after buyWait and still pays when it answers', async () => {
  const g = await open({ init: PRICED, play: false, returning: true });
  const o = await g.page.evaluate(`(async () => { ${SLEEP}
    const out = {}, bank0 = k.sugar, btn = (id) => document.querySelector('#packs [data-id="' + id + '"]');
    k.openShop(); await sleep(60);
    k.SHOP.buyWait = 40; __nat.buyMs = 200;
    btn('sugar_s').click(); await sleep(90);
    out.on = !btn('sugar_m').disabled && !btn('sugar_s').disabled; out.slow = document.getElementById('shopMsg').textContent === k.t('pack.slow');
    out.early = k.sugar - bank0;
    await sleep(250);
    out.paid = k.sugar - bank0;
    return out; })()`);
  assert(o.on && o.slow && o.early === 0 && o.paid === 5000, JSON.stringify(o));
  assert(g.errors.length === 0, g.errors.join(' | '));
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
