// ---------- run stages (free play only) ----------
// A free run has an arc: a piranha raid, a sweet rain, then the Big Cake. Beating the cake ends the run with a win screen;
// «Вторая смена» (second shift) carries on from the same spot, the events come round again by timers and each lap's cake is tougher.
// The timed modes (t3, daily) and the world behind the menu keep the old free-roaming cake and piranhas.
const STAGE = {
  pir: { mass: 150, by: 45, name: t('stg.pir') }, // the player's mass that starts it, or the run second it starts by anyway
  rain: { mass: 600, by: 120, name: t('stg.rain'), T: 15 },
  boss: { mass: 1600, name: t('stg.boss') }, // no time ceiling
  gap: 8, // seconds of quiet after an event before the next one may start
  lap: { pir: 20, rain: 25, boss: 30 }, // second shift and later: seconds after the previous event ends
};
const STAGE_KEYS = ['pir', 'rain', 'boss'];
// the boss: a big cake with a hard crust; its only soft spot is the cherry on its back. It takes turns: «face» seconds turning its
// mouth to the player and biting, then «back» seconds slowly turning away, the window for the cherry. A cherry bite makes it whirl
// round (spin rad/s for spinT s) and start facing again. Its bites take mass from the player but do not make it bigger.
const BOSS = {
  mass: 1800,
  crust: 0.5,
  turn: 1.2,
  spin: 4.5,
  spinT: 0.7,
  bite: 1.8,
  biteCd: 1.2,
  face: 5,
  back: 4.5,
  lure: 4,
  sugar: 75,
  name: 'Большой Торт',
};
let stg = null; // { lap, i: next event, cur: the event under way, t0: segment start, endT: when the last event ended, winT, wonMass }
let clearRec = { best: 0, wins: 0 }; // kus.clear: the fastest first-shift clear in seconds and the number of clears
try {
  const v = JSON.parse(localStorage.getItem('kus.clear') || 'null');
  if (v && v.wins > 0) clearRec = { best: +v.best || 0, wins: v.wins | 0 };
} catch (e) {}
const stagesOn = () => mode === 'free' && (runActive || state === 'won'); // the ordinary cake and packs stay off the free run's field
const mmss = (s) => ((s = Math.round(s)), `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

function clearSpecials(all) {
  // ordinary cakes and packs leave the tray; all = the boss too
  for (const b of blobs) if ((b.kind === 'cake' && (all || !b.boss)) || b.kind === 'piranha') b.alive = false;
}
function stageStart() {
  stg = mode === 'free' ? { lap: 0, i: 0, cur: null, t0: time, endT: time, winT: 0, wonMass: 0 } : null;
  if (stg) clearSpecials(true);
}
function stageStop() {
  if (stg) for (const b of blobs) if (b.boss) b.alive = false;
  stg = null;
}
function announce(html, big) {
  addFeed(html, 5200);
  if (player && player.alive) floatText(player.x, player.y - player.Rs - 60 / cam.z, big, '#ffd23f', 30);
  Sfx.power();
  haptic(25);
  hudT = 0;
}
// a free place on a ring round the player: nothing may appear inside another body, or the contact would throw them apart in a frame
function ringSpot(d, r, edge) {
  const P = player;
  let best = null,
    bestGap = -1e9;
  for (let t = 0; t < 48; t++) {
    const a = rand(TAU),
      dd = d + (t >> 3) * 90,
      x = clamp(P.x + Math.cos(a) * dd, edge, WORLD - edge),
      y = clamp(P.y + Math.sin(a) * dd, edge, WORLD - edge);
    let gap = 1e9;
    for (const o of blobs) if (o.alive) gap = Math.min(gap, Math.hypot(o.x - x, o.y - y) - o.Rs - r);
    if (gap > 40) return [x, y];
    if (gap > bestGap) {
      bestGap = gap;
      best = [x, y];
    }
  }
  return best;
}
function raid(n) {
  // a pack that comes for the player: it spawns just in sensing range and rates the player above other prey
  const P = player,
    [x, y] = ringSpot(P.Rs + 540, 90, 120);
  const pack = spawnSpecial('piranha', n);
  for (const b of pack) {
    b.x = clamp(x + rand(-60, 60), 60, WORLD - 60);
    b.y = clamp(y + rand(-60, 60), 60, WORLD - 60);
    b.ai.raid = true;
    b.resetPoints();
  }
  return pack;
}
// a newcomer who is still small when the raid comes by the clock meets a smaller pack; piranhas never hunt a player under 90 anyway
const raidSize = (m) => (m < 100 ? 3 : m < 150 ? 4 : 6) + stg.lap * 2;
function beginEvent(k) {
  stageChompT = time + 0.64; // the HUD jaws chomp once
  const P = player,
    c = { k, t: 0 };
  if (k === 'pir') {
    c.pack = raid(raidSize(P.mass));
    announce(t('ann.pir'), t('ann.pirBig'));
  } else if (k === 'rain') {
    c.n = 0;
    c.acc = 0;
    c.picks = 0;
    announce(t('ann.rain'), t('ann.rainBig'));
  } else {
    const lap = stg.lap,
      m = Math.min(3400, BOSS.mass * (1 + 0.25 * lap)),
      R = massToR(m),
      [x, y] = ringSpot(P.Rs + R + 520, R, R + 60);
    const b = new Blob({
      name: lap ? `${BOSS.name} ${lap + 1}` : BOSS.name,
      acc: BOSS.name,
      pal: PAL_CAKE,
      mass: m,
      x,
      y,
      ai: newAI(),
      spawnT: 1.5,
      kind: 'cake',
    });
    b.boss = { turn: BOSS.turn * (1 + 0.25 * lap), spin: BOSS.spin * (1 + 0.15 * lap), crust: BOSS.crust * Math.pow(0.85, lap) };
    b.spinT = 0;
    b.ai.boss = true;
    b.ai.away = false; // turning its back right now
    b.face = b.fa = Math.atan2(P.y - b.y, P.x - b.x);
    blobs.push(b);
    c.b = b;
    c.m0 = m;
    c.esc = 0;
    c.phT = BOSS.face;
    announce(t('ann.boss', `<b>${esc(nameOf(b.name))}</b>`), t('ann.bossBig'));
  }
  stg.cur = c;
}
function endEvent() {
  const c = stg.cur;
  if (c.k === 'pir') for (const b of c.pack) if (b.ai) b.ai.raid = false; // survivors become an ordinary pack
  stg.cur = null;
  stg.i = (stg.i + 1) % STAGE_KEYS.length;
  stg.endT = time;
}
function rainStep(c, dt) {
  // dense sprinkles and a few bonuses around the player; fewer on a lighter detail level
  const P = player,
    rate = lod ? (lod > 1 ? 6 : 10) : 15,
    cap = lod ? (lod > 1 ? 80 : 140) : 210,
    view = (Math.max(W, H) / cam.z) * 0.5;
  c.acc += rate * dt;
  for (; c.acc >= 1; c.acc--) {
    if (c.n >= cap) break;
    c.n++;
    const a = rand(TAU),
      r = rand(P.Rs + 50, Math.max(P.Rs + 120, view * 0.75)),
      x = clamp(P.x + Math.cos(a) * r, 30, WORLD - 30),
      y = clamp(P.y + Math.sin(a) * r, 30, WORLD - 30);
    food.push({ kind: 0, x, y, m: 1.5, c: randi(SPRINKLES.length), ai: randi(8), sz: rand(3, 5.5) * 1.86 * 1.25 });
    sprinkleCount++;
    if (!lod && c.n % 4 === 0) parts.push({ ring: true, x, y, vx: 0, vy: 0, r: 7, t: 0, T: 0.3, c: '#fff1dc' });
  }
  if (c.picks < 3 && c.t > 1 + c.picks * 5) {
    c.picks++;
    const a = rand(TAU),
      r = rand(P.Rs + 140, P.Rs + 420);
    pickups.push({
      type: ['speed', 'shield', 'magnet'][randi(3)],
      x: clamp(P.x + Math.cos(a) * r, 220, WORLD - 220),
      y: clamp(P.y + Math.sin(a) * r, 220, WORLD - 220),
      t: 0,
    });
  }
}
function bossDown(A) {
  // the player swallowed the boss: time slows in an arc, then the win screen
  if (!stg || !A.isPlayer) return;
  stg.cur = null;
  stg.winT = 1.4;
  A.safe = true; // nobody bites the winner while the screen comes up
  floatText(A.x, A.y - A.Rs - 70 / cam.z, t('over.won'), '#ffd23f', 34);
  Sfx.ding(6);
  if (!calm) {
    slowT = slowLen = 1.3;
    slowDip = 0.55;
  }
}
function stageUpdate(dt) {
  if (!stg || mode !== 'free' || state !== 'play' || !runActive || !player || !player.alive) return;
  if (stg.winT > 0) {
    stg.winT -= dt;
    if (stg.winT <= 0) stageWin();
    return;
  }
  const P = player,
    c = stg.cur;
  if (c) {
    c.t += dt;
    if (c.k === 'pir') {
      if (!c.pack.some((b) => b.alive) || c.t > 30) endEvent();
    } else if (c.k === 'rain') {
      rainStep(c, dt);
      if (c.t >= STAGE.rain.T) endEvent();
    } else {
      const b = c.b;
      if (!b.alive)
        endEvent(); // gone some other way: no win
      else if (b.ai) {
        b.spinT -= dt;
        if (b.mass > c.m0) b.mass = c.m0;
        if (b.spinT > 0 && b.ai.away) {
          b.ai.away = false; // bitten in the cherry: face the biter again
          c.phT = BOSS.face + stg.lap;
        }
        if ((c.phT -= dt) <= 0) {
          b.ai.away = !b.ai.away;
          c.phT = b.ai.away ? Math.max(2, BOSS.back - 0.5 * stg.lap) : BOSS.face + stg.lap;
        }
        // the retinue: a piranha pack at two thirds and at one third of the cake
        if (c.esc < 2 && b.mass < c.m0 * (c.esc ? 0.34 : 0.67)) {
          c.esc++;
          raid(4 + stg.lap * 2);
          addFeed(t('feed.retinue'), 3600);
          Sfx.power();
        }
      }
    }
    return;
  }
  const k = STAGE_KEYS[stg.i],
    since = time - stg.endT;
  if (stg.i && since < STAGE.gap) return;
  const go = stg.lap ? since >= STAGE.lap[k] : P.stats.maxMass >= STAGE[k].mass || (STAGE[k].by && time - stg.t0 >= STAGE[k].by); // the peak counts: big ones melt a little every frame
  if (go) beginEvent(k);
}
function stageLine() {
  // the HUD line under the mass: the next event and how close it is, or the event under way; [text, progress 0..1]
  if (!stg || mode !== 'free' || !runActive || !player) return ['', -1];
  const c = stg.cur,
    lap = stg.lap ? t('stg.lap', stg.lap + 1) : '';
  if (stg.winT > 0) return [t('over.won'), 1];
  if (c) {
    if (c.k === 'pir') {
      const n = c.pack.filter((b) => b.alive).length;
      return [lap + t('stg.pirHere', n), 1 - c.t / 30];
    }
    if (c.k === 'rain') return [lap + t('stg.rainOn', Math.ceil(STAGE.rain.T - c.t)), 1 - c.t / STAGE.rain.T];
    const p = clamp(c.b.mass / c.m0, 0, 1);
    return [lap + t('stg.cakeOn', Math.round(p * 100)), p];
  }
  const k = STAGE_KEYS[stg.i],
    s = STAGE[k];
  if (stg.lap) {
    const left = Math.max(0, Math.max(STAGE.lap[k], stg.i ? STAGE.gap : 0) - (time - stg.endT));
    return [lap + t('stg.next', t('stg.n.' + k), Math.ceil(left)), 1 - left / STAGE.lap[k]];
  }
  const m = player.stats.maxMass,
    p = Math.max(m / s.mass, s.by ? (time - stg.t0) / s.by : 0);
  return [t('stg.to', s.name, Math.max(1, Math.ceil(s.mass - m))), clamp(p, 0, 1)];
}
let lastStage = '',
  stageIcon = '';
function renderStage() {
  const [t, p] = stageLine(),
    el = $('stage'),
    kind = t ? stageKind() : '',
    hungry = !!kind && p >= 0.85 && !stg.cur && !(stg.winT > 0), // waiting for the next event and it is almost here
    chomp = time < stageChompT,
    key = t + '|' + (p < 0 ? -1 : Math.round(p * 40)) + '|' + kind + (hungry ? 'h' : '') + (chomp ? 'c' : '');
  if (key === lastStage) return;
  lastStage = key;
  el.classList.toggle('off', !t);
  el.classList.toggle('hungry', hungry);
  el.classList.toggle('chomp', chomp);
  if (!t) return;
  const m = /^(.*\S)\s+(\d+(?:\s*[сs]|%)?)$/.exec(t); // a trailing number goes to its own slot so a long label can shrink but not the number
  el.querySelector('.t').textContent = m ? m[1] + ' ' : t; // the space keeps the line readable as plain text
  el.querySelector('b').textContent = m ? m[2] : '';
  if (kind !== stageIcon) {
    stageIcon = kind;
    const old = el.querySelector('.ic');
    if (old) old.remove();
    el.insertAdjacentHTML('beforeend', STAGE_ICON[kind]);
  }
  el.style.setProperty('--p', p < 0 ? '0' : p.toFixed(3));
}
function stageWin() {
  const P = player,
    secs = time - run.t0,
    first = stg.lap === 0;
  earn(BOSS.sugar); // once for each cake beaten; finishRun pays it only for a clean run
  tally();
  run.won = { secs, lap: stg.lap, rec: false, prev: clearRec.best || 0 }; // prev: the record before this win, for the trophy card
  if (!run.cheated && first) {
    run.won.rec = !clearRec.best || secs < clearRec.best;
    if (run.won.rec) clearRec.best = Math.round(secs * 10) / 10;
    clearRec.wins++;
    try {
      localStorage.setItem('kus.clear', JSON.stringify(clearRec));
    } catch (e) {}
  }
  finishRun();
  state = 'won';
  stg.wonMass = P.mass;
  stick.id = -1;
  stick.on = false;
  input.dashHeld = false;
  showOver();
}
function secondShift() {
  // the same candy, mass and place; a fresh score and sugar count, the events by timers and faster
  const P = player;
  rollMissions();
  saveM();
  run = { bites: 0, kills: 0, max: 0, deaths: 0, t0: time, cheated: false, sugar: 0, lap: stg.lap + 1 };
  sugarReset();
  runActive = true;
  state = 'play';
  P.safe = false;
  P.mass = stg.wonMass;
  P.spawnT = 1.5;
  P.stats = { bites: 0, kills: 0, maxMass: P.mass, t0: time };
  stg.lap++;
  stg.i = 0;
  stg.cur = null;
  stg.endT = time;
  stg.t0 = time;
  clearSpecials(false);
  document.body.classList.add('playing');
  overEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  feedEl.innerHTML = '';
  hudT = 0;
  addFeed(t('feed.lap', stg.lap + 1), 5200);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}
