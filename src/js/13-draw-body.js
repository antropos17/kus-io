// ---------- drawing: bodies, pieces, labels, HUD on canvas, the frame ----------
function innerR(b, a) {
  // radius of the body at angle a, including bite notches and the open mouth
  let r = b.Rs * (1 - b.dentAt(a));
  const mo = Math.max(0, Math.min(1, b.mouth));
  return r;
}
function drawPickups(x0, y0, x1, y1) {
  // bonus sweets lying on the tray
  for (const p of pickups) {
    if (p.x < x0 - 50 || p.x > x1 + 50 || p.y < y0 - 50 || p.y > y1 + 50) continue;
    const col = PICK[p.type][2],
      r = 17 * Math.min(1, p.t * 4) * (p.t > 40 ? 0.7 + 0.3 * Math.abs(Math.sin(time * 9)) : 1),
      x = p.x,
      y = p.y + Math.sin(time * 3 + p.x) * 3;
    const g = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 2.4);
    g.addColorStop(0, 'rgba(255,255,255,0.32)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(10,4,2,0.35)';
    ctx.beginPath();
    ctx.ellipse(p.x + 2, p.y + r + 6, r * 0.8, r * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff6e8';
    ctx.strokeStyle = col;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.lineJoin = 'round';
    if (p.type === 'speed') {
      // lightning bolt
      ctx.fillStyle = '#f4a300';
      ctx.beginPath();
      ctx.moveTo(x + r * 0.15, y - r * 0.7);
      ctx.lineTo(x - r * 0.42, y + r * 0.1);
      ctx.lineTo(x - r * 0.02, y + r * 0.1);
      ctx.lineTo(x - r * 0.15, y + r * 0.7);
      ctx.lineTo(x + r * 0.42, y - r * 0.12);
      ctx.lineTo(x + r * 0.03, y - r * 0.12);
      ctx.closePath();
      ctx.fill();
    } else if (p.type === 'shield') {
      ctx.fillStyle = '#3fa9e0';
      ctx.beginPath();
      ctx.moveTo(x, y - r * 0.64);
      ctx.quadraticCurveTo(x + r * 0.3, y - r * 0.44, x + r * 0.55, y - r * 0.44);
      ctx.lineTo(x + r * 0.55, y);
      ctx.quadraticCurveTo(x + r * 0.5, y + r * 0.5, x, y + r * 0.7);
      ctx.quadraticCurveTo(x - r * 0.5, y + r * 0.5, x - r * 0.55, y);
      ctx.lineTo(x - r * 0.55, y - r * 0.44);
      ctx.quadraticCurveTo(x - r * 0.3, y - r * 0.44, x, y - r * 0.64);
      ctx.fill();
    } else {
      // horseshoe magnet
      ctx.lineCap = 'butt';
      ctx.strokeStyle = '#e23a5f';
      ctx.lineWidth = r * 0.3;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.36, y + r * 0.3);
      ctx.lineTo(x - r * 0.36, y - r * 0.05);
      ctx.arc(x, y - r * 0.05, r * 0.36, Math.PI, 0);
      ctx.lineTo(x + r * 0.36, y + r * 0.3);
      ctx.stroke();
      ctx.strokeStyle = '#9aa0aa';
      ctx.beginPath();
      ctx.moveTo(x - r * 0.36, y + r * 0.3);
      ctx.lineTo(x - r * 0.36, y + r * 0.55);
      ctx.moveTo(x + r * 0.36, y + r * 0.3);
      ctx.lineTo(x + r * 0.36, y + r * 0.55);
      ctx.stroke();
    }
  }
}
function drawSpikes(b) {
  // hedgehog: spines everywhere except around the face
  const pts = b.pts,
    N = pts.length,
    step = Math.max(1, Math.round(N / 24)),
    hs = Math.ceil(step / 2);
  ctx.fillStyle = '#4a2c1a';
  ctx.strokeStyle = '#2a170c';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1 / cam.z, b.Rs * 0.02);
  ctx.beginPath();
  for (let i = 0; i < N; i += step) {
    const q = pts[i];
    if (Math.abs(angDiff(q.a, b.fa)) < 1.0) continue;
    const a = pts[(i - hs + N) % N],
      c = pts[(i + hs) % N],
      k = 0.26 + 0.08 * hash1(i * 3.3);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(q.x + (q.x - b.x) * k, q.y + (q.y - b.y) * k);
    ctx.lineTo(c.x, c.y);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
}
function drawCake(b) {
  // a cake seen from above: piped cream round the rim and a cherry on its back, the one soft spot
  const R = b.Rs,
    z = cam.z,
    f = b.fa;
  ctx.strokeStyle = 'rgba(190,120,70,0.35)';
  ctx.lineWidth = R * 0.035;
  ctx.beginPath();
  ctx.arc(b.x, b.y, R * 0.7, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#fffaf2';
  ctx.strokeStyle = 'rgba(190,140,100,0.55)';
  ctx.lineWidth = Math.max(1 / z, R * 0.012);
  for (let i = 1; i < 16; i++) {
    if (i === 8) continue;
    const a = f + 0.8 + (i / 16) * (TAU - 1.6),
      q = b.contourAt(a),
      x = b.x + (q[0] - b.x) * 0.86,
      y = b.y + (q[1] - b.y) * 0.86;
    ctx.beginPath();
    ctx.arc(x, y, R * 0.07, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  const q = b.contourAt(f + Math.PI),
    cx = b.x + (q[0] - b.x) * 0.8,
    cy = b.y + (q[1] - b.y) * 0.8,
    pulse = Math.sin(time * 5);
  ctx.strokeStyle = `rgba(255,90,120,${(0.45 + 0.3 * pulse).toFixed(3)})`;
  ctx.lineWidth = Math.max(2 / z, R * 0.025);
  ctx.beginPath();
  ctx.arc(cx, cy, R * (0.18 + 0.02 * pulse), 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#e0234e';
  ctx.strokeStyle = '#7d0f2a';
  ctx.lineWidth = Math.max(1 / z, R * 0.015);
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.11, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(cx - R * 0.035, cy - R * 0.04, R * 0.03, 0, TAU);
  ctx.fill();
}
function drawBlob(b) {
  const R = b.Rs,
    pal = b.pal,
    path = b.path,
    z = cam.z;
  if (b.kind === 'hedgehog' && R * z > 5) drawSpikes(b);
  if (lod > 1 || R * z < 6) ctx.fillStyle = pal.base;
  else {
    const g = ctx.createRadialGradient(b.x - R * 0.36, b.y - R * 0.44, R * 0.06, b.x, b.y, R * 1.12);
    g.addColorStop(0, pal.light);
    g.addColorStop(0.52, pal.base);
    g.addColorStop(1, pal.dark);
    ctx.fillStyle = g;
  }
  ctx.fill(path);
  const detail = R * z > (lod ? 15 : 9);
  if (!lod && R * z > 30) {
    // translucent jelly core: a softer inner body lit from inside
    const pts = b.pts,
      N = pts.length,
      cx = b.x + R * 0.05,
      cy = b.y + R * 0.08,
      core = new Path2D();
    for (let i = 0; i <= N; i++) {
      const q = pts[i % N],
        x = cx + (q.x - b.x) * 0.72,
        y = cy + (q.y - b.y) * 0.72;
      i ? core.lineTo(x, y) : core.moveTo(x, y);
    }
    const cg = ctx.createRadialGradient(cx + R * 0.1, cy + R * 0.12, R * 0.05, cx, cy, R * 0.8);
    cg.addColorStop(0, pal.glow);
    cg.addColorStop(1, pal.glow0);
    ctx.fillStyle = cg;
    ctx.fill(core);
  }
  if (b.skin !== 'plain' && lod < 2 && R * z > (lod ? 14 : 7)) drawSkin(b);
  if (b.wounds.length && R * z > 4) drawWounds(b);
  {
    if (detail) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      const sr = Math.max(0.9, R * 0.022);
      for (const s of b.sugar) {
        if (s[1] * R + sr * s[2] > innerR(b, s[0]) * 0.9) continue;
        const x = b.x + Math.cos(s[0]) * s[1] * R,
          y = b.y + Math.sin(s[0]) * s[1] * R;
        ctx.moveTo(x + sr * s[2], y);
        ctx.arc(x, y, sr * s[2], 0, TAU);
      }
      ctx.fill();
      const gk = clamp((innerR(b, -2.23) / R - 0.62) / 0.3, 0, 1); // shrink the glare if that side is bitten
      if (gk > 0.05) {
        ctx.fillStyle = 'rgba(255,255,255,0.32)';
        ctx.beginPath();
        ctx.ellipse(b.x - R * 0.36, b.y - R * 0.46, R * 0.3 * gk, R * 0.15 * gk, -0.62, 0, TAU);
        ctx.fill();
      }
      if (innerR(b, -2.6) > R * 0.93 && innerR(b, -1.7) > R * 0.93) {
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineCap = 'round';
        ctx.lineWidth = R * 0.05;
        ctx.beginPath();
        ctx.arc(b.x, b.y, R * 0.8, -2.65, -1.75);
        ctx.stroke();
      } // rim glint
      if (innerR(b, 0.8) > R * 0.93) {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = R * 0.07;
        ctx.beginPath();
        ctx.arc(b.x, b.y, R * 0.8, 0.35, 1.25);
        ctx.stroke();
      } // bounce light
      if (innerR(b, -2.85) > R * 0.74) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(b.x - R * 0.6, b.y - R * 0.18, R * 0.05, 0, TAU);
        ctx.fill();
      }
    }
  }
  const mo = Math.min(1, b.mouth);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.4 / z, R * 0.05);
  ctx.strokeStyle = pal.rim;
  ctx.stroke(path);
  if (player && player.alive && b !== player && state === 'play') {
    if (lethalFor(player.mass, biteOf(b.mass, false))) {
      ctx.lineWidth = Math.max(3 / z, R * 0.07);
      ctx.strokeStyle = `rgba(255,59,92,${(0.55 + 0.35 * Math.sin(time * 9)).toFixed(3)})`;
      ctx.stroke(path);
    } else if (lethalFor(b.mass, biteOf(player.mass, false))) {
      ctx.lineWidth = Math.max(2.5 / z, R * 0.06);
      ctx.strokeStyle = 'rgba(120,240,140,0.85)';
      ctx.stroke(path);
    }
  }
  if (b.spawnT > 0) {
    ctx.lineWidth = Math.max(2.5 / z, R * 0.08);
    ctx.strokeStyle = `rgba(255,241,220,${(0.35 + 0.3 * Math.sin(time * 12)).toFixed(3)})`;
    ctx.stroke(path);
  }
  if (b.kind === 'cake' && R * z > 10) drawCake(b);
  drawFace(b);
  drawHat(b);
  if (b.pShield > 0) {
    // bubble shield, flickering before it runs out
    const k = b.pShield < 1.2 ? 0.5 + 0.5 * Math.sin(time * 26) : 1;
    ctx.lineWidth = Math.max(3 / z, R * 0.09);
    ctx.strokeStyle = `rgba(122,215,255,${(0.6 * k).toFixed(3)})`;
    ctx.stroke(path);
    ctx.lineWidth = Math.max(1.2 / z, R * 0.025);
    ctx.strokeStyle = `rgba(255,255,255,${(0.8 * k).toFixed(3)})`;
    ctx.stroke(path);
  }
  if (b.pMagnet > 0 && R * z > 8) {
    ctx.strokeStyle = 'rgba(255,122,162,0.75)';
    ctx.lineWidth = Math.max(2 / z, R * 0.05);
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = time * 3 + (i * TAU) / 3;
      ctx.beginPath();
      ctx.arc(b.x, b.y, R * 1.28, a, a + 0.7);
      ctx.stroke();
    }
  }
}
function drawChunk(c) {
  const r = c.r;
  if (r < 0.6) return;
  const pal = c.pal,
    P = [];
  for (let i = 0; i < 9; i++) {
    const a = c.rot + (i / 9) * TAU,
      q = r * (0.8 + 0.32 * hash1(c.seed + i));
    P.push([c.x + Math.cos(a) * q, c.y + Math.sin(a) * q]);
  }
  ctx.save();
  lipClip(c.owner, c.state !== 'held');
  ctx.beginPath();
  smoothPoly(ctx, P);
  const g = ctx.createRadialGradient(c.x - r * 0.3, c.y - r * 0.35, r * 0.1, c.x, c.y, r * 1.1);
  g.addColorStop(0, pal.light);
  g.addColorStop(1, pal.base);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = flesh(pal, 0.95);
  ctx.beginPath();
  ctx.arc(c.x + Math.cos(c.tornA) * r * 0.55, c.y + Math.sin(c.tornA) * r * 0.55, r * 0.72, 0, TAU);
  ctx.fill();
  ctx.fillStyle = pore(pal, 0.5);
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = c.tornA + (hash1(c.seed + 10 + i) - 0.5) * 1.6,
      d = r * (0.35 + 0.4 * hash1(c.seed + 20 + i)),
      x = c.x + Math.cos(a) * d,
      y = c.y + Math.sin(a) * d,
      pr = Math.max(0.8, r * 0.09);
    ctx.moveTo(x + pr, y);
    ctx.arc(x, y, pr, 0, TAU);
  }
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  smoothPoly(ctx, P);
  ctx.lineWidth = Math.max(1 / cam.z, r * 0.09);
  ctx.strokeStyle = pal.rim;
  ctx.stroke();
  ctx.restore();
}
function drawGulp(g) {
  const A = g.A,
    e = clamp(g.t / g.T, 0, 1),
    mg = A._gf === frameNo && A._g ? A._g : mouthGeo(A),
    md = mg.xc + mg.H * 0.5,
    mx = A.x + Math.cos(mg.f) * md,
    my = A.y + Math.sin(mg.f) * md;
  const e1 = 1 - Math.pow(1 - Math.min(1, e / 0.65), 2),
    e2 = clamp((e - 0.55) / 0.45, 0, 1);
  const cx = lerp(lerp(g.x0, mx, e1), A.x, e2 * e2),
    cy = lerp(lerp(g.y0, my, e1), A.y, e2 * e2);
  g.cx = cx;
  g.cy = cy;
  let ux = mx - g.x0,
    uy = my - g.y0;
  const ul = Math.hypot(ux, uy) || 1;
  ux /= ul;
  uy /= ul;
  const sc = Math.pow(1 - e, 0.85);
  if (sc < 0.02) return;
  const st = Math.sin(Math.PI * Math.min(1, e * 1.25)),
    along = (1 + 0.8 * st) * sc,
    perp = (1 - 0.35 * st) * sc;
  const P = g.rel.map(([x, y]) => {
    const a = (x * ux + y * uy) * along,
      b = (-x * uy + y * ux) * perp;
    return [cx + a * ux - b * uy, cy + a * uy + b * ux];
  });
  ctx.save();
  lipClip(A, false);
  ctx.beginPath();
  smoothPoly(ctx, P);
  ctx.fillStyle = g.pal.base;
  ctx.fill();
  ctx.lineWidth = Math.max(1 / cam.z, g.R * 0.05 * sc);
  ctx.strokeStyle = g.pal.rim;
  ctx.stroke();
  ctx.restore();
}
const labels = new Map();
function labelFor(name, me, col) {
  const key = (me ? '1' : '0') + (col || '') + name;
  let L = labels.get(key);
  if (!L) {
    if (labels.size > 160) labels.clear();
    const c = document.createElement('canvas'),
      g = c.getContext('2d'),
      font = `800 34px ${FONT}`;
    g.font = font;
    const w = Math.ceil(g.measureText(name).width) + 18;
    c.width = w;
    c.height = 50;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 7;
    g.strokeStyle = 'rgba(26,12,6,0.8)';
    g.strokeText(name, w / 2, 26);
    g.fillStyle = col || (me ? '#ffd23f' : 'rgba(255,241,220,0.95)');
    g.fillText(name, w / 2, 26);
    L = { c, w };
    labels.set(key, L);
  }
  return L;
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => labels.clear()); // redraw once the real typeface has arrived
function drawName(b) {
  const z = cam.z,
    sr = b.Rs * z;
  if (sr < (lod ? 16 : 10) && !b.isPlayer) return;
  const fs = clamp(sr * 0.3, 11, 17) / z;
  let y = b.y - b.Rs * (b.hat !== 'none' && sr >= 8 ? 1.55 : 1.04) - 6 / z,
    L = labelFor(b.isPlayer ? b.name : nameOf(b.name), b.isPlayer || !!b.boss),
    k = fs / 34;
  const sk = streakStep(b);
  if (sk) {
    // a streak: the name gives way to a big ×N in the step's colour that pops on every bite
    L = labelFor('×' + b.combo, true, STREAK_COL[sk]);
    k = ((fs * 1.7) / 34) * (1 + streak.pop * 0.45);
    y -= fs * 0.45;
    streak.lt = y - 37 * k;
    streak.lw = (L.w * k) / 2;
  }
  if (b === leader) {
    // gold star for the sweetest one
    const sx = b.x - (L.w * k) / 2 - fs * 0.45,
      sy = y - fs * 0.34;
    ctx.fillStyle = '#ffd23f';
    ctx.strokeStyle = 'rgba(26,12,6,0.8)';
    ctx.lineWidth = fs * 0.12;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5,
        r = fs * (i % 2 ? 0.22 : 0.5);
      i ? ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r) : ctx.moveTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  }
  ctx.drawImage(L.c, b.x - (L.w * k) / 2, y - 37 * k, L.w * k, 50 * k);
}
function drawTexts(ox, oy, z) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const t of texts) {
    const e = t.t / t.T,
      sx = t.x * z + ox,
      sy = t.y * z + oy - 46 * e,
      pop = 1 + 0.35 * Math.max(0, 1 - t.t * 7);
    ctx.globalAlpha = e < 0.7 ? 1 : 1 - (e - 0.7) / 0.3;
    ctx.font = `900 ${Math.round(t.size * pop)}px ${FONT}`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(30,14,8,.85)';
    ctx.strokeText(t.s, sx, sy);
    ctx.fillStyle = t.color;
    ctx.fillText(t.s, sx, sy);
  }
  ctx.globalAlpha = 1;
}
function drawMinimap(x0, y0, x1, y1) {
  if ((state === 'menu' && W < 760) || debugCam) return; // a staged shot (og.png) has no HUD
  const small = Math.min(W, H) < 600,
    S = small ? (touchMode ? 84 : 92) : 132,
    pad = 14,
    k = S / WORLD;
  let mx = W - S - pad - safe.r,
    my = touchMode ? boardBottom + 8 : H - S - pad - safe.b; // on phones the corner belongs to the buttons
  if (touchMode && my + S > btnTop - 10) {
    mx = boardLeft - S - 8;
    my = 12 + safe.t;
    if (mx < W * 0.45) return;
  } // no room under the rating: sit beside it
  ctx.fillStyle = touchMode ? 'rgba(26,14,10,0.5)' : 'rgba(26,14,10,0.8)';
  rr(ctx, mx, my, S, S, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,241,220,0.28)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.save();
  rr(ctx, mx, my, S, S, 12);
  ctx.clip();
  for (const b of blobs) {
    if (!b.alive) continue;
    ctx.fillStyle = b.pal.base;
    ctx.beginPath();
    ctx.arc(mx + b.x * k, my + b.y * k, Math.max(1.8, b.Rs * k), 0, TAU);
    ctx.fill();
  }
  for (const q of pickups) {
    ctx.fillStyle = PICK[q.type][2];
    ctx.fillRect(mx + q.x * k - 1.5, my + q.y * k - 1.5, 3, 3);
  }
  drawWrapBlip(mx, my, k);
  if (player && player.alive) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx + player.x * k, my + player.y * k, Math.max(3.5, player.Rs * k + 2), 0, TAU);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,241,220,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx + x0 * k, my + y0 * k, (x1 - x0) * k, (y1 - y0) * k);
  ctx.restore();
}
function drawStick() {
  if (!touchMode || state !== 'play') return;
  const ghost = !stick.on;
  if (ghost && stick.used) return;
  const bx = ghost ? (SET.lefty ? W - STICK_R - 38 - safe.r : STICK_R + 38 + safe.l) : stick.bx,
    by = ghost ? H - 150 - safe.b : stick.by,
    kx = ghost ? bx : stick.x,
    ky = ghost ? by : stick.y;
  ctx.fillStyle = 'rgba(255,241,220,0.10)';
  ctx.strokeStyle = `rgba(255,241,220,${ghost ? 0.3 + 0.15 * Math.sin(time * 4) : 0.4})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(bx, by, STICK_R, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = `rgba(255,241,220,${ghost ? 0.35 : 0.6})`;
  ctx.beginPath();
  ctx.arc(kx, ky, 25, 0, TAU);
  ctx.fill();
  if (ghost) {
    ctx.font = `800 14px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,241,220,0.85)';
    ctx.fillText(t('stick.hint'), bx, by + STICK_R + 10);
  }
}
function render() {
  ensurePattern();
  const z = cam.z,
    [fo, go] = focusOffset();
  const ox = W / 2 + fo - cam.x * z + cam.kx,
    oy = H / 2 + go - cam.y * z + cam.ky;
  const x0 = -ox / z,
    y0 = -oy / z,
    x1 = (W - ox) / z,
    y1 = (H - oy) / z;
  if (x0 < 2 || y0 < 2 || x1 > WORLD - 2 || y1 > WORLD - 2) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#0f0806';
    ctx.fillRect(0, 0, W, H);
  } // the tray covers the whole screen away from the edges: no need to paint under it
  ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * ox, DPR * oy);
  const gx0 = Math.max(0, x0),
    gy0 = Math.max(0, y0),
    gx1 = Math.min(WORLD, x1),
    gy1 = Math.min(WORLD, y1);
  if (gx1 > gx0 && gy1 > gy0) drawTray(gx0, gy0, gx1, gy1, z, ox, oy);
  if (x0 < 40 || y0 < 40 || x1 > WORLD - 40 || y1 > WORLD - 40) {
    // piped icing around the tray
    ctx.save();
    ctx.lineCap = 'round';
    ctx.setLineDash([0.01, 30]);
    ctx.lineWidth = 20;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.strokeRect(-9, -7, WORLD + 24, WORLD + 24);
    ctx.strokeStyle = '#ffe9cf';
    ctx.strokeRect(-12, -12, WORLD + 24, WORLD + 24);
    ctx.restore();
  }
  drawFood(x0, y0, x1, y1);
  drawPickups(x0, y0, x1, y1);
  frameNo++;
  const vis = [];
  for (const b of blobs) {
    if (!b.alive) continue;
    const m = b.Rs * 1.6;
    if (b.x + m < x0 || b.x - m > x1 || b.y + m < y0 || b.y - m > y1) continue;
    buildPath(b);
    b._pf = frameNo;
    b._food = false;
    b._top = b.bite || b.biteTgt || b.gulpT > 0 || (b.chunk && !b.chunk.dead) ? 1 : 0;
    vis.push(b);
  }
  vis.sort((a, b) => a._top - b._top || a.mass - b.mass); // whoever is biting is drawn over its prey
  for (const c of chunks) if (!c.dead) c.owner._food = true;
  for (const g of gulps) g.A._food = true;
  for (const s of strands) s.chunk.owner._food = true;
  for (const b of vis)
    if ((b.dashT > 0 || b.dodgeT > 0 || b.pSpeed > 0) && time - (b.ghostT || 0) > 0.035) {
      ghosts.push({ path: b.path, c: b.pal.light, t: time });
      b.ghostT = time;
    }
  for (let i = ghosts.length - 1; i >= 0; i--) {
    const g = ghosts[i],
      e = (time - g.t) / 0.22;
    if (e >= 1 || e < 0) {
      ghosts.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = 0.28 * (1 - e);
    ctx.fillStyle = g.c;
    ctx.fill(g.path);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(10,4,2,0.38)';
  if (lod < 2)
    for (const b of vis) {
      if (b.Rs * z < (lod ? 12 : 5)) continue;
      ctx.save();
      ctx.translate(b.Rs * 0.06 + 2, b.Rs * 0.13 + 3);
      ctx.fill(b.path);
      ctx.restore();
    }
  drawWrap(z, ox, oy); // the runaway wrapper runs under the bodies
  drawStreakFuse(z);
  for (const b of vis) drawBlob(b);
  for (const s of strands) {
    ctx.save();
    lipClip(s.chunk.owner, false);
    drawStrand(s);
    ctx.restore();
  }
  for (const g of gulps) drawGulp(g);
  for (const c of chunks) drawChunk(c);
  for (const b of vis) if (b._food && b._g && b._gf === frameNo) drawMouthFront(b, b._g);
  for (const b of vis) if (b.tongue) drawTongue(b);
  for (const b of blobs) if (b.tongue && !vis.includes(b)) drawTongue(b);
  for (const p of parts) {
    const e = p.t / p.T;
    ctx.globalAlpha = 1 - e;
    if (p.burst) {
      ctx.strokeStyle = p.c;
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1.5 / z, p.r * 0.12 * (1 - e));
      ctx.beginPath();
      for (let i = -3; i <= 3; i++) {
        const a = p.a + i * 0.42,
          r0 = p.r * (0.9 + 1.3 * e),
          r1 = p.r * (1.25 + 1.9 * e);
        ctx.moveTo(p.x + Math.cos(a) * r0, p.y + Math.sin(a) * r0);
        ctx.lineTo(p.x + Math.cos(a) * r1, p.y + Math.sin(a) * r1);
      }
      ctx.stroke();
      continue;
    }
    if (p.ring) {
      ctx.strokeStyle = p.c;
      ctx.lineWidth = Math.max(1.5 / z, p.r * 0.25 * (1 - e));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.6 + 1.6 * e), 0, TAU);
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = p.c;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (1 - e * 0.5), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const b of vis) drawName(b);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawTexts(ox, oy, z);
  drawStamps(ox, oy, z);
  drawStreakFx();
  drawWrapTag(z, ox, oy);
  drawReveal(z, ox, oy);
  drawSugarCubes();
  if (player && player.alive && state === 'play') {
    for (const b of blobs) {
      if (b === player || !b.alive || !lethalFor(player.mass, biteOf(b.mass, false))) continue;
      const sx = b.x * z + ox,
        sy = b.y * z + oy,
        rr2 = b.Rs * z;
      if (sx > -rr2 && sx < W + rr2 && sy > -rr2 && sy < H + rr2) continue;
      if (Math.hypot(b.x - player.x, b.y - player.y) - b.Rs > 1100) continue;
      const a = Math.atan2(sy - H / 2, sx - W / 2),
        m = 34,
        kx = (W / 2 - m) / Math.abs(Math.cos(a) || 1e-6),
        ky = (H / 2 - m) / Math.abs(Math.sin(a) || 1e-6),
        d = Math.min(kx, ky);
      const ex = W / 2 + Math.cos(a) * d,
        ey = H / 2 + Math.sin(a) * d;
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(a);
      ctx.globalAlpha = 0.6 + 0.35 * Math.sin(time * 9);
      ctx.fillStyle = '#ff3b5c';
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-9, -11);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-9, 11);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  if (flashT > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    g.addColorStop(0, 'rgba(255,60,100,0)');
    g.addColorStop(1, `rgba(255,60,100,${Math.min(0.7, flashT * 1.6).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  drawMinimap(x0, y0, x1, y1);
  drawStick();
}
