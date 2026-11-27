// The wardrobe: what can be bought with sugar, what it costs, what the player owns.
// Top-level code here must not touch `sugar`, `M` or `chosenSkin` (later files): only functions do.
// sugar packs of the app; the price is the store's, never written here; the sizes are a first guess
const PACKS = [
  { id: 'sugar_s', sugar: 5000 },
  { id: 'sugar_m', sugar: 15000 },
  { id: 'sugar_l', sugar: 40000 },
];
const PRICE_K = 1; // one multiplier over every price, tuned against the measured income
// per slot: [id, base price] in the order shown; price 0 is free
const WARDROBE = {
  hat: [['none', 0], ['bow', 2000], ['cap', 3000], ['chef', 5000], ['pompom', 6000], ['wreath', 8000], ['horns', 10000], ['tophat', 12000], ['witch', 15000], ['pirate', 17000], ['crown', 20000], ['halo', 30000]], // prettier-ignore
  skin: [['plain', 0], ['stripes', 0], ['dots', 0], ['swirl', 0], ['waffle', 2000], ['hearts', 2500], ['stars', 3000], ['zigzag', 3500], ['bubbles', 4000], ['checks', 4000], ['cow', 5000], ['tiger', 6000], ['glaze', 7000], ['marble', 7000], ['leopard', 7000], ['mosaic', 8000], ['rainbow', 9000], ['foil', 10000], ['aurora', 12000], ['galaxy', 14000]], // prettier-ignore
  eyes: [['none', 0], ['sleepy', 4000], ['lashes', 6000], ['glasses', 8000], ['stars', 10000], ['cat', 12000]], // prettier-ignore
  trail: [['none', 0], ['crumbs', 3000], ['hearts', 6000], ['stars', 8000], ['bubbles', 8000], ['rainbow', 12000]], // prettier-ignore
  tray: [['choco', 0], ['berry', 8000], ['mint', 8000], ['gold', 16000]], // prettier-ignore
};
const OLD_HAT_NEED = { bow: 80, crown: 250, chef: 500, horns: 900 }; // the record that opened each hat before the shop: only for the move of old saves
let own = { hat: [], skin: [], eyes: [], trail: [], tray: [] }; // paid items only

const wardrobeItem = (slot, id) => (WARDROBE[slot] || []).find((e) => e[0] === id);
const priceOf = (slot, id) => {
  const e = wardrobeItem(slot, id);
  return !e || !e[1] ? 0 : Math.max(500, Math.round((e[1] * PRICE_K) / 500) * 500);
};
const owns = (slot, id) => {
  const e = wardrobeItem(slot, id);
  if (!e) return false;
  // M.open is the old store of mission prizes: until missions pay sugar they still show up as owned
  return !e[1] || own[slot].includes(id) || (slot === 'skin' && M.open.includes(id));
};
function saveOwn() {
  try {
    localStorage.setItem('kus.own', JSON.stringify({ v: 1, ...own }));
  } catch (e) {}
}
function buyItem(slot, id) {
  const price = priceOf(slot, id);
  if (!price || owns(slot, id) || sugar < price) return false;
  sugar -= price;
  own[slot].push(id);
  saveOwn();
  saveSugar();
  return true;
}
function loadOwn(bestStored) {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem('kus.own'));
  } catch (e) {}
  const ok = !!raw && typeof raw === 'object' && raw.v === 1;
  const add = (slot, id) => {
    const e = wardrobeItem(slot, id);
    if (e && e[1] && !own[slot].includes(id)) own[slot].push(id);
  };
  own = { hat: [], skin: [], eyes: [], trail: [], tray: [] };
  for (const slot in own) if (ok && Array.isArray(raw[slot])) raw[slot].forEach((id) => typeof id === 'string' && add(slot, id));
  if (!ok) for (const id in OLD_HAT_NEED) if (OLD_HAT_NEED[id] <= bestStored) add('hat', id);
  M.open.forEach((id) => add('skin', id));
  if (SKINS.some((k) => k[0] === chosenSkin)) add('skin', chosenSkin); // a skin picked before missions existed stays yours
  saveOwn();
}
const itemName = (slot, id) => t(slot + '.' + id);
function cheapestUnowned() {
  let best = null;
  for (const slot in WARDROBE)
    for (const [id] of WARDROBE[slot]) {
      const price = priceOf(slot, id);
      if (price && !owns(slot, id) && (!best || price < best.price)) best = { slot, id, price };
    }
  return best;
}
