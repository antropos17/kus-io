// ---------- swallows in a row: a big word across the screen, rare like a multi-kill ----------
// Only the player's own swallows whole count; each within ANN.win s of the last climbs the ladder (2, 3, 4, 5+).
// The word is a page layer over the canvas, so it stays sharp when adapt lowers the canvas resolution; it pays nothing.
const ANN = { win: 5, life: 1.4, inT: 0.18, glow: 4 };
const ann = { n: 0, at: -99, step: 0, t: 0, hold: false }; // n swallows in the chain, at: game time of the last one
const annEl = $('announce'),
  annWord = annEl.querySelector('b');
function annSwallow(B) {
  // called from swallowWhole for the player's own swallow, before the streak's stamp
  if (B.boss) return annReset(); // the Big Cake has its own win arc: it does not count and ends the chain
  ann.n = time - ann.at <= ANN.win ? ann.n + 1 : 1;
  ann.at = time;
  if (ann.n >= 2) annShow(Math.min(ann.n, 5));
}
function annShow(step) {
  if (state !== 'play' || !runActive) return;
  ann.step = step;
  ann.t = 0;
  annWord.textContent = t('ann.' + step);
  annEl.className = 's' + step + (calm ? ' calm' : '');
  void annEl.offsetWidth; // restart the CSS animation from its first frame
  annEl.classList.add('on');
  Sfx.announce(step);
}
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
