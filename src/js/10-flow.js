// ---------- game flow ----------
function biggest() {
  let t = null;
  for (const b of blobs) if (b.alive && (!t || b.mass > t.mass)) t = b;
  return t;
}
function addFeed(html, ms) {
  const d = document.createElement('div');
  d.innerHTML = html;
  feedEl.prepend(d);
  // a newcomer's first seconds keep to two plaques, so the field in front of the player stays clear
  const cap = tutor || (run && run.dayNote) ? 2 : 4;
  while (feedEl.children.length > cap) feedEl.lastElementChild.remove();
  setTimeout(() => {
    d.style.opacity = '0';
    setTimeout(() => d.remove(), 500);
  }, ms || 3600);
}
function feedKill(A, B) {
  if (A.isPlayer) addFeed(t('feed.youAte', `<b>${esc(accOf(B))}</b>`));
  else if (
    !tutor && // the first run's lesson is not pushed out by other candies' meals
    !B.isPlayer &&
    state === 'play' &&
    player &&
    player.alive &&
    (Math.hypot(A.x - player.x, A.y - player.y) < (Math.max(W, H) / cam.z) * 0.6 || A === biggest())
  )
    addFeed(t('feed.ate', `<b>${esc(A.isPlayer ? A.name : nameOf(A.name))}</b>`, `<b>${esc(accOf(B))}</b>`));
}
const MTYPES = [
  // [key, wording, first target]; only real actions in a clean run count
  ['bites', t('mis.bites'), 10],
  ['food', t('mis.food'), 60],
  ['kills', t('mis.kills'), 3],
  ['mass', t('mis.mass'), 150],
  ['wound', t('mis.wound'), 4],
  ['tongue', t('mis.tongue'), 5],
  ['time', t('mis.time'), 60],
  ['pickup', t('mis.pickup'), 3],
  ['piranha', t('mis.piranha'), 4],
  ['hedge', t('mis.hedge'), 2],
  ['cake', t('mis.cake'), 3],
  ['combo', t('mis.combo'), 3],
  ['top', t('mis.top'), 10],
];
const skinOpen = (id) => owns('skin', id);
function saveM() {
  try {
    localStorage.setItem('kus.m', JSON.stringify(M));
  } catch (e) {}
}
function rollMissions() {
  // finished missions make way for new ones, each a little bigger than the last of its kind
  M.act = M.act.filter((m) => m && m.got < m.need && MTYPES.some((t) => t[0] === m.type));
  for (const m of M.act) {
    const cap = MIS_CAP[m.type]; // a target saved before the caps is cut back
    if (cap && m.need > cap) {
      m.need = cap;
      m.got = Math.min(m.got, cap - 1);
    }
  }
  for (let guard = 0; M.act.length < 3 && guard < 40; guard++) {
    const i = M.seq++,
      t = MTYPES[i % MTYPES.length];
    if (M.act.some((m) => m.type === t[0])) continue;
    const c = Math.floor(i / MTYPES.length);
    M.act.push({ type: t[0], need: Math.min(MIS_CAP[t[0]] || Infinity, Math.round(t[2] * (1 + c * 0.6))), got: 0, c, at: 0, idle: 0 });
  }
}
function mission(type, n, absolute) {
  if (!runActive || !player || player.cheated) return;
  if (!absolute && SUGAR[type]) earn(n * SUGAR[type] * (type === 'bites' ? Math.min(player.combo || 1, 5) : 1)); // a streak sweetens every bite
  for (const m of M.act) {
    if (m.type !== type || m.got >= m.need) continue;
    m.got = absolute ? Math.max(m.got, Math.min(m.need, Math.floor(n))) : Math.min(m.need, m.got + n);
    if (m.got >= m.need) {
      // done: the prize is sugar, more for a later circle of missions
      m.paid = misReward(m);
      earn(m.paid);
      if (run.mis) run.mis.push(m.c | 0);
      addFeed(t('mis.doneSugar', m.paid));
      Sfx.power();
      saveM();
    }
  }
}
// a mission's prize: a pattern id, or its Russian name in a save from before the English version
const skinName = (p) => {
  const id = SKINS.some((s) => s[0] === p) ? p : (Object.keys(STR).find((k) => k.startsWith('skin.') && STR[k][0] === p) || '').slice(5);
  return id ? t('skin.' + id) : p;
};
const missionRows = () =>
  M.act
    .map((m) => {
      const mt = MTYPES.find((x) => x[0] === m.type),
        done = m.got >= m.need;
      return `<div class="mi${done ? ' ok' : ''}"><span class="mt">${mt[1]}${done ? (m.prize ? t('mis.prize', skinName(m.prize)) : m.paid ? t('mis.paid', m.paid) : t('mis.ok')) : ''}</span><span class="mv">${Math.floor(m.got)} / ${m.need}</span><div class="mb"><i style="width:${Math.round((100 * m.got) / m.need)}%"></i></div></div>`;
    })
    .join('');
// ---------- sugar ----------
const sugarEl = $('sugar');
function earn(n) {
  run.sugar += n;
  sugarSync(); // flying cubes hold their share back until they land
}
function saveSugar() {
  try {
    localStorage.setItem('kus.sugar', String(sugar));
  } catch (e) {}
}
function countUp(el, n) {
  if (calm || n < 2) {
    el.textContent = '+' + n;
    return;
  }
  const t0 = performance.now(),
    tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 800);
      el.textContent = '+' + Math.round(n * (1 - (1 - k) * (1 - k)));
      if (k < 1) requestAnimationFrame(tick);
    };
  tick();
}
function nearText(m, score) {
  // the "so close" line: the nearest thing just out of reach
  const out = [],
    t3 = m === 't3';
  if (!run.cheated) {
    if (m === 'daily' && score < run.dayPrev) out.push(t('near.day', run.dayPrev - score));
    if (t3 && score < best3) out.push(t('near.t3', best3 - score));
    if (m === 'free' && score < best) out.push(t('near.rec', best - score));
  }
  const al = run.cheated ? '' : albumNear();
  if (al) out.splice(1, 0, al); // a row one or two stickers short comes right after the record
  const c = cheapestUnowned();
  if (c && !al) {
    const name = itemName(c.slot, c.id);
    out.push(sugar >= c.price ? t('near.can', name) : t('near.need', name, c.price - sugar));
  }
  return out.slice(0, 2).join('. ');
}
function renderSweet(m, score) {
  const got = run.got || 0;
  $('sweet').classList.toggle('hidden', !got);
  overEl.querySelector('.card').classList.toggle('paid', !!got); // on short screens the sugar takes the missions' place
  $('near').textContent = nearText(m, score);
  if (!got) return;
  countUp($('sweetN'), got);
  $('sweetBank').textContent = t('sweet.bank', sugar);
  $('chestT').textContent = t('chest.t');
  chestCards();
  run.chestBase = clamp(Math.round(got * 0.3), 3, 40);
  run.rerolled = false;
  rerollAsk = false;
  renderReroll(false);
}
function chestCards() {
  $('chestRow').innerHTML = [0, 1, 2].map((i) => `<button type="button" data-i="${i}" aria-label="${t('chest.a', i + 1)}">?</button>`).join('');
}
let rerollAsk = false; // the first tap on the reroll button asked, the second pays
function rerollPrice() {
  return 3 * run.chestBase;
}
function renderReroll(picked) {
  const show = picked && !run.rerolled && sugar >= rerollPrice();
  $('chestAgain').classList.toggle('hidden', !show);
  $('chestOdds').classList.toggle('hidden', !show);
  overEl.querySelector('.card').classList.toggle('rr', show); // short screens: the reroll row takes the «almost» line's place
  if (!show) return;
  $('chestAgain').textContent = rerollAsk ? t('chest.againAsk', rerollPrice()) : t('chest.again', rerollPrice());
  $('chestOdds').textContent = t('chest.odds');
}
$('chestRow').addEventListener('click', (e) => {
  const pick = e.target.closest('button');
  if (!pick || !run.chest) return;
  run.chest = false;
  const base = run.chestBase,
    prizes = [base, base * 2, base * 5];
  for (let i = 2; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [prizes[i], prizes[j]] = [prizes[j], prizes[i]];
  }
  const won = prizes[+pick.dataset.i];
  sugar += won;
  saveSugar();
  [...$('chestRow').children].forEach((b, i) => {
    b.textContent = '+' + prizes[i];
    b.disabled = true;
    b.classList.add(b === pick ? 'got' : 'open');
  });
  $('chestT').textContent = t(won === base * 5 ? 'chest.top' : 'chest.got', won);
  $('sweetBank').textContent = t('sweet.bank', sugar);
  $('near').textContent = nearText(mode, Math.round(run.max));
  Sfx.power();
  haptic(won === base * 5 ? 30 : 12);
  rerollAsk = false;
  renderReroll(true);
});
$('chestAgain').addEventListener('click', () => {
  const price = rerollPrice();
  if (run.chest || run.rerolled || sugar < price) return;
  if (!rerollAsk) {
    rerollAsk = true;
    renderReroll(true);
    return;
  }
  sugar -= price;
  saveSugar();
  run.rerolled = true;
  run.chest = true;
  rerollAsk = false;
  $('chestT').textContent = t('chest.t');
  chestCards();
  $('sweetBank').textContent = t('sweet.bank', sugar);
  $('near').textContent = nearText(mode, Math.round(run.max));
  renderReroll(false);
  Sfx.power();
  haptic(12);
});
function renderMissions() {
  $('misT').textContent = t('mis.head');
  $('misList').innerHTML = missionRows();
  renderSecs();
}
function renderMode() {
  for (const b of $('modeSeg').children) b.setAttribute('aria-pressed', String(b.dataset.m === mode));
  for (const b of $('diffSeg').children) b.setAttribute('aria-pressed', String(b.dataset.v === diff));
  renderDaily();
  renderSecs();
}
const timed = () => mode === 't3' || mode === 'daily';
let diffPick = null; // the difficulty chosen in the menu while the candy of the day plays on normal
function fixDiff() {
  if (mode === 'daily') {
    if (!diffPick) diffPick = diff;
    diff = 'normal';
  } else if (diffPick) {
    diff = diffPick;
    diffPick = null;
  }
}
function spawnPlayer(spawnT) {
  const m0 = day === 'tiny' ? 16 : DIFFS[diff].start;
  shownMass = m0;
  const name = (nick.value || '').trim().slice(0, 14) || t('defName'),
    [x, y] = safeSpawn();
  player = new Blob({
    name,
    pal: PALS[chosen],
    mass: m0,
    x,
    y,
    isPlayer: true,
    spawnT,
    hat: owns('hat', chosenHat) ? chosenHat : 'none',
    eyes: owns('eyes', chosenEyes) ? chosenEyes : 'none',
    trail: owns('trail', chosenTrail) ? chosenTrail : 'none',
    skin: skinOpen(chosenSkin) ? chosenSkin : 'plain',
  });
  blobs.push(player);
  state = 'play';
  killer = null;
  deadT = 0;
  cam.x = x;
  cam.y = y;
  input.sx = W / 2 + 1;
  input.sy = H / 2;
  stick.id = -1;
  stick.on = false;
  stick.mag = 0;
  input.dashHeld = false;
}
function startGame() {
  trophyStop(); // the win card's glaze, for «Вторая смена» and a new game alike
  if (state === 'won') return secondShift(); // the win screen's main button carries on
  if (state === 'play' || (state === 'dead' && overEl.classList.contains('hidden'))) return;
  Sfx.init();
  const typed = (nick.value || '').trim().slice(0, 14),
    name = typed || t('defName');
  try {
    localStorage.setItem('kus.name', typed); // the default is never saved: it follows the language
    localStorage.setItem('kus.color', String(chosen));
    localStorage.setItem('kus.hat', chosenHat);
    localStorage.setItem('kus.eyes', chosenEyes);
    localStorage.setItem('kus.trail', chosenTrail);
    localStorage.setItem('kus.skin', chosenSkin);
    localStorage.setItem('kus.mode', mode);
    localStorage.setItem('kus.diff', diffPick || diff);
  } catch (e) {}
  fixDiff();
  clearAsk();
  rollMissions();
  saveM();
  run = { bites: 0, kills: 0, max: 0, deaths: 0, t0: time, cheated: false, sugar: 0, mis: [] };
  for (const m of M.act) m.at = m.got;
  clearWrap();
  sugarReset();
  runActive = true;
  timeLeft = timed() ? 180 : 0;
  day = null;
  if (mode === 'daily') startDaily();
  stageStart();
  spawnPlayer(4);
  tutor = newcomer ? { prey: tutorPrey() } : null;
  document.body.classList.add('playing');
  menuEl.classList.add('hidden');
  overEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  feedEl.innerHTML = '';
  hudT = 0;
  if (touchMode) {
    addFeed(SET.lefty ? t('tip.touchL') : t('tip.touchR'));
    if (!tutor) addFeed(t('tip.colorsT')); // the first run tells this after the first bite
  } else if (tutor) addFeed(t('tip.mouse'));
  else addFeed(t('tip.colorsM'));
  if (day) {
    if (tutor)
      run.dayNote = true; // a newcomer learns to steer and bite first, the twist is told after that
    else dayFeed();
  }
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}
function dayFeed() {
  run.dayNote = false;
  addFeed(`<b>${run.rule.name}</b>: ${run.rule.note.charAt(0).toLowerCase() + run.rule.note.slice(1)}`, 6500);
}
function tally() {
  const st = player.stats;
  run.bites += st.bites;
  run.kills += st.kills;
  run.max = Math.max(run.max, st.maxMass);
  if (player.cheated) run.cheated = true;
}
function finishRun() {
  clearWrap(); // a wrapper still running or in its reveal pays nothing
  sugarSettle();
  runActive = false;
  document.body.classList.remove('playing');
  prevBest = best;
  prevBest3 = best3;
  run.got = 0;
  if (!run.cheated) {
    if (mode === 't3') best3 = Math.max(best3, Math.round(run.max));
    else if (mode === 'daily') dailySave(run.day, Math.round(run.max));
    else best = Math.max(best, Math.round(run.max));
    run.got = Math.floor(run.sugar + Math.sqrt(run.max)); // plus a bonus for the biggest mass that tails off
    sugar += run.got;
  }
  run.chest = run.got > 0;
  saveSugar();
  if (!run.cheated) {
    // a mission that made no headway in this whole run (deaths inside it count once) makes way after MIS_IDLE runs
    for (const m of M.act) if (m.got < m.need) m.idle = m.got > (m.at | 0) ? 0 : (m.idle | 0) + 1;
    M.act = M.act.filter((m) => !(m.idle >= MIS_IDLE));
    saveM();
  }
  try {
    localStorage.setItem('kus.best', String(best));
    localStorage.setItem('kus.best3', String(best3));
  } catch (e) {}
  saveM();
  renderHats();
  if (tutor) tutor.prey.tame = false;
  tutor = null;
  if (newcomer) {
    newcomer = false; // from now on the menu is the full one
    document.body.classList.remove('first');
  }
}
function die(by) {
  clearWrap();
  tally();
  stick.id = -1;
  stick.on = false;
  input.dashHeld = false;
  state = 'dead';
  deadT = 0;
  killer = by;
  if (timed() && runActive && timeLeft > 0) {
    run.deaths++;
    addFeed(t('feed.back'));
    return;
  } // the clock keeps running
  finishRun();
}
function endTimed() {
  if (player && player.alive) {
    tally();
    player.alive = false;
    spawnDust(player.x, player.y, player.pal, 0, 0, 12);
  }
  stick.id = -1;
  stick.on = false;
  input.dashHeld = false;
  killer = null;
  state = 'dead';
  deadT = 0;
  finishRun();
}
function toMenu() {
  clearAsk();
  clearWrap();
  sugarSettle();
  if (state === 'play' && player && player.alive) {
    tally();
    player.alive = false;
    finishRun();
  }
  if (state === 'won' && player) {
    player.alive = false;
    spawnDust(player.x, player.y, player.pal, 0, 0, 12);
  } // the run was paid out when the cake fell
  stageStop();
  trophyStop();
  state = 'menu';
  paused = false;
  runActive = false;
  day = null;
  if (diffPick) {
    diff = diffPick;
    diffPick = null;
  }
  document.body.classList.remove('playing');
  overEl.classList.add('hidden');
  $('pause').classList.add('hidden');
  hudEl.classList.add('hidden');
  menuEl.classList.remove('hidden');
  setHome(true);
  renderSkins();
  renderHats();
  renderMissions();
  renderBank();
  renderMode();
  menuSwitchT = 0;
  menuFade();
}
function showOver() {
  const t3 = timed(),
    daily = mode === 'daily' && run.rule,
    secs = Math.max(0, Math.round(time - run.t0)),
    score = Math.round(run.max);
  const won = run.won,
    shift = run.lap ? t('shift', run.lap + 1) + '. ' : '';
  const card = overEl.querySelector('.card');
  card.classList.toggle('trophy', !!won); // the trophy look and its record pill belong to a win only
  card.classList.toggle('rec', !!(won && won.rec));
  $('overWrap').classList.toggle('trophy', !!won);
  $('overT').textContent = t(won ? 'over.won' : t3 ? 'over.time' : 'over.t');
  const rec = $('trRec'),
    tiles = $('trTiles').querySelectorAll('b');
  rec.textContent = won && won.rec ? (won.prev ? t('tr.rec', mmss(won.prev)) : t('tr.first')) : '';
  rec.classList.toggle('hidden', !rec.textContent);
  if (won) {
    tiles[0].textContent = score;
    tiles[1].textContent = run.bites;
    tiles[2].textContent = run.got;
  }
  whoEl.innerHTML = won
    ? t('tr.who', won.lap ? t('shift', won.lap + 1) : t('shift1'), `<b>${mmss(won.secs)}</b>`)
    : (shift ? esc(shift) : '') +
      (daily
        ? t('who.daily', esc(run.rule.name))
        : t3
          ? t('who.t3')
          : killer
            ? t('who.killer', `<b>${esc(nameOf(killer.name))}</b>`)
            : t('who.torn'));
  $('sMax').textContent = score;
  $('sBites').textContent = run.bites;
  $('sKills').textContent = run.kills;
  $('sTime').textContent = t3 ? run.deaths : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  $('sTimeL').textContent = t(t3 ? 'st.deaths' : 'st.time');
  $('overMis').innerHTML = missionRows();
  renderSweet(mode, score);
  renderAlbumLine();
  const streak = daily ? dailyStreak(run.day) : 0;
  bestEl.textContent = run.cheated
    ? daily
      ? t('best.cheatDay')
      : t('best.cheat')
    : daily
      ? t(score > run.dayPrev && run.dayPrev ? 'best.dayNew' : 'best.day', dailyBest(run.day)) +
        (streak > 1 ? t('best.streak', streak, daysWord(streak)) : t('best.streak1')) +
        (dailyRec.top > streak ? t('best.streakTop', dailyRec.top) : '')
      : t3
        ? best3 > prevBest3
          ? t('best.t3New', best3)
          : t('best.t3', best3)
        : best > prevBest
          ? t('best.recNew', best)
          : t('rec', best);
  if (won && !run.cheated)
    bestEl.textContent = won.lap
      ? t('best.lap', mmss(clearRec.best))
      : t(won.rec ? 'best.clearNew' : 'best.clear', mmss(clearRec.best), clearRec.wins);
  else if (won) bestEl.textContent = t('best.cheatWin');
  $('again').textContent = won ? (won.lap ? t('shift', won.lap + 2) : t('shift2')) : t('over.again');
  $('chalRes').textContent =
    !challenge || (t3 && !(daily && challenge.d === run.day)) || (!t3 && challenge.d) || run.cheated
      ? ''
      : daily
        ? t(score > challenge.c ? 'chal.dayWon' : 'chal.day', challenge.n, challenge.c, score)
        : score > challenge.c
          ? t('chal.won', challenge.n, challenge.c, score)
          : t('chal.res', challenge.n, challenge.c, score);
  card.classList.toggle('chal', !!$('chalRes').textContent); // on short screens the challenge line takes the "so close" line's place
  $('chalBtn').classList.toggle('hidden', (t3 && !daily) || run.cheated || score < 1);
  $('chalBtn').textContent = t(daily || won ? 'over.share' : 'over.chal');
  $('chalLink').classList.add('hidden');
  overEl.classList.remove('hidden');
  hudEl.classList.add('hidden');
  // the glaze frame goes on after the card is shown: it is measured on the card
  if (won) trophyStart(card);
  else trophyStop();
  setTimeout(() => $('again').focus({ preventScroll: true }), 50);
}

function pickMenuTarget() {
  let pick = null,
    ps = -1;
  for (const b of blobs) {
    if (!b.alive) continue;
    let near = 0;
    for (const o of blobs) if (o !== b && o.alive && Math.hypot(o.x - b.x, o.y - b.y) < 700) near++;
    const s = near * 2 + Math.min(b.mass, 400) / 80 + rand();
    if (s > ps) {
      ps = s;
      pick = b;
    }
  }
  return pick;
}
function focusOffset() {
  return state !== 'menu' || debugCam ? [0, 0] : W >= 760 ? [W * 0.17, 0] : [0, -H * 0.22];
}
function updateCamera(dt) {
  if (debugCam) {
    cam.x = debugCam.x;
    cam.y = debugCam.y;
    cam.z = cam.zb = debugCam.z;
    cam.shake = cam.kx = cam.ky = cam.kvx = cam.kvy = cam.zk = cam.zv = 0;
    return;
  }
  const vf = clamp(Math.sqrt(W * H) / 850, 0.72, 1.4); // small screens see a little wider
  let fx = cam.x,
    fy = cam.y,
    tz = cam.z,
    follow = 5;
  if ((state === 'play' || state === 'won') && player && player.alive) {
    fx = player.x;
    fy = player.y;
    tz = 1.05 * Math.pow(32 / player.Rs, 0.42) * vf;
    follow = 9;
  } else if (state === 'dead') {
    if (killer && killer.alive) {
      fx = killer.x;
      fy = killer.y;
    }
    follow = 3;
  } else {
    menuSwitchT -= dt;
    if (!menuTarget || !menuTarget.alive || menuSwitchT <= 0) {
      menuTarget = pickMenuTarget();
      menuSwitchT = 14;
    }
    if (menuTarget) {
      fx = menuTarget.x;
      fy = menuTarget.y;
      tz = 0.8 * vf * Math.pow(45 / menuTarget.Rs, 0.3);
    }
    follow = 2.5;
  }
  tz = clamp(tz, 0.22, 1.7);
  const k = 1 - Math.exp(-dt * follow);
  cam.x += (fx - cam.x) * k;
  cam.y += (fy - cam.y) * k;
  cam.zb += (tz - cam.zb) * (1 - Math.exp(-dt * 2.2));
  if (cam.shake > 0 && !calm) {
    const a = cam.sa === null ? rand(TAU) : cam.sa,
      v = Math.min(cam.shake, 14) * 26;
    cam.kvx += Math.cos(a) * v;
    cam.kvy += Math.sin(a) * v;
  } // one push, then the spring carries it: a thump, not a rattle
  cam.shake = 0;
  cam.sa = null;
  for (let n = dt > 0.02 ? 2 : 1, h = dt / n, i = 0; i < n; i++) {
    cam.kvx += (-cam.kx * 420 - cam.kvx * 24) * h;
    cam.kx += cam.kvx * h;
    cam.kvy += (-cam.ky * 420 - cam.kvy * 24) * h;
    cam.ky += cam.kvy * h;
    cam.zv += (-cam.zk * 260 - cam.zv * 22) * h;
    cam.zk = clamp(cam.zk + cam.zv * h, -0.06, 0.1);
  }
  if (calm) cam.kx = cam.ky = cam.zk = cam.kvx = cam.kvy = cam.zv = 0;
  cam.z = cam.zb * (1 + cam.zk);
  if (calm) flashT = 0;
}

let hudT = 0,
  lastDashPct = -1,
  lastDodgePct = -1,
  lastLb = '',
  shownMass = 0,
  shownInt = -1;
function bumpMass() {
  if (!player || state !== 'play') return;
  if (!calm && massEl.animate)
    massEl.animate([{ transform: 'scale(1.24)', color: '#ffd23f' }, { transform: 'scale(1)' }], {
      duration: 240,
      easing: 'cubic-bezier(.2,1.5,.4,1)',
    });
}
function lbRow(n, b) {
  return `<li class="${b.isPlayer ? 'me' : ''}"><span class="n">${n}</span><i style="background:${b.pal.base}"></i><span class="nm">${esc(b.isPlayer ? b.name : nameOf(b.name))}</span><span class="m">${Math.round(b.mass)}</span></li>`;
}
function updateHUD(dt) {
  const pct = player && player.alive ? clamp(1 - player.dashCd / 1.5, 0, 1) : 1;
  if (Math.abs(pct - lastDashPct) > 0.04 || (pct === 1 && lastDashPct !== 1)) {
    dashEl.style.setProperty('--p', pct.toFixed(3));
    dashEl.classList.toggle('ready', pct >= 1);
    lastDashPct = pct;
  }
  const dp = player && player.alive ? (player.tongue ? 0 : clamp(1 - player.dodgeCd / (2.6 + player.Rs / 60), 0, 1)) : 1;
  if (Math.abs(dp - lastDodgePct) > 0.04 || (dp === 1 && lastDodgePct !== 1)) {
    dodgeEl.style.setProperty('--p', dp.toFixed(3));
    dodgeEl.classList.toggle('ready', dp >= 1);
    lastDodgePct = dp;
  }
  if (player && player.alive && state === 'play') {
    // the number rolls up to the new mass instead of jumping
    shownMass += (player.mass - shownMass) * (1 - Math.exp(-dt * 9));
    if (Math.abs(player.mass - shownMass) > 400) shownMass = player.mass;
    const v = Math.round(shownMass);
    if (v !== shownInt) {
      shownInt = v;
      massEl.textContent = v;
    }
  }
  hudT -= dt;
  if (hudT > 0) return;
  hudT = 0.25;
  if (player && player.alive && state === 'play') {
    mission('mass', player.mass, true);
    mission('time', time - player.stats.t0, true);
  }
  const tl = Math.ceil(timeLeft);
  $('timer').textContent = runActive && timed() ? t('hud.left', `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`) : '';
  $('goal').textContent = !runActive
    ? ''
    : day
      ? t('hud.daily', run.rule.name) + (challenge && challenge.d === run.day ? t('hud.beat', challenge.c) : '')
      : challenge && !challenge.d && mode === 'free'
        ? t('hud.goal', challenge.c)
        : '';
  renderStage();
  renderFx();
  const list = blobs.filter((b) => b.alive && !b.kind).sort((a, b) => b.mass - a.mass),
    top = list.slice(0, H < 520 ? 3 : W < 600 ? 5 : 8);
  const was = leader;
  leader = list.length > 1 ? list[0] : null;
  if (player && player.alive && state === 'play') {
    if (leader === player) {
      mission('top', 0.25);
      if (was !== player) addFeed(t('feed.leader'), 5200);
    }
    const view = (Math.max(W, H) / cam.z) * 0.5; // explain each new thing the first time it comes into view
    const hint = (key, html) => {
      if (seen[key]) return;
      seen[key] = 1;
      addFeed(html, 6500);
      try {
        localStorage.setItem('kus.seen', JSON.stringify(seen));
      } catch (e) {}
    };
    if (tutor) {
      // the first run: say how to bite once the snack is really within reach, then let it be an ordinary candy
      const q = tutor.prey;
      if (player.stats.bites > 0 || !q.alive || time - run.t0 > 30) {
        q.tame = false;
        tutor = null;
        if (player.stats.bites > 0) addFeed(touchMode ? t('tip.colorsT') : t('tip.colorsM'), 5200);
      } else if (Math.hypot(q.x - player.x, q.y - player.y) - q.Rs - player.Rs < 50) hint('bite', touchMode ? t('tip.biteT') : t('tip.biteM'));
    }
    if (run.dayNote && !tutor) {
      let live = 0;
      for (const d of feedEl.children) if (d.style.opacity !== '0') live++;
      if (live < 2) dayFeed();
    }
    if (!tutor)
      // the first run's lesson goes first, these wait until it is over
      for (const b of blobs) {
        if (!b.kind || !b.alive || seen[b.kind] || Math.abs(b.x - player.x) > view + b.Rs || Math.abs(b.y - player.y) > view + b.Rs) continue;
        if (b.kind === 'hedgehog') hint('hedgehog', t('tip.hedgehog'));
        else if (b.kind === 'cake') hint('cake', t('tip.cake'));
        else hint('piranha', t('tip.piranha'));
      }
    if (!seen.pickup && !tutor)
      for (const q of pickups)
        if (Math.abs(q.x - player.x) < view && Math.abs(q.y - player.y) < view) {
          hint('pickup', t('tip.pickup'));
          break;
        }
  }
  let html = top.map((b, i) => lbRow(i + 1, b)).join('');
  if (player && player.alive && !top.includes(player)) html += '<li class="gap">…</li>' + lbRow(list.indexOf(player) + 1, player);
  if (html !== lastLb) {
    lbEl.innerHTML = html;
    lastLb = html;
  }
  {
    const br = $('board').getBoundingClientRect();
    boardBottom = br.bottom;
    boardLeft = br.left;
  }
  btnTop = touchMode && state === 'play' ? dodgeEl.getBoundingClientRect().top : H;
}

function update(dt) {
  time += dt;
  sugarTick(dt);
  flashT = Math.max(0, flashT - dt);
  if (player && player.alive && state === 'play' && player.ai) botSteer(player, dt);
  else if (player && player.alive && state === 'play') {
    if (touchMode) {
      // joystick: direction and how hard it is pushed
      const reach = stick.mag > 0 ? (player.Rs * 1.1 + 40) * (0.25 + 1.35 * stick.mag) : 0;
      player.tx = player.x + stick.vx * reach;
      player.ty = player.y + stick.vy * reach;
      if (input.dashHeld && player.dashCd <= 0) input.dash = true;
    } else {
      player.tx = player.x + (input.sx - W / 2) / cam.z;
      player.ty = player.y + (input.sy - H / 2) / cam.z;
    }
    if (cheatsOn()) player.cheated = true;
    if (CHEAT.cd) {
      player.dashCd = Math.min(player.dashCd, 0.15);
      if (!player.tongue) player.dodgeCd = Math.min(player.dodgeCd, 0.15);
    }
    if (CHEAT.heal) player.wounds.length = 0;
    if (input.dash) dash(player);
    if (input.dodge) fireTongue(player);
  }
  input.dash = false;
  input.dodge = false;
  for (const b of blobs) if (b.alive && b.ai) botSteer(b, dt);
  for (const b of blobs) if (b.alive) updateBlob(b, dt);
  if (player && player.alive) emitTrail(player, dt);
  collideAll(dt);
  for (const b of blobs) {
    const m = b.Rs * 0.85; // the same rim as in updateBlob: past it, next frame's wall would snap the body back in one jump
    b.x = clamp(b.x, m, WORLD - m);
    b.y = clamp(b.y, m, WORLD - m);
  } // a shove never carries anyone off the tray
  for (const b of blobs) if (b.alive && !b.safe) checkBites(b, dt);
  updateFood(dt);
  updatePickups(dt);
  for (const b of blobs) b.pulls.length = 0;
  for (const c of chunks) c.update(dt);
  for (const s of strands) s.update(dt);
  for (const g of gulps) g.update(dt);
  for (const b of blobs) if (b.alive && b.tongue) updateTongue(b, dt);
  if (chunks.some((c) => c.dead)) chunks = chunks.filter((c) => !c.dead);
  if (strands.some((s) => s.dead)) strands = strands.filter((s) => !s.dead);
  if (gulps.some((g) => g.dead)) gulps = gulps.filter((g) => !g.dead);
  const sub = Math.min(4, Math.max(1, Math.ceil(dt / (lod ? 0.0175 : 0.0088)))),
    h = dt / sub; // the jelly is stepped in equal small slices, so it wobbles the same at 30 frames a second as at 120
  const vw = (Math.max(W, H) / cam.z) * 0.75 + 400;
  for (const b of blobs) {
    if (!b.alive) continue;
    const far = Math.abs(b.x - cam.x) > vw + b.Rs || Math.abs(b.y - cam.y) > vw + b.Rs;
    if (far) {
      // off-screen: carry the shape along instead of simulating it
      const lx = b.lx ?? b.x,
        ly = b.ly ?? b.y,
        k = b.Rs / (b.lR || b.Rs); // and keep it the right size: a body bitten small out of sight must not arrive with its old outline
      for (const q of b.pts) {
        q.x = b.x + (q.x - lx) * k;
        q.y = b.y + (q.y - ly) * k;
        q.vx = b.vx;
        q.vy = b.vy;
      }
    } else {
      computeTargets(b);
      for (let i = 0; i < sub; i++) stepPoints(b, h);
    }
    b.lx = b.x;
    b.ly = b.y;
    b.lR = b.Rs;
  }
  updateParts(dt);
  if (blobs.some((b) => !b.alive)) blobs = blobs.filter((b) => b.alive);
  population();
  stageUpdate(dt);
  if (runActive && timed()) {
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      endTimed();
    }
  }
  if (state === 'dead') {
    deadT += dt;
    if (runActive) {
      if (deadT > 1.6) {
        spawnPlayer(3);
        hudT = 0;
      }
    } // timed mode: back on the field
    else if (deadT > 1.1 && overEl.classList.contains('hidden')) showOver();
  }
  streakTick(dt);
  updateCamera(dt);
  updateHUD(dt);
}
