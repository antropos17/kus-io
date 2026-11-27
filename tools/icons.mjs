// App store icons and the splash screen, drawn by the game's own icon code (drawIcon in src/js/17-boot.js).
//   npm run icons      (builds index.html first) writes store/:
//   icon-only.png        1024, no alpha     the App Store icon; @capacitor/assets makes every iOS and Android size from it
//   icon-foreground.png  1024, see-through  Android adaptive icon, front layer: the candy inside the 66/108 safe circle
//   icon-background.png  1024, no alpha     Android adaptive icon, back layer: the plain dark square
//   splash.png           2732, no alpha     the splash screen, one for both languages (no text)
//   play-512.png         512, no alpha      the Google Play listing icon
//   kus.ico              16…256             Windows: the desktop build's window, taskbar and Steam client icon
// Uses the installed Chrome (CHROME=/path overrides it).
import { chromium } from 'playwright-core';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { truePng, ico } from './png.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'store');
const FG_K = 0.8; // the candy's scale on the Android front layer; tests/run.mjs checks that it fits the safe circle
const BACK = '#2b1a14', // the icon's square, as drawIcon paints it
  GROUND = '#140b08'; // --ground, the page's background

const launch = {};
if (process.env.CHROME) launch.executablePath = process.env.CHROME;
else launch.channel = 'chrome';
const browser = await chromium.launch(launch);
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(join(root, 'index.html')).href);
await page.waitForTimeout(300);
await page.evaluate(() => window.__kus.pause(true)); // the game loop is not needed

// Draw in the page and bring the RGBA back. fill: a colour under everything; icon: drawIcon's side, options and the
// offset of its box on the canvas.
async function draw(size, { fill = '', icon = 0, opt = {}, at = 0 } = {}) {
  const b64 = await page.evaluate(
    ({ size, fill, icon, opt, at }) => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      if (fill) {
        g.fillStyle = fill;
        g.fillRect(0, 0, size, size);
      }
      if (icon) {
        g.translate(at, at);
        window.__kus.drawIcon(g, icon, opt);
      }
      const d = g.getImageData(0, 0, size, size).data;
      let s = '';
      for (let i = 0; i < d.length; i += 32768) s += String.fromCharCode.apply(null, d.subarray(i, i + 32768));
      return btoa(s);
    },
    { size, fill, icon, opt, at },
  );
  return Buffer.from(b64, 'base64');
}

mkdirSync(out, { recursive: true });
// a page that threw may have drawn a broken icon: stop before it overwrites a good file in store/
function write(name, file) {
  if (errors.length) throw new Error(`page errors, ${name} not written: ${errors.join(' | ')}`);
  writeFileSync(join(out, name), file);
}
function save(name, png, size, alpha) {
  // read the header back: an icon with an alpha channel is refused by App Store Connect
  if (png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size || png[25] !== (alpha ? 6 : 2))
    throw new Error(`${name}: wrong size or colour type`);
  write(name, png);
  console.log(`store/${name} ${size}x${size}${alpha ? '' : ', no alpha'}, ${Math.round(png.length / 1024)} KB`);
}

save('icon-only.png', truePng(await draw(1024, { icon: 1024 }), 1024, 1024, false), 1024, false);
save('icon-foreground.png', truePng(await draw(1024, { icon: 1024, opt: { bg: false, k: FG_K } }), 1024, 1024), 1024, true);
save('icon-background.png', truePng(await draw(1024, { fill: BACK }), 1024, 1024, false), 1024, false);
save(
  'splash.png',
  truePng(await draw(2732, { fill: GROUND, icon: 1024, opt: { bg: false }, at: (2732 - 1024) / 2 }), 2732, 2732, false),
  2732,
  false,
);
save('play-512.png', truePng(await draw(512, { icon: 512 }), 512, 512, false), 512, false);

const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = [];
for (const n of sizes) images.push({ size: n, png: truePng(await draw(n, { icon: n }), n, n) });
const file = ico(images);
write('kus.ico', file);
console.log(`store/kus.ico ${sizes.join(', ')}, ${Math.round(file.length / 1024)} KB`);

await browser.close();
process.exit(0); // the Chrome pipe can keep node waiting after close
