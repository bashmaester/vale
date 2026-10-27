# VALE — current state

**Last updated:** 2026-10-27 (engine-foundation pass, branch `arena/bab4bc10-vale`)
**Framing:** this is now an **engine foundation**, not a film. The sample scene is
a *template*: one modular 3D volume ("snow globe" / diorama / vignette tile),
fully procedural, with procedural LoD. The 20 s signal cycle is the loop that
drives the sample, not the deliverable.

---

## 1. What the build is

One self-contained `index.html` (125.5 KiB), silent, autoplaying, no external
assets. It renders one tile of a rainy street corner inside a physical-looking
case: plinth, four corner posts, wall-thickness caps on the cut faces, engraved
label. Everything inside the case is generated from code every frame.

Pipeline: procedural 3D world → perspective projection → 2D ink plate + field
texture → WebGL2 print shader (`src/shaders.js`, node graph in `src/graph.js`).

Runtime switches:

| Switch | Effect |
| --- | --- |
| *(none)* | the film: 1440×810 (or viewport), 20 s loop, no UI |
| `?finish=raw` / `?raw=1` | bypass the shader, show the raw ink plate |
| `?lab=1` | hidden lab: node graph, params, camera tab, LoD forcing, export |
| `?cam=orbit` / `?cam=fly` | user camera takeover, `?hud=0` hides help |

`window.VALE = { graph, scene, renderer, lab, state, W, H, DURATION }`.

---

## 2. The tile (the engine unit)

`src/tile.js` owns the unit and the LoD policy.

```
TILE = { x0:-15, x1:15, z0:-14, z1:10.5, y0:-1.6, y1:15.6 }
```

- +z and +x are open, cut-away faces; the back wall (z = −14) and left wall
  (x = −15) are closed. That asymmetry is deliberate: the camera sits in the
  open corner, so one tile reads as a stage set and two tiles snap along x.
- `SIDEWALK_Y = 0.16`, plinth bottom at `y0 − 0.35`.
- `groundYAt(x, z)` returns the walking surface including kerb ramps, so
  people and puddles never pop at the crossing.

### Procedural LoD

Three levels, chosen from the tile's projected screen height (`px`):

| Level | Id | Min px | windows | props | crowd | rain | hatch |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | `hero` | 520 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| 1 | `mid` | 300 | 0.55 | 0.55 | 0.62 | 0.60 | 0.55 |
| 2 | `far` | 0 | 0.28 | 0.22 | 0.30 | 0.32 | 0.28 |

There is **no separate low-poly model**. Every module receives the same
`detail` budget object (`makeDetail`) and samples its *own* procedural
description more coarsely: fewer window columns, fewer facade props, fewer
people (deterministic, seeded subset), fewer raindrops and ripples, less hatch.
`detail.allowed(fraction, seed)` is the shared sampler, so a given seed always
produces the same subset at a given level — no popping between frames.

`params.lod = −1` means auto; 0…2 forces a level (used by the lab and by
`tools/shot.mjs`).

Measured: at 720 px wide the three levels render as `hero` / `mid` / `far`
(see `.shots/lod.png`), with the crowd thinning and window grids coarsening as
expected.

---

## 3. Scene contents (all procedural)

- `src/world.js` — the data of one tile: `ROAD` (z −5.0…4.2), `SIDEWALKS`
  (front 4.2→10.5, back −14→−5.0), `CROSSWALKS.main` (x −4.2…−0.8),
  `LANES` (z ±2.15), 2 `PARKING` bays, 2 `SIGNAL_POSITIONS`, 4
  `BUILDING_LOTS`, 7 `LIGHT_SOURCES`, 4 `WAIT_ZONES`, 7 `FLOWS`, 10 `PUDDLES`.
- `src/environment.js` — staged drawing functions
  `drawBackdrop → drawStreet → drawPaving → drawRoadMarkings → drawBuildings →
  drawSignals → drawFurniture → drawRail → drawReflections → drawFrameBack →
  drawFrameFront`.
  Buildings: window grid with ~26 % lit (warm `#d8a03a`), mullions, sills,
  balcony rails on taller lots; the secondary facade runs at 55 % density so a
  block reads solid rather than transparent. Shopfronts: transom bar, counter
  line, occasional silhouette behind the glass. Street trees: tapered trunk,
  root flares, 4–6 primary limbs with two sub-branches each, a 9-sided leaf
  cluster at every tip, cast shadow pool. Rain-worn zebra bars with scuffs.
- `src/traffic.js` — `PROFILES` extrusions (car / van / taxi / bus), near face
  shaded with a vertical gradient, roof rim, wet sheen streak, brake glow on
  stopped vehicles, 4-car overhead train with a continuous lit band.
- `src/crowd.js` — 34 × density crossers + 18 × density waiters, 6 archetypes,
  one filled silhouette with a **leg split** per person, small head disc, arms
  only when idle/detail allows, umbrellas built as rim + mid ring + apex with a
  tilted canopy plane. LoD thins by a seeded hash, accessories drop first.
- `src/weather.js` — 240 raindrops, 56 ripples, 10 tinted puddles (real
  particle/puddle simulation; no wet-glass overlay anywhere).

---

## 4. Measured state (this build)

- `npm run check` passes; `npm run build` → 125.5 KiB self-contained file.
- Luminance at 1440×810 across the loop: **dark 52.7–62.8 %**, mid 32.2–40.4 %,
  bright 5.0–6.9 %. 900×506: dark 49.9–60.7 %. 640×360: dark 47.3–58.8 %.
  (Historical failure mode was 94 % dark; do not reintroduce heavy posterize +
  vignette.)
- Camera: `CameraRig` keys fitted against the full object extents
  (x ±15.9, z −14.7…11.15, y −1.95…15.75). Eye ≈ `[9.4,14.6,38.8]`,
  target ≈ `[−1.0,3.6,−2.2]`, fov 37.7–38.8, roll ±0.005.

---

## 4b. Build integrity

`npm run verify` (check → build → boot) is the gate. `npm run boot` executes the
built `index.html` bundle in Node with a DOM shim, drives six frames and fails on
any startup error, so a corrupted or non-parsing bundle can no longer ship (the
2026-10-27 blank deploy was a `$&` substitution bug in the build plus a TDZ error
in `main.js`; both fixed, both now covered).

## 5. Honest weaknesses

1. **No real browser verification.** The sandbox has no browser (apt, the
   Playwright CDN and puppeteer's Chrome download are all blocked), so the
   ink plate is judged from `@napi-rs/canvas` stills; startup is validated by
   `tools/boot-smoke.mjs`. The WebGL finish itself still has not been seen.
2. **Front-left of the tile is empty.** The crowd clusters at the crossing and
   the four buildings fill the back; the left front quadrant is pavement and
   one tree. The next pass should distribute street furniture there.
3. **People are still schematic.** They read correctly at 1× (silhouette,
   head, umbrella) but close-up crops show a cone-like coat and a floating
   canopy. That is acceptable for a *template*, not yet for a hero shot.
4. **Vehicles are dark slabs.** The gradient and rim helped; interiors are not
   modelled at all.
5. **LoD 2 loses too much of the shopfronts.** Their lit windows survive, the
   frames do not.
6. **Tiling is not yet demonstrated in-engine.** The tile is authored to snap
   along x, but nothing renders two tiles side by side.

---

## 6. How to inspect

```bash
npm run check                                     # syntax/import gate
node tools/shot.mjs --t 3,9,15,19 --prefix v30    # stills → .shots/
node tools/shot.mjs --t 9 --eye 20,6,10 --target 0,4,0 --fov 30
node tools/lod.mjs                                 # LoD contact sheet
node tools/smoke.mjs                               # luminance sweep
```

Stills are always written with the shader bypassed so they can be measured and
cropped; the crop recipe lives in `docs/HANDOFF.md`.

---

## 7. Next steps (ordered)

1. Populate the empty front-left quadrant (bench, bins, poster column, bike
   rack, a couple of café tables under an awning) at LoD-aware density.
2. Second crowd pass: coat silhouettes that are less conical, umbrellas that
   sit on the head instead of hovering.
3. `tools/tiles.mjs`: render two tiles along x into one sheet to prove the
   snapping and to show the seam.
4. Vehicle interiors / glazing at L0 only.
5. Get a browser into CI (GitHub Actions can screenshot the real WebGL output)
   so the finish is finally validated.
