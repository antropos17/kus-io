// ---------- swallows in a row: a big word across the screen, rare like a multi-kill ----------
// Only the player's own swallows whole count; each within ANN.win s of the last climbs the ladder (2, 3, 4, 5+).
// The word is a page layer over the canvas, so it stays sharp when adapt lowers the canvas resolution; it pays nothing.
const ANN = { win: 5, life: 1.4, inT: 0.18, glow: 4 };
// n swallows in the chain, at: game time of the last one; top, bot: screen y of the candy's label and of its bottom
const ann = { n: 0, at: -99, step: 0, t: 0, hold: false, top: 0, bot: 0 };
const annEl = $('announce'),
  annWord = annEl.querySelector('b');
function annSwallow(B) {
  // called from swallowWhole for the player's own swallow, before the streak's stamp
  if (B.boss) return annReset(); // the Big Cake has its own win arc: it does not count and ends the chain
  ann.n = time - ann.at <= ANN.win ? ann.n + 1 : 1;
  ann.at = time;
  if (ann.n >= 2) annShow(Math.min(ann.n, 5));
}
const ANN_SIZE = [0, 0, 1, 1.12, 1.24, 1.36], // font scale of each step on a 34 px base
  ANN_SPR = ['#ff5d8f', '#ffd23f', '#7ad7ff', '#9be15d', '#c49bff', '#fff6e8', '#ff9a3d'];
let annMeasure = null;
function annShow(step) {
  if (state !== 'play' || !runActive) return;
  ann.step = step;
  ann.t = 0;
  annWord.textContent = t('ann.' + step);
  const glow = !calm && step >= ANN.glow;
  annEl.className = 's' + step + (calm ? ' calm' : '') + (glow ? ' glow' : '');
  annFit();
  void annEl.offsetWidth; // restart the CSS animation from its first frame
  annEl.classList.add('on');
  if (glow) annBurst(step);
  Sfx.announce(step);
}
const ANN_AVOID = ['dash', 'dodge', 'pauseBtn', 'mute', 'board'];
function annFit() {
  // the word goes in the band between the HUD and the top of the player's candy with its label (about 36% of the
  // height on a phone held upright); when that band is too short for a big word (a phone held sideways, a huge candy)
  // it goes in the band under the candy instead. Only what stands in the word's own columns counts, and it shrinks
  // to fit the band and the screen width
  if (!ann.step || !player) return;
  const z = cam.z,
    oy = H / 2 + focusOffset()[1] - cam.y * z + cam.ky;
  ann.top = (player.y - player.Rs) * z + oy - 34; // the ×N or the name above the candy
  ann.bot = (player.y + player.Rs) * z + oy + 6;
  if (!annMeasure) annMeasure = document.createElement('canvas').getContext('2d');
  annMeasure.font = `900 100px ${FONT}`;
  const w1 = annMeasure.measureText(annWord.textContent).width / 100, // width of the word per 1 px of font
    big = Math.min(34 * ANN_SIZE[ann.step], (W - 42) / (w1 * 1.04)),
    half = (big * w1 * 1.04) / 2 + 6,
    boxes = [];
  for (const e of [...$('score').children, ...ANN_AVOID.map($)])
    if (e && e.id !== 'feed') {
      const b = e.getBoundingClientRect(); // a hidden one has no box (offsetParent is null for fixed ones even when shown)
      if (b.width > 0 && b.height > 0 && b.right > W / 2 - half && b.left < W / 2 + half) boxes.push(b);
    }
  let upTop = 8,
    downBot = H - 8;
  for (const b of boxes) {
    // a box across the candy's top (or bottom) edge closes that band in the word's columns
    if (b.bottom <= ann.top) upTop = Math.max(upTop, b.bottom + 8);
    else if (b.top < ann.top) upTop = ann.top;
    if (b.top >= ann.bot) downBot = Math.min(downBot, b.top - 8);
    else if (b.bottom > ann.bot) downBot = ann.bot;
  }
  // the drawn box: the shadow outline, the settle overshoot and the tilt of about 3.5°
  const fit = (band) => Math.min(big, (band - 8) / (1.1 + w1 * 0.065)),
    up = fit(ann.top - 4 - upTop),
    down = fit(downBot - ann.bot - 4),
    above = up >= Math.min(big, 24) || up >= down,
    fs = Math.max(14, above ? up : down),
    h = fs * 1.1 + fs * w1 * 0.065 + 8;
  annWord.style.fontSize = fs.toFixed(1) + 'px';
  annEl.style.top = (above ? clamp(H * 0.36, upTop + h / 2, ann.top - 4 - h / 2) : ann.bot + 4 + h / 2).toFixed(1) + 'px';
}
function annBurst(step) {
  // a fountain of sprinkles out of the player's candy, fewer when adapt has lowered the detail
  const P = player,
    n = (24 + 8 * step) >> lod;
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2),
      sp = rand(160, 420);
    parts.push({ x: P.x, y: P.y - P.Rs * 0.4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, r: rand(3, 6), t: 0, T: rand(0.5, 0.9), c: ANN_SPR[i % ANN_SPR.length] });
  }
}
addEventListener('resize', () => ann.step && annFit()); // a phone turned mid-word: refit it to the new screen
function annHide() {
  ann.step = 0;
  annEl.classList.remove('on', 'hold');
  ann.hold = false;
}
function annReset() {
  ann.n = 0;
  ann.at = -99;
  annHide();
}
function annFrame(rdt, isPaused) {
  // every frame with the real frame time: a pause holds the word where it is, the end of its life hides it
  if (!ann.step) return;
  if (state !== 'play') return annHide();
  if (isPaused !== ann.hold) {
    ann.hold = isPaused;
    annEl.classList.toggle('hold', isPaused);
  }
  if (isPaused) return;
  ann.t += rdt;
  if (ann.t >= ANN.life) annHide();
}
