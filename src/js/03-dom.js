// ---------- dom & canvas ----------
const $ = (id) => document.getElementById(id);
const cvs = $('c');
let ctx = cvs.getContext('2d', { alpha: false }) || cvs.getContext('2d'); // let: the album borrows the drawing code for its stickers
const menuEl = $('menu'),
  overEl = $('over'),
  hudEl = $('hud'),
  massEl = $('mass'),
  feedEl = $('feed'),
  lbEl = $('lb');
const dodgeEl = $('dodge'),
  hatsEl = $('hats'),
  recEl = $('rec');
const dashEl = $('dash'),
  muteEl = $('mute'),
  nick = $('nick'),
  swEl = $('sw'),
  whoEl = $('who'),
  bestEl = $('best');
let W = 1,
  H = 1,
  DPR = 1,
  quality = 1,
  STICK_R = 58;
const safe = { t: 0, r: 0, b: 0, l: 0 }; // notch and rounded-corner insets
const COARSE = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
const PIXEL_BUDGET = COARSE ? 1.2e6 : 2.2e6; // backing pixels; big retina screens otherwise draw 8M+ px a frame
const resize = () => {
  W = Math.max(1, innerWidth);
  H = Math.max(1, innerHeight);
  const dev = Math.min(2, window.devicePixelRatio || 1),
    cap = Math.sqrt(PIXEL_BUDGET / (W * H));
  DPR = Math.max(0.45, Math.min(dev, cap) * quality);
  const cw = Math.round(W * DPR),
    ch = Math.round(H * DPR);
  if (cvs.width !== cw || cvs.height !== ch) {
    cvs.width = cw;
    cvs.height = ch;
  }
  STICK_R = clamp(Math.min(W, H) * 0.15, 46, 72);
  try {
    const cs = getComputedStyle($('safe'));
    safe.t = parseFloat(cs.paddingTop) || 0;
    safe.r = parseFloat(cs.paddingRight) || 0;
    safe.b = parseFloat(cs.paddingBottom) || 0;
    safe.l = parseFloat(cs.paddingLeft) || 0;
  } catch (e) {}
};
addEventListener('resize', resize);
resize();
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
