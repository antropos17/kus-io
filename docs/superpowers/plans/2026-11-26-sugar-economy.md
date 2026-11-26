# Экономика сахара — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** сахар тратится на гардероб из пяти видов вещей (шапки, узоры, глаза, след, поднос) на ~30 часов игры; задания платят сахаром; сундук можно открыть ещё раз за сахар.

**Architecture:** новый файл `src/js/02-wardrobe.js` держит каталог с ценами (`WARDROBE`, `PRICE_K`), что куплено (`own`, ключ `kus.own`) и переход старых сохранений. Меню и покупка в `14-input.js` становятся общими для всех видов: шапки, глаза, след и поднос — ряды-фишки, узоры — как сейчас картинками. Рисунки: шапки в `drawHat`, узоры в `skinTile`, глаза в `drawFace`, след — частицы в `parts`, поднос — цвета в `ensurePattern`. Темп измеряет новый `tools/sugar-curve.mjs`.

**Tech Stack:** ванильный JS в одном блоке (`tools/build.mjs`), Canvas 2D, тесты `tests/run.mjs` (playwright-core, установленный Chrome) через `window.__kus`.

**Spec:** `docs/superpowers/specs/2026-11-26-sugar-economy-design.md` (утверждён Сеймуром 26.11.2026).

## Global Constraints

- Править только `src/`, `tools/`, `tests/`, `docs/`, `CLAUDE.md`, `README.md`; после правок `npm run build`; `index.html` коммитить вместе с исходниками. `src/js/05-sound-data.js` руками не трогать.
- Работать в отдельном worktree на ветке `sugar-economy` от `main`: в основной папке другая сессия держит ветку `swallow-announce` с незакоммиченными правками (`10-announce.js`, `17-boot.js`, `style.css`, `tests/run.mjs`). Перед слиянием — rebase на `main` после того, как туда придут `swallow-announce` и правки производительности (`docs/superpowers/plans/2026-11-26-perf-mobile.md`).
- Порядок файлов = порядок загрузки в одном блоке: `02-wardrobe.js` идёт после `02-tuning.js` и до `04-state.js`, поэтому `sugar`, `M`, `best`, `saveSugar` из поздних файлов трогать только внутри функций (TDZ).
- iOS 15 Safari: без `inset`, `:has()`, вложенного CSS, `structuredClone`. ES5-скрипт ошибок в начале `<body>` не трогать.
- Движение только от `dt` (`Math.exp(-dt * k)`), одинаково на 30 и 120 кадрах. `calm` выключает вспышки и толчки. В горячих циклах — без новых объектов, кроме частиц в существующем `parts`; без `clip`.
- Каждый текст через `t('key')` с `[ru, en]` в `STR`; не вызывать `t()` там, где есть локальная `t` (переименовать локальную).
- id вещей и ключи сохранений не переименовываются: `none, bow, crown, chef, horns`, `plain, stripes, dots, swirl, waffle, hearts, stars, tiger, cow, glaze, rainbow, bubbles, zigzag, galaxy`, `kus.hat`, `kus.skin`, `kus.m`, `kus.sugar`, `kus.best`.
- Сахар за забег и задания — только в забеге без читов (`player.cheated` / `run.cheated`).
- Меню и итоговая карточка влезают в 360×640 и 844×390 в обоих языках.
- Коммиты — локально на ветке; `git push` только после явного «да» Сеймура. После пуша — этап в трекер по `tools/tracker/README.md` со снимками «до» и «после».

## Review Focus

1. Испорченный `kus.own` (не JSON, не объект, массивы со строками-мусором) — игра грузится, переход делается заново, ничего не падает. Тест в задаче 1.
2. `kus.hat` / `kus.skin` указывают на вещь, которой нет в `own` (старый снимок Telegram, ручная правка) — выбор сбрасывается на бесплатную вещь, забег стартует. Тест в задаче 1.
3. Сахара ровно столько, сколько стоит вещь (после округления `PRICE_K`) — покупка проходит, банк становится 0. Тест в задаче 1.
4. Два быстрых нажатия «Ещё раз» или нажатие до выбора первой карты — сахар списывается не больше одного раза. Тест в задаче 4.
5. Смерти в «3 минутах» внутри одного забега — счётчик «застрявших» заданий растёт один раз за забег, а не за жизнь. Тест в задаче 3.

---

### Task 1: Каталог, что куплено, переход старых сохранений

**Files:**
- Create: `src/js/02-wardrobe.js`
- Modify: `src/js/02-tuning.js` (`HATS` без `need`, удалить `SKIN_PRICE`, `FREE_SKINS` оставить), `src/js/10-flow.js:47` (`skinOpen`), `src/js/17-boot.js:153-185` (загрузка), `src/js/17-boot.js` (`window.__kus`), `src/js/15-admin.js:148-154` (удалить `act.13`), `src/js/01-lang.js` (удалить `act.13`; имена новых вещей)
- Test: `tests/run.mjs`

**Interfaces:**
- Produces (в `02-wardrobe.js`):
  - `const PRICE_K = 1` — множитель цен (задача 9 подгоняет).
  - `const WARDROBE = { hat, skin, eyes, trail, tray }` — массивы `[id, базовая цена]` в порядке показа; цена `0` — бесплатно. Цены — из таблиц спецификации; первыми бесплатные: `hat: none`; `skin: plain, stripes, dots, swirl`; `eyes: none`; `trail: none`; `tray: choco`. Новые id: шапки `cap, pompom, wreath, tophat, witch, pirate, halo`; узоры `checks, marble, leopard, mosaic, foil, aurora`; глаза `sleepy, lashes, glasses, stars, cat`; след `crumbs, hearts, stars, bubbles, rainbow`; поднос `berry, mint, gold`.
  - `const OLD_HAT_NEED = { bow: 80, crown: 250, chef: 500, horns: 900 }` — только для перехода.
  - `priceOf(slot: string, id: string): number` — `0` для бесплатных, иначе `Math.max(500, Math.round(base * PRICE_K / 500) * 500)`.
  - `let own = { hat: [], skin: [], eyes: [], trail: [], tray: [] }` — только платные id.
  - `owns(slot, id): boolean` — бесплатная или в `own[slot]`.
  - `buyItem(slot, id): boolean` — если не куплено и `sugar >= priceOf`: списать, добавить, `saveOwn()`, `saveSugar()`, `true`; иначе `false` без изменений.
  - `saveOwn(): void` — `kus.own` = `JSON.stringify({ v: 1, ...own })` в `try`.
  - `loadOwn(bestStored: number): void` — читает `kus.own`; если нет или испорчен — переход: `skin` ← `M.open`, `hat` ← id с `OLD_HAT_NEED[id] <= bestStored`; затем при каждой загрузке объединяет `own.skin` с `M.open` (вещи только добавляются, неизвестные id и не-строки отбрасываются) и сохраняет.
  - `itemName(slot, id): string` — `t(slot + '.' + id)`; для шапок и узоров ключи `hat.*`, `skin.*` уже есть; новые ключи `eyes.*`, `trail.*`, `tray.*` и имена новых шапок и узоров — в `STR` на двух языках.
  - `cheapestUnowned(): { slot, id, price } | null`.
- `skinOpen(id)` → `owns('skin', id)`; `M.open` больше не пополняется (кроме строки 184 в `17-boot.js`, которую заменить на добавление в `own.skin` через `loadOwn`).
- В `window.__kus`: `WARDROBE, priceOf, owns, buyItem, get own()`.

- [ ] **Step 1: Написать падающий тест** `test('wardrobe: old saves keep what they had, a broken save does not break, buying is exact')`:
  - страница с `play: false`; в `localStorage`: `kus.best = '600'`, `kus.m = JSON.stringify({ seq: 3, act: [], open: ['waffle', 'tiger'] })`, `kus.hat = 'horns'`, без `kus.own`; `page.reload()`, ждать 600 мс.
  - `owns('hat','bow') && owns('hat','crown') && owns('hat','chef')`, `!owns('hat','horns')` (900 > 600), `owns('skin','waffle') && owns('skin','tiger')`, `!owns('skin','cow')`; `JSON.parse(localStorage['kus.own']).v === 1`.
  - повторная перезагрузка: `own` тот же (сравнить `JSON.stringify`).
  - выбор `kus.hat = 'horns'` не куплен → после загрузки `startGame()` даёт `player.hat === 'none'`.
  - `setSugar(priceOf('hat','cap'))`, `buyItem('hat','cap') === true`, `sugar === 0`, `kus.sugar === '0'`; второй `buyItem('hat','cap') === false`.
  - `setSugar(10)`: `buyItem('hat','halo') === false`, `sugar === 10`.
  - `kus.own = '{oops'` → reload → нет ошибок страницы, `owns('hat','bow')` снова из перехода.
  - в админ-панели нет кнопки с текстом `STR['act.13']` (ключа больше нет: проверить, что ни одна кнопка `#admA button` не содержит «Открыть все узоры»).
- [ ] **Step 2:** `node tests/run.mjs wardrobe` — FAIL (`priceOf` не определён).
- [ ] **Step 3:** Реализовать `02-wardrobe.js` по интерфейсу; подключить `loadOwn(stored)` в `17-boot.js` после чтения `kus.m`; заменить `skinOpen`; в `spawnPlayer` ставить шапку и узор только если `owns(...)`, иначе бесплатные; удалить `act.13` из `ACTIONS` и `STR`.
- [ ] **Step 4:** `npm run build && node tests/run.mjs wardrobe` — PASS; `node tests/run.mjs sugar` и `node tests/run.mjs album` — PASS (старые тесты могут упасть только на цене узора — это задача 2; если падают по другой причине, чинить здесь).
- [ ] **Step 5:** Коммит `Wardrobe: catalog, prices, owned items and the migration of old saves`.

### Task 2: Покупка шапок и узоров за сахар, строка «почти»

**Files:**
- Modify: `src/js/14-input.js:146-262` (шапки, узоры, `askSkin` → общий `ask`), `src/js/10-flow.js:106-138` (`cheapestSkin`, `nearText`), `src/index.html:89`, `src/style.css` (цена на фишке), `src/js/01-lang.js`
- Test: `tests/run.mjs` (обновить `sugar: earned in a clean run…`)

**Interfaces:**
- Consumes: `priceOf, owns, buyItem, itemName, cheapestUnowned` (задача 1).
- Produces: `let ask = null` — `{ slot, id }` первой из двух нажатий; `renderPick(slot: 'hat'|'eyes'|'trail'|'tray'): void` — ряд-фишки в контейнере `#hats`, `#eyes`, `#trail`, `#tray` (`role="radio"`, `data-slot`, `data-id`, у закрытой — цена в `<small class="pz">`, у спрошенной — `<small class="pz ask">`); `pickClick(slot, id): void` — общая логика: открыта → выбрать; закрыта и не хватает → `renderBank(t('shop.short', name, price, sugar))`; первое нажатие → `ask` и `t('shop.ask', name, price)`; второе → `buyItem`, выбрать, `Sfx.power()`, `haptic(20)`, `t('shop.got', name)`. Узоры остаются картинками (`renderSkins`), но идут через `pickClick('skin', id)`.
- Строки (заменяют `skin.buy/ask/short/got/why`, `hat.from`, `near.hat`, `near.skin`, `near.skinCan`, `mis.donePrize` удалить в задаче 3): `shop.buy` «Купить?» / “Buy?”; `shop.ask(name, n)`; `shop.short(name, n, have)`; `shop.got(name)`; `shop.why(n)` для `aria-label`; `near.need(name, n)` «До «${name}» не хватает ${n} сахара» / “${n} more sugar for “${name}””; `near.can(name)` «Хватает на «${name}»» / “Enough sugar for “${name}””.

- [ ] **Step 0:** До первой правки этой задачи — снимки «до»: `node tools/tracker/report.mjs shot file:///<worktree>/index.html .claude/shots/sugar-menu-before.png --width 390 --height 844` (раздел «Конфета» открыт) и итоговая карточка с сундуком `.claude/shots/sugar-over-before.png` того же размера.
- [ ] **Step 1:** Обновить тест `sugar: …two-tap shop`: вместо цены 150 — `priceOf('skin', id)`; `setSugar(priceOf(...) + 5000)` и ожидать остаток `5000`; `near` содержит `itemName` самой дешёвой некупленной вещи. Добавить `test('wardrobe: hats are bought with sugar in two taps, a new player has only «none»')`: свежий профиль (`returning: true`, без `kus.best ≥ 80`) — в `#hats` открыта только `none`; клик по `bow` при `sugar = 0` — не куплено, банк пишет «не хватает»; `setSugar(priceOf('hat','bow'))`, клик — `.pz.ask`, второй клик — `owns('hat','bow')`, `aria-checked="true"`, `localStorage['kus.hat'] === 'bow'` после `startGame()`.
- [ ] **Step 2:** `node tests/run.mjs wardrobe` и `node tests/run.mjs sugar` — FAIL.
- [ ] **Step 3:** Реализовать `renderPick`/`pickClick`; `renderHats` → `renderPick('hat')`; `renderSkins` берёт цену и замок из `priceOf/owns`; `nearText` использует `cheapestUnowned`; удалить `cheapestSkin`, `SKIN_PRICE` и строки, ставшие ненужными.
- [ ] **Step 4:** `npm run build && node tests/run.mjs wardrobe && node tests/run.mjs sugar && node tests/run.mjs menu && node tests/run.mjs lang` — PASS.
- [ ] **Step 5:** Коммит `Shop: hats and patterns for sugar, one two-tap purchase for every item`.

### Task 3: Задания платят сахаром, не застревают

**Files:**
- Modify: `src/js/02-tuning.js` (константы), `src/js/10-flow.js:31-95` (`rollMissions`, `mission`, `missionRows`), `src/js/10-flow.js` (`startGame`, `finishRun`), `src/js/10-stages.js:307` (`secondShift`), `src/js/01-lang.js`
- Test: `tests/run.mjs`

**Interfaces:**
- Produces: `const MIS_SUGAR = 300`, `const MIS_CAP = { time: 150, combo: 8, mass: 1600 }`, `const MIS_IDLE = 5` в `02-tuning.js`; `misReward(m): number` = `Math.round(MIS_SUGAR * (1 + 0.6 * (m.c | 0)))`; у задания новые поля `c` (круг `Math.floor(i / MTYPES.length)`), `at` (`got` на старте забега), `idle` (забегов подряд без продвижения), `paid` (выплаченный сахар); `run.mis: number[]` — круги заданий, выполненных в этом забеге (для `tools/sugar-curve.mjs`).
- Правила: цель `need = min(MIS_CAP[type] ?? ∞, round(base × (1 + c × 0.6)))`, и при загрузке старые задания с `need` выше потолка урезаются. Выполнение: `earn(misReward(m))` вместо `earn(15)`, без `M.open.push`, лента `t('mis.doneSugar', n)` «Задание выполнено: +${n} сахара» / “Mission done: +${n} sugar”, строка задания `t('mis.paid', n)`; старые `m.prize` показываются как раньше. На старте забега и второй смены `m.at = m.got`. В `finishRun` только для чистого забега: `m.idle = m.got > m.at ? 0 : (m.idle | 0) + 1`, задания с `idle >= MIS_IDLE` уходят, новые добираются `rollMissions` при следующем старте.

- [ ] **Step 1:** Тесты:
  - `missions: a done mission pays sugar and opens no pattern`: `t3`, `M.act = [{ type: 'bites', need: 2, got: 0, c: 1 }]`, два `mission('bites', 1)` → `run.sugar` вырос на `misReward` = 480 (плюс сахар за укусы), `own.skin` и `M.open` не изменились, лента содержит «+480».
  - `missions: time, combo and mass stop growing at their caps`: `M.seq = 13 * 6`, `M.act = []`, `rollMissions()` до тех пор, пока не выпадут `time`, `combo`, `mass` → их `need` ≤ 150, 8, 1600; старое задание `{ type: 'time', need: 260 }` после перезагрузки — `need === 150`.
  - `missions: one stuck for 5 runs is replaced, deaths inside a run count once`: задание `hedge` с `got: 0`; пять забегов `t3` с двумя смертями в каждом (`player.alive = false` через путь `die`) и концом по времени — после пятого `hedge` нет в `M.act`, в `M.act` три задания; после четырёх забегов оно ещё на месте; забег с читами `idle` не увеличивает.
- [ ] **Step 2:** `node tests/run.mjs missions` — FAIL.
- [ ] **Step 3:** Реализовать по интерфейсу.
- [ ] **Step 4:** `npm run build && node tests/run.mjs missions && node tests/run.mjs sugar && node tests/run.mjs lang` — PASS.
- [ ] **Step 5:** Коммит `Missions: pay sugar instead of patterns, capped targets, a stuck mission makes way`.

### Task 4: Повторный сундук

**Files:**
- Modify: `src/index.html:144-150` (`#sweet`), `src/js/10-flow.js:140-180` (`renderSweet`, клик по `#chestRow`), `src/style.css`, `src/js/01-lang.js`
- Test: `tests/run.mjs`

**Interfaces:**
- Produces: в `#sweet` после `#chestRow` — `<button id="chestAgain" class="hidden">` и `<p id="chestOdds" class="hidden">`; `run.chestBase` (база выбора), `run.rerolled` (повтор уже был), `rerollAsk` (первое нажатие). Цена повтора = `3 × run.chestBase`.
- Правила: кнопка и строка видны только после выбора карты, если `!run.rerolled && sugar >= цена`. Первое нажатие — текст `t('chest.againAsk', n)` «Точно? −${n} сахара»; второе — списать, `saveSugar()`, перемешать те же три приза, вернуть карты в «?», `run.chest = true`, `run.rerolled = true`, спрятать кнопку и строку. Текст кнопки `t('chest.again', n)` «Ещё раз — ${n}» / “Again — ${n}”; строка `t('chest.odds')` «Каждая карта — 1 из 3: ×1, ×2, ×5» / “Each card is 1 in 3: ×1, ×2, ×5”. Без мигания и анимации зова.

- [ ] **Step 1:** Тест `chest: one paid reroll, the price is three times the base, never twice`: конец забега `t3` с `run.sugar = 200`, база — из `run.chestBase`; до выбора карты `#chestAgain` скрыта; выбор карты; `setSugar(1000)` после выплаты; два быстрых клика по `#chestAgain` подряд в одном `evaluate` → списано ровно `3 × base` (второй клик только подтверждает, третий ничего не делает); карты снова «?», выбор платит один из призов; после этого `#chestAgain` скрыта; при `sugar < 3 × base` кнопка не показывается. Раскладка: та же карточка на 360×640 и 844×390 (`touch: true`, оба языка) — `#chestAgain` и `#chestOdds` внутри `#over .card` и не перекрывают кнопки (по `getBoundingClientRect`).
- [ ] **Step 2:** `node tests/run.mjs chest` — FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm run build && node tests/run.mjs chest && node tests/run.mjs sugar && node tests/run.mjs lang` — PASS.
- [ ] **Step 5:** Коммит `Chest: one reroll for three times the base, odds shown`.

### Task 5: Глаза

**Files:**
- Modify: `src/js/06-softbody.js:39-40` (`this.eyes = o.eyes || 'none'`), `src/js/12-draw-face.js:378-480` (`drawFace`), `src/js/10-flow.js` (`spawnPlayer`, сохранение `kus.eyes`), `src/js/17-boot.js` (загрузка `kus.eyes`), `src/js/04-state.js` (`chosenEyes = 'none'`), `src/index.html` (ряд `#eyes` в `secLookB`), `src/js/14-input.js` (`renderPick('eyes')`, сводка в `renderSecs`), `src/js/01-lang.js`
- Test: `tests/run.mjs`

**Interfaces:**
- Consumes: `renderPick`, `pickClick` (задача 2).
- Рисунок только в ветке открытого глаза (не при моргании, укусе-боли, серии ×5+ с сердечками, жевании), кроме очков: `sleepy` — верхнее веко цвета `b.pal.base` закрывает верх глаза с линией века; `lashes` — три коротких штриха над внешним краем; `stars` — зрачок пятиконечной звездой вместо круга; `cat` — зрачок вертикальной щелью вдоль взгляда; `glasses` — после цикла по глазам две окружности радиусом `er × 1.35` и перемычка, рисуются при любом состоянии глаз. Без новых градиентов. Только игрок (`spawnPlayer`), у ботов `none`.

- [ ] **Step 1:** Тест `wardrobe: every eye style draws, blinks and grows in a streak without errors`: для каждого id из `WARDROBE.eyes` — купить (`setSugar`, `buyItem`), выбрать через `pickClick('eyes', id)`, новый забег, `player.eyes === id`; кадры `render()` при `blink > 0`, `hurtT > 0`, `combo = 5, comboT = 1`, `lod` 0 и 2 — без ошибок страницы; `localStorage['kus.eyes'] === id`; боты `eyes === 'none'`.
- [ ] **Step 2:** `node tests/run.mjs eye` — FAIL.
- [ ] **Step 3:** Реализовать; ряд «Глаза» в разделе «Конфета» под «Шапкой».
- [ ] **Step 4:** `npm run build && node tests/run.mjs eye && node tests/run.mjs menu` — PASS. Посмотреть каждый стиль глазами: снимки игрока крупно (`setCam`) в `.claude/shots/`.
- [ ] **Step 5:** Коммит `Wardrobe: eyes`.

### Task 6: След

**Files:**
- Modify: `src/js/06-softbody.js` (`this.trail = o.trail || 'none'`, `this.trailAcc = 0`), `src/js/08-food-particles.js` (`emitTrail`), `src/js/10-flow.js` (`update` для игрока, `spawnPlayer`, `kus.trail`), `src/js/13-draw-body.js:607` (рисование частиц), `src/js/17-boot.js`, `src/js/04-state.js` (`chosenTrail = 'none'`), `src/index.html` (`#trail`), `src/js/14-input.js`, `src/js/01-lang.js`
- Test: `tests/run.mjs`

**Interfaces:**
- Produces: `emitTrail(b, dt): void` — вызывается раз в кадр для живого игрока; при `b.trail !== 'none'`, `lod < 2` и скорости > 40 копит `b.trailAcc += dt * (lod ? 7 : 14)` и на каждую единицу кладёт в `parts` частицу `{ x, y, vx, vy, r, t: 0, T: 0.9, c, sh }` позади тела (`− направление движения × Rs × 0.9`, малый случайный разброс скорости). `sh`: 1 крошки (`flesh(pal)`), 2 сердечки (`#ff7aa2`), 3 звёздочки (`#ffd23f`), 4 пузырьки (обводка `rgba(200,230,255,.8)`), 5 радуга (`hsl` по `time`). Частицы без `sh` рисуются как раньше.
- Не еда, не подбираются, только у игрока; на `lod` 2 следа нет. Ряд «След» под «Глазами», сводка раздела «Конфета» (`renderSecs`) называет выбранный след, как шапку.

- [ ] **Step 1:** Тест `trail: only while moving, bounded, gone at lod 2`: купить и выбрать `stars`, забег; стоя на месте 2 с — частиц с `sh` 0; движение 3 с (`input`/`P.tx`) — частицы с `sh === 3` есть и их одновременно не больше 16; `setLod(2)` и ещё 2 с — новых нет; `render()` без ошибок для всех пяти видов.
- [ ] **Step 2:** `node tests/run.mjs trail` — FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm run build && node tests/run.mjs trail && node tests/run.mjs soak && node tests/run.mjs menu` — PASS.
- [ ] **Step 5:** Коммит `Wardrobe: trails`.

### Task 7: Поднос

**Files:**
- Modify: `src/js/11-draw-world.js:23-57` (`TRAYS`, `ensurePattern`, `setTray`), `src/js/04-state.js` (`chosenTray = 'choco'`), `src/js/17-boot.js`, `src/index.html` (`#tray`), `src/js/14-input.js`, `src/js/01-lang.js`
- Test: `tests/run.mjs`

**Interfaces:**
- Produces: `const TRAYS = { choco, berry, mint, gold }` — по 7 цветов для `ensurePattern` (фон, три точки склона, две точки верха, блик); `choco` — нынешние значения точно. `setTray(id): void` — `chosenTray = id`, `tilePat = null`, `bgT = 0`, `localStorage['kus.tray']`. Выбор подноса сразу виден в мире за меню. Ряд «Поднос» последним в разделе «Конфета»; сводка `renderSecs` называет поднос, если он не шоколадный.
- Читаемость: тёмный фон остаётся тёмным (яркость фона подноса не выше нынешней шоколадной более чем вдвое), еда, боты, раны видны.

- [ ] **Step 1:** Тест `tray: switching rebuilds the pattern, the menu world shows it, the choice is kept`: купить `mint`, `pickClick('tray','mint')` → `chosenTray === 'mint'`, пиксель фона в углу экрана после `render()` отличается от `choco`; reload → `mint`; некупленный `gold` в `kus.tray` → после загрузки `choco`.
- [ ] **Step 2:** `node tests/run.mjs tray` — FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm run build && node tests/run.mjs tray && node tests/run.mjs menu && node tests/run.mjs lang` — PASS. Снимки поля на каждом подносе 360×640 с ботами и едой — проверить читаемость глазами.
- [ ] **Step 5:** Коммит `Wardrobe: trays`.

### Task 8: Новые шапки и узоры

**Files:**
- Modify: `src/js/12-draw-face.js:618+` (`drawHat`: `cap, pompom, wreath, tophat, witch, pirate, halo`), `src/js/02-tuning.js:56-79` (`SKINS` дополнить, `skinTile`: `checks, marble, leopard, mosaic, foil, aurora`), `src/js/01-lang.js`
- Test: `tests/run.mjs`

**Interfaces:**
- Шапки — в той же системе координат, что `bow`…`horns` (`ctx.scale(s, s)`, `lineWidth 0.09`), с обводкой; `halo` — кольцо над головой, без заливки тела. Узоры — плитка 256×256 полупрозрачными `lite`/`dark` (или своими полупрозрачными цветами для `foil`, `aurora`), `span` по образцу.
- Новые узоры добавляются в конец `SKINS` (бесплатные первые четыре не сдвигаются).

- [ ] **Step 1:** Тест `wardrobe: every hat and pattern draws`: для каждой шапки из `WARDROBE.hat` — `player.hat = id`, `render()` без ошибок; для каждого узора — `skinTile(id).c` имеет непрозрачные пиксели (`getImageData` хотя бы один `alpha > 0`) и `render()` с `player.skin = id` без ошибок.
- [ ] **Step 2:** `node tests/run.mjs draws` — FAIL (нет `cap`).
- [ ] **Step 3:** Нарисовать.
- [ ] **Step 4:** `npm run build && node tests/run.mjs draws && node tests/run.mjs menu` — PASS. Снимки каждой новой вещи на игроке крупно, в двух вкусах.
- [ ] **Step 5:** Коммит `Wardrobe: seven hats and six patterns`.

### Task 9: Замер темпа и цены

**Files:**
- Create: `tools/sugar-curve.mjs`, `docs/sugar.md`
- Modify: `src/js/02-wardrobe.js` (`PRICE_K`), при необходимости `src/js/02-tuning.js` (`MIS_SUGAR`), `CLAUDE.md`, `README.md`

**Interfaces:**
- `node tools/sugar-curve.mjs [chains=8] [hours=35] [diff=normal] [weak]`, `PAR`, `OUT=file.json`, `HTML=file` — как у `tools/album-curve.mjs`. Одна цепочка = один профиль в одной вкладке, забеги подряд в порядке `free, free, t3, free, daily` по кругу (60/20/20), автопилот `newAI()` (слабый — те же множители, что в `album-curve`), время шагами 1/60 с при паузе; «Конфета дня» — каждый забег на свой день (подмена `Date` в `addInitScript`); перезагрузка страницы раз в 20 забегов (сохранения в `localStorage` остаются). Свободный забег — до смерти или до лимита 900 с, после победы — «Вторая смена».
- На каждый забег пишется `{ mode, min, banked, mis: run.mis, chestEV }`, где `chestEV = base × 8 / 3`. Покупки не влияют на игру, поэтому цепочка ничего не покупает, а время до коллекции считается после замера: доход = `banked − Σ misReward(c при MIS_SUGAR в сборке) + Σ misReward(c при пробном MIS_SUGAR) + chestEV`, накопленный по игровому времени; «полная коллекция» — когда накоплено `Σ priceOf` всех платных вещей при пробном `PRICE_K`; «первая покупка» — когда накоплено `min priceOf`. Вывод: медиана и p25–p75 по цепочкам для `PRICE_K` от 0.5 до 2.0 шагом 0.1 и для `MIS_SUGAR` из `MIS=300,200,…` (переменная окружения).
- Скорость: ~16× реального времени на вкладку (замер в спецификации) — 35 часов цепочки ≈ 2,2 часа, запускать в фоне.

- [ ] **Step 1:** Написать инструмент; прогнать короткий запуск `node tools/sugar-curve.mjs 2 1` — без ошибок страницы, `run.mis` приходит, сумма `banked` положительна.
- [ ] **Step 2:** Полный запуск в фоне: `OUT=normal.json node tools/sugar-curve.mjs 8 35 normal` и `OUT=weak.json node tools/sugar-curve.mjs 8 35 normal weak`.
- [ ] **Step 3:** Выбрать `PRICE_K` (цены округляются до 500) так, чтобы медиана полной коллекции у обычного автопилота была 27–33 часа. Если при этом первая покупка позже 15 минут — поднять `MIS_SUGAR` (ранний доход растёт быстрее позднего), пока первая покупка не станет ≤ 15 мин, и заново подогнать `PRICE_K`. Если оба условия не сходятся — остановиться и написать Сеймуру с цифрами, список цен не менять.
- [ ] **Step 4:** Вписать `PRICE_K` (и `MIS_SUGAR`, если менялся), `npm test` — весь набор PASS.
- [ ] **Step 5:** `docs/sugar.md`: таблица замера из спецификации, итог `sugar-curve` (часы до коллекции, первая покупка, обычный и слабый), выбранные `PRICE_K`/`MIS_SUGAR`, как перемерять. `CLAUDE.md`: строка `02-wardrobe` в таблице файлов; ключи `kus.own`, `kus.eyes`, `kus.trail`, `kus.tray`; команда `node tools/sugar-curve.mjs …`; решение «темп гардероба — 30 часов, меняется только `PRICE_K`/`MIS_SUGAR` и только по замеру». `README.md`, раздел «Between runs»: шапки, глаза, след и поднос за сахар, задания платят сахаром, повторный сундук.
- [ ] **Step 6:** Снимки «после» тех же экранов, что «до» (раздел «Конфета» 390×844, итоговая карточка с сундуком). Коммит `Sugar curve: prices tuned to 30 hours of play`. Пуш и этап в трекер — только после «да» Сеймура.
