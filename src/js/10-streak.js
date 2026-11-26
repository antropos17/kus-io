// ---------- streak juice: ×N over the candy, fuses, stamps, sugar rush and the summary ----------
// A streak is player.combo while player.comboT (the 4 s window) is still running. doBite calls onStreakBite, updateBlob calls onStreakEnd.
const STREAK = { win: 4, close: 0.45, low: 0.8, words: { 2: t('w.2'), 3: t('w.3'), 5: t('w.5'), 7: t('w.7') } };
const STREAK_COL = ['', '#9be15d', '#ff9a3c', '#ff4f7b']; // the colour of each step
// 0: no streak (combo < 2), 1: ×2, 2: ×3-4, 3: ×5 and up
// a streak bite felt in the body (only the picture and the sound: the numbers stay): how much the candy swells at
// each step k = min(combo, 5); on is for tests that compare a bite with and without it
const HEAVY = { on: true, swell: [0, 0, 0.07, 0.1, 0.13, 0.16] };
function heavyBite(A, k) {
  // the player's streak bite of step k: the body swells (less with reduce motion); returns how much bigger the gobs fly
  A.swell = Math.max(A.swell || 0, HEAVY.swell[k] * (calm ? 0.5 : 1));
  return 1 + 0.15 * (k - 1);
}
const streakLevel = (combo) => (combo < 2 ? 0 : combo < 3 ? 1 : combo < 5 ? 2 : 3);
// the step the player's face and label show right now
const streakStep = (b) => (b.isPlayer && b.comboT > 0 ? streakLevel(b.combo || 0) : 0);
const streak = { start: 0, sum: 0, lastVictim: null, lastWound: { x: 0, y: 0 }, pop: 0, on: false, lvl: 0, sumT: 0, lt: 0, lw: 0 }; // lt, lw: top and half width of the ×N label in world units (set by drawName)
const stamps = []; // { txt, t, hw }: the word over the player; one at a time, a new one replaces it
let stampOut = null; // the word just replaced, fading out for 0.12 s
const multEl = sugarEl.querySelector('.mult'),
  sumEl = $('streakSum'),
  vigEl = $('vig');
// 14 sprinkle capsules that circle the bite button at step 3 (CSS turns them)
const dashSpr = document.createElement('i');
dashSpr.className = 'spr';
dashSpr.setAttribute('aria-hidden', 'true');
for (let i = 0; i < 14; i++) {
  const u = document.createElement('u');
  u.style.cssText = `--a:${Math.round((i / 14) * 360)}deg;--c:${SPRINKLES[i % SPRINKLES.length]}`;
  dashSpr.appendChild(u);
}
dashEl.appendChild(dashSpr);
let domF = -1,
  domLvl = -1,
  domLow = false,
  lastP = null;
// the sprinkles that fly in from the screen edges at step 3
const RUSH_POOL = 40,
  rushSpr = Array.from({ length: RUSH_POOL }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, a: 0, t: 0, T: 1, c: '' }));
let rushAcc = 0;

function streakWrapHook(P) {
  // called once for every streak that lapses (combo > 1): a ×WRAP.min one in a clean run drops the runaway wrapper, one at a time
  if (runActive && P === player && !P.cheated && P.combo >= WRAP.min && !wrap && !reveal)
    spawnWrap(streak.lastVictim, streak.lastWound.x, streak.lastWound.y);
}

// the page side of a live streak: the chip, the fuse round the bite button, the sugar rush on the edges
function streakDom(P, lvl) {
  const f = clamp(P.comboT / STREAK.win, 0, 1),
    q = Math.round(f * 60) / 60, // the fuse ring needs about 6 degrees of resolution: no style write every frame
    low = P.comboT < STREAK.low;
  if (q !== domF) {
    domF = q;
    dashEl.style.setProperty('--f', q);
  }
  if (lvl !== domLvl) {
    if (lvl === 3 && domLvl < 3)
      dashEl.style.setProperty('--sr', dashEl.offsetWidth / 2 + (document.body.classList.contains('touch') ? 10 : 13) + 'px'); // on phones the ring must stay clear of «Язык» just above
    domLvl = lvl;
    dashEl.style.setProperty('--fc', STREAK_COL[lvl] || STREAK_COL[1]);
    dashEl.classList.toggle('fuse', lvl > 0);
    dashEl.classList.toggle('s3', lvl === 3);
    vigEl.classList.toggle('rush', lvl === 3);
    multEl.style.setProperty('--mc', STREAK_COL[lvl] || STREAK_COL[1]);
    multEl.classList.toggle('on', lvl > 0);
  }
  if (low !== domLow) {
    domLow = low;
    dashEl.classList.toggle('low', low);
  }
}
function streakDomOff() {
  if (domLvl === 0) return;
  domLvl = 0;
  domLow = false;
  domF = -1;
  dashEl.classList.remove('fuse', 's3', 'low');
  vigEl.classList.remove('rush');
  multEl.classList.remove('on');
}
function addStamp(txt) {
  if (ann.quiet) return; // the swallow that brought the big word: one word on screen at a time
  if (stamps.length)
    stampOut = { txt: stamps[0].txt, hw: stamps[0].hw, t: 0, f: stamps[0].t, a0: stamps[0].t > 0.8 ? Math.max(0, 1 - (stamps[0].t - 0.8) / 0.3) : 1 }; // fades on from its current alpha
  stamps.length = 0;
  stamps.push({ txt, t: 0, hw: 0 });
}
function onStreakBite(P, B, wx, wy, add, close) {
  // every bite the player lands; the sugar for it is already in run.sugar (earn runs before this call)
  if (P.combo === 1) {
    streak.start = run.sugar - add; // a fresh streak: remember the sugar it started from
    streak.sum = 0;
  }
  streak.sum += add;
  streak.lastVictim = B;
  streak.lastWound.x = wx;
  streak.lastWound.y = wy;
  if (P.combo < 2) return;
  const lvl = streakLevel(P.combo);
  streak.on = true;
  streak.lvl = lvl;
  sugarFly(wx, wy, add, Math.min(P.combo, 5) + 1); // the cubes carry this bite's sugar into the pill
  const word = close ? t('w.close') : STREAK.words[P.combo];
  if (word) addStamp(word);
  if (word && word === STREAK.words[3]) for (const x of texts) if (x.s.startsWith(t('float.yum'))) x.s = x.s.slice(t('float.yum').length); // the stamp says it now: a swallow's «ням!» still floating keeps only its number
  if (!calm) {
    streak.pop = 1;
    cam.shake = Math.max(cam.shake, 3 + Math.min(P.combo, 6) * 0.9);
    cam.sa = Math.atan2(wy - P.y, wx - P.x);
    if (multEl.animate)
      multEl.animate([{ transform: 'scale(1.55) rotate(-8deg)' }, { transform: 'scale(1) rotate(-8deg)' }], {
        duration: 340,
        easing: 'cubic-bezier(.3,1.6,.5,1)',
      });
  }
  multEl.textContent = '×' + P.combo;
  streakDom(P, lvl);
}
function onStreakEnd(P) {
  // comboT ran out with a streak of two or more bites: show what it was worth, then let Task 4 react
  // the wrapper's payout pill, if it is still up, is not replaced
  if (runActive && P === player && !(streak.sumT > 0 && sumEl.textContent.startsWith(t('wrap.word')))) {
    const got = Math.max(0, Math.floor(streak.sum));
    sumEl.textContent = got > 0 ? t('sum.streakSugar', P.combo, got) : t('sum.streak', P.combo); // a streak of bonuses only brought no sugar: no «+0»
    sumEl.classList.add('on');
    streak.sumT = 2;
  }
  streakWrapHook(P);
}
function streakClear() {
  // a new life or run: nothing of the old streak stays on the page
  annReset();
  streak.on = false;
  streak.lvl = 0;
  streak.pop = 0;
  streak.sumT = 0;
  streak.lastVictim = null;
  stamps.length = 0;
  stampOut = null;
  for (const p of rushSpr) p.on = false;
  sumEl.classList.remove('on');
  streakDomOff();
}
function streakTick(dt) {
  const P = player;
  if (P !== lastP) {
    lastP = P; // a new life or run: nothing of the old streak stays
    streakClear();
  }
  const live = !!(P && P.alive && P.comboT > 0 && P.combo > 1),
    lvl = live ? streakLevel(P.combo) : 0;
  if (live) streakDom(P, lvl);
  else streakDomOff();
  streak.on = live;
  streak.lvl = lvl;
  streak.pop *= Math.exp(-dt * 9);
  if (stamps.length) {
    stamps[0].t += dt;
    if (stamps[0].t > 1.1) stamps.length = 0;
  }
  if (stampOut) {
    stampOut.t += dt;
    if (stampOut.t > 0.12) stampOut = null;
  }
  if (streak.sumT > 0) {
    streak.sumT -= dt;
    if (streak.sumT <= 0) sumEl.classList.remove('on');
  }
  // sugar rush: 30 sprinkles a second from the screen edges (none under calm), fewer on weaker graphics
  if (lvl === 3 && !calm && state === 'play') {
    rushAcc += dt * 30 * (lod === 0 ? 1 : lod === 1 ? 0.5 : 0.25);
    while (rushAcc >= 1) {
      rushAcc--;
      for (let i = 0; i < RUSH_POOL; i++) {
        const p = rushSpr[i];
        if (p.on) continue;
        const side = (Math.random() * 4) | 0,
          sp = rand(50, 130);
        p.on = true;
        p.t = 0;
        p.T = rand(0.9, 1.5);
        p.a = rand(TAU);
        p.c = SPRINKLES[(Math.random() * SPRINKLES.length) | 0];
        p.x = side < 2 ? rand(W) : side === 2 ? 0 : W;
        p.y = side >= 2 ? rand(H) : side === 0 ? 0 : H;
        p.vx = side < 2 ? rand(-30, 30) : side === 2 ? sp : -sp;
        p.vy = side >= 2 ? rand(-30, 30) : side === 0 ? sp : -sp;
        break;
      }
    }
  } else rushAcc = 0;
  for (let i = 0; i < RUSH_POOL; i++) {
    const p = rushSpr[i];
    if (!p.on) continue;
    p.t += dt;
    if (p.t >= p.T) p.on = false;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.a += dt * 3;
  }
  wrapTick(dt);
}

// ---- drawing ----
function drawStreakFuse(z) {
  // a ring on the tray under the player that burns down with the 4 s window
  const P = player;
  if (!P || !P.alive || !(P.comboT > 0) || streakLevel(P.combo || 0) < 1) return;
  const R = P.Rs,
    cy = P.y + R * 0.95,
    rx = R * 1.15,
    ry = R * 0.32,
    low = P.comboT < STREAK.low;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(3.5 / z, R * 0.08);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(P.x, cy, rx, ry, 0, 0, TAU);
  ctx.stroke();
  if (low && !calm) ctx.globalAlpha = 0.62 + 0.38 * Math.sin(time * 28);
  ctx.strokeStyle = STREAK_COL[streakLevel(P.combo)];
  ctx.beginPath();
  ctx.ellipse(P.x, cy, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + clamp(P.comboT / STREAK.win, 0, 1) * TAU);
  ctx.stroke();
  ctx.restore();
}
function drawStamp(s, a, px, ox, oy, z) {
  // above-right of the ×N label: it starts over the label's top edge, so it never shares the ×N band
  const f = s.f === undefined ? s.t : s.f,
    sc = calm ? 1 : f < 0.15 ? 1.8 - (0.8 * f) / 0.15 : 1;
  ctx.font = `900 22px ${FONT}`;
  if (!s.hw) s.hw = ctx.measureText(s.txt).width / 2; // measured once per stamp
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(Math.min(px + streak.lw * z + 12 + s.hw, W - s.hw - 8), streak.lt * z + oy - 20 - (calm ? 0 : f * 12));
  ctx.rotate(-0.14);
  ctx.scale(sc, sc);
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#fff1dc';
  ctx.strokeText(s.txt, 0, 0);
  ctx.fillStyle = '#ff4f7b';
  ctx.fillText(s.txt, 0, 0);
  ctx.restore();
}
function drawStamps(ox, oy, z) {
  // screen space; streak.lt / streak.lw (the ×N label's top and half width, in world units) are set by drawName
  const P = player;
  if (!(stamps.length || stampOut) || !P || !P.alive) return;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const px = P.x * z + ox;
  if (stampOut) drawStamp(stampOut, stampOut.a0 * (1 - stampOut.t / 0.12), px, ox, oy, z);
  if (stamps.length) {
    const f = stamps[0].t;
    drawStamp(stamps[0], f > 0.8 ? Math.max(0, 1 - (f - 0.8) / 0.3) : 1, px, ox, oy, z);
  }
}
function drawStreakFx() {
  // screen space: the sugar-rush sprinkles
  if (calm) return;
  ctx.lineCap = 'round';
  ctx.lineWidth = 3.5;
  for (let i = 0; i < RUSH_POOL; i++) {
    const p = rushSpr[i];
    if (!p.on) continue;
    const e = p.t / p.T,
      c = Math.cos(p.a) * 4,
      s = Math.sin(p.a) * 4;
    ctx.globalAlpha = e < 0.15 ? e / 0.15 : 1 - (e - 0.15) / 0.85;
    ctx.strokeStyle = p.c;
    ctx.beginPath();
    ctx.moveTo(p.x - c, p.y - s);
    ctx.lineTo(p.x + c, p.y + s);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---------- the runaway wrapper: a wrapped candy with legs that pops out of the last wound after a ×5 streak ----------
// It is not a Blob and not in blobs, so bots never see it; only the player's autopilot chases it (botThink).
// Caught within WRAP.life seconds it plays a reveal over the player (the game keeps running) and pays WRAP.amt[final].
const WRAP_POP = 0.3, // the hop out of the wound, seconds
  WRAP_COL = [
    ['#fff1dc', '#ff5d8f'],
    ['#ffd23f', '#ff9a3c'],
    ['#ff5d8f', '#c49bff'],
  ], // body and twisted ends per tier: plain, rare, jackpot
  WRAP_RGB = ['255,241,220', '255,210,63', '255,93,143'],
  WRAP_WORD = ['', t('wrap.rare'), t('wrap.jack')],
  WRAP_CATCH = t('wrap.catch'); // drawn where a local t is the clock
let wrap = null, // { x, y, vx, vy, t, life, tier, final, state: 'pop' | 'run', step }
  reveal = null, // { t, tier, final, shown, paid, from, flash }: tier is the one shown now, from the one it was caught as
  wrapOut = null; // the one that got away, fading out for 0.4 s (drawing only)
function wrapBurst(x, y, n, col) {
  // a sprinkle burst in the world; none under calm, fewer on weaker graphics
  if (calm) return;
  n = lod === 1 ? n >> 1 : lod === 2 ? n >> 2 : n;
  const z = cam.z;
  for (let i = 0; i < n; i++) {
    const a = rand(TAU),
      sp = rand(60, 230) / z;
    parts.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      r: rand(1.6, 3.2) / z,
      t: 0,
      T: rand(0.45, 0.9),
      c: col || SPRINKLES[(Math.random() * SPRINKLES.length) | 0],
    });
  }
}
function spawnWrap(B, wx, wy, tier) {
  // B: the victim whose wound it pops out of; tier: forced for tests, rolled from WRAP.odds otherwise
  const P = player;
  if (tier === undefined) {
    const r = Math.random();
    tier = r < WRAP.odds[0] ? 0 : r < WRAP.odds[0] + WRAP.odds[1] ? 1 : 2;
  }
  tier = clamp(tier | 0, 0, 2);
  // it hops away from the player (from the victim's middle when there is none) and lands clear of the player's mouth
  let ux = wx - (P ? P.x : B ? B.x : wx),
    uy = wy - (P ? P.y : B ? B.y : wy);
  const d = Math.hypot(ux, uy);
  if (d < 1) {
    const a = rand(TAU);
    ux = Math.cos(a);
    uy = Math.sin(a);
  } else {
    ux /= d;
    uy /= d;
  }
  const hop = Math.max(0, (P ? P.Rs : 0) + 90 - d) + 40;
  wrap = {
    x: wx,
    y: wy,
    vx: (ux * hop) / WRAP_POP,
    vy: (uy * hop) / WRAP_POP,
    t: 0,
    life: WRAP.life,
    tier,
    final: Math.min(2, tier + (Math.random() < WRAP.up ? 1 : 0)),
    state: 'pop',
    step: 0,
  };
  wrapBurst(wx, wy, 22);
  Sfx.wrapPop();
}
function clearWrap() {
  wrap = null;
  reveal = null;
  wrapOut = null;
}
function wrapRun(P, dt) {
  const w = wrap;
  w.t += dt;
  if (w.state === 'pop') {
    w.x = clamp(w.x + w.vx * dt, 20, WORLD - 20);
    w.y = clamp(w.y + w.vy * dt, 20, WORLD - 20);
    if (w.t >= WRAP_POP) {
      w.state = 'run';
      w.t = 0;
    }
    return;
  }
  w.life -= dt;
  if (w.life <= 0) {
    wrapOut = { x: w.x, y: w.y, t: 0, tier: w.tier }; // it got away: a teasing hop and a fade, nothing paid
    wrap = null;
    return;
  }
  // flee from the player in a zigzag, pushed back from the tray edges, fast at first and tiring
  const ax = w.x - P.x,
    ay = w.y - P.y,
    d = Math.hypot(ax, ay) || 1,
    zig = Math.sin(w.t * 5) * 0.9,
    c = Math.cos(zig),
    s = Math.sin(zig),
    m = 120;
  let dx = (ax * c - ay * s) / d,
    dy = (ax * s + ay * c) / d;
  if (w.x < m) dx += (1 - w.x / m) * 2;
  else if (w.x > WORLD - m) dx -= (1 - (WORLD - w.x) / m) * 2;
  if (w.y < m) dy += (1 - w.y / m) * 2;
  else if (w.y > WORLD - m) dy -= (1 - (WORLD - w.y) / m) * 2;
  const l = Math.hypot(dx, dy) || 1,
    sp = P.maxSpeed() * lerp(WRAP.v0, WRAP.v1, clamp(w.t / WRAP.tire, 0, 1));
  w.vx = (dx / l) * sp;
  w.vy = (dy / l) * sp;
  w.x = clamp(w.x + w.vx * dt, 20, WORLD - 20);
  w.y = clamp(w.y + w.vy * dt, 20, WORLD - 20);
  w.step += dt * 3;
  if (w.step >= 1) {
    w.step -= 1;
    Sfx.wrapStep();
  }
  if (Math.hypot(w.x - P.x, w.y - P.y) < P.Rs + 14) {
    // caught: the reveal plays over the player while the game runs on
    reveal = { t: 0, tier: w.tier, final: w.final, shown: 0, paid: false, from: w.tier, flash: 0 };
    wrap = null;
    wrapBurst(w.x, w.y, 34);
    if (!calm) {
      cam.shake = Math.max(cam.shake, 6);
      cam.sa = Math.atan2(w.y - P.y, w.x - P.x);
    }
    Sfx.wrapCatch();
  }
}
// how far above the player's centre the reveal sits, in screen pixels: clear of a big body and its name
const revealOff = (P, z) => Math.max(90, P.Rs * z + 60);
function revealTick(P, dt) {
  const R = reveal,
    z = cam.z;
  R.t += dt;
  R.flash = Math.max(0, R.flash - dt * 3);
  // the tier steps up at 0.35 s + 0.3 s per step
  while (R.tier < R.final && R.t >= 0.35 + 0.3 * (R.tier - R.from + 1)) {
    R.tier++;
    R.flash = 1;
    wrapBurst(P.x, P.y - revealOff(P, z) / z, 30, WRAP_COL[R.tier][0]);
    if (!calm) {
      cam.shake = Math.max(cam.shake, 4);
      cam.sa = -Math.PI / 2;
    }
    Sfx.wrapUp(R.tier);
  }
  // the amount rolls up over 1.2 s, ticking higher as it goes
  const amt = WRAP.amt[R.final],
    e = 1 - Math.pow(1 - clamp((R.t - 0.25) / 1.2, 0, 1), 3),
    v = R.t >= 1.45 ? amt : Math.round(amt * e * (0.4 + (0.6 * (R.tier + 1)) / (R.final + 1))),
    st = Math.max(1, amt / 12);
  if (v > R.shown) {
    if (Math.floor(v / st) !== Math.floor(R.shown / st)) Sfx.tick(Math.min(7, ((v / amt) * 8) | 0));
    R.shown = v;
  }
  if (R.t >= 1.5 && !R.paid) {
    R.paid = true;
    if (runActive && !P.cheated && !run.cheated) {
      run.sugar += amt; // first into run.sugar, then the cubes carry it to the pill
      sugarFly(P.x, P.y - revealOff(P, z) / z, amt, 8 + 3 * R.final); // the cubes leave from the number
      sumEl.textContent = t('wrap.caught', amt);
      sumEl.classList.add('on');
      streak.sumT = 2;
      Sfx.wrapPay(R.final === 2);
    }
  }
  if (R.t >= 3) reveal = null;
}
function wrapTick(dt) {
  if (wrapOut) {
    wrapOut.t += dt;
    if (wrapOut.t >= 0.4) wrapOut = null;
  }
  if (!wrap && !reveal) return;
  const P = player;
  if (!P || !P.alive) return clearWrap(); // the player died: nothing waits for the next life
  if (wrap) wrapRun(P, dt);
  if (reveal) revealTick(P, dt);
}

// ---- drawing (screen pixels) ----
function wrapGlow(x, y, r, a, rgb) {
  if (a <= 0) return;
  a = Math.min(1, a);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,250,235,${a})`);
  g.addColorStop(0.4, `rgba(${rgb},${a * 0.6})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}
function wrapText(txt, x, y, fill, lw) {
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#2a120c';
  ctx.lineWidth = lw;
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(txt, x, y);
}
function drawBonbon(x, y, s, tier, rot, legs, t) {
  // the wrapped candy: an oval body with sliding stripes and two twisted ends; legs, eyes and a smile while it runs
  const c = WRAP_COL[tier];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  if (legs) {
    ctx.strokeStyle = ctx.fillStyle = '#3a2118';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    for (let sd = -1; sd <= 1; sd += 2) {
      const k = Math.sin(t * 32 + sd * 1.5) * 7;
      ctx.beginPath();
      ctx.moveTo(sd * 7, 11);
      ctx.lineTo(sd * 7 + k, 25);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(sd * 7 + k + 2, 25, 4, 2.2, 0, 0, TAU);
      ctx.fill();
    }
  }
  const wg = Math.sin(t * 9) * 3;
  ctx.fillStyle = c[1];
  for (let sd = -1; sd <= 1; sd += 2) {
    ctx.beginPath();
    ctx.moveTo(sd * 15, 0);
    ctx.lineTo(sd * 32, -12 + wg);
    ctx.quadraticCurveTo(sd * 27, 0, sd * 32, 12 - wg);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = c[0];
  ctx.beginPath();
  ctx.ellipse(0, 0, 19, 14, 0, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.clip(); // one small body a frame
  ctx.strokeStyle = c[1];
  ctx.lineWidth = 5;
  const sl = (t * 20) % 10;
  ctx.beginPath();
  for (let q = -3; q <= 3; q++) {
    ctx.moveTo(q * 10 - 8 + sl, -15);
    ctx.lineTo(q * 10 + 8 + sl, 15);
  }
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.ellipse(-7, -6, 6, 3, -0.4, 0, TAU);
  ctx.fill();
  if (legs) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-5, -1, 3.6, 0, TAU);
    ctx.arc(5, -1, 3.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2a120c';
    ctx.beginPath();
    ctx.arc(-3.2, -0.5, 1.8, 0, TAU);
    ctx.arc(6.8, -0.5, 1.8, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#2a120c';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 5, 3, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
  ctx.restore();
}
function drawWrap(z, ox, oy) {
  // called in the world pass before the bodies, so it runs under them; draws in screen pixels and puts the world transform back
  const w = wrap,
    o = wrapOut;
  if (!w && !o) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const t = calm ? 0 : time;
  if (w) {
    const x = w.x * z + ox,
      y = w.y * z + oy,
      running = w.state === 'run',
      hop = running ? 0 : Math.sin(Math.PI * clamp(w.t / WRAP_POP, 0, 1)) * 36,
      rgb = WRAP_RGB[w.tier];
    if (running) {
      // a beam of light in its tier colour, so it can be found on a busy tray
      const bw = 24 + Math.sin(t * 6) * 4,
        g = ctx.createLinearGradient(0, y - 300, 0, y);
      g.addColorStop(0, `rgba(${rgb},0)`);
      g.addColorStop(1, `rgba(${rgb},0.42)`);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - bw * 0.4, y - 300);
      ctx.lineTo(x + bw * 0.4, y - 300);
      ctx.lineTo(x + bw, y);
      ctx.lineTo(x - bw, y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      wrapGlow(x, y, 34, 0.5, rgb);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 24, 18, 5, 0, 0, TAU);
    ctx.fill();
    wrapGlow(x, y - hop, 30, 0.35 + 0.15 * Math.sin(t * 8), rgb);
    drawBonbon(x, y - hop, 1.1, w.tier, running ? Math.sin(t * 22) * 0.14 : calm ? 0 : w.t * 16, running, t);
  }
  if (o) {
    const e = o.t / 0.4;
    ctx.globalAlpha = Math.max(0, 1 - e);
    drawBonbon(o.x * z + ox, o.y * z + oy - (calm ? 0 : Math.sin(Math.PI * e) * 28), 1.1, o.tier, calm ? 0 : Math.sin(e * 12) * 0.4, true, t);
    ctx.globalAlpha = 1;
  }
  ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * ox, DPR * oy);
}
function drawWrapTag(z, ox, oy) {
  // screen pass, over the bodies: «Лови!» above the running wrapper and the 5 s arc under its feet
  const w = wrap;
  if (!w || w.state !== 'run') return;
  const x = w.x * z + ox,
    y = w.y * z + oy,
    t = calm ? 0 : time;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 16px ${FONT}`;
  const s = 1 + 0.08 * Math.sin(t * 10);
  ctx.save();
  ctx.translate(x, y - 40);
  ctx.scale(s, s);
  wrapText(WRAP_CATCH, 0, 0, '#ffd23f', 4);
  ctx.restore();
  // the 5 s timer: an arc under its feet that empties
  ctx.lineCap = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(x, y + 24, 22, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.strokeStyle = '#ffd23f';
  ctx.beginPath();
  ctx.arc(x, y + 24, 22, 0.15 * Math.PI, 0.15 * Math.PI + 0.7 * Math.PI * clamp(w.life / WRAP.life, 0, 1));
  ctx.stroke();
}
function drawReveal(z, ox, oy) {
  // screen space, over the player: the edges dim, the wrapper spins open, the amount rolls up and the tier may grow
  const R = reveal,
    P = player;
  if (!R || !P || !P.alive) return;
  const x = P.x * z + ox,
    y = P.y * z + oy - revealOff(P, z),
    t = calm ? 0 : time,
    T = R.t;
  if (!calm) {
    const a = 0.35 * Math.min(1, T / 0.25) * (T < 1.2 ? 1 : Math.max(0, 1 - (T - 1.2) / 0.3));
    if (a > 0) {
      const g = ctx.createRadialGradient(x, y + 20, 60, x, y + 20, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(10,5,3,0)');
      g.addColorStop(1, `rgba(10,5,3,${a.toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }
  if (T < 0.3) {
    drawBonbon(x, y, calm ? 1.3 : 1 + T * 2, R.from, calm ? 0 : T * 30, false, t);
    wrapGlow(x, y, calm ? 60 : 40 + T * 120, 1, WRAP_RGB[R.from]);
    return;
  }
  const a = T < 2.2 ? 1 : Math.max(0, 1 - (T - 2.2) / 0.6),
    rgb = WRAP_RGB[R.tier],
    col = WRAP_COL[R.tier][0];
  wrapGlow(x, y, 70 + Math.sin(t * 8) * 6, 0.55 * a, rgb);
  if (R.flash > 0 && !calm) wrapGlow(x, y, 180 * R.flash + 40, R.flash, rgb);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.translate(x, y);
  const pp = R.flash > 0 && !calm ? 1 + R.flash * 0.35 : 1;
  ctx.scale(pp, pp);
  ctx.font = `900 42px ${FONT}`;
  wrapText(`+${R.shown}`, 0, 0, col, 7);
  if (WRAP_WORD[R.tier]) {
    ctx.font = `900 18px ${FONT}`;
    wrapText(WRAP_WORD[R.tier], 0, -38, col, 5);
  }
  ctx.restore();
}
function drawWrapBlip(mx, my, k) {
  // a blinking dot on the minimap (steady under calm)
  if (!wrap) return;
  ctx.globalAlpha = calm ? 1 : 0.55 + 0.45 * Math.sin(time * 10);
  ctx.fillStyle = WRAP_COL[wrap.tier][0];
  ctx.strokeStyle = '#3a2118';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(mx + wrap.x * k, my + wrap.y * k, 4, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 1;
}
