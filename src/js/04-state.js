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
  slowLen = 0.4, // how long the current slow-down arc lasts and how deep it dips
  slowDip = 0.32,
  frameNo = 0;
const PUBLIC_URL = 'https://antropos17.github.io/kus-io/';
// where the page runs: 'app' inside the Capacitor phone app, 'steam' inside the desktop wrapper (its preload sets
// window.KUS_PLATFORM), 'web' everywhere else. The web page never changes because of it.
const PLATFORM = (() => {
  try {
    if (window.Capacitor && window.Capacitor.isNativePlatform() === true) return 'app';
  } catch (e) {}
  return window.KUS_PLATFORM === 'steam' ? 'steam' : 'web';
})();
let mode = 'free',
  timeLeft = 0,
  runActive = false,
  best3 = 0,
  prevBest3 = 0,
  lastFx = '';
let run = { bites: 0, kills: 0, max: 0, deaths: 0, t0: 0, cheated: false, sugar: 0 }; // totals for the whole run, across lives in the timed mode
let sugar = 0; // sugar in the bank, spent on patterns
const SET = { lefty: true, hv: 2, bs: 1, gfx: 'auto', fps: false }; // lefty: Кусь and Язык on the left, the joystick hint on the right (the default); hv 2: the hand in this save was chosen under that default
const DIFFS = {
  // start mass, how eagerly bots go for you, seconds between lucky escapes (0 = none), your speed edge, how long a bot keeps chasing
  easy: { start: 55, hunt: 0.5, grace: 7, speed: 1.12, chase: 2.5 },
  normal: { start: 40, hunt: 1, grace: 12, speed: 1.08, chase: 3.5 },
  // ai: the smarter bots (09-bots); easy and normal have none and keep the old script.
  // react: seconds between decisions (random in this range); feint: side-steps, jukes and lunges; tongue: how keenly it is used;
  // sneak: small bots biting the back of a busy big one; pack: most bots in one pack, packs: packs at once, packCd: seconds between packs;
  // shy: the player's mass below which no pack or sneak goes for them (the allowance a small player keeps)
  // fresh: how keenly bots hunt a player in the first 20 s of a life (below 1: no tongue at them then either);
  // save: seconds at the start of a life with rescues from a lethal bite, 5 s apart (these levels have no grace otherwise)
  hard: {
    start: 34,
    hunt: 1.9,
    grace: 0,
    speed: 1.02,
    chase: 7,
    ai: { react: [0.16, 0.34], feint: 0.45, tongue: 0.6, sneak: 0.5, pack: 3, packs: 1, packCd: 16, shy: 110, fresh: 0.7, save: 20 },
  },
  extreme: {
    start: 32,
    hunt: 2.2,
    grace: 0,
    speed: 1,
    chase: 9,
    ai: { react: [0.08, 0.24], feint: 1, tongue: 1, sneak: 1, pack: 4, packs: 2, packCd: 8, shy: 70, fresh: 0.6, save: 20 },
  },
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
    return c > 0 && c < 100000 ? { c, n: !n ? t('friend') : isDefName(n) ? t('defName') : n, d: d > 20000000 && d < 30000000 ? d : 0 } : null;
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
  chosenEyes = 'none',
  chosenTrail = 'none',
  chosenTray = 'choco',
  chosenSkin = 'plain',
  prevBest = 0,
  best = 0,
  paused = false,
  debugCam = null,
  menuTarget = null,
  menuSwitchT = 0;
const CHEAT = { god: false, cd: false, mega: false, peace: false, magnet: false, slow: false, heal: false, speed: 1 };
try {
  // store builds have no admin panel, so cheats saved by an earlier build could never be turned off there
  const cs = PLATFORM === 'web' ? JSON.parse(localStorage.getItem('kus.cheat') || '{}') : {};
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
