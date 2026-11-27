# Late-game growth: measurements before and after

Purpose: the late-game work lets the player's candy grow to 6–10 thousand mass, and makes the bots keep up with a huge player. The autopilot measures it before and after, with `tools/mass-curve.mjs` (`SHIFTS=1` plays on through the wins into «Вторая смена» and later shifts, and reports peak mass) and `tools/perf.mjs` (`MASS=<n>` holds the player at a given mass). Method as in `docs/mass-curve.md`: fresh page per run, 1/60 s steps, normal difficulty, cheats off.

## Commands

The «до» numbers are measured on a frozen copy of the current `main` build: `HTML=<frozen main build>` on every line (a copy of `index.html` kept outside the working tree). The «после» numbers run the same lines on the new build, without `HTML`.

```
SHIFTS=1 OUT=docs/late-growth-before-strong.json node tools/mass-curve.mjs 40 normal 1200
OUT=docs/late-growth-before-weak.json node tools/mass-curve.mjs 40 normal 600 weak
OUT=docs/late-growth-before-weaker.json node tools/mass-curve.mjs 40 normal 600 weaker
node tools/perf.mjs 6 3 > docs/late-growth-before-perf.json
MASS=3400 node tools/perf.mjs 6 3 > docs/late-growth-before-perf-3400.json
```

For «после» the same, with `after` in the file names (and `MASS=10000` for the heavy perf line).

## Strong autopilot (40 runs, 1200 s, `SHIFTS=1`)

| | до | после |
|---|---|---|
| peak mass, median | (замер идёт) | (замер идёт) |
| peak mass, p75 | (замер идёт) | (замер идёт) |
| peak mass, p90 | (замер идёт) | (замер идёт) |
| reach 6k | (замер идёт) | (замер идёт) |
| reach 10k | (замер идёт) | (замер идёт) |
| reach 10k by 15 min | (замер идёт) | (замер идёт) |
| reach 10k by 20 min | (замер идёт) | (замер идёт) |
| time to 3k, median, s | (замер идёт) | (замер идёт) |
| time to 6k, median, s | (замер идёт) | (замер идёт) |
| died after 6k | (замер идёт) | (замер идёт) |

## Weak autopilot (40 runs, 600 s, `weak`)

| | до | после |
|---|---|---|
| alive at 0:30 | (замер идёт) | (замер идёт) |
| alive at 1:00 | (замер идёт) | (замер идёт) |
| alive at 2:00 | (замер идёт) | (замер идёт) |
| alive at 3:00 | (замер идёт) | (замер идёт) |
| died in the run | (замер идёт) | (замер идёт) |
| cause: bot / piranha / hedgehog / cake / boss | (замер идёт) | (замер идёт) |

## Weaker autopilot (40 runs, 600 s, `weaker`)

| | до | после |
|---|---|---|
| alive at 0:30 | (замер идёт) | (замер идёт) |
| alive at 1:00 | (замер идёт) | (замер идёт) |
| alive at 2:00 | (замер идёт) | (замер идёт) |
| alive at 3:00 | (замер идёт) | (замер идёт) |
| died in the run | (замер идёт) | (замер идёт) |
| cause: bot / piranha / hedgehog / cake / boss | (замер идёт) | (замер идёт) |

## Frame cost (`perf`, CPU x6, 390x844, 3 runs)

| | до | после |
|---|---|---|
| update ms, ordinary run | (замер идёт) | (замер идёт) |
| render ms, ordinary run | (замер идёт) | (замер идёт) |
| fps, ordinary run | (замер идёт) | (замер идёт) |
| update ms at `MASS=3400` / `MASS=10000` | (замер идёт) | (замер идёт) |
| render ms at `MASS=3400` / `MASS=10000` | (замер идёт) | (замер идёт) |
| fps at `MASS=3400` / `MASS=10000` | (замер идёт) | (замер идёт) |
