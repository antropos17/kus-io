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
  while (feedEl.children.length > 4) feedEl.lastElementChild.remove();
  setTimeout(() => {
    d.style.opacity = '0';
    setTimeout(() => d.remove(), 500);
  }, ms || 3600);
}
function feedKill(A, B) {
  if (A.isPlayer) addFeed(`Ты съедаешь <b>${esc(B.acc)}</b> целиком`);
  else if (
    !B.isPlayer &&
    state === 'play' &&
    player &&
    player.alive &&
    (Math.hypot(A.x - player.x, A.y - player.y) < (Math.max(W, H) / cam.z) * 0.6 || A === biggest())
  )
    addFeed(`<b>${esc(A.name)}</b> съедает <b>${esc(B.acc)}</b>`);
}
const MTYPES = [
  // [key, wording, first target]; only real actions in a clean run count
  ['bites', 'Откуси кусков', 10],
  ['food', 'Собери посыпки', 60],
  ['kills', 'Съешь конфет целиком', 3],
  ['mass', 'Набери массу за одну жизнь', 150],
  ['wound', 'Укуси в свежую ранку', 4],
  ['tongue', 'Поймай конфет языком', 5],
  ['time', 'Проживи секунд за одну жизнь', 60],
  ['pickup', 'Подбери бонусов', 3],
  ['piranha', 'Проглоти пираний', 4],
  ['hedge', 'Укуси ежа в морду', 2],
  ['cake', 'Укуси торт в вишенку', 3],
  ['combo', 'Сделай серию укусов подряд', 3],
  ['top', 'Побудь лидером рейтинга, секунд', 10],
];
const skinOpen = (id) => SKINS.findIndex((k) => k[0] === id) < FREE_SKINS || M.open.includes(id);
const nextPrize = () => SKINS.find((k, i) => i >= FREE_SKINS && !M.open.includes(k[0]));
function saveM() {
  try {
    localStorage.setItem('kus.m', JSON.stringify(M));
  } catch (e) {}
}
function rollMissions() {
  // finished missions make way for new ones, each a little bigger than the last of its kind
  M.act = M.act.filter((m) => m && m.got < m.need && MTYPES.some((t) => t[0] === m.type));
  for (let guard = 0; M.act.length < 3 && guard < 40; guard++) {
    const i = M.seq++,
      t = MTYPES[i % MTYPES.length];
    if (M.act.some((m) => m.type === t[0])) continue;
    M.act.push({ type: t[0], need: Math.round(t[2] * (1 + Math.floor(i / MTYPES.length) * 0.6)), got: 0 });
  }
}
function mission(type, n, absolute) {
  if (!runActive || !player || player.cheated) return;
  if (!absolute && SUGAR[type]) earn(n * SUGAR[type] * (type === 'bites' ? Math.min(player.combo || 1, 5) : 1)); // a streak sweetens every bite
  for (const m of M.act) {
    if (m.type !== type || m.got >= m.need) continue;
    m.got = absolute ? Math.max(m.got, Math.min(m.need, Math.floor(n))) : Math.min(m.need, m.got + n);
    if (m.got >= m.need) {
      // done: the prize is the next locked skin
      earn(15);
      const pz = nextPrize();
      if (pz) {
        M.open.push(pz[0]);
        m.prize = pz[1];
        addFeed(`Задание выполнено. Новый узор: <b>${pz[1]}</b>`);
      } else addFeed('Задание выполнено');
      Sfx.power();
      saveM();
    }
  }
}
const missionRows = () =>
  M.act
    .map((m) => {
      const t = MTYPES.find((x) => x[0] === m.type),
        done = m.got >= m.need;
      return `<div class="mi${done ? ' ok' : ''}"><span class="mt">${t[1]}${done ? (m.prize ? `: открыт узор «${m.prize}»` : ': готово') : ''}</span><span class="mv">${Math.floor(m.got)} / ${m.need}</span><div class="mb"><i style="width:${Math.round((100 * m.got) / m.need)}%"></i></div></div>`;
    })
    .join('');
// ---------- sugar ----------
const sugarEl = $('sugar');
let shownSugar = -1;
function earn(n) {
  run.sugar += n;
  const v = Math.floor(run.sugar);
  if (v === shownSugar) return;
  shownSugar = v;
  sugarEl.textContent = `сахар ${v}`;
  if (!calm && sugarEl.animate) sugarEl.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
}
function saveSugar() {
  try {
    localStorage.setItem('kus.sugar', String(sugar));
  } catch (e) {}
}
function cheapestSkin() {
  const i = SKINS.findIndex((k) => !skinOpen(k[0]));
  return i < 0 ? null : { id: SKINS[i][0], name: SKINS[i][1], price: SKIN_PRICE(i) };
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
    if (m === 'daily' && score < run.dayPrev) out.push(`До лучшего за сегодня не хватило ${run.dayPrev - score}`);
    if (t3 && score < best3) out.push(`До рекорда на 3 минуты не хватило ${best3 - score}`);
    if (m === 'free' && score < best) out.push(`До рекорда не хватило ${best - score}`);
    const h = HATS.find((x) => x.need > best);
    if (m === 'free' && h) out.push(`До шапки «${h.name}» ещё ${h.need - best} массы`);
  }
  const s = cheapestSkin();
  if (s) out.push(sugar >= s.price ? `Сахара хватает на узор «${s.name}», он в меню` : `До узора «${s.name}» ещё ${s.price - sugar} сахара`);
  return out.slice(0, 2).join('. ');
}
function renderSweet(m, score) {
  const got = run.got || 0;
  $('sweet').classList.toggle('hidden', !got);
  overEl.querySelector('.card').classList.toggle('paid', !!got); // on short screens the sugar takes the missions' place
  $('near').textContent = nearText(m, score);
  if (!got) return;
  countUp($('sweetN'), got);
  $('sweetBank').textContent = `в копилке ${sugar}`;
  $('chestT').textContent = 'Выбери конфету: в одной много сахара';
  $('chestRow').innerHTML = [0, 1, 2].map((i) => `<button type="button" data-i="${i}" aria-label="Конфета ${i + 1}">?</button>`).join('');
}
$('chestRow').addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t || !run.chest) return;
  run.chest = false;
  const base = clamp(Math.round(run.got * 0.3), 3, 40),
    prizes = [base, base * 2, base * 5];
  for (let i = 2; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [prizes[i], prizes[j]] = [prizes[j], prizes[i]];
  }
  const won = prizes[+t.dataset.i];
  sugar += won;
  saveSugar();
  [...$('chestRow').children].forEach((b, i) => {
    b.textContent = '+' + prizes[i];
    b.disabled = true;
    b.classList.add(b === t ? 'got' : 'open');
  });
  $('chestT').textContent = won === base * 5 ? `Самая сладкая! +${won} сахара` : `+${won} сахара`;
  $('sweetBank').textContent = `в копилке ${sugar}`;
  $('near').textContent = nearText(mode, Math.round(run.max));
  Sfx.power();
  haptic(won === base * 5 ? 30 : 12);
});
function renderMissions() {
  $('misT').textContent = nextPrize() ? 'Задания: за каждое новый узор' : 'Задания (все узоры уже открыты)';
  $('misList').innerHTML = missionRows();
}
function renderMode() {
  for (const b of $('modeSeg').children) b.setAttribute('aria-pressed', String(b.dataset.m === mode));
  for (const b of $('diffSeg').children) b.setAttribute('aria-pressed', String(b.dataset.v === diff));
  renderDaily();
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
  const name = (nick.value || '').trim().slice(0, 14) || 'Кусака',
    [x, y] = safeSpawn();
  player = new Blob({
    name,
    pal: PALS[chosen],
    mass: m0,
    x,
    y,
    isPlayer: true,
    spawnT,
    hat: chosenHat,
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
  if (state === 'play' || (state === 'dead' && overEl.classList.contains('hidden'))) return;
  Sfx.init();
  const name = (nick.value || '').trim().slice(0, 14) || 'Кусака';
  try {
    localStorage.setItem('kus.name', name);
    localStorage.setItem('kus.color', String(chosen));
    localStorage.setItem('kus.hat', chosenHat);
    localStorage.setItem('kus.skin', chosenSkin);
    localStorage.setItem('kus.mode', mode);
    localStorage.setItem('kus.diff', diffPick || diff);
  } catch (e) {}
  fixDiff();
  rollMissions();
  saveM();
  run = { bites: 0, kills: 0, max: 0, deaths: 0, t0: time, cheated: false, sugar: 0 };
  shownSugar = -1;
  sugarEl.textContent = '';
  runActive = true;
  timeLeft = timed() ? 180 : 0;
  day = null;
  if (mode === 'daily') startDaily();
  spawnPlayer(4);
  document.body.classList.add('playing');
  menuEl.classList.add('hidden');
  overEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  feedEl.innerHTML = '';
  hudT = 0;
  if (touchMode) {
    addFeed(SET.lefty ? 'Справа води пальцем, слева <b>Кусь</b> и <b>Язык</b>' : 'Слева води пальцем, справа <b>Кусь</b> и <b>Язык</b>');
    addFeed('<b>Красный</b> контур съест тебя, <b>зелёного</b> съешь ты');
  } else addFeed('<b>Красная</b> обводка: тебя проглотят целиком. <b>Зелёная</b>: проглотишь ты');
  if (day) addFeed(`<b>${run.rule.name}</b>: ${run.rule.note.charAt(0).toLowerCase() + run.rule.note.slice(1)}`, 6500);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}
function tally() {
  const st = player.stats;
  run.bites += st.bites;
  run.kills += st.kills;
  run.max = Math.max(run.max, st.maxMass);
  if (player.cheated) run.cheated = true;
}
function finishRun() {
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
  try {
    localStorage.setItem('kus.best', String(best));
    localStorage.setItem('kus.best3', String(best3));
  } catch (e) {}
  saveM();
  renderHats();
}
function die(by) {
  tally();
  stick.id = -1;
  stick.on = false;
  input.dashHeld = false;
  state = 'dead';
  deadT = 0;
  killer = by;
  if (timed() && runActive && timeLeft > 0) {
    run.deaths++;
    addFeed('Тебя съели. Сейчас вернёшься на поле');
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
  if (state === 'play' && player && player.alive) {
    tally();
    player.alive = false;
    finishRun();
  }
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
  $('overT').textContent = t3 ? 'Время вышло' : 'Тебя доели';
  whoEl.innerHTML = daily
    ? `Конфета дня «${esc(run.rule.name)}»`
    : t3
      ? 'Три минуты позади. В зачёт идёт самая большая масса.'
      : killer
        ? `Последний кусь: <b>${esc(killer.name)}</b>`
        : 'Тебя растащили по кусочкам';
  $('sMax').textContent = score;
  $('sBites').textContent = run.bites;
  $('sKills').textContent = run.kills;
  $('sTime').textContent = t3 ? run.deaths : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  $('sTimeL').textContent = t3 ? 'раз тебя съели' : 'время в игре';
  $('overMis').innerHTML = missionRows();
  renderSweet(mode, score);
  const fresh = HATS.filter((h) => h.need > prevBest && h.need <= best).map((h) => h.name);
  const streak = daily ? dailyStreak(run.day) : 0;
  bestEl.textContent = run.cheated
    ? daily
      ? 'С читами результат дня и задания не засчитаны'
      : 'С читами рекорд и задания не засчитаны'
    : daily
      ? `${score > run.dayPrev && run.dayPrev ? 'Новый лучший' : 'Лучший'} за сегодня: ${dailyBest(run.day)}. ` +
        (streak > 1 ? `${streak} ${daysWord(streak)} подряд` : 'Первый день серии') +
        (dailyRec.top > streak ? `, рекорд ${dailyRec.top}` : '')
      : t3
        ? best3 > prevBest3
          ? `Новый рекорд на 3 минуты: ${best3}`
          : `Рекорд на 3 минуты: ${best3}`
        : (best > prevBest ? `Новый рекорд: ${best}` : `Рекорд: ${best}`) + (fresh.length ? `. Открыта шапка: ${fresh.join(', ')}` : '');
  $('chalRes').textContent =
    !challenge || (t3 && !(daily && challenge.d === run.day)) || (!t3 && challenge.d) || run.cheated
      ? ''
      : daily
        ? `${score > challenge.c ? 'Вызов побит' : 'Вызов'}: ${challenge.n} ${challenge.c}, ты ${score}.`
        : score > challenge.c
          ? `Вызов побит: у игрока ${challenge.n} было ${challenge.c}, у тебя ${score}.`
          : `Вызов от игрока ${challenge.n}: ${challenge.c}. Твой результат: ${score}.`;
  overEl.querySelector('.card').classList.toggle('chal', !!$('chalRes').textContent); // on short screens the challenge line takes the "so close" line's place
  $('chalBtn').classList.toggle('hidden', (t3 && !daily) || run.cheated || score < 1);
  $('chalBtn').textContent = daily ? 'Поделиться' : 'Бросить вызов другу';
  $('chalLink').classList.add('hidden');
  overEl.classList.remove('hidden');
  hudEl.classList.add('hidden');
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
  if (state === 'play' && player && player.alive) {
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
  return `<li class="${b.isPlayer ? 'me' : ''}"><span class="n">${n}</span><i style="background:${b.pal.base}"></i><span class="nm">${esc(b.name)}</span><span class="m">${Math.round(b.mass)}</span></li>`;
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
  $('timer').textContent = runActive && timed() ? `осталось ${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}` : '';
  $('goal').textContent = !runActive
    ? ''
    : day
      ? `конфета дня: ${run.rule.name}${challenge && challenge.d === run.day ? ` · побей ${challenge.c}` : ''}`
      : challenge && !challenge.d && mode === 'free'
        ? `цель: ${challenge.c}`
        : '';
  let fx = '';
  if (player && player.alive)
    for (const [k, prop] of [
      ['speed', 'pSpeed'],
      ['shield', 'pShield'],
      ['magnet', 'pMagnet'],
    ])
      if (player[prop] > 0) fx += `<span style="background:${PICK[k][2]}">${PICK[k][0]} ${Math.ceil(player[prop])}</span>`;
  if (player && player.alive && player.comboT > 0 && player.combo > 1) fx += `<span style="background:#9be15d">Серия ×${player.combo}</span>`;
  if (fx !== lastFx) {
    $('fx').innerHTML = fx;
    lastFx = fx;
  }
  const list = blobs.filter((b) => b.alive && !b.kind).sort((a, b) => b.mass - a.mass),
    top = list.slice(0, H < 520 ? 3 : W < 600 ? 5 : 8);
  const was = leader;
  leader = list.length > 1 ? list[0] : null;
  if (player && player.alive && state === 'play') {
    if (leader === player) {
      mission('top', 0.25);
      if (was !== player) addFeed('Ты теперь <b>самый сладкий</b>. За укус лидера дают больше, береги спину', 5200);
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
    for (const b of blobs) {
      if (!b.kind || !b.alive || seen[b.kind] || Math.abs(b.x - player.x) > view + b.Rs || Math.abs(b.y - player.y) > view + b.Rs) continue;
      if (b.kind === 'hedgehog') hint('hedgehog', '<b>Ёж</b>: со спины колется. Кусай его в морду');
      else if (b.kind === 'cake') hint('cake', '<b>Торт</b>: корка твёрдая. Кусай в вишенку на спине');
      else hint('piranha', '<b>Пираньи</b>: мелкие, но нападают стаей. Глотай по одной');
    }
    if (!seen.pickup)
      for (const q of pickups)
        if (Math.abs(q.x - player.x) < view && Math.abs(q.y - player.y) < view) {
          hint('pickup', '<b>Бонус</b>: наедь на него, чтобы подобрать');
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
  collideAll(dt);
  for (const b of blobs) {
    if (b.x < 0) b.x = 0;
    else if (b.x > WORLD) b.x = WORLD;
    if (b.y < 0) b.y = 0;
    else if (b.y > WORLD) b.y = WORLD;
  } // a shove never carries anyone off the tray
  for (const b of blobs) if (b.alive) checkBites(b, dt);
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
  updateCamera(dt);
  updateHUD(dt);
}
