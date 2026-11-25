// ---------- input ----------
function stickMove(e) {
  let dx = e.clientX - stick.bx,
    dy = e.clientY - stick.by,
    d = Math.hypot(dx, dy);
  if (d > STICK_R) {
    dx *= STICK_R / d;
    dy *= STICK_R / d;
    d = STICK_R;
    stick.bx = e.clientX - dx;
    stick.by = e.clientY - dy;
  } // the base trails the thumb
  stick.x = e.clientX;
  stick.y = e.clientY;
  const m = d / STICK_R;
  if (m > 0.14) {
    stick.vx = dx / (d || 1);
    stick.vy = dy / (d || 1);
    stick.mag = (m - 0.14) / 0.86;
    stick.moved = true;
  } else if (stick.moved) stick.mag = 0; // thumb back on the centre: stop and hold the heading
}
function stickEnd(e) {
  if (e.pointerId !== stick.id) return;
  stick.id = -1;
  stick.on = false;
  if (!stick.moved) stick.mag = stick.prev; // a plain tap changes nothing
}
cvs.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') {
    setTouch(false);
    input.sx = e.clientX;
    input.sy = e.clientY;
  } else if (e.pointerId === stick.id) stickMove(e);
});
cvs.addEventListener('pointerup', stickEnd);
cvs.addEventListener('pointercancel', stickEnd);
addEventListener('gesturestart', (e) => e.preventDefault());
cvs.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false }); // no scroll, zoom or callout from the play field
for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) addEventListener(ev, () => Sfx.init(), { passive: true, capture: true }); // iOS only unlocks sound on a finished tap
$('board').addEventListener('click', () => {
  // tap the rating to fold it down to the leader and you
  if (!touchMode) return;
  const m = $('board').classList.toggle('min');
  try {
    localStorage.setItem('kus.lbmin', m ? '1' : '0');
  } catch (e) {}
  hudT = 0;
});
cvs.addEventListener('pointerdown', (e) => {
  Sfx.init();
  if (e.pointerType !== 'mouse') {
    setTouch(true);
    e.preventDefault();
    if (stick.id === -1 && state === 'play') {
      stick.id = e.pointerId;
      stick.on = true;
      stick.used = true;
      stick.moved = false;
      stick.prev = stick.mag;
      stick.bx = stick.x = e.clientX;
      stick.by = stick.y = e.clientY;
      try {
        cvs.setPointerCapture(e.pointerId);
      } catch (err) {}
    }
    return;
  }
  setTouch(false);
  input.sx = e.clientX;
  input.sy = e.clientY;
  if (e.pointerType === 'mouse' && e.button === 0 && state === 'play') input.dash = true;
  if (e.pointerType === 'mouse' && e.button === 2 && state === 'play') input.dodge = true;
});
cvs.addEventListener('contextmenu', (e) => e.preventDefault());
dashEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  Sfx.init();
  if (e.pointerType !== 'mouse') {
    setTouch(true);
    input.dashHeld = true;
  }
  if (state === 'play') input.dash = true;
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave'])
  dashEl.addEventListener(ev, () => {
    input.dashHeld = false;
  });
dodgeEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  Sfx.init();
  if (e.pointerType !== 'mouse') setTouch(true);
  if (state === 'play') input.dodge = true;
});
dodgeEl.addEventListener('click', (e) => {
  if (e.detail === 0 && state === 'play') input.dodge = true;
});
dashEl.addEventListener('click', (e) => {
  if (e.detail === 0 && state === 'play') input.dash = true;
}); // keyboard activation
addEventListener('keydown', (e) => {
  Sfx.init();
  if (albumOpen()) {
    if (e.key === 'Escape') closeAlbum();
    return;
  }
  if (e.key === 'Escape' || (e.code === 'KeyP' && !(e.target && e.target.tagName === 'INPUT'))) {
    if (!admEl.classList.contains('hidden')) closeAdmin();
    else if (!pauseEl.classList.contains('hidden')) closePause();
    else openPause();
    return;
  }
  if (!pauseEl.classList.contains('hidden')) return;
  if (!admEl.classList.contains('hidden')) return;
  if (e.target && e.target.tagName === 'INPUT') {
    if (e.key === 'Enter') {
      e.preventDefault();
      startGame();
    }
    return;
  }
  if (e.code === 'Space') {
    if (state === 'play') {
      e.preventDefault();
      input.dash = true;
    }
  } else if (e.key === 'Enter' && state !== 'play' && !(e.target && e.target.tagName === 'BUTTON')) {
    e.preventDefault();
    startGame();
  } else if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && state === 'play') input.dodge = true;
  else if (e.code === 'KeyM') toggleMute();
});
function toggleMute() {
  Sfx.on = !Sfx.on;
  muteEl.classList.toggle('muted', !Sfx.on);
  muteEl.setAttribute('aria-label', Sfx.on ? 'Выключить звук' : 'Включить звук');
}
muteEl.addEventListener('click', () => {
  Sfx.init();
  toggleMute();
});
$('play').addEventListener('click', startGame);
$('again').addEventListener('click', startGame);
function renderHats() {
  if (!HATS.some((h) => h.id === chosenHat && h.need <= best)) chosenHat = 'none';
  hatsEl.innerHTML = HATS.map((h) => {
    const lock = h.need > best;
    return `<button type="button" role="radio" aria-checked="${h.id === chosenHat}" data-h="${h.id}"${lock ? ' disabled' : ''}>${h.name}${lock ? ` <small>с ${h.need}</small>` : ''}</button>`;
  }).join('');
  recEl.textContent = best ? `Рекорд: ${best}` : 'Шапки открываются за рекорд по массе';
  renderSecs();
}
hatsEl.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t || t.disabled) return;
  chosenHat = t.dataset.h;
  renderHats();
  const el = hatsEl.querySelector(`[data-h="${chosenHat}"]`);
  if (el) el.focus();
});
const skinsEl = $('skins'),
  bankEl = $('bank');
let askSkin = null,
  bankT = 0;
function renderBank(msg) {
  // the sugar balance; a message replaces it for a few seconds
  clearTimeout(bankT);
  bankEl.textContent = msg || `Сахар: ${sugar}`;
  if (msg) bankT = setTimeout(() => renderBank(), 3200);
}
function renderSkins() {
  if (!SKINS.some((k) => k[0] === chosenSkin)) chosenSkin = 'plain';
  if (!skinOpen(chosenSkin)) chosenSkin = 'plain';
  skinsEl.innerHTML = SKINS.map(([id, name], i) => {
    const lock = !skinOpen(id),
      price = SKIN_PRICE(i),
      tag = !lock
        ? ''
        : askSkin === id
          ? '<small class="pz ask">купить</small>'
          : `<small class="pz${sugar >= price ? ' can' : ''}">${price}</small>`,
      why = lock ? `: за задание или за ${price} сахара` : '';
    return `<button type="button" role="radio" aria-checked="${id === chosenSkin}" aria-label="${name}${why}" title="${name}${why}" data-s="${id}"${lock ? ' class="lock"' : ''}><canvas width="92" height="92"></canvas>${tag}</button>`;
  }).join('');
  renderSecs();
  const pal = PALS[chosen];
  for (const btn of skinsEl.children) {
    // a little candy in the chosen flavour wearing each pattern
    const g = btn.firstChild.getContext('2d'),
      art = skinTile(btn.dataset.s),
      R = 42,
      t = (art.span * R * 256) / 256;
    g.save();
    g.beginPath();
    g.arc(46, 46, R, 0, TAU);
    g.clip();
    const gr = g.createRadialGradient(31, 28, 3, 46, 46, 48);
    gr.addColorStop(0, pal.light);
    gr.addColorStop(0.55, pal.base);
    gr.addColorStop(1, pal.dark);
    g.fillStyle = gr;
    g.fillRect(0, 0, 92, 92);
    for (let i = -3; i <= 3; i++)
      for (let j = -3; j <= 3; j++) {
        const x = 46 - t / 2 + i * t,
          y = 46 - t / 2 + j * t;
        if (x > 92 || y > 92 || x + t < 0 || y + t < 0) continue;
        g.drawImage(art.c, x, y, t, t);
      }
    g.restore();
    g.lineWidth = 4;
    g.strokeStyle = pal.rim;
    g.beginPath();
    g.arc(46, 46, R, 0, TAU);
    g.stroke();
    if (btn.classList.contains('lock')) {
      // padlock over a faded preview
      g.fillStyle = 'rgba(255,241,220,0.6)';
      g.beginPath();
      g.arc(46, 46, R + 2, 0, TAU);
      g.fill();
      g.fillStyle = '#3a2118';
      g.strokeStyle = '#3a2118';
      g.lineWidth = 5;
      g.fillRect(32, 44, 28, 22);
      g.beginPath();
      g.arc(46, 44, 9, Math.PI, 0);
      g.stroke();
    }
  }
}
skinsEl.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  const id = t.dataset.s,
    i = SKINS.findIndex((k) => k[0] === id),
    price = SKIN_PRICE(i),
    name = SKINS[i][1],
    wasAsk = askSkin;
  if (t.classList.contains('lock')) {
    // a locked pattern is bought with two taps, so a stray tap never spends sugar
    if (sugar < price) {
      askSkin = null;
      renderBank(`«${name}»: ${price} сахара, у тебя ${sugar}`);
    } else if (askSkin !== id) {
      askSkin = id;
      renderBank(`Ещё раз: купить «${name}» за ${price}`);
    } else {
      sugar -= price;
      saveSugar();
      M.open.push(id);
      saveM();
      askSkin = null;
      chosenSkin = id;
      Sfx.init();
      Sfx.power();
      haptic(20);
      renderMissions();
      renderBank(`Узор «${name}» твой`);
    }
    if (wasAsk !== askSkin || chosenSkin === id) renderSkins();
    const el = skinsEl.querySelector(`[data-s="${id}"]`);
    if (el) el.focus();
    return;
  }
  askSkin = null;
  chosenSkin = id;
  if (wasAsk) renderSkins();
  else for (const b of skinsEl.children) b.setAttribute('aria-checked', String(b.dataset.s === chosenSkin));
  renderSecs();
});
function renderSwatches() {
  swEl.innerHTML = PALS.map(
    (p, i) =>
      `<button type="button" role="radio" aria-checked="${i === chosen}" aria-label="${nameOf(p.name)}" title="${nameOf(p.name)}" data-i="${i}" style="background:${p.base}"></button>`,
  ).join('');
}
swEl.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  chosen = +t.dataset.i;
  renderSwatches();
  renderSkins();
  const el = swEl.querySelector(`[data-i="${chosen}"]`);
  if (el) el.focus();
});

// The sticky play block covers whatever scrolls under it. Fade that edge only while it really covers something:
// a zero-height mark sits where the block would be without sticky, so the block is stuck when it rides above the mark.
const menuCard = menuEl.querySelector('.card'),
  menuGo = menuEl.querySelector('.go'),
  menuGoMark = document.createElement('div');
menuGo.parentNode.insertBefore(menuGoMark, menuGo);
function menuFade() {
  menuGo.classList.toggle('stuck', menuGoMark.getBoundingClientRect().top > menuGo.getBoundingClientRect().top + 1);
}
menuCard.addEventListener('scroll', menuFade, { passive: true });
addEventListener('resize', menuFade);
requestAnimationFrame(menuFade);

// ---------- menu sections ----------
// Each head says what is chosen inside, so a folded menu still shows the whole setup. One section is open at a time.
const secsEl = menuEl.querySelector('.secs');
secsEl.addEventListener('click', (e) => {
  const h = e.target.closest('.sh');
  if (!h) return;
  const sec = h.parentNode,
    open = !sec.classList.contains('open');
  for (const s of secsEl.children) {
    s.classList.toggle('open', open && s === sec);
    s.firstElementChild.setAttribute('aria-expanded', String(open && s === sec));
  }
  if (open) {
    // bring the opened section into view above the Play block; sideways the sections scroll on their own
    const box = getComputedStyle(secsEl).overflowY === 'auto' ? secsEl : menuCard,
      top = box.getBoundingClientRect().top,
      bottom = box === menuCard ? menuGo.getBoundingClientRect().top : box.getBoundingClientRect().bottom,
      r = sec.getBoundingClientRect();
    if (r.bottom > bottom) box.scrollTop += Math.min(r.bottom - bottom + 8, r.top - top - 8);
  }
  menuFade();
});
const pressedText = (id) => {
  const b = $(id).querySelector('[aria-pressed=true]');
  return b ? b.textContent : '';
};
function renderSecs() {
  const pal = PALS[chosen],
    skin = SKINS.find((k) => k[0] === chosenSkin),
    hat = HATS.find((h) => h.id === chosenHat),
    look = [nameOf(pal.name), skin && skin[1], hat && hat.id !== 'none' && hat.name].filter(Boolean).join(' · ');
  $('sumLook').innerHTML = `<i style="background:${pal.base}"></i>${look}`;
  $('sumMode').textContent =
    `${{ free: 'Свободная', t3: '3 минуты', daily: 'Конфета дня' }[mode]} · ${mode === 'daily' ? 'Обычная' : pressedText('diffSeg')}`;
  const mis = $('misList').children,
    done = $('misList').querySelectorAll('.mi.ok').length;
  $('sumMis').textContent = mis.length ? `готово ${done} из ${mis.length}` : '';
  $('sumSet').textContent = `графика: ${pressedText('gfxSeg').toLowerCase()}`;
}
