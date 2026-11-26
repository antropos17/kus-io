// ---------- HUD: the sugar pill, its odometer and the cubes that fly into it ----------
// odometer: one column of digits 0-9 per figure; a figure rolls by moving its column (-d * 1.16em)
function odometer(el) {
  const st = { len: 0 };
  st.set = (n, snap) => {
    const s = String(Math.max(0, Math.floor(n)));
    if (s.length !== st.len) {
      el.innerHTML = s
        .split('')
        .map(
          () =>
            '<span class="c"><span class="s">' +
            '0123456789'
              .split('')
              .map((d) => '<span>' + d + '</span>')
              .join('') +
            '</span></span>',
        )
        .join('');
      st.len = s.length;
      const c = el.querySelectorAll('.s');
      for (let i = 0; i < c.length; i++) {
        c[i].style.transition = 'none';
        c[i].style.transform = `translateY(${-s[i] * 1.16}em)`;
        c[i].offsetHeight; // commit the start position, then let the next change animate
        c[i].style.transition = '';
      }
      return;
    }
    const c = el.querySelectorAll('.s');
    for (let i = 0; i < c.length; i++) {
      c[i].style.transition = snap || calm ? 'none' : ''; // calm: no rolling overshoot, the figure just changes
      c[i].style.transform = `translateY(${-s[i] * 1.16}em)`;
    }
  };
  return st;
}
const hudSugar = { air: 0 }; // sugar already earned but still flying to the pill
const SUG_POOL = 24,
  SUG_FLY = 0.56,
  sugCubes = Array.from({ length: SUG_POOL }, () => ({ on: false, x0: 0, y0: 0, mx: 0, my: 0, tx: 0, ty: 0, t: 0, d: 0, v: 0 }));
const sugSock = sugarEl.querySelector('.sock'),
  sugOdo = odometer(sugarEl.querySelector('.num')),
  sugImg = new Image(),
  sugBox = { x: 0, y: 0 };
let sugShown = -1,
  sugStep = 0,
  sugStepT = -9;
sugImg.src =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><path d="M12 2.5 21 7.2 12 11.9 3 7.2Z" fill="#fffaf0" stroke="rgba(58,33,24,.28)" stroke-width=".7" stroke-linejoin="round"/><path d="M3 7.2 12 11.9V21.5L3 16.8Z" fill="#efe1c8" stroke="rgba(58,33,24,.28)" stroke-width=".7" stroke-linejoin="round"/><path d="M21 7.2 12 11.9V21.5L21 16.8Z" fill="#d6bd95" stroke="rgba(58,33,24,.28)" stroke-width=".7" stroke-linejoin="round"/><circle cx="9.5" cy="6.6" r=".9" fill="#fff"/><circle cx="14.2" cy="7.6" r=".7" fill="#fff"/><circle cx="6.5" cy="12" r=".6" fill="#fff"/></svg>',
  );
function sugSockBox() {
  // the centre of the socket in screen pixels; cached, refreshed on resize and at the start of a run
  const r = sugSock.getBoundingClientRect();
  sugBox.x = r.left + r.width / 2;
  sugBox.y = r.top + r.height / 2;
}
function sugarSync() {
  // the pill shows what has landed: the earned sugar minus what is still in the air
  const v = Math.max(0, Math.floor(run.sugar - hudSugar.air));
  if (v === sugShown) return;
  sugShown = v;
  sugOdo.set(v);
  sugarEl.setAttribute('aria-label', t('a.sugar', v));
}
function sugarFly(wx, wy, value, n) {
  // a world point, the value split over n cubes. Order: the caller adds the value to run.sugar (earn) FIRST, then calls this
  if (!(value > 0)) return;
  if (calm || state === 'menu') return sugarSync(); // no flight: the value lands at once
  n = Math.max(1, lod === 1 ? Math.ceil(n / 2) : lod === 2 ? Math.ceil(n / 4) : Math.floor(n));
  if (!(sugBox.x > 0)) sugSockBox(); // the cache is empty (HUD was hidden): measure once
  if (!(sugBox.x > 0)) return sugarSync(); // the HUD is hidden: nothing to fly to
  const z = cam.z,
    [fo, go] = focusOffset(),
    sx = wx * z + (W / 2 + fo - cam.x * z + cam.kx),
    sy = wy * z + (H / 2 + go - cam.y * z + cam.ky);
  let q = 0;
  for (let i = 0; i < SUG_POOL && q < n; i++) {
    const c = sugCubes[i];
    if (c.on) continue;
    c.on = true;
    c.v = value / n;
    c.x0 = sx + rand(-12, 12);
    c.y0 = sy + rand(-7, 7);
    c.tx = sugBox.x;
    c.ty = sugBox.y;
    c.mx = (c.x0 + c.tx) / 2 + 20;
    c.my = Math.min(c.y0, c.ty) - 40;
    c.t = 0;
    c.d = q * 0.07;
    hudSugar.air += c.v;
    q++;
  }
  sugarSync(); // a full pool holds nothing back: the cubes not started land with the rest at once
}
function sugarTick(dt) {
  let live = false;
  for (let i = 0; i < SUG_POOL; i++) {
    const c = sugCubes[i];
    if (!c.on) continue;
    live = true;
    if (c.d > 0) {
      c.d -= dt;
      continue;
    }
    c.t += dt;
    if (c.t < SUG_FLY) continue;
    c.on = false;
    hudSugar.air = Math.max(0, hudSugar.air - c.v);
    sugarSync();
    if (!calm && sugSock.animate)
      sugSock.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.28)', offset: 0.4 }, { transform: 'scale(1)' }], {
        duration: 280,
        easing: 'cubic-bezier(.3,1.6,.5,1)',
      });
    sugStep = time - sugStepT < 0.3 ? Math.min(sugStep + 1, 7) : 0;
    sugStepT = time;
    Sfx.tick(sugStep);
  }
  if (live && !sugCubes.some((c) => c.on)) {
    hudSugar.air = 0; // no float dust left behind
    sugarSync();
  }
}
function sugarSettle() {
  // every cube lands now, silently: the end of a run must not leave sugar in the air
  for (let i = 0; i < SUG_POOL; i++) sugCubes[i].on = false;
  hudSugar.air = 0;
  sugarSync();
}
function sugarReset() {
  // a new run or shift: the pill starts again from 0 without rolling
  sugarSettle();
  sugShown = 0;
  sugOdo.set(0, true);
  sugBox.x = 0; // the HUD is about to show and may have moved: measure again at the first flight
  sugarEl.setAttribute('aria-label', t('a.sugar', 0));
}
function drawSugarCubes() {
  if (!sugImg.complete) return;
  for (let i = 0; i < SUG_POOL; i++) {
    const c = sugCubes[i];
    if (!c.on || c.d > 0) continue;
    const e = c.t / SUG_FLY,
      p = e * e * (3 - 2 * e),
      u = 1 - p,
      // a quadratic curve bent so that it passes through (mx, my) in the middle
      cx = 2 * c.mx - (c.x0 + c.tx) / 2,
      cy = 2 * c.my - (c.y0 + c.ty) / 2,
      x = u * u * c.x0 + 2 * u * p * cx + p * p * c.tx,
      y = u * u * c.y0 + 2 * u * p * cy + p * p * c.ty,
      s = (0.9 * u * u + 2 * u * p * 1.4 + 0.55 * p * p) * 11;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.translate(x, y);
    ctx.rotate(p * 5.6);
    ctx.drawImage(sugImg, -s, -s, s * 2, s * 2);
  }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
addEventListener('resize', sugSockBox);

// ---------- HUD: the stage pill (jaws, cloud or cake slice) and the buff coins ----------
let stageChompT = -9; // game time until which the jaws chomp: set when a stage event starts
// which icon the pill wears: the event under way, or the one that is next; '' when there is no stage line
function stageKind() {
  if (!stg || mode !== 'free' || !runActive || !player) return '';
  if (stg.winT > 0) return 'boss';
  return stg.cur ? stg.cur.k : STAGE_KEYS[stg.i];
}
// the jaws and the drops move as plain spans, each holding its own little svg: the page animates a span on the compositor,
// while any svg element (even a whole one) is restyled every frame it moves
const JAW_SVG =
    '<span class="ic jaw"><svg viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="10" rx="4" fill="#4a0c1c"/></svg><span class="jt"><svg viewBox="0 0 24 24"><path d="M1.5 9Q1.5 2.5 12 2.5T22.5 9V10H1.5Z" fill="#ff4f7b"/><path d="M1.5 9Q1.5 2.5 12 2.5T22.5 9" fill="none" stroke="#c8264f" stroke-width="1.4"/><path d="M4.5 9.6l2.6 4.4 2.6-4.4zM10.7 9.6l1.3 4.4 1.3-4.4h-2.6zM14.3 9.6l2.6 4.4 2.6-4.4z" fill="#fff6ea"/></svg></span><span class="jb"><svg viewBox="0 0 24 24"><path d="M1.5 15Q1.5 21.5 12 21.5T22.5 15V14H1.5Z" fill="#ff4f7b"/><path d="M1.5 15Q1.5 21.5 12 21.5T22.5 15" fill="none" stroke="#c8264f" stroke-width="1.4"/><path d="M6 14.4l2.4-3.8 2.4 3.8zM13.2 14.4l2.4-3.8 2.4 3.8z" fill="#fff6ea"/></svg></span></span>',
  RAIN_SVG =
    '<span class="ic rain"><svg viewBox="0 0 24 24"><path d="M6.5 14.5a3.6 3.6 0 0 1-.4-7.2 5.2 5.2 0 0 1 10-.6 3.9 3.9 0 0 1 1.4 7.8Z" fill="#d7f1ff" stroke="#3b9fd0" stroke-width="1.4" stroke-linejoin="round"/></svg><span class="d"><svg viewBox="0 0 24 24"><path d="M8 17.2v2" stroke="#ff4f7b" stroke-width="2.2" stroke-linecap="round"/></svg></span><span class="d"><svg viewBox="0 0 24 24"><path d="M12 17.8v2.2" stroke="#ffd23f" stroke-width="2.2" stroke-linecap="round"/></svg></span><span class="d"><svg viewBox="0 0 24 24"><path d="M16 17.2v2" stroke="#9be15d" stroke-width="2.2" stroke-linecap="round"/></svg></span></span>',
  CAKE_SVG =
    '<svg class="ic" viewBox="0 0 24 24"><path d="M3 12 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z" fill="#f6c88a" stroke="#8a4b2a" stroke-width="1.4" stroke-linejoin="round"/><path d="M3 12 21 9v3.5q-2.2 1.8-4.2 0t-4.2 1.4-4.2-.2-3.4.8Z" fill="#ff4f7b" stroke="#c8264f" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 5.8 13.6 2.4" fill="none" stroke="#3a6b2a" stroke-width="1.4" stroke-linecap="round"/><circle cx="12" cy="8" r="2.5" fill="#e8274b" stroke="#a31236" stroke-width="1"/></svg>',
  STAGE_ICON = { pir: JAW_SVG, rain: RAIN_SVG, boss: CAKE_SVG },
  FX_ICON = {
    speed:
      '<svg viewBox="0 0 24 24"><path d="M13.5 2 5.5 13.5H11L9.5 22 18.5 10H12.8Z" fill="#ffd23f" stroke="#c98b00" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    shield:
      '<svg viewBox="0 0 24 24"><path d="M12 2.5 20 5.5v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10v-6Z" fill="#7ad7ff" stroke="#2f8fbf" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 6.5v12.3c-3-1.3-5-3.7-5-7.2V8Z" fill="#fff" opacity=".55"/></svg>',
    magnet:
      '<svg viewBox="0 0 24 24"><path d="M6.5 5.5v6.5a5.5 5.5 0 0 0 11 0V5.5" fill="none" stroke="#e8274b" stroke-width="4.4"/><path d="M4.3 2.5h4.4v3.6H4.3zM15.3 2.5h4.4v3.6h-4.4z" fill="#d7e0ea" stroke="rgba(58,33,24,.25)" stroke-width=".6"/></svg>',
  };
// the buff coins: a cream circle that drains from the top as the bonus runs out, the seconds beside it
const FX_LIST = [
    ['speed', 'pSpeed'],
    ['shield', 'pShield'],
    ['magnet', 'pMagnet'],
  ],
  fxLive = []; // the coins now on the page: { prop, k, coin, b, t, s } with the last written fill and seconds
function renderFx() {
  const el = $('fx');
  let key = '';
  if (player && player.alive) for (const [k, prop] of FX_LIST) if (player[prop] > 0) key += k + ',';
  if (key !== lastFx) {
    // the set of bonuses changed: rebuild the coins
    lastFx = key;
    fxLive.length = 0;
    let html = '';
    for (const [k, prop] of FX_LIST)
      if (key.includes(k + ',')) {
        html += `<span class="fxu"><span class="coin" data-k="${k}">${FX_ICON[k]}</span><b></b></span>`;
        fxLive.push({ k, prop, coin: null, b: null, t: -1, s: -1 });
      }
    el.innerHTML = html;
    const coins = el.querySelectorAll('.coin'),
      nums = el.querySelectorAll('b');
    for (let i = 0; i < fxLive.length; i++) {
      fxLive[i].coin = coins[i];
      fxLive[i].b = nums[i];
    }
  }
  for (const f of fxLive) {
    const v = Math.max(0, player[f.prop]),
      fill = Math.round(clamp(v / PICK[f.k][1], 0, 1) * 100) / 100,
      s = Math.ceil(v);
    if (fill !== f.t) {
      f.t = fill;
      f.coin.style.setProperty('--t', fill);
    }
    if (s !== f.s) {
      f.s = s;
      f.b.textContent = s + t('unit.s');
    }
  }
}
