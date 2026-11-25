// ---------- streak juice: ×N over the candy, fuses, stamps, sugar rush and the summary ----------
// A streak is player.combo while player.comboT (the 2.6 s window) is still running. doBite calls onStreakBite, updateBlob calls onStreakEnd.
const STREAK = { win: 2.6, close: 0.45, low: 0.8, words: { 3: 'Ням!', 5: 'Хрум-хрум!', 7: 'Обжора!' } };
const STREAK_COL = ['', '#9be15d', '#ff9a3c', '#ff4f7b']; // the colour of each step
// 0: no streak (combo < 2), 1: ×2, 2: ×3-4, 3: ×5 and up
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
  // Task 4 hangs the runaway wrapper here: called once for every streak that lapses (combo > 1)
}

// the page side of a live streak: the chip, the fuse round the bite button, the sugar rush on the edges
function streakDom(P, lvl) {
  const f = clamp(P.comboT / STREAK.win, 0, 1),
    q = Math.round(f * 200) / 200,
    low = P.comboT < STREAK.low;
  if (q !== domF) {
    domF = q;
    dashEl.style.setProperty('--f', q);
  }
  if (lvl !== domLvl) {
    if (lvl === 3 && domLvl < 3) dashEl.style.setProperty('--sr', dashEl.offsetWidth / 2 + 13 + 'px');
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
  const word = close ? 'На волоске!' : STREAK.words[P.combo];
  if (word) addStamp(word);
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
  if (runActive && P === player) {
    sumEl.textContent = `Серия ×${P.combo} · +${Math.max(0, Math.floor(run.sugar - streak.start))} сахара`;
    sumEl.classList.add('on');
    streak.sumT = 2;
  }
  streakWrapHook(P);
}
function streakClear() {
  // a new life or run: nothing of the old streak stays on the page
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
}

// ---- drawing ----
function drawStreakFuse(z) {
  // a ring on the tray under the player that burns down with the 2.6 s window
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
