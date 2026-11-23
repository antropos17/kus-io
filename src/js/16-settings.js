// ---------- pause, settings, challenge ----------
const pauseEl = $('pause');
function applySet() {
  document.body.classList.toggle('lefty', SET.lefty);
  document.body.style.setProperty('--bs', String(SET.bs));
  for (const b of $('handSeg').children) b.setAttribute('aria-pressed', String((b.dataset.v === '1') === SET.lefty));
  for (const b of $('sizeSeg').children) b.setAttribute('aria-pressed', String(+b.dataset.v === SET.bs));
  for (const b of $('gfxSeg').children) b.setAttribute('aria-pressed', String(b.dataset.v === SET.gfx));
  for (const b of $('fpsSeg').children) b.setAttribute('aria-pressed', String((b.dataset.v === '1') === SET.fps));
  if (!SET.fps) $('fpsTag').textContent = '';
  if (SET.gfx === 'low') {
    lod = 2;
    quality = 0.75;
    probe = null;
    resize();
  } else if (SET.gfx === 'high') {
    lod = 0;
    quality = 1;
    probe = null;
    resize();
  } // 'auto' leaves it to adapt()
  try {
    localStorage.setItem('kus.set', JSON.stringify(SET));
  } catch (e) {}
}
function openPause() {
  if (state !== 'play' || !player || !player.alive || paused) return;
  paused = true;
  pauseEl.classList.remove('hidden');
  saveM();
  setTimeout(() => $('resume').focus({ preventScroll: true }), 30);
}
function closePause() {
  pauseEl.classList.add('hidden');
  paused = false;
  hudT = 0;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}
$('pauseBtn').addEventListener('click', openPause);
$('resume').addEventListener('click', closePause);
$('pauseX').addEventListener('click', closePause);
$('admX').addEventListener('click', closeAdmin);
$('overX').addEventListener('click', toMenu);
$('pAdmin').addEventListener('click', () => {
  pauseEl.classList.add('hidden');
  paused = false;
  openAdmin();
});
$('pMenu').addEventListener('click', toMenu);
$('toMenu').addEventListener('click', toMenu);
$('handSeg').addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  SET.lefty = t.dataset.v === '1';
  applySet();
});
$('sizeSeg').addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  SET.bs = +t.dataset.v;
  applySet();
});
$('gfxSeg').addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  SET.gfx = t.dataset.v;
  if (SET.gfx === 'auto') {
    lod = 0;
    quality = 1;
    resize();
  }
  applySet();
});
$('fpsSeg').addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  SET.fps = t.dataset.v === '1';
  applySet();
});
$('diffSeg').addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  diff = t.dataset.v;
  renderMode();
});
$('modeSeg').addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  mode = t.dataset.m;
  renderMode();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    saveM();
    openPause();
  }
}); // switching apps must not get you eaten
$('chalBtn').addEventListener('click', () => {
  if (run.won) return shareWin();
  // a link that carries your score: the friend sees it as the target
  const score = Math.round(run.max),
    name = (nick.value || '').trim().slice(0, 14) || 'Кусака';
  const base = /^https?:$/.test(location.protocol) && !/claude|anthropic/i.test(location.hostname) ? location.origin + location.pathname : PUBLIC_URL;
  const daily = mode === 'daily' && run.rule, // a candy-of-the-day link opens the same day's run
    url = base + '?c=' + score + '&n=' + encodeURIComponent(name) + (daily ? '&d=' + run.day : ''),
    text = daily ? `КУСЬ.io, конфета дня «${run.rule.name}»: у меня ${score}. Побей до полуночи` : `Я набрал ${score} в КУСЬ.io. Побей!`,
    box = $('chalLink');
  box.value = url;
  box.classList.remove('hidden');
  const pick = () => {
    try {
      box.focus();
      box.select();
    } catch (e) {}
  };
  try {
    if ((touchMode || daily) && navigator.share) {
      navigator.share({ title: 'КУСЬ.io', text, url }).catch(() => {});
      return;
    }
    navigator.clipboard.writeText(text + ' ' + url).then(() => {
      $('chalBtn').textContent = 'Ссылка скопирована';
    }, pick);
  } catch (e) {
    pick();
  }
});
function shareWin() {
  // the win screen's «Поделиться»: the clear time and a link to the game
  const base = /^https?:$/.test(location.protocol) && !/claude|anthropic/i.test(location.hostname) ? location.origin + location.pathname : PUBLIC_URL,
    text = `Я съел Большой Торт в КУСЬ.io за ${mmss(run.won.secs)}. Сможешь быстрее?`,
    box = $('chalLink');
  box.value = base;
  try {
    if (navigator.share) {
      navigator.share({ title: 'КУСЬ.io', text, url: base }).catch(() => {});
      return;
    }
    navigator.clipboard.writeText(text + ' ' + base).then(
      () => {
        $('chalBtn').textContent = 'Скопировано';
      },
      () => box.classList.remove('hidden'),
    );
  } catch (e) {
    box.classList.remove('hidden');
  }
}
