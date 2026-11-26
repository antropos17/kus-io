// ---------- drawing: tray, food, strands, wounds ----------
function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function smoothPoly(c, P) {
  const n = P.length,
    a = P[n - 1],
    b = P[0];
  c.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  for (let i = 0; i < n; i++) {
    const p = P[i],
      q = P[(i + 1) % n];
    c.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  c.closePath();
}
let tilePat = null;
const ghosts = [];
// per tray: background, three slope stops, two top stops, highlight stroke. The berry, mint and gold stay as dark as the chocolate so food, bots and wounds keep their contrast.
const TRAYS = {
  choco: ['#1d110c', '#4b2f22', '#362117', '#22140e', '#3b251a', '#301d14', 'rgba(255,220,190,0.07)'],
  berry: ['#210c15', '#512238', '#3b1a2a', '#26101a', '#3d1829', '#311321', 'rgba(255,190,215,0.07)'],
  mint: ['#0b1b17', '#1f4a3f', '#173a31', '#0e231d', '#1a3a31', '#143028', 'rgba(190,255,230,0.07)'],
  gold: ['#1d1608', '#554115', '#403010', '#271c09', '#42330f', '#362a0c', 'rgba(255,230,150,0.08)'],
};
function setTray(id) {
  chosenTray = TRAYS[id] ? id : 'choco';
  tilePat = null;
  bgT = 0;
  try {
    localStorage.setItem('kus.tray', chosenTray);
  } catch (e) {}
}
function ensurePattern() {
  // one segment of a chocolate bar (or another tray), repeated; rebuilt only when the tray changes
  if (tilePat) return;
  const C = TRAYS[chosenTray] || TRAYS.choco,
    S = 256,
    c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = C[0];
  g.fillRect(0, 0, S, S);
  const slope = g.createLinearGradient(0, 0, S, S);
  slope.addColorStop(0, C[1]);
  slope.addColorStop(0.5, C[2]);
  slope.addColorStop(1, C[3]);
  g.fillStyle = slope;
  rr(g, 9, 9, S - 18, S - 18, 22);
  g.fill();
  const top = g.createLinearGradient(0, 30, 0, S - 30);
  top.addColorStop(0, C[4]);
  top.addColorStop(1, C[5]);
  g.fillStyle = top;
  rr(g, 36, 36, S - 72, S - 72, 14);
  g.fill();
  g.strokeStyle = C[6];
  g.lineWidth = 3;
  rr(g, 37.5, 37.5, S - 75, S - 75, 13);
  g.stroke();
  tileSrc = c;
  tilePat = true;
}
let tileSrc = null,
  bgTile = null,
  bgPat = null,
  bgT = 0;
function drawTray(gx0, gy0, gx1, gy1, z, ox, oy) {
  // the chocolate tray under everything
  const s = z * DPR,
    T = Math.max(6, Math.round(192 * s)); // one chocolate segment, in whole device pixels
  if (T !== bgT) {
    // zoom changed enough: rescale the segment once, then every frame is a plain copy
    if (!bgTile) bgTile = document.createElement('canvas');
    bgTile.width = bgTile.height = T;
    bgTile.getContext('2d').drawImage(tileSrc, 0, 0, T, T);
    bgPat = ctx.createPattern(bgTile, 'repeat');
    bgT = T;
  }
  const X0 = Math.round((gx0 * z + ox) * DPR),
    Y0 = Math.round((gy0 * z + oy) * DPR),
    X1 = Math.round((gx1 * z + ox) * DPR),
    Y1 = Math.round((gy1 * z + oy) * DPR);
  const wx = (W / 2 - ox) / z,
    wy = (H / 2 - oy) / z; // keep the grid exact around the middle of the screen
  const ex = Math.round(Math.floor(wx / 192) * 192 * s + ox * DPR),
    ey = Math.round(Math.floor(wy / 192) * 192 * s + oy * DPR);
  ctx.setTransform(1, 0, 0, 1, ex, ey);
  ctx.fillStyle = bgPat;
  ctx.fillRect(X0 - ex, Y0 - ey, X1 - X0, Y1 - Y0);
  ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * ox, DPR * oy);
}
function buildPath(b) {
  const pts = b.pts,
    N = pts.length,
    path = new Path2D(),
    rz = b.Rs * cam.z;
  const st = rz < 40 ? Math.max(1, Math.round(N / Math.max(14, rz))) : 1; // small on screen: every 2nd or 3rd point draws the same curve
  if (st > 1) {
    const M = Math.floor(N / st),
      a = pts[(M - 1) * st],
      c0 = pts[0];
    path.moveTo((a.x + c0.x) * 0.5, (a.y + c0.y) * 0.5);
    for (let i = 0; i < M; i++) {
      const p = pts[i * st],
        q = pts[i + 1 < M ? (i + 1) * st : 0];
      path.quadraticCurveTo(p.x, p.y, (p.x + q.x) * 0.5, (p.y + q.y) * 0.5);
    }
  } else {
    const a = pts[N - 1],
      c0 = pts[0];
    path.moveTo((a.x + c0.x) * 0.5, (a.y + c0.y) * 0.5);
    for (let i = 0; i < N; i++) {
      const p = pts[i],
        q = pts[i + 1 < N ? i + 1 : 0];
      path.quadraticCurveTo(p.x, p.y, (p.x + q.x) * 0.5, (p.y + q.y) * 0.5);
    }
  }
  path.closePath();
  b.path = path;
}
let foodAtlas = null;
function buildFoodAtlas() {
  // every colour at 8 angles, shadow included: drawing a sprinkle becomes one cheap blit
  const C = 32,
    c = document.createElement('canvas');
  c.width = C * 8;
  c.height = C * SPRINKLES.length;
  const g = c.getContext('2d');
  g.lineCap = 'round';
  g.lineWidth = 9.2;
  for (let ci = 0; ci < SPRINKLES.length; ci++)
    for (let ai = 0; ai < 8; ai++) {
      const a = (ai * Math.PI) / 8,
        hx = Math.cos(a) * 8.6,
        hy = Math.sin(a) * 8.6,
        cx = ai * C + 16,
        cy = ci * C + 15;
      g.strokeStyle = 'rgba(8,3,1,0.45)';
      g.beginPath();
      g.moveTo(cx - hx + 2.4, cy - hy + 3.4);
      g.lineTo(cx + hx + 2.4, cy + hy + 3.4);
      g.stroke();
      g.strokeStyle = SPRINKLES[ci];
      g.beginPath();
      g.moveTo(cx - hx, cy - hy);
      g.lineTo(cx + hx, cy + hy);
      g.stroke();
    }
  foodAtlas = c;
}
function drawFood(x0, y0, x1, y1) {
  if (!foodAtlas) buildFoodAtlas();
  const m = 12;
  for (const f of food) {
    if (f.x < x0 - m || f.x > x1 + m || f.y < y0 - m || f.y > y1 + m) continue;
    if (!f.kind) {
      ctx.drawImage(foodAtlas, f.ai * 32, f.c * 32, 32, 32, f.x - f.sz, f.y - f.sz, f.sz * 2, f.sz * 2);
      continue;
    }
    ctx.globalAlpha = f.age > 40 ? clamp((48 - f.age) / 8, 0, 1) : 1;
    ctx.fillStyle = f.pal.base;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = flesh(f.pal, 0.9);
    ctx.beginPath();
    ctx.arc(f.x - f.r * 0.25, f.y - f.r * 0.25, f.r * 0.5, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
function drawStrand(s) {
  const pal = s.src.pal,
    P = s.p,
    N = s.N,
    fade = s.broken ? clamp(1 - s.bt / 0.3, 0, 1) : 1;
  if (fade <= 0) return;
  const pieces = s.broken
    ? [
        [0, s.cut, 1],
        [s.cut + 1, N - 1, 2],
      ]
    : [[0, N - 1, 0]];
  for (const [i0, i1, kind] of pieces) {
    const n = i1 - i0 + 1;
    if (n < 2) continue;
    const Lp = [],
      Rp = [];
    for (let k = 0; k < n; k++) {
      const i = i0 + k,
        p = P[i],
        pa = P[Math.max(i0, i - 1)],
        pb = P[Math.min(i1, i + 1)];
      let tx = pb.x - pa.x,
        ty = pb.y - pa.y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const t = k / (n - 1);
      let w = kind === 0 ? s.w * (0.5 + 1.35 * Math.pow(Math.abs(2 * t - 1), 2.2)) : kind === 1 ? s.w * (1.7 - 1.3 * t) : s.w * (0.4 + 1.3 * t);
      w = Math.min(w * fade, s.wMax) * 0.5;
      Lp.push([p.x - ty * w, p.y + tx * w]);
      Rp.push([p.x + ty * w, p.y - tx * w]);
    }
    ctx.beginPath();
    smoothPoly(ctx, Lp.concat(Rp.reverse()));
    ctx.fillStyle = pal.base;
    ctx.fill();
    ctx.lineWidth = Math.max(1 / cam.z, s.w * 0.1);
    ctx.strokeStyle = pal.rim;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(P[i0].x, P[i0].y);
    for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(P[i].x, P[i].y);
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(0.8 / cam.z, s.w * 0.22 * fade);
    ctx.strokeStyle = flesh(pal, 0.75);
    ctx.stroke();
    if (kind) {
      // droplet on the torn end
      const e = kind === 1 ? P[i1] : P[i0],
        r = Math.max(1, s.w * 0.55 * fade);
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, TAU);
      ctx.fillStyle = pal.base;
      ctx.fill();
      ctx.lineWidth = Math.max(0.8 / cam.z, r * 0.2);
      ctx.strokeStyle = pal.rim;
      ctx.stroke();
    }
  }
}
function drawWounds(b) {
  // exposed souffle is a band built from the contour itself, so nothing needs clipping
  const R = b.Rs,
    pal = b.pal;
  for (const w of b.wounds) {
    const k = w.d * w.heal;
    if (k < 0.012) continue;
    const al = clamp(k * 5, 0, 1),
      span = w.w * 1.05,
      n = clamp(Math.round(span * 14), 6, 20),
      deep = R * (0.07 + k * 0.6),
      In = [];
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const u = -1 + (2 * i) / n,
        a = w.a + u * span,
        q = b.contourAt(a),
        t = deep * Math.pow(1 - u * u, 0.7),
        ca = Math.cos(a),
        sa = Math.sin(a);
      const ox = q[0] - ca * R * 0.012,
        oy = q[1] - sa * R * 0.012;
      i ? ctx.lineTo(ox, oy) : ctx.moveTo(ox, oy);
      In.push(q[0] - ca * t, q[1] - sa * t);
    }
    for (let i = n; i >= 0; i--) ctx.lineTo(In[i * 2], In[i * 2 + 1]);
    ctx.closePath();
    ctx.fillStyle = flesh(pal, 0.92 * al);
    ctx.fill();
    ctx.fillStyle = pore(pal, 0.55 * al);
    ctx.beginPath();
    for (const p of w.pores) {
      // souffle bubbles in the exposed flesh
      const a = w.a + p.u * w.w * 0.85,
        q = b.contourAt(a),
        dd = p.v * deep * (1 - p.u * p.u) * 0.75;
      const x = q[0] - Math.cos(a) * dd,
        y = q[1] - Math.sin(a) * dd,
        pr = p.s * Math.max(1, R * 0.028) * (0.5 + 0.5 * al);
      ctx.moveTo(x + pr, y);
      ctx.arc(x, y, pr, 0, TAU);
    }
    ctx.fill();
  }
}
