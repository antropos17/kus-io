# Late-game growth: measurements

The late-game work lets a strong player's candy grow past the old ceiling of about 3 500, and adds bigger bots as food once the player is huge. Design: `docs/superpowers/specs/2026-11-27-late-game-growth-design.md`.

Measured with the autopilot, on normal difficulty with cheats off. Each run is a fresh page stepped in 1/60 s steps, as in `docs/mass-curve.md`:
- `tools/mass-curve.mjs`: `SHIFTS=1` plays on through every win into «Вторая смена» and later shifts, and reports peak mass across all shifts; `HTML=<file>` measures another build.
- `tools/perf.mjs`: `MASS=<n>` holds the player at a given mass.

## What the code does now

- **The player's melt** above 300 is `(m − 300) · 0.004 · (1 + m / 1400)` per second (`MELT.kPlayer`, `MELT.soft` in `02-tuning`). That is about 42 at 3 400, 121 at 6 000 and 316 at 10 000.
- **Bots keep the old, faster curve:** `(m − 300) · 0.004 · (1 + m / 1000)`, about 55 at 3 400.
- **Caps:** the player's is 20 000, every other candy keeps 3 500. A cap now holds at the end of every frame. Before, one swallow could carry the mass past it.
- **Late food:** once the player is heavier than 1 500, up to 45% of new bots spawn at 8–25% of the player's current mass (`LATE`, `randomBotMass` in `09-bots`).

## Before: the `main` build (26e5d75), 40 runs per set

The commands, each with `HTML=` pointing at a frozen copy of that build; the data is in `docs/late-growth-before-*.json`:

```
SHIFTS=1 OUT=docs/late-growth-before-strong.json node tools/mass-curve.mjs 40 normal 1200
OUT=docs/late-growth-before-weak.json node tools/mass-curve.mjs 40 normal 600 weak
OUT=docs/late-growth-before-weaker.json node tools/mass-curve.mjs 40 normal 600 weaker
node tools/perf.mjs 6 3 > docs/late-growth-before-perf.json
MASS=3400 node tools/perf.mjs 6 3 > docs/late-growth-before-perf-3400.json
```

| Strong set, 20 minutes with shifts | Before |
|---|---|
| peak mass, median / p75 / p90 | 1 932 / 3 809 / 3 990 |
| reached 6 000 / 10 000 | 0% / 0% |
| time to 3 000, median | 3:32 (17 of 40 runs) |
| alive at 3:00 / 5:00 / 10:00 | 85% / 67.5% / 45% |
| deaths | 90% of runs: bots 44%, the boss 44%, hedgehogs 11% |

| Weak sets, 10 minutes | weak | weaker |
|---|---|---|
| alive at 0:30 | 85% | 77.5% |
| alive at 1:00 | 77.5% | 52.5% |
| alive at 2:00 | 67.5% | 42.5% |
| alive at 3:00 | 55% | 40% |
| alive at 10:00 | 32.5% | 27.5% |

| Frame cost (CPU ×6, 390×844, 3 runs) | ordinary run | `MASS=3400` |
|---|---|---|
| update / render, ms | 2.5 / 5.0 | 2.8 / 5.9 |
| fps of the real loop | 139 | 97 |

## Trials: the strong set, 12 runs each, 20 minutes with shifts

| Try | Change | Peak median / p75 / p90 | Reach 6k / 10k | Deaths after 6k | Notes |
|---|---|---|---|---|---|
| 1 | linear player melt (`kPlayer` 0.004), late bots as planned | 22 665 / 22 756 / 22 796 | 58% / 58% | 0 | Everyone who took off ran to the 20 000 cap in 5–6 minutes. The cap leaked by one swallow. |
| 2 | soft curve, `soft` 3000, cap fixed | 20 000 / 20 000 / 20 000 | 75% / 75% | 0 | Slower, but still no balance below the cap. |
| 3 | `soft` 1500 | 5 201 / 10 931 / 11 930 | 50% / 33% | 1 | Survivors level off at 8–12 thousand. Four boss deaths near 2 000 pull the median down. |
| 4 | `soft` 3000, late share 0.2 | 11 601 / 13 429 / 14 155 | 83% / 83% | 1 | Levels off at 10–16 thousand, above the goal. |
| 5 | `soft` 1250 | 6 938 / 7 843 / 9 443 | 58% / 0% | 2 (the boss) | Levels off at 7–10 thousand. |

Why the linear melt could not work: the late food grows in proportion to the player's mass, and so does a linear melt. A strong player then either runs away to the cap or shrinks, with nothing in between. With the soft curve the melt grows faster than the food, so the mass levels off. Where it levels off scales with `soft`: about 9 000 at 1 250 and about 11 000 at 1 500.

## Chosen: `soft` 1400

1 400 sits between tries 3 and 5. The expected level is about 9–11 thousand for the strong autopilot, so 6–10 thousand is a real target for a strong player, and the record still depends on how well the player eats. **This value is not measured in full.** The full 40-run strong set, the weak sets and the frame cost at 10 000 on the final build were started and then stopped by the owner. Run them before relying on these numbers:

```
SHIFTS=1 OUT=docs/late-growth-after-strong.json node tools/mass-curve.mjs 40 normal 1200
OUT=docs/late-growth-after-weak.json node tools/mass-curve.mjs 40 normal 600 weak
OUT=docs/late-growth-after-weaker.json node tools/mass-curve.mjs 40 normal 600 weaker
MASS=10000 node tools/perf.mjs 6 3
```

## Known open points

- **The weak sets after the change are not measured.** Below 1 500 mass the change only touches the player's melt between 300 and 1 500, and there the new curve is close to the old one: about 5 at 1 000, the old one 5.6. Newcomer survival should not move, but no measurement shows it yet.
- **Frame cost of a giant.** One run during the tool smoke test, holding the player at 10 000 on the old build, gave render 7.3 ms against 5.1 and fps 89 against 150. That is above the +15% the design allows. It needs the full `MASS=10000` measurement, and probably cheaper drawing for huge candies.
- **Giant deaths are rare.** Bots stay under 3 500 and the cake under 3 400, so a giant dies only to a later shift's boss (tries 3–5: 1–2 of 12). A boss that grows with the player is separate future work.
