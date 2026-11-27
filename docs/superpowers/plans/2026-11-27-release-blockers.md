# Блокеры выпуска, которые можно сделать сейчас: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть три блокера из аудита выпуска, которым не нужны аккаунты магазинов, обёртки и новые игровые решения: шрифты встроены в страницу, в коде есть флаг платформы (веб / приложение / Steam), иконки и заставка для магазинов собираются из кода игры.

**Architecture:** Шрифты — сгенерированный `src/fonts.css` с woff2 в data-URI, его вставляет `tools/build.mjs` перед `style.css`, как `tools/sfx.mjs` готовит звуки. Флаг — `const PLATFORM` в `04-state.js`; первые его потребители — спрятанная админка и ссылка «Вызов» на `PUBLIC_URL` вне веба. Иконки — рисунок иконки вкладки выносится в `drawIcon` (`17-boot.js`), а `tools/icons.mjs` рисует им в Chrome все размеры и пишет файлы в `store/`.

**Tech Stack:** ванильный JS одним блоком, CSS `@font-face`, Node-скрипты в `tools/` на playwright-core, свой PNG-кодер `tools/png.mjs`.

**Spec:** `docs/audits/2026-11-26-release-gaps.md`, строки «Офлайн и шрифты» (раздел «в») и «Шрифты офлайн» (раздел «е»), «Флаг «приложение» в коде» (раздел «б»), «Иконки и заставка» (раздел «в»), «Админ-панель с читами» и «Ссылки «Поделиться» и «Вызов»» (раздел «в»).

## Что в план не вошло и почему

| Блокер | Почему не сейчас |
|---|---|
| Сахар не на что тратить | Сделано: гардероб влит в `main` (PR #6). Цены не замерены, но это отдельная работа (`docs/sugar.md`) |
| «Продолжить» за рекламу, ×2 сахара, магазин сахара | Нужна спецификация: правила воскрешения, что с боссом и стадиями, как выглядит карточка и магазин. Сначала обсуждение, потом план. Флаг из задачи 2 — их основа |
| Мобильная обёртка (Capacitor), версии SDK | Capacitor не утверждён; сборка iOS требует Mac с Xcode 26 |
| Настольная сборка для Steam | Electron не утверждён; по порядку аудита идёт после геймпада (`docs/superpowers/plans/2026-11-26-gamepad.md`) |
| Скриншоты и капсулы магазинов, тексты страниц | Снимать лучше после «Продолжить», ×2 и геймпада: иначе всё переснимать. Нужно решить, будут ли подписи на скриншотах |
| Аккаунты, выплаты, политика конфиденциальности, анкеты данных и возраста | Делает владелец; политика и анкеты зависят от SDK рекламы и покупок, которые ещё не подключены |
| Проверка на настоящих телефонах, бета | Нужны обёртки и люди |

## Global Constraints

- Ветка `release-blockers` от свежего `main`. Каждая задача заканчивается зелёным `npm test` и коммитом `src/` вместе с собранным `index.html` (и сгенерированными файлами задачи).
- `index.html` генерируется: правки только в `src/` и `tools/`, затем `npm run build`.
- Страница остаётся одним файлом. После задачи 1 она не делает ни одного сетевого запроса (Telegram-скрипт грузится только внутри Telegram — так и остаётся).
- Синтаксис и CSS не новее iOS 15 Safari. ES5-скрипт ошибок в начале `<body>` не трогать.
- Шрифты: Nunito с весами 700–900 и Rubik Bubbles 400, подмножества `latin` и `cyrillic` с Google Fonts, формат woff2. Обе гарнитуры под SIL OFL 1.1: полный текст лицензий едет внутри страницы.
- `PLATFORM` — ровно одно из `'web'`, `'app'`, `'steam'`. `'app'` — когда `window.Capacitor.isNativePlatform()` возвращает `true`; `'steam'` — когда `window.KUS_PLATFORM === 'steam'` (его выставит preload настольной обёртки); всё остальное — `'web'`. Веб-версия ведёт себя как сейчас.
- Иконка App Store — 1024×1024 PNG без альфа-канала (тип цвета 2). Адаптивная иконка Android: передний слой 1024×1024 с прозрачностью, всё непрозрачное внутри круга радиусом `66/108/2` от стороны (0,3056 × 1024 ≈ 312 px) от центра; задний слой 1024×1024 сплошной `#2b1a14`. Заставка 2732×2732 без альфы, фон `#140b08` (`--ground`), без текста (одна на оба языка). Значок Google Play 512×512 без альфы. Windows `.ico` с размерами 16, 24, 32, 48, 64, 128, 256 (PNG внутри).
- Имена файлов в `store/` — как у `@capacitor/assets` там, где он их ждёт: `icon-only.png`, `icon-foreground.png`, `icon-background.png`, `splash.png`; плюс `play-512.png` и `kus.ico`. Файлы коммитятся (как `og.png`), чтобы будущим обёрткам не нужен был Chrome.
- Новый видимый игроку текст не появляется (если появится — через `t()` на двух языках).

## Review Focus

- Первый запуск без сети (авиарежим, приложение): логотип «КУСЬ.io» и весь текст — встроенными шрифтами, ни одного запроса наружу. Тест задачи 1 обрывает все http(s)-запросы и проверяет, что шрифты загружены и запросов не было.
- Имя игрока с буквами вне подмножеств (азербайджанское «Şəkər»): буквы берутся из системного шрифта, ничего не падает. Тест задачи 1 рисует кадр с таким именем без ошибок.
- Сборка магазина, где раньше кто-то включил читы (тестировщик на ранней сборке с админкой): спрятанная админка не даёт их выключить, а с читами сахар не платится. Вне веба сохранённые `kus.cheat` не читаются — тест задачи 2.
- Android-приложение отдаётся с `https://localhost`: ссылка «Вызов» не должна вести на localhost. Тест задачи 2 открывает страницу по `https://localhost/` и сравнивает веб и приложение.
- Маска Android (круг, капля, сквиркл) срезает края переднего слоя: всё непрозрачное — внутри безопасного круга. Тест задачи 3 проверяет пиксели.

---

### Task 1: Шрифты внутри страницы

**Files:**
- Create: `tools/fonts.mjs`, `src/fonts.css` (СГЕНЕРИРОВАН, руками не править)
- Modify: `tools/build.mjs` (CSS = `src/fonts.css` + `src/style.css`), `src/index.html:29-31` (убрать три `<link>` на Google Fonts), `package.json` (скрипт `fonts`), `CLAUDE.md`, `README.md:83` («only web fonts are loaded» → без сетевых запросов)
- Test: `tests/run.mjs`

**Interfaces:**
- Produces: `src/fonts.css` — комментарий с текстами OFL обеих гарнитур, затем `@font-face` для `"Nunito"` (`font-weight:700 900`) и `"Rubik Bubbles"` (`font-weight:400`), каждый с `src:url(data:font/woff2;base64,…) format("woff2")`, `font-display:swap` и `unicode-range` из ответа Google. Имена семейств те же, что сейчас в `style.css` и `FONT` (`01-helpers.js`): их не менять.
- `npm run fonts` = `node tools/fonts.mjs && node tools/build.mjs`.

- [ ] **Step 0: Ветка и снимки «до».** `git switch main && git pull && git switch -c release-blockers`, `npm run build`, затем снимки меню 360×640 и 1200×720 для трекера: `node tools/tracker/report.mjs shot <file-url index.html> .claude/shots/fonts-before.png` (и `-before-phone.png`).

- [ ] **Step 1: Падающий тест** `fonts: the page makes no network request and the logo and text use the embedded fonts, offline`:

```js
const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, locale: 'ru-RU' });
const asked = [];
await ctx.route(/^https?:/, (r) => { asked.push(r.request().url()); r.abort(); });
const page = await ctx.newPage();
// … goto URL, waitForTimeout(600)
const r = await page.evaluate(async () => {
  const nun = await document.fonts.load('900 20px Nunito', 'Кусь io');
  const rub = await document.fonts.load('20px "Rubik Bubbles"', 'КУСЬ.io');
  return { nun: nun.length, rub: rub.length, logo: getComputedStyle(document.querySelector('.logo')).fontFamily };
});
assert(asked.length === 0, `requests: ${asked.join(' ')}`);
assert(r.nun > 0 && r.rub > 0, `embedded faces loaded: ${JSON.stringify(r)}`);
// then: nick 'Şəkər', click #play, k.update + k.render a few frames, assert no page errors
```

- [ ] **Step 2: Прогон, падает.** `npm run build && node tests/run.mjs fonts` → FAIL: есть запросы к `fonts.googleapis.com`.

- [ ] **Step 3: `tools/fonts.mjs`.** Скачивает `https://fonts.googleapis.com/css2?family=Nunito:wght@700..900&family=Rubik+Bubbles&display=swap` с `User-Agent` настольного Chrome (иначе Google отдаёт не woff2), оставляет блоки, помеченные `/* latin */` и `/* cyrillic */`, скачивает их woff2, заменяет `url(...)` на data-URI. Тексты лицензий — `https://raw.githubusercontent.com/google/fonts/main/ofl/nunito/OFL.txt` и `…/ofl/rubikbubbles/OFL.txt`, в общий комментарий в начале файла (`*/` в тексте лицензии экранировать). Первая строка файла: `/* GENERATED by tools/fonts.mjs: do not edit. */`. Скрипт падает с ошибкой, если какого-то из четырёх блоков (2 гарнитуры × 2 подмножества) нет. В конце печатает размер файла.

- [ ] **Step 4: Сборка.** `tools/build.mjs` читает `src/fonts.css` и ставит его перед `style.css` в `/*__CSS__*/`; `--check` сравнивает с ним же. Убрать три строки `<link>` из `src/index.html`. Запустить `npm run fonts`, записать прирост `index.html` (ожидание — порядка 200–300 КБ; больше 400 КБ — остановиться и сказать).

- [ ] **Step 5: Прогон.** `npm test` → всё зелёное, включая `lang:`-тесты вёрстки (они раньше шли с сетевыми шрифтами, теперь со встроенными — должны совпасть).

- [ ] **Step 6: Глазами.** Снимки «после» тех же экранов (`.claude/shots/fonts-after.png`, `-after-phone.png`) рядом со снимками шага 0: логотип и текст выглядят так же.

- [ ] **Step 7: Документы.** `CLAUDE.md`: «one file, no requests except fonts» → «one file, no requests»; в таблицу файлов — `src/fonts.css` (сгенерирован `tools/fonts.mjs`, лицензии OFL внутри); в команды — `npm run fonts`. В аудите в строках про шрифты пометка «сделано 27.11, ветка `release-blockers`».

- [ ] **Step 8: Коммит.** `git add tools/fonts.mjs tools/build.mjs src/fonts.css src/index.html package.json index.html tests/run.mjs CLAUDE.md README.md docs/audits/2026-11-26-release-gaps.md` → `Fonts embedded in the page: Nunito and Rubik Bubbles as woff2 data, OFL texts inside; no network requests`.

---

### Task 2: Флаг платформы, админка и ссылка «Вызов»

**Files:**
- Modify: `src/js/04-state.js` (`PLATFORM` рядом с `PUBLIC_URL`; `kus.cheat` читается только в вебе), `src/js/16-settings.js` (`shareBase()` вместо двух одинаковых выражений в `#chalBtn` и `shareWin`; `#pAdmin` скрыт вне веба), `src/js/17-boot.js` (`PLATFORM` в `window.__kus`), `CLAUDE.md`
- Test: `tests/run.mjs`

**Interfaces:**
- Produces:
  - `const PLATFORM: 'web' | 'app' | 'steam'` в `04-state.js`, вычисляется один раз при загрузке (правило — в Global Constraints).
  - `function shareBase(): string` в `16-settings.js`: `PUBLIC_URL` вне веба; в вебе — как сейчас (`location.origin + location.pathname` для http(s) не на claude/anthropic, иначе `PUBLIC_URL`).
  - `window.__kus.PLATFORM`.
- Для тестов: в `open()` новый параметр `platform` (`'app'` → `addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; })`, `'steam'` → `window.KUS_PLATFORM = 'steam'`) и `origin` (`'https://localhost'` → `ctx.route('https://localhost/**', …)` отдаёт `index.html` с диска, `goto('https://localhost/')`).

- [ ] **Step 1: Падающий тест** `platform: web, app and steam; the store builds hide the admin, ignore saved cheats and share the public link`. Для каждого из `web`, `app`, `steam`, страница с `origin: 'https://localhost'`, `addInitScript` кладёт `localStorage['kus.cheat'] = '{"god":true}'`:

```js
assert(o.platform === want, `PLATFORM ${o.platform}, want ${want}`);
assert(o.adminShown === (want === 'web'), `${want}: #pAdmin shown ${o.adminShown}`);    // pause opened, offsetParent of #pAdmin
assert(o.god === (want === 'web'), `${want}: saved cheat god read ${o.god}`);
assert(o.link.startsWith(want === 'web' ? 'https://localhost/' : 'https://antropos17.github.io/kus-io/'), `${want}: link ${o.link}`);
```

`o.link` — как в тесте вызова (строка ~1621): забег, смерть, `#chalBtn.click()`, `#chalLink.value`. Ещё случай: `window.KUS_PLATFORM = 'xbox'` → `'web'`; `window.Capacitor = { isNativePlatform: () => false }` → `'web'`.

- [ ] **Step 2: Прогон, падает.** `npm run build && node tests/run.mjs platform` → FAIL: `PLATFORM undefined`.

- [ ] **Step 3: Код.** `PLATFORM` в `04-state.js` (проверка `isNativePlatform` в `try`: объект с неожиданной формой не должен ронять загрузку); чтение `kus.cheat` обернуть в `if (PLATFORM === 'web')`; `shareBase()` и обе замены в `16-settings.js`; `#pAdmin` получает класс `hidden` при загрузке вне веба; `PLATFORM` в `__kus`.

- [ ] **Step 4: Прогон.** `npm test` → всё зелёное (старые тесты админки идут в вебе и не меняются).

- [ ] **Step 5: Документы.** `CLAUDE.md`: в `04-state` — `PLATFORM`; новый пункт в «Decisions that must not be broken»: «Ads, purchases and the sugar shop exist only when `PLATFORM` is `'app'`; in `'steam'` ×2 and Continue are free once per run and there is no shop; the web page never changes because of the flag. Outside the web the admin panel is hidden and saved cheats are not read»; в описание `window.__kus` — `PLATFORM`.

- [ ] **Step 6: Коммит.** `src/js/04-state.js src/js/16-settings.js src/js/17-boot.js index.html tests/run.mjs CLAUDE.md` → `Platform flag (web, app, steam): store builds hide the admin, ignore saved cheats and share the public link`.

---

### Task 3: Иконки и заставка для магазинов

**Files:**
- Create: `tools/icons.mjs`, `store/icon-only.png`, `store/icon-foreground.png`, `store/icon-background.png`, `store/splash.png`, `store/play-512.png`, `store/kus.ico`
- Modify: `src/js/17-boot.js` (рисунок иконки вкладки → `drawIcon`, в `__kus`), `tools/png.mjs` (`truePng`, `ico`), `package.json` (скрипт `icons`), `CLAUDE.md`
- Test: `tests/run.mjs`

**Interfaces:**
- Produces:
  - `function drawIcon(g: CanvasRenderingContext2D, s: number, { bg = true, k = 1 } = {}): void` в `17-boot.js` — нынешний рисунок 180×180 (конфета с укусом, глаза, рот с зубами), масштабированный на сторону `s`; `k` — масштаб самой конфеты вокруг центра; `bg: false` — без фона, прозрачный холст (укус всё равно вырезан). Иконка вкладки и «На экран Домой» = `drawIcon(g, 180)`, пиксель в пиксель как сейчас.
  - `export function truePng(px: Uint8Array /* RGBA */, w: number, h: number, alpha = true): Buffer` в `png.mjs`: тип цвета 6 при `alpha`, иначе 2 (альфа отброшена), фильтр 0, `deflateSync`.
  - `export function ico(images: { size: number, png: Buffer }[]): Buffer` в `png.mjs`: ICO с PNG внутри (поле размера 0 означает 256).
  - `npm run icons` = `node tools/build.mjs && node tools/icons.mjs`.

- [ ] **Step 1: Падающие тесты.**
  - `icons: the tab icon is drawn by drawIcon, the store icon is opaque, the Android foreground stays inside the safe circle`: в странице `drawIcon` на холстах; (а) `drawIcon(g, 180)` даёт тот же `toDataURL`, что `link[rel=icon]` страницы (что рисунок не изменился против `main`, проверяет шаг 6 глазами); (б) `drawIcon(g, 1024)` — у всех пикселей альфа 255; (в) `drawIcon(g, 1024, { bg: false, k: K })` с `K` из `tools/icons.mjs` — каждый пиксель с альфой > 0 на расстоянии ≤ `0.3056 * 1024` от центра, и непрозрачных пикселей больше 30% площади круга (конфета не сжалась в точку).
  - `icons: truePng and ico write what they claim`: в Node `truePng` 2×2 с `alpha=false` → байт 25 (тип цвета IHDR) равен 2, через `rgbaOf` пиксели совпадают; `ico` из двух PNG → первые 6 байт `00 00 01 00 02 00`.

- [ ] **Step 2: Прогон, падает.** `node tests/run.mjs icons` → FAIL: `drawIcon is not a function`.

- [ ] **Step 3: `drawIcon` и кодеры.** Вынести рисунок из `try` в конце `17-boot.js` в `drawIcon` (через `g.scale(s / 180)` и `k` вокруг центра 90, 90; при `bg: false` пропустить обе заливки фона), иконку вкладки рисовать им. `truePng` и `ico` в `png.mjs` рядом с `chunk` и `header` (у `header` появится параметр типа цвета).

- [ ] **Step 4: `tools/icons.mjs`.** Открывает `index.html` в Chrome, рисует в странице через `__kus.drawIcon`, забирает RGBA через `getImageData`, пишет:

| Файл | Размер | Как |
|---|---|---|
| `store/icon-only.png` | 1024 | `drawIcon(g, 1024)`, `truePng(…, false)` |
| `store/icon-foreground.png` | 1024 | `drawIcon(g, 1024, { bg: false, k: K })`, с альфой; `K = 0.8` или меньше, чтобы прошёл тест (в) |
| `store/icon-background.png` | 1024 | сплошной `#2b1a14`, без альфы |
| `store/splash.png` | 2732 | фон `#140b08`, в центре `drawIcon(·, 1024, { bg: false })`, без альфы |
| `store/play-512.png` | 512 | `drawIcon(g, 512)`, без альфы |
| `store/kus.ico` | 16…256 | `ico` из `drawIcon(g, n)` для 16, 24, 32, 48, 64, 128, 256 |

После записи сам перечитывает IHDR и падает, если у файла «без альфы» тип цвета не 2 или размер не тот. Печатает размеры файлов.

- [ ] **Step 5: Прогон.** `npm run icons && npm test` → всё зелёное.

- [ ] **Step 6: Глазами.** Открыть все шесть файлов; передний слой проверить под круглой маской и под квадратной со скруглением (наложить в странице и снять). Иконка вкладки в браузере та же, что на `main`.

- [ ] **Step 7: Документы.** `CLAUDE.md`: в команды — `npm run icons` (что пишет и для чего каждый файл в `store/`); в `17-boot` — `drawIcon`; абзац рядом с `og.png`: `store/` — файлы для магазинов и обёрток, страница их не грузит. В аудите — пометка «сделано» в строке «Иконки и заставка».

- [ ] **Step 8: Коммит.** `src/js/17-boot.js tools/png.mjs tools/icons.mjs store/ package.json index.html tests/run.mjs CLAUDE.md docs/audits/2026-11-26-release-gaps.md` → `Store icons and splash drawn by the game's own icon code: iOS, Android adaptive layers, Play 512, Windows ico`.

---

## После всех задач

- [ ] `npm test` и `npm run check` на ветке — зелёные.
- [ ] Ревью всей ветки, затем PR в `main` (по согласию владельца).
- [ ] После слияния — пост на трекер по `tools/tracker/README.md`: раздел «Выпуск», строки `~ шрифты встроены: страница без запросов в сеть`, `+ флаг платформы: в сборках магазинов нет админки`, `+ иконки и заставка для App Store, Google Play и Windows`; снимки до/после из шага 6 задачи 1.
