# Sugar economy: the wardrobe, missions and the chest

Sugar buys hats, patterns, eyes, a trail and a tray (`src/js/02-wardrobe.js`), missions pay sugar (`MIS_SUGAR`), and the chest on the end card can be reopened once for sugar. The design is in `docs/superpowers/specs/2026-11-26-sugar-economy-design.md`.

## The target

The whole paid collection in about 30 hours of play for a player who does not pay, the first purchase inside 15 minutes, then one every 15-30 minutes. The prices in `WARDROBE` are relative (they add up to 341 000 at `PRICE_K = 1`); `PRICE_K` scales all of them and rounds to 500.

## What was measured, and what was not

Before missions paid sugar (build `2eecc9d`, autopilot, normal difficulty, a fresh page for every run) the game paid about 200 sugar per minute of play with the chest, 11-12 thousand an hour, almost the same in every mode:

| Mode | Runs | Minutes of play | Sugar per minute | With the chest |
|---|---|---|---|---|
| Free (to death; after a win, «Вторая смена») | 40 | 359 | 166 | 185 |
| Free, weak autopilot | 40 | 232 | 172 | 198 |
| Free, easy | 20 | 265 | 187 | 206 |
| Free, hard (dies in ~40 s) | 20 | 15 | 72 | 130 |
| 3 minutes | 30 | 90 | 167 | 203 |
| 3 minutes, weak | 30 | 90 | 180 | 216 |
| Candy of the day (32 different days) | 32 | 96 | 164 | 200 |

Since then missions pay `MIS_SUGAR` × (1 + 0.6 × round) instead of a pattern and 15 sugar, so the income is higher than the table. **The catalog prices are not verified against 30 hours.** `PRICE_K` is 1 and `MIS_SUGAR` is 300, first guesses. A one-hour smoke run of the tool (2 chains) only showed that it works: it extrapolated 16-17 hours for the whole collection at `PRICE_K = 1`, which is not a measurement of 30 hours of play.

## How to verify the prices: `tools/sugar-curve.mjs`

```
node tools/sugar-curve.mjs [chains=8] [hours=35] [diff=normal] [weak]
```

One chain is one profile in one tab playing runs back to back (free, free, 3 minutes, free, candy of the day, in a loop; the page reloads every 20 runs, the saves stay), so missions pile up as they do for a real player. Time moves by hand in 1/60 s steps with the game paused, about 12-16 times faster than real time per tab. Each run records `{ mode, min, banked, mis, chestEV }`. The hours to the whole collection and to the first purchase are worked out after the measurement for any `PRICE_K` (0.5 to 2.0), and for any mission payout:

- `MIS=300,400,500` tries several `MIS_SUGAR` values (a mission's payout does not change how the game is played, so one measurement serves all);
- `X2=1` doubles every run's sugar (a free ×2 per run, as planned for Steam) and the output also prints the `PRICE_K` that would give 30 hours there;
- `OUT=file.json` saves every run, `HTML=file` measures another build, `PAR` limits the tabs.

The full measurement is `OUT=normal.json node tools/sugar-curve.mjs 8 35 normal` and the same with `weak`, in the background (8 chains of 35 hours take about 2.5 hours). The acceptance: the median for the normal autopilot 27-33 hours, the first purchase within 15 minutes, the weak one close to it. If the hours are off, change `PRICE_K`; if the first purchase is late, raise `MIS_SUGAR` (early income grows faster than late) and fit `PRICE_K` again. Do not touch the relative prices.

There is no ×2 anywhere (decided 27.11), so one price list serves the web, the app and Steam. «Продолжить» (free once per free run in the app and Steam) makes a run longer but not richer per minute, so it does not move the hours. The tool's `X2=1` stays as an option for «what if every run paid double», without a build behind it.

In the app the shop also pays `AD_SUGAR` (300, `02-tuning`) for a rewarded ad, up to `AD_DAY` (3) a day. That is income per day, not per hour of play, so `sugar-curve` does not see it: 900 a day shortens the road mostly for players who play little. `AD_SUGAR` and the pack sizes in `PACKS` (5 000, 15 000, 40 000) are first guesses, to be set together with the store prices before payments are configured.
