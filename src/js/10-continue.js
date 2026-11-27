// ---------- «Продолжить»: once per free run in the store builds ----------
// The web never sees it. A death in a free run in 'app' or 'steam' holds the run's payout and offers to come back
// with the mass the candy had in its last seconds; «Нет», the timer or leaving to the menu pay the run as before.
const CONT = { delay: 1.1, secs: 5, back: 3, lock: 0.5, step: 0.25, span: 3 };
const cont = { pend: false, on: false, left: 0, at: 0 }; // at: when the window showed, for the click lock
const contLogM = new Float32Array(Math.ceil(CONT.span / CONT.step)); // the mass every CONT.step s, a ring
let contAcc = 0,
  contI = 0;
const contEl = $('cont');
function contCan() {
  return PLATFORM !== 'web' && mode === 'free' && !run.contUsed;
}
function contClear() {
  contLogM.fill(0);
  contAcc = 0;
  contI = 0;
}
function contLog(dt) {
  contAcc += dt;
  if (contAcc < CONT.step) return;
  contAcc -= CONT.step;
  contLogM[contI] = player.mass;
  contI = (contI + 1) % contLogM.length;
}
function contMass() {
  let m = DIFFS[diff].start;
  for (let i = 0; i < contLogM.length; i++) m = Math.max(m, contLogM[i]);
  return m;
}
function contHide() {
  cont.pend = false;
  cont.on = false;
  contEl.classList.add('hidden');
}
function contShow() {
  cont.on = true;
  cont.at = performance.now();
  cont.left = CONT.secs;
  $('contN').textContent = CONT.secs;
  contEl.style.setProperty('--p', '1');
  contEl.classList.remove('hidden');
}
function contYes() {
  if (!cont.pend) return;
  const peak = player ? player.stats.maxMass : 0,
    m = contMass();
  contHide();
  run.contUsed = true;
  spawnPlayer(CONT.back);
  player.mass = m;
  shownMass = m;
  player.stats.maxMass = Math.max(peak, m);
  contClear();
  hudT = 0;
}
function contNo() {
  if (!cont.pend) return;
  contHide();
  finishRun();
  showOver();
}
function contFrame(rdt) {
  if (!cont.on) return; // real time
  cont.left -= rdt;
  if (cont.left <= 0) return contNo();
  const s = Math.ceil(cont.left);
  if ($('contN').textContent !== String(s)) $('contN').textContent = s;
  contEl.style.setProperty('--p', (cont.left / CONT.secs).toFixed(3));
}
// a click that was a bite mashed through the death must not choose: the first CONT.lock s of the window ignore clicks
const contClick = (fn) => () => {
  if (performance.now() - cont.at >= CONT.lock * 1000) fn();
};
$('contYes').addEventListener('click', contClick(contYes));
$('contNo').addEventListener('click', contClick(contNo));
// leaving the app or closing the window while the offer is up pays the run at once: a backgrounded app may be killed
// and the run's sugar and record must not go with it (the continue is the price of leaving)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) contNo();
});
addEventListener('pagehide', contNo);
