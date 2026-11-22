// Screenshots for the README, made from real frames of the game.
//   npm run shots            (builds index.html first) writes docs/media/*.png
//   node tools/shots.mjs hero desktop     only the named shots (hero, bite, desktop, phonePlay, phoneMenu, phoneDaily, specials)
// Scenes are staged through window.__kus the way tools/og.mjs does it: the game is paused, bodies are placed by hand,
// time is stepped in 1/60 s frames until the wanted moment, then the frame is taken. Every PNG is written with a
// palette (256 colours or fewer) so that each stays under 400 KB; bite.png is an animated PNG of about 1.2 MB.
// The menu runs in real time before a scene, so the scenes the autopilot plays (desktop, phonePlay, phoneDaily) come out
// different on every run: look at them before committing and run again if the moment is a dull one.
// Uses the installed Chrome (CHROME=/path overrides it).
import { chromium } from 'playwright-core';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { rgbaOf, indexedPng, apng } from './png.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs', 'media');
const URL = pathToFileURL(join(root, 'index.html')).href;
const LIMIT = 400 * 1024;
const launch = {};
if (process.env.CHROME) launch.executablePath = process.env.CHROME;
else launch.channel = 'chrome';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(launch);
const blank = await browser.newPage(); // decodes screenshots; the game pages keep their loop running

async function open(width, height, { touch = false, dpr = 1, query = '' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    // a fixed seed for fewer surprises from one run of this tool to the next
    let s = 7;
    Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    localStorage.clear();
  });
  await page.goto(URL + query);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  return { page, ctx, errors };
}

// Write a palette PNG, with fewer colours if it comes out too heavy.
async function save(name, png, w, h) {
  const rgba = await rgbaOf(blank, png);
  let file, n;
  for (n of [256, 192, 128, 96, 64]) {
    file = indexedPng(rgba, w, h, n);
    if (file.length <= LIMIT) break;
  }
  writeFileSync(join(out, name), file);
  console.log(`docs/media/${name} ${w}x${h}, ${n} colours, ${Math.round(file.length / 1024)} KB`);
}
async function finish(g, name) {
  if (g.errors.length) throw new Error(`${name}: ${g.errors.join(' | ')}`);
  await g.ctx.close();
}
const canvasOnly = (page) => page.addStyleTag({ content: 'body > *:not(#c){display:none!important}' });

// Shared in-page helpers, put on window.__shot before each scene.
const helpers = () => {
  const k = window.__kus;
  const S = (window.__shot = {});
  S.clean = () => {
    // no cheats, full detail, nobody but the player
    k.pause(true);
    for (const key in k.CHEAT) k.CHEAT[key] = key === 'speed' ? 1 : false;
    k.setLod(0);
    for (const b of k.blobs) if (b !== k.player) b.alive = false;
    for (let i = 0; i < 5; i++) k.update(1 / 60);
  };
  S.flavours = () => {
    // flavours are not exposed, so collect them from throwaway bots
    const pal = {};
    for (let i = 0; i < 300 && Object.keys(pal).length < 10; i++) {
      const t = k.spawnBot(20);
      pal[t.pal.name] = t.pal;
      t.alive = false;
    }
    for (let i = 0; i < 3; i++) k.update(1 / 60);
    return pal;
  };
  S.dress = (b, name, pal) => {
    b.name = name;
    if (pal) b.pal = pal;
    b.hat = 'none';
    b.skin = 'plain';
  };
  S.bot = (mass, x, y, face, name, pal) => {
    const b = k.spawnBot(mass);
    b.ai = null;
    b.spawnT = 0;
    S.dress(b, name, pal);
    k.place(b, x, y, face);
    return b;
  };
  S.autoplay = (min) => {
    // the autopilot plays at least min seconds, then on until a good moment: the whole view inside the tray, a few
    // candies in sight and no giant filling the screen; the event feed is then let to clear
    const calm = (P) => {
      const hw = innerWidth / 2 / k.cam.z + 30,
        hh = innerHeight / 2 / k.cam.z + 30;
      const seen = k.blobs.filter((b) => b.alive && b !== P && Math.abs(b.x - P.x) < hw && Math.abs(b.y - P.y) < hh);
      return (
        P.alive &&
        P.mass > 100 &&
        P.x > hw &&
        P.x < 4000 - hw &&
        P.y > hh &&
        P.y < 4000 - hh &&
        seen.length >= 3 &&
        !seen.some((b) => b.Rs > P.Rs * 3)
      );
    };
    let t = 0;
    while (t < min * 60 || (!calm(k.player) && t < 150 * 60)) {
      if (!k.player.ai) k.player.ai = k.newAI(); // a new life after being eaten gets the autopilot too
      k.update(1 / 60);
      t++;
    }
    const P = k.player;
    P.ai = null;
    document.getElementById('feed').innerHTML = '';
    return { seconds: Math.round(t / 60), calm: calm(P), mass: Math.round(P.mass) };
  };
  S.only = (list) => {
    // remove everybody the scene did not place (the game tops the population up while it runs)
    for (const b of k.blobs) if (!list.includes(b)) b.alive = false;
  };
  S.hold = (list) => {
    for (const b of list) {
      b.tx = b.x;
      b.ty = b.y;
      b.biteCd = 9;
    }
  };
};

// The bite scene used by the header picture and the animation: a strawberry candy bites a big blueberry one.
const biteScene = (opt) => {
  const k = window.__kus,
    S = window.__shot,
    P = k.player;
  S.clean();
  const pal = S.flavours();
  const cx = 2000,
    cy = 1500;
  S.dress(P, 'Кусака', pal['Клубника']);
  P.mass = 170;
  P.spawnT = 0;
  const V = S.bot(420, cx, cy, Math.PI, 'Зефирка', pal['Черника']);
  const spots = [
    [60, -480, 150, 0.4, 'Пастила', 'Лайм'],
    [110, 430, -140, 2.6, 'Ириска', 'Апельсин'],
    [35, -260, 250, -0.6, 'Мусс', 'Виноград'],
    [75, 500, 120, 3.5, 'Халва', 'Мята'],
    [25, 160, 250, 1.9, 'Ватрушка', 'Лимон'],
    [45, -470, -210, 0.9, 'Пряник', 'Апельсин'],
  ];
  const extras = spots.map((a) => S.bot(a[0], cx + a[1], cy + a[2], a[3], a[4], pal[a[5]]));
  for (let i = 0; i < 40; i++) k.update(1 / 60); // let the new bodies grow to their size
  k.place(V, cx + 60, cy, Math.PI);
  k.place(P, cx + 60 - V.Rs - P.Rs + 4, cy + 20, 0);
  extras.forEach((b, i) => k.place(b, cx + spots[i][1], cy + spots[i][2], spots[i][3]));
  P.biteCd = 0;
  k.setCam({ x: P.x + opt.dx, y: cy + 10, z: opt.z });
  S.step = () => {
    P.tx = V.x;
    P.ty = V.y;
    S.hold([V, ...extras]);
    k.update(1 / 60);
  };
  let f = 0,
    bitten = false;
  while (f < 240 && !opt.film) {
    S.step();
    f++;
    if (!bitten && P.stats.bites > 0) bitten = f;
    // a little after the snap the piece hangs between the teeth on a stretched strand
    if (bitten && f - bitten >= opt.after && k.strands.length) break;
  }
  k.render();
  return { bites: P.stats.bites, strands: k.strands.length };
};

const shots = {
  // README header: one big bite with the strand stretched, a few candies around
  async hero() {
    const W = 1280,
      H = 640;
    const g = await open(W, H);
    await g.page.click('#play');
    await g.page.waitForTimeout(250);
    await g.page.evaluate(helpers);
    const r = await g.page.evaluate(biteScene, { z: 1.12, dx: 130, after: 9 });
    if (!r.bites || !r.strands) throw new Error(`hero: no bite in frame ${JSON.stringify(r)}`);
    await canvasOnly(g.page);
    await g.page.waitForTimeout(100);
    await save('hero.png', await g.page.screenshot(), W, H);
    await finish(g, 'hero');
  },

  // a short loop of the same bite: the snap, the piece on its strand, chewing
  async bite() {
    const W = 560,
      H = 320;
    const g = await open(W, H);
    await g.page.click('#play');
    await g.page.waitForTimeout(250);
    await g.page.evaluate(helpers);
    await g.page.evaluate(biteScene, { z: 1, dx: 150, film: true });
    await canvasOnly(g.page);
    const frames = [];
    for (let i = 0; i < 60; i++) {
      // two game frames per picture: 30 pictures a second
      await g.page.evaluate(() => {
        const k = window.__kus;
        window.__shot.step();
        window.__shot.step();
        k.render();
      });
      frames.push(await rgbaOf(blank, await g.page.screenshot()));
    }
    const file = apng(frames, W, H, 33, 128);
    writeFileSync(join(out, 'bite.png'), file);
    console.log(`docs/media/bite.png ${W}x${H}, ${frames.length} frames, ${Math.round(file.length / 1024)} KB`);
    await finish(g, 'bite');
  },

  // PC, 1280x720: a normal round after the autopilot has played for a while, with the leaderboard and the minimap
  async desktop() {
    const W = 1280,
      H = 720;
    const g = await open(W, H);
    await g.page.fill('#nick', 'Кусака');
    await g.page.click('#play');
    await g.page.waitForTimeout(250);
    await g.page.evaluate(helpers);
    const r = await g.page.evaluate(() => {
      const k = window.__kus;
      k.pause(true);
      const r = window.__shot.autoplay(40);
      k.render();
      return r;
    });
    console.log('desktop', JSON.stringify(r));
    await g.page.waitForTimeout(150);
    await save('desktop.png', await g.page.screenshot(), W, H);
    await finish(g, 'desktop');
  },

  // phone, portrait: playing with the joystick under the thumb and the two buttons
  async phonePlay() {
    const W = 390,
      H = 844;
    const g = await open(W, H, { touch: true, dpr: 2 });
    await g.page.fill('#nick', 'Кусака');
    await g.page.tap('#play');
    await g.page.waitForTimeout(300);
    await g.page.evaluate(helpers);
    const r = await g.page.evaluate(() => {
      const k = window.__kus,
        s = k.stick;
      k.pause(true);
      const r = window.__shot.autoplay(25);
      // a thumb holding the stick up and to the right, low on the left where the screen is free of buttons
      s.on = true;
      s.bx = 104;
      s.by = 700;
      s.x = 140;
      s.y = 668;
      for (let i = 0; i < 20; i++) k.update(1 / 60);
      document.getElementById('feed').innerHTML = '';
      k.render();
      return r;
    });
    console.log('phonePlay', JSON.stringify(r));
    await g.page.waitForTimeout(150);
    await save('phone-play.png', await g.page.screenshot(), W * 2, H * 2);
    await finish(g, 'phonePlay');
  },

  // phone, portrait: the short menu a first visit gets
  async phoneMenu() {
    const W = 390,
      H = 844;
    const g = await open(W, H, { touch: true, dpr: 2 });
    await g.page.waitForTimeout(600);
    await save('phone-menu.png', await g.page.screenshot(), W * 2, H * 2);
    await finish(g, 'phoneMenu');
  },

  // phone, portrait: the end of a candy-of-the-day run
  async phoneDaily() {
    const W = 390,
      H = 844;
    const g = await open(W, H, { touch: true, dpr: 2 });
    await g.page.evaluate(() => {
      const k = window.__kus;
      k.pause(true);
      k.setMode('daily');
      k.startGame();
      const P = k.player;
      P.spawnT = 0;
      P.ai = k.newAI();
      for (let i = 0; i < 60 * 60; i++) k.update(1 / 60); // a minute of real play for honest numbers
      k.setTimeLeft(0.001);
      for (let i = 0; i < 100; i++) k.update(1 / 60);
      k.pause(false);
    });
    await g.page.waitForTimeout(1500);
    await save('phone-daily.png', await g.page.screenshot(), W * 2, H * 2);
    await finish(g, 'phoneDaily');
  },

  // the special rivals, one square frame each
  async specials() {
    const W = 520,
      H = 520;
    for (const kind of ['hedgehog', 'piranha', 'cake']) {
      const g = await open(W, H);
      await g.page.click('#play');
      await g.page.waitForTimeout(250);
      await g.page.evaluate(helpers);
      const r = await g.page.evaluate((kind) => {
        const k = window.__kus,
          S = window.__shot,
          P = k.player;
        S.clean();
        const pal = S.flavours();
        const cx = 2000,
          cy = 1500;
        P.spawnT = 0;
        S.dress(P, 'Кусака', pal['Клубника']);
        if (kind === 'hedgehog') {
          // the player bites a hedgehog from behind and gets the spines ("ай, колючки!")
          const h = k.spawnSpecial('hedgehog')[0];
          h.ai = null;
          h.spawnT = 0;
          h.mass = 220;
          P.mass = 130;
          for (let i = 0; i < 40; i++) k.update(1 / 60);
          S.only([P, h]);
          k.place(h, cx, cy, 0);
          k.place(P, cx - h.Rs - P.Rs + 4, cy + 10, 0);
          P.biteCd = 0;
          let f = 0;
          while (f++ < 240 && !(P.hurtT > 0)) {
            P.tx = h.x;
            P.ty = h.y;
            S.hold([h]);
            k.update(1 / 60);
          }
          for (let i = 0; i < 14; i++) {
            S.hold([h, P]);
            k.update(1 / 60);
          }
          if (P.stats.bites || !(f < 240)) throw new Error('hedgehog: the bite did not meet the spines');
          k.setCam({ x: (P.x + h.x) / 2, y: cy - 20, z: 1.15 });
        } else if (kind === 'piranha') {
          // a pack nibbles at the back of a giant; the player watches from the side
          const G = S.bot(700, cx, cy, Math.PI, 'Чак-чак', pal['Лимон']);
          P.mass = 80;
          for (let i = 0; i < 40; i++) k.update(1 / 60);
          const pack = k.spawnSpecial('piranha');
          S.only([P, G, ...pack]);
          k.place(G, cx, cy, Math.PI);
          k.place(P, cx - G.Rs - 400, cy + 300, 0);
          pack.forEach((b, i) => {
            b.spawnT = 0;
            k.place(b, cx + G.Rs + 50 + (i % 3) * 40, cy - 60 + Math.floor(i / 3) * 120, Math.PI);
          });
          const cast = [P, G, ...pack];
          let f = 0;
          const near = () => pack.filter((b) => b.alive && Math.hypot(b.x - G.x, b.y - G.y) < G.Rs + b.Rs + 45).length;
          // wait for a moment when most of the pack hangs on the giant and a piece is on its strand
          while (f++ < 900 && !(near() >= 3 && k.strands.length)) {
            S.only(cast);
            S.hold([P, G]);
            k.update(1 / 60);
          }
          for (let i = 0; i < 4; i++) {
            S.only(cast);
            S.hold([P, G]);
            k.update(1 / 60);
          }
          S.only(cast);
          k.update(1 / 60);
          // frame the giant's bitten back and the pack together
          const live = pack.filter((b) => b.alive),
            px = live.reduce((a, b) => a + b.x, 0) / live.length,
            py = live.reduce((a, b) => a + b.y, 0) / live.length;
          k.setCam({ x: (G.x + G.Rs * 0.6 + px) / 2, y: (G.y + py) / 2, z: 1.0 });
        } else {
          // the player goes for the cherry on the cake's back, the one soft spot
          const c = k.spawnSpecial('cake')[0];
          c.ai = null;
          c.spawnT = 0;
          P.mass = 110;
          for (let i = 0; i < 40; i++) k.update(1 / 60);
          k.place(c, cx, cy, 0);
          const a = Math.PI; // the cherry side
          k.place(P, cx + Math.cos(a) * (c.Rs + P.Rs + 4), cy + Math.sin(a) * (c.Rs + P.Rs + 4), 0);
          P.biteCd = 0;
          let f = 0,
            bitten = 0;
          while (f++ < 240) {
            P.tx = c.x;
            P.ty = c.y;
            S.hold([c]);
            k.update(1 / 60);
            if (!bitten && P.stats.bites) bitten = f;
            if (bitten && f - bitten >= 9) break;
          }
          k.setCam({ x: cx - c.Rs * 0.55, y: cy, z: 0.62 });
        }
        k.update(1 / 60);
        k.render();
        return { alive: k.blobs.filter((b) => b.alive).map((b) => b.name), bites: P.stats.bites };
      }, kind);
      await canvasOnly(g.page);
      await g.page.waitForTimeout(100);
      console.log(kind, JSON.stringify(r));
      await save(`${kind}.png`, await g.page.screenshot(), W, H);
      await finish(g, kind);
    }
  },
};

const pick = process.argv.slice(2);
for (const name of pick.length ? pick : Object.keys(shots)) {
  if (!shots[name]) throw new Error(`no shot "${name}"; there are: ${Object.keys(shots).join(', ')}`);
  await shots[name]();
}
await browser.close();
process.exit(0); // the Chrome pipe can keep node waiting after close
