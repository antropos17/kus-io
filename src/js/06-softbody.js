// ---------- soft body ----------
function woundProfile(u, w) {
  const au = u < 0 ? -u : u;
  if (au >= 1.15) return 0;
  let v = au < 1 ? Math.sqrt(1 - au * au) : 0; // round bite
  if (w.teeth && au < 1) v *= 1 - 0.17 * Math.abs(Math.sin(u * Math.PI * w.teeth * 0.5)); // tooth scallops
  v += 0.1 * (1 - au / 1.15) * vnoise(u * 3.3 + w.seed); // torn souffle edge
  return v > 0 ? v : 0;
}

let nextId = 1;
class Blob {
  constructor(o) {
    this.id = nextId++;
    this.name = o.name;
    this.acc = o.acc || o.name;
    this.isPlayer = !!o.isPlayer;
    this.pal = o.pal;
    this.mass = o.mass;
    this.x = o.x;
    this.y = o.y;
    this.vx = 0;
    this.vy = 0;
    this.R = massToR(this.mass);
    this.Rs = this.R;
    this.face = rand(-Math.PI, Math.PI);
    this.tx = this.x;
    this.ty = this.y;
    this.wounds = [];
    this.pulls = [];
    this.contacts = [];
    this.biteCd = 0.3;
    this.dashCd = 0;
    this.dashT = 0;
    this.dodgeCd = 0;
    this.dodgeT = 0;
    this.tongue = null;
    this.dripT = 0;
    this.hat = o.hat || 'none';
    this.eyes = o.eyes || 'none';
    this.trail = o.trail || 'none';
    this.trailAcc = 0;
    this.skin = o.skin || 'plain';
    this.kind = o.kind || null;
    this.pSpeed = 0;
    this.pShield = 0;
    this.pMagnet = 0;
    this.chewT = 0;
    this.snackT = 0;
    this.hurtT = 0;
    this.happyT = 0;
    this.wowT = 0;
    this.glintT = 0;
    this.sq = 0;
    this.sqV = 0;
    this.sqA = 0;
    this.rip = null;
    this.bumpAt = -9; // jelly wobble of the whole body, and the ripple a bite sends round it this.blinkT = rand(1, 5); this.blink = 0;
    this.mouth = 0;
    this.mouthV = 0;
    this.mouthWant = 0;
    this.bite = null;
    this.biteTgt = null;
    this.btT = 0;
    this.lunge = 0;
    this.lungeWant = 0;
    this.fw = 0;
    this.fa = this.face; // the angle the face is drawn at: follows face smoothly, so a sudden turn never jerks the mouth
    this.chunk = null;
    this.swT = 0;
    this.lickT = 0;
    this.clackT = 0;
    this.puff = 0;
    this._g = null;
    this._gf = -1;
    this._pf = -1;
    this._food = false;
    this._top = 0;
    this.spawnT = o.spawnT || 0;
    this.alive = true;
    this.phase = rand(TAU);
    this.ai = o.ai || null;
    this.sugar = Array.from({ length: 9 }, () => [rand(TAU), Math.sqrt(rand(0.05, 0.7)), rand(0.6, 1.3)]);
    this.stats = { bites: 0, kills: 0, maxMass: this.mass, t0: time };
    this.pts = [];
    this.path = null;
    this.buildPoints(Blob.ptsFor(this.Rs));
  }
  static ptsFor(R) {
    return clamp(Math.round((TAU * R) / 6.5), 18, 200);
  }
  maxSpeed() {
    return (
      760 *
      Math.pow(Math.max(this.Rs, 8), -0.36) *
      (this.isPlayer ? CHEAT.speed * DIFFS[diff].speed : 1) *
      (this.pSpeed > 0 ? 1.35 : 1) *
      (this.kind === 'cake' ? 0.5 : this.kind === 'piranha' ? 1.22 : this.kind === 'hedgehog' ? 0.8 : 1)
    );
  }
  turnRate() {
    if (this.boss) return this.spinT > 0 ? this.boss.spin : this.boss.turn; // the big cake turns slowly, but whirls round when its cherry is bitten
    return 8 * Math.pow(Math.max(this.Rs, 8) / 25, -0.5) * (this.ai ? 0.85 : 1);
  }
  buildPoints(N) {
    const old = this.pts,
      M = old.length,
      pts = new Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU,
        c = Math.cos(a),
        s = Math.sin(a);
      const p = { a, c, s, x: this.x + c * this.Rs, y: this.y + s * this.Rs, vx: this.vx, vy: this.vy, tx: 0, ty: 0, ax: 0, ay: 0 };
      if (M) {
        const f = (i / N) * M,
          i0 = Math.floor(f) % M,
          i1 = (i0 + 1) % M,
          t = f - Math.floor(f),
          p0 = old[i0],
          p1 = old[i1];
        p.x = lerp(p0.x, p1.x, t);
        p.y = lerp(p0.y, p1.y, t);
        p.vx = lerp(p0.vx, p1.vx, t);
        p.vy = lerp(p0.vy, p1.vy, t);
      }
      p.tx = p.x;
      p.ty = p.y;
      pts[i] = p;
    }
    this.pts = pts;
  }
  resetPoints() {
    for (const p of this.pts) {
      p.x = p.tx = this.x + p.c * this.Rs;
      p.y = p.ty = this.y + p.s * this.Rs;
      p.vx = this.vx;
      p.vy = this.vy;
    }
  }
  dentAt(a) {
    let d = 0;
    for (const w of this.wounds) {
      const u = angDiff(a, w.a) / w.w;
      if (u > -1.15 && u < 1.15) d += w.d * w.heal * woundProfile(u, w);
    }
    return d > 0.72 ? 0.72 : d;
  }
  radiusAt(a) {
    return this.Rs * (1 - this.dentAt(a));
  }
  contourAt(a) {
    const N = this.pts.length,
      f = ((((a % TAU) + TAU) % TAU) / TAU) * N,
      i0 = Math.floor(f) % N,
      i1 = (i0 + 1) % N,
      t = f - Math.floor(f);
    const p = this.pts[i0],
      q = this.pts[i1];
    return [lerp(p.x, q.x, t), lerp(p.y, q.y, t)];
  }
  addWound(a, biteR) {
    const R = Math.max(this.R, 6),
      w = clamp((biteR / R) * 1.2, 0.08, 1.35),
      d = clamp((biteR / R) * 0.95, 0.06, 0.58);
    for (const o of this.wounds) {
      if (Math.abs(angDiff(o.a, a)) < Math.max(o.w, w) * 0.55) {
        // bite into the same spot digs deeper
        o.d = Math.min(0.62, o.d * o.heal + d * 0.75);
        o.w = Math.min(1.4, Math.max(o.w, w) * 1.05);
        o.a += angDiff(a, o.a) * 0.35;
        o.age = 0;
        o.heal = 1;
        o.fresh = false;
        return o;
      }
    }
    const span = (2 * w) / (TAU / this.pts.length);
    const wnd = {
      a,
      w,
      d,
      age: 0,
      heal: 0.3,
      fresh: true,
      healT: rand(6.5, 9),
      seed: rand(1000),
      teeth: span >= 9 ? Math.min(7, Math.floor(span / 3)) : 0,
      pores: [],
    };
    for (let i = 0, n = 3 + randi(4); i < n; i++) wnd.pores.push({ u: rand(-0.75, 0.75), v: rand(0.15, 0.85), s: rand(0.5, 1.2) });
    this.wounds.push(wnd);
    if (this.wounds.length > 9) {
      this.wounds.sort((p, q) => q.d * q.heal - p.d * p.heal);
      this.wounds.length = 9;
    }
    return wnd;
  }
}

function woundLoad(b) {
  let l = 0;
  for (const w of b.wounds) l += w.d * w.heal;
  return l;
}
function updateBlob(b, dt) {
  if (b.swell) b.swell = b.swell > 0.001 ? b.swell * Math.exp(-dt * 7) : 0; // a streak bite's swell settles in about a second
  b.R = massToR(b.mass);
  b.Rs += (b.R - b.Rs) * (1 - Math.exp(-dt * 6));
  if (b.mass > b.stats.maxMass) b.stats.maxMass = b.mass;
  const want = Blob.ptsFor(b.Rs);
  if (Math.abs(want - b.pts.length) > Math.max(2, b.pts.length * 0.08)) b.buildPoints(want);
  b.biteCd -= dt;
  b.dashCd -= b.isPlayer && day === 'quick' ? dt * 2 : dt;
  b.dashT -= dt;
  b.dodgeCd -= dt;
  b.dodgeT -= dt;
  b.graceT = (b.graceT || 0) - dt;
  b.dripT -= dt;
  b.gulpT = (b.gulpT || 0) - dt;
  if (b.gulpT <= 0 && b.gulpT > -dt) b.chewT = 0.3;
  b.pSpeed -= dt;
  b.pShield -= dt;
  b.pMagnet -= dt;
  if (b.comboT > 0) {
    b.comboT -= dt;
    if (b.comboT <= 0 && b.combo > 1) {
      b.lickT = 0.7;
      if (b.isPlayer) onStreakEnd(b);
    }
  }
  b.wowT -= dt;
  b.glintT -= dt;
  b.chewT -= dt;
  b.swT -= dt;
  b.lickT -= dt;
  b.clackT -= dt;
  if (b.biteTgt && !b.bite) {
    b.btT -= dt;
    if (b.btT <= 0 || !b.biteTgt.alive) b.biteTgt = null;
  }
  b.snackT -= dt;
  b.hurtT -= dt;
  b.happyT -= dt;
  b.spawnT -= dt;
  b.sqV += (-b.sq * 300 - b.sqV * 9) * dt;
  b.sq = clamp(b.sq + b.sqV * dt, -0.2, 0.2);
  if (b.sq > -0.002 && b.sq < 0.002 && b.sqV > -0.03 && b.sqV < 0.03) b.sq = b.sqV = 0;
  if (b.rip && (b.rip.t += dt) > 0.75) b.rip = null;
  b.blinkT -= dt;
  if (b.blinkT < 0) {
    b.blink = 0.12;
    b.blinkT = rand(2, 6);
  }
  if (b.blink > 0) b.blink -= dt;
  for (let i = b.wounds.length - 1; i >= 0; i--) {
    const w = b.wounds[i];
    w.age += dt;
    w.heal = Math.exp(-w.age / w.healT) * (w.fresh && w.age < 0.1 ? 0.3 + 7 * w.age : 1);
    if (w.d * w.heal < 0.008) b.wounds.splice(i, 1);
  }
  const load = woundLoad(b);
  if (load > 0.12 && b.dripT <= 0) {
    // fresh wounds drip souffle crumbs
    let fw = null;
    for (const w of b.wounds) if (w.heal > 0.55 && w.d > 0.12 && (!fw || w.d * w.heal > fw.d * fw.heal)) fw = w;
    if (fw) {
      b.dripT = 0.32;
      const m = Math.min(b.mass * 0.005 + 0.35, 2) * (b.isPlayer ? 0.5 : 1);
      if (b.mass - m > MIN_MASS + 2 && !(b.isPlayer && CHEAT.god)) {
        b.mass -= m;
        const [x, y] = b.contourAt(fw.a);
        spawnCrumbs(x, y, m, b.pal, Math.cos(fw.a), Math.sin(fw.a), b);
      }
    }
  }
  b.mass -= meltRate(b) * dt; // giants slowly melt
  if (b.kind === 'piranha' && b.mass > 30) b.mass = 30;
  else if (b.kind === 'hedgehog' && b.mass > 420) b.mass = 420;
  b.mass = Math.min(b.mass, b.isPlayer ? MELT.capPlayer : MELT.cap);
  const dx = b.tx - b.x,
    dy = b.ty - b.y,
    dist = Math.hypot(dx, dy),
    maxV = b.maxSpeed();
  let tvx = 0,
    tvy = 0;
  if (dist > 0.5) {
    const ux = dx / dist,
      uy = dy / dist,
      ta = Math.atan2(uy, ux);
    if (dist > b.Rs * 0.2) {
      const turn = b.turnRate() * dt;
      b.face = angDiff(b.face + clamp(angDiff(ta, b.face), -turn, turn), 0);
    }
    const fa = Math.cos(angDiff(ta, b.face));
    const sp = maxV * clamp(dist / (b.Rs * 1.1 + 40), 0, 1) * (0.62 + 0.38 * Math.max(0, fa)) * (1 - Math.min(0.3, load * 0.55)); // wounds slow you
    tvx = ux * sp;
    tvy = uy * sp;
  }
  const k = 1 - Math.exp(-(b.dashT > 0 || b.dodgeT > 0 ? 1.4 : 6) * dt);
  b.vx += (tvx - b.vx) * k;
  b.vy += (tvy - b.vy) * k;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  const m = b.Rs * 0.85;
  if (b.x < m) {
    b.x = m;
    if (b.vx < 0) {
      if (b.vx < -150) jolt(b, 0, b.vx / 240);
      b.vx *= -0.25;
    }
  } else if (b.x > WORLD - m) {
    b.x = WORLD - m;
    if (b.vx > 0) {
      if (b.vx > 150) jolt(b, 0, -b.vx / 240);
      b.vx *= -0.25;
    }
  }
  if (b.y < m) {
    b.y = m;
    if (b.vy < 0) {
      if (b.vy < -150) jolt(b, Math.PI / 2, b.vy / 240);
      b.vy *= -0.25;
    }
  } else if (b.y > WORLD - m) {
    b.y = WORLD - m;
    if (b.vy > 0) {
      if (b.vy > 150) jolt(b, Math.PI / 2, -b.vy / 240);
      b.vy *= -0.25;
    }
  }
  for (let n = Math.max(1, Math.ceil(dt / 0.012)), h = dt / n, i = 0; i < n; i++) {
    // snappy jaw spring
    b.mouthV += ((b.mouthWant - b.mouth) * 1500 - b.mouthV * 48) * h;
    b.mouth = clamp(b.mouth + b.mouthV * h, -0.1, 1.25);
  }
  b.lunge += (b.lungeWant - b.lunge) * (1 - Math.exp(-dt * (b.lungeWant > b.lunge ? 70 : 30)));
  const hc = b.chunk && !b.chunk.dead && b.chunk.state === 'held' ? b.chunk : null; // head shakes while the piece tears free
  b.fw = hc ? Math.sin(hc.t * 32) * 0.2 * Math.max(0, 1 - hc.t / hc.holdT) : b.fw * Math.exp(-dt * 20);
  b.fa = angDiff(b.fa + angDiff(b.face, b.fa) * (1 - Math.exp(-dt * 30)), 0);
}

function computeTargets(b) {
  const pts = b.pts,
    N = pts.length,
    R = b.Rs,
    va = Math.atan2(b.vy, b.vx);
  const st = clamp(Math.hypot(b.vx, b.vy) / (b.maxSpeed() + 1), 0, 1.8) * 0.065 + (b.dashT > 0 || b.dodgeT > 0 ? 0.1 : 0);
  const hasW = b.wounds.length > 0,
    t = time,
    ph = b.phase;
  let c2 = st,
    a2 = 2 * va; // the stretch of speed and the jelly wobble are both cos(2a) shapes, so they add up to one
  if (b.sq !== 0) {
    const X = st * Math.cos(a2) + b.sq * Math.cos(2 * b.sqA),
      Y = st * Math.sin(a2) + b.sq * Math.sin(2 * b.sqA);
    c2 = Math.hypot(X, Y);
    a2 = Math.atan2(Y, X);
  }
  const rip = lod < 2 ? b.rip : null,
    rk = rip ? rip.amp * Math.exp(-rip.t * 4.5) : 0,
    rf = rip ? rip.t * 9 : 0,
    rp = rip ? rip.t * 30 : 0;
  const ext = Math.max(0, b.mouth) * 0.07 + b.lunge,
    sw = b.swT > 0 ? 1 - b.swT / 0.34 : -1,
    puff = b.puff,
    faceFx = ext !== 0 || sw >= 0 || puff !== 0;
  for (let i = 0; i < N; i++) {
    const p = pts[i],
      a = p.a;
    let r = hasW ? R * (1 - b.dentAt(a)) : R;
    r *= 1 + c2 * Math.cos(2 * a - a2) + 0.016 * Math.sin(3 * a + t * 1.6 + ph) + 0.011 * Math.sin(5 * a - t * 2.2 + ph * 2);
    if (rip) {
      const d = Math.abs(angDiff(a, rip.a));
      if (d < rf) r *= 1 + rk * Math.sin(d * 5 - rp) * (1 - d * 0.19);
    } // a wave runs round the body from the bite
    if (faceFx) {
      const da = angDiff(a, b.fa),
        d = da < 0 ? -da : da;
      if (ext !== 0 && d < 1.25) {
        const c = Math.cos(d * 1.2566);
        r *= 1 + ext * c * c;
      } // muzzle: pulls back, then shoots out
      if (sw >= 0) {
        const q = (d - 0.5 - sw * 2.4) / 0.6;
        if (q > -1 && q < 1) r *= 1 + 0.085 * (1 - sw * 0.6) * (1 - q * q);
      } // swallowed lump sliding to the back
      if (puff !== 0) {
        const q = (da - (puff > 0 ? 0.95 : -0.95)) / 0.5;
        if (q > -1 && q < 1) r *= 1 + 0.07 * Math.abs(puff) * (1 - q * q);
      } // chewing cheeks
    }
    p.tx = b.x + p.c * r;
    p.ty = b.y + p.s * r;
  }
}

function stepPoints(b, h) {
  const pts = b.pts,
    N = pts.length,
    R = Math.max(b.Rs, 8);
  const k = 560 * Math.sqrt(26 / R),
    c = 2 * 0.2 * Math.sqrt(k),
    kn = k * 0.85,
    vx = b.vx,
    vy = b.vy;
  for (let i = 0; i < N; i++) {
    const p = pts[i],
      pr = pts[i === 0 ? N - 1 : i - 1],
      pn = pts[i === N - 1 ? 0 : i + 1];
    const ex = p.x - p.tx,
      ey = p.y - p.ty;
    const lx = (pr.x - pr.tx + pn.x - pn.tx) * 0.5 - ex,
      ly = (pr.y - pr.ty + pn.y - pn.ty) * 0.5 - ey;
    p.ax = -k * ex - c * (p.vx - vx) + kn * lx;
    p.ay = -k * ey - c * (p.vy - vy) + kn * ly;
  }
  for (const pl of b.pulls) {
    // gum strand tugging the bitten edge outwards
    for (let i = 0; i < N; i++) {
      const p = pts[i],
        d = Math.abs(angDiff(p.a, pl.a));
      if (d > pl.w) continue;
      const q = 1 - (d / pl.w) * (d / pl.w),
        wgt = q * q * pl.k * k;
      p.ax += (pl.x - p.x) * wgt;
      p.ay += (pl.y - p.y) * wgt;
    }
  }
  const lim = R * 0.9;
  for (let i = 0; i < N; i++) {
    const p = pts[i];
    p.vx += p.ax * h;
    p.vy += p.ay * h;
    p.x += p.vx * h;
    p.y += p.vy * h;
    const ex = p.x - p.tx,
      ey = p.y - p.ty,
      e = Math.hypot(ex, ey);
    if (e > lim) {
      const s = lim / e;
      p.x = p.tx + ex * s;
      p.y = p.ty + ey * s;
    }
  }
  for (const ct of b.contacts) applyContact(b, ct);
  for (let i = 0; i < N; i++) {
    const p = pts[i];
    if (p.x < 0) {
      p.x = 0;
      if (p.vx < 0) p.vx *= -0.2;
    } else if (p.x > WORLD) {
      p.x = WORLD;
      if (p.vx > 0) p.vx *= -0.2;
    }
    if (p.y < 0) {
      p.y = 0;
      if (p.vy < 0) p.vy *= -0.2;
    } else if (p.y > WORLD) {
      p.y = WORLD;
      if (p.vy > 0) p.vy *= -0.2;
    }
  }
}

function applyContact(b, ct) {
  const pts = b.pts;
  if (ct.plane) {
    for (const p of pts) {
      const pr = (p.x - ct.px) * ct.nx + (p.y - ct.py) * ct.ny;
      if (pr <= 0) continue;
      p.x -= ct.nx * pr;
      p.y -= ct.ny * pr;
      const vn = (p.vx - b.vx) * ct.nx + (p.vy - b.vy) * ct.ny;
      if (vn > 0) {
        p.vx -= ct.nx * vn;
        p.vy -= ct.ny * vn;
      }
    }
    return;
  }
  for (const p of pts) {
    if ((p.x - b.x) * ct.nx + (p.y - b.y) * ct.ny <= 0) continue;
    const dx = p.x - ct.qx,
      dy = p.y - ct.qy,
      d = Math.hypot(dx, dy) || 1e-6;
    if (ct.inside ? d <= ct.rc : d >= ct.rc) continue;
    const s = ct.rc / d,
      rx = dx / d,
      ry = dy / d;
    p.x = ct.qx + dx * s;
    p.y = ct.qy + dy * s;
    const vr = (p.vx - b.vx) * rx + (p.vy - b.vy) * ry;
    if (ct.inside ? vr > 0 : vr < 0) {
      p.vx -= rx * vr;
      p.vy -= ry * vr;
    }
  }
}

// interface between two pressed bodies: flat for equals, curving into the bigger, softer one
function contactPair(A, B, nx, ny, overlap) {
  const big = A.Rs >= B.Rs ? A : B,
    small = big === A ? B : A,
    rL = big.Rs,
    rS = small.Rs;
  const sx = big === A ? nx : -nx,
    sy = big === A ? ny : -ny,
    rho = rL - overlap * (rL / (rL + rS));
  const px = big.x + sx * rho,
    py = big.y + sy * rho;
  if (rL - rS < rS * 0.12) {
    if (big.biteTgt !== small) big.contacts.push({ plane: true, px, py, nx: sx, ny: sy });
    if (small.biteTgt !== big) small.contacts.push({ plane: true, px, py, nx: -sx, ny: -sy });
  } else {
    const rc = (rS * rL) / (rL - rS),
      qx = px + sx * rc,
      qy = py + sy * rc;
    if (big.biteTgt !== small) big.contacts.push({ plane: false, qx, qy, rc, inside: false, nx: sx, ny: sy });
    if (small.biteTgt !== big) small.contacts.push({ plane: false, qx, qy, rc, inside: true, nx: -sx, ny: -sy });
  }
}

function collideAll(dt) {
  for (const b of blobs) b.contacts.length = 0;
  const n = blobs.length;
  for (let i = 0; i < n; i++) {
    const A = blobs[i];
    if (!A.alive) continue;
    for (let j = i + 1; j < n; j++) {
      const B = blobs[j];
      if (!B.alive) continue;
      let dx = B.x - A.x,
        dy = B.y - A.y;
      const rs = A.Rs + B.Rs;
      if (dx > rs || dx < -rs || dy > rs || dy < -rs) continue;
      let d = Math.hypot(dx, dy);
      if (d >= rs) continue;
      if (d < 1e-3) {
        dx = rand(-1, 1);
        dy = rand(-1, 1);
        d = Math.hypot(dx, dy) || 1;
      }
      const nx = dx / d,
        ny = dy / d,
        overlap = rs - d,
        mt = A.mass + B.mass,
        wa = B.mass / mt,
        wb = A.mass / mt;
      const push = overlap * 3.5 * dt + Math.max(0, overlap - Math.min(A.Rs, B.Rs) * 0.34) * (1 - Math.exp(-dt * 55));
      A.x -= nx * push * wa;
      A.y -= ny * push * wa;
      B.x += nx * push * wb;
      B.y += ny * push * wb;
      const rv = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
      if (rv < 0) {
        const j2 = rv * (1 - Math.exp(-dt * 42));
        A.vx += nx * j2 * wa;
        A.vy += ny * j2 * wa;
        B.vx -= nx * j2 * wb;
        B.vy -= ny * j2 * wb;
      }
      if (rv < -150 && A.biteTgt !== B && B.biteTgt !== A) {
        // a real bump: both bodies squash against each other, the lighter one more
        const amt = Math.min(2.4, -rv / 300) * 1.7,
          na = Math.atan2(ny, nx);
        if (time - A.bumpAt > 0.3) {
          A.bumpAt = time;
          jolt(A, na, -amt * wa);
        }
        if (time - B.bumpAt > 0.3) {
          B.bumpAt = time;
          jolt(B, na, -amt * wb);
        }
        if ((A.isPlayer || B.isPlayer) && rv < -260) Sfx.boing(Math.min(1, -rv / 700));
      }
      const ov = rs - Math.hypot(B.x - A.x, B.y - A.y);
      if (ov > 0) contactPair(A, B, nx, ny, ov);
    }
  }
}

function kickPoints(b, ang, width, speed) {
  for (const p of b.pts) {
    const d = Math.abs(angDiff(p.a, ang));
    if (d > width) continue;
    const w = 1 - d / width;
    p.vx += p.c * speed * w;
    p.vy += p.s * speed * w;
  }
}
function jolt(b, ang, v) {
  // set the whole body wobbling like jelly: squashed (v < 0) or stretched (v > 0) along ang, then it rings down
  if (b.sq > -0.03 && b.sq < 0.03) b.sqA = ang;
  else v *= Math.cos(2 * angDiff(ang, b.sqA)); // already wobbling: push that wobble instead of restarting it
  b.sqV = clamp(b.sqV + v, -4.5, 4.5);
}
function gulpKick(b, m, s) {
  const amt = 150 * s * clamp((m / Math.max(1, b.mass)) * 4, 0.12, 1);
  for (const p of b.pts) {
    const f = 0.6 + 0.4 * Math.cos(p.a - b.face);
    p.vx += p.c * amt * f;
    p.vy += p.s * amt * f;
  }
}
