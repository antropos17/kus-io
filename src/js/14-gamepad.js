// ---------- gamepad ----------
// The standard Gamepad API, read once a frame (padPoll from frame in 17-boot). In a run the left stick feeds the same
// `stick` the touch joystick does and the buttons set `input`; whoever touched last is in charge: a press or a stick
// out of its dead zone turns pad mode on (body.pad), a mouse move, a mouse or finger press, or a key turns it off.
// Layout (mapping 'standard'): A 0, B 1, LB 4, RB 5, LT 6, RT 7, Select 8, Start 9, d-pad 12 up, 13 down, 14 left, 15 right.
const PAD = { dead: 0.18, trig: 0.5, rep0: 0.4, rep: 0.12 }; // stick dead zone, trigger threshold, d-pad repeat: first after, then every
const pad = { idx: -1, prev: [], now: [], hold: 0, dir: '', m: 0, ax: 0, ay: 0, runA: false };
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
  if (pressed || (m > PAD.dead && was <= PAD.dead)) setPad(true);
  if (!padMode) return;
  if (padDown(8)) toggleMute();
  if (padDown(9)) {
    if (!pauseEl.classList.contains('hidden')) closePause();
    else if (padInRun()) openPause();
  }
  if (!padInRun()) {
    pad.runA = false; // an A held through the start of a run is the menu's press, not a bite
    return;
  }
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
