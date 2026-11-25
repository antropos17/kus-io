# Trophy, Juicy Streak, Runaway Wrapper and Cream Pills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make beating the Big Cake a trophy moment, make every bite of a streak visibly and audibly rewarding, add a catch-me wrapper after a ×5+ streak, and redraw the top-left HUD as cream pills.

**Architecture:** Two new game files: `src/js/10-hud.js` (sugar pill with an odometer and flying sugar cubes, the stage pill with jaws, buff coins) and `src/js/10-streak.js` (streak juice and the runaway wrapper with its reveal). The trophy is a class on the existing `#over .card` plus `src/js/16-trophy.js`, a canvas glaze frame that runs only while the win card is shown. Everything else hooks into existing functions (`doBite`, `updateBlob`, `earn`, `renderStage`, `updateHUD`, `showOver`, `stageWin`, `drawName`, `drawFace`, `drawMinimap`, `botThink`).

**Tech Stack:** Vanilla JS in one `{}` block built by `tools/build.mjs`, Canvas 2D, DOM/CSS for the HUD and cards, Web Audio synth in `Sfx`, tests in `tests/run.mjs` (playwright-core, headless Chrome) through `window.__kus`.

**Spec:** `docs/superpowers/specs/2026-11-25-trophy-streak-hud-design.md` (Russian). The approved look is in `docs/superpowers/specs/2026-11-25-mocks/`: `trophy.html` (left column), `streak-runaway.html` (streak and wrapper; its top-left HUD is outdated), `hud-cream-pills.html` (variant 1 only).

## Global Constraints

- Edit only `src/` and `tools/`, `tests/`, docs; run `npm run build`; commit `index.html` with the sources. Never edit `index.html` or `src/js/05-sound-data.js` by hand.
- File order is load order inside one block: no top-level use of a later file's `const`/`let` (TDZ). New files: `10-hud.js`, `10-streak.js`, `16-trophy.js`.
- iOS 15 Safari: no `inset`, `:has()`, container queries, CSS nesting, `structuredClone`, top-level `await`. Do not touch the ES5 error script at the start of `<body>`.
- All motion from `dt` (`Math.exp(-dt * k)`), same at 30 and 120 fps. No freeze frames, no pause of game time. Camera kicks only through `cam.shake` / `cam.sa`.
- `calm` turns off: kicks, blinking, pulsing edges, stamp scaling, odometer overshoot, stripe sliding, jaw chatter, the reveal dim, the trophy pop-in, ignition and particles (frame drawn whole and still).
- `lod` 1/2: halve, then quarter particle counts (cubes, sparkles, sprinkles). No new objects in per-frame hot loops; reuse pools.
- Sugar is paid only in a clean run (`player.cheated` / `run.cheated` → nothing).
- UI copy (exact): «Торт съеден!», «Первая смена за M:SS», «Смена N за M:SS», «Новый рекорд, было M:SS», «Первая победа!», «масса», «укусов», «сахара», «до пираний», «Пираньи идут!», «ещё кусь!», «Ням!», «Хрум-хрум!», «Обжора!», «На волоске!», «Серия ×N · +S сахара», «Лови!», «Редкий!», «Джекпот!», «Фантик пойман · +N сахара».
- Palette: cream `#fff1dc`, ink `#3a2118`, berry `#ff4f7b`, berry2 `#c8264f`, lemon `#ffd23f`, streak steps ×2 `#9be15d`, ×3–4 `#ff9a3c`, ×5+ berry. Cream-pill depth: `box-shadow: 0 4px 0 rgba(0,0,0,.4)`.
- Phone layouts 360×640 and 844×390 must fit; the HUD column stays ≤ 200 px wide.
- Commits and pushes happen only after Seymur's explicit "да" (session rule). Work on a new branch `trophy-streak-hud` cut from `tracker-setup`.
- Visible changes need tracker before/after shots: `node tools/tracker/report.mjs shot file:///<repo>/index.html .claude/shots/<slug>-before.png --width 390 --height 844` before a task's first edit, `-after` when it is verified.

## Review Focus

1. A streak ends while a wrapper is already running → no second wrapper; the running one is unaffected.
2. The player dies, the run ends, or the menu opens while a wrapper or reveal is active → both vanish, nothing is paid, no errors on the next run.
3. The second shift starts right after the trophy card → the glaze loop has stopped and the card's trophy class is gone on the next death card.
4. Sugar shown in the pill never drifts from `run.sugar` once cubes have landed (cubes in flight when the run ends are settled instantly).
5. 844×390 landscape: the trophy card with chest, missions and share still scrolls and its close button is reachable outside the bite.

Each line has a test in the owning task (Tasks 1, 4, 6, 7).

---

### Task 1: Sugar pill with odometer and flying cubes

**Files:**
- Create: `src/js/10-hud.js`
- Modify: `src/index.html` (`#sugar` markup), `src/style.css` (`#sugar`), `src/js/10-flow.js:93-102` (`earn`), `src/js/10-flow.js:240-250` and `src/js/10-stages.js:297` (places that blank `sugarEl`), `src/js/13-draw-body.js` (draw cubes in screen space at the end of `render`), `src/js/17-boot.js` (`__kus.hud`)
- Test: `tests/run.mjs`

**Interfaces:**
- Produces: `odometer(el) -> { set(n: number): void }` (digit columns, `translateY(-d * 1.16em)`); `sugarFly(wx: number, wy: number, value: number, n: number): void` (world point, value split over `n` cubes); `sugarSettle(): void` (lands every cube now); `hudSugar = { air: number }` (sugar still in flight); `__kus.hud = { get sugarShown(): number, get air(): number, sugarSettle }`.
- `earn(n)` keeps its signature; the pill shows `Math.floor(run.sugar - hudSugar.air)`.

- [ ] **Step 1: Write the failing test** `hud: the sugar pill rolls to earned sugar once the cubes land`

```js
// after open(), with QUIET; mission('bites',1) earns through the streak multiplier
const r = await g.page.evaluate(`(() => { ${QUIET} k.run.sugar = 0; k.hud.sugarSettle();
  k.sugarFly(k.player.x, k.player.y, 6, 3); k.run.sugar += 6;
  const mid = k.hud.sugarShown; for (let i = 0; i < 90; i++) k.update(1/60);
  return { mid, end: k.hud.sugarShown, air: k.hud.air, label: document.getElementById('sugar').getAttribute('aria-label') }; })()`);
assert(r.mid === 0 && r.end === 6 && r.air === 0, `pill ${r.mid} -> ${r.end}, air ${r.air}`);
assert(r.label === 'сахар 6', `aria-label "${r.label}"`);
// Review Focus 4: cubes still in flight when the run ends are settled at once
// k.sugarFly(x, y, 10, 5); k.run.sugar += 10; P.alive = false; update until state === 'dead'
//   → k.hud.air === 0 and k.hud.sugarShown === Math.floor(k.run.sugar)
```
Also expose `sugarFly` on `__kus`.

- [ ] **Step 2:** `npm test -- hud` (or `npm run build && node tests/run.mjs hud`). Expected: FAIL, `k.sugarFly is not a function`.

- [ ] **Step 3: Implement.** `#sugar` becomes `<div id="sugar" aria-label="сахар 0"><span class="sock"><svg>cube</svg></span><span class="num"></span><span class="mult"></span></div>` (cube SVG and pill CSS from `hud-cream-pills.html` variant 1: cream pill, 26 px lemon socket, ink 900 19 px number). Cubes are a fixed pool of 24 screen-space sprites drawn at the end of `render()`; flight 0.56 s on an arc (mid point 40 px above the higher end), each lands into the socket's `getBoundingClientRect()` centre (cache it on `resize`), adds its value to the pill, restarts a 0.28 s `gulp` scale on the socket and calls `Sfx.tick()` (new: sine 1568 Hz × semitone step, 0.04 s, peak 0.04, via `this.tone`). `calm`: no flight, value lands at once. `lod`: `n` halved / quartered, minimum 1. `finishRun()` and `toMenu()` call `sugarSettle()` first.

- [ ] **Step 4:** run the test. Expected: PASS. Run `npm test` and confirm the old `sugar:` tests still pass (they read `run.sugar`, not the pill text: update any that read `sugarEl.textContent` to `__kus.hud.sugarShown`).

- [ ] **Step 5: Commit** (after "да"): `git add src tests index.html && git commit -m "HUD: sugar pill with an odometer and flying cubes"`

### Task 2: Stage pill with jaws, buff coins

**Files:**
- Modify: `src/js/10-hud.js`, `src/js/10-stages.js:232-266` (`stageLine`, `renderStage`), `src/js/10-flow.js:575-587` (`#fx` builder), `src/index.html`, `src/style.css` (`#stage`, `#fx`)
- Test: `tests/run.mjs`

**Interfaces:**
- Consumes: `stageLine() -> [text, p]` as today.
- Produces: `stageKind() -> 'pir' | 'rain' | 'boss' | ''` (icon choice); `renderStage()` writes `#stage` as `<span class="fill"></span><span class="t"></span><b></b><svg class="ic"></svg>` with `--p`; classes `hungry` (p ≥ 0.85, waiting stage only) and `chomp` (set for 0.64 s when a stage event starts); `renderFx()` writes coins `<span class="coin" data-k="magnet" style="--t:.6"><svg/></span><b>5 с</b>`.

- [ ] **Step 1: Write the failing test** `hud: cream pills fit phones; the stage pill fills and its jaws chomp when the event starts`

```js
for (const opt of [{ width: 360, height: 640, touch: true, dpr: 2 }, { width: 844, height: 390, touch: true, dpr: 2 }]) {
  // free mode, stage 'pir' at p≈0.9, magnet 5 s
  // assert: #stage has class hungry, --p ≈ 0.9 ± 0.02, its svg.ic exists
  // assert: #score right edge ≤ 216 px and does not intersect #board's rect
  // run to the piranha threshold: #stage gets class 'chomp' within 2 frames of S().cur.k === 'pir'
  // #fx has one .coin[data-k=magnet] with --t between 0.55 and 0.65 and text '5 с'
}
```
Reuse `STG`, `free()`, `run()` helpers from the existing stage tests.

- [ ] **Step 2:** run, expect FAIL (no `.coin`, no `hungry`).

- [ ] **Step 3: Implement.** CSS from `hud-cream-pills.html` v1: pill 178×30, lemon stripes `repeating-linear-gradient(-45deg,#ffd23f 0 8px,#ffe070 8px 16px)` sliding 1 s linear (static under `calm`), jaws SVG `jawT` from the mock with `.jt`/`.jb` translated by `±(1-p)*3.2px`, chatter 0.22 s alternate, chomp 4 × 0.16 s. Rain icon: cloud with three falling sprinkles; boss icon: cake slice with a cherry; both 24 px, same stroke weights as the jaws. During the boss `p` is the cake's health (decreasing). `stageKind` reads `stg.cur.k` or the next `STAGE_KEYS[stg.i]`. Coins: 34 px cream circle, pink `#ffd0dc` fill `height: calc(var(--t)*100%)` from the bottom, icon 20 px (magnet from the mock; shield and speed in the same style), seconds beside it; `--t = player[prop] / PICK[k][1]`. Remove the «Серия ×N» chip line from `#fx`. Keep `#fx` DOM writes behind the existing `lastFx` string check (compare a rounded key, not every frame's float).

- [ ] **Step 4:** run the test and `node tests/run.mjs stages`. Expected: PASS (update the two existing "HUD stage line stays clear" tests if they read `#stage` text: they should read `#stage .t`).

- [ ] **Step 5: Commit** (after "да"): `HUD: stage pill with jaws and buff coins`

### Task 3: Streak juice

**Files:**
- Create: `src/js/10-streak.js`
- Modify: `src/js/07-bites.js:476-481` (after the combo update), `src/js/06-softbody.js:220-223` (streak end), `src/js/13-draw-body.js:388` (`drawName`), `src/js/12-draw-face.js` (eyes and mouth of the player), `src/js/10-hud.js` (×N chip, summary pill), `src/index.html` (`#dash` fuse ring, `#streakSum`), `src/style.css`
- Test: `tests/run.mjs`

**Interfaces:**
- Consumes: `sugarFly` (Task 1).
- Produces: `STREAK = { win: 2.6, close: 0.45, low: 0.8, words: { 3: 'Ням!', 5: 'Хрум-хрум!', 7: 'Обжора!' } }`; `streakLevel(combo: number) -> 0 | 1 | 2 | 3` (0: combo < 2; 1: 2; 2: 3–4; 3: ≥ 5); `onStreakBite(P, B, wx, wy, add: number, close: boolean): void` (called from `doBite` for the player, `add` = sugar this bite earned); `onStreakEnd(P): void` (called once when `comboT` crosses 0 with `combo > 1`); `streak = { start: number /* run.sugar at streak start */, sum: number, lastVictim: Blob | null, lastWound: {x, y} }`; `__kus.streak` getter.

- [ ] **Step 1: Write the failing test** `streak: label, fuse, stamps and the summary when it lapses`

```js
// reuse the 'streak, jelly wobble' setup to land 5 bites on V
// after bite 3: out.word3 = stamps contains 'Ням!'; after bite 5: 'Хрум-хрум!'
// k.streak.lastVictim === V; document.querySelector('#dash').style.getPropertyValue('--f') between 0.9 and 1
// a 6th bite made when P.comboT was set to 0.3 just before → stamp 'На волоске!'
// then 3 s of updates: #streakSum visible with text matching /^Серия ×6 · \+\d+ сахара$/; #fx has no 'Серия'
```
Expose `__kus.stamps` (the live list) for the assertion.

- [ ] **Step 2:** run, expect FAIL.

- [ ] **Step 3: Implement.**
  - `drawName`: when `b.isPlayer && streakLevel(b.combo) && b.comboT > 0`, draw `×N` (same label bitmap path via `labelFor('×'+N, true)`, fill by step colour), scale `1 + pop*0.45` where `pop` decays `exp(-dt*9)` (none under `calm`).
  - Fuse under the player: ellipse ring (rx = 1.15 R, ry = 0.32 R, at y + 0.95 R) drawn before the player body, arc fraction `comboT / 2.6`, step colour; blink in the last 0.8 s. `#dash` gets an outer ring through `--f` and `--fc` (conic-gradient outside the existing cooldown ring), plus «ещё кусь!» above it in the last 0.8 s. At step 3, 14 sprinkle capsules circle the button (CSS, `animation` paused under `calm`).
  - Cubes: `sugarFly(wx, wy, add, Math.min(P.combo, 5) + 1)` on every player bite with `combo > 1`.
  - ×N chip on the sugar pill (`#sugar .mult`, from Task 1's markup): text `×N`, background by step colour, 0.34 s pop on each bite (none under `calm`), hidden when the streak lapses.
  - Kick: `cam.shake = Math.max(cam.shake, 3 + Math.min(P.combo, 6) * 0.9); cam.sa = bite angle` (skipped under `calm`; keep the existing bite kick as the floor).
  - Hungry face: step ≥ 2 eyes × 1.25 and pupils × 1.25; step 3 heart eyes (berry, gentle pulse) and a drool drop; mouth opening `+ 0.08 * min(combo, 6)`.
  - Stamps: own small list (max 4) drawn in world space over the player, scale-in 1.8 → 1 in 0.15 s, fade after 0.8 s, berry fill with cream outline; words from `STREAK.words`; «На волоске!» wins over a word.
  - Sugar rush at step 3: `#vig` gets class `rush` (berry edge pulse 8 rad/s; static tint under `calm`) and 30/s sprinkles from screen edges (pool, `lod` scaled).
  - `onStreakEnd`: shows `#streakSum` («Серия ×N · +S сахара», S = `Math.floor(run.sugar - streak.start)`) under the HUD for 2 s with a 0.2 s slide; it then calls the wrapper hook from Task 4 (a no-op until then).
  - Rising tone already exists (`Sfx.ding(step)`); keep it.

- [ ] **Step 4:** run the test and `node tests/run.mjs streak`. Expected: PASS.

- [ ] **Step 5: Commit** (after "да"): `Streak: label over the candy, fuses, cubes, stamps, sugar rush and summary`

### Task 4: Runaway wrapper

**Files:**
- Modify: `src/js/10-streak.js`, `src/js/09-bots.js` (`botThink`: autopilot chases the wrapper; bots ignore it), `src/js/13-draw-body.js` (draw the wrapper before bodies, reveal after; minimap blip in `drawMinimap`), `src/js/10-flow.js` (`finishRun`, `toMenu`, player death: clear), `src/js/05-sound.js` (synth cues), `src/js/02-tuning.js` (`WRAP`)
- Test: `tests/run.mjs`

**Interfaces:**
- Consumes: `onStreakEnd`, `streak.lastVictim`, `streak.lastWound` (Task 3); `sugarFly` (Task 1).
- Produces: `WRAP = { min: 5, life: 5, amt: [20, 45, 120], odds: [0.55, 0.33, 0.12], up: 0.45, v0: 1.25, v1: 0.7, tire: 2.2 }` (`v0`/`v1`: wrapper speed as a multiple of the player's current top speed at birth and after `tire` seconds); `wrap: null | { x, y, vx, vy, t, life, tier, final, state: 'pop' | 'run' }`; `reveal: null | { t, tier, final, shown, paid }`; `spawnWrap(B, wx, wy, tier?: number): void`; `clearWrap(): void`; `__kus.wrap`, `__kus.reveal`, `__kus.spawnWrap`, `__kus.clearWrap`, `__kus.WRAP`.

- [ ] **Step 1: Write the failing tests**

`wrapper: a ×5 streak in a clean run drops a wrapper that pays when caught, nothing with cheats`
```js
// land 5 bites as in Task 3, then 3 s of updates: k.wrap !== null, k.wrap.state === 'run' within 0.5 s
// a second lapse of a new ×5 streak while k.wrap is alive: still exactly one wrapper (same object)
// place P onto the wrapper: within 2 frames k.reveal !== null and k.wrap === null; read f = k.reveal.final; after 3 s of updates
//   run.sugar grew by exactly k.WRAP.amt[f] and #streakSum text matches /^Фантик пойман · \+\d+ сахара$/
// with CHEAT.god = true before the streak: no wrapper at the lapse
```
`wrapper: an uncaught one leaves after 5 s and pays nothing; death and the menu clear it`
```js
// spawnWrap(V, x, y, 0) with P parked 2000 px away: after 5.6 s k.wrap === null, run.sugar unchanged
// spawnWrap again, then P.alive = false and 2 s of updates: wrap and reveal null, no page errors
// spawnWrap, toMenu(): wrap and reveal null; startGame(): no errors over 60 frames
```

- [ ] **Step 2:** run both, expect FAIL.

- [ ] **Step 3: Implement.**
  - Trigger in `onStreakEnd`: `runActive && !player.cheated && combo >= WRAP.min && !wrap && !reveal` → `spawnWrap(lastVictim, lastWound.x, lastWound.y)`. Starting tier from `odds`; `final = min(2, tier + (Math.random() < up ? 1 : 0))`.
  - `pop` 0.3 s hop out of the wound with a sprinkle burst; then `run`: flee from the player with a zigzag (`±0.9 rad`, 5 rad/s), push back from the tray edges within 120 px, speed eased from `v0` to `v1` over `tire` s, `life` counts down from 5. Bots never target it (`botThink` skips it; it is not in `blobs`).
  - Autopilot: in `botThink(b)` when `b.isPlayer && wrap && wrap.state === 'run'` and the wrapper is within 900 px, set `b.tx, b.ty` to it and return early.
  - Catch: distance < player Rs + 14 → `reveal = { t: 0, tier, final, shown: 0, paid: false }`, `wrap = null`, burst, kick. Escape: life ≤ 0 → teasing hop and fade 0.4 s, no pay.
  - Reveal over the player, game keeps running: screen-edge dim 0.35 for ≤ 1.5 s (none under `calm`); wrapper spins in 0.3 s; amount rolls over 1.2 s with `Sfx.tick` rising; tier steps up at 0.35 s + 0.3 s per step with a flash and «Редкий!»/«Джекпот!»; at 1.5 s pays: `run.sugar += amt` through `sugarFly(P.x, P.y - 90/z, amt, 8 + 3*final)` and shows `#streakSum` «Фантик пойман · +N сахара»; clears at 3 s.
  - Look (from `streak-runaway.html`): bonbon body and twisted ends in tier colours (`#fff1dc/#ff5d8f`, `#ffd23f/#ff9a3c`, `#ff5d8f/#c49bff`), legs and eyes while running, beam of light in the start tier colour, «Лови!» and a 5 s arc timer under it, a blinking minimap dot.
  - Sounds (synth only): pop-out two-note square chirp, scurry ticks ~3/s, catch square blip, pay arpeggio C5–E5–G5 (+C6 for a jackpot), tier-up sine chord.
  - `clearWrap()` from player death, `finishRun()` (before `sugarSettle`), `toMenu()`, `startGame()`.

- [ ] **Step 4:** run the wrapper tests and `node tests/run.mjs soak`. Expected: PASS, soak unchanged.

- [ ] **Step 5: Commit** (after "да"): `Runaway wrapper after a ×5 streak: chase, reveal, payout`

### Task 5: Wrapper economy measured with the autopilot

**Files:**
- Create: `tools/wrap-curve.mjs` (pattern: `tools/album-curve.mjs`)
- Modify: `src/js/02-tuning.js` (`WRAP.amt`, `WRAP.odds` if the measurement says so), `docs/stages.md` (new section «Фантик»)

**Interfaces:**
- Consumes: `__kus.WRAP`, `__kus.run`, autopilot (`player.ai = newAI()`), `__kus.reveal`.
- Produces: `node tools/wrap-curve.mjs <runs=30> <diff=normal>` printing JSON `{ runs, wrappers, caught, catchRate, wrapSugar, runSugar, share }` where `runSugar` and `share` use `run.got` with the wrapper sugar included.

- [ ] **Step 1:** write the tool: 30 autopilot free runs of 3 minutes on `normal`, counting spawned and caught wrappers and their sugar.
- [ ] **Step 2:** run `node tools/wrap-curve.mjs 30 normal`; record the numbers.
- [ ] **Step 3:** if `share` is outside 0.15–0.25, scale `WRAP.amt` by `target/share` (round to 5) and rerun. Also report the share recomputed at a 60% catch rate (`share × 0.6 / catchRate`); if that falls under 0.10, say so in the report rather than tuning further.
- [ ] **Step 4:** write the final table and the commands into `docs/stages.md` («Фантик»); `npm test` passes.
- [ ] **Step 5: Commit** (after "да"): `Wrapper sugar tuned with the autopilot`

### Task 6: Trophy card

**Files:**
- Modify: `src/js/10-flow.js:373-434` (`showOver`), `src/js/10-stages.js:267-289` (`stageWin`: keep the previous best), `src/index.html` (`#over` card: medal and tiles containers), `src/style.css` (`.card.trophy`)
- Test: `tests/run.mjs` (update `stages: beating the boss…`)

**Interfaces:**
- Produces: `run.won.prev: number | 0` (the old `clearRec.best` before this win, 0 if none); `#over .card` has class `trophy` only when `state === 'won'`, plus `rec` when `run.won.rec`; elements `#trMedal`, `#trTiles` (three tiles), `#trRec`.

- [ ] **Step 1: Update the failing test** (existing `stages: beating the boss…`):
```js
// replace the title/who asserts:
assert(r.title === 'Торт съеден!', `title "${r.title}"`);
assert(/^Первая смена за \d:\d\d$/.test(r.who), `win line "${r.who}"`);
// new reads in the evaluate: out.trophy = card.classList.contains('trophy'); out.rec = ...contains('rec');
//   out.recText = #trRec text; out.tiles = [...#trTiles b].map(textContent); out.chest = #chestRow visible; out.share = chalBtn text
assert(r.trophy && r.rec && r.recText === 'Первая победа!', ...);
assert(r.tiles[1] === String(k.run.bites) && r.tiles[2] === String(r.got), ...);
assert(r.chest && r.share === 'Поделиться', 'the chest pick and the share button stay');
// second-shift death: card has no 'trophy'; cheated win: 'trophy' without 'rec', #best still includes 'С читами'
// 844x390: the trophy card scrolls (scrollHeight > clientHeight is allowed) and .x is inside the viewport and outside the top-right 60x60 corner
```

- [ ] **Step 2:** run `node tests/run.mjs stages`, expect FAIL on the title.

- [ ] **Step 3: Implement.** In `stageWin` store `run.won.prev = clearRec.best || 0` before overwriting. In `showOver` when `won`: title «Торт съеден!»; `who` «Первая смена за M:SS» or «Смена N за M:SS»; `#trRec`: «Новый рекорд, было M:SS» when `won.rec && prev`, «Первая победа!» when `won.rec && !prev`, hidden otherwise; tiles масса `run.max` (rounded), укусов `run.bites`, сахара `run.got`; medal: inline SVG cake with a cherry (from `trophy.html`'s `cake()`); the rest of the card (chest, missions, album line, share, `#best`, `#near`) stays below the tiles. Teeth on the bite: for `.card.trophy` replace the `mask` radial-gradient with a mask of the circle plus 4 tooth circles (r 9 px on a 38 px arc around the corner, as in the mock), and a darker «flesh» rim drawn by the glaze canvas (Task 7). Move `.x` for `.trophy` to the top-left inside corner. Clear `trophy`/`rec` whenever `showOver` runs without `won`.

- [ ] **Step 4:** run `node tests/run.mjs stages`. Expected: PASS.

- [ ] **Step 5: Commit** (after "да"): `Trophy card for beating the Big Cake`

### Task 7: Glaze frame on the trophy card

**Files:**
- Create: `src/js/16-trophy.js`
- Modify: `src/index.html` (`<canvas id="trophyFx">` inside `#over .wrap`), `src/style.css`, `src/js/10-flow.js` (`showOver` starts it, hiding `#over` stops it), `src/js/17-boot.js` (`__kus.trophy`)
- Test: `tests/run.mjs`

**Interfaces:**
- Consumes: `.card.trophy`, `.card.rec` (Task 6).
- Produces: `trophyStart(card: HTMLElement): void`, `trophyStop(): void`, `__kus.trophy = { get running(): boolean, get frames(): number }`.

- [ ] **Step 1: Write the failing test** `trophy: the glaze runs only while the win card is shown`
```js
// win as in the stage test: after 1.5 s k.trophy.running === true and frames > 30, canvas #trophyFx visible and sized to the card + 24 px
// click #again (second shift): running === false within 2 frames; frames stop growing over 30 frames
// die afterwards: the death card has no running glaze
```

- [ ] **Step 2:** run, expect FAIL.

- [ ] **Step 3: Implement** the frame from `trophy.html` (`contour`, `glaze`, `buildCard` rim, ignition, flash, twinkles, crumbs, gold palette on `rec`): contour = the card's rounded rect minus the bite (same circles as the CSS mask), open path from one torn end to the other, resampled to 340 points; layers: soft glow (width 11, alpha 0.22, blur 16, `lighter`), dark under-edge, 7 px band with berry↔lemon flow, drips (5, on the bottom edge), sprinkles (48 capsules), gloss line, moving specular (55 pt/s). Pop-in: scale `1 - 0.16 e^{-6t} cos 14t` on the card element via `transform` (0.45 s). Ignition 1.0 s from the torn ends after 0.4 s, flash where they meet. Own `requestAnimationFrame` loop only while running; DPR-aware canvas sized to the card + 24 px; `calm`: one static draw, no loop. `lod ≥ 1`: no twinkles, half sprinkles.

- [ ] **Step 4:** run the test, `node tests/run.mjs stages`, `node tests/run.mjs soak`. Expected: PASS.

- [ ] **Step 5: Commit** (after "да"): `Trophy: live glaze frame torn by the bite`

### Task 8: Docs, screenshots, final check

**Files:**
- Modify: `CLAUDE.md` (file table: `10-hud`, `10-streak`, `16-trophy`; decisions: wrapper rules, reveal never pauses time), `README.md` (streak, wrapper, trophy in «What kind of game it is» / «Modes»), `docs/media/` via `npm run shots` if the README screenshots changed visibly

- [ ] **Step 1:** `npm test` → all tests pass; `npm run check` → `index.html` matches `src/`.
- [ ] **Step 2:** after-shots for every visible task at 390×844 (and 844×390 for the trophy card), paired with the before-shots taken at each task's start.
- [ ] **Step 3:** update the docs.
- [ ] **Step 4: Commit** (after "да"): `Docs for the trophy, streak, wrapper and cream pills`
- [ ] **Step 5:** post the stage to the tracker per `tools/tracker/README.md` (only if the tracker database is reachable from Claude Code by then; otherwise tell Seymur).
