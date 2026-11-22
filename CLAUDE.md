# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# КУСЬ.io

A browser game in the spirit of agar.io: soft candies bite pieces off each other, and the wounded one keeps eating. Canvas 2D, no libraries, no server. Played on PC and on phones (the iPhone must work).

- Site: https://antropos17.github.io/kus-io/ (GitHub Pages, branch `main`, repository root)
- The game's interface is in Russian, code comments are in English

## Commands

```
npm install        once: prettier and playwright-core
npm run build      build index.html from src/
npm test           build and run the tests in headless Chrome (needs an installed Chrome)
npm run format     prettier over src/js, tools, tests
node tests/run.mjs soak    only the tests whose name contains "soak" (no build: run npm run build first)
npm run check      exit with an error if index.html does not match src/
npm run og         rebuild og.png, the 1200×630 link preview picture, from a real frame of the game
npm run shots      rebuild the README screenshots in docs/media/ from real frames of the game
```

The tests use the installed Chrome (`channel: chrome`); another binary: `CHROME=/path/to/chrome`.

Deploying: `npm test`, commit `src/` together with the built `index.html`, `git push`. Pages updates within a minute.

## The main rule

`index.html` in the root is GENERATED. Edit only `src/`, then `npm run build`. The built file is committed: Pages serves it, and it is also a self-contained page (one file, no requests except fonts) that can be sent around or opened as `file://`.

`og.png` in the root is the preview picture for chats (`og:image`). It is a separate file next to the page: the page does not load it, so it does not break the "one file" rule. The tab icon is embedded in `<head>` as a data-URI SVG.

## How it is put together

`tools/build.mjs` inserts `src/style.css` and all of `src/js/*.js`, in name order, into the template `src/index.html` at the markers `/*__CSS__*/` and `/*__JS__*/` (each exactly once). The JS pieces end up in ONE `{ ... }` block, so:

- all top-level `const`/`let`/functions are shared by all files, there are no imports;
- file order matters: a `const`/`let` from a later file must not be touched at the top level of an earlier one (TDZ). Inside functions it is fine;
- a new file gets a number by its place in the load order.

| File | What is inside |
|---|---|
| `01-helpers` | `clamp`, `lerp`, `rand`, `angDiff`, `vnoise`, `FONT` |
| `02-tuning` | world constants, `massToR`, `biteOf`, `lethalFor`, palettes, `PICK` bonuses, hats, patterns (`SKINS`, `skinTile`, `drawSkin`), bot names |
| `03-dom` | `$`, canvas, `resize`, `PIXEL_BUDGET`, safe-area insets |
| `04-state` | shared state: `blobs`, `food`, `parts`, `player`, `state`, `mode`, `cam`, `calm`, `input`, `stick`; settings `SET`, difficulty `DIFFS`, cheats `CHEAT`, missions `M`, `haptic` |
| `05-sound` | `Sfx`: all sound is synthesized with Web Audio, there are no files |
| `06-softbody` | `Blob`, wounds, `updateBlob`, the ring of points (`computeTargets`, `stepPoints`), contacts, `jolt` (jelly wobble) |
| `07-bites` | `Strand` (the stretchy strand), `Chunk` (a bitten piece), `Gulp`, `checkBites`, `doBite`, `swallowWhole`, the dash, the tongue |
| `08-food-particles` | sprinkles, crumbs, bonuses, particles, floating text |
| `09-bots` | bot AI, spawning, hedgehog, piranhas, cake, `population` |
| `10-daily` | "Конфета дня" (candy of the day, mode `daily`): the twist of the day `DAILY` by the local date (`dailyOf`), `day` — the twist in force, the best of the day and the days-in-a-row streak (`dailySave`) |
| `10-flow` | missions and patterns, start and end of a run, the 3-minute mode, `updateCamera`, `updateHUD`, the main `update` |
| `11-draw-world` | the tray, `buildPath` (body outline), sprinkles, strands, wounds |
| `12-draw-face` | mouth (`mouthGeo`, `drawMouthBack`, `drawMouthFront`), eyes, tongue, hats |
| `13-draw-body` | bodies, pieces, labels, minimap, `render` |
| `14-input` | mouse, keyboard, joystick and buttons on phones, choosing flavour, pattern and hat in the menu |
| `15-admin` | the admin panel with cheats |
| `16-settings` | pause, settings, the challenge link |
| `17-boot` | `adapt` (automatic graphics tuning), `frame`, startup, `window.__kus` |

A frame: `frame` → `update(dt)` (bots, bodies, collisions, bites, food, rings of points, camera, HUD) → `render()`.

A bite step by step (`checkBites`): wind-up → snap → `doBite` → the piece is held in the teeth and stretches on a strand → chewing → `Chunk.finish` (the mass is added).

`window.__kus` in `17-boot` gives the tests the state and functions (`player`, `blobs`, `update`, `render`, `place`, `spawnBot`, `spawnSpecial`, `Sfx`, `cam`, `CHEAT`, `pause`, `setLod`). The easiest way to test a new mechanic is through it.

Saves in `localStorage`: `kus.name`, `kus.color`, `kus.hat`, `kus.skin`, `kus.best`, `kus.best3`, `kus.mode`, `kus.diff`, `kus.set`, `kus.m` (missions and unlocked patterns), `kus.seen` (hints already shown), `kus.cheat`, `kus.lbmin`, `kus.daily` (candy of the day: date `d` like 20261123, best of the day `best`, days in a row `streak`, longest streak `top`).

## Decisions that must not be broken

- No freeze frames and no pauses of game time on a bite: the player took them for hangs. Time slows down only when swallowing whole, in a smooth curve.
- No random camera shake: a kick goes through a spring (`cam.kx`, `cam.ky`, `cam.zk`). To give a kick: `cam.shake = strength; cam.sa = angle`.
- All movement is computed from `dt` and is the same at 30 and at 120 frames per second. Do not write "per frame" (`*= 0.9`), write it through `Math.exp(-dt * k)`.
- `calm` (the system setting "reduce motion") turns off flashes, camera kicks and the slow-down.
- Phone: the joystick appears under the finger anywhere on the screen, buttons «Кусь» (bite) and «Язык» (tongue), everything fits in 360×640 and in landscape 844×390. After interface changes look at both sizes.
- The difficulty `DIFFS`, the rescue from a lethal bite (`graceT`) and the allowances for a small player in `09-bots` keep a newcomer alive. Check the balance with the autopilot (`player.ai = newAI()`), not by eye.
- The page stays one file with no external scripts. No syntax or CSS newer than what iOS 15 Safari has (`inset`, for example, has already been replaced).
- The ES5 script embedded at the start of `<body>` shows errors on screen. Do not touch it and do not move it to modern syntax.

## Performance

- `adapt` in `17-boot` lowers the detail (`lod` 0/1/2) and the resolution (`quality`) when frames drop or the script takes more than 62% of a frame. The canvas size changes mid-round no more than once every 12 seconds.
- Heavy in drawing: the mouth and face, the tray, body gradients. Body outlines and fills go through one `Path2D` per body (`buildPath`).
- In hot loops do not create needless objects and do not use `clip`, except in the places that already have it.
- The pause has «Показывать FPS» (show FPS): frames, the worst frame, script time, detail level.

## Tests

`tests/run.mjs` checks: startup on PC and phone, buttons within the screen, bite rules (hedgehog, cake, shield), the streak and the jelly, difficulty and graphics, every sound, a three-minute autopilot run on ragged frames (NaN, leaving the field, position jumps, stuck states). Add a check for a new mechanic there too.

The tests do not see the picture and do not hear the sound. Check the look with screenshots; nobody has checked the game automatically on a real iPhone.

## What is not there

- Multiplayer: it needs a server, for now all rivals are bots.
- Telegram Mini App: the code detects running inside Telegram, but no bot has been created.
