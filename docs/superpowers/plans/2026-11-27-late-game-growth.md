# Рост на поздней игре — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a strong player reach 6–10 thousand mass. The player's candy melts more gently than the bots, its hard cap rises, bigger bots spawn as food once the player is huge, and the autopilot measures it before and after.

**Architecture:**
- **Melt:** the formula and the cap move from inline numbers in `06-softbody.js` into a `MELT` table and a `meltRate(b)` function in `02-tuning.js`.
- **Bots:** `randomBotMass()` in `09-bots.js` gets a late branch driven by `lateShare(m)`.
- **Measurement:** `tools/mass-curve.mjs` learns to play on through «Вторая смена» and to report peak mass across shifts; `tools/perf.mjs` learns to start with a given player mass.

**Tech Stack:** vanilla JS concatenated by `tools/build.mjs`, Playwright tests in `tests/run.mjs`, Node tools.

**Spec:** `docs/superpowers/specs/2026-11-27-late-game-growth-design.md`

**Branch:** `late-growth`, cut from `main` (26e5d75).

## Global Constraints

- **Build:** edit only `src/`, then `npm run build`. Commit the built `index.html` with `src/`.
- **Movement and melt** are computed from `dt`.
- **The balance** is checked with the autopilot, not by eye.
- **Bots, hedgehogs, piranhas and the cake** keep today's melt: `(m − 300) · 0.004 · (1 + m/1000)` per second above 300, none for `kind === 'cake'`. They keep today's caps: piranha 30, hedgehog 420, everything 3 500.
- **The player** (`b.isPlayer`) melts `(m − 300) · MELT.kPlayer` per second above 300. Start with `kPlayer = 0.004`. The player's cap is 20 000.
- **Late bots** start when the player is alive and `player.mass > LATE.from` (1 500).
  - Their share is `clamp((P.mass − LATE.from) / LATE.span, 0, LATE.maxShare)`, starting with `span = 6000` and `maxShare = 0.45`.
  - A late bot weighs `rand(0.08, 0.25) · P.mass`.
  - `P.mass` is the current mass, not the peak.
  - `BOT_TARGET` (24) and `FOOD_TARGET` do not change.
  - The daily twist `small` wins over the late branch.
- **Modes:** `t3` and `daily` use the same melt and population rules.
- **Acceptance** (normal autopilot, 20 game minutes with shifts):
  - median peak ≥ 6 000;
  - ≥ 20% of runs reach 10 000;
  - the share ≥ 10 000 still grows between minute 15 and 20;
  - some deaths after 6 000 (0 of 40 = stop and discuss);
  - weak and weaker sets: alive at 1:00, 2:00 and 3:00, and the bot-death share, within ±7.5 percentage points of «before»;
  - `tools/perf.mjs` with a 10 000 player: frame cost within +15% of the ordinary run.
- **Stop rule:** if no reasonable `kPlayer`, `span` or `maxShare` meets the acceptance, or the growth is limited by food, stop and report to the owner. Do not bend the acceptance.
- **Tests:** the full `npm test` (about 5 minutes) runs once, before a push. While working, run `npm run build && node tests/run.mjs <name part>`.

## Review Focus

1. **A player at exactly 300 or below** must not melt and must not grow. A negative melt from the linear formula would feed the candy.
2. **The 3-minute mode with a big player:** late bots there must not make `t3` scores jump by a different rule than free play. Same rule, no mode branch.
3. **Second shift:** the player keeps the mass above 3 500 into the shift. `secondShift` sets `P.mass = stg.wonMass`, and nothing in the shift start clamps it back.
4. **Bots that grow by eating a late bot** stay under 3 500: the cap check is per `b`, not per player.
5. **`randomBotMass(true)`** (the first field at boot and in the menu) never takes the late branch, because there is no live run player.

Each one is pinned by a test in the task that owns it.

---

### Task 1: Measurement tools, then the «before» numbers

**Files:**
- Modify: `tools/mass-curve.mjs`, `tools/perf.mjs`
- Create: `docs/late-growth.md` (measurements «до и после»)

**Interfaces:**
- Produces:
  - **`SHIFTS=1` env in `mass-curve`:** on `k.state === 'won'` the run records the win, as it does now (`r.won` the first time). It then calls `k.startGame()`, which becomes «Вторая смена», and goes on until `LIMIT` or death.
  - **New per-run fields:**
    - `shifts` — wins;
    - `peak` — max player mass over the whole run, all shifts;
    - `tTo` — `{ 3000, 6000, 10000 }` in seconds or `null`;
    - `diedAfter6k` — boolean;
    - `peakAt` — `{ 300, 600, 900, 1200 }`: peak so far at those seconds.
  - **New summary fields:** `peak` (quantiles like `maxMass`), `reach6k`, `reach10k` (shares), `reach10kAt` = `{ 900, 1200 }` shares, `diedAfter6k` (count), `tTo` quantiles.
  - Without `SHIFTS`, the existing fields and their meaning stay unchanged.
  - **`MASS=<n>` env in `perf`:** after the run starts, set `player.mass` to n (and `shownMass` through `__kus` if exposed; otherwise mass only) before the timed parts.

- [ ] **Step 1: Smoke the tools.**

Run: `npm run build && SHIFTS=1 node tools/mass-curve.mjs 2 normal 400`
Expected: two runs; the summary JSON has `peak`, `reach6k`, `reach10k`, `tTo`. A run that won shows `shifts ≥ 1` and keeps playing past the win.

Run: `MASS=10000 node tools/perf.mjs 6 1`
Expected: one JSON line; it differs from a plain `node tools/perf.mjs 6 1` run.

- [ ] **Step 2: The «before» numbers**, on the current build (`main` code), in the background, saving to `docs/late-growth-before-*.json`:

```
SHIFTS=1 OUT=docs/late-growth-before-strong.json node tools/mass-curve.mjs 40 normal 1200
OUT=docs/late-growth-before-weak.json node tools/mass-curve.mjs 40 normal 600 weak
OUT=docs/late-growth-before-weaker.json node tools/mass-curve.mjs 40 normal 600 weaker
node tools/perf.mjs 6 3 > docs/late-growth-before-perf.json
MASS=3400 node tools/perf.mjs 6 3 > docs/late-growth-before-perf-3400.json
```

Expected: the strong set's median peak is around 3 500, the hard cap.

- [ ] **Step 3: Write the «до» columns** of `docs/late-growth.md`, with one table per set:
  - **strong:** peak median, p75, p90, reach 6k, reach 10k, reach 10k at 15 and 20 min, time to 3k and 6k, died after 6k;
  - **weak and weaker:** alive at 0:30, 1:00, 2:00, 3:00, died in the run, cause shares;
  - **perf:** update and render ms, fps.

  Put the commands at the top.

- [ ] **Step 4: Commit**

```bash
git add tools/mass-curve.mjs tools/perf.mjs docs/late-growth.md docs/late-growth-before-*.json
git commit -m "mass-curve plays on through the shifts and reports peak mass; perf takes a player mass; the «before» numbers"
```

### Task 2: The player's gentle melt and cap

**Files:**
- Modify:
  - `src/js/02-tuning.js`: `MELT`, `meltRate`
  - `src/js/06-softbody.js:276-279`
  - `src/js/17-boot.js`: `__kus.MELT`, `__kus.meltRate`
- Test: `tests/run.mjs`

**Interfaces:**
- Produces:
  - `MELT = { from: 300, k: 0.004, kPlayer: 0.004, cap: 3500, capPlayer: 20000 }`
  - `meltRate(b): number`, the mass per second b loses:
    - 0 for `kind === 'cake'` and for `b.mass <= MELT.from`;
    - the player formula for `b.isPlayer`;
    - otherwise the bot formula.
  - `06-softbody` calls `b.mass -= meltRate(b) * dt`, then the piranha and hedgehog caps as now, then `Math.min(b.mass, b.isPlayer ? MELT.capPlayer : MELT.cap)`.

- [ ] **Step 1: Write the failing tests**

```js
test('melt: the player melts linearly and gentler than a bot of the same mass; caps differ', async () => {
  // open(); k = __kus; P = k.player; a bot B = k.blobs.find(b => b.ai && !b.kind)
  // with P.mass = 6000: k.meltRate(P) ≈ 5700 * k.MELT.kPlayer (±0.01)
  // with B.mass = 6000: k.meltRate(B) ≈ 5700 * 0.004 * 7 = 159.6 (±0.01)
  // P.mass = 300 and 250: k.meltRate(P) === 0 (Review Focus 1); cake: meltRate === 0
  // P.mass = 25000; k.update(1/60) → P.mass <= 20000 and > 19000;
  // B.mass = 5000 far from everyone; k.update(1/60) → B.mass <= 3500
});
test('melt: a second shift keeps a mass above 3500', async () => {
  // STG helper: win with P.mass = 5000 at the moment of the win (as in the trophy walk test, but set P.mass = 5000 before the last frames);
  // k.startGame() → k.state === 'play' and k.player.mass > 4500 (Review Focus 3)
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npm run build && node tests/run.mjs melt`
Expected: FAIL with `k.meltRate is not a function`.

- [ ] **Step 3: Implement `MELT` and `meltRate`, and the softbody call, as in Interfaces.**

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm run build && node tests/run.mjs melt && node tests/run.mjs stages && node tests/run.mjs soak`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ index.html tests/run.mjs
git commit -m "The player's candy melts linearly and can reach 20 000; bots melt and cap as before"
```

### Task 3: Bigger bots when the player is huge

**Files:**
- Modify:
  - `src/js/02-tuning.js`: `LATE`
  - `src/js/09-bots.js`: `lateShare`, the late branch in `randomBotMass`
  - `src/js/17-boot.js`: `__kus.LATE`, `lateShare`, `randomBotMass`, and a test setter `daily.day` (`set day(v) { day = v; }`)
- Test: `tests/run.mjs`

**Interfaces:**
- Consumes: `MELT` from Task 2 (the late bots melt and cap by the bot rule, nothing new needed).
- Produces:
  - `LATE = { from: 1500, span: 6000, maxShare: 0.45, lo: 0.08, hi: 0.25 }`
  - `lateShare(m: number): number`, which is `clamp((m − LATE.from) / LATE.span, 0, LATE.maxShare)`
  - `randomBotMass(first)`, with this order:
    1. the `small` twist;
    2. `first` (unchanged, Review Focus 5);
    3. if `state === 'play' && player && player.alive && Math.random() < lateShare(player.mass)`, return `rand(LATE.lo, LATE.hi) * player.mass`;
    4. otherwise as now.

- [ ] **Step 1: Write the failing tests**

```js
test('late bots: bigger bots come only when the player is huge and alive', async () => {
  // k.lateShare(1000) === 0; k.lateShare(1500) === 0; k.lateShare(3000) ≈ 0.25; k.lateShare(9000) === 0.45
  // P.mass = 8000 (alive, state play): 2000 × k.randomBotMass() → share ≥ 640 within 0.45 ± 0.05,
  //   every value ≥ 640 is in [640, 2000]
  // P.mass = 1000: no value > 350
  // P.alive = false: no value > 350
  // k.randomBotMass(true) with P.mass = 8000: no value > 600 (Review Focus 5)
  // k.daily.day = 'small' with P.mass = 8000: every value ≤ 50
});
test('late bots: a bot that eats a late bot stays under 3500', async () => {
  // spawn B with mass 3400 and C with 2000 next to it, B.ai on C; 300 frames or set B.mass = 5400 and step one frame → B.mass <= 3500 (Review Focus 4)
});
test('late bots: t3 with a huge player takes the same branch', async () => {
  // setMode('t3'), startGame, P.mass = 8000: 2000 × randomBotMass → share ≥ 640 within 0.45 ± 0.05 (Review Focus 2)
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npm run build && node tests/run.mjs "late bots"`
Expected: FAIL with `k.lateShare is not a function`.

- [ ] **Step 3: Implement `LATE`, `lateShare` and the branch, as in Interfaces.**

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm run build && node tests/run.mjs "late bots" && node tests/run.mjs bots && node tests/run.mjs album && node tests/run.mjs soak`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ index.html tests/run.mjs
git commit -m "Bigger bots spawn as food once the player passes 1500, up to 45% of new bots, 8-25% of the player's mass"
```

### Task 4: The «after» numbers, tuning, documents

**Files:**
- Modify:
  - `src/js/02-tuning.js` (only `MELT.kPlayer` and `LATE.*`, if tuning needs it)
  - `docs/late-growth.md`, `CLAUDE.md`, `docs/stages.md` (one line)
- Create: `docs/late-growth-after-*.json`

- [ ] **Step 1: Run the same five commands as Task 1 Step 2,** with `after` in the file names, on this branch's build.

- [ ] **Step 2: Compare with the acceptance** in Global Constraints.
  - **If it fails:** change only `MELT.kPlayer`, `LATE.span`, `LATE.maxShare`, `LATE.lo` and `LATE.hi`, one at a time.
  - **Measure each try with a short strong set,** `SHIFTS=1 node tools/mass-curve.mjs 12 normal 1200`. Then run the full strong set and both weak sets on the final numbers.
  - **Record every try** in `docs/late-growth.md`.
  - **The stop rule applies:** if growth is food-limited, or no setting passes, stop and report to the owner.
  - **The «after» perf** uses `MASS=10000`. Compare it with the «before» ordinary run.

- [ ] **Step 3: Documents**
  - **`docs/late-growth.md`:** the «после» columns, the chosen numbers, the tries.
  - **`CLAUDE.md`,** under «Decisions that must not be broken»: one line — «The player's candy melts linearly (`MELT.kPlayer`, cap `MELT.capPlayer` 20 000) and bots by the old accelerating rule (cap 3 500); once the player passes `LATE.from`, up to `LATE.maxShare` of new bots spawn at `LATE.lo`–`LATE.hi` of its mass, so a strong player can reach 6–10 thousand. Measure changes with `SHIFTS=1 node tools/mass-curve.mjs 40 normal 1200` and the weak sets (`docs/late-growth.md`).» Also add `MELT`, `meltRate`, `LATE`, `lateShare`, `randomBotMass` to the `__kus` list, and the `SHIFTS` and `MASS` env vars to the commands list.
  - **`docs/stages.md`:** one line saying that the giants' melt and cap for the player changed, with a link.
  - Do not commit the user's uncommitted note in `CLAUDE.md`. Stage only these hunks: write the edits onto HEAD's copy, as on `continue-shop`.

- [ ] **Step 4: The whole suite**

Run: `npm test`
Expected: «all passed». Known flakes: missions, streak, lang switch, «stages: the 3-minute mode and the candy of the day…»; rerun only the failed name.

- [ ] **Step 5: Commit**

```bash
git add src/ index.html docs/late-growth.md docs/late-growth-after-*.json docs/stages.md CLAUDE.md
git commit -m "Late-game growth measured: <median peak> median peak, <share> reach 10 000; docs"
```
