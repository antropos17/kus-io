// Link preview picture og.png (1200x630) made from a real frame of the game.
//   npm run og      (builds index.html first)
// Candies are placed through window.__kus, the player bites a big one, and the frame is taken while the piece is still
// stretched on its strand. The logo is laid over the canvas by the page itself, so it uses the game's own font.
// The PNG is written with a 256-colour palette to stay well under 300 KB.
import { chromium } from 'playwright-core';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { rgbaOf, indexedPng } from './png.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1200,
  H = 630;
const launch = {};
if (process.env.CHROME) launch.executablePath = process.env.CHROME;
else launch.channel = 'chrome';
const t0 = Date.now();
const log = (m) => process.env.OG_DEBUG && console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s ${m}`);
const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => {
  // a fixed seed for fewer surprises; the menu runs in real time before the scene, so colours and names are set below
  let s = 7;
  Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  localStorage.clear();
});
await page.goto(pathToFileURL(join(root, 'index.html')).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);
await page.click('#play');
await page.waitForTimeout(250);

const ok = await page.evaluate(() => {
  const k = window.__kus,
    P = k.player;
  k.pause(true);
  for (const key in k.CHEAT) k.CHEAT[key] = key === 'speed' ? 1 : false;
  k.setLod(0);
  for (const b of k.blobs) if (b !== P) b.alive = false;
  for (let i = 0; i < 5; i++) k.update(1 / 60);
  const cx = 2000,
    cy = 1500;
  // flavours are not exposed, so collect them from throwaway bots
  const pal = {};
  for (let i = 0; i < 300 && Object.keys(pal).length < 10; i++) {
    const t = k.spawnBot(20);
    pal[t.pal.name] = t.pal;
    t.alive = false;
  }
  for (let i = 0; i < 3; i++) k.update(1 / 60);
  const dress = (b, name, flavour) => {
    b.name = name;
    b.pal = pal[flavour] || b.pal;
    b.hat = 'none';
    b.skin = 'plain';
  };
  const bot = (mass, dx, dy, face, name, flavour) => {
    const b = k.spawnBot(mass);
    b.ai = null;
    b.spawnT = 0;
    dress(b, name, flavour);
    k.place(b, cx + dx, cy + dy, face);
    return b;
  };
  dress(P, 'Кусака', 'Клубника');
  P.mass = 170;
  P.spawnT = 0;
  const V = bot(420, 0, 0, Math.PI, 'Зефирка', 'Черника');
  const spots = [
    // the top left corner is kept for the logo; setCam below also keeps the minimap out of the frame
    [60, -500, 150, 0.4, 'Пастила', 'Лайм'],
    [110, 420, -190, 2.6, 'Ириска', 'Апельсин'],
    [35, -230, 235, -0.6, 'Мусс', 'Виноград'],
    [75, 470, 40, 3.5, 'Халва', 'Мята'],
    [25, 150, 235, 1.9, 'Ватрушка', 'Лимон'],
  ];
  const extras = spots.map((a) => bot(...a));
  for (let i = 0; i < 40; i++) k.update(1 / 60); // let the new bodies grow to their size
  k.place(V, cx + 60, cy, Math.PI);
  k.place(P, cx + 60 - V.Rs - P.Rs + 4, cy + 20, 0);
  extras.forEach((b, i) => k.place(b, cx + spots[i][1], cy + spots[i][2], spots[i][3]));
  P.biteCd = 0;
  const hold = (b) => {
    b.tx = b.x;
    b.ty = b.y;
  };
  let f = 0,
    bitten = false;
  while (f < 240) {
    P.tx = V.x;
    P.ty = V.y;
    hold(V);
    V.biteCd = 9;
    for (const b of extras) {
      hold(b);
      b.biteCd = 9;
    }
    k.update(1 / 60);
    f++;
    if (!bitten && P.stats.bites > 0) bitten = f;
    // a little after the snap the piece hangs between the teeth on a stretched strand
    if (bitten && f - bitten >= 9 && k.strands.length) break;
  }
  k.setCam({ x: P.x + 130, y: cy - 10, z: 1.08 });
  k.update(1 / 60);
  k.render();
  return { bites: P.stats.bites, strands: k.strands.length, chunks: k.chunks.length };
});
if (!ok.bites || !ok.strands) throw new Error(`no bite in frame: ${JSON.stringify(ok)}`);

await page.addStyleTag({
  content: `body > *:not(#c):not(#og){display:none!important}
  #og{position:fixed;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;
    background:linear-gradient(180deg,rgba(20,11,8,.72) 0,rgba(20,11,8,0) 34%)}
  #og .logo{position:absolute;left:44px;top:26px;margin:0;font-size:112px;text-shadow:0 7px 0 var(--berry2),0 12px 28px rgba(0,0,0,.55)}
  #og .logo span{text-shadow:0 5px 0 #b9770c,0 10px 24px rgba(0,0,0,.5)}`,
});
await page.evaluate(() => {
  const d = document.createElement('div');
  d.id = 'og';
  d.innerHTML = '<h1 class="logo">КУСЬ<span>.io</span></h1>';
  document.body.appendChild(d);
});
await page.waitForTimeout(100);
log('scene ready');
const shot = await page.screenshot({ type: 'png' });
log('screenshot');
await page.close(); // the game keeps its loop running, so pixels are read on a blank page
const blank = await browser.newPage();
const rgba = await rgbaOf(blank, shot);
await browser.close();
log('pixels read');
if (errors.length) throw new Error(errors.join(' | '));

const png = indexedPng(rgba, W, H);
writeFileSync(join(root, 'og.png'), png);
console.log(`og.png ${W}x${H}, ${Math.round(png.length / 1024)} KB, frame: ${JSON.stringify(ok)}`);
process.exit(0); // the Chrome pipe can keep node waiting after close
