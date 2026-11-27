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
