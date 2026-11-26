# Оптимизация под телефоны, шаг 1 — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** первые четыре пункта из аудита. Плашка этапа перестаёт пересчитывать стили страницы в каждом кадре. Проверка еды идёт по сетке. Разогрев мира в `start()` вдвое дешевле. HUD не меряет таблицу и кнопки, когда ничего не менялось. На вид и в поведении игры не меняется ничего.

**Architecture:**
- Бесконечные анимации плашки `#stage` переходят на `transform`/`opacity` у HTML-элементов (псевдоэлемент полосок и отдельные `<svg>` челюстей и капель): такие анимации идут на композиторе.
- `updateFood` проверяет посыпку только против конфет из её клетки (сетка 256 px, заполняется раз в кадр в порядке `blobs`). Поэтому первый «съевший» или «притянувший» тот же, что раньше.
- Разогрев покрывает те же 2,5 с игрового времени меньшим числом шагов.
- `updateHUD` меряет `#board`/`#dodge` только при смене ключа раскладки и не перезаписывает неизменившийся текст.
- Новый `tools/perf.mjs` даёт числа до и после.

**Tech Stack:** ванильный JS в одном блоке (`tools/build.mjs`), CSS, Canvas 2D, тесты на `playwright-core` в `tests/run.mjs`, CDP (`Performance.getMetrics`, `Emulation.setCPUThrottlingRate`).

**Spec:** `docs/audits/2026-11-26-optimization.md`, пункты 1–4 таблицы «Предложения», и `CLAUDE.md` (разделы «Decisions that must not be broken», «Performance»).

**Где работать:** отдельный worktree и ветка `perf-mobile` от `main`. В основной папке параллельно идёт ветка `swallow-announce`, она трогает `style.css`, `10-flow.js` (`die`), `17-boot.js` (`frame`, `__kus`), `tests/run.mjs`, `CLAUDE.md`. Функции у нас другие, при слиянии конфликтуют только концы `tests/run.mjs`, `window.__kus` и список команд в `CLAUDE.md`.

## Global Constraints

- `index.html` генерируется. Править только `src/`, потом `npm run build`; в каждый коммит класть `src/` вместе с собранным `index.html`.
- Страница остаётся одним файлом без внешних скриптов. Синтаксис и CSS — не новее iOS 15 Safari (`inset` нельзя; `top/left/width/height` можно).
- Всё движение считается от `dt` и одинаково при 30 и 120 кадрах в секунду. Не писать «на кадр».
- `calm` и `@media (prefers-reduced-motion:reduce)` выключают анимации плашки так же, как сейчас.
- Телефон: всё помещается в 360×640 и 844×390. После правок интерфейса смотреть оба размера.
- Нового видимого текста нет. Если он вдруг понадобится — только через `t('key')` с обоими языками в `STR`.
- ES5-скрипт в начале `<body>` не трогать.
- Перед коммитом: `npm run format`, `npm test` зелёный.

## Review Focus

1. Safari на iPhone может не скруглять края композитного слоя внутри `overflow:hidden` с `border-radius`: полоски торчат квадратными углами за скруглённым концом `.fill`. Ожидается: концы скруглены, как сейчас. Это ручная проверка в Task 2, шаг «Скриншоты».
2. Плашка при `--p = 0`: полоски не должны быть видны совсем. Ожидается: ширина `.fill` равна 0, псевдоэлемент обрезан. Это проверка в тесте Task 2.
3. Посыпка у самого края мира и у границы клеток, конфета с магнитом, достающая через 2–3 клетки. Ожидается: съедается или притягивается так же, как сейчас. Это тесты Task 3.
4. Поворот телефона или смена размера посреди забега: мини-карта и кнопки должны держаться за новые места таблицы и кнопок. Ожидается: `boardBottom`/`btnTop` обновляются за один такт HUD (0,25 с). Это тест Task 5.
5. Таблица сворачивается тапом (`#board.min`) или вырастает на строку (игрок выпал из топа): мини-карта сдвигается следом. Ожидается то же самое за один такт HUD. Это тест Task 5.

---

### Task 1: Инструмент замера `tools/perf.mjs` и базовые числа

**Files:**
- Create: `tools/perf.mjs`
- Modify: `CLAUDE.md` (раздел «Commands», одна строка), `docs/audits/2026-11-26-optimization.md` (новый раздел «Замер до и после» в конце)

**Interfaces:**
- Produces: `node tools/perf.mjs [cpu=6] [runs=3] [WxH=390x844] [dpr=3]` печатает в stdout JSON медиан по прогонам:
  `{ cpu, size, dpr, runs, firstFrameMs, real: { fps, p95Ms, worstMs, over33 }, perSec: { scriptMs, styleMs, layoutMs, styles, layouts }, step: { updateMs, renderMs } }`.
  Прогресс пишется в stderr. Нужен свежий `npm run build`.

- [ ] **Step 1: Написать `tools/perf.mjs`**

  Шапка-комментарий в стиле `tools/mass-curve.mjs`. Браузер: `channel: 'chrome'`, `CHROME` переопределяет. Каждый прогон — новый контекст: `viewport` из `WxH`, `deviceScaleFactor: dpr`, `isMobile: true`, `hasTouch: true`, `locale: 'ru-RU'`.

  `addInitScript` делает четыре вещи:
  - пишет `kus.best='1'`, `kus.mode='free'`, `kus.diff='normal'`, `kus.cheat='{}'`;
  - подменяет `Math.random` на mulberry32 с зерном `1`;
  - оборачивает `requestAnimationFrame`, чтобы записать в `window.__ff` значение `performance.now()` при первом вызове колбэка;
  - больше ничего.

  До `goto` включить `Emulation.setCPUThrottlingRate { rate: cpu }` и `Performance.enable`. Порядок прогона:
  1. Дождаться `__ff` → `firstFrameMs`.
  2. `startGame()`, `player.ai = newAI()`, `CHEAT.god = true`.
  3. 1 с живого цикла, затем 10 с живого цикла (`gfx` не трогать, `adapt` работает). Записывать разницы времени `requestAnimationFrame` и разницу `Performance.getMetrics` по `ScriptDuration`, `RecalcStyleDuration`, `LayoutDuration`, `RecalcStyleCount`, `LayoutCount`, делённую на 10.
  4. `pause(true)`, `setLod(0)`, 300 ручных кадров: отдельно время `update(1/60)` и `render()`.

  По каждому полю — медиана по прогонам, округление до 0,1.

- [ ] **Step 2: Проверить, что работает**

  Run: `npm run build && node tools/perf.mjs 1 1`
  Expected: один JSON, все числа больше 0, `size` = `"390x844"`, нет `pageerror` (при ошибке страницы скрипт падает с кодом 1).

- [ ] **Step 3: Снять базовые числа**

  Run: `node tools/perf.mjs 6 3` и `node tools/perf.mjs 4 3 360x640 2`
  Ожидаемый порядок (из аудита): `firstFrameMs` ≈ 1300–1500, `perSec.layouts` ≈ 50–60, `step.updateMs` ≈ 3–4. Оба JSON вписать в новый раздел `docs/audits/2026-11-26-optimization.md` → «Замер до и после», колонка «до».

- [ ] **Step 4: Строка в `CLAUDE.md`**

  В блок «Commands» после `node tools/wrap-curve.mjs …` добавить:
  `node tools/perf.mjs 6 3    frame cost on an emulated phone (CPU x6, 390x844): first frame, real-loop fps, style/layout per second, update/render ms`

- [ ] **Step 5: Commit**

```bash
npm run format
git add tools/perf.mjs CLAUDE.md docs/audits/2026-11-26-optimization.md
git commit -m "Tools: perf.mjs measures frame cost on an emulated phone; baseline numbers in the audit"
```

---

### Task 2: Плашка этапа без пересчёта стилей в каждом кадре

**Files:**
- Modify: `src/style.css` (правила `#stage …` и `@keyframes stageSlide/chatT/chatB/stageDrip`, строка с `prefers-reduced-motion` для `#stage`)
- Modify: `src/js/10-hud.js` (`JAW_SVG`, `RAIN_SVG`; `CAKE_SVG` не трогать)
- Test: `tests/run.mjs`

**Interfaces:**
- Consumes: хелперы `STG`, `free()`, `run()` из `tests/run.mjs`; `open()`.
- Produces: разметка значков. Челюсти: `<span class="ic jaw">` с тремя `<svg viewBox="0 0 24 24">` внутри (первый — тёмный рот `rect`, затем `svg.jt` с верхней челюстью, затем `svg.jb` с нижней). Дождь: `<span class="ic rain">` с `<svg>` облака и тремя `<svg class="d">`, по одной капле в каждом. Торт остаётся `<svg class="ic">`. Тесты ищут значок по `.ic`.

- [ ] **Step 0: Скриншоты «до»**

  Короткий Playwright-скрипт вне репозитория (рядом с `.claude/shots/`, не коммитить) открывает собранную страницу и приводит плашку в состояния (а), (б), (в) из Step 1 тем же кодом. Снять `#stage` крупно (`locator('#stage').screenshot()`) и весь экран на 360×640 и 844×390. Файлы: `.claude/shots/stage-pill-<state>-<size>-before.png`. Тот же скрипт потом снимет «после».

- [ ] **Step 1: Написать падающий тест**

  Добавить после теста `hud: cream pills fit phones…`:
  `test('perf: the stage pill animates without restyling the page every frame', …)`.

  Открыть `open({ width: 390, height: 844, touch: true, dpr: 3, play: false, returning: true })` и CDP-сессию: `g.page.context().newCDPSession(g.page)`, `Performance.enable`. Каждое состояние начинается с `const P = free()`. Игра стоит на паузе (`free()` ставит `pause(true)`), холст рисуется, HUD не обновляется. Помощник `pin` взять из теста `stages: free play…`: `const pin = (m) => () => { P.mass = m; P.tx = P.x; P.ty = P.y; }`.
  - **(а) Голодные челюсти.** `P.stats.maxMass = 135; P.mass = 135; run(1/30)`. Ожидаем класс `hungry`. Очистить `#feed`.
  - **(б) Дождь.** `P.mass = 150; run(0.1)`, убить стаю (`for (const b of S().cur.pack) b.alive = false`), `run(0.1)`, `run(8.2, pin(605))`. Ожидаем `S().cur.k === 'rain'` и `#stage .rain` в DOM.
  - **(в) Пустая полоса.** `run(0.5)`, затем `st.style.setProperty('--p', '0')` и подождать 600 мс (переход ширины 0,5 с).

  В состояниях (а) и (б) снять `RecalcStyleCount` и `LayoutCount`, подождать `1500` мс, снять снова.

  Assertions:
  ```js
  assert(d.styles <= 15 && d.layouts <= 5, `${state}: ${d.styles} style recalcs, ${d.layouts} layouts in 1.5 s`);
  // (в): ширина полосы, st.querySelector('.fill').getBoundingClientRect().width
  assert(fillW < 1, `an empty pill shows ${fillW}px of stripes`);
  ```

  Затем `await g.page.emulateMedia({ reducedMotion: 'reduce' })`, повторить состояние (а) и проверить:
  `document.getElementById('stage').getAnimations({ subtree: true }).filter((a) => a.playState === 'running' && a.effect.getTiming().iterations === Infinity).length === 0`.

- [ ] **Step 2: Убедиться, что тест падает**

  Run: `npm run build && node tests/run.mjs "perf: the stage pill"`
  Expected: FAIL на (а): порядка 90+ пересчётов стилей за 1,5 с.

- [ ] **Step 3: Полоски через `transform`**

  В `src/style.css`, правило `#stage .fill`:
  - убрать `background`, `background-size` и `animation`;
  - добавить `overflow:hidden`;
  - `width` + `transition:width` и `border-radius:99px` оставить.

  Новое правило `#stage .fill:before`:
  `content:"";position:absolute;top:0;bottom:0;left:-22.6px;right:0;background:repeating-linear-gradient(-45deg,#ffd23f 0 8px,#ffe070 8px 16px);background-size:22.6px 22.6px;animation:stageSlide 1s linear infinite`.

  `@keyframes stageSlide{to{transform:translateX(22.6px)}}`.

- [ ] **Step 4: Челюсти и капли как отдельные `<svg>`**

  В `src/js/10-hud.js` пересобрать `JAW_SVG` и `RAIN_SVG` по разметке из Interfaces. Пути и цвета взять из нынешних строк без изменений: содержимое `g.jt` → `svg.jt`, `g.jb` → `svg.jb`, каждый `path` из `<g stroke-width="2.2" stroke-linecap="round">` → свой `svg.d` с этими же атрибутами обводки.

  В `src/style.css`:
  - `#stage .ic svg{position:absolute;left:0;top:0;width:100%;height:100%}`;
  - селекторы `#stage .jt`/`.jb`, `#stage.hungry .jt` и т.д. оставить: теперь они попадают в `svg`;
  - `#stage .rain g path{…}` и `:nth-child(2/3)` заменить на `#stage .rain .d{animation:stageDrip .9s linear infinite}`, а задержки `-.3s`/`-.6s` повесить на `.d:nth-child(3)` и `.d:nth-child(4)` (первый `svg` — облако);
  - в строке `@media (prefers-reduced-motion:reduce)` заменить `#stage .fill` → `#stage .fill:before` и `#stage .rain g path` → `#stage .rain .d`.

  В существующем тесте `hud: cream pills fit phones…` заменить `st.querySelector('svg.ic')` на `st.querySelector('.ic')`.

- [ ] **Step 5: Тест проходит**

  Run: `npm run build && node tests/run.mjs "perf: the stage pill" && node tests/run.mjs "hud:" && node tests/run.mjs "stages:"`
  Expected: PASS. Если в (а)/(б) стилей всё ещё много — анимация не ушла на композитор. Проверить, что анимируется `transform`/`opacity` у HTML-уровня `svg` или `:before`, а не у узла внутри SVG.

- [ ] **Step 6: Скриншоты и замер**

  - Скриптом из Step 0 снять «после» (`…-after.png`) и сравнить попарно. Вид должен совпасть: полоски с круглыми концами, челюсти и капли на местах.
  - Run: `node tools/perf.mjs 6 3`
    Expected: `perSec.layouts` упал с ~55 до ≤ 20, `perSec.styleMs` заметно ниже базы. Записать в аудит.

- [ ] **Step 7: Commit**

```bash
npm run format && npm test
git add src/style.css src/js/10-hud.js tests/run.mjs index.html docs/audits/2026-11-26-optimization.md
git commit -m "HUD: the stage pill's stripes, jaws and drops animate on the compositor, no page restyle every frame"
```

---

### Task 3: Сетка для `updateFood`

**Files:**
- Modify: `src/js/08-food-particles.js` (`updateFood` и новые объявления над ней)
- Test: `tests/run.mjs`

**Interfaces:**
- Produces (только внутри `08-food-particles.js`):
  - `const FOOD_CELL = 256`, `FOOD_COLS = Math.ceil(WORLD / FOOD_CELL)`, `foodGrid` — массив из `FOOD_COLS * FOOD_COLS` массивов, которые переиспользуются;
  - `foodMag(b) → boolean`: `(b.isPlayer && CHEAT.magnet) || b.pMagnet > 0`;
  - `foodReach(b) → number`: `b.Rs * 1.5 + (foodMag(b) ? 320 : 18)`;
  - `fillFoodGrid() → void`: обнуляет длины ячеек и кладёт каждую живую конфету в ячейки, которые пересекает квадрат `[x ± foodReach(b)] × [y ± foodReach(b)]` (индексы обрезаны до `0…FOOD_COLS-1`), строго в порядке `blobs`.
- `updateFood(dt)` один раз в начале вызывает `fillFoodGrid()`. Внутренний цикл `for (const b of blobs)` заменяется циклом по ячейке, где лежит посыпка (индекс по `f.x`, `f.y`, обрезанный в границы). Тело цикла не меняется, только `mag`/`reach` берутся из `foodMag`/`foodReach`.

- [ ] **Step 1: Написать тесты, закрепляющие нынешнее поведение**

  `test('food: eating and pulling sprinkles work across cell borders, at the world edge and with a magnet', …)`.

  Окружение: `open()`, `QUIET`, игрок на паузе. Убрать посыпку в радиусе 700 px от точки опыта: перенести её в `(3900, 100)`. Новую посыпку класть так: `k.food.push({ kind: 0, x, y, m: 1, c: 0, ai: 0, sz: 7 })`. Шаг — `k.update(1 / 60)`.

  Случаи и assertions:
  1. `k.place(P, 1020, 2000, 0)`; посыпка в `(1020 + P.Rs * 0.8, 2000)`. Предусловие: `x > 1024`, то есть посыпка в соседней клетке; иначе тест падает с понятным сообщением. Через 1 шаг: посыпки нет в `k.food`, `P.mass` выросла на 1 (±0,01).
  2. Магнит: `k.place(P, 2040, 2000, 0)`, `P.pMagnet = 5`; посыпка в `(2040 - 300, 2000)` — позади лица, через клетку. Через 1 шаг расстояние до `P` уменьшилось хотя бы на 5. Тот же опыт с `P.pMagnet = 0`: посыпка не сдвинулась (±0,001).
  3. Край мира: `k.place(P, P.Rs, P.Rs, Math.PI * 1.25)`; посыпка в `(5, 5)`. Не позже чем через 30 шагов её нет в `k.food`, ошибок страницы нет.
  4. Конфета-бот: тот же случай 1, но вместо игрока припаркованный бот (`k.blobs.find((b) => b !== P && !b.kind)`), поставленный через `k.place`. Посыпка съедена ботом: его масса +1.

- [ ] **Step 2: Тесты проходят на старом коде**

  Run: `npm run build && node tests/run.mjs "food: eating"`
  Expected: PASS. Это характеризующие тесты: они фиксируют поведение до переделки.

- [ ] **Step 3: Сетка**

  Реализовать объявления и `fillFoodGrid` из Interfaces. В `updateFood` заменить внутренний цикл. Комментарий к сетке — одной строкой, по-английски: зачем она и почему порядок `blobs`.

- [ ] **Step 4: Тесты и прогон на рваных кадрах**

  Run: `npm run build && node tests/run.mjs "food: eating" && node tests/run.mjs soak && node tests/run.mjs "bite"`
  Expected: PASS.

- [ ] **Step 5: Замер**

  Run: `node tools/perf.mjs 6 3`
  Expected: `step.updateMs` ниже базы Task 1 примерно на 25–30 % (аудит: 3,4 → 2,3). Записать в аудит.

- [ ] **Step 6: Commit**

```bash
npm run format && npm test
git add src/js/08-food-particles.js tests/run.mjs index.html docs/audits/2026-11-26-optimization.md
git commit -m "Food: sprinkles check only the candies in their grid cell, same order as before"
```

---

### Task 4: Короче разогрев мира в `start()`

**Files:**
- Modify: `src/js/17-boot.js` (`start`, строка `for (let i = 0; i < 150; i++) update(1 / 60);`)

**Interfaces:**
- Consumes: `tools/perf.mjs` (поле `firstFrameMs`).

- [ ] **Step 1: Заменить разогрев**

  `for (let i = 0; i < 50; i++) update(1 / 20);`

  Это те же 2,5 с игрового времени, но шаг равен потолку `dt`, который `frame` и так допускает (`0.05`). Комментарий: `// 2.5 s of the arena before the first frame, in the largest step frame() allows`.

- [ ] **Step 2: Тесты запуска и меню**

  Run: `npm run build && node tests/run.mjs boot && node tests/run.mjs "first visit" && node tests/run.mjs soak && node tests/run.mjs stages`
  Expected: PASS. В частности, `stages: free play…` проверяет, что торт в мире за меню остался.

- [ ] **Step 3: Замер и взгляд на меню**

  - Run: `node tools/perf.mjs 6 3`
    Expected: `firstFrameMs` меньше базы хотя бы на 250 мс. Записать в аудит.
  - Скриншот меню 390×844 и 844×390: за меню видны разошедшиеся конфеты, а не кучка на местах появления.

- [ ] **Step 4: Commit**

```bash
npm run format && npm test
git add src/js/17-boot.js index.html docs/audits/2026-11-26-optimization.md
git commit -m "Boot: the menu arena warms up in 50 steps of 1/20 s instead of 150 of 1/60 s"
```

---

### Task 5: `updateHUD` не меряет таблицу и кнопки без нужды и не пишет тот же текст

**Files:**
- Modify: `src/js/10-flow.js` (`updateHUD` и новое объявление над ней)
- Modify: `src/js/17-boot.js` (`window.__kus`: геттер `hudBox`)
- Test: `tests/run.mjs`

**Interfaces:**
- Produces:
  - `setText(el, s) → void` в `10-flow.js`: пишет `textContent` только если тот отличается;
  - `let hudBoxKey = ''` в `10-flow.js`;
  - в `window.__kus`: `get hudBox() { return { boardBottom, boardLeft, btnTop }; }`.

- [ ] **Step 1: Написать падающие тесты**

  `test('hud: the table and buttons are measured only when the layout can have moved, and unchanged text is not rewritten', …)`.

  Окружение: `open({ width: 390, height: 844, touch: true, dpr: 3 })`, `QUIET`. Помощник «заморозить массы»: перед каждым `k.update(1/60)` вернуть каждой конфете массу, запомненную в начале, — тогда HTML таблицы не меняется.

  Шпион: обернуть `Element.prototype.getBoundingClientRect` и считать вызовы, где `this.id` — `board` или `dodge`.

  1. 1 с прогрева, обнулить счётчик, 3 с замороженных обновлений → `reads <= 1`. Сейчас здесь 24: 12 тактов × 2 элемента.
  2. `document.getElementById('board').click()` (сворачивает таблицу в сенсорном режиме), затем 0,3 с обновлений → `Math.abs(k.hudBox.boardBottom - board.getBoundingClientRect().bottom) < 0.5`.
  3. `await g.page.setViewportSize({ width: 844, height: 390 })`, вызвать `dispatchEvent(new Event('resize'))`, 0,3 с обновлений → `btnTop` совпадает с `dodge.getBoundingClientRect().top` (±0,5), `boardBottom` совпадает с `#board` (±0,5).
  4. Таблица выросла: игроку поставить массу ниже всех ботов из топа (строка «…» плюс его строка), 0,3 с → `boardBottom` совпадает с `#board` (±0,5).
  5. Текст: новый забег в 3-минутном режиме — `k.pause(true); k.setMode('t3'); if (k.state !== 'menu') k.toMenu(); k.startGame();` (так же, как `free()` в `STG`). `MutationObserver` на `#timer` с `childList, characterData, subtree`, 3 с обновлений → записей `<= 4` (текст меняется раз в секунду). Сейчас ~12. `#goal` в забеге `daily` (тот же запуск с `setMode('daily')`) за 3 с → 0 записей.

- [ ] **Step 2: Убедиться, что падает**

  Run: `npm run build && node tests/run.mjs "hud: the table and buttons"`
  Expected: FAIL на п. 1 (около 24 вызовов) и на п. 5.

- [ ] **Step 3: Реализация**

  - В `updateHUD` поменять запись `$('timer').textContent = …` и `$('goal').textContent = …` на `setText(...)`.
  - Блок с `getBoundingClientRect` выполнять только когда:
    - ключ `W + 'x' + H + '|' + state + '|' + touchMode + '|' + SET.lefty + '|' + $('board').className` отличается от `hudBoxKey`;
    - или в этом такте переписан `lbEl.innerHTML`;
    - или `hudBoxKey === ''`.
  - После замера сохранить ключ в `hudBoxKey`.
  - Сброс `hudBoxKey = ''` по `document.fonts.ready` — строкой рядом с объявлением: смена шрифта меняет высоту таблицы.
  - Геттер `hudBox` в `window.__kus`.

- [ ] **Step 4: Тесты проходят**

  Run: `npm run build && node tests/run.mjs "hud:" && node tests/run.mjs "stages: the HUD stage line" && node tests/run.mjs layout`
  Expected: PASS.

- [ ] **Step 5: Замер**

  Run: `node tools/perf.mjs 6 3`
  Expected: `perSec.layouts` и `perSec.layoutMs` не выше, чем после Task 2. Записать в аудит.

- [ ] **Step 6: Commit**

```bash
npm run format && npm test
git add src/js/10-flow.js src/js/17-boot.js tests/run.mjs index.html docs/audits/2026-11-26-optimization.md
git commit -m "HUD: measure the table and buttons only when they can have moved; skip rewriting unchanged text"
```

---

### Task 6: Итог: замер после, отчёт, трекер

**Files:**
- Modify: `docs/audits/2026-11-26-optimization.md` (раздел «Замер до и после»: колонка «после», короткий вывод)

- [ ] **Step 1: Полный прогон**

  Run: `npm test` и `npm run check`
  Expected: `all passed`, `check` без ошибки.

- [ ] **Step 2: Итоговый замер**

  Run: `node tools/perf.mjs 6 3` и `node tools/perf.mjs 4 3 360x640 2`
  Вписать в аудит таблицу «до → после» по `firstFrameMs`, `real.fps`, `real.p95Ms`, `perSec.layouts`, `perSec.styleMs`, `step.updateMs`. Отдельной строкой: «на настоящем iPhone не проверено» и шаги проверки из аудита.

- [ ] **Step 3: Commit**

```bash
git add docs/audits/2026-11-26-optimization.md
git commit -m "Audit: numbers after the first four optimizations"
```

- [ ] **Step 4: Трекер**

  После `git push` (только по просьбе пользователя) выложить этап по `tools/tracker/README.md` с `visual: false`: вид не менялся. Строки:
  - `~ плашка этапа анимируется без пересчёта страницы`;
  - `~ еда проверяется по сетке`;
  - `~ мир за меню готов быстрее`;
  - `~ HUD меряет таблицу только при изменениях`;
  - `+ tools/perf.mjs`.
  Числа «до → после» взять из аудита.
