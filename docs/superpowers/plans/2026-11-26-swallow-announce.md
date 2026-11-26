# Объявления за глотки подряд и «тяжёлый» укус — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Большое объявление через центр экрана за глотки целиком подряд («Двойной кусь!» … «Монстр кусь!!!»), «тяжёлый» укус в серии (раздув, крупные куски, хруст) и два новых звука, сделанных earshot.

**Architecture:** Новый файл `src/js/10-announce.js` держит счётчик цепочки глотков, лестницу и слой страницы `#announce` (DOM, анимация только `transform`/`opacity`, время реальное). «Тяжёлый» укус — функция в `10-streak.js`, вызываемая из `doBite`; раздув — только при рисовании своей конфеты. Звуки `Sfx.announce`/`Sfx.crunch` — синтез в `05-sound.js` плюс записи earshot через `tools/sfx.mjs`, который научится сохранять уже встроенные записи без их исходников.

**Tech Stack:** Canvas 2D, ванильный JS одним блоком (`tools/build.mjs`), Web Audio, playwright-core (тесты и замеры), earshot (Python, вне репозитория), ffmpeg.

**Spec:** `docs/superpowers/specs/2026-11-26-swallow-announce-design.md`

## Global Constraints

- Никаких стоп-кадров и пауз игрового времени; своё замедление объявление не добавляет, только встаёт на замедление глотка (`slowT`/`slowLen`/`slowDip`).
- Всё движение от `dt` (`Math.exp(-dt * k)`, не `*= 0.9` за кадр).
- `calm`: объявление без удара, дрожания, свечения и салюта; раздув меньше, без толчков камеры; хруст остаётся.
- Баланс не меняется: масса и сахар от укуса и глотка те же; объявление ничего не начисляет.
- Объявление: окно цепочки **5 с** между глотками (подстройка 4–6 с только по Task 5); ступени 2, 3, 4, 5+; Торт-босс (`B.boss`) не считается и обрывает цепочку; работает во всех режимах и в бою с Тортом; не в мире за меню (`state !== 'play'`) и не за окном итогов; с читами показывается.
- Слова: `ann.2` «Двойной кусь!» / «Double bite!», `ann.3` «Тройной кусь!!» / «Triple bite!!», `ann.4` «Обжорство!!!» / «Gluttony!!!», `ann.5` «Монстр кусь!!!» / «Monster bite!!!». Подстрочника нет.
- Цвет / обводка по ступеням: 2 `#fff1dc`/`#c8264f`, 3 `#ffd23f`/`#a3361a`, 4 `#ff9a3c`/`#5a1020`, 5 `#ff4f7b`/`#2a0812`; масштаб шрифта ×1, ×1,12, ×1,24, ×1,36.
- Влёт ~0,18 с с масштаба ~2,4 до 1 с перелётом, наклон ~−3°, всего ~1,4 с; с ×4 свечение на весь экран и салют посыпки у своей конфеты (частиц по `lod`).
- После влёта надпись не закрывает свою конфету с подписью ×N и не налезает на `#dash`, `#dodge`, `#score`, `#board`, `#pauseBtn`, `#mute`; влезает в 360×640 и 844×390 на обоих языках.
- «Тяжёлый» укус только в `doBite` своей конфеты при `combo ≥ 2`, не на глотке и не на бонусе; `crunch` заменяет `chomp` на таких укусах, `ding(step)` остаётся.
- Новые записи звуков вместе ≤ 30 КБ base64; старые записи остаются байт в байт.
- Страница одна, без внешних скриптов; синтаксис и CSS не новее iOS 15 Safari; весь текст через `t()` с обоими языками; не вызывать `t()` там, где есть локальная `t`.
- Каждая задача заканчивается `npm test` (всё зелёное) и коммитом `src/` вместе с собранным `index.html`. Работа идёт в ветке `swallow-announce` от `main`.

## Review Focus

- Пауза посреди объявления (меню паузы, сворачивание вкладки): после продолжения надпись не висит на экране навсегда и не стартует заново.
- Поворот телефона посреди объявления (360×640 → 844×390): надпись перестраивается под новую ширину и полосу над конфетой, не вылезает за край.
- Два глотка в одном кадре (две крошки-конфеты сразу): ступень доходит до 3 без ошибок, показывается старшая.
- Смерть, пока объявление на экране: надпись сразу уходит, цепочка обнуляется, на итоговой карточке её нет.
- Звук до первого касания на iOS (AudioContext ещё не запущен, записи не декодированы): `Sfx.announce`/`Sfx.crunch` молча ничего не делают, без исключений.

---

### Task 1: Звуки `announce` и `crunch` через earshot

**Files:**
- Modify: `src/js/05-sound.js` (новые методы после `wrapPay`), `tools/sfx.mjs`, `tools/sfx.json`
- Generated: `src/js/05-sound-data.js`
- Test: `tests/run.mjs` (тест `sound: every effect plays without throwing`)

**Interfaces:**
- Produces: `Sfx.announce(step: 2|3|4|5)` — праздничный звук ступени; `Sfx.crunch(k: 1..5)` — хруст укуса серии. Оба возвращают `undefined`, молча выходят при `!this.ok()`, сначала пробуют запись (`this.play('announce', v, rate)` / `this.play('crunch', v, rate)`), иначе синтез.

- [ ] **Step 0: Ветка.** `git switch main && git pull && git switch -c swallow-announce`.

- [ ] **Step 1: Падающий тест.** В список `calls` теста звуков добавить `['announce', [2]], ['announce', [5]], ['crunch', [1]], ['crunch', [5]]`. В конце теста: `S.on = false` (звук выключен, как на iOS до касания) — четыре новых вызова не бросают и `S.play` не вызывается; затем вернуть `S.on`.

- [ ] **Step 2: Run** `npm run build && node tests/run.mjs "sound:"` — Expected: FAIL `announce (takes): S.at(...)[m] is not a function`.

- [ ] **Step 3: Синтез в `05-sound.js`.**
  - `announce(step)`: восходящее арпеджио треугольником от 392 Гц по полутонам `[0, 4, 7, 12, 16]`, нот `min(step + 1, 5)` через 0,07 с, пик ~0,18; при `step ≥ 4` плюс низкий удар `sine` 98 → 49 Гц, 0,35 с. Высота записи: `rate = 2 ** ([0, 0, 0, 2, 4, 7][step] / 12)`, громкость `0.8 + 0.1 * (step - 2)`.
  - `crunch(k)`: полосовой шум `hiss` ~1800 Гц → ниже с ростом `k`, длина `0.09 + 0.03 * k`, громкость `0.35 + 0.08 * k`; запись — `rate = 1 + 0.04 * (k - 1)`, громкость `0.7 + 0.075 * k`.

- [ ] **Step 4: Run** `npm run build && node tests/run.mjs "sound:"` — Expected: PASS (событий нет в `SFX_DATA`, звучит синтез).

- [ ] **Step 5: Поставить earshot вне репозитория.**
  `py -3.11 -m venv C:\Users\seymurglv\tools\earshot-venv`, затем `C:\Users\seymurglv\tools\earshot-venv\Scripts\pip install "earshot @ git+https://github.com/Leonxlnx/earshot"`. Проверка: `...\Scripts\earshot make "a soft success sound" -o %TEMP%\es-check.wav` создаёт файл.

- [ ] **Step 6: Сделать записи.** Папка `C:\Users\seymurglv\tools\kus-sfx-local\variants\`. Для каждого события — 3 кандидата разных дизайнов earshot (`earshot sounds` / `earshot make` по описаниям: `announce` — «short bright celebratory cartoon game fanfare sting, sweet, under one second»; `crunch` — «crunchy hard candy bite, sugar shell cracking, short»). Файлы назвать `announce__v1.wav … announce__v3.wav`, `crunch__v1.wav …`, рядом `candidates.json`: `{"announce": [["<design1>", 1], ["<design2>", 1], ["<design3>", 1]], "crunch": [...]}` — порядок совпадает с номерами `vN`. Выбор лучшего дизайна — по описаниям и измерениям earshot (пик в начале, длина, «clean»).

- [ ] **Step 7: `tools/sfx.mjs` сохраняет старые записи.** Если события из `sfx.json` нет в `candidates.json` папки `SFX_SRC`, его `g` и `r` берутся из текущего `src/js/05-sound-data.js` без изменений (прочитать файл и выполнить как `new Function(text + ';return SFX_DATA')()`), в выводе строка `kept`. Выравнивание громкости — только для новых. В `ARGS` добавить `announce: [2], crunch: [3]`.

- [ ] **Step 8: `tools/sfx.json`.** Добавить `"announce": {"sound": "<выбранный дизайн>", "max": 0.9, "trim_db": 0}`, `"crunch": {"sound": "<выбранный>", "max": 0.35, "trim_db": 0}`. Поле `src` не трогать (папка Руслана/Сеймура на другом компьютере).

- [ ] **Step 9: Собрать данные.** `SFX_SRC=C:\Users\seymurglv\tools\kus-sfx-local node tools/sfx.mjs` — Expected: 12 строк `kept`, две новые с размером; итог новых ≤ 30 КБ. `git diff --stat src/js/05-sound-data.js` — только добавления, старые блоки не изменены (проверить `git diff src/js/05-sound-data.js | grep '^-' | grep -v '^---'` пусто).

- [ ] **Step 10: Run** `npm test` — Expected: PASS всё, в тесте звуков `withTakes === expected` с новыми событиями.

- [ ] **Step 11: Commit** — `git add tools/sfx.mjs tools/sfx.json src/js/05-sound.js src/js/05-sound-data.js index.html tests/run.mjs && git commit -m "Sound: announce and crunch from earshot; sfx.mjs keeps takes it has no sources for"`.

### Task 2: Цепочка глотков и объявление

**Files:**
- Create: `src/js/10-announce.js`
- Modify: `src/js/07-bites.js` (`swallowWhole`, ветка `A.isPlayer`), `src/js/10-streak.js` (`streakClear`, `addStamp`), `src/js/10-stages.js` (`bossDown`, `secondShift`), `src/js/10-flow.js` (`die`, конец забега), `src/js/17-boot.js` (`frame`, `window.__kus`), `src/js/01-lang.js` (`STR`), `src/index.html`, `src/style.css`
- Test: `tests/run.mjs`

**Interfaces:**
- Consumes: `Sfx.announce(step)` (Task 1).
- Produces:
  - `const ANN = { win: 5, life: 1.4, inT: 0.18, glow: 4 }`;
  - `const ann = { n: 0, at: -99, step: 0, t: 0 }` — `n` глотков в цепочке, `at` игровое `time` последнего глотка, `step` показанная ступень (0 — ничего), `t` реальное время показа;
  - `annSwallow(B)` — вызывается в `swallowWhole` для своей конфеты после `onStreakBite`; при `B.boss` — `annReset()` и выход; иначе `ann.n = time - ann.at <= ANN.win ? ann.n + 1 : 1`, `ann.at = time`, при `n ≥ 2` — `annShow(Math.min(n, 5))`;
  - `annShow(step)` — слово `t('ann.' + step)`, класс ступени, `ann.t = 0`, `Sfx.announce(step)`; ничего не делает при `state !== 'play'` или `!runActive`;
  - `annReset()` — `n = 0`, `at = -99`, скрыть надпись;
  - `annTick(rdt)` — реальное время из `frame`, ведёт анимацию и скрывает по `ANN.life`;
  - `window.__kus.ann` (геттер на `ann`), `ANN`, `annShow`.
- DOM: `<div id="announce" aria-hidden="true"><b></b></div>` сразу после `#vig`; `#announce` — `position:fixed`, `z-index:2`, `pointer-events:none`; классы `on`, `s2`…`s5`.

- [ ] **Step 1: Падающие тесты** (помощник `gulp()` в тестах: крошечный бот `k.spawnBot(20)` у рта игрока массы 400, кадры до роста `P.stats.kills`, как в тесте `streak, jelly wobble and swallowing whole`):

```js
test('announce: swallows in a row climb the ladder; a pause over 5 s starts again', ...)
  // gulp ×2 → #announce b === 'Двойной кусь!', класс on
  // gulp ×3 → 'Тройной кусь!!'; ×4 → 'Обжорство!!!'; ×6 → 'Монстр кусь!!!' и k.ann.step === 5
  // 5,2 с игрового времени без глотка, gulp → k.ann.n === 1, надпись не появилась заново
  // через 1,6 с реального времени после показа надпись скрыта (нет класса on)
test('announce: English words', ...) // open({ locale: 'en-US' }): 'Double bite!' … 'Monster bite!!!'
test('announce: the boss does not count and breaks the chain; chains work in the boss fight; death, a new run and the second shift reset it', ...)
  // STG: босс на поле, gulp ×2 → 'Двойной кусь!' (работает в бою)
  // gulp, затем глоток Торта (B.mass = 60, как в тесте stages: beating the boss) → k.ann.n === 0, нет нового показа
  // gulp; die → надпись скрыта, k.ann.n === 0; startGame → 0; secondShift → 0
test('announce: not behind the menu or the end card; two swallows in one frame; a pause holds it; the stamp waits; cheats still show it', ...)
  // state 'menu': k.annShow(3) ничего не показывает
  // две крошки у рта в одном кадре → k.ann.step === 3, ошибок нет
  // смерть при видимой надписи → итоговая карточка без #announce.on
  // annShow(2), k.pause(true) на 3 с реального времени → надпись на месте и ann.t не вырос; pause(false), 1,6 с → скрыта
  // глоток в серии при видимой надписи → k.stamps пуст
  // k.CHEAT.heal = true, gulp ×2 → 'Двойной кусь!'
```

- [ ] **Step 2: Run** `npm run build && node tests/run.mjs "announce:"` — Expected: FAIL (нет `#announce`).

- [ ] **Step 3: Реализовать `10-announce.js`, разметку, CSS и `STR`** по Interfaces. Анимация влёта, наклона и таяния — CSS-ключевые кадры на `#announce b` (перезапуск: снять класс, `void el.offsetWidth`, добавить), длительность `ANN.life`; `@media (prefers-reduced-motion:reduce)` и `calm` — простое проявление/таяние. Пауза: `annTick` не идёт и CSS-анимация ставится на паузу (`animation-play-state`), пока игра на паузе. Сброс цепочки — в `streakClear` (новая жизнь и забег), `die`, `bossDown`, `secondShift`. Штамп серии от того же глотка не показывается, пока `ann.step > 0` (проверка в `addStamp`).

- [ ] **Step 4: Run** `npm test` — Expected: PASS всё.

- [ ] **Step 5: Commit** — `git commit -m "Announce: swallows in a row climb Двойной кусь! to Монстр кусь!!!, the boss does not count"` (с `src/`, `index.html`, `tests/run.mjs`).

### Task 3: Объявление на телефоне — размер, место, свечение и салют

**Files:**
- Modify: `src/js/10-announce.js`, `src/style.css`, `src/js/17-boot.js` (`resize` вызывает `annFit()`)
- Test: `tests/run.mjs`

**Interfaces:**
- Consumes: `annShow`, `ann` (Task 2); `parts`, `lod`, `player`, `cam`, `focusOffset()`, `W`, `H`.
- Produces: `annFit()` — пересчёт размера шрифта и места надписи; `ann.top` — экранный `y` верха своей конфеты с подписью ×N, по которому ставится надпись (для тестов).

- [ ] **Step 1: Падающие тесты:**

```js
test('announce: fits 360x640 and 844x390 in both languages, clear of the buttons, the HUD and the player', ...)
  // для ru-RU и en-US, для 360x640 и 844x390 (touch), игрок массы 400 и 2500:
  // k.annShow(5); подождать 0,3 с; r = #announce b getBoundingClientRect()
  // r внутри экрана с полями ≥ 8 px; нет пересечения с #dash, #dodge, #score, #board, #pauseBtn, #mute
  // r.bottom <= k.ann.top
test('announce: a phone turned mid-announcement refits it', ...)
  // 360x640, annShow(5), setViewportSize(844x390), 0,3 с → те же проверки границ
test('announce: glow and sprinkles from step 4, none in calm', ...)
  // annShow(3): нет класса glow, parts не выросли; annShow(4): класс glow, parts выросли
  // open с emulateMedia reducedMotion 'reduce': annShow(5) → нет glow, parts не выросли
```

- [ ] **Step 2: Run** `npm run build && node tests/run.mjs "announce:"` — Expected: новые FAIL.

- [ ] **Step 3: Реализовать.** Шрифт: от базового размера ступени уменьшать, пока ширина слова (мерить `canvas.measureText` тем же шрифтом, без чтения раскладки в кадре) ≤ `W - 32`, и пока высота влезает в полосу от низа `#score`/`#stage` до `ann.top - 8`; центр надписи — середина полосы, на 360×640 это около 36% высоты. `annFit` вызывается в `annShow` и в `resize`. С `step ≥ ANN.glow` и без `calm`: класс `glow` (радиальный градиент на `#announce::before`, только `opacity`-анимация), салют из частиц `parts` у своей конфеты: `24 + 8 * step` при `lod 0`, вдвое меньше при `lod 1`, вчетверо при `lod 2`.

- [ ] **Step 4: Run** `npm test` — Expected: PASS всё.

- [ ] **Step 5: Посмотреть глазами.** Скриншоты 360×640 и 844×390, русский и английский, `annShow(2)` и `annShow(5)` (Playwright-скрипт вне репозитория) — слово читается, не мылится, не закрывает конфету.

- [ ] **Step 6: Производительность.** Тот же скрипт на 390×844, dpr 3, CPU замедлен ×4 через CDP (`Emulation.setCPUThrottlingRate`): 300 кадров `update`+`render` без объявления и 300 кадров с `annShow(5)` каждые 1,5 с. Expected: худший кадр и среднее время скрипта с объявлением не больше чем на 10% хуже; `k.lod` не опустился из-за объявления. Числа — в сообщение коммита.

- [ ] **Step 7: Commit** — `git commit -m "Announce: fits phones in both languages above the player, glow and sprinkles from step 4"`.

### Task 4: «Тяжёлый» укус

**Files:**
- Modify: `src/js/10-streak.js` (новое `HEAVY`, `heavyBite`), `src/js/07-bites.js` (`doBite`: гоблины начинки и звук), `src/js/13-draw-body.js` (рисование своей конфеты), `src/js/06-softbody.js` или `updateBlob` (затухание `swell`), `src/js/17-boot.js` (`HEAVY` в `__kus`)
- Test: `tests/run.mjs`

**Interfaces:**
- Consumes: `Sfx.crunch(k)` (Task 1).
- Produces: `const HEAVY = { on: true, swell: [0, 0, 0.07, 0.1, 0.13, 0.16] }` (индекс — `k`, `on` только для тестов); поле `b.swell` (0 у всех, у своей конфеты растёт на укусе серии и затухает как `Math.exp(-dt * 7)`); `heavyBite(A, k)` → число множитель размера гоблинов начинки `1 + 0.15 * (k - 1)`, ставит `A.swell = max(A.swell, HEAVY.swell[k])` (в `calm` — вдвое меньше).

- [ ] **Step 1: Падающие тесты:**

```js
test('heavy bite: a streak bite swells the candy and crunches; swallows and bonuses do not; mass gain is unchanged', ...)
  // укусы по большой жертве как в тесте streak: label, fuse...; после 3-го укуса P.swell > 0.05, P.Rs и P.mass те же, что без swell
  // перехват Sfx.crunch/Sfx.chomp: на укусах 2..5 crunch вызван, chomp — нет; на 1-м укусе chomp
  // глоток в серии (gulp) и подбор бонуса в серии: P.swell не вырос, crunch не вызван
  // HEAVY.on = false и true на одинаковой жертве и одинаковом combo: прибавка массы от 5-го укуса одинакова (±0.001)
  // через 1 с после укуса P.swell < 0.005
```

- [ ] **Step 2: Run** `npm run build && node tests/run.mjs "heavy bite"` — Expected: FAIL.

- [ ] **Step 3: Реализовать.** В `doBite` для `A.isPlayer && A.combo >= 2 && HEAVY.on`: `const g = heavyBite(A, Math.min(A.combo, 5))`; число гоблинов начинки `2 + (big ? 2 : 0) + k` и их радиус × `g` — только частицы `parts`, `spawnCrumbs` (съедобные крошки) не трогать; `Sfx.crunch(k)` вместо `Sfx.chomp(...)`. В рисовании своей конфеты при `swell > 0.002` — масштаб вокруг центра (`translate`/`scale` для тела, лица и шляпы одной парой `save`/`restore`), физика и `Rs` не меняются. На `lod 2` гоблинов не больше 3.

- [ ] **Step 4: Run** `npm test` — Expected: PASS всё.

- [ ] **Step 5: Commit** — `git commit -m "Heavy bite: a streak bite swells the candy, throws bigger gobs and crunches; numbers unchanged"`.

### Task 5: Замер частоты, документация, трекер

**Files:**
- Create: `tools/announce-curve.mjs`
- Modify: `docs/superpowers/specs/2026-11-26-swallow-announce-design.md` (раздел «Замер»), `CLAUDE.md`

**Interfaces:**
- Consumes: `k.ann`, `ANN` (Task 2), `k.daily.force(id)`.

- [ ] **Step 1: `tools/announce-curve.mjs [runs=20] [diff=normal] [limit=300] [weak] [daily=<id>]`** по образцу `tools/album-curve.mjs` (свежая страница на забег, `pause(true)`, `update(1/60)`, автопилот, `weak` — те же множители). Считает за забег показы каждой ступени (по росту `k.ann.step` или счётчику показов), печатает медиану и среднее показов ×2, ×3, ×4, ×5+ за забег и долю погибших. `daily=<id>`: режим `daily` с `k.daily.force(id)`.

- [ ] **Step 2: Замерить** `node tools/announce-curve.mjs 20 normal`, `… 20 normal 300 weak`, `… 20 normal 300 - daily=piranha`, `… daily=tiny`. Если ×2 на normal вне 0,8–2,5 за забег — менять `ANN.win` в пределах 4–6 с и мерить снова; если не попадает — остановиться и принести числа Сеймуру. Если в конфете дня больше 4 объявлений за забег — записать и принести числа Сеймуру, ничего не ограничивать.

- [ ] **Step 3: Записать** таблицу замера (команды, числа, окно) в раздел «Замер» спеки; в `CLAUDE.md`: строка `10-announce` в таблице файлов, решение «объявления только за глотки подряд, ничего не начисляют, Торт-босс не считается и обрывает цепочку», «тяжёлый» укус меняет только картинку и звук, новые поля `window.__kus` (`ann`, `ANN`, `annShow`, `HEAVY`), команда `node tools/announce-curve.mjs 20 normal`, про `SFX_SRC` и сохранение старых записей в `tools/sfx.mjs`.

- [ ] **Step 4: Run** `npm test` и `npm run check` — Expected: PASS, `index.html is up to date`.

- [ ] **Step 5: Commit** — `git commit -m "Announce: frequency tool and measurement, CLAUDE.md"`.

- [ ] **Step 6: Трекер** по `tools/tracker/README.md`: скриншоты 390×844 «до» с базового коммита (`git archive <base>`, тот же момент глотка/укуса) и «после» — момент «Тройной кусь!!» и момент укуса ×5; этап с разделом и строками `+`/`~`; ссылка на PR после пуша.
