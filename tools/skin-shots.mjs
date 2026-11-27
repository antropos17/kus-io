// Screenshots of patterns, the same scene every time, for before/after comparisons of skin work.
//   node tools/skin-shots.mjs <outDir> [ids=hearts,tiger,foil,galaxy]
// For 360x640 and 390x844 (dpr 2, Russian), with the chosen patterns bought:
//   menu-<size>-<firstId>.png, menu-<size>-<lastId>.png  the open «Конфета» section, the «Узор» row scrolled to that pattern
//   run-<size>.png  four candies of mass 160 in the chosen patterns, held still, every other candy and floating word removed
//   sheet.png  the menu's pattern circles of the chosen patterns on flavours 0, 3, 6, 5, 2 (one row per pattern)
// HTML=file shoots another build than index.html (a frozen copy, say). Needs a fresh `npm run build`. Uses the installed Chrome.
import { chromium } from 'playwright-core';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = pathToFileURL(process.env.HTML || join(root, 'index.html')).href;
const OUT = resolve(process.argv[2] || 'skin-shots');
const IDS = (process.argv[3] || 'hearts,tiger,foil,galaxy').split(',');
const SIZES = [
  { id: '360x640', width: 360, height: 640 },
  { id: '390x844', width: 390, height: 844 },
];
const FLAVS = [0, 3, 6, 5, 2];
mkdirSync(OUT, { recursive: true });

const launch = {};
if (process.env.CHROME) launch.executablePath = process.env.CHROME;
else launch.channel = 'chrome';
const browser = await chromium.launch(launch);
let rows = null;
for (const s of SIZES) {
  const ctx = await browser.newContext({
    viewport: { width: s.width, height: s.height },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    locale: 'ru-RU',
  });
  await ctx.addInitScript((ids) => {
    localStorage.setItem('kus.best', '120');
    localStorage.setItem('kus.own', JSON.stringify({ v: 1, hat: [], skin: ids, eyes: [], trail: [], tray: [] }));
    localStorage.setItem('kus.skin', ids[ids.length - 1]);
    localStorage.setItem('kus.color', '0');
  }, IDS);
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push(String(e)));
  await pg.goto(URL);
  await pg.waitForTimeout(700);
  if (!rows) {
    rows = IDS.map(() => []);
    for (const fl of FLAVS) {
      const got = await pg.evaluate(
        ([fl, ids]) => {
          document.querySelector(`#sw [data-i="${fl}"]`).click();
          return ids.map((id) => document.querySelector(`#skins [data-s="${id}"] canvas`).toDataURL());
        },
        [fl, IDS],
      );
      got.forEach((u, i) => rows[i].push(u));
    }
    await pg.evaluate(() => document.querySelector('#sw [data-i="0"]').click());
  }
  await pg.evaluate(() => {
    const el = document.getElementById('secLook');
    if (!el.classList.contains('open')) el.querySelector('.sh').click();
  });
  await pg.waitForTimeout(400);
  for (const at of [IDS[0], IDS[IDS.length - 1]]) {
    await pg.evaluate((at) => {
      const r = document.getElementById('skins');
      r.scrollIntoView({ block: 'center' });
      r.scrollLeft = r.querySelector(`[data-s="${at}"]`).offsetLeft - r.offsetLeft - 4;
    }, at);
    await pg.waitForTimeout(250);
    await pg.screenshot({ path: join(OUT, `menu-${s.id}-${at}.png`) });
  }
  // the run: grow everyone first, so the spacing is measured on the grown player
  await pg.evaluate(() => document.getElementById('play').click());
  await pg.waitForTimeout(600);
  await pg.evaluate(() => {
    ['feed', 'announce'].forEach((id) => (document.getElementById(id).style.display = 'none'));
    window.__kus.blobs.forEach((b) => (b.mass = 160));
  });
  await pg.waitForTimeout(1000);
  await pg.evaluate((ids) => {
    const k = window.__kus,
      p = k.player,
      four = [p, ...k.blobs.filter((b) => !b.isPlayer && !b.kind).slice(0, 3)],
      d = p.Rs * 2.6;
    four.forEach((b, i) => {
      b.skin = ids[i % ids.length];
      k.place(b, p.x + (i % 2 ? 0.5 : -0.5) * d, p.y + (i < 2 ? -0.5 : 0.5) * d, i * 1.3);
    });
    const spots = four.map((b) => [b.x, b.y]);
    const hold = () => {
      const bl = k.blobs;
      for (let i = bl.length - 1; i >= 0; i--) if (!four.includes(bl[i])) bl.splice(i, 1);
      four.forEach((b, i) => {
        b.x = spots[i][0];
        b.y = spots[i][1];
        b.vx = b.vy = 0;
        b.mass = 160;
      });
      k.texts.length = 0;
      requestAnimationFrame(hold);
    };
    hold();
  }, IDS);
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: join(OUT, `run-${s.id}.png`) });
  await ctx.close();
  if (errors.length) throw new Error(`page errors at ${s.id}: ${errors.join(' | ')}`);
}
let html = '<html><body style="margin:0;background:#2b1a2e;font:14px sans-serif;color:#fff"><table cellspacing=6>';
rows.forEach((r, i) => (html += `<tr><td style="width:70px">${IDS[i]}</td>${r.map((u) => `<td><img src="${u}" width=92></td>`).join('')}</tr>`));
const page = await browser.newPage({ viewport: { width: 640, height: 120 } });
await page.setContent(html + '</table></body></html>');
await page.screenshot({ path: join(OUT, 'sheet.png'), fullPage: true });
await browser.close();
console.log(`skin shots: ${OUT}`);
