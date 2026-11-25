// ---------- food, crumbs, particles ----------
function addSprinkle() {
  const a = rand(TAU),
    len = rand(3, 5.5);
  food.push({ kind: 0, x: rand(30, WORLD - 30), y: rand(30, WORLD - 30), m: 1, c: randi(SPRINKLES.length), ai: randi(8), sz: len * 1.86 });
  sprinkleCount++;
}
function spawnCrumbs(x, y, mass, pal, nx, ny, owner) {
  if (mass <= 0.2 || crumbCount > 320) return;
  const n = clamp(Math.round(mass / 1.4), 1, 7),
    each = mass / n,
    dir = nx || ny,
    base = dir ? Math.atan2(ny, nx) : 0,
    spread = dir ? 1.4 : Math.PI;
  for (let i = 0; i < n; i++) {
    const a = base + rand(-spread, spread),
      sp = rand(70, 240);
    food.push({
      kind: 1,
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      m: each,
      r: clamp(2.2 * Math.sqrt(each) + 1.5, 2.5, 9),
      pal,
      delay: 0.25,
      age: 0,
      owner: owner || null,
    });
    crumbCount++;
  }
}
function removeFood(i) {
  if (food[i].kind) crumbCount--;
  else sprinkleCount--;
  food[i] = food[food.length - 1];
  food.pop();
}
function grant(b, type, px, py) {
  // px, py: where the bonus lay (the player's streak kicks the camera toward it and remembers it as the last spot)
  const d = PICK[type][1];
  if (type === 'speed') b.pSpeed = d;
  else if (type === 'shield') b.pShield = d;
  else b.pMagnet = d;
  parts.push({ ring: true, x: b.x, y: b.y, vx: 0, vy: 0, r: b.Rs, t: 0, T: 0.4, c: PICK[type][2] });
  if (b.isPlayer) {
    const inStreak = b.comboT > 0; // the pickup steps a live streak: its stamp does the talking, the HUD coin names the bonus
    if (!inStreak) floatText(b.x, b.y - b.Rs - 30 / cam.z, PICK[type][0] + '!', PICK[type][2], 24);
    Sfx.power();
    haptic(12);
    mission('pickup', 1);
    // a bonus builds the streak like a bite, but pays no sugar and is never «На волоске!»
    b.combo = inStreak ? (b.combo || 0) + 1 : 1;
    b.comboT = STREAK.win;
    mission('combo', b.combo, true);
    onStreakBite(b, b, px === undefined ? b.x : px, py === undefined ? b.y : py, 0, false);
    hudT = 0;
  }
}
function updatePickups(dt) {
  pickT -= dt;
  if (pickT <= 0) {
    pickT = day === 'magnet' ? rand(2.5, 4.5) : rand(5, 9);
    if (pickups.length < 6)
      pickups.push({
        type: day === 'magnet' ? 'magnet' : ['speed', 'shield', 'magnet'][randi(3)],
        x: rand(220, WORLD - 220),
        y: rand(220, WORLD - 220),
        t: 0,
      });
  }
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.t += dt;
    if (p.t > 45) {
      pickups.splice(i, 1);
      continue;
    }
    for (const b of blobs) {
      if (!b.alive || b.kind === 'cake') continue;
      const dx = p.x - b.x,
        dy = p.y - b.y,
        r = b.Rs * 0.9 + 18;
      if (dx * dx + dy * dy < r * r) {
        grant(b, p.type, p.x, p.y);
        pickups.splice(i, 1);
        break;
      }
    }
  }
}
function updateFood(dt) {
  for (let i = food.length - 1; i >= 0; i--) {
    const f = food[i];
    if (f.kind) {
      f.age += dt;
      f.delay -= dt;
      if (f.vx || f.vy) {
        f.x = clamp(f.x + f.vx * dt, 4, WORLD - 4);
        f.y = clamp(f.y + f.vy * dt, 4, WORLD - 4);
        const k = Math.exp(-dt * 4.5);
        f.vx *= k;
        f.vy *= k;
        if (Math.abs(f.vx) + Math.abs(f.vy) < 3) f.vx = f.vy = 0;
      }
      if (f.age > 48) {
        removeFood(i);
        continue;
      }
      if (f.delay > 0) continue;
    }
    for (const b of blobs) {
      if (!b.alive || (f.owner === b && f.age < 1.5)) continue;
      const mag = (b.isPlayer && CHEAT.magnet) || b.pMagnet > 0,
        reach = b.Rs * 1.5 + (mag ? 320 : 18),
        dx = f.x - b.x,
        dy = f.y - b.y;
      if (dx > reach || dx < -reach || dy > reach || dy < -reach) continue;
      const d2 = dx * dx + dy * dy,
        er = b.Rs * 0.88 + 2;
      if (d2 < er * er) {
        b.mass += day === 'double' && !f.kind ? f.m * 2 : f.m;
        if (b.isPlayer) {
          Sfx.pop();
          if (!f.kind) mission('food', 1);
        }
        removeFood(i);
        break;
      }
      if (d2 < reach * reach) {
        const fx = Math.cos(b.fa),
          fy = Math.sin(b.fa);
        if (mag || dx * fx + dy * fy > 0) {
          // sucked toward the open mouth on the rim: a bit off to the side swings round in front of the lips first
          const md = b.Rs * (0.7 + 0.5 * clamp(Math.abs(dy * fx - dx * fy) / b.Rs - 0.3, 0, 1)),
            mx = b.x + fx * md,
            my = b.y + fy * md,
            vx = mx - f.x,
            vy = my - f.y,
            vl = Math.hypot(vx, vy) || 1,
            s = Math.min(vl, (mag ? 700 : 200 + 420 * Math.max(0, 1 - vl / (reach + b.Rs))) * dt);
          f.x += (vx / vl) * s;
          f.y += (vy / vl) * s;
          b.snackT = 0.18;
          break;
        }
      }
    }
  }
  for (let k = 0, need = FOOD_TARGET - sprinkleCount; k < need && k < 10; k++) addSprinkle();
}
function spawnDust(x, y, pal, nx, ny, n) {
  const dir = nx || ny,
    base = dir ? Math.atan2(ny, nx) : 0,
    spread = dir ? 1.5 : Math.PI;
  for (let i = 0; i < n; i++) {
    const a = base + rand(-spread, spread),
      sp = rand(60, 300);
    parts.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      r: rand(1.4, 4),
      t: 0,
      T: rand(0.3, 0.65),
      c: Math.random() < 0.55 ? flesh(pal, 1) : pal.base,
    });
  }
}
function floatText(x, y, s, color, size) {
  texts.push({ x, y, s, color, size, t: 0, T: 1 });
}
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += dt;
    if (p.t >= p.T) {
      parts[i] = parts[parts.length - 1];
      parts.pop();
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const k = Math.exp(-dt * 5);
    p.vx *= k;
    p.vy *= k;
  }
  for (let i = texts.length - 1; i >= 0; i--) {
    texts[i].t += dt;
    if (texts[i].t >= texts[i].T) texts.splice(i, 1);
  }
}
function hearVol(x, y) {
  const cx = player && player.alive ? player.x : cam.x,
    cy = player && player.alive ? player.y : cam.y;
  return clamp(1 - Math.hypot(x - cx, y - cy) / ((Math.max(W, H) / cam.z) * 0.6), 0, 1);
}
