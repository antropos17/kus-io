// ---------- bites ----------
class Strand {
  // the gum string between a bitten body and the torn piece
  constructor(src, ang, chunk, pw) {
    this.src = src;
    this.ang = ang;
    this.chunk = chunk;
    this.pw = pw;
    this.N = 9;
    this.p = [];
    const [ax, ay] = this.anchor();
    for (let i = 0; i < this.N; i++) {
      const t = i / (this.N - 1),
        x = lerp(ax, chunk.x, t),
        y = lerp(ay, chunk.y, t);
      this.p.push({ x, y, ox: x, oy: y });
    }
    const L0 = Math.max(Math.hypot(chunk.x - ax, chunk.y - ay), chunk.r * 0.45);
    this.seg = L0 / (this.N - 1);
    this.w0 = chunk.r * 0.9;
    this.w = this.w0;
    this.wMax = chunk.r * 1.15;
    this.vol = this.w0 * this.w0 * L0;
    this.t = 0;
    this.broken = false;
    this.cut = -1;
    this.bt = 0;
    this.dead = false;
    this.maxT = 0.5 + rand(0.2);
  }
  anchor() {
    const s = this.src,
      r = s.Rs * (1 - s.dentAt(this.ang) * 0.8);
    return [s.x + Math.cos(this.ang) * r, s.y + Math.sin(this.ang) * r];
  }
  update(dt) {
    if (this.dead) return;
    this.t += dt;
    const P = this.p,
      last = this.N - 1;
    for (const q of P) {
      const vx = (q.x - q.ox) * 0.84,
        vy = (q.y - q.oy) * 0.84;
      q.ox = q.x;
      q.oy = q.y;
      q.x += vx;
      q.y += vy;
    }
    const [ax, ay] = this.anchor(),
      pinC = !this.chunk.dead;
    for (let it = 0; it < 6; it++) {
      P[0].x = ax;
      P[0].y = ay;
      if (pinC) {
        P[last].x = this.chunk.x;
        P[last].y = this.chunk.y;
      }
      for (let i = 0; i < last; i++) {
        if (this.broken && i === this.cut) continue;
        const a = P[i],
          b = P[i + 1],
          dx = b.x - a.x,
          dy = b.y - a.y,
          d = Math.hypot(dx, dy) || 1e-6,
          diff = (d - this.seg) / d;
        const fa = i === 0,
          fb = i + 1 === last && pinC;
        if (fa && fb) continue;
        if (fa) {
          b.x -= dx * diff;
          b.y -= dy * diff;
        } else if (fb) {
          a.x += dx * diff;
          a.y += dy * diff;
        } else {
          a.x += dx * diff * 0.5;
          a.y += dy * diff * 0.5;
          b.x -= dx * diff * 0.5;
          b.y -= dy * diff * 0.5;
        }
      }
    }
    P[0].x = ax;
    P[0].y = ay;
    if (pinC) {
      P[last].x = this.chunk.x;
      P[last].y = this.chunk.y;
    }
    if (!this.broken) {
      let total = 0;
      for (let i = 0; i < last; i++) total += Math.hypot(P[i + 1].x - P[i].x, P[i + 1].y - P[i].y);
      const per = total / last;
      this.seg += (per - this.seg) * (per > this.seg ? 0.6 : 0.12); // taffy yields instead of snapping at once
      this.w = Math.sqrt(this.vol / Math.max(total, 1)); // same volume, longer string = thinner
      if (this.w < this.w0 * 0.34 || this.t > this.maxT || this.chunk.state !== 'held' || this.chunk.dead || !this.src.alive) this.snap();
      else {
        this.src.pulls.push({ a: this.ang, w: this.pw, x: P[2].x, y: P[2].y, k: 1.3 });
        const o = this.chunk.owner,
          s = this.src,
          dx = this.chunk.x - ax,
          dy = this.chunk.y - ay,
          d = Math.hypot(dx, dy) || 1,
          mt = o.mass + s.mass,
          f = (420 * dt * (s.isPlayer ? 0.5 : 1)) / d;
        s.vx += dx * f * (o.mass / mt);
        s.vy += dy * f * (o.mass / mt);
        o.vx -= dx * f * (s.mass / mt);
        o.vy -= dy * f * (s.mass / mt);
      }
    } else {
      this.bt += dt;
      this.seg *= Math.exp(-dt * 18);
      if (this.bt > 0.3) this.dead = true;
    }
  }
  snap() {
    if (this.broken) return;
    this.broken = true;
    this.bt = 0;
    this.cut = clamp(Math.floor(this.N / 2 + rand(-1.5, 1.5)), 1, this.N - 3);
    const c = this.p[this.cut];
    spawnDust(c.x, c.y, this.src.pal, 0, 0, 3);
    if (this.src.alive) {
      kickPoints(this.src, this.ang, this.pw, -90);
      jolt(this.src, this.ang, 1.1);
    }
    const o = this.chunk.owner;
    if (o.alive) {
      jolt(o, o.face, 1.5);
      o.vx -= Math.cos(o.face) * 40;
      o.vy -= Math.sin(o.face) * 40;
    }
    if (this.chunk.owner.isPlayer || this.src.isPlayer) Sfx.at(c.x).snap(0.8);
  }
}

class Chunk {
  // the bitten-off piece: clenched in the teeth while it tears free, then chewed and swallowed
  constructor(owner, src, x, y, mass, r, ang, pw) {
    this.owner = owner;
    this.pal = src.pal;
    this.x = x;
    this.y = y;
    this.mass = mass;
    this.r = r;
    this.r0 = r;
    this.t = 0;
    this.st = 0;
    this.state = 'held';
    this.holdT = 0.32 + rand(0.1);
    this.chewT = 0.5;
    this.n = 0;
    this.rot = rand(TAU);
    this.seed = rand(1000);
    this.tornA = ang;
    this.dead = false;
    owner.chunk = this;
    this.strand = new Strand(src, ang, this, clamp(pw * 1.3, 0.12, 1.3));
  }
  finish() {
    // down the hatch
    if (this.dead) return;
    const o = this.owner;
    this.dead = true;
    if (o.chunk === this) o.chunk = null;
    if (o.alive) {
      o.mass += this.mass;
      o.swT = 0.34;
      gulpKick(o, this.mass, 0.3);
      jolt(o, o.face, -0.9);
      o.happyT = Math.max(o.happyT, 0.45);
      if (o.isPlayer) {
        Sfx.bloop(clamp(1.3 - o.Rs / 300, 0.7, 1.3) * (1 + Math.min(o.combo || 1, 6) * 0.04));
        bumpMass();
      } else if (Math.random() < 0.25) o.lickT = 0.7;
    }
  }
  update(dt) {
    if (this.dead) return;
    const o = this.owner;
    this.t += dt;
    if (!o.alive) {
      spawnCrumbs(this.x, this.y, this.mass, this.pal, 0, 0);
      this.dead = true;
      return;
    }
    const g = mouthGeo(o),
      held = this.state === 'held',
      d = g.xc + g.H * 0.5 + (held ? Math.min(this.r0 * 0.3, g.R * 0.12) : 0),
      cf = Math.cos(g.f),
      sf = Math.sin(g.f);
    const mx = o.x + cf * d,
      my = o.y + sf * d,
      k = 1 - Math.exp(-dt * (held ? 20 : 30));
    this.x += (mx - this.x) * k;
    this.y += (my - this.y) * k;
    if (held) {
      const sp = this.strand.p[this.strand.N - 2];
      this.tornA = Math.atan2(sp.y - this.y, sp.x - this.x);
      if (this.t > this.holdT) this.state = 'chew';
    } else {
      this.st += dt;
      const n = Math.floor((this.st * 18.85) / Math.PI); // one chomp each time the jaws meet
      if (n > this.n) {
        this.n = n;
        this.r = this.r0 * Math.max(0.12, 1 - 0.3 * n);
        this.rot += 1.3;
        spawnDust(mx, my, this.pal, cf, sf, 3);
        if (o.isPlayer) Sfx.munch();
      }
      if (this.st >= this.chewT) this.finish();
    }
  }
}

class Gulp {
  // a whole body slurped into a mouth
  constructor(A, B, gain) {
    this.A = A;
    this.pal = B.pal;
    this.gain = gain;
    this.t = 0;
    this.T = 0.36 + Math.min(0.3, B.Rs / 500);
    this.x0 = B.x;
    this.y0 = B.y;
    this.R = B.Rs;
    this.cx = B.x;
    this.cy = B.y;
    this.dead = false;
    this.rel = B.pts.map((p) => [p.x - B.x, p.y - B.y]);
  }
  update(dt) {
    if (this.dead) return;
    this.t += dt;
    if (!this.A.alive) {
      spawnCrumbs(this.cx, this.cy, this.gain * Math.max(0.2, 1 - this.t / this.T), this.pal, 0, 0);
      this.dead = true;
      return;
    }
    if (this.t >= this.T) {
      this.A.mass += this.gain;
      gulpKick(this.A, this.gain, 0.8);
      jolt(this.A, this.A.face, 2.6);
      if (this.A.isPlayer) bumpMass();
      this.A.swT = 0.34;
      this.A.lickT = 0.7;
      this.dead = true;
    }
  }
}

function biteScan(b) {
  // the closest body in front of the mouth
  const fx = Math.cos(b.face),
    fy = Math.sin(b.face),
    mx = b.x + fx * b.Rs * 0.8,
    my = b.y + fy * b.Rs * 0.8,
    mR = b.Rs * 0.55;
  let tgt = null,
    gap = 1e9,
    ang = 0;
  for (const o of blobs) {
    if (o === b || !o.alive || o.spawnT > 0 || o.dodgeT > 0 || o.safe || (b.ai && o.isPlayer && CHEAT.peace)) continue;
    if ((o.boss && !b.isPlayer) || (b.boss && !o.isPlayer)) continue; // the big cake is the player's fight alone, and it bites only the player
    if (b.ai && b.ai.raid && o.kind === 'piranha') continue; // a raiding pack crowds round the player and must not eat itself
    const dx = mx - o.x,
      dy = my - o.y,
      lim = o.Rs + mR + 60 + b.Rs * 0.6;
    if (dx > lim || dx < -lim || dy > lim || dy < -lim) continue;
    const a = Math.atan2(dy, dx),
      gp = Math.hypot(dx, dy) - o.radiusAt(a);
    if (gp < gap) {
      gap = gp;
      tgt = o;
      ang = a;
    }
  }
  return [tgt, gap, ang, mR];
}
function checkBites(b, dt) {
  // a bite is a little sequence: wind-up, snap, clench, tear, chew, swallow
  const [tgt, gap, ang, mR] = biteScan(b),
    B = b.bite,
    c = b.chunk && !b.chunk.dead ? b.chunk : null;
  b.puff = 0;
  b.lungeWant = 0;
  if (B) {
    B.t += dt;
    b.mouthWant = 1.2;
    if (B.ph === 0) {
      // wind-up: jaws fly open, the muzzle pulls back
      b.lungeWant = -0.2;
      if (B.t >= B.T) {
        B.ph = 1;
        B.t = 0;
        kickPoints(b, b.face, 1.1, b.Rs * 4.5);
        jolt(b, b.face, 1.3);
      }
    } else {
      // snap: the muzzle shoots over the prey and the jaws slam
      b.lungeWant = 0.3;
      if (B.t >= 0.065) {
        b.bite = null;
        b.btT = 0.16;
        if (tgt && gap < mR * 0.7 + b.Rs * 0.3 + 10) {
          b.biteTgt = tgt;
          doBite(b, tgt, ang, B.dash);
        } else {
          // teeth clack on thin air
          b.biteTgt = null;
          b.biteCd = 0.3;
          b.clackT = 0.2;
          b.mouthV = -34;
          const [x, y] = b.contourAt(b.face);
          for (let i = 0; i < 4; i++) parts.push({ x, y, vx: rand(-110, 110), vy: rand(-110, 110), r: rand(1.5, 3), t: 0, T: 0.25, c: '#fffaf2' });
          if (b.isPlayer) Sfx.snap(0.6);
        }
      }
    }
    return;
  }
  if (b.gulpT > 0 || b.tongue) b.mouthWant = 1.1;
  else if (c && c.state === 'held') {
    b.mouthWant = 0.5;
    b.lungeWant = -0.06;
  } // clenched on the piece
  else if (c) {
    const ph = c.st * 18.85;
    b.mouthWant = 0.1 + 0.55 * Math.abs(Math.sin(ph));
    b.puff = Math.sin(ph) * 0.8;
  } // chomp, chomp, chomp
  else if (b.chewT > 0) {
    b.mouthWant = 0;
    b.puff = Math.sin(time * 20);
  } else if (b.clackT > 0) b.mouthWant = 0;
  else if (b.dashT > 0) b.mouthWant = 0.9;
  else if (tgt && (b.spawnT <= 0 || tgt.tame) && b.biteCd < 0.25 && gap < mR * 0.7 + 30 + b.Rs * 0.6)
    b.mouthWant = 0.62 + 0.07 * Math.sin(time * 24 + b.phase); // jaws tremble with hunger
  else b.mouthWant = b.snackT > 0 ? 0.4 : 0;
  // the first run's snack can be bitten even while the newcomer is still shielded after spawning, and never bites back
  if (tgt && b.biteCd <= 0 && (b.spawnT <= 0 || tgt.tame) && !b.tame && gap < mR * 0.7) {
    if (c) c.finish();
    b.bite = { ph: 0, t: 0, T: b.dashT > 0 ? 0.045 : 0.1, dash: b.dashT > 0 };
    b.biteTgt = tgt;
    b.btT = 0.3;
  }
}

function bounceBite(A, B, ang, shield) {
  // teeth meet a shield or a hedgehog's spines
  if (A.chunk) A.chunk.finish();
  const nx = Math.cos(ang),
    ny = Math.sin(ang),
    x = B.x + nx * B.Rs,
    y = B.y + ny * B.Rs;
  A.biteCd = 0.7;
  A.mouthV = -34;
  A.clackT = 0.2;
  A.vx += nx * 320;
  A.vy += ny * 320;
  for (let i = 0; i < 6; i++)
    parts.push({
      x,
      y,
      vx: nx * rand(40, 200) + rand(-120, 120),
      vy: ny * rand(40, 200) + rand(-120, 120),
      r: rand(1.5, 3.5),
      t: 0,
      T: 0.3,
      c: shield ? '#bfe9ff' : '#fffaf2',
    });
  if (shield) {
    if (A.isPlayer) {
      floatText(x, y - 30 / cam.z, 'щит', '#7ad7ff', 20);
      Sfx.snap(0.7);
    } else if (B.isPlayer) floatText(B.x, B.y - B.Rs - 26 / cam.z, 'щит спас', '#7ad7ff', 20);
    return;
  }
  A.hurtT = 0.5;
  const m = Math.min(A.mass * 0.06 + 1, A.mass - MIN_MASS - 3);
  if (m > 0 && !(A.isPlayer && CHEAT.god)) {
    A.mass -= m;
    spawnCrumbs(A.x + nx * A.Rs * 0.3, A.y + ny * A.Rs * 0.3, m * 0.8, A.pal, nx, ny, A);
  }
  if (A.isPlayer) {
    floatText(A.x, A.y - A.Rs - 26 / cam.z, 'ай, колючки!', '#ff7a9c', 22);
    Sfx.hurt();
    haptic(30);
    flashT = 0.2;
  }
}
function doBite(A, B, ang, dashBite) {
  if (B.pShield > 0 || (B.kind === 'hedgehog' && Math.abs(angDiff(ang, B.face)) > 0.95)) {
    bounceBite(A, B, ang, B.pShield > 0);
    return;
  }
  let bite = biteOf(A.mass, dashBite),
    intoWound = false,
    weak = false;
  if (A.chunk) A.chunk.finish();
  if (B.kind === 'cake') {
    weak = Math.abs(angDiff(ang, B.face + Math.PI)) < 0.55;
    bite *= weak ? 2 : B.boss ? B.boss.crust : 0.4;
    if (weak && B.boss) B.spinT = BOSS.spinT;
  } // thick crust everywhere but the cherry
  for (const w of B.wounds)
    if (w.d * w.heal > 0.08 && Math.abs(angDiff(ang, w.a)) < w.w * 1.1) {
      intoWound = true;
      break;
    }
  if (intoWound) bite *= 1.3;
  A.biteCd = A.boss ? BOSS.biteCd : 0.27 + Math.min(0.3, A.Rs / 1000);
  if (A.boss) bite *= BOSS.bite; // its bite is slow and lighter than its size, a warning more than a kill
  A.chewT = 0;
  A.mouthV = -34;
  A.stats.bites++;
  if (B.ai) B.ai.think = Math.min(B.ai.think, 0.06);
  if (A.isPlayer && CHEAT.mega) {
    bite *= 3;
    if (B.mass < A.mass) bite = B.mass;
  }
  if (B.isPlayer && CHEAT.god) {
    // cosmetic bite only
    B.hurtT = 0.35;
    B.addWound(ang, massToR(bite) * 0.6);
    kickPoints(B, ang, 0.5, -160);
    const nx = Math.cos(ang),
      ny = Math.sin(ang);
    A.vx += nx * 160;
    A.vy += ny * 160;
    floatText(B.x, B.y - B.Rs, 'бессмертие', '#ffd23f', 16);
    return;
  }
  let saved = false;
  if (B.isPlayer && DIFFS[diff].grace && lethalFor(B.mass, bite) && B.graceT <= 0 && B.mass > MIN_MASS + 6) {
    bite = B.mass * 0.5;
    saved = true;
    B.graceT = DIFFS[diff].grace;
  }
  if (!saved && lethalFor(B.mass, bite)) {
    swallowWhole(A, B);
    return;
  }
  B.mass -= bite;
  if (saved) {
    const nx = Math.cos(ang),
      ny = Math.sin(ang);
    B.vx -= nx * 520;
    B.vy -= ny * 520;
    A.biteCd = 1.1;
    floatText(B.x, B.y - B.Rs - 30 / cam.z, 'вырвался!', '#7cf08c', 22);
  }
  B.hurtT = 0.5;
  const chunkR = massToR(bite) * 0.9,
    wnd = B.addWound(ang, chunkR);
  const nx = Math.cos(ang),
    ny = Math.sin(ang),
    share = A.mass / (A.mass + B.mass);
  B.vx -= nx * 170 * share;
  B.vy -= ny * 170 * share; // victim is yanked
  A.vx += nx * 150 * (1 - share * 0.6);
  A.vy += ny * 150 * (1 - share * 0.6); // biter rips back
  kickPoints(B, ang, wnd.w * 1.5, -230 * clamp((chunkR / B.Rs) * 2, 0.25, 1));
  const rel = clamp(chunkR / B.Rs, 0.08, 0.4); // how big the bite is next to the body it came from
  jolt(B, ang, -7 * rel);
  B.rip = { a: ang, t: 0, amp: clamp(rel * 0.3, 0.025, 0.085) };
  jolt(A, A.face, -2.4);
  A.glintT = 0.2;
  const r0 = B.Rs * (1 - B.dentAt(ang) * 0.6),
    bx = B.x + nx * r0,
    by = B.y + ny * r0;
  let gain = bite * 0.84;
  const king = B === leader && A !== leader;
  if (king) gain *= 1.25; // a bite off the leader is worth more
  if (A.isPlayer) {
    // bites landed in quick succession pay a little extra each time
    A.combo = A.comboT > 0 ? (A.combo || 0) + 1 : 1;
    A.comboT = 2.6;
    gain *= 1 + Math.min(A.combo - 1, 5) * 0.08;
    mission('combo', A.combo, true);
  }
  const ch = new Chunk(A, B, bx, by, gain, chunkR, ang, wnd.w);
  chunks.push(ch);
  strands.push(ch.strand);
  spawnCrumbs(bx, by, bite - gain, B.pal, nx, ny);
  spawnDust(bx, by, B.pal, nx, ny, 6 + Math.min(10, chunkR / 3));
  parts.push({ ring: true, x: bx, y: by, vx: 0, vy: 0, r: chunkR * 0.8, t: 0, T: 0.26, c: '#fff1dc' });
  parts.push({ burst: true, x: bx, y: by, vx: 0, vy: 0, a: ang, r: chunkR, t: 0, T: 0.2, c: '#ffffff' });
  kickPoints(A, A.face, 1.1, -A.Rs * 2);
  const big = dashBite || intoWound || weak || king;
  if (big) A.wowT = 0.7;
  if (A.isPlayer) {
    const step = Math.min(A.combo, 6);
    if (!lod) {
      spawnDust(bx, by, B.pal, nx, ny, 3 + step);
      for (let i = 0; i < 2 + (big ? 2 : 0); i++) {
        const a = ang + rand(-0.9, 0.9),
          sp = rand(160, 380);
        parts.push({
          x: bx,
          y: by,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          r: rand(4, 6.5) * clamp(chunkR / 16, 0.7, 1.8),
          t: 0,
          T: rand(0.4, 0.6),
          c: flesh(B.pal, 1),
        });
      }
    } // fat gobs of filling
    cam.zv += big ? 1.3 : 0.8;
    cam.sa = ang; // the camera leans in on every bite and is tugged the way the piece tears
    const ty = Math.min(by, A.y) - A.Rs * 0.9 - 26 / cam.z; // above the action, clear of the mouth
    floatText(
      bx,
      ty,
      '+' + Math.max(1, Math.round(gain)),
      ['#ffd23f', '#ffc53f', '#ffb347', '#ff9a52', '#ff8370', '#ff6fa0'][step - 1],
      24 + Math.min(10, gain * 0.07) + (step - 1) * 2,
    );
    if (intoWound) floatText(bx, ty - 28 / cam.z, 'в ранку!', '#ff8fb0', 18);
    if (weak) floatText(bx, ty - 28 / cam.z, 'слабое место!', '#ff8fb0', 18);
    else if (king) floatText(bx, ty - 28 / cam.z, 'кусь лидера!', '#ffd23f', 18);
    else if (A.combo > 1 && !intoWound) floatText(bx, ty - 28 / cam.z, 'серия ×' + A.combo, '#9be15d', 18);
    mission('bites', 1);
    if (intoWound) mission('wound', 1);
    if (weak) mission('cake', 1);
    if (B.kind === 'hedgehog') mission('hedge', 1);
    haptic(big ? 22 : 12);
    Sfx.stretch(ch.holdT, clamp(1.3 - chunkR / 60, 0.7, 1.3));
    Sfx.chomp(1, clamp(1.25 - A.Rs / 400, 0.6, 1.25) * (1 + (step - 1) * 0.045));
    if (step > 1) Sfx.ding(step);
    cam.shake = Math.max(cam.shake, 3 + Math.min(6, chunkR * 0.12) + (big ? 2 : 0));
  } else if (B.isPlayer) {
    floatText(B.x, B.y - B.Rs - 26 / cam.z, '−' + Math.round(bite), '#ff7a9c', 22);
    haptic(35);
    Sfx.hurt();
    flashT = 0.32;
    cam.shake = Math.max(cam.shake, 6 + Math.min(10, chunkR * 0.2));
    cam.sa = ang + Math.PI;
  } else if (state === 'play') {
    const v = hearVol(bx, by) * 0.45;
    if (v > 0.04) Sfx.at(bx).chomp(v, clamp(1.2 - A.Rs / 400, 0.6, 1.2));
  }
}

function swallowWhole(A, B) {
  B.alive = false;
  const gain = B.mass * 0.9;
  if (A.chunk) A.chunk.finish();
  const gp = new Gulp(A, B, gain);
  gulps.push(gp);
  A.gulpT = gp.T;
  A.chewT = 0;
  A.mouthV = 10;
  spawnCrumbs(B.x, B.y, B.mass * 0.1, B.pal, Math.cos(A.face), Math.sin(A.face));
  spawnDust(B.x, B.y, B.pal, 0, 0, 14);
  A.stats.kills++;
  A.happyT = 1.3;
  A.wowT = 0.5;
  parts.push({ ring: true, x: B.x, y: B.y, vx: 0, vy: 0, r: B.Rs * 0.9, t: 0, T: 0.4, c: '#fff1dc' });
  feedKill(A, B);
  if (B.boss) bossDown(A);
  if (A.isPlayer) {
    mission('kills', 1);
    albumEat(B);
    if (B.kind === 'piranha') mission('piranha', 1);
    floatText(A.x, A.y - A.Rs - 30 / cam.z, 'ням! +' + Math.round(gain), '#ffd23f', 28);
    Sfx.gulp(1);
    cam.shake = Math.max(cam.shake, 7);
    if (!calm && !B.boss) {
      slowT = slowLen = 0.4;
      slowDip = 0.32;
      cam.zv += 1.9;
    }
  } else if (B.isPlayer) {
    Sfx.gulp(1);
    Sfx.hurt();
    flashT = 0.5;
    cam.shake = 12;
    die(A);
  } else if (state === 'play') {
    const v = hearVol(B.x, B.y) * 0.5;
    if (v > 0.04) Sfx.at(B.x).gulp(v);
  }
}

function dash(b) {
  if (b.dashCd > 0) return;
  for (const o of blobs) if (o.tongue && o.tongue.target === b && o.tongue.state === 'stuck') o.tongue.state = 'back'; // a lunge rips the tongue off
  b.dashCd = b.isPlayer ? 1.5 : DASH_CD;
  b.dashT = 0.3;
  const sp = b.maxSpeed() * 2.6,
    fx = Math.cos(b.face),
    fy = Math.sin(b.face);
  b.vx = fx * sp;
  b.vy = fy * sp;
  b.biteCd = Math.min(b.biteCd, 0.05);
  b.mouthV = 12;
  jolt(b, b.face, 2.2);
  for (let i = 0; i < 6; i++)
    parts.push({
      x: b.x - fx * b.Rs,
      y: b.y - fy * b.Rs,
      vx: -fx * rand(60, 170) + rand(-50, 50),
      vy: -fy * rand(60, 170) + rand(-50, 50),
      r: rand(2, 4.5),
      t: 0,
      T: rand(0.3, 0.5),
      c: b.pal.light,
    });
  if (b.isPlayer) Sfx.dash();
}

function tongueOrigin(b) {
  const g = mouthGeo(b),
    d = g.xc + g.H * 0.6;
  return [b.x + Math.cos(g.f) * d, b.y + Math.sin(g.f) * d];
} // from inside the mouth
function fireTongue(b) {
  // chameleon tongue: shoots out, sticks, reels the catch in
  if (b.dodgeCd > 0 || b.tongue || (b.spawnT > 0 && !b.isPlayer)) return;
  const ang = b.isPlayer && Math.hypot(b.tx - b.x, b.ty - b.y) > 2 ? Math.atan2(b.ty - b.y, b.tx - b.x) : b.face;
  b.face = angDiff(b.face + clamp(angDiff(ang, b.face), -0.5, 0.5), 0);
  b.tongue = {
    state: 'out',
    ang,
    len: 0,
    max: Math.min(170 + b.Rs * 1.3, 460) * (b.isPlayer && CHEAT.mega ? 1.7 : 1),
    t: 0,
    target: null,
    ta: 0,
    tx: b.x,
    ty: b.y,
  };
  b.mouthV = 14;
  if (b.isPlayer) Sfx.thwip();
}
function updateTongue(b, dt) {
  const T = b.tongue,
    [ox, oy] = tongueOrigin(b);
  T.t += dt;
  if (T.state === 'out') {
    T.len = Math.min(T.max, T.len + 1900 * dt);
    T.tx = ox + Math.cos(T.ang) * T.len;
    T.ty = oy + Math.sin(T.ang) * T.len;
    for (let i = food.length - 1; i >= 0; i--) {
      // sweet bits stick to the pad
      const f = food[i],
        dx = f.x - T.tx,
        dy = f.y - T.ty;
      if (dx * dx + dy * dy < 400 && !(f.kind && f.delay > 0)) {
        b.mass += f.m;
        removeFood(i);
        if (b.isPlayer) Sfx.pop();
      }
    }
    for (const o of blobs) {
      if (o === b || !o.alive || o.spawnT > 0 || o.safe || (b.ai && o.isPlayer && CHEAT.peace)) continue;
      const dx = T.tx - o.x,
        dy = T.ty - o.y,
        a = Math.atan2(dy, dx);
      if (Math.hypot(dx, dy) < o.radiusAt(a) + 4) {
        if (b.isPlayer) mission('tongue', 1);
        T.state = 'stuck';
        T.target = o;
        T.ta = a;
        T.st = 0;
        o.hurtT = Math.max(o.hurtT, 0.25);
        kickPoints(o, a, 0.45, -120);
        if (o.ai) o.ai.think = Math.min(o.ai.think, 0.05);
        if (b.isPlayer || o.isPlayer) Sfx.squelch();
        break;
      }
    }
    if (T.state === 'out' && T.len >= T.max) T.state = 'back';
  } else if (T.state === 'stuck') {
    const o = T.target;
    T.st += dt;
    if (!o.alive) {
      T.state = 'back';
    } else {
      const r = o.radiusAt(T.ta);
      T.tx = o.x + Math.cos(T.ta) * r;
      T.ty = o.y + Math.sin(T.ta) * r;
      let ux = ox - T.tx,
        uy = oy - T.ty;
      const L = Math.hypot(ux, uy) || 1;
      ux /= L;
      uy /= L;
      T.len = L;
      const tot = b.mass + o.mass,
        pv = 2600 * (b.mass / tot) * (o.isPlayer ? 0.5 : 1),
        pa = 2600 * (o.mass / tot) * 0.75; // the lighter one flies
      o.vx += ux * pv * dt;
      o.vy += uy * pv * dt;
      b.vx -= ux * pa * dt;
      b.vy -= uy * pa * dt;
      o.pulls.push({ a: T.ta, w: 0.45, x: T.tx + ux * o.Rs * 0.35, y: T.ty + uy * o.Rs * 0.35, k: 0.6 }); // the suction cup stretches the skin
      const gap = Math.hypot(o.x - b.x, o.y - b.y) - o.Rs - b.Rs;
      if (gap < 4 || T.st > 0.75 || L > T.max * 1.5) T.state = 'back';
    }
  } else {
    T.len = Math.max(0, T.len - 2300 * dt);
    const a = Math.atan2(T.ty - oy, T.tx - ox);
    T.ang = a;
    T.tx = ox + Math.cos(a) * T.len;
    T.ty = oy + Math.sin(a) * T.len;
    if (T.len <= 0) {
      b.tongue = null;
      b.dodgeCd = 2.6 + b.Rs / 60;
    }
  }
}
