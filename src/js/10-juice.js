// ---------- juice: the streak fuse, streak shouts, "+N" at the mass, mass milestones ----------
const streakEl = $('streak'),
  streakX = streakEl.querySelector('b'),
  scoreEl = $('score'),
  vigEl = $('vig');
const STREAK_T = 2.6; // the streak window, the same as comboT in doBite
// what the streak shouts at each step; ×7 and longer use the last list
const STREAK_WORDS = {
  2: ['Ням!', 'Кусь!', 'Хрум!'],
  3: ['Кусяка!', 'Вкуснота!', 'Ещё кусочек!'],
  4: ['Объедение!', 'Зубастик!', 'Хрум-хрум-хрум!'],
  5: ['Сладкоежка!!', 'Обжора!!', 'Карамельный шторм!!'],
  6: ['КУСЯКА!!!!', 'НЕУДЕРЖИМЫЙ!!!', 'САХАРНЫЙ АД!!!'],
  7: ['ЛЕГЕНДА КУСЯК!!!!', 'ЗУБЫ ГОРЯТ!!!!', 'КОНФЕТНЫЙ БОСС!!!!'],
};
const STREAK_COLORS = ['#9be15d', '#ffd23f', '#ff9a3c', '#ff5a3c', '#ff3c3c']; // ×2 … ×6
const MASS_MARKS = [250, 500, 1000, 2000, 4000];
let streakShown = 0,
  streakK = -1,
  streakWord = '',
  markI = 0;

// restart a CSS animation on an element that is already on screen
function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
function hudBit(parent, cls, text, ms) {
  const d = document.createElement('div');
  d.className = cls;
  if (text) d.textContent = text;
  parent.appendChild(d);
  setTimeout(() => d.remove(), ms);
  return d;
}
function hudSparks(parent, x, y, color, n, dist) {
  if (calm) return;
  for (let i = 0; i < n; i++) {
    const s = hudBit(parent, 'hspark', '', 800),
      a = rand(0, Math.PI * 2),
      d = dist * rand(0.5, 1.1);
    s.style.left = x + 'px';
    s.style.top = y + 'px';
    s.style.background = color;
    s.style.setProperty('--dx', (Math.cos(a) * d).toFixed(1) + 'px');
    s.style.setProperty('--dy', (Math.sin(a) * d).toFixed(1) + 'px');
  }
}

// the player's bite raised the streak (called from doBite)
function streakUp() {
  const c = player.combo;
  if (c < 2) return;
  const l = Math.min(c, 6);
  streakEl.className = 'on lv' + l;
  streakX.textContent = '×' + c;
  streakShown = c;
  streakK = -1;
  if (!calm) replay(streakX, 'punch');
  streakShout(c);
  vigEl.classList.toggle('hot', l >= 6 && !calm);
  const bar = streakEl.firstElementChild;
  if (c === 6 && !calm) hudBit(bar, 'shock', '', 650);
  else if (c >= 3) hudSparks(bar, bar.offsetWidth - 4, bar.offsetHeight / 2, STREAK_COLORS[l - 2], 4 + c * 2, 28 + c * 5);
}
function streakShout(c) {
  const l = Math.min(c, 7),
    pool = STREAK_WORDS[l];
  let w = pool[(Math.random() * pool.length) | 0];
  if (w === streakWord) w = pool[(pool.indexOf(w) + 1) % pool.length];
  streakWord = w;
  const old = streakEl.querySelector('.shout');
  if (old) old.remove();
  const d = hudBit(streakEl, 'shout lv' + Math.min(l, 6) + (l >= 5 && !calm ? ' wob' : ''), w, 1200);
  // a short landscape screen and phones get smaller words, beside the bar on a PC and under it on a phone
  const fs = H < 500 ? 12 + l * 2.2 : touchMode ? 13 + l * 2.6 : 14 + l * 4;
  d.style.fontSize = fs + 'px';
  d.style.setProperty('--r', rand(-4, 4).toFixed(1) + 'deg');
  // keep the whole word on screen and clear of the table even at the peak of its pop (scale 1.3).
  // When the table leaves too little room beside it, the word drops below the table instead of
  // shrinking, so a long streak never gets a smaller word than a short one.
  const sr = streakEl.getBoundingClientRect(),
    x0 = sr.left + d.offsetLeft,
    need = d.offsetWidth * 1.3 + 6,
    h = d.offsetHeight * 0.65, // half its height at the peak of the pop: the word is centred on its top
    level = sr.top + d.offsetTop - h < boardBottom && boardLeft > x0;
  let room = (level ? boardLeft : W) - x0 - 12;
  if (level && need > room) {
    d.style.top = Math.ceil(boardBottom - sr.top + h + 6) + 'px';
    room = W - x0 - 12;
  }
  if (need > room) d.style.fontSize = ((fs * room) / need).toFixed(1) + 'px';
}
// every frame from updateHUD: the fuse burns down, and a lapsed streak goes out
function streakTick() {
  const live = player && player.alive && state === 'play';
  if (live && player.comboT > 0 && player.combo > 1) {
    const k = Math.round((player.comboT / STREAK_T) * 200) / 200;
    if (k !== streakK) {
      streakK = k;
      streakEl.style.setProperty('--k', k);
    }
  } else if (streakShown) {
    if (live) hudBit(streakEl, 'burnt', `серия ×${streakShown} сгорела`, 1250);
    streakShown = 0;
    streakEl.className = live ? 'out' : '';
    vigEl.classList.remove('hot');
  }
  // milestones count any mass, sprinkles and bonuses too
  while (live && markI < MASS_MARKS.length && player.mass >= MASS_MARKS[markI]) {
    hudBit($('hud'), 'milestone', `Масса ${MASS_MARKS[markI]}!`, 1850);
    markI++;
  }
}

// mass went in: "+N" flies off the counter, bigger and brighter for bigger pieces (from bumpMass)
function gainPop(n, whole) {
  n = Math.round(n);
  if (n < 1) return 1;
  // the tier is the piece next to the candy before it, so a big candy's every bite does not glow
  const rel = n / Math.max(1, player.mass - n),
    t = whole ? 4 : rel >= 0.3 ? 3 : rel >= 0.1 ? 2 : 1;
  const stack = scoreEl.querySelectorAll('.plus').length, // pops in quick succession step down instead of piling up
    d = hudBit(scoreEl, 'plus t' + t, '+' + n, 1050);
  // beside the digits on a PC; on a phone the pause and sound buttons sit there, so beside the sugar instead
  const r = document.createRange();
  r.selectNodeContents(massEl);
  const mw = r.getBoundingClientRect().width,
    side = touchMode && sugarEl.offsetWidth > 0;
  d.style.left = (side ? sugarEl.offsetLeft + sugarEl.offsetWidth : mw) + 8 + 'px';
  // beside the sugar the fuse is just below, so that stack climbs; at the digits it steps down
  d.style.top = (side ? sugarEl.offsetTop + sugarEl.offsetHeight / 2 - d.offsetHeight / 2 - (stack % 3) * 10 : 2 + (stack % 3) * 12) + 'px';
  if (t >= 3) hudSparks(scoreEl, mw / 2, 18, t === 4 ? '#ffd23f' : '#ff7a9c', t === 4 ? 16 : 9, t === 4 ? 70 : 45);
  return t;
}
// a new life starts counting the milestones from its own mass
function juiceReset(m0) {
  markI = 0;
  while (markI < MASS_MARKS.length && m0 >= MASS_MARKS[markI]) markI++;
  streakShown = 0;
  streakEl.className = '';
  vigEl.classList.remove('hot');
}
