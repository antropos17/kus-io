// ---------- the sugar shop of the app: sugar for a rewarded ad, three a day (packs: below) ----------
// Everything goes through the bridge window.KUS_NATIVE that the app wrapper provides (tests fake it):
//   ad() → 'reward' | 'closed' | 'error'; products(ids) → [{ id, price }]; buy(id) → { status, tx }; onPurchase(cb).
// Without the bridge, and on the web and Steam, there is no shop at all.
const NATIVE = PLATFORM === 'app' && window.KUS_NATIVE ? window.KUS_NATIVE : null;
const SHOP = { adWait: 30000, priceWait: 10000, buyWait: 60000 }; // ms; past adWait an ad counts as failed
const shopEl = $('shop'),
  shopBtn = $('shopBtn'),
  adBtn = $('adBtn');
let adBusy = false,
  lateMsg = '';
shopBtn.classList.toggle('hidden', !NATIVE);
function adsSeen() {
  let a = null;
  try {
    a = JSON.parse(localStorage.getItem('kus.ads') || 'null');
  } catch (e) {}
  return a && a.d === dayKey(new Date()) ? a.n | 0 : 0; // a new local day starts from zero
}
function adsLeft() {
  return Math.max(0, AD_DAY - adsSeen());
}
const shopOpen = () => !shopEl.classList.contains('hidden');
function shopSay(key, ...args) {
  $('shopMsg').textContent = key ? t(key, ...args) : '';
}
function late(text) {
  // a result that came while the shop was closed: the menu's bank row tells it, or the menu after the run does
  if (state === 'menu' && !menuEl.classList.contains('hidden')) renderBank(text);
  else lateMsg = text;
}
function lateFlush() {
  if (lateMsg) renderBank(lateMsg);
  lateMsg = '';
}
function shopBank() {
  $('shopBank').textContent = t('bank', sugar);
}
function renderAd() {
  const left = adsLeft();
  adBtn.disabled = adBusy || !left;
  adBtn.textContent = adBusy ? t('ad.wait') : left ? t('ad.btn', AD_SUGAR, left, AD_DAY) : t('ad.none');
}
function openShop() {
  if (!NATIVE) return;
  shopSay('');
  shopBank();
  renderAd();
  loadPrices();
  shopEl.classList.remove('hidden');
  setTimeout(() => (adBtn.disabled ? $('shopX') : adBtn).focus({ preventScroll: true }), 30);
}
function closeShop() {
  shopEl.classList.add('hidden');
  renderBank();
  renderSkins();
  renderHats();
  shopBtn.focus({ preventScroll: true });
}
function sfxHold(on) {
  // the game is silent while an ad plays
  const ac = Sfx.ac;
  if (!ac) return;
  if (on) ac.suspend().catch(() => {});
  else if (Sfx.on) ac.resume().catch(() => {});
}
async function adWatch() {
  if (!NATIVE || adBusy || !adsLeft()) return;
  adBusy = true;
  shopSay('');
  renderAd();
  sfxHold(true);
  let r = 'error';
  try {
    r = await Promise.race([NATIVE.ad(), new Promise((ok) => setTimeout(() => ok('timeout'), SHOP.adWait))]);
  } catch (e) {} // a rejected ad is a failed one
  sfxHold(false);
  adBusy = false;
  let key = 'ad.err';
  if (r === 'reward') {
    sugar += AD_SUGAR;
    saveSugar();
    try {
      localStorage.setItem('kus.ads', JSON.stringify({ d: dayKey(new Date()), n: adsSeen() + 1 }));
    } catch (e) {}
    Sfx.power();
    key = 'ad.got';
  } else if (r === 'closed') key = 'ad.closed';
  renderAd();
  if (shopOpen()) {
    shopSay(key, AD_SUGAR);
    shopBank();
  } else late(t(key, AD_SUGAR));
}
shopBtn.addEventListener('click', openShop);
$('shopX').addEventListener('click', closeShop);
adBtn.addEventListener('click', adWatch);

// ---------- sugar packs: the store names the price, one credit per transaction ----------
let packBusy = false;
const packFmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); // 15 000
function credit(id, tx) {
  // true when it paid; a transaction already paid (from buy or onPurchase, before or after a restart) pays nothing
  const p = PACKS.find((q) => q.id === id);
  if (!p) return false;
  let seen = [];
  try {
    seen = JSON.parse(localStorage.getItem('kus.tx') || '[]') || [];
  } catch (e) {}
  if (tx && seen.includes(tx)) return false;
  sugar += p.sugar;
  saveSugar();
  if (tx) {
    seen.push(tx);
    try {
      localStorage.setItem('kus.tx', JSON.stringify(seen.slice(-50)));
    } catch (e) {}
  }
  Sfx.power();
  return true;
}
function packLock(id) {
  for (const b of $('packs').querySelectorAll('[data-id]')) {
    b.disabled = !!id;
    b.classList.toggle('busy', b.dataset.id === id);
    const s = b.querySelector('span');
    s.textContent = b.dataset.id === id ? t('pack.busy') : b.dataset.price;
  }
}
async function loadPrices() {
  if (!NATIVE) return;
  const box = $('packs');
  box.innerHTML = `<p class="best">${t('pack.load')}</p>`;
  let list = null;
  try {
    list = await Promise.race([NATIVE.products(PACKS.map((p) => p.id)), new Promise((ok) => setTimeout(() => ok(null), SHOP.priceWait))]);
  } catch (e) {}
  const got = Array.isArray(list) ? PACKS.filter((p) => list.some((q) => q && q.id === p.id)) : [];
  if (!got.length) {
    box.innerHTML = `<button id="packRetry" class="btn2" type="button">${t('pack.retry')}</button>`;
    shopSay('pack.off');
    return;
  }
  box.innerHTML = got
    .map((p) => {
      const price = String(list.find((q) => q.id === p.id).price || '');
      return `<button type="button" data-id="${p.id}" data-price="${esc(price)}" aria-label="${esc(t('pack.a', packFmt(p.sugar), price))}"><b>${packFmt(p.sugar)}</b><span>${esc(price)}</span></button>`;
    })
    .join('');
  if ($('shopMsg').textContent === t('pack.off')) shopSay('');
  if (packBusy) packLock('-');
}
function packSay(key, n) {
  if (shopOpen()) {
    shopSay(key, n);
    shopBank();
  } else if (key) late(t(key, n));
}
async function buyPack(id) {
  if (!NATIVE || packBusy) return;
  const p = PACKS.find((q) => q.id === id);
  if (!p) return;
  packBusy = true;
  packLock(id);
  shopSay('');
  const slow = setTimeout(() => {
    packBusy = false; // the store may still answer: the sugar comes then, or later through onPurchase
    packLock(null);
    shopSay('pack.slow');
  }, SHOP.buyWait);
  let r = null;
  try {
    r = await NATIVE.buy(id);
  } catch (e) {}
  clearTimeout(slow);
  packBusy = false;
  packLock(null);
  const st = r && r.status;
  if (st === 'ok') packSay(credit(id, r.tx) ? 'pack.got' : '', p.sugar);
  else if (st === 'cancel') shopSay('');
  else packSay(st === 'pending' ? 'pack.wait' : 'pack.err');
}
$('packs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.id === 'packRetry') loadPrices();
  else buyPack(b.dataset.id);
});
if (NATIVE && NATIVE.onPurchase)
  NATIVE.onPurchase((q) => {
    // a purchase that went through later: after 'pending', or after the app was killed in the middle of one
    if (!q || !credit(q.id, q.tx)) return;
    const n = PACKS.find((p) => p.id === q.id).sugar;
    if (shopOpen()) packSay('pack.got', n);
    else late(t('pack.late', n));
  });
