// ---------- admin panel ----------
const admEl = $('adm'),
  admT = $('admT'),
  admS = $('admS'),
  admA = $('admA'),
  cheatTag = $('cheatTag');
const TOGGLES = [
  ['god', t('cheat.god')],
  ['mega', t('cheat.mega')],
  ['cd', t('cheat.cd')],
  ['peace', t('cheat.peace')],
  ['magnet', t('cheat.magnet')],
  ['heal', t('cheat.heal')],
  ['slow', t('cheat.slow')],
];
const near = (b, d) => blobs.filter((o) => o.ai && o.alive && Math.hypot(o.x - b.x, o.y - b.y) < d);
const putNear = (b, mass, dist) => {
  const o = spawnBot(mass),
    a = rand(TAU);
  o.x = clamp(b.x + Math.cos(a) * dist, 100, WORLD - 100);
  o.y = clamp(b.y + Math.sin(a) * dist, 100, WORLD - 100);
  o.vx = o.vy = 0;
  o.tx = o.x;
  o.ty = o.y;
  o.resetPoints();
  o.spawnT = 1.2;
  return o;
};
const placeAt = (o, x, y) => {
  o.x = clamp(x, 100, WORLD - 100);
  o.y = clamp(y, 100, WORLD - 100);
  o.vx = o.vy = 0;
  o.tx = o.x;
  o.ty = o.y;
  o.resetPoints();
  o.spawnT = 1.2;
};
const ACTIONS = [
  [
    t('act.0'),
    (P) => {
      P.mass += 100;
    },
  ],
  [
    t('act.1'),
    (P) => {
      P.mass += 1000;
    },
  ],
  [
    t('act.2'),
    (P) => {
      P.mass = DIFFS[diff].start;
    },
  ],
  [
    t('act.3'),
    (P) => {
      P.wounds.length = 0;
    },
  ],
  [
    t('act.4'),
    (P) => {
      for (let i = 0; i < 8; i++) putNear(P, rand(12, 28), P.Rs + rand(160, 380));
    },
  ],
  [
    t('act.5'),
    (P) => {
      putNear(P, 1400, P.Rs + 560);
    },
    'red',
  ],
  [
    t('act.6'),
    (P) => {
      for (let i = 0; i < 160; i++) {
        const a = rand(TAU),
          r = Math.sqrt(Math.random()) * 520;
        addSprinkle();
        const f = food[food.length - 1];
        f.x = clamp(P.x + Math.cos(a) * r, 30, WORLD - 30);
        f.y = clamp(P.y + Math.sin(a) * r, 30, WORLD - 30);
      }
    },
  ],
  [
    t('act.7'),
    (P) => {
      for (const o of near(P, 750)) {
        const a = Math.atan2(P.y - o.y, P.x - o.x),
          m = o.mass * 0.25;
        if (o.mass - m < MIN_MASS + 3) continue;
        o.mass -= m;
        o.hurtT = 0.5;
        o.addWound(a, massToR(m) * 0.9);
        kickPoints(o, a, 0.7, -220);
        spawnCrumbs(o.x + Math.cos(a) * o.Rs, o.y + Math.sin(a) * o.Rs, m, o.pal, Math.cos(a), Math.sin(a));
      }
    },
    'red',
  ],
  [
    t('act.8'),
    (P) => {
      for (const o of near(P, 900)) swallowWhole(P, o);
    },
    'red',
  ],
  [
    t('act.9'),
    (P) => {
      const a = rand(TAU);
      for (const o of spawnSpecial('hedgehog')) placeAt(o, P.x + Math.cos(a) * (P.Rs + 300), P.y + Math.sin(a) * (P.Rs + 300));
    },
  ],
  [
    t('act.10'),
    (P) => {
      const a = rand(TAU);
      for (const o of spawnSpecial('piranha'))
        placeAt(o, P.x + Math.cos(a) * (P.Rs + 420) + rand(-60, 60), P.y + Math.sin(a) * (P.Rs + 420) + rand(-60, 60));
    },
  ],
  [
    t('act.11'),
    (P) => {
      const a = rand(TAU);
      for (const o of spawnSpecial('cake')) placeAt(o, P.x + Math.cos(a) * (P.Rs + 640), P.y + Math.sin(a) * (P.Rs + 640));
    },
  ],
  [
    t('act.12'),
    (P) => {
      ['speed', 'shield', 'magnet'].forEach((t, i) => {
        const a = (i * TAU) / 3 + rand(1);
        pickups.push({
          type: t,
          x: clamp(P.x + Math.cos(a) * (P.Rs + 150), 60, WORLD - 60),
          y: clamp(P.y + Math.sin(a) * (P.Rs + 150), 60, WORLD - 60),
          t: 0,
        });
      });
    },
  ],
  [
    t('act.13'),
    () => {
      for (const k of SKINS) if (!M.open.includes(k[0])) M.open.push(k[0]);
      saveM();
    },
  ],
  [
    t('act.14'),
    (P) => {
      for (const o of blobs)
        if (o.ai) {
          o.alive = false;
          spawnDust(o.x, o.y, o.pal, 0, 0, 10);
        }
    },
    'red',
  ],
];
function renderAdmin() {
  admT.innerHTML = TOGGLES.map(([k, n]) => `<button type="button" aria-pressed="${!!CHEAT[k]}" data-k="${k}">${n}</button>`).join('');
  admS.innerHTML = [1, 1.5, 2, 3].map((v) => `<button type="button" aria-pressed="${CHEAT.speed === v}" data-v="${v}">×${v}</button>`).join('');
  admA.innerHTML = ACTIONS.map(([n, , c], i) => `<button type="button" data-i="${i}"${c ? ' class="red"' : ''}>${n}</button>`).join('');
  updateCheatTag();
}
function updateCheatTag() {
  const on = TOGGLES.filter(([k]) => CHEAT[k]).map(([, n]) => n.toLowerCase());
  if (CHEAT.speed !== 1) on.push(t('cheat.speed', CHEAT.speed));
  cheatTag.textContent = on.length ? t('cheat.tag', on.join(', ')) : '';
}
function openAdmin() {
  if (state !== 'play' || !player || !player.alive) return;
  renderAdmin();
  admEl.classList.remove('hidden');
  paused = true;
  setTimeout(() => $('admClose').focus({ preventScroll: true }), 30);
}
function closeAdmin() {
  admEl.classList.add('hidden');
  paused = false;
  updateCheatTag();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}
$('admClose').addEventListener('click', closeAdmin);
admT.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  CHEAT[t.dataset.k] = !CHEAT[t.dataset.k];
  saveCheats();
  t.setAttribute('aria-pressed', String(CHEAT[t.dataset.k]));
  updateCheatTag();
});
admS.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  CHEAT.speed = +t.dataset.v;
  saveCheats();
  for (const b of admS.children) b.setAttribute('aria-pressed', String(+b.dataset.v === CHEAT.speed));
  updateCheatTag();
});
admA.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t || !player || !player.alive) return;
  ACTIONS[+t.dataset.i][1](player);
  player.cheated = true;
  if (blobs.some((b) => !b.alive)) blobs = blobs.filter((b) => b.alive);
  render();
  t.animate && t.animate([{ transform: 'scale(.94)' }, { transform: 'scale(1)' }], 160);
});
updateCheatTag();
