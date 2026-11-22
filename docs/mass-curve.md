# Mass curve in free play

Measured on 23.11.2026 at commit 509d466 (the local `main`). Script: `tools/mass-curve.mjs`; raw data: `docs/mass-curve.json` (the summary and every run of every set). The game code was not changed.

Purpose: pick the mass thresholds for the run's stages (first event, second event, the cake boss) from real numbers rather than out of thin air.

## In short

- **Runs are bimodal.** The player either dies in the first one to three minutes at a mass of 40–300, or takes off. Past mass 800 deaths are rare: 2–6 out of 36 on normal, 3–4 out of ~20 for the weak players. By minutes 3–4 the survivors hit an equilibrium near 4000: the melting of giants (`06-softbody.js`, mass above 300 drains away) eats the gain. After 4 minutes mass hardly grows.
- **The plain autopilot is too strong:** on normal 75–83% live to 10 minutes, median peak mass 3800. It cannot be the yardstick. Closer to a live player are the "weak" and "very weak" sets: 40–48% take off, the rest die, median death time 1:19–1:43.
- **Hard is almost unplayable for the autopilot:** median run 0:21, 33% alive at one minute. Bots hunt about twice as eagerly and there is no rescue from a lethal bite.
- **Special enemies come early:** the first piranha pack at 0:20 (as soon as mass is above 90); a cake is on the field from the very start in 55–78% of runs, otherwise it appears around 1:00–1:30. Hedgehogs stand from page load and are hardly ever replaced. The strong autopilot eats the cake in 65–85% of runs on normal and easy.
- **Ordinary bots do the killing** (57–100% of deaths), hedgehogs now and then; piranhas and the cake never killed the player.

## Conditions

- Free play, cheats off, a returning player (`kus.best` is set, so no first-run snack). Mode, difficulty and the absence of cheats were checked on every run; page errors: 0.
- Every run on a fresh 1200×720 page. Before «Играть» ("Play") the world lives for 5 game seconds in the menu, as if the player were looking at the menu. Then `startGame()`, and the player gets `player.ai = newAI()`.
- The game is paused; time moves by hand in `update(1/60)` steps, with no rendering. A run lasts until the player's first death or 10 game minutes. Runs that lived to 10 minutes count as 10:00 in run length: a percentile of "10:00" means "at least 10 minutes".
- Difficulties are named in the menu «Лёгкая» (easy), «Обычная» (normal) and «Жёсткая» (hard); below they are easy, normal and hard.
- Sets of 40 runs:

| Set | Command |
|---|---|
| Easy | `node tools/mass-curve.mjs 40 easy 600` |
| Normal | `node tools/mass-curve.mjs 40 normal 600` |
| Normal, repeat (spread check) | the same |
| Hard | `node tools/mass-curve.mjs 40 hard 600` |
| Weak (normal) | `node tools/mass-curve.mjs 40 normal 600 weak` |
| Very weak (normal) | `node tools/mass-curve.mjs 40 normal 600 weaker` |

**The weak player.** It is the same `newAI()` with three parameters multiplied in the script (not in the game):

- `react` — the pause between decisions, normally 0.2–0.38 s;
- `fear` — how early and how hard the player runs from bigger ones;
- `aggro` — the urge to hunt.

The "weak" multipliers are ×2.5 / ×0.55 / ×0.7, the "very weak" ones ×4 / ×0.35 / ×0.5. "Weak" came out only half weak (43% live to 10 minutes), so a second, harsher step was added. The autopilot's view stays all-round, 640 px in every direction, and these parameters do not change it. That is the main way it is stronger than a human, and the `newAI` parameters alone cannot weaken it (see caveats).

**How things were detected.**

- *A special enemy appears* — a new `hedgehog`, `cake` or piranha pack leader object in `blobs` after the start. "On the field at start" — it was already there at the moment of «Играть».
- *Meeting* — the first time the enemy's rim comes within 600 px of the player's rim.
- *A cake bite and the cherry* — on the frame where `player.stats.bites` grows, the body with the smallest gap to the mouth is found, as `biteScan` does. If it is a cake, a cherry bite is counted by the same angle as in `doBite` (±0.55 rad from the cake's back). This is a reconstruction after the frame, not a game counter, so the cherry figures are approximate.
- *Cake eaten* — the cake disappeared on the frame where `player.stats.kills` grew.
- *Cause of death* — the body nearest the player that started a gulp on the death frame (`gulpT > 0`). Undetermined cases: 0.

## Spread check: two runs of normal

| | Run 1 | Run 2 |
|---|---|---|
| Run length, median / p25 | 10:00 / 10:00 | 10:00 / 9:49 |
| Alive at 3:00 / 10:00 | 98% / 83% | 88% / 75% |
| Peak mass, median / p25 | 3832 / 2091 | 3784 / 1624 |
| Mass of the living at 1:00, median | 278 | 268 |
| Mass of the living at 2:00, median | 494 | 578 |
| Mass 800: share / median time | 90% / 1:57 | 90% / 1:39 |
| Mass 1600: share / median time | 80% / 2:31 | 75% / 2:38 |

The medians agree within the spread of a sample of 40: the death shares of 18% and 25% are 7 and 10 runs. Comparing by the median run length on normal says little, since more than half the runs hit the 10-minute limit; so shares and masses were compared as well.

## Tables

### 1. Run length

| Set | p25 | median | p75 | p90 | alive 0:30 | 1:00 | 2:00 | 3:00 | 5:00 | 10:00 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Easy | 10:00 | 10:00 | 10:00 | 10:00 | 98% | 98% | 95% | 93% | 93% | 90% |
| Normal | 10:00 | 10:00 | 10:00 | 10:00 | 100% | 100% | 98% | 98% | 95% | 83% |
| Normal, repeat | 9:49 | 10:00 | 10:00 | 10:00 | 98% | 95% | 93% | 88% | 85% | 75% |
| Hard | 0:13 | 0:21 | 1:05 | 2:06 | 45% | 33% | 13% | 10% | 8% | 3% |
| Weak (normal) | 1:34 | 4:28 | 10:00 | 10:00 | 100% | 85% | 65% | 55% | 50% | 43% |
| Very weak (normal) | 1:11 | 2:21 | 10:00 | 10:00 | 95% | 78% | 57% | 48% | 40% | 40% |

### 2. Mass over time (among the living: p25 / median / p75, number alive in brackets)

| t | Easy | Normal | Normal, repeat | Hard | Weak (normal) | Very weak (normal) |
| --- | --- | --- | --- | --- | --- | --- |
| 0:00 | 55 / **55** / 55 (40) | 40 / **40** / 40 (40) | 40 / **40** / 40 (40) | 34 / **34** / 34 (40) | 40 / **40** / 40 (40) | 40 / **40** / 40 (40) |
| 0:15 | 100 / **129** / 186 (40) | 86 / **106** / 142 (40) | 48 / **93** / 126 (40) | 40 / **81** / 114 (27) | 58 / **90** / 145 (40) | 53 / **77** / 105 (40) |
| 0:30 | 163 / **241** / 397 (39) | 79 / **167** / 260 (40) | 63 / **91** / 243 (39) | 53 / **146** / 247 (18) | 62 / **125** / 246 (40) | 36 / **92** / 167 (38) |
| 0:45 | 182 / **387** / 683 (39) | 82 / **210** / 460 (40) | 63 / **185** / 429 (38) | 110 / **227** / 430 (15) | 72 / **167** / 353 (36) | 47 / **119** / 291 (33) |
| 1:00 | 277 / **697** / 1210 (39) | 106 / **278** / 545 (40) | 95 / **268** / 532 (38) | 127 / **409** / 424 (13) | 88 / **216** / 554 (34) | 44 / **139** / 486 (31) |
| 1:15 | 311 / **916** / 1568 (39) | 214 / **347** / 712 (39) | 84 / **313** / 723 (38) | 75 / **353** / 554 (9) | 115 / **471** / 963 (30) | 51 / **223** / 589 (29) |
| 1:30 | 361 / **1246** / 2143 (39) | 163 / **403** / 921 (39) | 203 / **367** / 983 (37) | 57 / **155** / 910 (7) | 156 / **612** / 1313 (30) | 81 / **177** / 1397 (24) |
| 1:45 | 523 / **1576** / 2235 (38) | 196 / **463** / 1155 (39) | 235 / **657** / 1153 (37) | 107 / **227** / 1036 (6) | 117 / **594** / 1670 (27) | 74 / **587** / 1700 (23) |
| 2:00 | 655 / **1913** / 2365 (38) | 190 / **494** / 1357 (39) | 234 / **578** / 1414 (37) | 74 / **245** / 1100 (5) | 124 / **511** / 1901 (26) | 99 / **1031** / 2102 (23) |
| 2:15 | 706 / **1940** / 2807 (37) | 150 / **696** / 1772 (39) | 331 / **732** / 1526 (36) | 230 / **1133** / 2057 (4) | 136 / **600** / 2305 (25) | 65 / **1158** / 2530 (21) |
| 2:30 | 962 / **2180** / 2543 (37) | 292 / **697** / 1917 (39) | 399 / **823** / 1897 (35) | 268 / **1097** / 2220 (4) | 206 / **760** / 2274 (24) | 103 / **1330** / 2526 (19) |
| 2:45 | 1169 / **2092** / 2849 (37) | 267 / **941** / 2023 (39) | 389 / **878** / 2208 (35) | 422 / **1017** / 1940 (4) | 220 / **1254** / 2286 (22) | 146 / **1390** / 3191 (19) |
| 3:00 | 1383 / **2255** / 2579 (37) | 306 / **988** / 2616 (39) | 449 / **904** / 2098 (35) | 261 / **1517** / 2768 (4) | 165 / **1030** / 2672 (22) | 155 / **1155** / 2989 (19) |
| 3:15 | 1578 / **2255** / 2788 (37) | 203 / **989** / 2738 (39) | 455 / **1273** / 2207 (34) | 1471 / **2486** / 2689 (3) | 181 / **687** / 2525 (22) | 627 / **1873** / 2800 (18) |
| 3:30 | 1452 / **2601** / 2933 (37) | 246 / **1310** / 2762 (39) | 599 / **1258** / 2278 (34) | 1374 / **2155** / 2539 (3) | 380 / **703** / 2501 (21) | 1285 / **2124** / 2783 (17) |
| 3:45 | 1722 / **2526** / 3103 (37) | 392 / **1595** / 2908 (38) | 627 / **1878** / 2544 (34) | 1338 / **1757** / 2223 (3) | 329 / **725** / 2551 (21) | 1762 / **2338** / 2821 (17) |
| 4:00 | 1891 / **2318** / 2937 (37) | 472 / **1500** / 2778 (38) | 566 / **1899** / 2784 (34) | 1927 / **1996** / 2677 (3) | 675 / **1193** / 2510 (20) | 1922 / **2375** / 3122 (17) |
| 4:15 | 1921 / **2632** / 3045 (37) | 510 / **1557** / 2774 (38) | 688 / **1754** / 2543 (34) | 1836 / **2024** / 2709 (3) | 1034 / **1355** / 2598 (20) | 1959 / **2543** / 3153 (17) |
| 4:30 | 1808 / **2530** / 2790 (37) | 406 / **2002** / 2800 (38) | 582 / **1736** / 2670 (34) | 1948 / **2314** / 2697 (3) | 1221 / **1852** / 2950 (20) | 2221 / **2842** / 3072 (16) |
| 4:45 | 2086 / **2441** / 2793 (37) | 408 / **2033** / 2923 (38) | 552 / **2422** / 2925 (34) | 1672 / **1775** / 2547 (3) | 1483 / **2278** / 3032 (20) | 2206 / **2857** / 3039 (16) |
| 5:00 | 1887 / **2472** / 2877 (37) | 533 / **2088** / 2763 (38) | 605 / **2376** / 2981 (34) | 1688 / **1987** / 2383 (3) | 1932 / **2375** / 3010 (20) | 2022 / **2600** / 3093 (16) |
| 5:15 | 2181 / **2734** / 3249 (36) | 322 / **2179** / 2864 (38) | 520 / **2070** / 2577 (34) | 1291 / **1656** / 2136 (3) | 1967 / **2445** / 2956 (19) | 2320 / **2694** / 3034 (16) |
| 5:30 | 2125 / **2732** / 3099 (36) | 426 / **2102** / 2791 (38) | 550 / **1910** / 2825 (34) | 2030 / **2664** / 2819 (3) | 1762 / **2334** / 3039 (19) | 2057 / **2509** / 2944 (16) |
| 5:45 | 2109 / **2640** / 3030 (36) | 405 / **2304** / 3009 (38) | 709 / **2275** / 2795 (34) | 1458 / **2384** / 2795 (3) | 1602 / **2686** / 3148 (19) | 2196 / **2655** / 2983 (16) |
| 6:00 | 2186 / **2753** / 3234 (36) | 661 / **2534** / 2887 (38) | 512 / **2355** / 2961 (34) | 1936 / **2190** / 2445 (2) | 2127 / **2634** / 2790 (19) | 2221 / **2497** / 2725 (16) |
| 6:15 | 2562 / **2938** / 3187 (36) | 613 / **2448** / 2994 (38) | 1158 / **2382** / 3016 (32) | 1249 / **1966** / 2683 (2) | 2077 / **2639** / 3123 (19) | 2156 / **2412** / 2912 (16) |
| 6:30 | 2520 / **2748** / 3068 (36) | 740 / **2361** / 2858 (37) | 674 / **2436** / 2935 (32) | 1024 / **1736** / 2447 (2) | 1871 / **2549** / 3070 (19) | 2094 / **2516** / 2715 (16) |
| 6:45 | 2421 / **2806** / 3192 (36) | 686 / **2191** / 2976 (37) | 472 / **2440** / 2930 (32) | 1068 / **1699** / 2329 (2) | 1986 / **2672** / 2965 (19) | 2128 / **2688** / 3106 (16) |
| 7:00 | 2284 / **2784** / 3103 (36) | 535 / **2352** / 2834 (37) | 798 / **2309** / 2909 (32) | 881 / **1436** / 1992 (2) | 1329 / **2458** / 3078 (19) | 2135 / **3060** / 3344 (16) |
| 7:15 | 2604 / **2928** / 3107 (36) | 565 / **2514** / 2880 (37) | 768 / **2288** / 3144 (32) | 833 / **1287** / 1742 (2) | 1172 / **2241** / 2711 (19) | 2453 / **2692** / 2941 (16) |
| 7:30 | 2409 / **2737** / 3101 (36) | 717 / **2281** / 2786 (36) | 760 / **2575** / 2806 (31) | 852 / **1208** / 1563 (2) | 1084 / **2233** / 2712 (19) | 2696 / **2823** / 2967 (16) |
| 7:45 | 2508 / **2762** / 3271 (36) | 868 / **2302** / 2807 (36) | 862 / **2269** / 2895 (31) | 826 / **1245** / 1663 (2) | 1221 / **2365** / 2814 (19) | 2278 / **2483** / 2798 (16) |
| 8:00 | 2445 / **2791** / 3129 (36) | 853 / **2305** / 2529 (36) | 964 / **2240** / 3017 (31) | 630 / **1194** / 1758 (2) | 939 / **2263** / 2830 (19) | 2507 / **2749** / 3027 (16) |
| 8:15 | 2176 / **2784** / 3024 (36) | 1086 / **2351** / 2773 (34) | 1015 / **2241** / 2778 (31) | 3249 / **3249** / 3249 (1) | 976 / **2141** / 2678 (19) | 2716 / **2955** / 3237 (16) |
| 8:30 | 2343 / **2892** / 3374 (36) | 1409 / **2406** / 3009 (34) | 923 / **2153** / 2944 (31) | 2908 / **2908** / 2908 (1) | 777 / **2221** / 3137 (19) | 2539 / **2824** / 3096 (16) |
| 8:45 | 2411 / **2707** / 2930 (36) | 1646 / **2434** / 2914 (34) | 854 / **1997** / 2899 (31) | 3114 / **3114** / 3114 (1) | 848 / **2282** / 2798 (18) | 2517 / **2878** / 3070 (16) |
| 9:00 | 2182 / **2510** / 3000 (36) | 1345 / **2507** / 3134 (34) | 594 / **2019** / 2575 (31) | 3392 / **3392** / 3392 (1) | 831 / **2369** / 2680 (18) | 2559 / **2857** / 2993 (16) |
| 9:15 | 2327 / **2805** / 3341 (36) | 1674 / **2386** / 2880 (33) | 585 / **2234** / 2749 (31) | 2612 / **2612** / 2612 (1) | 1142 / **2427** / 3122 (18) | 2478 / **2939** / 3142 (16) |
| 9:30 | 2295 / **2673** / 2897 (36) | 1845 / **2675** / 3017 (33) | 945 / **2121** / 2811 (30) | 2541 / **2541** / 2541 (1) | 1445 / **2271** / 2684 (18) | 2265 / **2725** / 3109 (16) |
| 9:45 | 2186 / **2690** / 3224 (36) | 2146 / **2621** / 3125 (33) | 1204 / **2381** / 2934 (30) | 3193 / **3193** / 3193 (1) | 1447 / **2540** / 2865 (18) | 2490 / **2985** / 3357 (16) |
| 10:00 | 2249 / **2796** / 2970 (36) | 1974 / **2722** / 3052 (33) | 1034 / **2184** / 2751 (30) | 3001 / **3001** / 3001 (1) | 1534 / **2627** / 3238 (17) | 2475 / **2694** / 2917 (16) |

### 3. Peak mass in a run

| Set | p25 | median | p75 | p90 |
| --- | --- | --- | --- | --- |
| Easy | 3863 | 3975 | 4038 | 4085 |
| Normal | 2091 | 3832 | 3959 | 4029 |
| Normal, repeat | 1624 | 3784 | 3969 | 4006 |
| Hard | 63 | 111 | 292 | 723 |
| Weak (normal) | 242 | 981 | 3938 | 3999 |
| Very weak (normal) | 206 | 491 | 3952 | 4009 |

### 4. Mass thresholds: share of runs that reached it (median time to reach)

| Threshold | Easy | Normal | Normal, repeat | Hard | Weak (normal) | Very weak (normal) |
| --- | --- | --- | --- | --- | --- | --- |
| 60 | 100% (0:01) | 100% (0:06) | 100% (0:06) | 78% (0:07) | 100% (0:07) | 100% (0:07) |
| 80 | 100% (0:06) | 100% (0:10) | 100% (0:10) | 65% (0:11) | 98% (0:12) | 98% (0:13) |
| 100 | 100% (0:10) | 100% (0:14) | 95% (0:13) | 53% (0:13) | 98% (0:15) | 95% (0:17) |
| 150 | 98% (0:17) | 98% (0:22) | 95% (0:24) | 38% (0:25) | 90% (0:25) | 85% (0:28) |
| 200 | 98% (0:24) | 98% (0:30) | 93% (0:33) | 30% (0:28) | 78% (0:29) | 75% (0:35) |
| 300 | 98% (0:34) | 98% (0:46) | 93% (0:51) | 25% (0:40) | 70% (0:38) | 60% (0:45) |
| 400 | 98% (0:39) | 95% (1:04) | 93% (1:04) | 25% (0:48) | 68% (0:50) | 55% (0:52) |
| 600 | 98% (0:51) | 93% (1:33) | 93% (1:27) | 18% (1:05) | 60% (1:10) | 48% (1:16) |
| 800 | 95% (1:04) | 90% (1:57) | 90% (1:39) | 8% (1:15) | 53% (1:14) | 48% (1:25) |
| 1200 | 93% (1:19) | 83% (2:24) | 78% (2:21) | 8% (1:28) | 48% (1:22) | 43% (1:37) |
| 1600 | 90% (1:35) | 80% (2:31) | 75% (2:38) | 8% (2:08) | 48% (1:46) | 40% (1:54) |
| 2500 | 90% (2:10) | 73% (3:01) | 63% (3:06) | 5% (2:35) | 43% (3:04) | 40% (3:07) |

### 5. Special enemies

| Set | Who | on the field at start | spawned during the run | first spawn: time / player mass | spawns per minute | met (≤600 px) | first meeting: time / mass |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Easy | Hedgehog | 100% | 5% | 4:02 / 3278.5 | 0.01 | 95% | 0:25 / 201.5 |
| Easy | Piranhas (pack) | 0% | 98% | 0:20 / 162 | 0.6 | 95% | 1:03 / 420.5 |
| Easy | Cake | 70% | 98% | 1:32 / 559 | 0.64 | 95% | 0:29 / 225.5 |
| Normal | Hedgehog | 100% | 13% | 5:01 / 1220 | 0.01 | 98% | 0:21 / 119 |
| Normal | Piranhas (pack) | 0% | 98% | 0:20 / 132 | 0.55 | 98% | 0:41 / 226 |
| Normal | Cake | 60% | 98% | 1:20 / 94 | 0.62 | 100% | 1:36 / 247 |
| Normal, repeat | Hedgehog | 100% | 10% | 5:55 / 2075.5 | 0.01 | 93% | 0:18 / 95 |
| Normal, repeat | Piranhas (pack) | 0% | 95% | 0:20 / 134.5 | 0.57 | 93% | 1:08 / 262 |
| Normal, repeat | Cake | 55% | 98% | 1:00 / 50 | 0.63 | 90% | 1:07 / 187 |
| Hard | Hedgehog | 100% | 0% | — / — | 0 | 48% | 0:10 / 60 |
| Hard | Piranhas (pack) | 0% | 40% | 0:20 / 119.5 | 0.58 | 25% | 0:39 / 221 |
| Hard | Cake | 78% | 38% | 0:00 / 35 | 0.62 | 25% | 0:28 / 260 |
| Weak (normal) | Hedgehog | 100% | 3% | 5:16 / 845 | 0 | 85% | 0:24 / 125 |
| Weak (normal) | Piranhas (pack) | 0% | 95% | 0:20 / 123.5 | 0.59 | 78% | 0:55 / 263 |
| Weak (normal) | Cake | 68% | 83% | 1:20 / 52 | 0.55 | 80% | 0:39 / 183 |
| Very weak (normal) | Hedgehog | 100% | 5% | 9:16 / 3166 | 0.01 | 80% | 0:30 / 128 |
| Very weak (normal) | Piranhas (pack) | 0% | 85% | 0:22 / 113.5 | 0.6 | 68% | 0:46 / 304 |
| Very weak (normal) | Cake | 68% | 70% | 1:04 / 41 | 0.62 | 70% | 0:40 / 119.5 |

| Set | bit the cake | bit the cherry | ate the cake | cake bites in total | of them on the cherry | cakes eaten |
| --- | --- | --- | --- | --- | --- | --- |
| Easy | 88% | 43% | 85% | 1020 | 41 | 89 |
| Normal | 80% | 30% | 68% | 572 | 22 | 50 |
| Normal, repeat | 75% | 40% | 65% | 640 | 43 | 56 |
| Hard | 15% | 8% | 3% | 77 | 7 | 4 |
| Weak (normal) | 53% | 28% | 33% | 373 | 27 | 31 |
| Very weak (normal) | 45% | 20% | 38% | 485 | 24 | 38 |

### 6. What kills the player (share of deaths)

| Set | died | bot | piranhas | hedgehog | cake | undetermined | mass at death: median | killer / player mass, median |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Easy | 10% | 100% | 0% | 0% | 0% | 0% | 67 | 10.5 |
| Normal | 18% | 57% | 0% | 43% | 0% | 0% | 29 | 3.8 |
| Normal, repeat | 25% | 90% | 0% | 10% | 0% | 0% | 75 | 5.9 |
| Hard | 98% | 97% | 0% | 3% | 0% | 0% | 42 | 4.6 |
| Weak (normal) | 57% | 96% | 0% | 4% | 0% | 0% | 56 | 12.7 |
| Very weak (normal) | 60% | 100% | 0% | 0% | 0% | 0% | 62 | 8.8 |

### 7. Bites and whole swallows per run

| Set | bites: p25 / median / p75 | swallowed whole: p25 / median / p75 | bites per minute | swallowed per minute |
| --- | --- | --- | --- | --- |
| Easy | 108.8 / 122.5 / 133.3 | 20.8 / 25 / 33 | 12.4 | 2.8 |
| Normal | 98.8 / 109 / 123.3 | 16.8 / 22.5 / 27.3 | 11.4 | 2.3 |
| Normal, repeat | 83.8 / 109.5 / 119.5 | 9.5 / 21.5 / 25 | 11.2 | 2.2 |
| Hard | 1 / 3 / 8.3 | 0 / 1 / 2 | 6.8 | 1.5 |
| Weak (normal) | 13.8 / 45 / 121.5 | 1 / 11.5 / 22 | 11.8 | 1.8 |
| Very weak (normal) | 15.8 / 41 / 125.5 | 1 / 5.5 / 25 | 14.2 | 2.2 |


Notes on the tables:

- **In table 2** the number alive is in brackets. The late rows on hard are 1–3 runs; do not rely on them.
- **In table 4** the share is of all 40 runs; the time is the median among the runs that got there.
- **In table 5** "spawned during the run" means a new object after the start. Hedgehogs are almost always there from the start: two hedgehogs live on the field from page load, and new ones appear only when one is eaten. Piranhas are counted by pack: a leader plus five. A run has more than one cake and pack, hence the "per minute" rate.

### In addition: who dies and when

| Set | median time of death (among the dead) | p75 | share of runs with peak mass ≥3500 | died after 800 / reached 800 |
|---|---|---|---|---|
| Easy | 1:50 | 2:49 | 90% | 2 / 38 |
| Normal | 7:17 | 8:15 | 70% | 3 / 36 |
| Normal, repeat | 2:47 | 6:11 | 63% | 6 / 36 |
| Hard | 0:20 | 1:03 | 5% | 2 / 3 |
| Weak | 1:43 | 2:44 | 40% | 4 / 21 |
| Very weak | 1:19 | 2:12 | 40% | 3 / 19 |

## Findings

1. **How mass grows.** Mass moves in steps, not along a smooth curve. In the first 30 seconds the median of the living reaches 90–170, at one minute 140–280 (higher on easy: 241 and 697). After that half the runs grow by hundreds a minute and the other half die. At 3:00 the survivors' median is about 1000 (weak players) and about 1000–2200 (strong ones). From 4:00 every survivor sits at 2000–3000 and hardly changes: that is the melting ceiling.
2. **The deciding window is the first two minutes.** Nearly all of the weak player's deaths happen before 2:45, at a mass of 40–300. Whoever passes 800 almost certainly lives to the end.
3. **Thresholds above 800 barely tell players apart.** The share reaching 800, 1200, 1600 and 2500 is 53, 48, 48 and 43% for the weak player and 48, 43, 40 and 40% for the very weak one. The choice between these thresholds only sets *when* an event comes, not *for whom*.
4. **The special enemies already sit in the "first minute" stage.** Piranhas arrive at 0:20 for everyone above 90. The cake is often there from the first second. The hedgehog is permanent scenery from the first 20–30 seconds. For the stages their appearance will have to be tied to the bar, or the "piranhas" event will happen on its own before its threshold.

## Recommended thresholds

The yardstick is the weak sets (a live player is most likely somewhere between "weak" and the plain autopilot, see caveats) and the normal difficulty.

| Stage | Mass threshold | Time cap | Who gets there in the measurement | When, median |
|---|---|---|---|---|
| 1. Piranha pack | **150** | **0:45** | 93% of weak and 93% of very weak (by mass or by living to 0:45); plain autopilot 95–100%; hard 45% | 0:22–0:28 by mass |
| 2. Sweet rain | **600** | **2:00** | 70% of weak, 58% of very weak (by mass or by living to 2:00); plain autopilot 95–98%; hard 20% | 1:10–1:16 for the weak, 1:27–1:33 for the plain autopilot |
| 3. Cake boss (finale) | **1600** | **4:00** (adds almost nothing) | 48% of weak, 40% of very weak; with the 4:00 cap 50% and 43%; plain autopilot 75–80%, with the cap 88–95% | 1:46–1:54 for the weak, 2:31–2:38 for the plain autopilot |

Why:

- **First event at 150.** 85–98% of runs reach 150 in every set except hard, median 0:22–0:28. The 0:45 cap picks up those stuck at 80–140. At 0:45, 93–98% of the weak players are alive, so nearly everyone sees the event. On hard half the runs die before 0:21, and no threshold fixes that. There is no point going below 150: at 100 the event would collide with the piranha pack's appearance, which already comes at 0:20.
- **Second event at 600.** It is the step between "survived the start" (300) and "took off" (800). 60% of the weak and 48% of the very weak reach it, median 1:10–1:16; for the plain autopilot 93% by 1:27–1:33. The 2:00 cap is needed: a noticeable part of the weak players alive at two minutes is still below 600 (p25 of the living's mass at 2:00 is 99–124), and the cap adds 10 percentage points for them. Without it they would not see the second event.
- **Cake boss at 1600.** Above 800 the curve is flat, so the share that gets there hardly depends on the threshold. 1600 is chosen by time: the finale comes around 2:00–2:40, when almost all survivors have taken off but have not yet hit the 4000 ceiling. 2500 would give the same share at about 3:05, leaving more than a minute and a half of empty growth between the second event and the finale.
- **"Every third run" cannot be set by mass.** For the weak player the 40–48% who get there are the share that took off, not an effect of the threshold. Getting down to a third would take a threshold above the melting ceiling (over ~3500), and then the finale would come after minute 4–5, already on the plateau. If a third is the actual goal, it is set not by a threshold but by how many players survive the first two minutes: the bots' pressure at mass 40–300 (`DIFFS.normal.hunt`, `grace`). A live player most likely takes off less often than the autopilot, so a third may come out by itself. Only live runs can check that.
- **Time cap for the boss.** It gives the weak players almost nothing: 43–50% are alive at 4:00 and nearly all of them are already above 1600, so the cap adds 2–3 percentage points (8–13 for the plain autopilot). If set, make it 4:00, so that a player stuck at 700–1500 still sees the finale. For the first and second events a cap is needed (0:45 and 2:00).

**Do three events fit in a typical run?** For the half that takes off, yes, with room to spare: all three by ~2:30. For the other half (50–60% of the weak player's runs), no: median death time 1:19–1:43. Those players see the first event, about half of them the second (with the 2:00 cap), and almost none the cake. On hard a typical run (0:21) does not fit even the first event. If the stages must exist on hard too, it needs other thresholds or a 0:15 cap.

## Caveats: the autopilot is not a live player

- **It sees everything around it.** `botThink` looks 640 px in every direction, weighs every threat at once and runs before a big bot has turned. A human sees only the screen and gets distracted. This makes the autopilot more durable, so live players most likely take off less often.
- **It turns more slowly.** A body with `ai` turns 15% slower (`turnRate`, factor 0.85), and this applies to the player on autopilot too. A shift towards earlier death, but a small one.
- **It never quits.** A live player abandons runs; the autopilot plays until death or 10 minutes. Real runs are shorter on average, so the time caps matter more than the tables suggest.
- **No screen and no thumb.** No joystick misses, no touch latency; the autopilot uses dash and tongue by formula. A shift towards faster growth.
- **Weakness through one parameter.** The weakened autopilot is worse at decisions (thinks less often, flees later, hunts less), but not at seeing. Making it "short-sighted" would need a change to `botThink` in the game, which the task ruled out. That is the first thing that was missing: a view-radius parameter in `newAI`.
- **No human start.** Before the start the world lived in the menu for 5 seconds. A live player looks at the menu longer, and then the cake and piranhas may be on the field at the start more often.
- **Sample size.** 40 runs per set: shares are known to about ±8 percentage points; events with 3–10 cases (deaths on easy and normal, causes of death) give only an order of magnitude.

## What could not be measured

- **Cherry bites.** There is no direct counter: `window.__kus` has neither the last bite (target, angle) nor the `weak` flag. The figures are reconstructed from geometry after the frame and are probably low (22–43 out of 570–1020 cake bites).
- **Cause of death.** `killer` is not exposed. It was inferred from the gulp that had just started, which is reliable (0 undetermined) but indirect.
- **Rescues from a lethal bite** (`graceT`). How often they fired is not visible: there is no counter.
- **A short-sighted weak player.** It needs a view radius in `newAI`, see caveats.
