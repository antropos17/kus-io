# Серии чаще: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** серии случаются чаще и показывают себя с ×2: слово «Кусь-кусь!» на ×2, окно 4 с, подобранный бонус — шаг серии.

**Architecture:** три правки в существующем коде серии (`STREAK` в `src/js/10-streak.js`, ветка игрока в `grant` в `src/js/08-food-particles.js`), проверки в `tests/run.mjs`, замер автопилотом до и после скриптом вне репозитория.

**Tech Stack:** Canvas 2D, один файл из `src/` (`npm run build`), тесты на `playwright-core` в установленном Chrome.

**Spec:** `docs/superpowers/specs/2026-11-25-streak-more-often-design.md`

## Global Constraints

- `index.html` собирается из `src/` командой `npm run build`; руками не правится, коммитится вместе с `src/`.
- Всё движение через `dt`; никаких пауз и стоп-кадров; `calm` выключает толчки камеры.
- Серия только у игрока; боты серий не копят.
- Слово на ×2 — ровно `'Кусь-кусь!'`; окно — ровно `4` секунды (`STREAK.win = 4`).
- Бонус: `combo + 1`, `comboT = STREAK.win`, `mission('combo', combo, true)`, `onStreakBite(P, P, x, y, 0, false)` — сахара 0, «На волоске!» от бонуса не бывает.
- Фантик по-прежнему только после серии ×5 в чистом забеге.
- Синтаксис не новее iOS 15 Safari. Комментарии в коде по-английски, интерфейс по-русски.
- Коммиты только после «да» Сеймура; без строк атрибуции.

## Review Focus

1. Бонус подобран ботом — серия игрока не меняется (бот тоже проходит через `grant`).
2. Бонус подобран без серии (`comboT <= 0`) — серия начинается с ×1, слова нет, кубики не летят.
3. Бонус на ×4 — получается ×5: штамп «Хрум-хрум!», жар краёв, и после угасания появляется фантик, как от укуса.
4. Случайный бонус рядом в старых тестах серии добавит лишний шаг — тесты, которые считают шаги, должны чистить `k.pickups` или не зависеть от них.
5. Тесты, которые ждут конца серии фиксированным числом кадров, рассчитаны на 3,2 с и сломаются на 4 с.

---

### Task 1: Замер «до»

**Files:**
- Create (вне репозитория, в scratchpad сессии): `streak-measure.mjs`, `streak-before.json`

**Interfaces:**
- Produces: `node streak-measure.mjs <secs> <diff> <seed>` печатает одну JSON-строку `{ seed, lives, x2, x3, x5, sugar, picks }`: число серий с пиком ≥2/≥3/≥5 **по самой игре** (максимум `P.combo` за серию, серия кончилась, когда `P.comboT <= 0`), сахар за прогон (сумма `k.run.sugar` по всем жизням), число подборов бонусов игроком.

- [ ] **Step 1:** написать скрипт по образцу scratchpad `streak-pick.mjs`: Chrome, `k.pause(true)`, читы выключены, `player.ai = k.newAI()`, шаг `k.update(1/60)`, перезапуск `k.startGame()` после смерти.
- [ ] **Step 2:** прогнать на текущем `main`: `npm run build`, затем 5 прогонов `node streak-measure.mjs 600 normal <1..5>` параллельно → `streak-before.json`.
- [ ] **Step 3:** `node tools/wrap-curve.mjs 30 normal` → сохранить вывод в `wrap-before.txt`.
Ожидание: ×2 примерно 15–24, ×3 7–15, ×5 1–7 за прогон (прогоны недетерминированы, сравниваем медианы).

### Task 2: Слово на ×2 и окно 4 с

**Files:**
- Modify: `src/js/10-streak.js:2-3` (`STREAK`), комментарии с «3.2 s» в этом файле
- Modify: `README.md:19` (окно, слово на ×2)
- Test: `tests/run.mjs` — тест `streak: label, fuse, stamps and the summary when it lapses` и тест фантика

- [ ] **Step 1: падающая проверка.** В тесте `streak: label, fuse…` запомнить слова после второго укуса (`if (n === 2) out.word2 = words();`) и добавить:
```js
assert(r.word2.join() === 'Кусь-кусь!', `bite 2 must stamp Кусь-кусь! alone: ${r.word2}`);
```
- [ ] **Step 2:** `npm run build && node tests/run.mjs "streak: label"` — FAIL на `word2`.
- [ ] **Step 3:** `STREAK = { win: 4, …, words: { 2: 'Кусь-кусь!', 3: 'Ням!', 5: 'Хрум-хрум!', 7: 'Обжора!' } }`; поправить комментарии «3.2 s» → «4 s»; README: окно 4 с, засчитываются укусы, проглатывания и бонусы, штампы начинаются с «Кусь-кусь!» на ×2.
- [ ] **Step 4:** удлинить ожидания конца серии на 48 кадров: `tests/run.mjs:283` (220→268), `:326` (240→288), `:331` (`tick(210)`→`tick(258)`), `:341` (240→288). Остальные места найдёт полный прогон. В цикле `bite` теста `streak: label…` добавить `k.pickups.length = 0;`, чтобы случайный бонус не дал лишний шаг.
- [ ] **Step 5:** `npm test` — всё зелёное (известные редкие флаки: альбом, желе, стая, пираньи в daily — перезапустить один тест, прежде чем чинить).

### Task 3: Бонус — шаг серии

**Files:**
- Modify: `src/js/08-food-particles.js:46` (ветка `if (b.isPlayer)` в `grant`)
- Test: `tests/run.mjs` — новый тест после `streak: swallowing whole counts as a streak bite`

**Interfaces:**
- Consumes: `STREAK.win`, `onStreakBite(P, B, wx, wy, add, close)` из `10-streak.js`; `mission`.

- [ ] **Step 1: падающий тест** `streak: a bonus pickup is a streak step`. Через `QUIET`: `k.food.length = 0`; положить бонус в игрока `k.pickups.push({ type: 'speed', x: P.x, y: P.y, t: 0 })` и сделать `k.update(1/60)`. Сценарии и проверки:
```js
// a) no streak: P.combo = 0; P.comboT = 0 → after pickup
assert(r.a.combo === 1 && r.a.words.length === 0 && Math.abs(r.a.comboT - 4) < 0.05, …);
// b) P.combo = 1; P.comboT = 2 → ×2 and the word
assert(r.b.combo === 2 && r.b.words.join() === 'Кусь-кусь!' && r.b.chip === '×2', …);
// c) P.combo = 4; P.comboT = 0.2 (inside STREAK.close) → ×5, Хрум-хрум!, never На волоске!
assert(r.c.combo === 5 && r.c.words.join() === 'Хрум-хрум!', …);
// d) a bot takes the bonus: player's combo and comboT unchanged
assert(r.d.same, …);
// e) sugar: k.run.sugar unchanged by the pickup itself
assert(r.e.sugar0 === r.e.sugar1, …);
assert(g.errors.length === 0, g.errors.join(' | '));
```
- [ ] **Step 2:** `npm run build && node tests/run.mjs "bonus pickup"` — FAIL.
- [ ] **Step 3:** в `grant`, ветка игрока: `combo = comboT > 0 ? combo + 1 : 1`, `comboT = STREAK.win`, `mission('combo', combo, true)`, `onStreakBite(b, b, b.x, b.y, 0, false)`. Комментарий: бонус строит серию, как укус, но без сахара и без «На волоске!».
- [ ] **Step 4:** тест из Step 1 проходит; затем `npm test` целиком.

### Task 4: Замер «после» и картинка

**Files:**
- Create (scratchpad): `streak-after.json`, `wrap-after.txt`, скриншот 390×844

- [ ] **Step 1:** `npm run build`; те же 5 прогонов `streak-measure.mjs 600 normal <1..5>` → `streak-after.json`; `node tools/wrap-curve.mjs 30 normal` → `wrap-after.txt`.
- [ ] **Step 2:** таблица до/после по медианам: ×2, ×3, ×5, сахар, бонусы, доля пойманных фантиков. Если сахар вырос больше чем на 15% — остановиться и показать Сеймуру, не подкручивая сам.
- [ ] **Step 3:** скриншот 390×844 (touch, DPR 2) в момент ×2: «Кусь-кусь!» не налезает на ×N над конфетой и на плашки HUD. Посмотреть глазами.
- [ ] **Step 4:** показать Сеймуру таблицу и скриншот; коммит `src/`, `index.html`, `tests/run.mjs`, `README.md`, спека и план — только после «да».
