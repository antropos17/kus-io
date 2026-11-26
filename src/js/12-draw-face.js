// ---------- drawing: mouth, face, tongue, hat ----------
function mouthGeo(b) {
  // the mouth in the face's own frame: x runs forward to the chin, y across the face. It sits on the front rim:
  // the jaw reaches the outline and the top lip falls back from it as the mouth opens, so food goes straight in
  const R = b.Rs,
    f = b.fa + b.fw,
    open = clamp(b.mouth, 0, 1.2),
    [px, py] = b.contourAt(f);
  const rim = clamp(Math.hypot(px - b.x, py - b.y) / R, 0.72, 1.6) * R, // how far the muzzle really reaches right now
    H = R * 0.44 * Math.sqrt(open / 1.2), // a little opening already shows: the lips sit on the outline and need the room
    xc = rim - R * 0.03 - Math.max(H, R * 0.17); // shut, the lips keep a strip of skin between them and the outline
  const W = R * (0.33 + 0.09 * Math.min(1, open)) * (1 + clamp(-b.mouthV * 0.004, -0.05, 0.13)),
    uc = R * lerp(0.07, -0.06, clamp((open - 0.55) / 0.6, 0, 1)) * Math.min(1, open * 4);
  return { f, R, open, xc, H, W, uc, sw: b.puff * W * 0.15 * Math.min(1, open * 3), path: null }; // sw: the jaw slides sideways as it chews
}
const SHUT = new Path2D();
function mouthPath(g) {
  // top lip is a shallow curve, the jaw drops in a deep U
  const m = new Path2D();
  m.moveTo(g.xc, -g.W);
  m.quadraticCurveTo(g.xc + g.uc, 0, g.xc, g.W);
  m.bezierCurveTo(g.xc + g.H * 1.3333, g.W * 0.92 + g.sw, g.xc + g.H * 1.3333, -g.W * 0.92 + g.sw, g.xc, -g.W);
  m.closePath();
  return m;
}
const jawPt = (g, s) => {
  const a = 1 - s;
  return [g.xc + 4 * g.H * s * a, g.W * (a * a * a + 2.76 * a * a * s - 2.76 * a * s * s - s * s * s) + 3 * g.sw * s * a];
};
function toothPath(x, y, dir, len, wid, sharp) {
  // adds one tooth to the current path; a whole row is filled in one go
  ctx.moveTo(x, y - wid / 2);
  if (sharp) {
    ctx.quadraticCurveTo(x + dir * len * 0.75, y - wid * 0.42, x + dir * len, y);
    ctx.quadraticCurveTo(x + dir * len * 0.75, y + wid * 0.42, x, y + wid / 2);
  } else {
    const r = Math.min(wid * 0.42, len * 0.5);
    ctx.lineTo(x + dir * (len - r), y - wid / 2);
    ctx.quadraticCurveTo(x + dir * len, y - wid / 2, x + dir * len, y - wid / 2 + r);
    ctx.lineTo(x + dir * len, y + wid / 2 - r);
    ctx.quadraticCurveTo(x + dir * len, y + wid / 2, x + dir * (len - r), y + wid / 2);
    ctx.lineTo(x, y + wid / 2);
  }
  ctx.closePath();
}
const jawX = (g, v) => {
  const u = v - (g.sw / g.W) * 0.75 * (1 - v * v);
  return g.xc + g.H * Math.pow(Math.max(0, 1 - u * u), 0.46);
}; // how far the jaw has dropped at height v (-1..1)
const lipX = (g, v) => {
  const q = (v + 1) / 2;
  return g.xc + 2 * q * (1 - q) * g.uc;
};
function drawMouthBack(b, g) {
  // lips, the inside of the mouth, tongue and bottom teeth
  const R = g.R,
    z = cam.z,
    pal = b.pal,
    xc = g.xc,
    H = g.H,
    W = g.W,
    lw = Math.max(1.2 / z, R * 0.05),
    detail = R * z > 13;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(g.f);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (H < R * 0.03) {
    // shut
    const hurt = b.hurtT > 0,
      grin = b.happyT > 0 && !hurt,
      sm = R * (grin ? 0.2 : 0.14),
      sway = b.puff * W * 0.4,
      w = W * 0.92;
    if (Math.abs(b.puff) > 0.15) {
      ctx.fillStyle = pal.glow;
      ctx.beginPath();
      ctx.arc(xc - R * 0.02, (b.puff > 0 ? 1 : -1) * W * 1.3, R * 0.1 * Math.abs(b.puff), 0, TAU);
      ctx.fill();
    }
    if (grin) {
      // toothy grin, set back from the rim by its own bulge
      const gx = xc - sm * 0.6,
        gp = new Path2D();
      gp.moveTo(gx, -w);
      gp.quadraticCurveTo(gx + sm * 0.5, 0, gx, w);
      gp.quadraticCurveTo(gx + sm * 2.2, 0, gx, -w);
      gp.closePath();
      ctx.fillStyle = '#fffaf2';
      ctx.fill(gp);
      if (detail) {
        ctx.strokeStyle = 'rgba(120,55,55,0.45)';
        ctx.lineWidth = Math.max(0.5 / z, R * 0.012);
        ctx.beginPath();
        for (const k of [-0.5, 0, 0.5]) {
          ctx.moveTo(gx + sm * 0.3, k * w);
          ctx.lineTo(gx + sm * 0.95, k * w);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = pal.lip;
      ctx.lineWidth = lw;
      ctx.stroke(gp);
    } else {
      ctx.strokeStyle = pal.lip;
      ctx.lineWidth = lw * 1.15;
      ctx.beginPath();
      if (hurt) {
        for (let i = 0; i <= 8; i++) {
          const v = -w + (w * 2 * i) / 8,
            u = xc + R * 0.03 + (i % 2 ? 0.035 : -0.035) * R;
          i ? ctx.lineTo(u, v) : ctx.moveTo(u, v);
        }
      } else {
        ctx.moveTo(xc, -w);
        ctx.quadraticCurveTo(xc + sm, sway, xc, w);
      }
      ctx.stroke();
      if (!hurt && detail) {
        ctx.strokeStyle = pal.glow;
        ctx.lineWidth = Math.max(0.6 / z, lw * 0.5);
        ctx.beginPath();
        ctx.moveTo(xc + sm * 0.5 + R * 0.055, -W * 0.26);
        ctx.quadraticCurveTo(xc + sm * 0.62 + R * 0.06, sway * 0.5, xc + sm * 0.5 + R * 0.055, W * 0.26);
        ctx.stroke();
      } // lower-lip shine
    }
    if (detail) {
      ctx.strokeStyle = pal.lip;
      ctx.lineWidth = lw * 0.7;
      ctx.beginPath();
      for (const k of [-1, 1]) {
        ctx.moveTo(xc - R * 0.045, k * (w - R * 0.01));
        ctx.lineTo(xc + R * 0.03, k * (w + R * 0.045));
      }
      ctx.stroke();
    } // creases at the corners
    if (b.lickT > 0 && !hurt) {
      // a satisfied lick across the lips
      const t = clamp(1 - b.lickT / 0.7, 0, 1),
        x = xc + 2 * t * (1 - t) * sm - R * 0.02,
        y = lerp(-0.8, 0.8, t) * w;
      ctx.fillStyle = '#ff6f93';
      ctx.strokeStyle = '#b02a55';
      ctx.lineWidth = Math.max(0.6 / z, R * 0.015);
      ctx.beginPath();
      ctx.ellipse(x, y, R * 0.075, R * 0.06, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  const m = g.path;
  ctx.strokeStyle = pal.lip;
  ctx.lineWidth = lw * 2.3;
  ctx.stroke(m); // fat lips
  ctx.fillStyle = '#4a0c1f';
  ctx.fill(m);
  const top = xc + Math.max(0, g.uc) * 0.5;
  if (H > R * 0.1) {
    ctx.fillStyle = '#17030a';
    ctx.beginPath();
    ctx.ellipse(top + H * 0.26, 0, H * 0.22, W * 0.4, 0, 0, TAU);
    ctx.fill();
  } // throat
  if (detail && g.open > 0.75) {
    ctx.fillStyle = '#e8557f';
    ctx.beginPath();
    ctx.ellipse(top + H * 0.2, 0, H * 0.12, W * 0.07, 0, 0, TAU);
    ctx.fill();
  } // uvula
  if (!b.tongue) {
    // tongue lying in the jaw, sized to stay inside the lips
    const tx = xc + H * 0.62,
      rx = H * 0.3,
      ry = W * 0.5,
      wob = Math.sin(time * 6 + b.phase) * W * 0.04 + g.sw * 0.7;
    ctx.fillStyle = '#ff6f93';
    ctx.beginPath();
    ctx.ellipse(tx, wob, rx, ry, 0, 0, TAU);
    ctx.fill();
    if (detail) {
      ctx.strokeStyle = 'rgba(150,25,70,0.5)';
      ctx.lineWidth = Math.max(0.6 / z, R * 0.02);
      ctx.beginPath();
      ctx.moveTo(tx - rx * 0.7, wob);
      ctx.lineTo(tx + rx * 0.3, wob);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.ellipse(tx - rx * 0.1, wob - ry * 0.45, rx * 0.4, ry * 0.2, 0, 0, TAU);
      ctx.fill();
    }
  }
  const t = b.biteTgt; // the prey's flesh between the jaws: the one moment that still needs a clip
  if (t && t.alive && t.path && t._pf === frameNo) {
    ctx.save();
    ctx.clip(m);
    ctx.rotate(-g.f);
    ctx.translate(-b.x, -b.y);
    ctx.fillStyle = t.pal.dark;
    ctx.fill(t.path);
    ctx.lineWidth = Math.max(1.4 / z, t.Rs * 0.05);
    ctx.strokeStyle = t.pal.rim;
    ctx.stroke(t.path);
    ctx.restore();
  }
  const ts = 0.55 + 0.45 * Math.min(1, g.open * 1.3);
  ctx.fillStyle = '#fff8ee';
  ctx.strokeStyle = 'rgba(120,55,55,0.55)';
  ctx.lineWidth = Math.max(0.5 / z, R * 0.012);
  ctx.beginPath();
  const l1 = Math.min(R * 0.07 * ts, H * 0.4),
    l2 = Math.min(R * 0.105 * ts, H * 0.45);
  if (l1 > R * 0.012) {
    for (const s of [0.33, 0.44, 0.56, 0.67]) {
      const q = jawPt(g, s);
      toothPath(q[0] + R * 0.005, q[1], -1, l1, W * 0.2, false);
    }
    for (const s of [0.22, 0.78]) {
      const q = jawPt(g, s);
      toothPath(q[0] + R * 0.005, q[1], -1, l2, W * 0.19, true);
    }
    ctx.fill();
    ctx.stroke();
  }
  ctx.strokeStyle = pal.lip;
  ctx.lineWidth = lw;
  ctx.stroke(m); // lip edge over the tooth roots
  if (detail) {
    // wet shine on the lower lip
    ctx.strokeStyle = pal.glow;
    ctx.lineWidth = Math.max(0.6 / z, lw * 0.45);
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const q = jawPt(g, 0.3 + 0.05 * i);
      i ? ctx.lineTo(q[0] + lw * 0.75, q[1]) : ctx.moveTo(q[0] + lw * 0.75, q[1]);
    }
    ctx.stroke();
  }
  ctx.restore();
}
function drawMouthFront(b, g) {
  // gums, top teeth and the top lip: whatever is in the mouth goes under these
  const R = g.R,
    z = cam.z,
    pal = b.pal,
    xc = g.xc,
    H = g.H,
    W = g.W,
    uc = g.uc,
    lw = Math.max(1.2 / z, R * 0.05);
  if (H < R * 0.03) return;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(g.f);
  ctx.lineJoin = 'round';
  const gum = Math.min(R * 0.07, H * 0.5),
    ts = 0.55 + 0.45 * Math.min(1, g.open * 1.3);
  ctx.strokeStyle = '#e8557f';
  ctx.lineCap = 'butt';
  ctx.lineWidth = gum;
  ctx.beginPath(); // gums: a band just under the top lip
  for (let i = 0; i <= 8; i++) {
    const v = -0.84 + 0.21 * i,
      x = lipX(g, v) + gum * 0.5;
    i ? ctx.lineTo(x, v * W) : ctx.moveTo(x, v * W);
  }
  ctx.stroke();
  ctx.fillStyle = '#fffaf2';
  ctx.strokeStyle = 'rgba(120,55,55,0.55)';
  ctx.lineWidth = Math.max(0.5 / z, R * 0.012);
  ctx.beginPath();
  let fang = 0,
    tipA = 0,
    tipB = 0;
  for (const [v, len, wid, sharp] of TEETH) {
    // each tooth is as long as the gap under it allows, so none pokes through the jaw
    const base = lipX(g, v) + gum * 0.75,
      l = Math.min(R * len * ts, jawX(g, v) - base - R * 0.02);
    if (l > R * 0.015) toothPath(base, v * W, 1, l, W * wid, sharp);
    if (v === 0.69) fang = base + Math.max(0, l);
    else if (v === -0.42) tipA = base + Math.max(0, l);
    else if (v === 0.14) tipB = base + Math.max(0, l);
  }
  ctx.fill();
  ctx.stroke();
  ctx.lineCap = 'round';
  if (g.open > 0.35 && g.open < 0.95 && R * z > 14 && !b._food) {
    // a string of drool from fang to jaw
    const k = 1 - (g.open - 0.35) / 0.6,
      q = jawPt(g, 0.25);
    ctx.strokeStyle = `rgba(255,236,242,${(0.7 * k).toFixed(3)})`;
    ctx.lineWidth = Math.max(0.6 / z, R * 0.018 * k);
    ctx.beginPath();
    ctx.moveTo(fang, 0.69 * W);
    ctx.quadraticCurveTo((fang + q[0]) / 2, 0.69 * W + W * 0.12 * k, q[0] - R * 0.02, q[1]);
    ctx.stroke();
    if (!lod && R * z > 24) {
      // two more threads of spit between the teeth: a sticky, hungry mouth
      ctx.lineWidth = Math.max(0.5 / z, R * 0.012 * k);
      ctx.beginPath();
      for (const [tip, v, sag] of [
        [tipA, -0.42, -0.08],
        [tipB, 0.14, 0.06],
      ]) {
        const jx = jawX(g, v) - R * 0.03;
        if (jx > tip + R * 0.03) {
          ctx.moveTo(tip, v * W);
          ctx.quadraticCurveTo((tip + jx) / 2, v * W + W * sag * k + g.sw * 0.5, jx, v * W + g.sw * 0.8);
        }
      }
      ctx.stroke();
    }
  }
  if (b.glintT > 0 && fang) {
    // a glint on the fang as the jaws slam
    const q = b.glintT / 0.2,
      sz = R * 0.2 * q,
      gx = fang,
      gy = 0.69 * W;
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, q * 1.5).toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(gx - sz, gy);
    ctx.quadraticCurveTo(gx, gy, gx, gy - sz);
    ctx.quadraticCurveTo(gx, gy, gx + sz, gy);
    ctx.quadraticCurveTo(gx, gy, gx, gy + sz);
    ctx.quadraticCurveTo(gx, gy, gx - sz, gy);
    ctx.fill();
  }
  ctx.strokeStyle = pal.lip;
  ctx.lineWidth = lw * 1.1;
  ctx.beginPath();
  ctx.moveTo(xc, -W);
  ctx.quadraticCurveTo(xc + uc, 0, xc, W);
  ctx.stroke(); // top lip over the gums
  ctx.fillStyle = pal.rim;
  ctx.beginPath();
  for (const k of [-1, 1]) {
    ctx.moveTo(xc + lw * 0.55, k * W);
    ctx.arc(xc, k * W, lw * 0.55, 0, TAU);
  }
  ctx.fill(); // corners
  ctx.restore();
}
const TEETH = [
  [-0.69, 0.2, 0.22, true],
  [0.69, 0.2, 0.22, true],
  [-0.42, 0.12, 0.24, false],
  [0.42, 0.12, 0.24, false],
  [-0.14, 0.14, 0.26, false],
  [0.14, 0.14, 0.26, false],
]; // [height, length, width, fang]
function lipClip(o, inside) {
  // clip to the chin side of o's top lip (or to the inside of its mouth): food slides under the top teeth
  const g = o._g;
  if (!g || o._gf !== frameNo || !o.alive) return;
  ctx.translate(o.x, o.y);
  ctx.rotate(g.f);
  if (inside) ctx.clip(g.path);
  else {
    const B = g.R * 9,
      p = new Path2D();
    p.moveTo(g.xc, -g.W);
    p.quadraticCurveTo(g.xc + g.uc, 0, g.xc, g.W);
    p.lineTo(g.xc, B);
    p.lineTo(B, B);
    p.lineTo(B, -B);
    p.lineTo(g.xc, -B);
    p.closePath();
    ctx.clip(p);
  }
  ctx.rotate(-g.f);
  ctx.translate(-o.x, -o.y);
}
function drawFace(b) {
  const R = b.Rs;
  b._g = null;
  if (R * cam.z < 7) return;
  const f = b.fa + b.fw,
    fx = Math.cos(f),
    fy = Math.sin(f),
    px = -fy,
    py = fx,
    c = b.chunk && !b.chunk.dead ? b.chunk : null;
  const fierce = !!b.bite || !!(c && c.state === 'held'),
    yum = b.happyT > 0 || b.chewT > 0 || !!(c && c.state === 'chew'),
    hot = streakStep(b), // a streak makes the player hungry: bigger eyes, hearts at step 3, a drool drop
    big = hot >= 2 ? 1.25 : 1,
    er = R * (fierce ? 0.175 : 0.16) * big;
  const look = Math.hypot(b.tx - b.x, b.ty - b.y) > 2 ? Math.atan2(b.ty - b.y, b.tx - b.x) : f,
    lx = Math.cos(look),
    ly = Math.sin(look);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const sg of [-1, 1]) {
    const ea = f + sg * 1.15,
      ex = b.x + Math.cos(ea) * R * 0.52,
      ey = b.y + Math.sin(ea) * R * 0.52;
    if (b.hurtT > 0) {
      // squeezed > < eyes
      const s = er * 0.8;
      ctx.strokeStyle = '#24110c';
      ctx.lineWidth = er * 0.38;
      ctx.beginPath();
      ctx.moveTo(ex + fx * s * 0.75 + px * sg * s * 0.55, ey + fy * s * 0.75 + py * sg * s * 0.55);
      ctx.lineTo(ex - px * sg * s * 0.45, ey - py * sg * s * 0.45);
      ctx.lineTo(ex - fx * s * 0.75 + px * sg * s * 0.55, ey - fy * s * 0.75 + py * sg * s * 0.55);
      ctx.stroke();
    } else if (hot === 3) {
      // heart eyes, a gentle pulse
      const k = er * 1.05 * (calm ? 1 : 1 + 0.1 * Math.sin(time * 8));
      ctx.beginPath();
      ctx.moveTo(ex, ey + k * 0.9);
      ctx.bezierCurveTo(ex - k * 1.4, ey - k * 0.1, ex - k * 0.7, ey - k * 1.2, ex, ey - k * 0.4);
      ctx.bezierCurveTo(ex + k * 0.7, ey - k * 1.2, ex + k * 1.4, ey - k * 0.1, ex, ey + k * 0.9);
      ctx.fillStyle = '#ff4f7b';
      ctx.fill();
      ctx.lineWidth = er * 0.16;
      ctx.strokeStyle = '#c8264f';
      ctx.stroke();
    } else if (yum) {
      // happy arcs while it chews
      ctx.strokeStyle = '#24110c';
      ctx.lineWidth = er * 0.38;
      ctx.beginPath();
      ctx.arc(ex - fx * er * 0.3, ey - fy * er * 0.3, er * 0.7, f - 1.25, f + 1.25);
      ctx.stroke();
    } else if (b.blink > 0 && !fierce) {
      ctx.strokeStyle = '#24110c';
      ctx.lineWidth = er * 0.32;
      ctx.beginPath();
      ctx.moveTo(ex - px * er * 0.8, ey - py * er * 0.8);
      ctx.quadraticCurveTo(ex - fx * er * 0.45, ey - fy * er * 0.45, ex + px * er * 0.8, ey + py * er * 0.8);
      ctx.stroke();
    } else {
      const rich = !lod && er * cam.z > 5; // gradients only where the eye is big enough to show them
      if (rich) {
        const sg2 = ctx.createRadialGradient(ex - er * 0.25, ey - er * 0.3, er * 0.1, ex, ey, er * 1.05);
        sg2.addColorStop(0, '#ffffff');
        sg2.addColorStop(0.7, '#fbf1e6');
        sg2.addColorStop(1, '#e3cdb8');
        ctx.fillStyle = sg2;
      } else ctx.fillStyle = '#fbf1e6';
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, TAU);
      ctx.fill();
      ctx.lineWidth = er * 0.16;
      ctx.strokeStyle = b.pal.rim;
      ctx.stroke();
      const qx = ex + lx * er * 0.36,
        qy = ey + ly * er * 0.36;
      if (rich) {
        const ig = ctx.createRadialGradient(qx, qy, er * 0.1, qx, qy, er * 0.62);
        ig.addColorStop(0, b.pal.light);
        ig.addColorStop(1, b.pal.dark);
        ctx.fillStyle = ig;
      } else ctx.fillStyle = b.pal.base;
      ctx.beginPath();
      ctx.arc(qx, qy, er * 0.62, 0, TAU);
      ctx.fill(); // iris in the body's flavour
      ctx.fillStyle = '#1a0b07';
      ctx.beginPath();
      const pr = er * (b.wowT > 0 ? 0.48 : b.tongue || fierce ? 0.26 : 0.36) * big;
      if (b.eyes === 'stars') {
        // a five-point star for a pupil
        for (let i = 0; i < 10; i++) {
          const a = look - 1.5708 + i * 0.6283,
            r = i % 2 ? pr * 0.5 : pr * 1.45;
          if (i) ctx.lineTo(qx + Math.cos(a) * r, qy + Math.sin(a) * r);
          else ctx.moveTo(qx + Math.cos(a) * r, qy + Math.sin(a) * r);
        }
        ctx.closePath();
      } else if (b.eyes === 'cat') ctx.ellipse(qx, qy, pr * 1.6, pr * 0.42, look, 0, TAU); // a slit along the gaze
      else ctx.arc(qx, qy, pr, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(qx - er * 0.22, qy - er * 0.24, er * (b.wowT > 0 ? 0.24 : 0.17), 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(qx + er * 0.18, qy + er * 0.18, er * 0.07, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(60,20,10,0.12)';
      ctx.beginPath();
      ctx.arc(ex, ey, er * 0.92, -2.6, -0.55);
      ctx.closePath();
      ctx.fill(); // lid shade
      if (b.eyes === 'sleepy') {
        // a heavy upper lid in the body's colour
        ctx.fillStyle = b.pal.base;
        ctx.beginPath();
        ctx.arc(ex, ey, er, Math.PI + 0.1, TAU - 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#24110c';
        ctx.lineWidth = er * 0.2;
        ctx.stroke();
      } else if (b.eyes === 'lashes') {
        // three short lashes over the outer edge
        ctx.strokeStyle = '#24110c';
        ctx.lineWidth = er * 0.2;
        ctx.beginPath();
        for (let i = -1; i <= 1; i++) {
          const a = ea + i * 0.45;
          ctx.moveTo(ex + Math.cos(a) * er * 1.05, ey + Math.sin(a) * er * 1.05);
          ctx.lineTo(ex + Math.cos(a) * er * 1.6, ey + Math.sin(a) * er * 1.6);
        }
        ctx.stroke();
      }
      if (fierce) {
        // hunter's brow
        ctx.strokeStyle = b.pal.rim;
        ctx.lineWidth = er * 0.34;
        ctx.beginPath();
        ctx.moveTo(ex - fx * er * 0.5 - px * sg * er * 0.95, ey - fy * er * 0.5 - py * sg * er * 0.95);
        ctx.lineTo(ex - fx * er * 1.2 + px * sg * er * 0.75, ey - fy * er * 1.2 + py * sg * er * 0.75);
        ctx.stroke();
      }
    }
  }
  if (b.eyes === 'glasses') {
    // two round frames and a bridge, over any state of the eyes
    const gr = er * 1.35,
      ga = f + 1.15;
    ctx.strokeStyle = '#24110c';
    ctx.lineWidth = er * 0.2;
    ctx.beginPath();
    for (const sg of [-1, 1]) {
      const gx = b.x + Math.cos(f + sg * 1.15) * R * 0.52,
        gy = b.y + Math.sin(f + sg * 1.15) * R * 0.52;
      ctx.moveTo(gx + gr, gy);
      ctx.arc(gx, gy, gr, 0, TAU);
    }
    // the bridge joins the inner edges of the frames
    const hx = Math.cos(ga) * R * 0.52,
      hy = Math.sin(ga) * R * 0.52,
      qx = Math.cos(f - 1.15) * R * 0.52,
      qy = Math.sin(f - 1.15) * R * 0.52,
      dd = Math.hypot(hx - qx, hy - qy) || 1,
      ux = (hx - qx) / dd,
      uy = (hy - qy) / dd;
    ctx.moveTo(b.x + qx + ux * gr, b.y + qy + uy * gr);
    ctx.lineTo(b.x + hx - ux * gr, b.y + hy - uy * gr);
    ctx.stroke();
  }
  if (hot === 3 && lod < 2 && R * cam.z > 16 && b.hurtT <= 0) {
    // a drop of drool hangs from the corner of the mouth
    const dl = R * (calm ? 0.1 : 0.1 + 0.05 * Math.sin(time * 3));
    ctx.fillStyle = 'rgba(200,230,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(b.x + fx * R * 0.8 + px * R * 0.24, b.y + fy * R * 0.8 + py * R * 0.24 + dl, R * 0.036, R * 0.05 + dl * 0.25, 0, 0, TAU);
    ctx.fill();
  }
  if (yum && lod < 2 && R * cam.z > 16 && b.hurtT <= 0) {
    // a blush on both cheeks while it enjoys the bite
    ctx.fillStyle = 'rgba(255,175,195,0.42)';
    ctx.beginPath();
    for (const sg of [-1, 1]) {
      const a = f + sg * 0.78,
        cx = b.x + Math.cos(a) * R * 0.7,
        cy = b.y + Math.sin(a) * R * 0.7;
      ctx.moveTo(cx + R * 0.11, cy);
      ctx.ellipse(cx, cy, R * 0.11, R * 0.075, a + Math.PI / 2, 0, TAU);
    }
    ctx.fill();
  }
  if (R * cam.z > 8) {
    const g = mouthGeo(b);
    g.path = g.H < g.R * 0.03 ? SHUT : mouthPath(g);
    b._g = g;
    b._gf = frameNo; // a shut mouth needs no outline
    drawMouthBack(b, g);
    if (!b._food) drawMouthFront(b, g);
  }
}
function drawTongue(b) {
  const T = b.tongue;
  if (!T || T.len < 2) return;
  const [ox, oy] = tongueOrigin(b),
    R = b.Rs,
    dx = T.tx - ox,
    dy = T.ty - oy,
    L = Math.hypot(dx, dy) || 1,
    ux = dx / L,
    uy = dy / L,
    px = -uy,
    py = ux;
  const wob = T.state === 'out' ? Math.sin(T.t * 40) * Math.min(L * 0.06, R * 0.3) : T.state === 'back' ? Math.sin(T.t * 30) * L * 0.04 : 0;
  const cx = ox + dx * 0.5 + px * wob,
    cy = oy + dy * 0.5 + py * wob,
    w0 = Math.max(3.5, R * 0.21),
    w1 = Math.max(2.5, R * 0.12),
    n = 14,
    Lp = [],
    Rp = [],
    mid = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      mt = 1 - t,
      x = mt * mt * ox + 2 * mt * t * cx + t * t * T.tx,
      y = mt * mt * oy + 2 * mt * t * cy + t * t * T.ty;
    let tx = 2 * mt * (cx - ox) + 2 * t * (T.tx - cx),
      ty = 2 * mt * (cy - oy) + 2 * t * (T.ty - cy);
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const w = lerp(w0, w1, t) * (1 + 0.12 * Math.sin(t * 9 - time * 12)) * 0.5;
    Lp.push([x - ty * w, y + tx * w]);
    Rp.push([x + ty * w, y - tx * w]);
    mid.push([x, y]);
  }
  const g = ctx.createLinearGradient(ox - px * w0, oy - py * w0, ox + px * w0, oy + py * w0);
  g.addColorStop(0, '#ff8fab');
  g.addColorStop(0.5, '#ff5f88');
  g.addColorStop(1, '#c93763');
  ctx.beginPath();
  ctx.moveTo(Lp[0][0], Lp[0][1]);
  for (const q of Lp) ctx.lineTo(q[0], q[1]);
  for (let i = Rp.length - 1; i >= 0; i--) ctx.lineTo(Rp[i][0], Rp[i][1]);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1 / cam.z, R * 0.02);
  ctx.strokeStyle = '#8f1d45';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(mid[1][0], mid[1][1]);
  for (let i = 2; i < n; i++) ctx.lineTo(mid[i][0], mid[i][1]);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(150,25,70,0.45)';
  ctx.lineWidth = Math.max(0.8 / cam.z, w1 * 0.25);
  ctx.stroke(); // groove
  ctx.beginPath();
  for (let i = 1; i < n; i++) {
    const q = Lp[i],
      m = mid[i];
    const x = lerp(m[0], q[0], 0.55),
      y = lerp(m[1], q[1], 0.55);
    i > 1 ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.strokeStyle = 'rgba(255,225,235,0.6)';
  ctx.lineWidth = Math.max(0.7 / cam.z, w1 * 0.2);
  ctx.stroke(); // wet shine
  const stuck = T.state === 'stuck',
    pr = Math.max(4, R * 0.17) * (stuck ? 1.15 : 1); // sticky pad
  ctx.save();
  ctx.translate(T.tx, T.ty);
  ctx.rotate(Math.atan2(uy, ux));
  const pg = ctx.createRadialGradient(-pr * 0.3, -pr * 0.35, pr * 0.1, 0, 0, pr * 1.1);
  pg.addColorStop(0, '#ffc2d2');
  pg.addColorStop(0.6, '#ff6f93');
  pg.addColorStop(1, '#d23f6a');
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.ellipse(0, 0, pr * (stuck ? 0.75 : 1.05), pr * (stuck ? 1.25 : 1), 0, 0, TAU);
  ctx.fill();
  ctx.lineWidth = Math.max(1 / cam.z, pr * 0.14);
  ctx.strokeStyle = '#8f1d45';
  ctx.stroke();
  ctx.strokeStyle = 'rgba(143,29,69,0.5)';
  ctx.lineWidth = Math.max(0.7 / cam.z, pr * 0.08);
  ctx.beginPath();
  ctx.ellipse(pr * 0.1, 0, pr * 0.45, pr * 0.7, 0, 0, TAU);
  ctx.stroke(); // suction ring
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.arc(-pr * 0.35, -pr * 0.4, pr * 0.18, 0, TAU);
  ctx.fill();
  ctx.restore();
}
function drawHat(b) {
  if (b.hat === 'none' || b.Rs * cam.z < 8) return;
  const tx = b.x,
    ty = b.y - b.radiusAt(-Math.PI / 2) * 0.97,
    s = b.Rs * 0.42;
  ctx.save();
  ctx.translate(tx, ty + s * 0.15);
  ctx.scale(s, s);
  ctx.lineWidth = 0.09;
  ctx.lineJoin = 'round';
  if (b.hat === 'bow') {
    ctx.fillStyle = '#ff4f7b';
    ctx.strokeStyle = '#8f1838';
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, -0.2);
      ctx.lineTo(k, -0.8);
      ctx.lineTo(k * 0.95, 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#c8264f';
    ctx.beginPath();
    ctx.arc(0, -0.22, 0.28, 0, TAU);
    ctx.fill();
    ctx.stroke();
  } else if (b.hat === 'crown') {
    ctx.fillStyle = '#ffd23f';
    ctx.strokeStyle = '#9a6208';
    ctx.beginPath();
    ctx.moveTo(-0.85, 0.15);
    ctx.lineTo(-0.9, -0.65);
    ctx.lineTo(-0.45, -0.25);
    ctx.lineTo(0, -0.9);
    ctx.lineTo(0.45, -0.25);
    ctx.lineTo(0.9, -0.65);
    ctx.lineTo(0.85, 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff4f7b';
    for (const x of [-0.45, 0, 0.45]) {
      ctx.beginPath();
      ctx.arc(x, -0.05, 0.11, 0, TAU);
      ctx.fill();
    }
  } else if (b.hat === 'chef') {
    ctx.fillStyle = '#fffaf2';
    ctx.strokeStyle = '#b7a596';
    for (const [x, y, r] of [
      [-0.48, -0.55, 0.4],
      [0.48, -0.55, 0.4],
      [0, -0.8, 0.48],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.rect(-0.7, -0.4, 1.4, 0.55);
    ctx.fill();
    ctx.stroke();
  } else if (b.hat === 'horns') {
    ctx.fillStyle = '#e23a3a';
    ctx.strokeStyle = '#6e1111';
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(k * 0.8, 0.2);
      ctx.quadraticCurveTo(k * 1.05, -0.65, k * 0.45, -1);
      ctx.quadraticCurveTo(k * 0.6, -0.4, k * 0.25, 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (b.hat === 'cap') {
    // a baseball cap, the peak to the right
    ctx.fillStyle = '#3f9cff';
    ctx.strokeStyle = '#123f7a';
    ctx.beginPath();
    ctx.moveTo(-0.85, 0.15);
    ctx.bezierCurveTo(-0.92, -1, 0.92, -1, 0.85, 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (lod < 2) {
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(0, -0.68);
      ctx.quadraticCurveTo(-0.38, -0.4, -0.42, 0.12);
      ctx.moveTo(0, -0.68);
      ctx.quadraticCurveTo(0.38, -0.4, 0.42, 0.12);
      ctx.stroke();
      ctx.lineWidth = 0.09;
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, -0.7, 0.12, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2a78d6';
    ctx.beginPath();
    ctx.moveTo(0.35, 0.0);
    ctx.quadraticCurveTo(1.2, -0.12, 1.5, 0.12);
    ctx.quadraticCurveTo(1.05, 0.34, 0.35, 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (b.hat === 'pompom') {
    // a knitted beanie: ribbed crown, a folded cuff, a fluffy pom-pom
    ctx.fillStyle = '#ff5a6e';
    ctx.strokeStyle = '#7a1424';
    ctx.beginPath();
    ctx.moveTo(-0.8, -0.1);
    ctx.bezierCurveTo(-0.86, -1.2, 0.86, -1.2, 0.8, -0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (lod < 2) {
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      for (let k = -1; k <= 1; k += 2) {
        ctx.moveTo(k * 0.4, -0.2);
        ctx.quadraticCurveTo(k * 0.42, -0.62, k * 0.22, -0.86);
      }
      ctx.moveTo(0, -0.2);
      ctx.lineTo(0, -0.9);
      ctx.stroke();
      ctx.lineWidth = 0.09;
    }
    ctx.fillStyle = '#fff3e0';
    ctx.beginPath();
    ctx.moveTo(-0.92, -0.26);
    ctx.quadraticCurveTo(0, -0.46, 0.92, -0.26);
    ctx.lineTo(0.92, 0.12);
    ctx.quadraticCurveTo(0, -0.06, -0.92, 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // the pom-pom: a thick outline under the fill leaves only the bumpy outer edge
    ctx.beginPath();
    ctx.arc(0, -1.02, 0.25, 0, TAU);
    for (let i = 0; i < 8; i++) {
      const a = i * 0.785,
        x = Math.cos(a) * 0.24,
        y = -1.02 + Math.sin(a) * 0.24;
      ctx.moveTo(x + 0.12, y);
      ctx.arc(x, y, 0.12, 0, TAU);
    }
    ctx.lineWidth = 0.18;
    ctx.stroke();
    ctx.fill();
  } else if (b.hat === 'wreath') {
    // a ring of leaves around the crown of the head, three little flowers in front
    ctx.strokeStyle = '#235c10';
    ctx.lineWidth = 0.06;
    for (let i = 0; i < 14; i++) {
      // the back half first, so the front leaves overlap it
      const a = i < 7 ? Math.PI + (i + 0.5) * 0.449 : (i - 6.5) * 0.449,
        x = Math.cos(a) * 0.95,
        y = -0.1 + Math.sin(a) * 0.32;
      ctx.fillStyle = i < 7 ? (i % 2 ? '#3f9424' : '#5cb83a') : i % 2 ? '#5cc232' : '#86e054'; // the back half a shade darker
      ctx.beginPath();
      ctx.ellipse(x, y, 0.27, 0.12, a + 1.5708 + (i % 2 ? 0.5 : -0.5), 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    if (lod < 2)
      for (let j = -1; j <= 1; j++) {
        const a = 1.5708 + j * 0.75,
          x = Math.cos(a) * 0.95,
          y = -0.1 + Math.sin(a) * 0.32;
        ctx.fillStyle = j ? '#ff7aa2' : '#fffaf2';
        ctx.strokeStyle = j ? '#a3264f' : '#b7a596';
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const px = x + Math.cos(i * 1.2566) * 0.11,
            py = y + Math.sin(i * 1.2566) * 0.11;
          ctx.moveTo(px + 0.09, py);
          ctx.arc(px, py, 0.09, 0, TAU);
        }
        ctx.lineWidth = 0.12;
        ctx.stroke();
        ctx.fill();
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath();
        ctx.arc(x, y, 0.06, 0, TAU);
        ctx.fill();
      }
  } else if (b.hat === 'tophat') {
    // a top hat with a pink band; the front of the brim is drawn last, over the crown
    ctx.fillStyle = '#3a3042';
    ctx.strokeStyle = '#100b14';
    ctx.beginPath();
    ctx.ellipse(0, 0.05, 1.02, 0.22, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.6, 0.05);
    ctx.lineTo(-0.66, -1.22);
    ctx.lineTo(0.66, -1.22);
    ctx.lineTo(0.6, 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff4f7b';
    ctx.beginPath();
    ctx.moveTo(-0.61, -0.1);
    ctx.lineTo(-0.63, -0.4);
    ctx.quadraticCurveTo(0, -0.28, 0.63, -0.4);
    ctx.lineTo(0.61, -0.1);
    ctx.quadraticCurveTo(0, 0.02, -0.61, -0.1);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#4a3f54';
    ctx.beginPath();
    ctx.ellipse(0, -1.22, 0.66, 0.15, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    if (lod < 2) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 0.1;
      ctx.beginPath();
      ctx.moveTo(-0.44, -0.5);
      ctx.lineTo(-0.48, -1.04);
      ctx.stroke();
      ctx.strokeStyle = '#100b14';
      ctx.lineWidth = 0.09;
    }
    ctx.fillStyle = '#3a3042';
    ctx.beginPath();
    ctx.ellipse(0, 0.05, 1.02, 0.22, 0, 0, Math.PI);
    ctx.fill();
    ctx.stroke();
  } else if (b.hat === 'witch') {
    // a pointed hat whose tip has flopped over, an orange band with a buckle
    ctx.fillStyle = '#6a3fa6';
    ctx.strokeStyle = '#24103d';
    ctx.beginPath();
    ctx.ellipse(0, 0.04, 1.16, 0.25, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.62, 0.04);
    ctx.quadraticCurveTo(-0.32, -0.85, 0.08, -1.5);
    ctx.quadraticCurveTo(0.42, -1.62, 0.82, -1.3);
    ctx.quadraticCurveTo(0.34, -1.24, 0.32, -0.8);
    ctx.lineTo(0.62, 0.04);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff8a2a';
    ctx.beginPath();
    ctx.moveTo(-0.6, -0.04);
    ctx.lineTo(-0.5, -0.32);
    ctx.quadraticCurveTo(0, -0.22, 0.5, -0.32);
    ctx.lineTo(0.6, -0.04);
    ctx.quadraticCurveTo(0, 0.08, -0.6, -0.04);
    ctx.fill();
    ctx.stroke();
    if (lod < 2) {
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.rect(-0.13, -0.29, 0.26, 0.26);
      ctx.stroke();
      ctx.strokeStyle = '#24103d';
      ctx.lineWidth = 0.09;
    }
    ctx.fillStyle = '#6a3fa6';
    ctx.beginPath();
    ctx.ellipse(0, 0.04, 1.16, 0.25, 0, 0, Math.PI);
    ctx.fill();
    ctx.stroke();
  } else if (b.hat === 'pirate') {
    // a tricorn: two corners and a point in front, gold trim, a little skull
    ctx.fillStyle = '#2e2529';
    ctx.strokeStyle = '#0c0809';
    ctx.beginPath();
    ctx.moveTo(-1.25, -0.22);
    ctx.quadraticCurveTo(-0.75, -1.08, 0, -1.02);
    ctx.quadraticCurveTo(0.75, -1.08, 1.25, -0.22);
    ctx.quadraticCurveTo(0.6, -0.16, 0, 0.18);
    ctx.quadraticCurveTo(-0.6, -0.16, -1.25, -0.22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#ffc23a';
    ctx.lineWidth = 0.09;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-1.1, -0.26);
    ctx.quadraticCurveTo(-0.55, -0.22, 0, 0.07);
    ctx.quadraticCurveTo(0.55, -0.22, 1.1, -0.26);
    ctx.stroke();
    if (lod < 2) {
      ctx.strokeStyle = '#fffaf2';
      ctx.beginPath();
      ctx.moveTo(-0.27, -0.76);
      ctx.lineTo(0.27, -0.26);
      ctx.moveTo(0.27, -0.76);
      ctx.lineTo(-0.27, -0.26);
      ctx.stroke();
      ctx.fillStyle = '#fffaf2';
      ctx.beginPath();
      ctx.arc(0, -0.55, 0.19, 0, TAU);
      ctx.rect(-0.1, -0.44, 0.2, 0.12);
      ctx.fill();
      ctx.fillStyle = '#0c0809';
      ctx.beginPath();
      ctx.arc(-0.075, -0.56, 0.05, 0, TAU);
      ctx.moveTo(0.125, -0.56);
      ctx.arc(0.075, -0.56, 0.05, 0, TAU);
      ctx.fill();
    }
  } else if (b.hat === 'halo') {
    // a gold ring floating over the head, nothing on the body itself
    const hy = -1 + (calm ? 0 : Math.sin(time * 2.2) * 0.05);
    ctx.beginPath();
    ctx.ellipse(0, hy, 0.82, 0.26, 0, 0, TAU);
    if (lod < 2) {
      ctx.strokeStyle = 'rgba(255,230,120,0.35)';
      ctx.lineWidth = 0.46;
      ctx.stroke();
    }
    ctx.strokeStyle = '#9a6208';
    ctx.lineWidth = 0.3;
    ctx.stroke();
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 0.17;
    ctx.stroke();
    if (lod < 2) {
      ctx.strokeStyle = 'rgba(255,255,235,0.9)';
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.ellipse(0, hy - 0.02, 0.8, 0.24, 0, Math.PI + 0.5, TAU - 0.5);
      ctx.stroke();
    }
  }
  ctx.restore();
}
