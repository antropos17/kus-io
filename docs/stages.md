# Stages of a free run: design and measurement

Free play (`mode === 'free'`) now has stages: a piranha raid, a sweet rain and the Big Cake boss. Beating the boss ends the run with a win screen; «Вторая смена» (second shift) carries on. The code is in `src/js/10-stages.js`; this page records how it is tuned and what the autopilot measured before and after.

## The stages

| Event | Starts at (peak mass of the life) | Or by | What happens |
|---|---|---|---|
| Piranha raid | 150 | 0:45 | A pack swims at the player from just off screen: 3 piranhas below mass 100, 4 below 150, 6 from 150. The pack does not eat itself. It ends when the pack is gone or after 30 s. |
| Sweet rain | 600 | 2:00 | 15 s of sprinkles falling around the player within three quarters of the view, plus three bonuses at 1, 6 and 11 s. Up to 210 sprinkles on full detail, 140 on detail 1, 80 on detail 2. |
| Big Cake boss | 1600 | none | Comes after the player, see below. No other event starts while it is on the field. |

- The thresholds use the peak mass of the life (`player.stats.maxMass`): mass above 300 melts, so a player who touched 600 and melted back still gets the rain.
- Events are at least 8 s apart.
- The HUD line under the mass (`#stage`) shows the next event and the mass left to it with a thin bar ("до пираний 60"), and during an event what is going on ("пираньи здесь: 4", "сладкий дождь 9 с", "торт: 62%").
- In free play there is no ordinary cake and there are no other piranha packs. In `t3`, `daily` and the world behind the menu `population` works as before.

## The boss fight

The Big Cake («Большой Торт») is a `kind: 'cake'` blob with `b.boss` set, 1800 mass on the first lap (2400 before the retune below).

- **Only the player can fight it.** Bots neither bite it nor hunt it, and it bites only the player.
- **Hard crust.** A bite on the crust takes 0.5 of a normal bite; the cherry on its back takes double, as on the ordinary cake.
- **Face and back.** It keeps its mouth turned to the player and bites (1.8 of a normal bite, at most one bite per 1.2 s) for 5 s, then turns its back for 4.5 s and turns slowly (1.2 rad/s). The back is the moment for the cherry.
- **A cherry bite makes it whirl** (4.5 rad/s for 0.7 s) back to face the player and restarts the facing phase.
- **Escort.** At two thirds and at one third of its mass it calls a piranha raid of 4.
- **It does not grow** from biting the player: its mass is capped at the starting mass.
- It creeps when it is close and chases when it is far.
- **The win.** Swallowing it is a slow-down arc of 1.3 s that dips the game speed to 0.45 (no freeze; none with "reduce motion"), "Торт съеден!", then the win screen. A win pays 75 sugar on top of the run's sugar, every time.

## The win screen and the second shift

The win screen is the ordinary end-of-run card (`#over`) with the title «Победа!», "Торт за m:ss", the usual stats, the sugar and the chest, and the line with the record: "Новый рекорд прохождения: m:ss. Побед: N". The buttons are «Вторая смена» (main), «Поделиться» (`navigator.share`, else the clipboard) and «В меню». It fits 360×640, 844×390 and 1280×720 without scrolling. Behind it the player is safe (`player.safe`): nobody bites it and it does not bite.

`kus.clear` keeps `{ best, wins }`: the fastest first-shift clear in seconds and the number of first-shift wins. A run with cheats wins but is not recorded, and the card says so.

The second shift keeps the mass and the place, counts the run afresh (bites, sugar, time) and does not record its clear time. The events come round by timers: the raid 20 s after the previous event ends, the rain 25 s, the boss 30 s, plus the 8 s gap. Each lap's boss is tougher: mass +25% a lap (at most 3400), facing turn +25%, whirl +15%, crust ×0.85 (softer to bite, there is more of it), back window −0.5 s a lap (at least 2 s), facing window +1 s a lap, escort raids +2 piranhas a lap. A death in the second shift is the ordinary end card with "Смена N." in front of the cause.

## Measurement

`node tools/mass-curve.mjs 40 normal 600` and the same with `weak`, the autopilot, 40 runs of up to 10 minutes each. "Before" is the build of `7ce38b7`, "after" is this branch. The weak set slows the autopilot's reactions ×2.5, fear ×0.55 and aggression ×0.7, as in [mass-curve.md](mass-curve.md).

A run that beats the boss now ends at the win, so after the change "run length" is no longer comparable and the shares alive at 5 and 10 minutes count the winners as alive.

### Normal difficulty

| | Before | After |
|---|---|---|
| Alive at 0:30 | 97.5% | 100% |
| Alive at 1:00 | 95% | 97.5% |
| Alive at 2:00 | 87.5% | 95% |
| Alive at 3:00 | 80% | 90% |
| Died in the run | 27.5% (all to bots) | 17.5% (all to bots) |
| Reached 150 (median time) | 100% (0:24) | 97.5% (0:27) |
| Reached 600 | 80% (1:48) | 92.5% (1:32) |
| Reached 1600 | 75% (3:34) | 80% (2:44) |
| Met the raid / the rain / the boss | — | 97.5% / 95% / 80% |
| Beat the boss, of those who met it | — | 90.6% (29 of 32), 3.1% died in the fight, 2 unfinished at 10:00 |
| Fight length, median (p25–p75) | — | 98 s (68–131) |
| Clear time, median (p25–p75) | — | 4:31 (3:57–5:59) |

### The weak set

| | Before | After |
|---|---|---|
| Alive at 0:30 | 87.5% | 95% |
| Alive at 1:00 | 82.5% | 90% |
| Alive at 2:00 | 70% | 75% |
| Alive at 3:00 | 60% | 70% |
| Died in the run | 52.5% (bots 95%, hedgehog 5%) | 37.5% (bots 93%, hedgehog 7%) |
| Reached 150 (median time) | 82.5% (0:23) | 90% (0:22) |
| Reached 600 | 62.5% (1:11) | 72.5% (1:18) |
| Reached 1600 | 55% (1:42) | 52.5% (2:03) |
| Met the raid / the rain / the boss | — | 95% / 77.5% / 52.5% |
| Beat the boss, of those who met it | — | 90.5% (19 of 21), 4.8% died in the fight, 1 unfinished |
| Fight length, median (p25–p75) | — | 73 s (53–97) |
| Clear time, median (p25–p75) | — | 3:45 (2:49–6:12) |

Nobody died to a raid in either set.

### The boss fight over two measurements

Two "after" measurements were made with the same boss; between them only the rain was thinned out (it was 22 sprinkles a second up to 300). Pooled, 80 runs a set:

| | Met the boss | Won | Died in the fight | Fight length median (p25–p75) |
|---|---|---|---|---|
| Normal | 60 | 85% | 4 runs (6.7%) | 87 s (64–129) |
| Weak | 46 | 93.5% | 2 runs (4.3%) | 73 s (55–96) |

The first measurement alone gave the normal set 78.6% and 81 s, the second 90.6% and 98 s: with about 30 fights a set the share moves by about ten points between measurements.

How the numbers were reached: the first boss chased face-first and bit every 0.56 s and ate the autopilot in 12–27 s; a boss that only turned its back slowly was never reached. With face and back phases and bite 0.85 / every 1.3 s the autopilot won 93% and nobody died in the fight; bite 1.15 / every 1.1 s gave 75% but fights of 105 s on the fight probe. The shipped 1.0 / 1.2 s is between them.

The autopilot gives the boss four times the priority of an ordinary prey (`BOSS.lure`), otherwise it ignores a target that bites back; a live player chooses on their own.

### The retune

The aim: the autopilot on normal difficulty wins 60–90% of boss fights and a won fight lasts 30–90 s at the median. `node tools/boss-fight.mjs 70 normal` plays ordinary free runs (no mass set by hand) until 70 of them have met the boss. A fight starts when the boss event begins and ends at the win screen, at the player's death, or unfinished after 300 s; an unfinished fight counts as lost. Measured after the wall-rim fix (`644e6f7`).

| | Fights | Won | Died in the fight (to the boss) | Unfinished | Won fight, median (p25–p75) |
|---|---|---|---|---|---|
| Before: mass 2400, crust 0.3, bite 1.0 | 70 | 90.0% | 1 (0) | 6 | 94 s (64–125) |
| After: mass 1800, crust 0.5, bite 1.8 | 71 | 74.6% | 9 (6) | 9 | 57 s (38–116) |

The old boss almost never killed: it lost by dragging fights past five minutes. A harder bite alone makes fights longer (the player shrinks and needs more bites), so the cake was made lighter and softer and its bite stronger together. On the 40-fight probes on the way the win share moved 7–10 points between neighbouring settings (mass 1800 / crust 0.5 / bite 1.5: 85%, 55 s; bite 1.65 on 71 fights: 90%, 54 s; mass 1900 / crust 0.45 / bite 1.7 on 71 fights: 59%, 78 s).

## Performance

Headless Chrome on this machine, which other sessions were loading at the time; the plain frame rate is far above 60 and the numbers jump by tens of percent between runs, so they say only that nothing is badly worse.

The cost of `update()` + `render()` per frame on full detail, each scene in its own fresh tab, scenes rotated, four tabs a scene (`.work/perf4.mjs`, not in the repository):

| Scene | PC 1280×720: median / p90 | Phone 360×640 ×3: median / p90 |
|---|---|---|
| Ordinary play, mass 1650, nobody close | 2.4 / 4.1 ms | 2.6 / 4.1 ms |
| Ordinary fight: a bot of 2400 next to the player | 3.5 / 5.9 ms | 2.6 / 4.5 ms |
| Sweet rain, mass 620 | 3.0 / 5.0 ms | 2.1 / 4.3 ms |
| Boss fight, mass 1650 against 2400 | 3.7 / 6.9 ms | 2.9 / 4.8 ms |

Against the ordinary fight the boss fight is +6% (PC) and +12% (phone) at the median, +17% and +7% at p90. The rain against ordinary play is +25% on the PC and cheaper on the phone. The p99 values (15–150 ms in every scene, the ordinary ones included) are the browser flushing the canvas when frames are stepped by hand, not the game.

The game's own FPS tag (pause → «Показывать FPS») over real frames gave script time 1.9–2.6 ms in ordinary play, 1.8–2.6 ms in the rain and 2.1–3.7 ms in the boss fight; worst frame 8–13 ms, 9–13 ms and 13–17 ms.

## What was not checked

- The autopilot is not a live player: whether the boss reads well and feels fair to a person is not known.
- Real phones and the iPhone; sound of the events by ear.
- The second shift was measured only by the tests, not by the autopilot over several laps.
