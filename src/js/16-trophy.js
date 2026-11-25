// ---------- trophy: the live glaze frame on the win card ----------
// A canvas over #over .card, 24 px wider on each side. The card is DOM and its CSS mask (.card.trophy) bites the top-right
// corner; this canvas draws the bite's darker rim and the glaze along the card's outline from one torn end of the bite to
// the other: glow, dark under-edge, drips, the berry-lemon band, torn-end blobs, gloss, sprinkles and a moving shine.
// It pops in, lights from both torn ends and flashes where they meet. Look: docs/superpowers/specs/2026-11-25-mocks/trophy.html
const TR_PAD = 24,
  TR_N = 340,
  TR_BITE = 38, // the bite: centre 4 px right of and 4 px above the card's top-right corner, as in the .card.trophy mask
  TR_TOOTH = 9, // four tooth marks on the bite's rim, same mask
  TR_RIM = 64, // the rim and its crumbs fit a 64 px square in the card's top-right corner
  TR_POP = (2.5 * Math.PI) / 14, // the pop-in stops where cos(14t) = 0, so the card lands at scale 1 without a jump
  TR_SPR = ['#ff5d8f', '#ffd23f', '#7ad7ff', '#9be15d', '#c49bff', '#fff6e8', '#ff9a3d', '#4fe3c1'],
  TR_PAL = [
    ['#ff5d8f', '#ffd23f', '#ff7a9c', '#8f1838'], // berry and lemon
    ['#ffb020', '#ffe58a', '#ffc640', '#8a5208'], // gold, for a new record
  ];
// the band's colour flows between the palette's first two colours: 33 steps made once
const TR_LUT = TR_PAL.map((p) => {
  const A = [1, 3, 5].map((i) => parseInt(p[0].slice(i, i + 2), 16)),
    B = [1, 3, 5].map((i) => parseInt(p[1].slice(i, i + 2), 16)),
    out = [];
  for (let s = 0; s <= 32; s++) out.push(`rgb(${A.map((v, i) => Math.round(v + ((B[i] - v) * s) / 32)).join(',')})`);
  return out;
});
// soft glows are drawn from small pre-made sprites, so a frame makes no gradients
function trSprite(r, g, b) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d'),
    gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,250,232,1)');
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  return c;
}
const TR_GLOW = { tip: trSprite(255, 210, 63), flash: trSprite(255, 93, 143), tw: trSprite(255, 255, 255) };
const tr = {
  on: false,
  running: false,
  popping: false,
  frames: 0,
  card: null,
  cv: null,
  g: null,
  rim: document.createElement('canvas'),
  raf: 0,
  last: 0,
  age: 0,
  t: 0,
  flash: -1,
  pal: TR_PAL[0],
  lut: TR_LUT[0],
  w: 0,
  h: 0,
  dpr: 1,
  bx: 0,
  by: 0,
  rimX: 0,
  rimY: 0,
  P: new Float32Array(TR_N * 4), // the open outline: x, y and the outward normal per point
  q: new Float32Array(TR_N), // this frame's wobble of the glaze off the outline
  spr: [],
  dr: [],
  sp: [], // sparks and crumbs, a fixed pool
  tw: [], // twinkles, a fixed pool
  eTip: 0,
  eSpk: 0,
  eCrumb: 0,
  eTw: 0,
};
for (let i = 0; i < 160; i++) tr.sp.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, r: 0, vr: 0, dot: false, sz: 1, col: '' });
for (let i = 0; i < 16; i++) tr.tw.push({ on: false, i: 0, life: 0, max: 1 });

function trRound(g, x, y, w, h, r) {
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function trCutPath(g, teeth) {
  g.beginPath();
  g.arc(tr.bx, tr.by, TR_BITE, 0, TAU);
  for (let q = 0; q < 8; q += 2) {
    g.moveTo(teeth[q] + TR_TOOTH, teeth[q + 1]);
    g.arc(teeth[q], teeth[q + 1], TR_TOOTH, 0, TAU);
  }
}
// Sizes the canvas to the card and builds the outline: the card's rounded rect minus the bite, walked clockwise from the
// torn end on the right edge to the torn end on the top edge, resampled to TR_N points.
function trLayout() {
  const c = tr.card,
    cv = tr.cv,
    W = c.offsetWidth,
    H = c.offsetHeight;
  if (W < 120 || H < 120) return false;
  const d = Math.min(2, window.devicePixelRatio || 1);
  tr.w = W;
  tr.h = H;
  tr.dpr = d;
  cv.style.left = c.offsetLeft - TR_PAD + 'px';
  cv.style.top = c.offsetTop - TR_PAD + 'px';
  cv.style.width = W + 2 * TR_PAD + 'px';
  cv.style.height = H + 2 * TR_PAD + 'px';
  cv.width = Math.round((W + 2 * TR_PAD) * d);
  cv.height = Math.round((H + 2 * TR_PAD) * d);
  const R = Math.min(parseFloat(getComputedStyle(c).borderTopLeftRadius) || 0, W / 2, H / 2),
    X = TR_PAD,
    Y = TR_PAD,
    bx = X + W + 4,
    by = Y - 4,
    teeth = [];
  tr.bx = bx;
  tr.by = by;
  for (let q = 0; q < 4; q++) {
    const a = Math.PI / 2 + ((q + 0.5) / 4) * (Math.PI / 2);
    teeth.push(bx + Math.cos(a) * TR_BITE, by + Math.sin(a) * TR_BITE);
  }
  const cut = (p) => {
    if (Math.hypot(p[0] - bx, p[1] - by) < TR_BITE) return true;
    for (let q = 0; q < 8; q += 2) if (Math.hypot(p[0] - teeth[q], p[1] - teeth[q + 1]) < TR_TOOTH) return true;
    return false;
  };
  const raw = [],
    arc = (ax, ay, a0, a1) => {
      for (let i = 0; i <= 24; i++) {
        const a = a0 + ((a1 - a0) * i) / 24;
        raw.push([ax + R * Math.cos(a), ay + R * Math.sin(a)]);
      }
    };
  arc(X + W - R, Y + R, -Math.PI / 2, 0);
  arc(X + W - R, Y + H - R, 0, Math.PI / 2);
  arc(X + R, Y + H - R, Math.PI / 2, Math.PI);
  arc(X + R, Y + R, Math.PI, 1.5 * Math.PI);
  raw.push(raw[0]);
  const dense = [];
  for (let i = 0; i < raw.length - 1; i++) {
    const a = raw[i],
      b = raw[i + 1],
      n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
    for (let k = 0; k < n; k++) dense.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  let s = 0;
  while (s < dense.length && !cut(dense[s])) s++;
  while (s < dense.length && cut(dense[s])) s++;
  const open = [];
  for (let k = 0; k < dense.length; k++) {
    const p = dense[(s + k) % dense.length];
    if (cut(p)) break;
    open.push(p);
  }
  if (open.length < 2) return false;
  let L = 0;
  const acc = [0];
  for (let i = 1; i < open.length; i++) {
    L += Math.hypot(open[i][0] - open[i - 1][0], open[i][1] - open[i - 1][1]);
    acc.push(L);
  }
  const N = TR_N,
    P = tr.P;
  for (let k = 0, j = 0; k < N; k++) {
    const dd = (L * k) / (N - 1);
    while (j < acc.length - 2 && acc[j + 1] < dd) j++;
    const f = (dd - acc[j]) / (acc[j + 1] - acc[j] || 1);
    P[k * 4] = open[j][0] + (open[j + 1][0] - open[j][0]) * f;
    P[k * 4 + 1] = open[j][1] + (open[j + 1][1] - open[j][1]) * f;
  }
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - 3) * 4,
      b = Math.min(N - 1, i + 3) * 4,
      tx = P[b] - P[a],
      ty = P[b + 1] - P[a + 1],
      l = Math.hypot(tx, ty) || 1;
    P[i * 4 + 2] = ty / l;
    P[i * 4 + 3] = -tx / l;
  }
  tr.spr.length = 0;
  for (let q = 0; q < 48; q++)
    tr.spr.push({ i: Math.min(N - 1, Math.floor(((q + rand(0.2, 0.8)) * N) / 48)), a: rand(0, Math.PI), col: TR_SPR[q % TR_SPR.length] });
  const bottom = [];
  for (let i = 0; i < N; i++) if (P[i * 4 + 3] > 0.98) bottom.push(i);
  tr.dr.length = 0;
  if (bottom.length)
    for (let q = 0; q < 5; q++) tr.dr.push({ i: bottom[Math.floor(((q + 0.5) * bottom.length) / 5)], max: rand(8, 18), ph: rand(0, 6) });
  // the bite's rim: the card's «flesh» shows as a darker band along the cut, with a few crumbs; the bite itself stays fully clear
  const rim = tr.rim,
    g = rim.getContext('2d'),
    rx = X + W - TR_RIM,
    ry = Y;
  rim.width = rim.height = Math.round(TR_RIM * d);
  g.setTransform(d, 0, 0, d, -rx * d, -ry * d);
  g.save();
  g.beginPath();
  trRound(g, X, Y, W, H, R);
  g.clip();
  trCutPath(g, teeth);
  g.lineWidth = 16;
  g.strokeStyle = '#f6dcbc';
  g.stroke();
  g.lineWidth = 7;
  g.strokeStyle = '#ecc497';
  g.stroke();
  g.lineWidth = 2.5;
  g.strokeStyle = '#d69b66';
  g.stroke();
  g.restore();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';
  trCutPath(g, teeth);
  g.fill();
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#e7b98a';
  for (let q = 0; q < 14; q++) {
    const a = rand(Math.PI * 0.55, Math.PI * 0.95),
      r = rand(46, 54);
    g.beginPath();
    g.arc(bx + Math.cos(a) * r, by + Math.sin(a) * r, rand(0.6, 1.3), 0, TAU);
    g.fill();
  }
  tr.rimX = rx;
  tr.rimY = ry;
  return true;
}

let trX = 0,
  trY = 0;
function trPt(i, e) {
  const o = i * 4,
    P = tr.P,
    q = tr.q[i] + e;
  trX = P[o] + P[o + 2] * q;
  trY = P[o + 1] + P[o + 3] * q;
}
function trTrace(g, a, b, e) {
  for (let i = a; i <= b; i++) {
    trPt(i, e);
    if (i === a) g.moveTo(trX, trY);
    else g.lineTo(trX, trY);
  }
}
function trPath(g, k, full, e) {
  g.beginPath();
  if (full) trTrace(g, 0, TR_N - 1, e);
  else {
    trTrace(g, 0, k, e);
    trTrace(g, TR_N - 1 - k, TR_N - 1, e);
  }
}
const trCol = (i) => tr.lut[Math.round((0.5 + 0.5 * Math.sin(i * 0.04 - tr.t * 1.4)) * 32)];
function trBand(g, a, b) {
  for (let i = a; i < b; i += 4) {
    g.strokeStyle = trCol(i);
    g.beginPath();
    for (let q = 0; q <= 4 && i + q <= b; q++) {
      trPt(i + q, 0);
      if (q) g.lineTo(trX, trY);
      else g.moveTo(trX, trY);
    }
    g.stroke();
  }
}
// The glaze lit from both torn ends up to ign (0..1); returns how far each lit half reaches.
function trGlaze(g, ign, spec) {
  const N = TR_N,
    P = tr.P,
    pal = tr.pal,
    t = tr.t,
    k = Math.floor((ign * (N - 1)) / 2),
    full = ign >= 1;
  for (let i = 0; i < N; i++)
    tr.q[i] = 1.5 + 1.1 * (Math.sin(i * 0.13 + t * 1.6) * 0.6 + Math.sin(i * 0.047 - t * 1.1) * 0.8 + Math.sin(i * 0.31 + t * 2.7) * 0.25);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // the soft glow stays thin: a wide one fills the bite's hollow with a grey half-disc
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.22;
  g.strokeStyle = g.shadowColor = pal[2];
  g.shadowBlur = 16;
  g.lineWidth = 11;
  trPath(g, k, full, 0);
  g.stroke();
  g.shadowBlur = 0;
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 0.5;
  g.strokeStyle = pal[3];
  g.lineWidth = 9.5;
  trPath(g, k, full, 0.8);
  g.stroke();
  g.globalAlpha = 1;
  for (let q = 0; q < tr.dr.length; q++) {
    const dp = tr.dr[q],
      o = dp.i * 4;
    if (!full && dp.i > k && dp.i < N - 1 - k) continue;
    trPt(dp.i, 0);
    const len = dp.max * (0.75 + 0.25 * Math.sin(t * 1.2 + dp.ph)) * Math.min(1, ign * 1.3),
      ex = trX + P[o + 2] * len,
      ey = trY + P[o + 3] * len,
      col = trCol(dp.i);
    g.strokeStyle = g.fillStyle = col;
    g.lineWidth = 5.2;
    g.beginPath();
    g.moveTo(trX, trY);
    g.lineTo(ex, ey);
    g.stroke();
    g.beginPath();
    g.arc(ex, ey, 3.9, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.6)';
    g.beginPath();
    g.arc(ex - 1.2, ey - 0.8, 1.1, 0, TAU);
    g.fill();
  }
  g.lineWidth = 7;
  if (full) trBand(g, 0, N - 1);
  else {
    trBand(g, 0, k);
    trBand(g, N - 1 - k, N - 1);
  }
  // the torn ends: a blob of glaze and a small drop beside it
  for (let e = 0; e < N; e += N - 1) {
    const o = e * 4,
      sg = e ? -1 : 1;
    trPt(e, 0);
    g.fillStyle = trCol(e);
    g.beginPath();
    g.arc(trX, trY, 5.2, 0, TAU);
    g.fill();
    g.beginPath();
    g.arc(trX + P[o + 2] * 4 - sg * P[o + 3] * 3, trY + P[o + 3] * 4 + sg * P[o + 2] * 3, 2.4, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 0.6;
  g.strokeStyle = '#fffaf0';
  g.lineWidth = 1.4;
  trPath(g, k, full, -1.4);
  g.stroke();
  g.globalAlpha = 1;
  g.lineWidth = 2.6;
  for (let q = 0, step = 1 << lod; q < tr.spr.length; q += step) {
    const s = tr.spr[q],
      o = s.i * 4;
    if (!full && s.i > k && s.i < N - 1 - k) continue;
    trPt(s.i, 0);
    const ta = Math.atan2(P[o + 2], -P[o + 3]) + s.a,
      cx = Math.cos(ta) * 2.7,
      cy = Math.sin(ta) * 2.7;
    g.strokeStyle = s.col;
    g.beginPath();
    g.moveTo(trX - cx, trY - cy);
    g.lineTo(trX + cx, trY + cy);
    g.stroke();
  }
  if (spec && full) {
    // a shine running along the band
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = '#fff';
    g.lineWidth = 3;
    const ci = Math.floor(t * 55) % N;
    for (let j = -16; j < 16; j++) {
      const i1 = ci + j;
      if (i1 < 0 || i1 + 1 >= N) continue;
      const a = 1 - Math.abs(j) / 16;
      g.globalAlpha = a * a * 0.9;
      g.beginPath();
      trPt(i1, -1);
      g.moveTo(trX, trY);
      trPt(i1 + 1, -1);
      g.lineTo(trX, trY);
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }
  return k;
}
function trGlow(g, spr, x, y, r, a) {
  if (a <= 0) return;
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = Math.min(1, a);
  g.drawImage(spr, x - r, y - r, r * 2, r * 2);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
}
function trSpark() {
  for (let i = 0; i < tr.sp.length; i++) if (!tr.sp[i].on) return tr.sp[i];
  return null;
}
function trBurst(i, sp, spread, dot) {
  const s = trSpark();
  if (!s) return;
  const o = i * 4,
    nx = tr.P[o + 2],
    ny = tr.P[o + 3],
    a = (Math.random() - 0.5) * spread,
    ca = Math.cos(a),
    sa = Math.sin(a);
  s.on = true;
  s.x = tr.P[o];
  s.y = tr.P[o + 1];
  s.vx = (nx * ca - ny * sa) * sp;
  s.vy = (nx * sa + ny * ca) * sp;
  s.life = 0;
  s.max = rand(0.7, 1.6);
  s.r = rand(0, 6.3);
  s.vr = rand(-3.5, 3.5);
  s.dot = dot;
  s.sz = rand(1.3, 2.8);
  s.col = TR_SPR[randi(TR_SPR.length)];
}
function trDraw(dt) {
  const g = tr.g,
    d = tr.dpr,
    N = TR_N,
    P = tr.P;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, tr.cv.width, tr.cv.height);
  g.setTransform(d, 0, 0, d, 0, 0);
  g.drawImage(tr.rim, tr.rimX, tr.rimY, TR_RIM, TR_RIM);
  const ign = calm ? 1 : clamp((tr.age - 0.4) / 1.0, 0, 1);
  const k = ign > 0 ? trGlaze(g, ign, !calm) : 0;
  tr.frames++;
  if (calm) return; // the frame whole and still: no ignition, sparks or crumbs
  const mult = lod > 1 ? 0.25 : lod ? 0.5 : 1;
  if (ign > 0 && ign < 1) {
    // the burning tips run from the torn ends towards each other
    for (let e = 0; e < 2; e++) {
      const o = (e ? N - 1 - k : k) * 4;
      trGlow(g, TR_GLOW.tip, P[o] + P[o + 2] * 2, P[o + 1] + P[o + 3] * 2, 16, 1);
    }
    for (tr.eTip += dt * 36 * mult; tr.eTip >= 1; tr.eTip--) {
      trBurst(k, rand(50, 140), 1.8, Math.random() < 0.4);
      trBurst(N - 1 - k, rand(50, 140), 1.8, Math.random() < 0.4);
    }
  }
  const mid = N >> 1;
  if (ign >= 1 && tr.flash === -1) {
    tr.flash = 0; // they meet: a flash and a burst of sprinkles
    for (let q = 0; q < 26 * mult; q++) trBurst(mid, rand(60, 180), 2.6, Math.random() < 0.45);
  }
  if (tr.flash >= 0) {
    tr.flash += dt;
    const f = tr.flash / 0.7;
    if (f >= 1) tr.flash = -2;
    else trGlow(g, TR_GLOW.flash, P[mid * 4], P[mid * 4 + 1], 14 + 60 * f, 1 - f);
  }
  if (ign >= 1) {
    if (!lod)
      for (tr.eTw += dt * 5; tr.eTw >= 1; tr.eTw--) {
        const w = tr.tw.find((x) => !x.on);
        if (w) {
          w.on = true;
          w.i = randi(N);
          w.life = 0;
          w.max = rand(0.9, 1.5);
        }
      }
    for (tr.eSpk += dt * 4 * mult; tr.eSpk >= 1; tr.eSpk--) trBurst(randi(N), rand(20, 50), 1, false);
  }
  if (tr.age > 0.4)
    for (tr.eCrumb += dt * 3 * mult; tr.eCrumb >= 1; tr.eCrumb--) {
      // crumbs fall from the bite
      const s = trSpark();
      if (!s) break;
      const a = rand(Math.PI * 0.55, Math.PI * 0.95);
      s.on = true;
      s.x = tr.bx + Math.cos(a) * 42;
      s.y = tr.by + Math.sin(a) * 42;
      s.vx = rand(-12, 12);
      s.vy = -6;
      s.life = 0;
      s.max = 1.8;
      s.r = s.vr = 0;
      s.dot = true;
      s.sz = rand(1, 2.2);
      s.col = Math.random() < 0.5 ? '#f3d2ac' : '#c98a55';
    }
  for (let i = 0; i < tr.tw.length; i++) {
    const w = tr.tw[i];
    if (!w.on) continue;
    w.life += dt;
    if (w.life > w.max) {
      w.on = false;
      continue;
    }
    const o = w.i * 4,
      f = Math.sin((Math.PI * w.life) / w.max);
    trGlow(g, TR_GLOW.tw, P[o] + P[o + 2] * 2, P[o + 1] + P[o + 3] * 2, 4 + 7 * f, 0.9 * f);
  }
  const damp = Math.exp(-dt * 1.4);
  g.lineCap = 'round';
  g.lineWidth = 3;
  for (let i = 0; i < tr.sp.length; i++) {
    const s = tr.sp[i];
    if (!s.on) continue;
    s.life += dt;
    if (s.life > s.max) {
      s.on = false;
      continue;
    }
    s.vy += 80 * dt;
    s.vx *= damp;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.r += s.vr * dt;
    const c = Math.cos(s.r) * d,
      sn = Math.sin(s.r) * d;
    g.setTransform(c, sn, -sn, c, s.x * d, s.y * d);
    g.globalAlpha = Math.max(0, 1 - s.life / s.max);
    g.beginPath();
    if (s.dot) {
      g.fillStyle = s.col;
      g.arc(0, 0, s.sz, 0, TAU);
      g.fill();
    } else {
      g.strokeStyle = s.col;
      g.moveTo(-2.6, 0);
      g.lineTo(2.6, 0);
      g.stroke();
    }
  }
  g.setTransform(d, 0, 0, d, 0, 0);
  g.globalAlpha = 1;
}
function trPop(s) {
  const v = s === 1 ? '' : `scale(${s.toFixed(4)})`;
  tr.card.style.transform = v;
  tr.cv.style.transform = v;
}
function trFrame(now) {
  tr.raf = 0;
  if (!tr.running) return;
  // every way off the win card calls trophyStop; this only guards against one that is missed
  if (overEl.classList.contains('hidden') || !tr.card.classList.contains('trophy')) return trophyStop();
  const dt = clamp((now - tr.last) / 1000, 0, 0.05);
  tr.last = now;
  tr.age += dt;
  tr.t += dt;
  if (tr.popping) {
    // pop-in: the card lands with a springy overshoot
    const a = tr.age;
    if (a >= TR_POP) tr.popping = false;
    trPop(a >= TR_POP ? 1 : 1 - 0.16 * Math.exp(-6 * a) * Math.cos(14 * a));
  }
  trDraw(dt);
  tr.raf = requestAnimationFrame(trFrame);
}
function trResize() {
  if (!tr.on || (tr.card.offsetWidth === tr.w && tr.card.offsetHeight === tr.h)) return;
  if (trLayout() && !tr.running) trDraw(0);
}
const trRO = typeof ResizeObserver === 'function' ? new ResizeObserver(trResize) : null;
if (!trRO) addEventListener('resize', trResize);

function trophyStart(card) {
  trophyStop();
  if (!tr.cv) {
    tr.cv = $('trophyFx');
    tr.g = tr.cv.getContext('2d');
  }
  const rec = card.classList.contains('rec') ? 1 : 0;
  tr.card = card;
  tr.on = true;
  tr.pal = TR_PAL[rec];
  tr.lut = TR_LUT[rec];
  tr.age = tr.t = tr.frames = 0;
  tr.flash = -1;
  tr.eTip = tr.eSpk = tr.eCrumb = tr.eTw = 0;
  for (let i = 0; i < tr.sp.length; i++) tr.sp[i].on = false;
  for (let i = 0; i < tr.tw.length; i++) tr.tw[i].on = false;
  tr.cv.style.display = 'block';
  tr.w = tr.h = 0;
  if (trRO) trRO.observe(card);
  if (!trLayout()) return;
  if (calm) return trDraw(0); // drawn once, whole and still
  tr.running = true;
  tr.popping = true;
  trPop(0.84);
  tr.last = performance.now();
  tr.raf = requestAnimationFrame(trFrame);
}
function trophyStop() {
  if (tr.raf) cancelAnimationFrame(tr.raf);
  tr.raf = 0;
  tr.running = false;
  if (!tr.on) return;
  tr.on = false;
  tr.popping = false;
  trPop(1);
  tr.cv.style.display = 'none';
  if (trRO) trRO.unobserve(tr.card);
}
