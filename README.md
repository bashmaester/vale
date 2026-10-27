# VALE — rainy crossing

A silent, autoplaying 20-second film in **one self-contained `index.html`**. A rainy Tokyo **street corner** is built as a real 3D volume set, projected into a 2D “printing plate,” then finished by a node-based GLSL print pipeline. No outside visual assets, no fonts, no network requests, no audio, and no visible website UI during playback.

> **Status (2026-10-27):** the current build is a working technical scaffold, **not an approved visual result**. The latest user feedback is “very underwhelming” and “almost none of my notes have landed.” Before making further visual changes, read `docs/CURRENT_STATE.md` and `docs/HANDOFF.md`, then validate real browser screenshots against the supplied references.

> Note: this branch arrived with only the initial `README.md`. The implementation here is a fresh rebuild of the foundation around the hybrid 3D→2D direction, not a restoration of files from the earlier session.

---

## Quick start

```bash
npm install
npm run build           # regenerates the self-contained index.html
npm run docs            # regenerates deploy metadata + docs/index.html
npm run deploy:local    # build + docs
npm run dev             # builds, then serves on http://localhost:8000
```

Or just open `index.html` directly — it works from `file://` because everything is inlined.

Useful URLs:

| URL | Effect |
| --- | --- |
| `index.html` | clean film, autoplay, 20s loop, no UI |
| `index.html?lab=1` | opens the hidden node / scene / camera / timeline lab |
| `index.html?cam=fps` | first-person walk (also `third`, `drone`, `cinematic`) |
| `index.html?shot=crane` | cinematic shot: `rig`, `tripod`, `crane`, `orbit`, `detail` |
| `index.html?ui=1` | opens the scene-control sidebar (also `?panel=1`) |
| `index.html?scale=0.7` | renders the plate/shader at 70 % for slower machines |
| `index.html?hud=0` | disables the tiny camera help line |
| `index.html?preset=riso` | starts with the Risograph look |
| `index.html?t=11` | starts at 11 seconds |
| `index.html?w=1920&h=1080` | renders at a different internal resolution |
| `index.html?lab=1&paused=1&t=7` | paused lab frame for inspection |

Keyboard shortcuts: `L` lab, `Tab` scene controls. Inside the lab: `Space`
play/pause, `R` reset, `Ctrl/Cmd+S` save a PNG frame (a bare `S` used to save one
on every step backwards — it no longer does anything outside the lab). Camera: `C` cycles cinematic → first person →
third person → drone, `1`–`4` jump straight to a mode, `V` returns to the
cinematic rig, `[` / `]` step through the steady shots. Left-drag looks, wheel
zooms (dollies in drone), `WASD` moves, `Shift` runs/boosts, `Q`/`E` descend and
climb in drone. **There is no right-drag pan** — that was explicitly dropped in
favour of game-style navigation.

---

## A perfect 20 s loop

`src/loop.js` is the rulebook: **nothing in the scene integrates state over
`dt`**. Every drop, person and vehicle is `f(seed, t)` with
`f(seed, t + 20) === f(seed, t)`, so `npm run determinism` can assert that the
plate at t and t + 20 is byte-identical — from a cold scene *and* after a full
playback.

- Rain: each drop has a seeded start, a fall period quantised to `20 / integer`
  seconds and a phase; its height is `loopFrac(t, period)`. Ripples are derived
  from the moment a drop lands, so they cannot drift out of phase.
- Crowd: walkers come in from the edge of the tile, wait at the kerb, cross on
  the green, and walk off the far side. `loopBuffer` (metres) is the boundary
  band where they fade; the loop point happens while they are already invisible.
- Traffic: a car pulls up to the stop line, waits out the pedestrian window,
  drives through and wraps off-screen. No mid-scene fades.
- Idle sway, line boil and the shader's grain all run on integer-cycle
  oscillators, so the loop point is seamless rather than a cut.

## Performance

The set never moves relative to itself, so it is painted once into a cached
layer (`Scene._ensureStatic`) and blitted with a sub-pixel offset until the
camera has drifted more than 2.5 px. That alone took the frame from ~55 ms to
~22 ms at 1440×810 in the Node canvas benchmark. The plate also follows the
viewport (max 1.25× DPR) instead of always rendering 1440×810, and `?scale=`
or the sidebar's *render scale* row buys more headroom on weak GPUs.

## The hybrid pipeline

The disagreement with the earlier “go pure 2D” recommendation is the point of this build: the scene is **not** a flat illustration pretending to be 3D, and it is **not** a textured 3D render pretending to be a print. It is a representation pipeline:

```
parametric 3D modules ─┐
keyframed 3D camera  ─┼─▶ perspective projection ─▶ 2D ink plate + field plates
signal-cycle timeline ─┘                                   │
                                                          ▼
                                             node-based GLSL look graph
                                                          │
                                                          ▼
                                             black / white / red / teal film
```

### 1. 3D scene graph

`src/tile.js`, `src/environment.js`, `src/crowd.js` and `src/traffic.js` describe one built-out corner in world space (`x` right, `y` up, `z` toward the viewer):

- two crossing road strips and four raised sidewalk **boxes**; only the northeast corner is fully built out, the other three are simple receiving slabs;
- four straight zebra crossings, stop lines, lane dividers, direction arrows, manhole covers and tactile paving;
- four cubic building volumes on the corner with windows, awnings, roof parapets and oriented 3D signs; wires and an elevated track behind them;
- traffic lights only at the four intersection corners, with vehicle and pedestrian heads on proper poles;
- three parked cars at legal curbs and two moving cars in separated lanes — five vehicles total, not a traffic jam;
- about 92 crossers plus 30 waiters drawn as varied tiny architectural-sketch people: archetypes, coat shapes, head shapes, long shadows, umbrellas, bags, dogs, bicycles, strollers, companions and more — all projected from 3D world points;
- a five-car train passing overhead;
- raindrops and puddle ripples that are pure functions of loop time (see below), drawn into the plate rather than faked with a shader overlay;
- grid-hashed separation so people scatter meaningfully, vehicles keep their lanes, and walkers avoid vehicle hulls.

The camera is modular. `src/camera-modes.js` holds one class per navigation style —
`CinematicMode` (the authored rig plus steady tripod / crane / orbit / detail
shots), `FpsMode`, `ThirdPersonMode` and `DroneMode` — behind a `CameraMode` base
(`enter/exit/update/onWheel/reset/place`). `src/camera-director.js` owns the
shared input plumbing (pointer look, wheel, keys, HUD) and swaps modes at
runtime; a new controller is one file plus one entry in `MODES`. All geometry is
projected through `Camera.project()` in `src/math.js`, so the camera really is 3D
and the volumes change perspective — but the output is still a flat plate.

### 2. 2D printing plates

`src/scene.js` renders two offscreen canvases each frame:

- **`plate`** — the main ink image: black paper, white/teal/red line work. Set, puddles, cars, people and rain are drawn here in that order.
- **`field`** — a data texture: `R` = puddle mask, `G` = crowd/motion density, `B` = train/signal accent bloom.

There is no wet-glass plate. `src/weather.js` keeps a persistent raindrop particle system and puddle ripple simulation; drops fall in 3D, land, and spawn expanding rings and splash spikes. `src/draw.js` is the hand-drawn rasterizer: rough polylines with line boil, jittered polygons, projected 3D boxes, oriented `sign3D()` quads, abstract glyphs and splashes. Static geometry is still projected every frame so the camera can move.

### 3. Node-based look graph

`src/shaders.js` and `src/graph.js` implement a tiny modular shader system. Each node owns GLSL plus typed parameters; `ShaderGraph.compile()` topologically sorts the graph and emits one WebGL2 fragment shader:

| Node | Role |
| --- | --- |
| `01 · Plate / misregister` | samples the plate, offsets red/blue channels, adds gate weave |
| `02 · Carve / gouge` | edge-aware lino cuts, boiling tool marks, white scratches |
| `03 · Edge detail` | tangent-following contour cuts, micro scratches, edge sparks |
| `04 · Broken hatch` | noisy angle drift, variable spacing, wandering/broken lines, cross hatch |
| `05 · Puddle mask (plate only)` | disabled pass-through; rain/puddles are simulated on the plate |
| `06 · Ink separation` | bleed, dither, four-color posterization, accent bloom |
| `07 · Paper / grain` | grain, fiber, speckle, vignette, projector flicker |
| `08 · Output` | exposure and contrast |

The hatch node deliberately avoids uniform parallel lines: `fbm` warps angle and
spacing, a second noise field breaks strokes, and a secondary rotated pass adds
cross-hatching only in the darkest areas. The `detail` node expresses edges with
contour cuts and micro scratches.

The optional lab (`src/lab.js`) draws this graph as draggable nodes with live
sliders, plus **SCENE**, **CAM** and **TIME** tabs. Double-click a node to bypass
it. Presets: **Linocut**, **Risograph**, **Newsprint**, **Blueprint**. Changes are
uniforms, so they are live with no shader rebuild.

This is raw GLSL ES 3.0 rather than Three.js TSL: it keeps the deliverable to one file with zero runtime dependencies. The graph compiler is the seam where a TSL/WebGPU adapter could be added later without touching the scene modules.

---

## The 20-second signal cycle

`src/timeline.js` is the single source of truth. Every module reads the same normalized time `u = t / 20`:

| Time | Phase | Visual state |
| --- | --- | --- |
| 0.0–3.2s | `WAIT` | umbrellas gathered mostly on the built-out corner, red signals, parked cars |
| 3.2–4.4s | `SIGNAL` | teal lamps rise, people lean into the two crossings |
| 4.4–13.6s | `CROSS` | straight and diagonal routes cross slowly; train passes; raindrops ripple puddles |
| 13.6–16.4s | `DRAIN` | crowd thins toward the far sidewalks, ripples keep expanding |
| 16.4–18.0s | `EMPTY` | road almost clear; zebra, raindrops and puddles dominate |
| 18.0–20.0s | `TRAFFIC` | two cars cross in legal lanes, headlights cut through rain, umbrellas gather again |

The loop is designed to be seamless: crossers are invisible while offscreen, vehicles reset offscreen, and the crowd fades back into the waiting corners before `u` wraps. Secondary animation (rain, grain, line flicker, idle sway and gait cadence) uses `timeline.motionT = 0.62 × t`; the signal cycle itself remains exactly 20 seconds.

---

## Repository layout

```
index.html                       final self-contained film (generated; commit this)
build.mjs                        inlines CSS + bundled JS into index.html
scripts/update-docs.mjs          deploy docs / metadata generator
.github/workflows/deploy-pages.yml  GitHub Actions → Pages
docs/HANDOFF.md                  resume point for interrupted sessions
docs/ARCHITECTURE.md             system design
docs/CHANGELOG.md                turn-by-turn changes
docs/CI.md                       deployment notes
docs/BUILD.md, DEPLOY_STATUS.md, manifest.json, index.html   generated on deploy
src/template.html                HTML shell
src/style.css                    fullscreen film + hidden lab + camera HUD
src/math.js                      noise, easing, RNG, perspective camera
src/draw.js                      rough-stroke painter, 3D boxes, sign3D()
src/world.js                     corner layout, sidewalks, crosswalks, flows, lanes, parking
src/collision.js                 separation + Poisson-disk blue noise
src/shaders.js                   GLSL node definitions + presets
src/graph.js                     node graph compiler / uniforms / serialization
src/renderer.js                  WebGL2 fullscreen pass + 2D fallback
src/camera.js                    keyframed cinematic rig (used by CinematicMode)
src/camera-modes.js              modular controllers: cinematic/fps/third/drone
src/camera-director.js           mode switching, input plumbing, camera HUD
src/sidebar.js                   hidden authoring sidebar (Tab)
src/timeline.js                  one signal cycle
src/environment.js               cubic corner set: roads, sidewalks, buildings, signals
src/crowd.js                     varied tiny 3D people, walk cycle, long shadows
src/traffic.js                   five vehicles + train, legal curbs and lanes
src/weather.js                   raindrop particles, puddle ripples, field data texture
src/scene.js                     orchestrates plate/field, camera, modules, separation
src/lab.js                       optional node/scene/camera/timeline editor
src/main.js                      wiring, query params, animation loop
```

`index.html` contains no `<script src>`, no `<link href>`, no images, and no external URLs. The only build dependency is `esbuild`, used at authoring time to inline the ES modules.

---

## CI / Pages / handoff

Every push to any branch (the workflow listens on `['**']`) runs
`.github/workflows/deploy-pages.yml`: install → build → validate
self-containment → regenerate docs → upload `_site/` → deploy with
`actions/deploy-pages`. `npm run docs` writes fresh commit/branch/timestamp
metadata into `docs/BUILD.md`, `docs/DEPLOY_STATUS.md`, `docs/manifest.json`
and `docs/index.html`.

The human-authored handoff is `docs/HANDOFF.md`. Update it at the end of each
turn so an interrupted session can resume from the current objective, known
issues and next steps. See `docs/CI.md` for troubleshooting.

---

## Design intent

The references are not simulations: they are **representations that embody the structure and feeling** of a place. This turn builds one corner as a cubic volume set first — roads, sidewalks, buildings, signals, cars — then adds a varied crowd and finally real raindrop/puddle simulation. People are tiny architectural-sketch marks projected from 3D world points with a real walk cycle, so a flown camera sees believable perspective rather than sliding sprites. Vehicles are essential lines with wheels and silhouettes, not detailed models. There is no procedural wet-glass overlay; rain and puddles are actual particles and ripples. Shared world rules keep cars in legal lanes, off crosswalks and apart from people. The shader graph flattens everything back into a consistent black/red/teal/white print.
