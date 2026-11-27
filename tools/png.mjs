// Small PNG helpers for the picture tools (og.mjs, shots.mjs): no dependencies.
//   rgbaOf(page, png)          decode a screenshot to raw RGBA in a blank browser page
//   indexedPng(rgba, w, h, n)  a palette PNG with up to n colours (median cut, nearest-colour mapping, zlib)
//   apng(frames, w, h, ms, n)  an animated PNG of equal-size RGBA frames sharing one palette, looping forever
//   truePng(rgba, w, h, alpha) a full-colour PNG, RGBA or (alpha false) RGB with no alpha channel, as app stores want
//   ico(images)                a Windows .ico holding PNG images of the given sizes
import { deflateSync } from 'node:zlib';

// Decode a PNG buffer to raw RGBA using a page that runs nothing else (the game page keeps its loop running).
export async function rgbaOf(page, png) {
  const b64 = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    // raw RGBA back to node as base64: far quicker than a JSON array of millions of numbers
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let s = '';
    for (let i = 0; i < d.length; i += 32768) s += String.fromCharCode.apply(null, d.subarray(i, i + 32768));
    return btoa(s);
  }, png.toString('base64'));
  return Buffer.from(b64, 'base64');
}

// Median cut over a 5-bit-per-channel histogram of all the given RGBA buffers.
function palette(list, max) {
  const hist = new Map();
  for (const px of list)
    for (let i = 0; i < px.length; i += 4) {
      const key = ((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3);
      hist.set(key, (hist.get(key) || 0) + 1);
    }
  const cols = [...hist].map(([key, c]) => [((key >> 10) & 31) * 8 + 4, ((key >> 5) & 31) * 8 + 4, (key & 31) * 8 + 4, c]);
  let boxes = [cols];
  while (boxes.length < max) {
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
    for (; cut < b.length - 2; cut++) if ((half += b[cut][3]) >= tot / 2) break; // both halves keep at least one colour
    boxes.splice(bi, 1, b.slice(0, cut + 1), b.slice(cut + 1));
  }
  return boxes.map((b) => {
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
}

// One filtered scanline buffer (filter byte 0) of palette indices.
function indices(px, w, h, pal, cache) {
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
  return raw;
}

const crcT = new Int32Array(256).map((_, i) => {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  let c = -1;
  for (let i = 4; i < 8 + data.length; i++) c = crcT[(c ^ out[i]) & 255] ^ (c >>> 8);
  out.writeUInt32BE((c ^ -1) >>> 0, 8 + data.length);
  return out;
}
function header(w, h, type = 3) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = type; // 3 palette, 2 RGB, 6 RGBA
  return [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)];
}

export function indexedPng(px, w, h, max = 256) {
  const pal = palette([px], max);
  return Buffer.concat([
    ...header(w, h),
    chunk('PLTE', Buffer.from(pal.flat())),
    chunk('IDAT', deflateSync(indices(px, w, h, pal, new Map()), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function truePng(px, w, h, alpha = true) {
  const n = alpha ? 4 : 3,
    raw = Buffer.alloc((w * n + 1) * h); // each row starts with filter 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < n; c++) raw[y * (w * n + 1) + 1 + x * n + c] = px[(y * w + x) * 4 + c];
  return Buffer.concat([...header(w, h, alpha ? 6 : 2), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// images: [{ size, png }]; the directory says 0 for a side of 256
export function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let at = head.length;
  images.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i;
    head[e] = head[e + 1] = size >= 256 ? 0 : size;
    head.writeUInt16LE(1, e + 4); // colour planes
    head.writeUInt16LE(32, e + 6); // bits per pixel
    head.writeUInt32LE(png.length, e + 8);
    head.writeUInt32LE(at, e + 12);
    at += png.length;
  });
  return Buffer.concat([head, ...images.map((m) => m.png)]);
}

export function apng(frames, w, h, ms, max = 256) {
  const pal = palette(frames, max),
    cache = new Map(),
    out = [...header(w, h)];
  const actl = Buffer.alloc(8);
  actl.writeUInt32BE(frames.length, 0); // frames; 0 plays = loop forever
  out.push(chunk('acTL', actl), chunk('PLTE', Buffer.from(pal.flat())));
  let seq = 0;
  frames.forEach((px, i) => {
    const fc = Buffer.alloc(26);
    fc.writeUInt32BE(seq++, 0);
    fc.writeUInt32BE(w, 4);
    fc.writeUInt32BE(h, 8);
    fc.writeUInt16BE(ms, 20); // delay ms / 1000
    fc.writeUInt16BE(1000, 22);
    out.push(chunk('fcTL', fc)); // offsets 0, dispose 0, blend 0 (every frame is a full picture)
    const data = deflateSync(indices(px, w, h, pal, cache), { level: 9 });
    if (i === 0) out.push(chunk('IDAT', data));
    else {
      const sq = Buffer.alloc(4);
      sq.writeUInt32BE(seq++, 0);
      out.push(chunk('fdAT', Buffer.concat([sq, data])));
    }
  });
  out.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(out);
}
