// ---------- candy of the day ----------
// One three-minute run a day with a twist that is the same for everyone on that date. The twist comes from the local date alone, no server.
const DAILY = [
  // id, name, one line of explanation
  ['hedge', 'День ежей', 'Ежей на поле вдвое больше. Кусай их в морду, со спины колются'],
  ['double', 'Двойная посыпка', 'Каждая посыпка весит вдвое больше, растут все'],
  ['tiny', 'Кроха', 'Ты начинаешь крошечным, и после каждого раза тоже'],
  ['piranha', 'Пираньи', 'Стаи пираний с первых секунд и вдвое чаще'],
  ['magnet', 'Магнитный день', 'Все бонусы — магниты, и падают они чаще'],
  ['cake', 'Торт с утра', 'Торт на поле с самого начала. Кусай в вишенку'],
  ['small', 'Мелюзга', 'Все соперники мелкие, крупных сегодня нет'],
  ['quick', 'Быстрые зубы', 'Твой рывок с укусом перезаряжается вдвое быстрее'],
];
let day = null, // id of the twist in force during a candy-of-the-day run
  dayForce = null; // tests and balance runs pin a twist by id
const dayKey = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); // 20261123
const keyDate = (k) => new Date(Math.floor(k / 10000), (Math.floor(k / 100) % 100) - 1, k % 100);
const todayKey = () => dayKey(new Date(Date.now()));
const prevKey = (k) => {
  const d = keyDate(k);
  d.setDate(d.getDate() - 1);
  return dayKey(d);
};
function dailyOf(k) {
  // every block of N days plays all N twists in a shuffled order; a block never starts with the twist the last one ended on
  const d = keyDate(k),
    n = DAILY.length,
    num = Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5),
    blk = Math.floor(num / n);
  const order = (b) => {
    let s = (b * 2654435761 + 7) >>> 0;
    const rnd = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const p = DAILY.map((_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    return p;
  };
  const p = order(blk);
  if (p[0] === order(blk - 1)[n - 1]) [p[0], p[1]] = [p[1], p[0]];
  const t = DAILY[p[num - blk * n]];
  return { key: k, id: t[0], name: t[1], note: t[2] };
}
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const keyText = (k) => `${k % 100} ${MONTHS[(Math.floor(k / 100) % 100) - 1]}`;
const daysWord = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'день' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'дня' : 'дней');

// kus.daily: the last day played, the best of that day, days in a row, the longest run of days
let dailyRec = { d: 0, best: 0, streak: 0, top: 0 };
try {
  const v = JSON.parse(localStorage.getItem('kus.daily') || 'null');
  if (v && v.d > 0) dailyRec = { d: v.d | 0, best: v.best | 0, streak: v.streak | 0, top: v.top | 0 };
} catch (e) {}
const dailyBest = (k) => (dailyRec.d === k ? dailyRec.best : 0);
const dailyStreak = (k) => (dailyRec.d === k || dailyRec.d === prevKey(k) ? dailyRec.streak : 0); // a missed day breaks it
function dailySave(k, score) {
  const r = dailyRec;
  if (r.d === k) r.best = Math.max(r.best, score);
  else {
    r.streak = r.d === prevKey(k) ? r.streak + 1 : 1;
    r.d = k;
    r.best = score;
  }
  r.top = Math.max(r.top, r.streak);
  try {
    localStorage.setItem('kus.daily', JSON.stringify(r));
  } catch (e) {}
}
const chalToday = () => !!(challenge && challenge.d && challenge.d === todayKey()); // a challenge for today's candy
function renderDaily() {
  const t = dailyOf(todayKey()),
    b = dailyBest(t.key),
    btn = $('modeSeg').querySelector('[data-m=daily]');
  btn.innerHTML = `<b>Конфета дня</b><small>${t.name}${b ? ` · ${b}` : ''}</small>`;
  btn.title = t.note;
  $('dif').classList.toggle('fixed', mode === 'daily');
}
function startDaily() {
  // the twists that act once, when the run begins
  const t = dailyOf(todayKey()),
    f = dayForce && DAILY.find((x) => x[0] === dayForce);
  if (f) [t.id, t.name, t.note] = f;
  run.day = t.key;
  run.rule = t;
  run.dayPrev = dailyBest(t.key);
  day = t.id;
  if (day === 'piranha') pirAt = time + 6;
  if (day === 'cake' && !blobs.some((b) => b.kind === 'cake' && b.alive)) spawnSpecial('cake');
  if (day === 'small') for (const b of blobs) if (b.ai && !b.kind && b.mass > 55) b.mass = rand(14, 50);
  if (day === 'hedge') for (let i = 0; i < 2; i++) spawnSpecial('hedgehog');
}
