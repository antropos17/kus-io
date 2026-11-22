// ---------- world state ----------
let blobs = [],
  food = [],
  chunks = [],
  strands = [],
  gulps = [],
  parts = [],
  texts = [],
  respawnQ = [];
let slowT = 0,
  frameNo = 0;
const PUBLIC_URL = 'https://antropos17.github.io/kus-io/';
let mode = 'free',
  timeLeft = 0,
  runActive = false,
  best3 = 0,
  prevBest3 = 0,
  lastFx = '';
let run = { bites: 0, kills: 0, max: 0, deaths: 0, t0: 0, cheated: false, sugar: 0 }; // totals for the whole run, across lives in the timed mode
let sugar = 0; // sugar in the bank, spent on patterns
const SET = { lefty: false, bs: 1, gfx: 'auto', fps: false };
const DIFFS = {
  // start mass, how eagerly bots go for you, seconds between lucky escapes (0 = none), your speed edge, how long a bot keeps chasing
  easy: { start: 55, hunt: 0.5, grace: 7, speed: 1.12, chase: 2.5 },
  normal: { start: 40, hunt: 1, grace: 12, speed: 1.08, chase: 3.5 },
  hard: { start: 34, hunt: 1.9, grace: 0, speed: 1.02, chase: 7 },
};
let diff = 'normal',
  leader = null,
  seen = {},
  newcomer = false, // never finished a run: short menu, and a harmless snack waits in front of them
  tutor = null; // the first run's snack until the first bite
const M = { seq: 0, act: [], open: [] }; // missions: counter, the three active ones, skins won so far
const challenge = (() => {
  try {
    const q = new URLSearchParams(location.search),
      c = parseInt(q.get('c'), 10),
      n = (q.get('n') || '').slice(0, 14);
    const d = parseInt(q.get('d'), 10); // the date of a candy-of-the-day challenge, 20261123
    return c > 0 && c < 100000 ? { c, n: n || 'Друг', d: d > 20000000 && d < 30000000 ? d : 0 } : null;
  } catch (e) {
    return null;
  }
})();
let pickups = [],
  pickT = 3,
  specialT = 0,
  cakeAt = 8,
  pirAt = 25;
let player = null,
  state = 'menu',
  time = 0,
  deadT = 0,
  killer = null,
  flashT = 0,
  sprinkleCount = 0,
  crumbCount = 0;
let chosen = randi(PALS.length),
  chosenHat = 'none',
  chosenSkin = 'plain',
  prevBest = 0,
  best = 0,
  paused = false,
  debugCam = null,
  menuTarget = null,
  menuSwitchT = 0;
const CHEAT = { god: false, cd: false, mega: false, peace: false, magnet: false, slow: false, heal: false, speed: 1 };
try {
  const cs = JSON.parse(localStorage.getItem('kus.cheat') || '{}');
  for (const k in CHEAT) if (k in cs) CHEAT[k] = cs[k];
} catch (e) {}
const saveCheats = () => {
  try {
    localStorage.setItem('kus.cheat', JSON.stringify(CHEAT));
  } catch (e) {}
};
const cheatsOn = () => CHEAT.god || CHEAT.cd || CHEAT.mega || CHEAT.peace || CHEAT.magnet || CHEAT.slow || CHEAT.heal || CHEAT.speed !== 1;
const cam = { x: WORLD / 2, y: WORLD / 2, z: 0.6, zb: 0.6, zk: 0, zv: 0, kx: 0, ky: 0, kvx: 0, kvy: 0, shake: 0, sa: null }; // zb: zoom that follows the player; zk: spring on top of it; kx, ky: spring nudge in screen pixels
const calm = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); // no shake or flash
const input = { sx: 0, sy: 0, dash: false, dodge: false, dashHeld: false };
const stick = { id: -1, on: false, used: false, bx: 0, by: 0, x: 0, y: 0, vx: 1, vy: 0, mag: 0, prev: 0, moved: false };
let touchMode = false,
  boardBottom = 160,
  boardLeft = 0,
  btnTop = 1e9;
function setTouch(on) {
  if (touchMode === on) return;
  touchMode = on;
  document.body.classList.toggle('touch', on);
}
function haptic(ms) {
  // a tap in the hand on every bite, where the device allows it
  try {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred(ms > 20 ? 'heavy' : 'light');
    else if (touchMode && navigator.vibrate) navigator.vibrate(ms);
  } catch (e) {}
}
