# VALE — rainy crossing

A silent, autoplaying 20-second film in **one self-contained `index.html`**. A rainy Tokyo scramble crossing is built as a real 3D scene, projected into a 2D “printing plate,” then finished by a node-based GLSL print pipeline. No outside visual assets, no fonts, no network requests, no audio, and no visible website UI during playback.

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
| `index.html?cam=fly` | starts in user fly camera |
| `index.html?hud=0` | disables the tiny camera-control HUD |
| `index.html?preset=riso` | starts with the Risograph look |
| `index.html?t=11` | starts at 11 seconds |
| `index.html?w=1920&h=1080` | renders at a different internal resolution |
| `index.html?lab=1&paused=1&t=7` | paused lab frame for inspection |

Keyboard shortcuts: `L` lab, `Space` play/pause, `S` save PNG frame, `R` reset all
parameters, `C` release/take camera, `F` fly/orbit, `V` or `0` reset camera. While
flying: `WASD/QE` move, `Shift` boosts, drag looks, right-drag pans, wheel zooms.

---

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

`src/world.js`, `src/environment.js`, `src/crowd.js`, `src/traffic.js`, `src/camera.js` and `src/camera-control.js` describe the crossing in world space (`x` right, `y` up, `z` toward the viewer):

- two crossing roads, four raised sidewalk blocks, straight zebra crossings on every approach, faint diagonal scramble guides, stop lines, curbs, lane dividers and direction arrows;
- low buildings with windows, awnings, wires, elevated track and signals; signs are oriented 3D quads that foreshorten instead of billboarding;
- about 158 crossers plus 42 waiters drawn as tiny architectural-sketch people: head dots, solid coats, short legs, ground shadows, varied umbrellas, hats, bags, dogs, strollers and children — all projected from 3D world points;
- eight walking routes (four straight crossings plus four diagonal scrambles) and a slower secondary motion clock so the crowd walks instead of sprints;
- six vehicles with wheels, cabins, windshields, truck/van/bus/taxi silhouettes, split into legal left/right lanes so opposing streams never share asphalt;
- a six-car train passing overhead;
- rain, puddles, quiet wet reflections and gouged footprints;
- grid-hashed separation so people scatter meaningfully, vehicles keep their lanes, and walkers avoid vehicle hulls.

`src/camera.js` is a small keyframed rig. It pushes in during the surge, drifts with the train, then pulls back for the empty street. `src/camera-control.js` lets the user take over: orbit, pan, zoom or fly. All geometry is projected through `Camera.project()` in `src/math.js`, so the camera really is 3D and the figures change perspective — but the output is still a flat plate.

### 2. 2D printing plates

`src/scene.js` renders three offscreen canvases each frame:

- **`plate`** — the main ink image: black paper, white/teal/red line work.
- **`wet`** — reflections built with additive strokes, then broken by dark footprint shapes (`destination-out`) before being screened onto the plate.
- **`field`** — a data texture: `R` = wetness/reflection zone, `G` = crowd/motion density, `B` = train/signal accent bloom.

`src/draw.js` is the hand-drawn rasterizer: rough polylines with line boil, jittered polygons, projected 3D boxes, oriented `sign3D()` quads, abstract glyphs and splashes. Static geometry is still projected every frame so the camera can move.

### 3. Node-based look graph

`src/shaders.js` and `src/graph.js` implement a tiny modular shader system. Each node owns GLSL plus typed parameters; `ShaderGraph.compile()` topologically sorts the graph and emits one WebGL2 fragment shader:

| Node | Role |
| --- | --- |
| `01 · Plate / misregister` | samples the plate, offsets red/blue channels, adds gate weave |
| `02 · Carve / gouge` | edge-aware lino cuts, boiling tool marks, white scratches |
| `03 · Edge detail` | tangent-following contour cuts, micro scratches, edge sparks |
| `04 · Broken hatch` | noisy angle drift, variable spacing, wandering/broken lines, cross hatch |
| `05 · Rain / reflections` | subtle stretched rain noise and faint wet-streak reflections |
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
| 0.0–3.2s | `WAIT` | dense umbrellas at four corners, red signals, parked vehicles |
| 3.2–4.4s | `SIGNAL` | teal lamps rise, umbrellas lean into the crossing |
| 4.4–13.6s | `CROSS` | eight routes (straight + diagonal) surge slowly; train passes; footsteps break reflections |
| 13.6–16.4s | `DRAIN` | crowd thins toward the far sidewalks, reflections begin to reform |
| 16.4–18.0s | `EMPTY` | road almost clear; zebra, rain and quiet wet reflections dominate |
| 18.0–20.0s | `TRAFFIC` | vehicles cross in legal lanes, headlights smear, umbrellas gather again for the loop |

The loop is designed to be seamless: crossers are invisible while offscreen, vehicles reset offscreen, and the crowd fades back into the waiting corners before `u` wraps. Secondary animation (rain boil, grain, line flicker, idle sway and gait cadence) uses `timeline.motionT = 0.62 × t`; the signal cycle itself remains exactly 20 seconds.

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
src/world.js                     sidewalks, crosswalks, 8 flows, lanes, parking rules
src/collision.js                 separation + Poisson-disk blue noise
src/shaders.js                   GLSL node definitions + presets
src/graph.js                     node graph compiler / uniforms / serialization
src/renderer.js                  WebGL2 fullscreen pass + 2D fallback
src/camera.js                    keyframed camera rig
src/camera-control.js            user orbit / fly camera
src/timeline.js                  one signal cycle
src/environment.js               street set, sidewalks, buildings, oriented signs
src/crowd.js                     tiny 3D people, walk cycle, footprints
src/traffic.js                   detailed vehicles + train + light reflections
src/weather.js                   rain, wet reflections, field data texture
src/scene.js                     orchestrates plates, camera, modules, separation
src/lab.js                       optional node/scene/camera/timeline editor
src/main.js                      wiring, query params, animation loop
```

`index.html` contains no `<script src>`, no `<link href>`, no images, and no external URLs. The only build dependency is `esbuild`, used at authoring time to inline the ES modules.

---

## CI / Pages / handoff

Every push to `arena/082e9ffd-vale` (and `main`) runs
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

The references are not simulations: they are **representations that embody the structure and feeling** of a place. People are tiny architectural-sketch marks with umbrellas — still projected from 3D world points and a real walk cycle, so a flown camera sees believable perspective rather than sliding sprites. Vehicles are essential lines with wheels and silhouettes, not detailed models. Rain and puddles are atmosphere; wet reflection noise is deliberately quiet. Shared world rules keep cars in legal lanes, off crosswalks and apart from people. The system has enough parametric complexity to stage waiting, crossing and emptiness clearly — but the shader graph flattens everything back into a consistent black/red/teal/white print.
