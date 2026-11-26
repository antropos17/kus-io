// ---------- album of eaten candies ----------
// One sticker per named bot. It opens when the player swallows that bot whole in a clean run; repeats are counted.
// A full row pays sugar once. Nothing else pays: no second currency, no packs.
//
// A sticker is { id, name, row, take(victim), look }. id is the save key, take() says whether swallowing this victim earns it,
// look is what paintSticker() dresses a stand-in candy in: { pal, skin, hat, kind }. Ordinary bots are made from BOT_NAMES below;
// a special enemy gets its own entry with its own take() and look (kind draws spikes, the cake and so on) in a row of its own.
const ROW_SUGAR = 100; // sugar for a full row, once
const ALBUM_ROWS = [
  // id (save key), title, how often its names come onto the field (see pickBotName), the names
  ['airy', 'Воздушные', 0, ['Зефирка', 'Суфле', 'Безе', 'Мусс', 'Пастила']],
  ['chewy', 'Тягучие', 0, ['Мармеладка', 'Желешка', 'Жвачка', 'Тянучка', 'Бабл-гам']],
  ['home', 'С кухни', 1, ['Пудинг', 'Пончик', 'Ватрушка', 'Медовик', 'Кисель']],
  ['rascal', 'Шалуны', 1, ['Чавкин', 'Нямка', 'Хрумка', 'Ириска', 'Карамелька']],
  ['east', 'Восточные', 2, ['Халва', 'Лукум', 'Чак-чак', 'Нуга', 'Мочи']],
  ['baku', 'Из Баку', 3, ['Пахлава', 'Шекербура', 'Бадамбура', 'Гогал', 'Щербет']],
];
// How often a name comes onto the field, per tier: the weight of one name when a bot spawns.
// Tier 3 names come only on big spawns (BIG_MASS and up), which are a few at the start and about one respawn in twenty.
// A name already on the field weighs ON_FIELD times less, so the field is varied but common candies can meet their twin.
const TIER_W = [1, 0.1, 0.05, 0.6],
  BIG_MASS = 150,
  ON_FIELD = 0.6;
// How many times a name must be swallowed whole before its sticker opens, per tier: common ones at once, the rest take work.
// This paces the album without touching who comes onto the field.
const NEED = [1, 3, 3, 3];
const STICKERS = [];
for (const [rid, , tier, names] of ALBUM_ROWS)
  for (const nm of names) {
    const n = BOT_NAMES.find((x) => x[0] === nm);
    STICKERS.push({
      id: nm,
      name: nm,
      row: rid,
      tier,
      take: (B) => !B.kind && B.name === nm,
      look: { pal: PALS[n[2]], skin: n[3], hat: n[4], kind: null },
    });
  }

// Which name a newly spawned bot gets: a weighted pick, see TIER_W.
const nameTier = {};
for (const s of STICKERS) nameTier[s.name] = s.tier;
function pickBotName(mass) {
  const on = new Set();
  for (const b of blobs) if (b.alive) on.add(b.name);
  let tot = 0;
  const w = (n) => {
    const t = nameTier[n[0]] || 0;
    return t === 3 && mass < BIG_MASS ? 0 : TIER_W[t] * (on.has(n[0]) ? ON_FIELD : 1);
  };
  for (const n of BOT_NAMES) tot += w(n);
  let r = Math.random() * tot;
  for (const n of BOT_NAMES) if ((r -= w(n)) < 0) return n;
  return BOT_NAMES[0];
}

// saved as kus.album: { c: { sticker id: times eaten }, r: [ids of rows already paid] }
const album = { c: {}, r: [] };
try {
  const a = JSON.parse(localStorage.getItem('kus.album') || 'null');
  if (a && typeof a.c === 'object' && a.c) for (const k in a.c) if (STICKERS.some((s) => s.id === k) && a.c[k] > 0) album.c[k] = Math.floor(a.c[k]);
  if (a && Array.isArray(a.r)) album.r = a.r.filter((x) => ALBUM_ROWS.some((r) => r[0] === x));
} catch (e) {}
function saveAlbum() {
  try {
    localStorage.setItem('kus.album', JSON.stringify(album));
  } catch (e) {}
}
// kus.albumOld: stickers opened under the old one-swallow rule, written once, so NEED never closes a sticker a player already has
let albumOld = [];
try {
  const o = localStorage.getItem('kus.albumOld');
  if (o) albumOld = [].concat(JSON.parse(o) || []);
  else {
    albumOld = STICKERS.filter((s) => album.c[s.id] > 0 && album.c[s.id] < NEED[s.tier]).map((s) => s.id);
    localStorage.setItem('kus.albumOld', JSON.stringify(albumOld));
  }
} catch (e) {}
const need = (s) => NEED[s.tier];
const hasSticker = (s) => (album.c[s.id] || 0) >= need(s) || albumOld.includes(s.id);
const albumCount = () => STICKERS.filter(hasSticker).length;
const rowOf = (rid) => ALBUM_ROWS.find((r) => r[0] === rid);
const rowMissing = (rid) => STICKERS.filter((s) => s.row === rid && !hasSticker(s));

function albumEat(B) {
  // the player has swallowed B whole
  if (!runActive || !player || player.cheated) return;
  const s = STICKERS.find((x) => x.take(B));
  if (!s) return;
  const had = hasSticker(s);
  album.c[s.id] = (album.c[s.id] || 0) + 1;
  if (!had && !hasSticker(s)) addFeed(t('al.progress', esc(nameOf(s.name)), album.c[s.id], need(s)), 3200);
  else if (!had) {
    if (!run.stk) run.stk = [];
    run.stk.push(s.name);
    addFeed(t('al.new', `<b>${esc(nameOf(s.name))}</b>`), 4200);
    if (!rowMissing(s.row).length && !album.r.includes(s.row)) {
      album.r.push(s.row);
      sugar += ROW_SUGAR;
      saveSugar();
      run.rowDone = t('row.' + s.row);
      addFeed(t('al.rowFeed', esc(run.rowDone), ROW_SUGAR), 5000);
      Sfx.power();
      haptic(25);
    }
    renderAlbumBtn();
  }
  if (albumBuilt) albumDirty = true; // the counters on the page change with every swallow
  saveAlbum();
}

// ---------- the end-of-run line and the "so close" hint ----------
function albumLine() {
  // one row: what is new (cut short with an ellipsis if it is long) and the total, which always shows
  const got = run.stk || [];
  if (!got.length || run.cheated) return null;
  const names = got.map(nameOf).join(', ');
  return [
    run.rowDone ? t('al.rowLine', run.rowDone, ROW_SUGAR, names) : t(got.length > 1 ? 'al.news' : 'al.new', names),
    t('al.of', albumCount(), STICKERS.length),
  ];
}
function renderAlbumLine() {
  const t = albumLine(),
    el = $('stk');
  el.textContent = '';
  if (t) {
    const a = document.createElement('span'),
      n = document.createElement('b');
    a.textContent = t[0];
    n.textContent = t[1];
    el.append(a, n);
    el.title = t[0] + ' · ' + t[1];
  }
  overEl.querySelector('.card').classList.toggle('stk', !!t); // on short screens it takes the "so close" line's place
}
function albumNear() {
  // a row short of one or two stickers is a goal worth naming
  let best = null;
  for (const [rid] of ALBUM_ROWS) {
    if (album.r.includes(rid)) continue;
    const miss = rowMissing(rid);
    if (miss.length && miss.length <= 2 && (!best || miss.length < best[1].length)) best = [t('row.' + rid), miss];
  }
  return best ? t('al.near', best[0], best[1].map((s) => nameOf(s.name)).join(', ')) : '';
}

// ---------- stickers: the game's own drawing code on a stand-in candy, painted once into a small canvas ----------
function paintSticker(cv, s) {
  const g = cv.getContext('2d'),
    k = cv.width / 104,
    keep = [ctx, cam.z, lod, state];
  const b = new Blob({ name: s.name, pal: s.look.pal, mass: 40, x: 0, y: 0, hat: s.look.hat, skin: s.look.skin, kind: s.look.kind });
  b.face = b.fa = Math.PI / 2; // looking at us: eyes either side, mouth below, hat on top
  b.tx = b.x;
  b.ty = b.y;
  b.mouth = 0.3;
  const sc = (k * 36) / b.Rs;
  g.setTransform(sc, 0, 0, sc, 52 * k, 60 * k);
  g.clearRect(-200, -200, 400, 400);
  ctx = g;
  cam.z = 1;
  lod = 0;
  state = 'album'; // no red or green rim, that is for live rivals
  try {
    buildPath(b);
    drawBlob(b);
  } finally {
    [ctx, cam.z, lod, state] = keep;
  }
}

// ---------- the album page ----------
// English names that need the same soft hyphen on a 360 px phone
const SHY_EN = { Зефирка: 'Marsh­mallow', Шекербура: 'Sheker­bura', Бадамбура: 'Badam­bura' };
const SHY = {
  Мармеладка: 'Марме­ладка',
  Карамелька: 'Кара­мелька',
  Шекербура: 'Шекер­бура',
  Бадамбура: 'Бадам­бура',
  Ватрушка: 'Ват­рушка',
  Желешка: 'Же­лешка',
  Тянучка: 'Тя­нучка',
  Медовик: 'Медо­вик',
  Пастила: 'Пас­тила',
}; // where a long name may break under a small sticker
const albumEl = $('album'),
  albumBtn = $('albumBtn');
let albumBuilt = false,
  albumDirty = false;
function renderAlbumBtn() {
  albumBtn.innerHTML = `${t('album.t')} <b>${albumCount()} / ${STICKERS.length}</b>`;
}
function buildAlbum() {
  // the grid and its stickers are made once; later openings only update who is collected
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1)),
    px = Math.round(52 * dpr);
  $('albumRows').innerHTML = ALBUM_ROWS.map(
    ([rid]) =>
      `<section class="arow" data-r="${rid}"><div class="ah"><b>${t('row.' + rid)}</b><span></span></div><div class="ag">${STICKERS.filter(
        (s) => s.row === rid,
      )
        .map(
          (s) =>
            `<button type="button" class="st" data-id="${esc(s.id)}"><canvas width="${px}" height="${px}"></canvas><span class="sn">${esc(LANG === 'en' ? SHY_EN[s.name] || nameOf(s.name) : SHY[s.name] || s.name)}</span><i></i></button>`,
        )
        .join('')}</div></section>`,
  ).join('');
  for (const btn of $('albumRows').querySelectorAll('.st'))
    paintSticker(
      btn.firstChild,
      STICKERS.find((s) => s.id === btn.dataset.id),
    );
  albumBuilt = true;
  albumDirty = true;
}
function fillAlbum() {
  const n = albumCount();
  $('albumN').textContent = `${n} / ${STICKERS.length}`;
  $('albumSub').textContent = t('al.sub', NEED[1], ROW_SUGAR);
  for (const sec of $('albumRows').children) {
    const rid = sec.dataset.r,
      have = STICKERS.filter((s) => s.row === rid && hasSticker(s)).length,
      all = STICKERS.filter((s) => s.row === rid).length,
      done = album.r.includes(rid);
    sec.classList.toggle('done', done);
    sec.querySelector('.ah span').textContent = done ? t('al.rowDone', ROW_SUGAR) : `${have} / ${all}`;
    for (const btn of sec.querySelectorAll('.st')) {
      const s = STICKERS.find((x) => x.id === btn.dataset.id),
        c = album.c[s.id] || 0,
        nm = nameOf(s.name),
        got = hasSticker(s);
      btn.classList.toggle('no', !got);
      btn.lastChild.textContent = got ? (c > 1 ? '×' + c : '') : c ? t('al.of', c, need(s)) : '';
      btn.setAttribute('aria-label', got ? t('al.aGot', nm, c) : c ? t('al.aPart', nm, c, need(s)) : t('al.aNone', nm));
    }
  }
  albumDirty = false;
}
function openAlbum() {
  if (!albumBuilt) buildAlbum();
  if (albumDirty) fillAlbum();
  $('albumCap').textContent = '';
  albumEl.classList.remove('hidden');
  setTimeout(() => $('albumX').focus({ preventScroll: true }), 30);
}
function closeAlbum() {
  albumEl.classList.add('hidden');
  albumBtn.focus({ preventScroll: true });
}
const albumOpen = () => !albumEl.classList.contains('hidden');
albumBtn.addEventListener('click', openAlbum);
$('albumX').addEventListener('click', closeAlbum);
$('albumRows').addEventListener('click', (e) => {
  const st = e.target.closest('.st');
  if (!st) return;
  const s = STICKERS.find((x) => x.id === st.dataset.id),
    c = album.c[s.id] || 0;
  $('albumCap').textContent =
    !hasSticker(s) && c
      ? t('al.capPart', nameOf(s.name), c, need(s))
      : c
        ? t('al.capGot', nameOf(s.name), c)
        : t('al.capNone', nameOf(s.name), need(s));
});
renderAlbumBtn();
