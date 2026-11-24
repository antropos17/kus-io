// ---------- bots ----------
function newAI() {
  return {
    aggro: rand(0.65, 1.35),
    fear: rand(0.75, 1.3),
    piranha: Math.random() < 0.4,
    react: rand(0.2, 0.38),
    think: rand(0.3),
    mode: 'food',
    prey: null,
    food: null,
    fx: 0,
    fy: 0,
    wx: rand(300, WORLD - 300),
    wy: rand(300, WORLD - 300),
    fleeDash: false,
  };
}
function botThink(b) {
  const ai = b.ai,
    myBite = biteOf(b.mass, false);
  if (b.tame) {
    ai.mode = 'tame';
    return;
  } // the first run's snack neither hunts nor runs
  if (ai.passive) {
    ai.mode = 'wander';
    if (Math.hypot(ai.wx - b.x, ai.wy - b.y) < 300) {
      ai.wx = rand(500, WORLD - 500);
      ai.wy = rand(500, WORLD - 500);
    }
    return;
  } // the cake just strolls
  if (ai.boss) {
    ai.mode = 'boss';
    return;
  } // the big cake only ever goes for the player
  let fx = 0,
    fy = 0,
    danger = 0,
    lethalNear = false,
    prey = null,
    preyS = 0;
  for (const o of blobs) {
    if (o === b || !o.alive) continue;
    const dx = o.x - b.x,
      dy = o.y - b.y;
    if (dx > 1000 || dx < -1000 || dy > 1000 || dy < -1000) continue;
    const cd = Math.hypot(dx, dy) || 1,
      sd = cd - o.Rs - b.Rs;
    if (sd > 640) continue;
    const ux = dx / cd,
      uy = dy / cd,
      facing = -(Math.cos(o.face) * ux + Math.sin(o.face) * uy);
    const bigger = o.mass > b.mass * 1.1,
      lethal = lethalFor(b.mass, biteOf(o.mass, false));
    if (bigger && o.spawnT <= 0) {
      const reach = 170 + o.Rs * 0.7 + (lethal ? 220 : 0);
      if (sd < reach) {
        const w = (1 - Math.max(0, sd) / reach) * (lethal ? 2.4 : 0.8) * ai.fear * (0.3 + 0.7 * clamp(facing + 0.35, 0, 1));
        fx -= ux * w;
        fy -= uy * w;
        if (w > danger) danger = w;
        if (lethal && sd < 70 && facing > 0.4) lethalNear = true;
      }
    }
    if (o.spawnT > 0 || (o.isPlayer && CHEAT.peace) || o.kind === 'hedgehog' || o.pShield > 0 || o.safe) continue; // nobody hunts spines or shields
    if (o.boss && !b.isPlayer) continue; // the big cake is the player's to beat
    if (b.kind === 'piranha' && (o.kind === 'piranha' || (o.isPlayer && o.mass < 90))) continue;
    const gain = lethalFor(o.mass, myBite) ? o.mass * 0.9 : myBite * 0.84;
    const risk = bigger ? clamp(facing + 0.2, 0, 1) * (lethal ? 1.6 : 0.6) : 0;
    let s = (gain / (Math.max(0, sd) + 70)) * ai.aggro * Math.max(0.03, 1 - risk);
    if (bigger && facing < -0.2) s *= ai.piranha ? 2.1 : 1.2; // nibble the back of a giant
    s *= 1 + Math.min(0.8, woundLoad(o) * 1.5);
    if (b.kind === 'piranha') s *= o.mass > b.mass * 3 ? 2.2 : 0.3; // the pack goes for big game
    if (ai.raid && o.isPlayer) s *= 3; // a stage's raid came for the player
    if (o.boss) s *= BOSS.lure; // the autopilot knows the cake is the goal, as a player does
    if (o.isPlayer) {
      if (ai.ignoreT > 0) continue;
      s *= (diff !== 'hard' && o.mass < 120 ? 0.4 : 0.85) * DIFFS[diff].hunt;
    }
    if (o === leader) s *= 1.25; // everyone wants a piece of the sweetest one
    if (s > preyS) {
      preyS = s;
      prey = o;
    }
  }
  const m = 200 + b.Rs;
  if (b.x < m) fx += (1 - b.x / m) * 1.2;
  else if (b.x > WORLD - m) fx -= (1 - (WORLD - b.x) / m) * 1.2;
  if (b.y < m) fy += (1 - b.y / m) * 1.2;
  else if (b.y > WORLD - m) fy -= (1 - (WORLD - b.y) / m) * 1.2;
  let fd = 1e12,
    ff = null;
  for (const f of food) {
    const dx = f.x - b.x,
      dy = f.y - b.y;
    if (dx > 520 || dx < -520 || dy > 520 || dy < -520) continue;
    const d = dx * dx + dy * dy - (f.kind ? 3000 * f.m : 0);
    if (d < fd) {
      fd = d;
      ff = f;
    }
  }
  for (const f of pickups) {
    const dx = f.x - b.x,
      dy = f.y - b.y;
    if (dx > 480 || dx < -480 || dy > 480 || dy < -480) continue;
    const d = dx * dx + dy * dy - 90000;
    if (d < fd) {
      fd = d;
      ff = f;
    }
  } // bonuses are worth a detour
  const foodS = ff ? 1 / (Math.sqrt(Math.max(0, fd)) + 70) : 0;
  if (danger > 0.3) {
    const l = Math.hypot(fx, fy) || 1;
    ai.mode = 'flee';
    ai.fx = fx / l;
    ai.fy = fy / l;
    ai.fleeDash = lethalNear && Math.random() < 0.6;
  } else if (prey && preyS > foodS * 0.9) {
    ai.mode = 'hunt';
    ai.prey = prey;
  } else if (ff) {
    ai.mode = 'food';
    ai.food = ff;
  } else {
    ai.mode = 'wander';
    if (Math.hypot(ai.wx - b.x, ai.wy - b.y) < 250) {
      ai.wx = rand(300, WORLD - 300);
      ai.wy = rand(300, WORLD - 300);
    }
  }
}
function botSteer(b, dt) {
  const ai = b.ai;
  ai.think -= dt;
  if (ai.mode !== 'hunt') ai.ignoreT = (ai.ignoreT || 0) - dt;
  if (ai.think <= 0) {
    ai.think = ai.react + rand(0.08);
    botThink(b);
  }
  if (b.tame) {
    // ambles in a small circle where it was put, slowly enough to be caught
    const a = time * 0.8 + b.phase;
    b.tx = b.hx + Math.cos(a) * 24;
    b.ty = b.hy + Math.sin(a) * 24;
    return;
  }
  if (ai.mode === 'boss') {
    // crawl after the player face first, so the cherry on the back stays away from them
    const P = player;
    if (P && P.alive && !P.safe && state === 'play') {
      const dx = P.x - b.x,
        dy = P.y - b.y,
        d = Math.hypot(dx, dy) || 1,
        near = d - P.Rs - b.Rs < 700; // close by it only creeps and turns, so the player can work round to its back
      const s = ai.away ? -0.25 : 0.25; // turning away creeps a little away too
      b.tx = near || ai.away ? b.x + (dx / d) * b.Rs * s : P.x;
      b.ty = near || ai.away ? b.y + (dy / d) * b.Rs * s : P.y;
    } else {
      b.tx = ai.wx;
      b.ty = ai.wy;
    }
    return;
  }
  if (b.kind === 'piranha' && ai.lead) {
    // stay with the pack and bite what the leader bites
    const L = ai.lead;
    if (!L.alive) ai.lead = null;
    else if (ai.mode !== 'flee') {
      if (L.ai.mode === 'hunt' && L.ai.prey && L.ai.prey.alive) {
        ai.mode = 'hunt';
        ai.prey = L.ai.prey;
      } else if (Math.hypot(L.x - b.x, L.y - b.y) > 230) {
        b.tx = L.x;
        b.ty = L.y;
        return;
      }
    }
  }
  if (ai.mode === 'flee') {
    b.tx = b.x + ai.fx * 400;
    b.ty = b.y + ai.fy * 400;
    if (ai.fleeDash && b.dashCd <= 0 && Math.cos(angDiff(Math.atan2(ai.fy, ai.fx), b.face)) > 0.8) {
      dash(b);
      ai.fleeDash = false;
    }
  } else if (ai.mode === 'hunt' && ai.prey && ai.prey.alive) {
    const o = ai.prey;
    ai.ignoreT = (ai.ignoreT || 0) - dt;
    if (o.isPlayer) {
      ai.chase = (ai.chase || 0) + dt;
      if (ai.chase > DIFFS[diff].chase) {
        ai.chase = 0;
        ai.ignoreT = 5;
        ai.think = 0;
      }
    } else ai.chase = 0; // bots get bored of chasing you
    let tx = o.x + o.vx * 0.25,
      ty = o.y + o.vy * 0.25;
    if (o.mass > b.mass * 1.1) {
      tx -= Math.cos(o.face) * o.Rs * 0.8;
      ty -= Math.sin(o.face) * o.Rs * 0.8;
    }
    b.tx = tx;
    b.ty = ty;
    const dx = tx - b.x,
      dy = ty - b.y,
      d = Math.hypot(dx, dy);
    if (
      b.dashCd <= 0 &&
      d - o.Rs * 0.5 - b.Rs < 120 + b.Rs * 0.4 &&
      Math.cos(angDiff(Math.atan2(dy, dx), b.face)) > 0.92 &&
      Math.random() < dt * 2 * ai.aggro
    )
      dash(b);
    else if (
      b.dodgeCd <= 0 &&
      !b.tongue &&
      d - o.Rs - b.Rs < Math.min(150 + b.Rs * 1.1, 420) &&
      o.mass > b.mass * 0.08 &&
      b.mass < 350 &&
      !(o.isPlayer && o.mass < 120 && diff !== 'hard') &&
      d - o.Rs - b.Rs > 40 &&
      Math.cos(angDiff(Math.atan2(dy, dx), b.face)) > 0.95 &&
      Math.random() < dt * 1.2 * ai.aggro
    )
      fireTongue(b);
  } else if (ai.mode === 'food' && ai.food) {
    b.tx = ai.food.x;
    b.ty = ai.food.y;
  } else {
    b.tx = ai.wx;
    b.ty = ai.wy;
  }
}
function randomBotMass(first) {
  const r = Math.random();
  if (day === 'small') return rand(12, 50);
  if (first) return r < 0.55 ? rand(12, 40) : r < 0.88 ? rand(40, 140) : r < 0.98 ? rand(140, 380) : rand(380, 600);
  return r < 0.7 ? rand(12, 45) : r < 0.95 ? rand(45, 150) : rand(150, 350);
}
function findSpawn(clear, avoidPlayer) {
  for (let t = 0; t < 50; t++) {
    const x = rand(250, WORLD - 250),
      y = rand(250, WORLD - 250);
    let ok = true;
    for (const o of blobs)
      if (o.alive && Math.hypot(o.x - x, o.y - y) < o.Rs + clear) {
        ok = false;
        break;
      }
    if (ok && avoidPlayer && player && player.alive && Math.hypot(player.x - x, player.y - y) < 650 + player.Rs) ok = false;
    if (ok) return [x, y];
  }
  return [rand(250, WORLD - 250), rand(250, WORLD - 250)];
}
function safeSpawn() {
  let bestXY = null,
    bestD = -1;
  for (let t = 0; t < 120; t++) {
    const x = rand(300, WORLD - 300),
      y = rand(300, WORLD - 300);
    let dmin = 1e9;
    for (const o of blobs) if (o.alive && o.mass > START_MASS) dmin = Math.min(dmin, Math.hypot(o.x - x, o.y - y) - o.Rs * (o.mass > 120 ? 3 : 1));
    if (dmin > bestD) {
      bestD = dmin;
      bestXY = [x, y];
    }
    if (dmin > 900) break;
  }
  return bestXY;
}
function spawnBot(mass) {
  const nm = pickBotName(mass); // each name keeps its own look, the album sticker shows the same candy
  const [x, y] = findSpawn(massToR(mass) + 220, true);
  const b = new Blob({
    name: nm[0],
    acc: nm[1],
    pal: PALS[nm[2]],
    mass,
    x,
    y,
    ai: newAI(),
    spawnT: 1.2,
    hat: nm[4],
    skin: nm[3],
  });
  blobs.push(b);
  return b;
}
function tutorPrey() {
  // the very first run: a candy small enough to swallow in one bite sits just in front of the new player's mouth
  const P = player,
    b = spawnBot(14),
    d = P.Rs + b.Rs + 85; // ambling 24 around this, it comes no closer than 61: the bite hint waits for the player to move in
  P.face = P.fa = 0; // to the right: the hint plaques stack on the left, the snack must not hide under them
  b.x = b.hx = clamp(P.x + Math.cos(P.face) * d, 100, WORLD - 100);
  b.y = b.hy = clamp(P.y + Math.sin(P.face) * d, 100, WORLD - 100);
  b.face = b.fa = P.face; // its back to the player
  b.vx = b.vy = 0;
  b.tx = b.x;
  b.ty = b.y;
  b.spawnT = 0;
  b.tame = true;
  b.resetPoints();
  return b;
}
function spawnSpecial(kind, n) {
  const made = [];
  if (kind === 'hedgehog') {
    const [x, y] = findSpawn(320, true),
      b = new Blob({ name: 'Ёж', acc: 'Ежа', pal: PAL_HEDGE, mass: rand(90, 180), x, y, ai: newAI(), spawnT: 1.2, kind });
    b.ai.aggro = 0.5;
    b.ai.fear = 0.4;
    made.push(b);
  } else if (kind === 'cake') {
    const [x, y] = findSpawn(700, true),
      b = new Blob({ name: 'Торт', acc: 'Торт', pal: PAL_CAKE, mass: 1500, x, y, ai: newAI(), spawnT: 1.5, kind });
    b.ai.passive = true;
    made.push(b);
  } else {
    const [x, y] = findSpawn(420, true);
    let lead = null;
    for (let i = 0; i < (n || 6); i++) {
      const b = new Blob({
        name: 'Пиранья',
        acc: 'Пиранью',
        pal: PAL_PIR,
        mass: rand(9, 13),
        x: clamp(x + rand(-70, 70), 60, WORLD - 60),
        y: clamp(y + rand(-70, 70), 60, WORLD - 60),
        ai: newAI(),
        spawnT: 1.2,
        kind,
        skin: 'stripes',
      });
      b.ai.piranha = true;
      b.ai.aggro = 1.6;
      b.ai.fear = 0.5;
      b.ai.lead = lead;
      if (!lead) lead = b;
      made.push(b);
    }
  }
  for (const b of made) blobs.push(b);
  return made;
}
function population() {
  if (time >= specialT) {
    // a couple of hedgehogs, one cake, now and then a piranha pack
    specialT = time + 4;
    let hed = 0,
      cake = 0,
      pir = 0;
    for (const b of blobs) {
      if (b.kind === 'hedgehog') hed++;
      else if (b.kind === 'cake') cake++;
      else if (b.kind === 'piranha') pir++;
    }
    if (hed < (day === 'hedge' ? 4 : 2)) spawnSpecial('hedgehog');
    if (stagesOn()) {
      cakeAt = time + 35;
      pirAt = time + 40;
    } // a free run brings its piranhas and its cake as stages (10-stages)
    else {
      if (cake) cakeAt = time + (day === 'cake' ? 8 : 35);
      else if (time > cakeAt) spawnSpecial('cake');
      if (pir) pirAt = time + (day === 'piranha' ? 20 : 40);
      else if (time > pirAt && (day === 'piranha' || state !== 'play' || !player || !player.alive || player.mass > 90)) spawnSpecial('piranha');
    }
  }
  let n = respawnQ.length;
  for (const b of blobs) if (b.ai && !b.kind) n++;
  for (; n < BOT_TARGET; n++) respawnQ.push(time + rand(1.5, 5));
  for (let i = respawnQ.length - 1; i >= 0; i--)
    if (time >= respawnQ[i]) {
      respawnQ.splice(i, 1);
      spawnBot(randomBotMass());
    }
}
