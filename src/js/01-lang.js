// ---------- language ----------
// The game speaks Russian or English. The saved choice (kus.lang) wins over the phone's language; ru, be and kk phones get Russian.
// Switching reloads the page, so everything is drawn once in one language and nothing needs re-rendering.
const LANG = (() => {
  try {
    const s = localStorage.getItem('kus.lang');
    if (s === 'ru' || s === 'en') return s;
  } catch (e) {}
  const nav = (navigator.languages && navigator.languages[0]) || navigator.language || '';
  return ['ru', 'be', 'kk'].includes(nav.split('-')[0].toLowerCase()) ? 'ru' : 'en';
})();
// key → [Russian, English]; a value is a string or a function of the arguments t() gets (templates, numbers)
const STR = {
  title: ['КУСЬ.io — мягкие конфеты кусают друг друга', 'KUS.io — soft candies bite each other'],
  'set.lang': ['Язык', 'Language'],
};
function t(key, ...args) {
  const e = STR[key];
  if (!e) {
    console.warn('no string', key);
    return key;
  }
  const v = e[LANG === 'en' ? 1 : 0];
  return typeof v === 'function' ? v(...args) : v;
}
// candy names are save keys (album, tools, tests) and stay Russian; the screen shows them through nameOf
const EN_NAMES = {};
const nameOf = (name) => (LANG === 'en' ? EN_NAMES[name] || name : name);
const accOf = (b) => (LANG === 'en' ? nameOf(b.name) : b.acc); // the object form: Russian declines, English does not
function applyLang(root = document) {
  // markup: data-t → text, data-th → html, data-ta → aria-label (and title when the element has one)
  for (const e of root.querySelectorAll('[data-t]')) e.textContent = t(e.dataset.t);
  for (const e of root.querySelectorAll('[data-th]')) e.innerHTML = t(e.dataset.th);
  for (const e of root.querySelectorAll('[data-ta]')) {
    const v = t(e.dataset.ta);
    e.setAttribute('aria-label', v);
    if (e.hasAttribute('title')) e.title = v;
  }
}
document.documentElement.lang = LANG;
document.title = t('title');
applyLang();
