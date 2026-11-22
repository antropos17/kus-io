// Link preview picture og.png (1200x630) made from a real frame of the game.
//   npm run og      (builds index.html first)
// Candies are placed through window.__kus, the player bites a big one, and the frame is taken while the piece is still
// stretched on its strand. The logo is laid over the canvas by the page itself, so it uses the game's own font.
// The PNG is written with a 256-colour palette to stay well under 300 KB.
import { chromium } from 'playwright-core';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

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
await blank.setContent(`<canvas id="x"></canvas>`);
const rgba = await blank.evaluate(async (b64) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const c = document.getElementById('x');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  // raw RGBA back to node as base64: far quicker than a JSON array of 3 million numbers
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let s = '';
  for (let i = 0; i < d.length; i += 32768) s += String.fromCharCode.apply(null, d.subarray(i, i + 32768));
  return btoa(s);
}, shot.toString('base64'));
await browser.close();
log('pixels read');
if (errors.length) throw new Error(errors.join(' | '));

const png = indexedPng(Buffer.from(rgba, 'base64'), W, H);
writeFileSync(join(root, 'og.png'), png);
console.log(`og.png ${W}x${H}, ${Math.round(png.length / 1024)} KB, frame: ${JSON.stringify(ok)}`);
process.exit(0); // the Chrome pipe can keep node waiting after close

// ---- 256-colour PNG: median cut palette, nearest-colour mapping, zlib ----
function indexedPng(px, w, h) {
  const n = w * h;
  // colour histogram on 5 bits per channel
  const hist = new Map();
  for (let i = 0; i < n; i++) {
    const key = ((px[i * 4] >> 3) << 10) | ((px[i * 4 + 1] >> 3) << 5) | (px[i * 4 + 2] >> 3);
    hist.set(key, (hist.get(key) || 0) + 1);
  }
  const cols = [...hist].map(([key, c]) => [((key >> 10) & 31) * 8 + 4, ((key >> 5) & 31) * 8 + 4, (key & 31) * 8 + 4, c]);
  let boxes = [cols];
  while (boxes.length < 256) {
    // split the box with the widest weighted range
    let best = -1,
      bi = -1,
      bc = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let ch = 0; ch < 3; ch++) {
        let lo = 255,
          hi = 0,
          wt = 0;
        for (const c of b) {
          lo = Math.min(lo, c[ch]);
          hi = Math.max(hi, c[ch]);
          wt += c[3];
        }
        const score = (hi - lo) * Math.sqrt(wt);
        if (score > best) {
          best = score;
          bi = i;
          bc = ch;
        }
      }
    });
    if (bi < 0) break;
    const b = boxes[bi].sort((a, c) => a[bc] - c[bc]);
    let half = 0,
      tot = 0;
    for (const c of b) tot += c[3];
    let cut = 0;
    for (; cut < b.length - 1; cut++) if ((half += b[cut][3]) >= tot / 2) break;
    boxes.splice(bi, 1, b.slice(0, cut + 1), b.slice(cut + 1));
  }
  const pal = boxes.map((b) => {
    let r = 0,
      g = 0,
      bl = 0,
      t = 0;
    for (const c of b) {
      r += c[0] * c[3];
      g += c[1] * c[3];
      bl += c[2] * c[3];
      t += c[3];
    }
    return [Math.round(r / t), Math.round(g / t), Math.round(bl / t)];
  });
  const cache = new Map();
  const nearest = (r, g, b) => {
    const key = (r << 16) | (g << 8) | b;
    let v = cache.get(key);
    if (v !== undefined) return v;
    let bd = 1e9;
    for (let i = 0; i < pal.length; i++) {
      const dr = pal[i][0] - r,
        dg = pal[i][1] - g,
        db = pal[i][2] - b,
        d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
      if (d < bd) {
        bd = d;
        v = i;
      }
    }
    cache.set(key, v);
    return v;
  };
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      raw[y * (w + 1) + 1 + x] = nearest(px[i], px[i + 1], px[i + 2]);
    }
  }
  const crcT = new Int32Array(256).map((_, i) => {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    let c = -1;
    for (let i = 4; i < 8 + data.length; i++) c = crcT[(c ^ out[i]) & 255] ^ (c >>> 8);
    out.writeUInt32BE((c ^ -1) >>> 0, 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 3; // palette
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('PLTE', Buffer.from(pal.flat())),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
