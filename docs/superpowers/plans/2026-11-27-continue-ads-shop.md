# «Продолжить», реклама за сахар и магазин пакетов — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build three things under `PLATFORM`:
- in `'app'` and `'steam'`, a free «Продолжить» once per free run;
- in `'app'`, a sugar shop in the menu with sugar for a rewarded ad (3 a day) and sugar packs;
- everything goes through a bridge `window.KUS_NATIVE`, faked by the tests.

The web does not change.

**Architecture:**
- **«Продолжить»** is a new file `10-continue.js`: a mass journal, the window `#cont` with a real-time timer, and the choices yes and no. `die()` and `update()` in `10-flow.js` hand it the death instead of `finishRun()`.
- **The shop** is a new file `15-shop.js`: the bridge, the shop window `#shop`, the ads and the packs. Its button sits in the menu's bank row.
- **The gamepad** gets both windows through `PAD_ROOTS`, `PAD_HOME` and `padBack`.

**Tech Stack:** vanilla JS concatenated by `tools/build.mjs`, Canvas 2D, Playwright tests in `tests/run.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-27-continue-ads-shop-design.md`

**Branch:** `continue-shop`, cut from `gamepad`. PR #8 is not merged yet. This work needs the gamepad code (`PAD_ROOTS`), so the PR of this branch goes in after #8.

## Global Constraints

- Edit only `src/`, then `npm run build`. Commit the built `index.html` together with `src/`.
- No syntax or CSS newer than iOS 15 Safari. No external scripts. The page stays one file.
- **Text:** every visible text goes through `t('key')` with ru and en in `STR` (`01-lang.js`). Never call `t()` inside a function that has a local `t`.
- **Top level:** a `const`/`let` of a later file is never touched at the top level of an earlier one (TDZ).
- **Movement** is computed from `dt`. No freeze frames, no pauses of game time.
- **Gamepad:** every new button is a `button` inside its window. New windows go into `PAD_ROOTS` (top first) and `PAD_HOME`.
- **Fit:** everything fits in 360×640 and 844×390, in both languages.
- **The web never changes** because of this work: no `#cont`, no shop button, death leads straight to the end card.
- **«Продолжить»:** only in mode `free`, only when `PLATFORM` is `'app'` or `'steam'`, once per `run` object (so «Вторая смена» gets its own). It is free: never for sugar, money or an ad.
- **Numbers:** «Продолжить» appears 1.1 s after death, the timer is 5 s of real time, `spawnT = 3`, and the mass is the max over the last 3 s, sampled every 0.25 s, at least the start mass.
- **Ads:** `AD_SUGAR = 300`, `AD_DAY = 3` a day by the local date (`dayKey`). The attempt is spent only on `'reward'`.
- **Packs:** `PACKS = [{ id: 'sugar_s', sugar: 5000 }, { id: 'sugar_m', sugar: 15000 }, { id: 'sugar_l', sugar: 40000 }]`. The price comes only from `KUS_NATIVE.products()`.
- **Bridge timeouts:**
  - `ad()` 30 s, then `'error'`;
  - `products()` 10 s, then «недоступен»;
  - `buy()` is never abandoned; after 60 s the buttons unlock with «ждём ответа магазина».
- **Saves:** `kus.ads` = `{ d, n }`, `kus.tx` = the last 50 credited transaction ids.
- **Tests:** the full `npm test` takes about 5 minutes, so run it once, before a push. While working, run `npm run build && node tests/run.mjs <name part>`.

## Review Focus

1. **A death while the `#cont` window is up.** Leaving to the menu or reloading must not lose the run's sugar or pay it twice. `toMenu()` must pay the run exactly once.
2. **The timed-mode respawn branch in `update()`** (`runActive` and `deadT > 1.6`) must never respawn a free-run player while `#cont` is up or after «Нет».
3. **A purchase that arrives both from `buy()` and from `onPurchase`** with the same `tx` is credited once, also across a reload.
4. **An ad callback that arrives after the 30 s timeout** gives no sugar and spends no attempt: it is ignored.
5. **Mashing A or the bite button through a death** must not take «Продолжить» or «Нет» in the first 0.5 s.

Each one is pinned by a test in the task that owns it.

---

### Task 1: «Продолжить» in a free run (app and Steam)

**Files:**
- Create: `src/js/10-continue.js`
- Modify:
  - `src/js/10-flow.js`: `die`, `update`'s dead branch, `toMenu`, and one call from `update` while the player is alive
  - `src/js/17-boot.js`: `frame` calls `contFrame`, and `__kus`
  - `src/js/14-gamepad.js`: `PAD_ROOTS`, `PAD_HOME`, `padBack`, `lockT`
  - `src/js/14-input.js`: Esc
  - `src/index.html`: the `#cont` window
  - `src/style.css`
  - `src/js/01-lang.js`
- Test: `tests/run.mjs`

**Interfaces:**
- Produces in `10-continue.js`:
  - `CONT = { delay: 1.1, secs: 5, back: 3, lock: 0.5, step: 0.25, span: 3 }`
  - `cont = { pend: false, on: false, left: 0 }`
  - `contCan(): boolean`, which is `PLATFORM !== 'web' && mode === 'free' && !run.contUsed`
  - `contLog(dt: number): void`, called from `update` while the player is alive in a free run
  - `contMass(): number`
  - `contShow(): void`
  - `contYes(): void`
  - `contNo(): void`, which pays the run with `finishRun()` and calls `showOver()`
  - `contFrame(rdt: number): void`, the real-time timer; it does nothing while `document.hidden`
- The flag `run.contUsed` lives on `run`, so it resets with every new `run` object.
- `__kus` gets `cont`, `CONT`, `contShow`, `contYes`, `contNo`, `contFrame`, `contMass`.

- [ ] **Step 0: Tracker «before» shots.** These go with the stage post in Task 4:
  - the end card after a free-run death;
  - the menu's bank row.

  Take them at 360×640 and 844×390 from the current build. Save them in `.claude/shots/continue-shop-*-before.png`.

- [ ] **Step 1: Write the failing tests** in `tests/run.mjs`, with a shared fake `const STEAMFAKE = "window.KUS_PLATFORM = 'steam';"` and `const APPFAKE = 'window.Capacitor = { isNativePlatform: () => true };'`

```js
test('continue: the web goes straight to the end card, no #cont', async () => {
  // open() default (web), QUIET, P.alive = false; k.die(null); run k.update(1/60) up to 300 frames
  assert(contHidden && overShown, ...);
});
test('continue: in steam and the app a free-run death offers «Продолжить» once', async () => {
  // for each of STEAMFAKE, APPFAKE: die → after ~1.1 s #cont shown, #over hidden, k.state === 'dead'
  // the sugar is not paid yet: localStorage kus.sugar unchanged
  // click #contYes → k.state === 'play', k.player.alive, k.run.contUsed === true
  // die again → no #cont, #over shown within 300 frames
});
test('continue: the mass comes back from the last 3 s and the peak of the life is kept', async () => {
  // steam: P.mass = 400 for 60 frames of k.update(1/60), then P.mass = 30, P.stats.maxMass = 500, die
  // after contYes: k.player.mass === 400 (±1), k.player.stats.maxMass === 500, k.player.stats.bites === 0
  // also: P.mass = 5 for the whole log → after contYes the mass >= the difficulty's start mass
});
test('continue: «Нет», the timer and leaving to the menu pay the run exactly once', async () => {
  // steam, with k.run.sugar = 40 before death; three cases:
  //   click #contNo; or k.contFrame(1) × 6; or the menu via toMenu
  // in each: the bank grows by run.got once (kus.sugar before + run.got), #over shown (not after toMenu)
  // then 200 more k.update(1/60): k.state stays 'dead' or 'menu', k.player is not respawned (Review Focus 2)
});
test('continue: the timer stands while the page is hidden', async () => {
  // steam, #cont up; Object.defineProperty(document, 'hidden', { value: true, configurable: true }); k.contFrame(1) × 10
  // #cont still shown; set hidden back to false; k.contFrame(1) × 6 → #over shown
});
test('continue: «Вторая смена» gets its own «Продолжить», t3 and daily never show it', async () => {
  // steam: use it, then win with the STG helper as in the trophy walk test, startGame() → second shift; die → #cont shown
  // steam + setMode('t3') and setMode('daily'): die → no #cont
});
test('continue: the gamepad lands on «Продолжить», B says no, A is ignored for 0.5 s', async () => {
  // STEAMFAKE + PADFAKE, setPad(true), die, update until #cont shown, padPoll → activeElement.id === 'contYes'
  // __press(0, true) on the first poll after it shows: state stays 'dead' (Review Focus 5)
  // after 0.6 s of padPoll: B → #over shown (contNo)
});
test('continue: #cont fits at 360x640 and 844x390 in ru and en', async () => {
  // both buttons fully inside the viewport and not covered (elementFromPoint at the centre is inside the button)
});
test('continue: an autopilot run that takes «Продолжить» does not break or get stuck', async () => {
  // steam, player.ai = newAI(), 90 simulated seconds at ragged dt like the soak test;
  // on #cont shown call k.contYes(); assert no NaN in player x/y/mass, inside the field, k.state in play/dead, errors empty
});
```

Also extend `gamepad: every button on every screen is reachable with the d-pad`. Add a case with `STEAMFAKE + PADFAKE`: die, `#cont` up, `first() === 'contYes'`, `walked(reach(), 'continue')`.

Then change `platform: web, app and steam…`. For `want !== 'web'`, call `k.contNo()` once `#cont` shows, before it waits for `#over`.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm run build && node tests/run.mjs continue`
Expected: FAIL. The web test passes; the others fail on `#cont` missing or `k.contYes is not a function`.

- [ ] **Step 3: Implement**
  - **`die()`:** after `tally()` and the existing state reset, `if (contCan()) { cont.pend = true; return; }`. Do it before the timed branch and `finishRun()`; `runActive` stays true.
  - **`update()`'s dead branch:** `if (cont.pend) { if (deadT > CONT.delay && !cont.on) contShow(); }` comes first. Only then the existing timed respawn and `showOver` branches.
  - **`contShow`:** shows `#cont` and sets `left = CONT.secs`.
  - **`contYes`:**
    - `run.contUsed = true`;
    - remember the old player's `stats.maxMass`;
    - `spawnPlayer(CONT.back)`;
    - set `player.mass` and `shownMass` to `contMass()`, and `player.stats.maxMass` to the old peak;
    - hide `#cont`, `cont.pend = cont.on = false`.
  - **`contNo`:** hide `#cont`, clear the flags, `finishRun()`, `showOver()`.
  - **`toMenu()`:** first `if (cont.pend) { hide #cont; cont.pend = cont.on = false; finishRun(); }`.
  - **The journal** is a fixed-length ring: `Float32Array(Math.ceil(CONT.span / CONT.step))` plus an accumulator. It records `player.mass` every `CONT.step` and is cleared in `startGame`, in `secondShift` and after `contYes`.
  - **`contMass()`** returns the max of the ring and `DIFFS[diff].start`.
  - **`#cont` markup:** `<div id="cont" class="ov center hidden" role="dialog" data-ta="cont.a">`, a title, a ring or a number for the seconds (`#contN`), `<button id="contYes" class="btn">`, `<button id="contNo" class="btn2">`.
  - **Strings:**
    - `cont.t`: «Ещё не конец!» / «Not over yet!»
    - `cont.yes`: «Продолжить» / «Continue»
    - `cont.no`: «Нет, к итогу» / «No, show results»
    - `cont.a`: «Продолжить забег?» / «Continue the run?»
  - **Gamepad:**
    - `PAD_ROOTS` becomes `['album', 'adm', 'pause', 'cont', 'over', 'menu']`;
    - `PAD_HOME.cont = 'contYes'`;
    - `padBack`: `cont` → `contNo()`;
    - `lockT` becomes `0.5` for `'cont'` as for `'over'`.
  - **Keyboard:** Esc while `#cont` is shown → `contNo()`, before the pause branch.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm run build && node tests/run.mjs continue && node tests/run.mjs platform && node tests/run.mjs gamepad && node tests/run.mjs soak`
Expected: PASS, all of them.

- [ ] **Step 5: Look at it.** Take screenshots of `#cont` at 360×640 and 844×390 (ru) with a throwaway script in `.claude/`, as the tracker shots are made. Check that the field shows behind and that nothing overlaps.

- [ ] **Step 6: Commit**

```bash
git add src/ index.html tests/run.mjs
git commit -m "«Продолжить»: once per free run in the app and Steam, the mass of the last 3 s back with spawn protection"
```

### Task 2: The bridge, the shop window and sugar for ads (app)

**Files:**
- Create: `src/js/15-shop.js`
- Modify:
  - `src/js/02-tuning.js`: `AD_SUGAR`, `AD_DAY`
  - `src/js/14-input.js`: Esc closes the shop
  - `src/js/14-gamepad.js`: `PAD_ROOTS`, `PAD_HOME`, `padBack`
  - `src/index.html`: `#shopBtn` in `.bankRow`, the `#shop` window
  - `src/style.css`
  - `src/js/01-lang.js`
  - `src/js/17-boot.js`: `__kus`
- Test: `tests/run.mjs`

**Interfaces:**
- Produces in `15-shop.js`:
  - `NATIVE`, which is `PLATFORM === 'app' && window.KUS_NATIVE ? window.KUS_NATIVE : null`
  - `SHOP = { adWait: 30000, priceWait: 10000, buyWait: 60000 }`, in ms; tests lower them
  - `adsLeft(): number`, which is `AD_DAY` minus today's `n` from `kus.ads`
  - `adWatch(): Promise<void>`
  - `openShop(): void`, `closeShop(): void`, `shopOpen(): boolean`
  - `shopSay(key: string, ...args): void`, a message line `#shopMsg`
  - `late(text: string): void`, a message for the menu's bank row: `renderBank(text)` when the menu is shown, otherwise kept and shown by `toMenu`
- `#shopBtn` exists only when `NATIVE`. Hide it with the `hidden` class otherwise.
- `__kus` gets `NATIVE`, `SHOP`, `adsLeft`, `adWatch`, `openShop`, `closeShop`, `AD_SUGAR`, `AD_DAY`.

- [ ] **Step 1: Write the failing tests.** Use a shared fake `NATFAKE`, an `APPFAKE` plus a controllable bridge:

```js
const NATFAKE = `window.Capacitor = { isNativePlatform: () => true };
window.__nat = { ad: 'reward', adMs: 0, prices: null, buy: { status: 'ok', tx: 't1' }, buyMs: 0, cb: null, calls: [] };
window.KUS_NATIVE = {
  ad: () => (__nat.calls.push('ad'), new Promise((r) => setTimeout(() => r(__nat.ad), __nat.adMs))),
  products: (ids) => (__nat.calls.push('products'), new Promise((r, j) => setTimeout(() => (__nat.prices ? r(__nat.prices) : j(new Error('x'))), 0))),
  buy: (id) => (__nat.calls.push('buy:' + id), new Promise((r) => setTimeout(() => r(__nat.buy), __nat.buyMs))),
  onPurchase: (cb) => { __nat.cb = cb; },
};`;

test('shop: only the app with a bridge has the shop button; web, steam and an app without a bridge do not', async () => {
  // open({ play:false, returning:true }) for '', STEAMFAKE, APPFAKE, NATFAKE: #shopBtn visible only for NATFAKE
});
test('ads: a watched ad pays AD_SUGAR and spends one of three a day', async () => {
  // NATFAKE, openShop, click #adBtn, await ~50 ms: bank +300, adsLeft() === 2, kus.ads n === 1
  // three in all → adsLeft() === 0, #adBtn disabled
  // reload: still 0; then fake the next day (set kus.ads d to the previous dayKey) and reload → adsLeft() === 3
});
test('ads: an ad closed early or failed pays nothing and spends nothing', async () => {
  // __nat.ad = 'closed' → bank unchanged, adsLeft() === 3, #shopMsg is t('ad.closed'); same for 'error' with t('ad.err')
});
test('ads: an ad that answers after the timeout is ignored', async () => {
  // k.SHOP.adWait = 30; __nat.adMs = 200; click → after 60 ms #shopMsg is t('ad.err'), the button works again;
  // after 300 ms bank unchanged, adsLeft() === 3 (Review Focus 4)
});
test('ads: closing the shop during an ad still pays and tells in the bank row', async () => {
  // __nat.adMs = 100; click #adBtn; closeShop() at once; after 200 ms: bank +300, adsLeft() === 2, #bank text is t('ad.got', 300)
});
test('ads: the game sound is suspended during the ad and comes back', async () => {
  // __nat.adMs = 100; Sfx.init() first; during: k.Sfx.ac.state === 'suspended'; after: 'running' (when Sfx.on)
});
test('shop: the gamepad lands on the ad button and B closes the shop', async () => {
  // NATFAKE + PADFAKE, menu, openShop, padPoll → activeElement.id === 'adBtn', B → !shopOpen()
});
```

Extend the gamepad walk test: with `NATFAKE + PADFAKE`, open the shop, then `walked(reach(), 'shop')`.

Add a fit test: `#shop` at 360×640 and 844×390, ru and en, every button inside the viewport and not covered.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm run build && node tests/run.mjs shop && node tests/run.mjs ads`
Expected: FAIL. `#shopBtn` is missing and `k.openShop` is not a function.

- [ ] **Step 3: Implement**
  - **`#shop` markup:** `role="dialog"`, `data-ta="shop.a"`. Inside:
    - a title with the bank `#shopBank`;
    - `<button id="shopX">✕</button>`;
    - `<button id="adBtn">` with the text `t('ad.btn', AD_SUGAR, adsLeft(), AD_DAY)`, plus `#adNote`;
    - `#packs` (Task 3 fills it);
    - `#shopMsg` with `aria-live="polite"`.
  - **`adWatch`:**
    - disable `#adBtn` and set its text to `t('ad.wait')`;
    - `Sfx.ac && Sfx.ac.suspend()`;
    - race `NATIVE.ad()` with a `SHOP.adWait` timer that yields `'timeout'`;
    - **afterwards:** resume the sound if `Sfx.on`;
    - **on `'reward'`:** `sugar += AD_SUGAR`, `saveSugar()`, `n++` saved in `kus.ads` with `d = dayKey(new Date())`, `countUp` on the bank, `Sfx.power()`, `shopSay('ad.got', AD_SUGAR)`;
    - **on `'closed'`:** `shopSay('ad.closed')`;
    - **otherwise** (`'error'`, timeout, a rejected promise): `shopSay('ad.err')`;
    - **a late answer after the timeout** does nothing;
    - **when `adsLeft() === 0`:** the button is disabled with `t('ad.none')`;
    - **when the shop was closed meanwhile:** the result is still applied, and the message goes through `late`.
  - **Open and close:**
    - `#shopBtn` opens the shop;
    - `#shopX`, Esc and B close it;
    - `PAD_ROOTS` becomes `['album', 'adm', 'pause', 'cont', 'over', 'shop', 'menu']`;
    - `PAD_HOME.shop = 'adBtn'`;
    - `padBack`: `shop` → `closeShop()`.
  - **Strings, ru/en:**
    - `shop.btn`: «Магазин» / «Shop»
    - `shop.a`: «Магазин сахара» / «Sugar shop»
    - `ad.btn`: «▶ Реклама: +{n} · ещё {left} из {all}» / «▶ Ad: +{n} · {left} of {all} left»
    - `ad.wait`: «загружаем…» / «loading…»
    - `ad.got`: «+{n} сахара!» / «+{n} sugar!»
    - `ad.closed`: «Реклама закрыта раньше — сахар не начислен» / «The ad was closed early — no sugar»
    - `ad.err`: «Реклама сейчас недоступна, попробуй позже» / «No ad right now, try later»
    - `ad.none`: «Завтра будет ещё 3» / «3 more tomorrow»
  - Follow the existing function-style strings in `STR` for the arguments.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm run build && node tests/run.mjs shop && node tests/run.mjs ads && node tests/run.mjs gamepad && node tests/run.mjs platform`
Expected: PASS.

- [ ] **Step 5: Look at it.** Take screenshots of the menu with the shop button and the open shop, at 360×640 and 844×390. Also take the web menu at the same sizes and compare it with `main`'s build: it must be the same picture.

- [ ] **Step 6: Commit**

```bash
git add src/ index.html tests/run.mjs
git commit -m "Shop window in the app: sugar for a rewarded ad, three a day, through the KUS_NATIVE bridge"
```

### Task 3: Sugar packs (app)

**Files:**
- Modify:
  - `src/js/15-shop.js`
  - `src/js/02-wardrobe.js`: `PACKS`
  - `src/js/10-flow.js`: `toMenu` shows a kept `late` message
  - `src/js/01-lang.js`
  - `src/style.css`
  - `src/js/17-boot.js`: `__kus`
- Test: `tests/run.mjs`

**Interfaces:**
- Consumes from Task 2: `NATIVE`, `SHOP`, `openShop`, `shopSay`, `late`, and the fake `NATFAKE` with `__nat.prices`, `__nat.buy`, `__nat.buyMs`, `__nat.cb`.
- Produces:
  - `PACKS` (Global Constraints);
  - `loadPrices(): Promise<void>`, which fills `#packs` with one `<button data-id>` per pack;
  - `buyPack(id: string): Promise<void>`;
  - `credit(id: string, tx?: string): boolean`, true when it paid;
  - the bootstrap subscription `NATIVE.onPurchase((p) => { if (credit(p.id, p.tx)) late(t('pack.late', …)) })`.
- `__kus` gets `PACKS`, `credit`, `buyPack`, `loadPrices`.

- [ ] **Step 1: Write the failing tests**

```js
test('packs: prices come from the store; no prices means «недоступен» and «Ещё раз»', async () => {
  // NATFAKE with __nat.prices = null: openShop → #shopMsg t('pack.off'), a #packRetry button, pack buttons absent or disabled
  // set __nat.prices = [{id:'sugar_s',price:'1,99 €'},{id:'sugar_m',price:'4,99 €'},{id:'sugar_l',price:'9,99 €'}], click #packRetry
  // → three buttons, texts contain '5 000'/'5000' and '1,99 €', etc.
  // k.SHOP.priceWait = 30 with a products() that never answers → t('pack.off') after ~60 ms
});
test('packs: ok pays once; cancel pays nothing; error says money was not taken; pending waits', async () => {
  // ok tx 't1' → bank +15000 for sugar_m, kus.tx includes 't1'
  // __nat.buy = {status:'cancel'} → bank unchanged, no message or a quiet one, buttons enabled
  // {status:'error'} → t('pack.err'); {status:'pending'} → t('pack.wait'), bank unchanged
  // during a buy (buyMs 200): other pack buttons disabled, the pressed one says t('pack.busy')
});
test('packs: the same transaction from buy and from onPurchase pays once, also after a reload', async () => {
  // buy ok tx 't9' → +5000; __nat.cb({id:'sugar_s', tx:'t9'}) → no change; reload; __nat.cb again → no change (Review Focus 3)
  // __nat.cb({id:'sugar_l', tx:'t10'}) in the menu → +40000 and the bank row shows t('pack.late', …)
  // __nat.cb({id:'nope', tx:'t11'}) → nothing, 't11' not in kus.tx
  // {status:'ok'} without tx → pays (no dedupe)
});
test('packs: a late purchase during a run pays at once and tells in the menu after the run', async () => {
  // NATFAKE, in play: __nat.cb({id:'sugar_s', tx:'r1'}) → kus.sugar +5000 at once; toMenu → #bank text is t('pack.late', …)
});
test('packs: a buy with no answer unlocks the buttons after buyWait and still pays when it answers', async () => {
  // k.SHOP.buyWait = 40, __nat.buyMs = 200: after 80 ms buttons enabled and #shopMsg t('pack.slow'); after 300 ms bank +pack
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm run build && node tests/run.mjs packs`
Expected: FAIL, `k.buyPack is not a function`.

- [ ] **Step 3: Implement**
  - **`openShop`** calls `loadPrices()`. It races `NATIVE.products(PACKS.map(p => p.id))` against `SHOP.priceWait`.
  - **A pack button** shows the sugar with a thin space for thousands, as the bank does, and the store's price string. A pack missing from the answer has no button.
  - **`buyPack`:**
    - disables all pack buttons and sets the pressed one to `t('pack.busy')`;
    - **after `SHOP.buyWait`** without an answer: unlock with `shopSay('pack.slow')`;
    - **on `ok`:** `credit` and `shopSay('pack.got', n)`;
    - **on `cancel`:** unlock, no message;
    - **on `error`:** `shopSay('pack.err')`;
    - **on `pending`:** `shopSay('pack.wait')`.
  - **`credit`:**
    - an unknown id → false;
    - a `tx` already in `kus.tx` → false;
    - otherwise `sugar += pack.sugar`, `saveSugar()`, push the `tx` keeping the last 50, return true.
  - **`late`** (Task 2) keeps the message while a run is on, and `toMenu` shows it through `renderBank`.
  - **Strings, ru/en:**
    - `pack.off`: «Магазин сейчас недоступен» / «The store is unavailable right now»
    - `pack.retry`: «Ещё раз» / «Try again»
    - `pack.busy`: «покупаем…» / «buying…»
    - `pack.got`: «+{n} сахара!» / «+{n} sugar!»
    - `pack.err`: «Покупка не прошла. Деньги не списаны» / «The purchase failed. No money was taken»
    - `pack.wait`: «Покупка ждёт подтверждения — сахар придёт, когда она пройдёт» / «The purchase is awaiting approval — the sugar will come when it goes through»
    - `pack.slow`: «Ждём ответа магазина — сахар придёт сам» / «Waiting for the store — the sugar will come on its own»
    - `pack.late`: «Покупка прошла: +{n} сахара» / «Purchase complete: +{n} sugar»

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm run build && node tests/run.mjs packs && node tests/run.mjs shop && node tests/run.mjs ads && node tests/run.mjs gamepad`
Expected: PASS.

- [ ] **Step 5: Look at it.** Take screenshots of the shop with prices, at 360×640 and 844×390, ru and en. The longest price strings must fit.

- [ ] **Step 6: Commit**

```bash
git add src/ index.html tests/run.mjs
git commit -m "Sugar packs in the app shop: store prices, buy states, one credit per transaction, late purchases"
```

### Task 4: Documents, the whole suite, the tracker shots

**Files:**
- Modify:
  - `CLAUDE.md`
  - `docs/sugar.md`
  - `docs/audits/2026-11-26-release-gaps.md`

- [ ] **Step 1: `CLAUDE.md`**
  - **The decision line** «Ads, purchases and the sugar shop exist only when `PLATFORM` is `'app'`; in `'steam'` ×2 and Continue are free once per run…» becomes: «Ads and purchases exist only when `PLATFORM` is `'app'` and `window.KUS_NATIVE` is there, and only in the menu's shop: sugar packs and up to `AD_DAY` rewarded ads a day; no ad ever plays in a run or on the end card. «Продолжить» is free once per free run in `'app'` and `'steam'` (never for sugar or money). There is no ×2.»
  - **The file table:** add rows for `10-continue` and `15-shop`.
  - **Saves:** add `kus.ads` and `kus.tx`.
  - **`__kus`:** add the new names.
  - **The tests line:** add «Продолжить», ads and packs.
  - Do not commit the user's own uncommitted note in `CLAUDE.md` (the «Tests» paragraph about 5 minutes). Stage only these hunks with `git add -p`.
- [ ] **Step 2: `docs/sugar.md`.** Replace the closing Steam paragraph: there is no ×2 anywhere, «Продолжить» does not change sugar per minute, and `X2=1` stays as a tool option only. Also add a line on `AD_SUGAR` as a first guess.
- [ ] **Step 3: The audit, section «б».** On the ×2, «Продолжить», shop and flag rows, mark «сделано 27.11 (ветка `continue-shop`)» and the 27.11 decisions. Mark the bridge as faked until AdMob and RevenueCat are connected.
- [ ] **Step 4: The whole suite**

Run: `npm test > .superpowers/full.txt 2>&1; tail -5 .superpowers/full.txt`
Expected: «all passed». The known flakes are missions, streak and lang switch: rerun only the failed name. Report a failure that repeats.

- [ ] **Step 5: Tracker «after» shots** of `#cont` (Steam fake), the shop with prices (app fake) and the web menu. Save them in `.claude/shots/` for the stage post.
- [ ] **Step 6: Commit**

```bash
git add docs/sugar.md docs/audits/2026-11-26-release-gaps.md
git add -p CLAUDE.md
git commit -m "Docs: «Продолжить», the shop and ads for sugar; no ×2"
```
