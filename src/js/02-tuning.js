// ---------- tuning ----------
const WORLD = 4000,
  FOOD_TARGET = 1300,
  BOT_TARGET = 24,
  START_MASS = 40,
  MIN_MASS = 6;
const DASH_CD = 1.8,
  MOUTH_W = 0.7;
const massToR = (m) => 5.6 * Math.sqrt(m);
// bite grows with size, but slower for giants: big fights tear chunks instead of swallowing whole
const biteOf = (m, dash) => (m <= 200 ? m * 0.15 : 30 + (m - 200) * 0.07) * (dash ? 1.6 : 1) + 1.5;
const lethalFor = (victim, bite) => victim <= bite * 1.15 || victim - bite < MIN_MASS + 3;

const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
const FLAVORS = [
  ['Клубника', 345, 90, 66],
  ['Лайм', 95, 64, 55],
  ['Апельсин', 27, 95, 60],
  ['Черника', 226, 88, 68],
  ['Виноград', 274, 76, 69],
  ['Мята', 165, 70, 50],
  ['Лимон', 49, 96, 58],
  ['Бабл-гам', 318, 86, 72],
  ['Голубика', 198, 90, 60],
  ['Вишня', 2, 82, 60],
];
const makePal = (name, h, s, l) => ({
  name,
  h,
  s,
  l,
  base: hsl(h, s, l),
  light: hsl(h, s, Math.min(90, l + 15)),
  dark: hsl(h, s, Math.max(20, l - 20)),
  rim: hsl(h, Math.min(100, s + 5), Math.max(13, l - 38)),
  glow: hsl(h, Math.min(100, s + 5), Math.min(94, l + 24), 0.5),
  glow0: hsl(h, s, Math.min(94, l + 24), 0),
  lip: hsl(h, Math.min(100, s + 8), Math.max(18, l - 26)),
  fl: [h, Math.round(s * 0.55), Math.min(93, l + 22)],
  po: [h, Math.round(s * 0.6), Math.max(26, l - 14)],
});
const PALS = FLAVORS.map((f) => makePal(f[0], f[1], f[2], f[3]));
const PAL_HEDGE = makePal('Ёж', 28, 44, 46),
  PAL_PIR = makePal('Пиранья', 206, 32, 62),
  PAL_CAKE = makePal('Торт', 36, 86, 82);
const PICK = { speed: [t('pick.speed'), 6, '#ffd23f'], shield: [t('pick.shield'), 5, '#7ad7ff'], magnet: [t('pick.magnet'), 8, '#ff7aa2'] }; // bonus sweets: name, seconds, colour
const flesh = (p, a) => hsl(p.fl[0], p.fl[1], p.fl[2], a);
const pore = (p, a) => hsl(p.po[0], p.po[1], p.po[2], a);
const SKINS = [
  ['plain', t('skin.plain')],
  ['stripes', t('skin.stripes')],
  ['dots', t('skin.dots')],
  ['swirl', t('skin.swirl')],
  ['waffle', t('skin.waffle')],
  ['hearts', t('skin.hearts')],
  ['stars', t('skin.stars')],
  ['tiger', t('skin.tiger')],
  ['cow', t('skin.cow')],
  ['glaze', t('skin.glaze')],
  ['rainbow', t('skin.rainbow')],
  ['bubbles', t('skin.bubbles')],
  ['zigzag', t('skin.zigzag')],
  ['galaxy', t('skin.galaxy')],
  ['checks', t('skin.checks')],
  ['marble', t('skin.marble')],
  ['leopard', t('skin.leopard')],
  ['mosaic', t('skin.mosaic')],
  ['foil', t('skin.foil')],
  ['aurora', t('skin.aurora')],
];
const AD_SUGAR = 300, // sugar for one rewarded ad in the app's shop, a first guess like MIS_SUGAR
  AD_DAY = 3; // rewarded ads a day, by the local date
const MIS_SUGAR = 300; // a mission's payout in the first circle; each later circle adds 60% of it
const MIS_CAP = { time: 150, combo: 8, mass: 1600 }; // targets that must stay reachable in one run
const MIS_IDLE = 5; // runs in a row without headway after which a mission makes way
const misReward = (m) => Math.round(MIS_SUGAR * (1 + 0.6 * (m.c | 0)));
const SUGAR = { bites: 1, food: 0.2, kills: 6, wound: 1, tongue: 2, pickup: 2, piranha: 2, hedge: 3, cake: 3 }; // sugar per action in a clean run
// the runaway wrapper after a ×min streak: seconds to catch it, sugar and odds per tier (plain, rare, jackpot), the chance it grows a tier in the reveal,
// its speed as a multiple of the player's top speed at birth (v0) and after tire seconds (v1)
// Melt of a big candy: the bots' rate grows with mass, the player's is linear and the player's cap is higher.
const LATE = { from: 1500, span: 6000, maxShare: 0.45, lo: 0.08, hi: 0.25 };
const MELT = { from: 300, k: 0.004, kPlayer: 0.004, soft: 3000, cap: 3500, capPlayer: 20000 };
function meltRate(b) {
  if (b.kind === 'cake' || b.mass <= MELT.from) return 0;
  if (b.isPlayer) return (b.mass - MELT.from) * MELT.kPlayer * (1 + b.mass / MELT.soft);
  return (b.mass - MELT.from) * MELT.k * (1 + b.mass / 1000);
}
const WRAP = { min: 5, life: 5, amt: [60, 135, 360], odds: [0.55, 0.33, 0.12], up: 0.45, v0: 1.1, v1: 0.4, tire: 1.2 };
const skinArt = {};
function skinTile(id) {
  // each skin is one small see-through tile, painted once and laid over any flavour
  if (skinArt[id]) return skinArt[id];
  const S = 256,
    h = S / 2,
    c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'),
    lite = 'rgba(255,255,255,0.36)',
    dark = 'rgba(45,12,24,0.34)';
  let span = 0.8; // how many body radii one tile covers; 3.2 = a single picture centred on the body
  g.lineJoin = 'round';
  if (id === 'stripes') {
    g.strokeStyle = lite;
    g.lineWidth = S * 0.17;
    for (let k = 0; k <= 4; k++) {
      g.beginPath();
      g.moveTo(k * h + 30, -30);
      g.lineTo(-30, k * h + 30);
      g.stroke();
    }
    span = 0.85;
  } else if (id === 'dots') {
    g.fillStyle = lite;
    for (const [x, y] of [
      [0.25, 0.25],
      [0.75, 0.75],
    ]) {
      g.beginPath();
      g.arc(x * S, y * S, S * 0.13, 0, TAU);
      g.fill();
    }
    span = 0.7;
  } else if (id === 'waffle') {
    g.strokeStyle = dark;
    g.lineWidth = S * 0.1;
    g.beginPath();
    g.moveTo(h, 0);
    g.lineTo(h, S);
    g.moveTo(0, h);
    g.lineTo(S, h);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.2)';
    g.lineWidth = S * 0.03;
    g.beginPath();
    g.moveTo(h + S * 0.075, 0);
    g.lineTo(h + S * 0.075, S);
    g.moveTo(0, h + S * 0.075);
    g.lineTo(S, h + S * 0.075);
    g.stroke();
    span = 0.5;
  } else if (id === 'hearts') {
    g.fillStyle = lite;
    for (const [x, y] of [
      [0.25 * S, 0.27 * S],
      [0.75 * S, 0.77 * S],
    ]) {
      const q = S * 0.14;
      g.beginPath();
      g.moveTo(x, y + q * 0.9);
      g.bezierCurveTo(x - q * 1.3, y - q * 0.1, x - q * 0.6, y - q, x, y - q * 0.35);
      g.bezierCurveTo(x + q * 0.6, y - q, x + q * 1.3, y - q * 0.1, x, y + q * 0.9);
      g.fill();
    }
    span = 0.9;
  } else if (id === 'stars') {
    g.fillStyle = lite;
    for (const [x, y] of [
      [0.25 * S, 0.25 * S],
      [0.75 * S, 0.75 * S],
    ]) {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5,
          r = S * (i % 2 ? 0.07 : 0.16);
        i ? g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    }
    span = 0.9;
  } else if (id === 'swirl') {
    g.fillStyle = lite;
    span = 3.2;
    for (let a = 0; a < 6; a++) {
      const a0 = (a * TAU) / 6;
      g.beginPath();
      g.moveTo(h, h);
      for (let r = 0; r <= h * 1.3; r += 6) g.lineTo(h + Math.cos(a0 + r * 0.022) * r, h + Math.sin(a0 + r * 0.022) * r);
      for (let r = h * 1.3; r >= 0; r -= 6) g.lineTo(h + Math.cos(a0 + r * 0.022 + TAU / 12) * r, h + Math.sin(a0 + r * 0.022 + TAU / 12) * r);
      g.closePath();
      g.fill();
    }
  } else if (id === 'tiger') {
    g.fillStyle = 'rgba(45,12,24,0.42)';
    span = 3.2;
    for (let i = -4; i <= 4; i++)
      for (const sd of [-1, 1]) {
        const y = h + i * 22 + (sd > 0 ? 11 : 0),
          x0 = h + sd * 120,
          x1 = h + sd * (16 + (Math.abs(i) % 2) * 16);
        g.beginPath();
        g.moveTo(x0, y - 8);
        g.quadraticCurveTo(h + sd * 60, y - 4 + i, x1, y + 4);
        g.quadraticCurveTo(h + sd * 60, y + 8, x0, y + 9);
        g.closePath();
        g.fill();
      }
  } else if (id === 'cow') {
    g.fillStyle = dark;
    span = 3.2;
    for (const [x, y, rx, ry, a] of [
      [-40, -32, 28, 20, 0.5],
      [32, -46, 22, 16, -0.4],
      [48, 18, 26, 19, 0.9],
      [-22, 42, 24, 17, -0.2],
      [-62, 10, 15, 11, 0.3],
      [6, -4, 13, 10, 0],
      [16, 60, 14, 10, 0.6],
      [70, -22, 12, 9, 0.2],
    ]) {
      g.beginPath();
      g.ellipse(h + x, h + y, rx, ry, a, 0, TAU);
      g.fill();
    }
  } else if (id === 'rainbow') {
    g.lineWidth = S * 0.09;
    span = 0.9;
    const cols = ['rgba(255,80,110,.5)', 'rgba(255,190,60,.5)', 'rgba(120,220,90,.5)', 'rgba(90,180,255,.5)'];
    for (let k = 0; k < 8; k++) {
      g.strokeStyle = cols[k % 4];
      g.beginPath();
      g.moveTo(k * h * 0.5 + 30, -30);
      g.lineTo(-30, k * h * 0.5 + 30);
      g.stroke();
    }
  } else if (id === 'bubbles') {
    g.strokeStyle = lite;
    g.lineWidth = S * 0.035;
    span = 0.9;
    for (const [x, y, r] of [
      [0.25, 0.25, 0.15],
      [0.75, 0.75, 0.15],
      [0.75, 0.22, 0.07],
      [0.22, 0.75, 0.07],
    ]) {
      g.beginPath();
      g.arc(x * S, y * S, r * S, 0, TAU);
      g.stroke();
    }
  } else if (id === 'zigzag') {
    g.strokeStyle = lite;
    g.lineWidth = S * 0.08;
    span = 0.7;
    for (const y0 of [0.25, 0.75]) {
      g.beginPath();
      for (let i = -1; i <= 5; i++) {
        const x = i * S * 0.25,
          y = y0 * S + (i % 2 ? -1 : 1) * S * 0.09;
        i === -1 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
  } else if (id === 'galaxy') {
    span = 3.2;
    const gg = g.createRadialGradient(h, h, 10, h, h, 120);
    gg.addColorStop(0, 'rgba(30,10,70,0.15)');
    gg.addColorStop(1, 'rgba(20,5,50,0.62)');
    g.fillStyle = gg;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 46; i++) {
      const a = hash1(i * 2.3) * TAU,
        r = hash1(i * 5.1) * 100,
        q = 1 + hash1(i * 9.7) * 2.6;
      g.fillStyle = i % 5 ? 'rgba(255,255,255,0.85)' : 'rgba(255,220,120,0.95)';
      g.beginPath();
      g.arc(h + Math.cos(a) * r, h + Math.sin(a) * r, q, 0, TAU);
      g.fill();
    }
  } else if (id === 'glaze') {
    // icing poured over the back of the head, with sprinkles
    span = 3.2;
    const edge = (y) => h - 6 + 13 * Math.sin(y * 0.085) + 9 * Math.sin(y * 0.21 + 1);
    g.fillStyle = 'rgba(255,250,240,0.8)';
    g.beginPath();
    g.moveTo(0, 0);
    for (let y = 0; y <= S; y += 4) g.lineTo(edge(y), y);
    g.lineTo(0, S);
    g.closePath();
    g.fill();
    g.lineCap = 'round';
    g.lineWidth = 5;
    for (let i = 0; i < 26; i++) {
      const a = hash1(i * 3.1) * TAU,
        r = 12 + hash1(i * 7.7) * 74,
        x = h + Math.cos(a) * r,
        y = h + Math.sin(a) * r,
        t = hash1(i * 1.9) * TAU;
      if (x > edge(y) - 12) continue;
      g.strokeStyle = SPRINKLES_C[i % SPRINKLES_C.length];
      g.beginPath();
      g.moveTo(x - Math.cos(t) * 5, y - Math.sin(t) * 5);
      g.lineTo(x + Math.cos(t) * 5, y + Math.sin(t) * 5);
      g.stroke();
    }
  } else if (id === 'checks') {
    // gingham: see-through bands across and down, lighter where they cross
    g.fillStyle = 'rgba(255,255,255,0.27)';
    g.fillRect(0, 0, h, S);
    g.fillRect(0, 0, S, h);
    span = 0.7;
  } else if (id === 'marble') {
    // soft pale veins, each with a fine thread down the middle
    span = 3.2;
    g.lineCap = 'round';
    for (let v = 0; v < 6; v++) {
      const y0 = 50 + v * 31 + hash1(v * 3.3) * 14,
        a = hash1(v * 7.1) * 0.9 - 0.45;
      g.beginPath();
      for (let x = -12; x <= S + 12; x += 8) {
        const y = y0 + (x - h) * a + 13 * Math.sin(x * 0.045 + v * 1.7) + 5 * Math.sin(x * 0.14 + v);
        x < 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.strokeStyle = 'rgba(255,255,255,0.26)';
      g.lineWidth = 6 + hash1(v * 5.9) * 9;
      g.stroke();
      g.strokeStyle = v % 2 ? 'rgba(45,12,24,0.32)' : 'rgba(255,255,255,0.55)';
      g.lineWidth = 1.6;
      g.stroke();
    }
  } else if (id === 'leopard') {
    // rosettes: broken dark rings round a warm centre, a few loose spots between
    span = 1;
    g.lineCap = 'round';
    const ros = [
      [0.22, 0.24, 30],
      [0.72, 0.16, 26],
      [0.5, 0.58, 32],
      [0.14, 0.8, 27],
      [0.86, 0.74, 28],
    ];
    for (let ox = -S; ox <= S; ox += S)
      for (let oy = -S; oy <= S; oy += S)
        for (let i = 0; i < ros.length; i++) {
          const x = ros[i][0] * S + ox,
            y = ros[i][1] * S + oy,
            r = ros[i][2];
          if (x < -r * 2 || x > S + r * 2 || y < -r * 2 || y > S + r * 2) continue;
          g.fillStyle = 'rgba(255,190,90,0.26)';
          g.beginPath();
          g.ellipse(x, y, r * 0.8, r * 0.7, i, 0, TAU);
          g.fill();
          g.strokeStyle = 'rgba(45,12,24,0.5)';
          g.lineWidth = 9;
          for (let k = 0; k < 4; k++) {
            const a0 = k * 1.5708 + hash1(i * 3 + k) * 0.7;
            g.beginPath();
            g.ellipse(x, y, r, r * 0.86, i, a0, a0 + 0.85 + hash1(i + k * 5) * 0.4);
            g.stroke();
          }
          g.fillStyle = 'rgba(45,12,24,0.5)';
          g.beginPath();
          g.arc(x + r * 1.45, y - r * 0.9, 5, 0, TAU);
          g.fill();
        }
  } else if (id === 'mosaic') {
    // little tiles in four shades set in dark grout
    span = 1;
    const n = 4,
      q = S / n,
      cols = [lite, 'rgba(255,214,110,0.34)', 'rgba(120,200,255,0.32)', 'rgba(255,120,170,0.3)', 'rgba(255,255,255,0.12)'];
    g.fillStyle = 'rgba(45,12,24,0.36)';
    g.fillRect(0, 0, S, S);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = i * q,
          y = j * q,
          d = (k) => 6 + hash1(i * 7.1 + j * 3.7 + k) * 6;
        g.beginPath();
        g.moveTo(x + d(1), y + d(2));
        g.lineTo(x + q - d(3), y + d(4));
        g.lineTo(x + q - d(5), y + q - d(6));
        g.lineTo(x + d(7), y + q - d(8));
        g.closePath();
        g.globalCompositeOperation = 'destination-out';
        g.fillStyle = '#000';
        g.fill();
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = cols[(i * 3 + j * 2 + ((hash1(i + j * 9) * 3) | 0)) % cols.length];
        g.fill();
      }
  } else if (id === 'foil') {
    // crumpled gold foil: a gold wash broken into facets that catch the light
    span = 3.2;
    const n = 8,
      q = S / n,
      jit = (i, j, s) => (i % n && j % n ? (hash1(i * 7.3 + j * 1.9 + s) - 0.5) * q * 0.7 : 0),
      px = (i, j) => i * q + jit(i, j, 0),
      py = (i, j) => j * q + jit(i, j, 11);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++)
        for (let t2 = 0; t2 < 2; t2++) {
          const s = hash1(i * 1.3 + j * 7.7 + t2 * 4.1),
            r = Math.round(196 + 59 * s),
            gr = Math.round(128 + 112 * s),
            bl = Math.round(16 + 130 * s * s);
          g.fillStyle = `rgba(${r},${gr},${bl},0.88)`; // strong enough to read as gold over any flavour
          g.beginPath();
          g.moveTo(px(i, j), py(i, j));
          if (t2) {
            g.lineTo(px(i + 1, j), py(i + 1, j));
            g.lineTo(px(i + 1, j + 1), py(i + 1, j + 1));
          } else {
            g.lineTo(px(i + 1, j + 1), py(i + 1, j + 1));
            g.lineTo(px(i, j + 1), py(i, j + 1));
          }
          g.closePath();
          g.fill();
        }
    g.strokeStyle = 'rgba(255,255,240,0.3)';
    g.lineWidth = 26;
    g.beginPath();
    g.moveTo(60, 230);
    g.lineTo(220, 40);
    g.stroke();
  } else if (id === 'aurora') {
    // northern lights: curtains of green, teal and violet hanging over a night wash
    span = 3.2;
    g.fillStyle = 'rgba(16,24,70,0.32)';
    g.fillRect(0, 0, S, S);
    const cols = ['90,255,170', '80,215,255', '200,120,255'];
    for (let k = 0; k < 3; k++)
      for (let x = 0; x < S; x += 2) {
        const yc = 105 + k * 34 + 18 * Math.sin(x * 0.028 + k * 2.1) + 7 * Math.sin(x * 0.09 + k),
          L = 44 + 22 * Math.sin(x * 0.05 + k * 1.3) + 12 * hash1(x * 0.37 + k),
          gr = g.createLinearGradient(0, yc - L, 0, yc + 6);
        gr.addColorStop(0, `rgba(${cols[k]},0)`);
        gr.addColorStop(0.85, `rgba(${cols[k]},0.55)`);
        gr.addColorStop(1, `rgba(${cols[k]},0)`);
        g.fillStyle = gr;
        g.fillRect(x, yc - L, 2, L + 6);
      }
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 14; i++) {
      g.beginPath();
      g.arc(50 + hash1(i * 2.7) * 156, 52 + hash1(i * 6.1) * 44, 1 + hash1(i * 4.3) * 1.4, 0, TAU);
      g.fill();
    }
  }
  let pat = null;
  try {
    pat = ctx.createPattern(c, 'repeat');
    if (!pat || !pat.setTransform || typeof DOMMatrix === 'undefined') pat = null;
  } catch (e) {
    pat = null;
  }
  return (skinArt[id] = { c, pat, span });
}
function drawSkin(b) {
  // the pattern rides on the body: centred on it, scaled with it, turning with the face
  const a = skinTile(b.skin);
  if (!a.pat) return;
  const k = (a.span * b.Rs) / 256,
    cs = Math.cos(b.fa) * k,
    sn = Math.sin(b.fa) * k;
  try {
    a.pat.setTransform(new DOMMatrix([cs, sn, -sn, cs, b.x - (cs - sn) * 128, b.y - (sn + cs) * 128]));
  } catch (e) {
    a.pat = null;
    return;
  }
  ctx.fillStyle = a.pat;
  ctx.fill(b.path);
}
const SPRINKLES_C = ['#ff5d8f', '#ffd23f', '#3fb8ff', '#6fd13c', '#b57bff', '#ff8a2a'];
const SPRINKLES = ['#ff5d8f', '#ffd23f', '#7ad7ff', '#9be15d', '#c49bff', '#fff6e8', '#ff9a3d', '#4fe3c1'];
// name, accusative, then a fixed look so the album sticker is recognised on the field: flavour (index in FLAVORS), pattern, hat
const BOT_NAMES = [
  ['Зефирка', 'Зефирку', 7, 'plain', 'bow'],
  ['Суфле', 'Суфле', 6, 'bubbles', 'none'],
  ['Мармеладка', 'Мармеладку', 1, 'dots', 'none'],
  ['Жвачка', 'Жвачку', 7, 'hearts', 'none'],
  ['Пастила', 'Пастилу', 0, 'stripes', 'none'],
  ['Желешка', 'Желешку', 5, 'zigzag', 'none'],
  ['Тянучка', 'Тянучку', 2, 'swirl', 'none'],
  ['Ириска', 'Ириску', 0, 'zigzag', 'none'],
  ['Безе', 'Безе', 8, 'swirl', 'none'],
  ['Пахлава', 'Пахлаву', 6, 'waffle', 'none'],
  ['Шекербура', 'Шекербуру', 2, 'zigzag', 'none'],
  ['Мочи', 'Мочи', 5, 'plain', 'none'],
  ['Пудинг', 'Пудинга', 9, 'plain', 'chef'],
  ['Пончик', 'Пончика', 0, 'glaze', 'none'],
  ['Халва', 'Халву', 6, 'cow', 'none'],
  ['Карамелька', 'Карамельку', 5, 'stars', 'none'],
  ['Нуга', 'Нугу', 4, 'waffle', 'none'],
  ['Чак-чак', 'Чак-чака', 2, 'dots', 'crown'],
  ['Лукум', 'Лукума', 7, 'glaze', 'none'],
  ['Бадамбура', 'Бадамбуру', 9, 'stars', 'none'],
  ['Мусс', 'Мусса', 4, 'galaxy', 'none'],
  ['Щербет', 'Щербета', 3, 'stripes', 'none'],
  ['Кисель', 'Киселя', 4, 'bubbles', 'none'],
  ['Ватрушка', 'Ватрушку', 6, 'stars', 'none'],
  ['Чавкин', 'Чавкина', 9, 'tiger', 'horns'],
  ['Нямка', 'Нямку', 3, 'hearts', 'none'],
  ['Хрумка', 'Хрумку', 1, 'tiger', 'none'],
  ['Бабл-гам', 'Бабл-гама', 8, 'rainbow', 'none'],
  ['Гогал', 'Гогала', 1, 'plain', 'chef'],
  ['Медовик', 'Медовика', 2, 'stripes', 'none'],
];
