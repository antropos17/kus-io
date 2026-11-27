// ---------- gamepad ----------
// The standard Gamepad API, read once a frame (padPoll from frame in 17-boot). In a run the left stick feeds the same
// `stick` the touch joystick does and the buttons set `input`; whoever touched last is in charge: a press or a stick
// out of its dead zone turns pad mode on (body.pad), a mouse move, a mouse or finger press, or a key turns it off.
// Layout (mapping 'standard'): A 0, B 1, LB 4, RB 5, LT 6, RT 7, Select 8, Start 9, d-pad 12 up, 13 down, 14 left, 15 right.
const PAD = { dead: 0.18, trig: 0.5, rep0: 0.4, rep: 0.12 }; // stick dead zone, trigger threshold, d-pad repeat: first after, then every
const pad = { idx: -1, prev: [], now: [], hold: 0, dir: '', m: 0, ax: 0, ay: 0, runA: false, root: null };
const padDown = (i) => !!pad.now[i] && !pad.prev[i]; // pressed in this frame
const padHeld = (i) => !!pad.now[i];
// in a run with nothing over it: the pause card, the admin panel and the album take the buttons for themselves
const padInRun = () => state === 'play' && pauseEl.classList.contains('hidden') && admEl.classList.contains('hidden') && !albumOpen();

function padFind() {
  // the first connected pad with the standard layout drives; any other pad is ignored
  let list = [];
  try {
    list = navigator.getGamepads ? navigator.getGamepads() : [];
  } catch (e) {}
  for (let i = 0; i < (list ? list.length : 0); i++) {
    const g = list[i];
    if (g && g.connected !== false && g.mapping === 'standard') return g;
  }
  return null;
}

function padPoll(rdt) {
  const g = padFind();
  const prev = pad.prev;
  pad.prev = pad.now;
  pad.now = prev;
  pad.now.length = 0;
  if (!g) {
    pad.idx = -1;
    pad.m = 0;
    pad.runA = false;
    return;
  }
  pad.idx = g.index;
  const b = g.buttons || [];
  for (let i = 0; i < 17; i++) {
    const x = b[i];
    // a trigger counts past half way; other buttons by their own pressed flag
    pad.now[i] = !!x && (i === 6 || i === 7 ? x.value > PAD.trig : !!x.pressed || x.value > PAD.trig);
  }
  const ax = +g.axes[0] || 0,
    ay = +g.axes[1] || 0,
    m = Math.hypot(ax, ay),
    was = pad.m;
  pad.ax = ax;
  pad.ay = ay;
  pad.m = m;
  let pressed = false;
  for (let i = 0; i < 17; i++) if (padDown(i)) pressed = true;
  // a stick resting a little off centre (drift) never takes over: only a press or a push out of the dead zone
  if (pressed || (m > PAD.dead && was <= PAD.dead)) {
    if (!padMode) pad.root = null; // the screen under the mouse gets its first focus now
    setPad(true);
  }
  if (!padMode) return;
  if (padDown(8)) toggleMute();
  if (padDown(9)) {
    if (!pauseEl.classList.contains('hidden')) closePause();
    else if (padInRun()) openPause();
  }
  if (!padInRun()) {
    pad.runA = false; // an A held through the start of a run is the menu's press, not a bite
    padScreens(rdt);
    return;
  }
  pad.root = null;
  pad.dir = '';
  if (m > PAD.dead) {
    stick.vx = ax / m;
    stick.vy = ay / m;
    stick.mag = Math.min(1, (m - PAD.dead) / (1 - PAD.dead));
  } else stick.mag = 0; // a released stick stops the candy
  const a = padHeld(0) || padHeld(7);
  if (padDown(0) || padDown(7)) {
    input.dash = true;
    pad.runA = true;
  }
  if (!a) pad.runA = false;
  input.dashHeld = pad.runA; // held: a new bite each time the lunge is ready again, like the touch button
  if (padDown(1) || padDown(6)) input.dodge = true;
}

// whoever touched last is in charge
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' && padMode) setPad(false);
});
addEventListener('pointerdown', () => setPad(false), { capture: true });
addEventListener('keydown', () => setPad(false), { capture: true });
addEventListener('gamepaddisconnected', () => {
  if (padMode) openPause(); // the pad went away mid-run: stop before the candy gets eaten
});

// ---------- gamepad on the screens ----------
// The d-pad (or the stick past half way) moves the focus to the nearest button that way, A presses it, B goes back,
// LB/RB step through the open items of a choice row. Nothing here knows the screens' buttons: any visible button,
// radio or link of the top window is a stop, so new screens and rows work by themselves.
const PAD_ROOTS = ['album', 'adm', 'pause', 'over', 'menu']; // the top window first
const PAD_HOME = { menu: 'play', pause: 'resume', over: 'again', album: 'albumX' }; // each screen's main button
const padShown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
function padRoot() {
  for (const id of PAD_ROOTS) {
    const el = $(id);
    if (el && !el.classList.contains('hidden') && padShown(el)) return el;
  }
  return null;
}
function padItems(root) {
  if (!root) return [];
  // the name is optional and the admin panel is not for players: both are skipped
  return [...root.querySelectorAll('button, [role=radio], a[href]')].filter(
    (el) => el.id !== 'nick' && el.id !== 'pAdmin' && !el.disabled && padShown(el),
  );
}
function padFocus(el) {
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // a stop outside a scrolled window or row brings it into view
}
function padHome(root) {
  const items = padItems(root),
    main = $(PAD_HOME[root && root.id]),
    el = items.includes(main) ? main : items[0];
  if (el) padFocus(el);
}
function padNav(dir) {
  const root = padRoot();
  if (!root) return false;
  const items = padItems(root),
    cur = document.activeElement;
  if (!items.includes(cur)) {
    padHome(root); // the focused button went away (a section folded, a card redrawn): start from the screen's main button
    return !!root.contains(document.activeElement);
  }
  const r = cur.getBoundingClientRect(),
    cx = r.left + r.width / 2,
    cy = r.top + r.height / 2,
    v = dir === 'up' || dir === 'down';
  let best = null,
    bw = Infinity;
  for (const el of items) {
    if (el === cur) continue;
    const q = el.getBoundingClientRect(),
      dx = q.left + q.width / 2 - cx,
      dy = q.top + q.height / 2 - cy,
      main = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
    if (main <= 4) continue;
    const w = main + 2 * (v ? Math.abs(dx) : Math.abs(dy)); // the way it points, plus twice the step aside
    if (w < bw) {
      bw = w;
      best = el;
    }
  }
  if (!best) return false;
  padFocus(best);
  return true;
}
function padBack(root) {
  if (root.id === 'album') closeAlbum();
  else if (root.id === 'pause') closePause();
  else if (root.id === 'over' && padShown($('overX'))) $('overX').click();
}
function padRow(root, step) {
  // LB/RB: the previous or next open item of the row in focus, or of the flavours; a locked one is skipped
  if (root.id !== 'menu') return;
  const cur = document.activeElement,
    inRow = cur && cur.closest ? cur.closest('.pr') : null,
    row = inRow && root.contains(inRow) ? inRow : $('sw');
  const open = [...row.querySelectorAll('[role=radio]')].filter((x) => !x.classList.contains('lock') && !x.disabled),
    next = open[open.findIndex((x) => x.getAttribute('aria-checked') === 'true') + step];
  if (!next) return;
  next.click();
  if (inRow) {
    const now = row.querySelector('[aria-checked="true"]'); // the row may have been drawn anew
    if (now) padFocus(now);
  }
}
function padScreens(rdt) {
  const root = padRoot();
  if (root !== pad.root) {
    pad.root = root; // a window opened or closed: its main button takes the focus
    if (root) padHome(root);
  }
  if (!root) return;
  if (padDown(0)) {
    const el = document.activeElement;
    if (padItems(root).includes(el)) el.click();
    else padHome(root);
  } else if (padDown(1)) padBack(root);
  else if (padDown(4) || padDown(5)) padRow(root, padDown(5) ? 1 : -1);
  const ax = pad.ax,
    ay = pad.ay,
    dir = padHeld(12)
      ? 'up'
      : padHeld(13)
        ? 'down'
        : padHeld(14)
          ? 'left'
          : padHeld(15)
            ? 'right'
            : Math.max(Math.abs(ax), Math.abs(ay)) <= 0.5
              ? ''
              : Math.abs(ax) > Math.abs(ay)
                ? ax > 0
                  ? 'right'
                  : 'left'
                : ay > 0
                  ? 'down'
                  : 'up';
  if (!dir) pad.dir = '';
  else if (dir !== pad.dir) {
    pad.dir = dir; // a new direction moves at once, then repeats while held
    pad.hold = PAD.rep0;
    padNav(dir);
  } else if ((pad.hold -= rdt) <= 0) {
    pad.hold += PAD.rep;
    padNav(dir);
  }
}
