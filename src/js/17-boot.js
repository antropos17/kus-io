// ---------- loop & boot ----------
let last = 0,
  booted = false;
let perfAcc = 0,
  perfN = 0,
  goodWins = 0,
  lod = 0; // lod 0 = full detail, 1 = lighter, 2 = bare
let probe = null,
  lastUpAt = -99,
  upOffUntil = -99,
  workAcc = 0,
  lastResAt = -99;
const stepOff = { res: -99, lod: -99 }; // game time until which a kind of step is not tried again
function adapt(raw) {
  // keep the frame rate: try a smaller picture or less detail, keep whichever step actually helps
  if (SET.gfx !== 'auto' || raw > 0.1 || document.hidden) return;
  perfAcc += raw;
  perfN++;
  if (perfN < 45) return;
  const avg = perfAcc / perfN,
    work = workAcc / perfN;
  perfAcc = 0;
  perfN = 0;
  workAcc = 0; // seconds between frames; ms of our own script per frame
  const tight = work > fp * 620; // our own script fills most of a frame: frames are about to drop even if none has yet
  if (probe) {
    // did the last step buy anything? If not, undo it: the display itself is capped (iPhone low power mode) or the cause is elsewhere
    const pr = probe;
    probe = null;
    if ((pr.byWork ? work : avg) > pr.prev * 0.9) {
      if (pr.kind === 'res') {
        quality = pr.q;
        resize();
      } else lod = pr.l;
      stepOff[pr.kind] = time + 45;
      return;
    }
  }
  if (avg > 0.021 || tight) {
    const byWork = avg <= 0.021,
      prev = byWork ? work : avg; // judge the step by whatever called for it
    goodWins = 0;
    if (time - lastUpAt < 4) upOffUntil = time + 90; // the last step up was too much: stay put for a while
    const canLod = lod < 2 && time > stepOff.lod,
      canRes = quality > 0.5 && time > stepOff.res && (state !== 'play' || time - lastResAt > 12); // a new canvas size is a hitch of its own
    for (const k of byWork ? ['lod'] : work > 9 ? ['lod', 'res'] : ['res', 'lod']) {
      // less detail saves script time, a smaller picture saves drawing time
      if (k === 'lod' && canLod) {
        probe = { kind: 'lod', prev, byWork, l: lod };
        lod++;
        break;
      }
      if (k === 'res' && canRes) {
        probe = { kind: 'res', prev, byWork, q: quality };
        quality = Math.max(0.5, quality * 0.8);
        resize();
        lastResAt = time;
        break;
      }
    }
  } else if (avg < fp * 1.12 && work < Math.min(5, fp * 300)) {
    // every frame on time and most of it idle: there is room for more detail
    if (++goodWins >= 10 && time > upOffUntil) {
      goodWins = 0;
      if (lod > 0) {
        lod--;
        lastUpAt = time;
      } else if (quality < 1 && state !== 'play') {
        quality = Math.min(1, quality * 1.12);
        resize();
        lastUpAt = time;
      } // sharper picture only between rounds
    }
  } else goodWins = 0;
}
let fpsN = 0,
  fpsT = 0,
  fpsW = 0,
  fpsMax = 0;
const tick = new Float32Array(15).fill(1 / 60),
  tickS = new Float32Array(15);
let tickI = 0,
  fp = 1 / 60;
function frame(now) {
  const raw = (now - last) / 1000;
  last = now;
  adapt(raw);
  // a steady clock. The display ticks at a fixed rate while timers jitter around it (Safari rounds to whole milliseconds), so each frame
  // is snapped to a whole number of display ticks: bodies and camera then move by even steps instead of shivering
  let dt = raw > 0 ? raw : fp;
  if (raw > 0.002 && raw < 0.1) {
    tick[tickI] = raw;
    tickI = (tickI + 1) % 15;
    tickS.set(tick);
    tickS.sort();
    fp = tickS[4];
  } // the usual short frame is one display tick
  const n = Math.round(dt / fp);
  if (n >= 1 && n <= 3 && Math.abs(dt - n * fp) < fp * 0.3) dt = n * fp;
  if (dt > 0.05) dt = 0.05;
  const w0 = performance.now();
  if (!paused) {
    let sc = CHEAT.slow ? 0.45 : 1;
    if (slowT > 0) {
      slowT -= dt;
      sc *= 1 - 0.32 * Math.sin((Math.PI * Math.max(0, slowT)) / 0.4);
    }
    update(dt * sc);
  } // swallowing someone whole: time dips and flows back, never stops
  render();
  const wk = performance.now() - w0;
  workAcc += wk;
  if (SET.fps) {
    // frames a second, the worst gap between two frames, our own work per frame, detail level
    fpsN++;
    fpsT += raw;
    fpsW += wk;
    if (raw > fpsMax) fpsMax = raw;
    if (fpsT >= 0.5) {
      $('fpsTag').textContent =
        `${Math.round(fpsN / fpsT)} fps · худший ${Math.round(fpsMax * 1000)} мс · работа ${(fpsW / fpsN).toFixed(1)} мс · деталь ${2 - lod}/${Math.round(quality * 100)}%`;
      fpsN = 0;
      fpsT = 0;
      fpsW = 0;
      fpsMax = 0;
    }
  }
  requestAnimationFrame(frame);
}
function start(data) {
  if (booted) return;
  booted = true;
  data = data || {};
  let nm = typeof data.name === 'string' ? data.name : '';
  if (!nm)
    try {
      nm = localStorage.getItem('kus.name') || '';
    } catch (e) {}
  nick.value = nm;
  let col = Number.isInteger(data.color) ? data.color : -1;
  if (col < 0)
    try {
      const c = parseInt(localStorage.getItem('kus.color'), 10);
      if (c >= 0) col = c;
    } catch (e) {}
  if (col >= 0 && col < PALS.length) chosen = col;
  let stored = 0;
  try {
    stored = parseInt(localStorage.getItem('kus.best'), 10) || 0;
    chosenHat = localStorage.getItem('kus.hat') || 'none';
    chosenSkin = localStorage.getItem('kus.skin') || 'plain';
    sugar = Math.max(0, parseInt(localStorage.getItem('kus.sugar'), 10) || 0);
    if (localStorage.getItem('kus.lbmin') === '1') $('board').classList.add('min');
  } catch (e) {}
  if (typeof data.skin === 'string') chosenSkin = data.skin;
  if (typeof data.hat === 'string') chosenHat = data.hat;
  best = Math.max(+data.best || 0, stored);
  try {
    best3 = parseInt(localStorage.getItem('kus.best3'), 10) || 0;
    const md = localStorage.getItem('kus.mode');
    if (md === 't3' || md === 'daily') mode = md;
    const st = JSON.parse(localStorage.getItem('kus.set') || '{}');
    if (st.lefty === true) SET.lefty = true;
    if (st.gfx === 'low' || st.gfx === 'high') SET.gfx = st.gfx;
    SET.fps = st.fps === true;
    const dv = localStorage.getItem('kus.diff');
    if (DIFFS[dv]) diff = dv;
    const sn = JSON.parse(localStorage.getItem('kus.seen') || '{}');
    if (sn && typeof sn === 'object') seen = sn;
    if ([0.85, 1, 1.18].includes(st.bs)) SET.bs = st.bs;
    const m = JSON.parse(localStorage.getItem('kus.m') || 'null');
    if (m && Array.isArray(m.act) && Array.isArray(m.open)) {
      M.seq = m.seq | 0;
      M.act = m.act.filter((x) => x && typeof x.type === 'string' && x.need > 0);
      M.open = m.open.filter((x) => typeof x === 'string');
    }
  } catch (e) {}
  if (SKINS.some((k) => k[0] === chosenSkin) && !skinOpen(chosenSkin)) M.open.push(chosenSkin); // a skin picked before missions existed stays yours
  rollMissions();
  newcomer = best <= 0 && best3 <= 0; // the end of every run writes kus.best, so its absence means no run was ever finished
  try {
    if (localStorage.getItem('kus.best') !== null) newcomer = false;
  } catch (e) {}
  if (newcomer) {
    mode = 'free';
    diff = 'normal';
    document.body.classList.add('first');
  }
  if (challenge) {
    const t = dailyOf(todayKey());
    // parts in .lx drop out on a phone held sideways, where the line must stay one row
    $('chal').innerHTML = !challenge.d
      ? `${esc(challenge.n)} набрал ${challenge.c}. Побей в свободной игре!`
      : chalToday()
        ? `${esc(challenge.n)} набрал ${challenge.c} в конфете дня «${t.name}». Побей сегодня`
        : challenge.d > t.key
          ? `Это вызов на конфету за ${keyText(challenge.d)}<span class="lx">, у тебя она ещё не началась</span>. Сегодня «${t.name}»<span class="lx">, сыграй её</span>`
          : `Это ${challenge.d === prevKey(t.key) ? 'вчерашняя конфета' : `конфета за ${keyText(challenge.d)}`}, она уже закончилась. Сегодня<span class="lx"> новая</span>: «${t.name}»<span class="lx">, сыграй её</span>`;
    $('chal').classList.remove('hidden');
    mode = challenge.d ? 'daily' : 'free';
  }
  renderSwatches();
  renderSkins();
  renderHats();
  renderMissions();
  renderBank();
  renderMode();
  applySet();
  for (let i = 0; i < FOOD_TARGET; i++) addSprinkle();
  for (let i = 0; i < BOT_TARGET; i++) spawnBot(randomBotMass(true)).spawnT = 0;
  for (let i = 0; i < 150; i++) update(1 / 60); // let the arena get messy before the first frame
  menuTarget = pickMenuTarget();
  menuSwitchT = 14;
  if (menuTarget) {
    cam.x = menuTarget.x;
    cam.y = menuTarget.y;
  }
  last = performance.now();
  requestAnimationFrame(frame);
}
window.__kus = {
  Sfx,
  SFX_DATA,
  get cam() {
    return cam;
  },
  get fp() {
    return fp;
  },
  get state() {
    return state;
  },
  get player() {
    return player;
  },
  get blobs() {
    return blobs;
  },
  get strands() {
    return strands;
  },
  get chunks() {
    return chunks;
  },
  spawnBot,
  startGame,
  newAI,
  CHEAT,
  update,
  render,
  pause(v) {
    paused = !!v;
  },
  step(n = 1) {
    for (let i = 0; i < n; i++) update(1 / 60);
    render();
  },
  setCam(c) {
    debugCam = c;
  },
  setDiff(v) {
    diff = v;
    renderMode();
  },
  get leader() {
    return leader;
  },
  get lod() {
    return lod;
  },
  setLod(v) {
    lod = v;
    stepOff.lod = 1e9;
    upOffUntil = 1e9;
  },
  get quality() {
    return quality;
  },
  spawnSpecial,
  M,
  album,
  albumEat,
  albumCount,
  STICKERS,
  ALBUM_ROWS,
  openAlbum,
  closeAlbum,
  mission,
  get sugar() {
    return sugar;
  },
  setSugar(v) {
    sugar = v;
    renderBank();
    renderSkins();
  },
  get pickups() {
    return pickups;
  },
  setMode(m) {
    mode = m;
    renderMode();
  },
  toMenu,
  daily: {
    force(id) {
      dayForce = id;
    },
    of: dailyOf,
    todayKey,
    prevKey,
    save: dailySave,
    best: dailyBest,
    streak: dailyStreak,
    get rec() {
      return dailyRec;
    },
    get day() {
      return day;
    },
  },
  get challenge() {
    return challenge;
  },
  get run() {
    return run;
  },
  get timeLeft() {
    return timeLeft;
  },
  setTimeLeft(v) {
    timeLeft = v;
  },
  stick,
  get touch() {
    return touchMode;
  },
  place(b, x, y, face) {
    b.x = x;
    b.y = y;
    b.vx = b.vy = 0;
    if (face !== undefined) b.face = face;
    b.tx = x;
    b.ty = y;
    b.resetPoints();
  },
};
if (window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(hover: hover)').matches) setTouch(true);
addEventListener('orientationchange', () => setTimeout(resize, 250));
if (/tgWebApp/.test(location.hash) || window.TelegramWebviewProxy) {
  // opened as a Telegram Mini App
  const sc = document.createElement('script');
  sc.src = 'https://telegram.org/js/telegram-web-app.js';
  sc.onload = () => {
    try {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
      if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); // a swipe down must steer, not close the game
      if (tg.setHeaderColor) tg.setHeaderColor('#140b08');
      if (tg.setBackgroundColor) tg.setBackgroundColor('#140b08');
      const u = tg.initDataUnsafe && tg.initDataUnsafe.user;
      if (u && u.first_name && !nick.value) nick.value = String(u.first_name).slice(0, 14);
      setTimeout(resize, 300);
    } catch (e) {}
  };
  document.head.appendChild(sc);
}
try {
  // an icon for the browser tab and for "Add to Home Screen"
  const ic = document.createElement('canvas');
  ic.width = ic.height = 180;
  const g = ic.getContext('2d');
  g.fillStyle = '#2b1a14';
  g.fillRect(0, 0, 180, 180);
  const gr = g.createRadialGradient(70, 62, 8, 90, 92, 80);
  gr.addColorStop(0, '#ff9ab5');
  gr.addColorStop(0.55, '#ff4f7b');
  gr.addColorStop(1, '#c8264f');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(90, 92, 64, 0, TAU);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.arc(150, 40, 30, 0, TAU);
  g.fill();
  g.globalCompositeOperation = 'destination-over';
  g.fillStyle = '#2b1a14';
  g.fillRect(0, 0, 180, 180);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#fff';
  for (const x of [66, 112]) {
    g.beginPath();
    g.arc(x, 80, 13, 0, TAU);
    g.fill();
  }
  g.fillStyle = '#24110c';
  for (const x of [69, 115]) {
    g.beginPath();
    g.arc(x, 82, 6.5, 0, TAU);
    g.fill();
  }
  g.fillStyle = '#4a0c1f';
  g.beginPath();
  g.moveTo(62, 108);
  g.quadraticCurveTo(90, 100, 118, 108);
  g.quadraticCurveTo(90, 146, 62, 108);
  g.fill();
  g.fillStyle = '#fffaf2';
  for (const x of [70, 82, 94, 106]) g.fillRect(x - 4, 107, 8, 10);
  const url = ic.toDataURL('image/png');
  for (const rel of ['icon', 'apple-touch-icon']) {
    const l = document.createElement('link');
    l.rel = rel;
    l.href = url;
    document.head.appendChild(l);
  }
} catch (e) {}
const hot = window.claude && window.claude.hot;
if (hot && typeof hot.snapshot === 'function') hot.snapshot(() => ({ name: nick.value, color: chosen, best, hat: chosenHat, skin: chosenSkin }));
if (hot && typeof hot.ready === 'function') hot.ready(start);
else start((hot && hot.data) || {});
