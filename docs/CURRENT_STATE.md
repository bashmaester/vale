# VALE — current state

**Last updated:** 2026-10-27 (Turn 12 — tileable cells and palettes, branch `arena/bab4bc10-vale`)
**Framing:** this is now an **engine foundation**, not a film. The sample scene is
a *template*: one modular 3D volume ("snow globe" / diorama / vignette tile),
fully procedural, with procedural LoD. The 20 s signal cycle is the loop that
drives the sample, not the deliverable.

---

## 1. What the build is

One self-contained `index.html` (~177 KiB), silent, autoplaying, no external
assets. Tags: `v0.1.2` (Turn 10), `v0.1.3` (Turn 11), `v0.1.4` (this turn).
It renders one tile of a rainy street corner as a *cell* of a tiled set: the
boundary is glass planes and a lid, with no posts, rails, cut caps or plinth, so
the cell can butt against another without a seam. Everything inside is generated
from code every frame, and neighbouring cells are painted from the same rules
(`src/cells.js`) with detail falling off by distance.

Pipeline: procedural 3D world → perspective projection → 2D ink plate + field
texture → WebGL2 print shader (`src/shaders.js`, node graph in `src/graph.js`).

Runtime switches:

| Switch | Effect |
| --- | --- |
| *(none)* | the film: 1440×810 (or viewport), 20 s loop, no UI |
| `?finish=raw` / `?raw=1` | bypass the shader, show the raw ink plate |
| `?lab=1` | hidden lab: node graph, params, camera tab, LoD forcing, export |
| `?ui=1` / `?panel=1` | opens the scene-control sidebar (hidden by default) |
| `?cam=cinematic\|fps\|third\|drone` | starts in a camera mode (`orbit`/`fly`/`auto`/`user` are aliases) |
| `?shot=rig\|tripod\|crane\|orbit\|detail` | picks a cinematic shot |
| `?hud=0` | hides the camera help line |
| `?scale=0.7` | pins the render scale (also disables the adaptive governor) |
| `?stats=1` | opens the stats overlay at boot |
| `?palette=patent\|ink\|bw\|mobius\|custom` | boots into a colour palette |
| `?capture=1` | keeps `preserveDrawingBuffer` on, for canvas readback |
| `?ui=1` / `?panel=1` | shows the UI at boot (it is hidden by default) |

`window.VALE = { graph, scene, renderer, lab, sidebar, state, stats, perf, W, H,
DURATION, setQuality, setUI, setPalette, palette }`.

### Turn 12 — what changed

- **Glass case**: four panes plus a lid, gradient + sheen, no posts/rails/plinth.
- **Street**: 11.8 m wide (`ROAD_EDGE`), lanes ±2.6, parking at the kerbs,
  4.6 m crossing, signal arms 4.3 m.
- **Crowd**: heading sampled from the path a fraction of a second ahead, so
  turns are anticipated and nobody slides sideways; still bit-exact per loop.
- **Train**: clipped to the cell, so it enters and leaves through the cut faces.
- **Cells**: `src/cells.js` + `bufferStyle = developed | wireframe | points`;
  the eight neighbours are complete cells with their own block, markings and
  street furniture, at a detail level that falls off with distance.
- **Palettes**: Möbius, Patent sketch, Ink, B/W, Custom (`src/palette.js`);
  paper/ink ramp with gamma + contrast and accent preservation, applied at the
  Painter, so the whole plate (and therefore the finished print) changes.
- **Keys**: `Tab` panel · `\` stats · `H` hide all UI · `C` camera.

### Turn 11 controls

| Input | Effect |
| --- | --- |
| `\` | show / hide the entire UI (hidden on load) |
| `Tab` | scene sidebar (while the UI is shown) |
| `L` | lab |
| `C`, `1`–`4` | cycle / jump camera mode — **drone is the default** |
| hover the top-right | the sidebar handle fades in |

Sidebar sections: **Performance** (stats overlay, adaptive resolution, render
scale, seven feature switches), **Buffer volume** (3×3 grid of neighbour
toggles — all off by default — style wireframe/point cloud, opacity, none/all),
**Case** (back wall, left wall, case boundaries, LoD), camera, scene, texture,
palette, playback.

### Frame budget

The plate is still painted on Canvas2D; the WebGL2 pass is the compositor. What
changed this turn is that everything expensive can be switched off at the
source, and nothing is compiled into the shader unless it contributes:

- Dead shader nodes are stripped at compile time (`ShaderGraph.isLive`).
- Textures are allocated once and updated with `texSubImage2D`.
- `preserveDrawingBuffer` is off unless `?capture=1`.
- The field pass is skipped (blank field cached) when rain and puddles are off.
- An adaptive governor moves the render scale 45–100 % to hold 60 fps.

Node benchmark (1440×810, real-time pacing, 120 frames): **31.3 ms** with
everything on, down from 54.7 ms at the start of the turn. Ablation: crowd off
21.5, vehicles off 26.1, rain + puddles off 21.9, signals off 28.7, walls closed
30.3. The static set is cached, so it costs ~1.6 ms a frame instead of 39 ms
(it repaints on ~13 % of frames). Resolution remains the biggest single lever:
75 % ≈ 27 ms, 50 % ≈ 18 ms.

### Camera controllers (modular)

`src/camera-modes.js` — `CameraMode` base (`enter/exit/update/onWheel/reset/place`)
plus four controllers:

| Mode | Key | What it does |
| --- | --- | --- |
| `CinematicMode` | `V` | the authored `CameraRig`, plus steady shots `rig`, `tripod`, `crane`, `orbit`, `detail` (`[` / `]` steps) |
| `FpsMode` | `2` | eye height 1.66 m, walk 3.2 m/s, run 6.4, gentle bob, clamped inside the tile |
| `ThirdPersonMode` | `3` | ground character with damped facing, orbit distance 1.8–12 m, wheel zoom |
| `DroneMode` | `4` | free flight, `Q`/`E` down/up, `Shift` boost, wheel sets speed |

`src/camera-director.js` owns the shared state (`eye/target/fov/roll/yaw/pitch/keys`),
all window-level input (pointer look, wheel, keys; right-drag is ignored), the HUD,
and `setMode / cycle / setShot / place / apply`. A new controller is one class plus
one entry in `MODES`; no input code changes. `C` cycles, `1`–`4` jump directly.

### Case frame and depth sorting

`environment.collectFrame(p, camera, params)` returns frame members as
`{ depth, draw, group }`. The back shell, cut faces, plinth and label are grouped
`far` and drawn before the set; the near posts, rails and corner ticks are merged
into the scene's depth-sorted drawable list (same `Camera.project().depth`
convention as vehicles and people), so a post in front of a car occludes it and
one behind it is hidden. `params.caseFrame = 0` removes the case entirely —
verified by A/B stills (with rain disabled so the comparison is stable).

### Sidebar (`src/sidebar.js`)

Hidden by default; `Tab` or the ☰ handle opens it. Sections: **Camera** (mode,
shot, HUD), **Scene** (crowd density, walk tempo, rain amount/speed, puddles,
wind), **Texture** (smudge toggle, master plate-texture fader, hatch, contour,
grain, fiber, vignette, "No smudge", "Reset"), **Palette** (preset, posterize,
bleed, accent), **Case** (boundaries toggle, LoD), **Playback** (play/pause,
restart, speed). 24 rows, each with a `sync()` that re-reads the live value, so
external changes (lab, preset, keyboard) flow back into the panel.

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

- `npm run verify` (check → build → boot → finite) passes; `npm run build` →
  141.5 KiB self-contained file.
- Luminance this build: 900×506 **dark 46.8–60.3 %**, mid 32.5–42.1 %, bright
  6.8–11.2 %; 640×360 dark 46.8–58.4 %. (Earlier 1440×810: dark 52.7–62.8 %.)
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

## 4b. Determinism and performance (Turn 10)

**The film is a perfect 20 s loop.** Nothing integrates over `dt`; every drop,
person and vehicle is `f(seed, t)` with `f(seed, t+20) === f(seed, t)`.
`npm run determinism` (part of `npm run verify`) renders t and t+20 from a cold
scene and after a full playback and compares PNG bytes; it is bit-exact at
three sample times. `src/loop.js` holds the primitives (periods quantised to
`20 / integer`, seamless `loopNoise`, `boundaryAlpha`).

**Loop over fade.** Crowd walkers enter from the tile edge, wait at the kerb,
cross on the green and walk off the far side; alpha comes from
`params.loopBuffer` (metres), so nothing dissolves mid-frame. Vehicles pull up
to the stop line, wait out the pedestrian window, drive through and wrap
off-screen. Rain drops fall on quantised periods and their ripples are derived
from landing times.

**Frame time** (Node canvas benchmark, same machine): 1440×810 **54.7 → 21.9
ms**, 1280×720 15.7 ms, 900×506 11.6 ms. Two changes did most of it:

1. `Scene._ensureStatic` paints the set once into a cached canvas and blits it
   with a sub-pixel offset (repaint when the camera drifts > 2.5 px, when the
   LoD changes, or at the loop point).
2. The plate follows the viewport (≤ 1.25× DPR) instead of a fixed 1440×810;
   `?scale=` / the sidebar render-scale row shrink the shader too.

**`S` was the stutter.** `lab.js` bound a bare `S` to `saveFrame()`, so walking
backwards in first person exported a full-resolution PNG every step. It now
needs `Ctrl/Cmd+S` and only fires while the lab is open.

## 4c. What this turn added

- Modular camera modes + director, replacing the old orbit/fly controller
  (`src/camera-control.js` deleted; nothing imports it).
- Case-frame depth sorting with a `caseFrame` visibility toggle.
- Sidebar panel with a smudge toggle and a relative master texture fader.
- `PRESETS.linocut` softened at the preset level (hatch 0.20 → 0.11, contour
  0.40 → 0.24, fiber 0.045 → 0.026, vignette 0.16 → 0.11). Editing node defaults
  alone does nothing at runtime — `applyPreset` overwrites them at boot.

## 5. Honest weaknesses

1. **No real browser verification.** The sandbox has no browser (apt, the
   Playwright CDN and puppeteer's Chrome download are all blocked), so the
   ink plate is judged from `@napi-rs/canvas` stills; startup is validated by
   `tools/boot-smoke.mjs`. The WebGL finish itself still has not been seen.
2. **The front-left quadrant is still the thinnest area.** It has a bench,
   planters, bollards, a poster column, a lamp and a tree, but they are small and
   dark, so the corner reads as pavement.
3. **People are still schematic.** They read correctly at 1× (silhouette,
   head, umbrella) but close-up crops show a cone-like coat and a floating
   canopy. That is acceptable for a *template*, not yet for a hero shot.
4. **Vehicles are dark slabs.** The gradient and rim helped; interiors are not
   modelled at all.
5. **LoD 2 loses too much of the shopfronts.** Their lit windows survive, the
   frames do not.
6. **The smudge cannot be judged here.** The stills bypass the WebGL finish
   passes, so hatch/detail/paper strengths must be eyeballed in a real browser.
7. **Tiling is not yet demonstrated in-engine.** The tile is authored to snap
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

1. Fill the front-left quadrant properly: a bus shelter with a lit panel, a bike
   rack, café tables under an awning, and two or three more walkers on that
   sidewalk.
2. Second crowd pass: coat silhouettes that are less conical, umbrellas that
   sit on the head instead of hovering.
3. `tools/tiles.mjs`: render two tiles along x into one sheet to prove the
   snapping and to show the seam.
4. Vehicle interiors / glazing at L0 only.
5. Get a browser into CI (GitHub Actions can screenshot the real WebGL output)
   so the finish is finally validated.
