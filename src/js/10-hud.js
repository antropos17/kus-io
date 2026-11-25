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
  sugarEl.setAttribute('aria-label', `сахар ${v}`);
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
  sugarEl.setAttribute('aria-label', 'сахар 0');
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
