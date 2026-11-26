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
// locale: the browser language; Russian by default, since headless Chrome is English and the game picks its language from it.
async function open({ width = 1200, height = 720, touch = false, dpr = 1, play = true, returning = false, locale = 'ru-RU' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch, locale });
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
    return out; })()`);
  assert(r.nyam.length === 1, `only one «ням» may hang over the candy at a time, saw ${JSON.stringify(r.nyam)}`);
  assert(r.kills === 3, `all three small candies must be swallowed whole, got ${r.kills}`);
  assert(r.combos.join() === '1,2,3', `swallows in a row must count 1,2,3, got ${r.combos}`);
  assert(r.words.join() === 'Ням!' && r.chip === '×3', `the third swallow must stamp Ням! and show ×3: ${r.words} ${r.chip}`);
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
  assert(r.a.taken && r.b.taken && r.c.taken, `the player's own pickup was not collected (a stray blob won the overlap): ${JSON.stringify([r.a, r.b, r.c])}`);
  assert(r.a.combo === 1 && r.a.words.length === 0 && Math.abs(r.a.comboT - 4) < 0.05, `a first pickup must start a streak at 1 with no word: ${JSON.stringify(r.a)}`);
  assert(r.b.combo === 2 && r.b.words.join() === 'Кусь-кусь!' && r.b.chip === '×2', `a pickup inside a streak must make ×2 and stamp the word: ${JSON.stringify(r.b)}`);
  assert(r.c.combo === 5 && r.c.words.join() === 'Хрум-хрум!', `a pickup at the last moment must make ×5 Хрум-хрум!, never На волоске!: ${JSON.stringify(r.c)}`);
  assert(r.d.taken && r.d.same, `a bot taking a bonus must not touch the player's streak: ${JSON.stringify(r.d)}`);
  assert(r.a.texts.includes('Скорость!'), `a pickup that only starts a streak still names the bonus over the candy: ${JSON.stringify(r.a.texts)}`);
  assert(!r.b.texts.includes('Скорость!') && !r.c.texts.includes('Скорость!'), `inside a streak the stamp talks, the bonus name must not float over the candy: ${JSON.stringify([r.b.texts, r.c.texts])}`);
  assert(r.f.taken && r.f.moved && Math.abs(r.f.kick + Math.PI / 2) < 0.35 && r.f.woundAbove, `the kick and the last spot must point at a bonus above the player: ${JSON.stringify(r.f)}`);
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
      B.mass = 60; k.place(B, 2000, 2000, 0); k.place(P, 2000 - B.Rs - P.Rs + 6, 2000, 0); let f = 0;
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
  const endlessFull = await g.page.evaluate(() => document.getElementById('stage').getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length);
  assert(endlessFull >= 2, `lod 0: the pill must animate again, ${endlessFull} animations run`);
  assert(g.errors.length === 0, g.errors.join(' | '));
  await g.close();
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

// On phones the buttons sit on the left and the joystick hint on the right by default; «Справа» moves them back and is remembered.
// A save from before this default (lefty: false without hv) is the old default, not a choice: it gets the new one.
test('settings: phone buttons on the left by default, the hand switch is remembered', async () => {
  const side = (page) => page.evaluate(() => { const d = document.getElementById('dash').getBoundingClientRect(), t = document.getElementById('dodge').getBoundingClientRect();
    return { lefty: document.body.classList.contains('lefty'), dash: d.left + d.width / 2, tongue: t.left + t.width / 2, w: innerWidth,
      pressed: document.querySelector('#handSeg [aria-pressed="true"]')?.dataset.v, saved: JSON.parse(localStorage.getItem('kus.set') || 'null') }; });
  const g = await open({ width: 390, height: 844, touch: true });
  const fresh = await side(g.page);
  assert(fresh.lefty && fresh.dash < fresh.w / 2 && fresh.tongue < fresh.w / 2 && fresh.pressed === '1', `fresh phone: Кусь and Язык must sit on the left: ${JSON.stringify(fresh)}`);
  await g.page.evaluate(() => document.querySelector('#handSeg button[data-v="0"]').click());
  const right = await side(g.page);
  assert(!right.lefty && right.dash > right.w / 2 && right.pressed === '0' && right.saved && right.saved.lefty === false && right.saved.hv === 2, `«Справа» must move the buttons right and save it: ${JSON.stringify(right)}`);
  await g.page.reload(); await g.page.waitForTimeout(600); await g.page.tap('#play'); await g.page.waitForTimeout(250);
  const again = await side(g.page);
  assert(!again.lefty && again.dash > again.w / 2, `the chosen «Справа» must survive a reload: ${JSON.stringify(again)}`);
  await g.close();
  const old = await open({ width: 390, height: 844, touch: true, play: false });
  await old.page.evaluate(() => localStorage.setItem('kus.set', JSON.stringify({ lefty: false, bs: 1, gfx: 'auto', fps: false })));
  await old.page.reload(); await old.page.waitForTimeout(600); await old.page.tap('#play'); await old.page.waitForTimeout(250);
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
  await g.page.evaluate(`(() => { const k = window.__kus; k.toMenu(); k.setMode('t3'); k.startGame(); k.player.spawnT = 0; k.setTimeLeft(0.001); for (let i = 0; i < 90; i++) k.update(1/60); })()`);
  await look('3-minute end card');
  await g.page.evaluate(() => document.getElementById('chalBtn').click());
  // the album page from the menu
  await g.page.evaluate(() => { window.__kus.toMenu(); document.getElementById('albumBtn').click(); document.querySelector('#albumRows .st').click(); });
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
  await g.page.evaluate(`(() => { const k = window.__kus; k.toMenu(); document.querySelector('#fpsSeg [data-v="1"]').click(); k.setMode('free'); k.startGame(); })()`);
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
    const cut = await g.page.evaluate(() => [...document.querySelectorAll('#albumRows .sn')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
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
      const next = (el) => [...document.querySelectorAll('#secSetB .grp')].find((h) => h.getBoundingClientRect().top > el.getBoundingClientRect().bottom && h.getClientRects().length);
      const gap = (el) => Math.round(next(el).getBoundingClientRect().top - el.getBoundingClientRect().bottom);
      const sizeSeg = document.getElementById('sizeSeg');
      return { lang: gap(document.getElementById('langSeg')), other: sizeSeg.getClientRects().length ? gap(sizeSeg) : null };
    });
    await g.close();
  }
  const ref = gaps.phone.other;
  assert(ref > 6 && Math.abs(gaps.phone.lang - ref) <= 1 && Math.abs(gaps.pc.lang - ref) <= 1, `gaps after the language row vs the others: ${JSON.stringify(gaps)}`);
});

test('lang: the English stage pill says the number before an event is mass, not time', async () => {
  const g = await open({ play: false, returning: true, locale: 'en-US' });
  const r = await g.page.evaluate(`(() => { ${STG} free(); run(0.5);
    const el = document.getElementById('stage');
    return { label: el.querySelector('.t').textContent.trim(), num: el.querySelector('b').textContent.trim() }; })()`);
  assert(/mass/i.test(r.label) && !/\bin$/.test(r.label) && /^\d+$/.test(r.num), `stage pill: "${r.label}" + "${r.num}"`);
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
