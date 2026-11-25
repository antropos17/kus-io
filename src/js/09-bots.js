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
  if (b.isPlayer && wrap && wrap.state === 'run' && Math.hypot(wrap.x - b.x, wrap.y - b.y) < 900) {
    ai.mode = 'wrap'; // the autopilot runs after the wrapper (botSteer aims at it every frame); bots never see it
    return;
  }
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
  const S = smartOf(b);
  if (S) return botThinkSmart(b, S); // hard and extreme: the smarter bots below
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
      s *= (!DIFFS[diff].ai && o.mass < 120 ? 0.4 : 0.85) * DIFFS[diff].hunt;
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
  const ff = botFood(b),
    fd = foodD;
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
let foodD = 0; // the score distance of the last botFood pick
function botFood(b) {
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
  foodD = fd;
  return ff;
}
function botSteer(b, dt) {
  const ai = b.ai,
    S = smartOf(b),
    sm = S && ai.trait; // a smart bot that has already thought once
  if (time >= packAt) packTick();
  ai.think -= dt;
  if (ai.mode !== 'hunt') ai.ignoreT = (ai.ignoreT || 0) - dt;
  if (sm) smartTimers(b, dt, S);
  if (ai.think <= 0) {
    ai.think = S ? rand(S.react[0], S.react[1]) : ai.react + rand(0.08); // a smart bot's reaction time differs every time
    botThink(b);
  }
  if (b.tame) {
    // ambles in a small circle where it was put, slowly enough to be caught
    const a = time * 0.8 + b.phase;
    b.tx = b.hx + Math.cos(a) * 24;
    b.ty = b.hy + Math.sin(a) * 24;
    return;
  }
  if (ai.mode === 'wrap') {
    if (wrap && wrap.state === 'run') {
      // a player holds full speed: aim a body length past it so the arrival slowdown never applies, and lunge when it is in reach
      const dx = wrap.x - b.x,
        dy = wrap.y - b.y,
        d = Math.hypot(dx, dy) || 1;
      b.tx = wrap.x + (dx / d) * 200;
      b.ty = wrap.y + (dy / d) * 200;
      if (d < b.Rs + 150 && b.dashCd <= 0 && Math.cos(angDiff(Math.atan2(dy, dx), b.face)) > 0.9) dash(b);
      return;
    }
    ai.think = 0; // caught or gone: think again next frame
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
    let fx = ai.fx,
      fy = ai.fy;
    if (sm) {
      if (Math.random() < dt * 1.6 * S.feint) ai.juke = -ai.juke; // zig and zag, not a straight line to read
      const j = 0.4 * S.feint * ai.juke,
        c = Math.cos(j),
        sn = Math.sin(j),
        x = fx * c - fy * sn;
      fy = fx * sn + fy * c;
      fx = x;
    }
    b.tx = b.x + fx * 400;
    b.ty = b.y + fy * 400;
    if (ai.fleeDash && b.dashCd <= 0 && Math.cos(angDiff(Math.atan2(ai.fy, ai.fx), b.face)) > 0.8) {
      dash(b);
      ai.fleeDash = false;
    }
  } else if (sm && ai.mode === 'sneak' && ai.prey && ai.prey.alive) {
    const o = ai.prey,
      da = flank(b, o, o.face + Math.PI, o.Rs * 0.3);
    if (da < 0.5 && da > -0.5) lunge(b, o, dt, 3);
  } else if (sm && ai.mode === 'pack' && ai.pack) {
    const P = ai.pack,
      T = P.tgt;
    flank(b, T, T.face + Math.PI + ai.slot, P.go ? T.Rs * 0.3 : T.Rs + b.Rs + 110);
    if (P.go) lunge(b, T, dt, 3);
  } else if (ai.mode === 'hunt' && ai.prey && ai.prey.alive) {
    const o = ai.prey;
    ai.ignoreT = (ai.ignoreT || 0) - dt;
    if (o.isPlayer) {
      ai.chase = (ai.chase || 0) + dt;
      if (ai.chase > DIFFS[diff].chase * (sm && ai.trait === 'hunter' ? 1.4 : 1)) {
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
    if (sm) {
      const g = d - o.Rs - b.Rs;
      if (ai.feintT < -0.8 && g > 50 && g < 300 && Math.random() < dt * 0.8 * S.feint) {
        ai.feintT = rand(0.25, 0.5);
        ai.feintS = Math.random() < 0.5 ? -1 : 1;
      }
      if (ai.feintT > 0) {
        // a step aside, as if it gave up, then back in with a lunge
        const k = ((o.Rs + b.Rs + 90) * ai.feintS) / (d || 1);
        b.tx = tx - dy * k;
        b.ty = ty + dx * k;
      }
    }
    if (
      b.dashCd <= 0 &&
      d - o.Rs * 0.5 - b.Rs < 120 + b.Rs * 0.4 &&
      Math.cos(angDiff(Math.atan2(dy, dx), b.face)) > 0.92 &&
      Math.random() < dt * (sm && ai.feintT > -0.35 && ai.feintT <= 0 ? 9 : 2) * ai.aggro
    )
      dash(b);
    else if (sm) {
      if (smartTongue(b, o, d, dx, dy, dt, S)) {
        fireTongue(b);
        botStat.tongue++;
      }
    } else if (
      b.dodgeCd <= 0 &&
      !b.tongue &&
      d - o.Rs - b.Rs < Math.min(150 + b.Rs * 1.1, 420) &&
      o.mass > b.mass * 0.08 &&
      b.mass < 350 &&
      !(o.isPlayer && o.mass < 120 && !DIFFS[diff].ai) &&
      d - o.Rs - b.Rs > 40 &&
      Math.cos(angDiff(Math.atan2(dy, dx), b.face)) > 0.95 &&
      Math.random() < dt * 1.2 * ai.aggro
    )
      fireTongue(b);
  } else if (ai.mode === 'food' && ai.food) {
    b.tx = ai.food.x;
    b.ty = ai.food.y;
    if (sm && b.dodgeCd <= 0 && !b.tongue && ai.food.m > 0 && Math.random() < dt * 0.4 * S.tongue) {
      // lick up a sweet bit a little too far away, and whatever lies on the way
      const dx = ai.food.x - b.x,
        dy = ai.food.y - b.y,
        d = Math.hypot(dx, dy) - b.Rs;
      if (d > 90 && d < Math.min(170 + b.Rs * 1.3, 460) * 0.8 && Math.cos(angDiff(Math.atan2(dy, dx), b.face)) > 0.95) {
        fireTongue(b);
        botStat.lick++;
      }
    }
  } else {
    b.tx = ai.wx;
    b.ty = ai.wy;
  }
}
// ---------- smarter bots (hard and extreme) ----------
// Only ordinary bots in a run get them (DIFFS[diff].ai); the autopilot, the specials, the boss and the world behind the menu keep the old script.
const TRAITS = ['coward', 'bully', 'hunter', 'scav'],
  SLOTS = [0, 1.3, -1.3, 2.4]; // where pack members close in, in radians from the target's back
const botStat = { tongue: 0, lick: 0, sneak: 0, packs: 0 }; // counts for the tests and the balance runs: tongue at prey, tongue at sweets, bites on a back, packs that went in
let packs = [],
  packAt = 0, // next pack check
  packNext = 0; // no new pack before this
const packTmp = [];
function smartOf(b) {
  const S = DIFFS[diff].ai;
  return S && !b.isPlayer && !b.kind && !b.tame && state !== 'menu' ? S : null;
}
function smartInit(ai) {
  const t = TRAITS[randi(4)];
  ai.trait = t; // coward, bully, hunter, scavenger
  ai.tf = t === 'coward' ? 1.35 : t === 'bully' ? 0.75 : 1; // fear
  ai.ta = t === 'bully' ? 1.25 : t === 'coward' ? 0.8 : t === 'hunter' ? 1.15 : 1; // hunger for prey
  ai.ts = t === 'scav' ? 1.5 : t === 'coward' ? 0.4 : t === 'bully' ? 0.7 : 1; // nerve to bite a big one's back
  ai.tt = t === 'hunter' ? 1.4 : 1; // tongue
  ai.tw = t === 'scav' ? 2.2 : 1; // the pull of a wounded one
  ai.sneakCd = rand(2, 5);
  ai.sneakT = 0;
  ai.retT = 0;
  ai.feintT = -1;
  ai.feintS = 1;
  ai.juke = 1;
  ai.pack = null;
  ai.slot = 0;
}
const fresh = (o) => o.isPlayer && time - o.stats.t0 < 20 && DIFFS[diff].ai.fresh < 1; // the first 20 seconds of a player's life: hunted less, never tongued
function busyOf(o, b) {
  // biting, chewing, tongue out, or chasing someone else: its mind is elsewhere for a moment
  return !!(
    o.bite ||
    (o.chunk && !o.chunk.dead) ||
    o.chewT > 0 ||
    o.gulpT > 0 ||
    o.tongue ||
    (o.ai && o.ai.mode === 'hunt' && o.ai.prey && o.ai.prey !== b)
  );
}
function strikeOf(o, lethal, facing) {
  // how far o can reach right now: the mouth, plus a lunge when its dash is ready and a bit of tongue when that would be lethal,
  // both only as far as its mouth points this way
  const aim = clamp((facing + 0.2) / 0.8, 0, 1);
  return (
    o.Rs * 0.45 +
    20 +
    aim * ((o.dashCd <= 0 ? 110 + o.Rs * 0.5 : 0) + (lethal && o.dodgeCd <= 0 && !o.tongue ? Math.min(170 + o.Rs * 1.3, 460) * 0.25 : 0))
  );
}
function botThinkSmart(b, S) {
  const ai = b.ai,
    myBite = biteOf(b.mass, false);
  if (!ai.trait) smartInit(ai);
  if (ai.pack && (!ai.pack.tgt.alive || packs.indexOf(ai.pack) < 0)) ai.pack = null;
  const P = ai.pack,
    T = P ? P.tgt : null,
    sneaking = ai.mode === 'sneak' && ai.sneakT > 0 && ai.prey && ai.prey.alive;
  let fx = 0,
    fy = 0,
    gx = 0,
    gy = 0,
    danger = 0,
    lethalNear = false,
    prey = null,
    preyS = 0,
    sneak = null,
    sneakS = 0,
    sneakOk = false;
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
    const bigger = o.mass > b.mass * 1.1;
    if (!bigger && !o.isPlayer && !o.kind && sd < 500) {
      gx += ux / (sd + 150);
      gy += uy / (sd + 150);
    } // its own kind: a crowd to run to
    if (bigger && o.spawnT <= 0) {
      // a real threat, not a glance: how far it reaches now, how fast it closes in, whether its mouth is on me.
      // A big one turning round far away is no reason to run.
      const lethal = lethalFor(b.mass, biteOf(o.mass, o.dashCd <= 0)),
        strike = strikeOf(o, lethal, facing),
        eff = sd - Math.max(0, (b.vx - o.vx) * ux + (b.vy - o.vy) * uy) * 0.5;
      if (eff < strike + 90) {
        let w = (1 - clamp((eff - strike) / 90, 0, 1)) * (lethal ? 2.4 : 0.8) * ai.fear * ai.tf * (0.2 + 0.8 * clamp(facing + 0.3, 0, 1));
        if (busyOf(o, b)) w *= 0.6; // its mouth is full for a moment
        if (o === T) w *= 0.45; // a pack gives nerve
        if (sneaking && o === ai.prey && facing < 0.25) w = 0; // creeping up on its back on purpose
        fx -= ux * w;
        fy -= uy * w;
        if (w > danger) danger = w;
        if (lethal && eff < strike && facing > 0.3) lethalNear = true;
      }
    }
    if (o.spawnT > 0 || (o.isPlayer && CHEAT.peace) || o.kind === 'hedgehog' || o.pShield > 0 || o.safe || o.boss) continue; // nobody hunts spines, shields or the boss
    if (bigger) {
      // the small one's gamble: the back of a big one whose mind is elsewhere
      const back = facing < -0.15 && (facing < -0.6 || busyOf(o, b));
      if (sneaking && o === ai.prey) sneakOk = back || facing < 0.25;
      if (back && o.mass > b.mass * 1.4 && sd < 280 && !(o.isPlayer && o.mass < S.shy)) {
        const s = (myBite / (Math.max(0, sd) + 60)) * ai.ts;
        if (s > sneakS) {
          sneakS = s;
          sneak = o;
        }
      }
      continue;
    }
    if (o.isPlayer && ai.ignoreT > 0) continue;
    const gain = lethalFor(o.mass, myBite) ? o.mass * 0.9 : myBite * 0.84;
    let s = (gain / (Math.max(0, sd) + 70)) * ai.aggro * ai.ta;
    s *= 1 + Math.min(0.8 * ai.tw, woundLoad(o) * 1.5 * ai.tw);
    if (ai.trait === 'bully' && o.mass < b.mass * 0.5) s *= 1.3; // picks on the small ones
    if (o.isPlayer) s *= 0.85 * DIFFS[diff].hunt * (fresh(o) ? DIFFS[diff].ai.fresh : 1); // a life just begun gets a few seconds to find its feet
    if (o === leader) s *= 1.25;
    if (ai.mode === 'hunt' && o === ai.prey) s *= 1.3; // sticks to its choice for a while
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
  if (ai.retT > 0 && ai.prey && ai.prey.alive) {
    // after a bite on its back: away before it turns round
    const dx = b.x - ai.prey.x,
      dy = b.y - ai.prey.y,
      l = Math.hypot(dx, dy) || 1;
    fx += (dx / l) * 1.2;
    fy += (dy / l) * 1.2;
    danger = Math.max(danger, 0.6);
  }
  const ff = botFood(b),
    foodS = ff ? 1 / (Math.sqrt(Math.max(0, foodD)) + 70) : 0;
  if (danger > 0.3) {
    ai.pack = null; // a pack member that runs is out of the pack
    ai.mode = 'flee';
    fleeDir(b, fx, fy, gx, gy);
    ai.fleeDash = lethalNear;
  } else if (P) ai.mode = 'pack';
  else if (sneaking && sneakOk) ai.mode = 'sneak';
  else if (sneak && ai.sneakCd <= 0 && sneakS > foodS * 0.6 && Math.random() < 0.6 * S.sneak * Math.min(1, ai.ts)) {
    ai.mode = 'sneak';
    ai.prey = sneak;
    ai.sneakT = 3;
    ai.bites0 = b.stats.bites;
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
  if (sneaking && ai.mode !== 'sneak') ai.sneakCd = rand(2, 4) / S.sneak; // gave up on it
}
function fleeDir(b, fx, fy, gx, gy) {
  // away from the threats, but toward its own kind, along a wall rather than into it, and out of corners
  const ai = b.ai,
    l = Math.hypot(fx, fy) || 1,
    ax = fx / l,
    ay = fy / l,
    gl = Math.hypot(gx, gy),
    m = 260 + b.Rs;
  let best = -1e9,
    bx = ax,
    by = ay;
  for (let i = 0; i <= 12; i++) {
    const a = i * (TAU / 12),
      cx = i === 12 ? ax : Math.cos(a),
      cy = i === 12 ? ay : Math.sin(a);
    let s = cx * ax + cy * ay;
    if (s < -0.2) continue; // never back toward the threat
    if (gl > 0) s += (0.35 * (cx * gx + cy * gy)) / gl;
    const px = b.x + cx * 380,
      py = b.y + cy * 380;
    if (px < m) s -= ((m - px) / m) * 1.6;
    else if (px > WORLD - m) s -= ((px - WORLD + m) / m) * 1.6;
    if (py < m) s -= ((m - py) / m) * 1.6;
    else if (py > WORLD - m) s -= ((py - WORLD + m) / m) * 1.6;
    if (s > best) {
      best = s;
      bx = cx;
      by = cy;
    }
  }
  ai.fx = bx;
  ai.fy = by;
}
function smartTimers(b, dt, S) {
  const ai = b.ai;
  ai.sneakCd -= dt;
  ai.retT -= dt;
  ai.feintT -= dt;
  if (ai.mode !== 'sneak') return;
  ai.sneakT -= dt;
  if (b.biteTgt === ai.prey && b.stats.bites > ai.bites0) {
    // got its piece: now away, before the big one turns round
    botStat.sneak++;
    ai.sneakT = 0;
    ai.retT = rand(0.7, 1.2);
    ai.sneakCd = rand(4, 8) / S.sneak;
    ai.think = 0;
  } else if (ai.sneakT <= 0) ai.think = 0;
}
function flank(b, o, a, r) {
  // head for the point at angle a round o, going round the outside rather than across its mouth; returns how far round is still to go
  const rel = Math.atan2(b.y - o.y, b.x - o.x),
    da = angDiff(rel, a);
  if (da > 0.8 || da < -0.8) {
    a = rel - clamp(da, -0.9, 0.9);
    r = Math.max(r, o.Rs + b.Rs + 60);
  }
  b.tx = o.x + Math.cos(a) * r + o.vx * 0.2;
  b.ty = o.y + Math.sin(a) * r + o.vy * 0.2;
  return da;
}
function lunge(b, o, dt, rate) {
  // dash in when close and lined up
  if (b.dashCd > 0) return;
  const dx = o.x - b.x,
    dy = o.y - b.y,
    d = Math.hypot(dx, dy);
  if (d - o.Rs - b.Rs < 110 + b.Rs * 0.4 && Math.cos(angDiff(Math.atan2(dy, dx), b.face)) > 0.9 && Math.random() < dt * rate) dash(b);
}
function smartTongue(b, o, d, dx, dy, dt, S) {
  // the tongue when it pays: the prey is past a lunge but within reach, and the reel-in ends at this mouth
  if (b.dodgeCd > 0 || b.tongue || fresh(o)) return false;
  const g = d - o.Rs - b.Rs;
  if (g < 35 || g > Math.min(170 + b.Rs * 1.3, 460) * 0.85 || o.mass < b.mass * 0.05) return false;
  if (b.dashCd <= 0 && g < 110 + b.Rs * 0.4) return false; // a lunge does it better
  if (Math.cos(angDiff(Math.atan2(dy, dx), b.face)) < 0.9) return false;
  return Math.random() < dt * 3 * S.tongue * b.ai.tt;
}
function packable(m, T) {
  if (m === T || !m.alive || !m.ai || m.isPlayer || m.kind || m.tame || m.spawnT > 0 || m.ai.pack || m.ai.mode === 'flee' || !m.ai.trait)
    return false;
  if (m.mass < T.mass * 0.06 || m.mass > T.mass * 0.85) return false;
  const dx = m.x - T.x,
    dy = m.y - T.y;
  return dx * dx + dy * dy < 640000;
}
function packEnd(i) {
  const P = packs[i];
  for (const m of P.m)
    if (m.ai.pack === P) {
      m.ai.pack = null;
      m.ai.think = 0;
    }
  packs.splice(i, 1);
}
function packTick() {
  // a few bots gang up on one big candy and come at it from different sides; checked twice a second, not every frame
  packAt = time + 0.5;
  const S = DIFFS[diff].ai;
  if (!S || state === 'menu') {
    while (packs.length) packEnd(0);
    return;
  }
  for (let i = packs.length - 1; i >= 0; i--) {
    const P = packs[i],
      T = P.tgt;
    let n = 0,
      near = 0;
    for (const m of P.m)
      if (m.alive && m.ai.pack === P) {
        n++;
        if (Math.hypot(m.x - T.x, m.y - T.y) - m.Rs - T.Rs < 240) near++;
      }
    if (!T.alive || T.safe || T.pShield > 0 || (T.isPlayer && (state !== 'play' || CHEAT.peace)) || n < 2 || time > P.end) {
      packEnd(i);
      packNext = time + S.packCd * rand(0.7, 1.3);
    } else if (!P.go && (near >= n || time > P.goAt)) {
      P.go = true; // all round it, or tired of waiting: in!
      P.end = time + 4.5;
      botStat.packs++;
    }
  }
  if (time < packNext || packs.length >= S.packs) return;
  packNext = time + 1.5; // nobody worth it: look again soon
  let best = null,
    bestS = 0;
  for (const T of blobs) {
    if (!T.alive || T.mass < 110 || T.safe || T.boss || T.spawnT > 0 || T.pShield > 0 || (T.kind && !T.isPlayer)) continue;
    if (T.isPlayer && (T.mass < S.shy || CHEAT.peace || state !== 'play')) continue;
    let taken = false;
    for (const P of packs) if (P.tgt === T) taken = true;
    if (taken) continue;
    let n = 0;
    for (const m of blobs) if (packable(m, T)) n++;
    if (n < 2) continue;
    const s = Math.min(n, S.pack) * Math.sqrt(T.mass) * (T.isPlayer ? 1.5 : 1);
    if (s > bestS) {
      bestS = s;
      best = T;
    }
  }
  if (!best) return;
  packTmp.length = 0;
  for (const m of blobs) if (packable(m, best)) packTmp.push(m);
  packTmp.sort((p, q) => Math.hypot(p.x - best.x, p.y - best.y) - Math.hypot(q.x - best.x, q.y - best.y));
  const P = { tgt: best, m: packTmp.slice(0, S.pack), go: false, goAt: time + 3.5, end: time + 9 };
  P.m.forEach((m, k) => {
    m.ai.pack = P;
    m.ai.slot = SLOTS[k] + rand(-0.2, 0.2);
    m.ai.think = 0;
  });
  packs.push(P);
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
