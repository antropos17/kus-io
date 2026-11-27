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
    if (padMode) return setPad(false); // the move that hands control back does not pull the candy yet
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
  if (shopOpen()) {
    if (e.key === 'Escape') closeShop();
    return;
  }
  if (cont.on) {
    if (e.key === 'Escape') contNo();
    if (e.key === 'Escape' || e.code === 'Space') return;
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
  muteEl.setAttribute('aria-label', t(Sfx.on ? 'a.mute' : 'a.unmute'));
}
muteEl.addEventListener('click', () => {
  Sfx.init();
  toggleMute();
});
$('play').addEventListener('click', startGame);
$('again').addEventListener('click', startGame);
function renderHats() {
  renderPick('hat');
  renderPick('eyes');
  renderPick('trail');
  renderPick('tray');
  recEl.textContent = best ? t('rec', best) : '';
}
const skinsEl = $('skins'),
  bankEl = $('bank');
let ask = null, // the first of the two taps of a purchase: { slot, id }
  bankT = 0;
function renderBank(msg) {
  // the sugar balance; a message replaces it for a few seconds
  clearTimeout(bankT);
  bankEl.textContent = msg || t('bank', sugar);
  if (msg) bankT = setTimeout(() => renderBank(), 3200);
}
const boxOf = (slot) => $(slot === 'hat' ? 'hats' : slot === 'skin' ? 'skins' : slot);
const chosenOf = (slot) =>
  slot === 'hat'
    ? chosenHat
    : slot === 'skin'
      ? chosenSkin
      : slot === 'eyes'
        ? chosenEyes
        : slot === 'trail'
          ? chosenTrail
          : slot === 'tray'
            ? chosenTray
            : null;
function choose(slot, id) {
  if (slot === 'hat') chosenHat = id;
  else if (slot === 'skin') chosenSkin = id;
  else if (slot === 'eyes') chosenEyes = id;
  else if (slot === 'trail') chosenTrail = id;
  else if (slot === 'tray') setTray(id);
}
// the price tag of a closed item: its price, «Купить?» after the first tap
function priceTag(slot, id) {
  const price = priceOf(slot, id);
  return ask && ask.slot === slot && ask.id === id
    ? `<small class="pz ask">${t('shop.buy')}</small>`
    : `<small class="pz${sugar >= price ? ' can' : ''}">${price}</small>`;
}
// one row of chips for hats (and later eyes, trail, tray): every item of the wardrobe slot, closed ones with a price
function renderPick(slot) {
  const box = boxOf(slot);
  if (!box) return;
  if (!owns(slot, chosenOf(slot))) choose(slot, WARDROBE[slot][0][0]);
  box.innerHTML = WARDROBE[slot]
    .map(([id]) => {
      const lock = !owns(slot, id),
        name = itemName(slot, id),
        why = lock ? t('shop.why', priceOf(slot, id)) : '';
      return `<button type="button" role="radio" aria-checked="${id === chosenOf(slot)}" aria-label="${name}${why}" data-slot="${slot}" data-id="${id}"${lock ? ' class="lock"' : ''}>${name}${lock ? priceTag(slot, id) : ''}</button>`;
    })
    .join('');
  renderSecs();
}
const renderRow = (slot) => (slot === 'skin' ? renderSkins() : renderPick(slot));
// a pending first tap does not outlive the menu: after a run or a round trip one tap must never buy
function clearAsk() {
  const was = ask;
  ask = null;
  if (was) renderRow(was.slot);
}
// the one tap logic of the shop: an owned item is chosen, a closed one is bought with two taps so a stray tap never spends sugar
function pickClick(slot, id) {
  const was = ask,
    name = itemName(slot, id);
  let redo = false;
  if (!owns(slot, id)) {
    const price = priceOf(slot, id);
    if (sugar < price) {
      ask = null;
      renderBank(t('shop.short', name, price, sugar));
    } else if (!ask || ask.slot !== slot || ask.id !== id) {
      ask = { slot, id };
      renderBank(t('shop.ask', name, price));
    } else {
      buyItem(slot, id);
      ask = null;
      choose(slot, id);
      Sfx.init();
      Sfx.power();
      haptic(20);
      renderBank(t('shop.got', name));
    }
    redo = true;
  } else {
    ask = null;
    choose(slot, id);
    redo = !!was;
  }
  if (redo) {
    renderRow(slot);
    if (was && was.slot !== slot) renderRow(was.slot);
  } else {
    for (const b of boxOf(slot).children) b.setAttribute('aria-checked', String(b.dataset.id === chosenOf(slot)));
    renderSecs();
  }
  const el = boxOf(slot).querySelector(`[data-id="${id}"]`);
  if (el) el.focus();
}
for (const slot of ['hat', 'skin', 'eyes', 'trail', 'tray'])
  if (boxOf(slot))
    boxOf(slot).addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn && btn.dataset.id) pickClick(slot, btn.dataset.id);
    });
function renderSkins() {
  if (!SKINS.some((k) => k[0] === chosenSkin)) chosenSkin = 'plain';
  if (!skinOpen(chosenSkin)) chosenSkin = 'plain';
  skinsEl.innerHTML = SKINS.map(([id, name]) => {
    const lock = !skinOpen(id),
      why = lock ? t('shop.why', priceOf('skin', id)) : '';
    return `<button type="button" role="radio" aria-checked="${id === chosenSkin}" aria-label="${name}${why}" title="${name}${why}" data-s="${id}" data-slot="skin" data-id="${id}"${lock ? ' class="lock"' : ''}><canvas width="92" height="92"></canvas>${lock ? priceTag('skin', id) : ''}</button>`;
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
    look = [
      nameOf(pal.name),
      skin && skin[1],
      chosenHat !== 'none' && itemName('hat', chosenHat),
      chosenEyes !== 'none' && itemName('eyes', chosenEyes),
      chosenTrail !== 'none' && itemName('trail', chosenTrail),
      chosenTray !== 'choco' && itemName('tray', chosenTray),
    ]
      .filter(Boolean)
      .join(' · ');
  $('sumLook').innerHTML = `<i style="background:${pal.base}"></i>${look}`;
  $('sumMode').textContent = `${t('sum.' + mode)} · ${mode === 'daily' ? t('dif.normal') : pressedText('diffSeg')}`;
  const mis = $('misList').children,
    done = $('misList').querySelectorAll('.mi.ok').length;
  $('sumMis').textContent = mis.length ? t('sum.mis', done, mis.length) : '';
  $('sumSet').textContent = t('sum.set', pressedText('gfxSeg').toLowerCase());
}
