# VALE — rainy crossing

A silent, autoplaying 20-second film in **one self-contained `index.html`**. A rainy Tokyo scramble crossing is built as a real 3D scene, projected into a 2D “printing plate,” then finished by a node-based GLSL print pipeline. No outside visual assets, no fonts, no network requests, no audio, and no visible website UI during playback.

> Note: this branch arrived with only the initial `README.md`. The implementation here is a fresh rebuild of the foundation around the hybrid 3D→2D direction, not a restoration of files from the earlier session.

---

## Quick start

```bash
npm install
npm run build      # regenerates the self-contained index.html
npm run dev        # builds, then serves on http://localhost:8000
```

Or just open `index.html` directly — it works from `file://` because everything is inlined.

Useful URLs:

| URL | Effect |
| --- | --- |
| `index.html` | clean film, autoplay, 20s loop, no UI |
| `index.html?lab=1` | opens the hidden node / parameter lab |
| `index.html?preset=riso` | starts with the Risograph look |
| `index.html?t=11` | starts at 11 seconds |
| `index.html?w=1920&h=1080` | renders at a different internal resolution |
| `index.html?lab=1&paused=1&t=7` | paused lab frame for inspection |

Keyboard shortcuts (when the lab is open or closed): `L` toggles the lab, `Space` plays/pauses, `S` saves a PNG frame, `R` resets all parameters.

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

`src/environment.js`, `src/crowd.js`, `src/traffic.js` and `src/camera.js` describe the crossing in world space (`x` right, `y` up, `z` toward the viewer):

- buildings, signage, wires, elevated track, signals, zebra markings and manholes;
- ~120 crossing pedestrians plus ~30 waiting umbrellas, each a parametric 3D position projected to 2D;
- vehicles as essential 3D boxes with minimal window grids and lamps;
- a six-car train passing overhead;
- rain, wet-road reflections and gouged footprints.

`src/camera.js` is a small keyframed rig. It pushes in during the surge, drifts with the train, then pulls back for the empty street. All geometry is projected through `Camera.project()` in `src/math.js`, so the camera really is 3D — but the output is a flat plate.

### 2. 2D printing plates

`src/scene.js` renders three offscreen canvases each frame:

- **`plate`** — the main ink image: black paper, white/teal/red line work.
- **`wet`** — reflections built with additive strokes, then broken by dark footprint shapes (`destination-out`) before being screened onto the plate.
- **`field`** — a data texture: `R` = wetness/reflection zone, `G` = crowd/motion density, `B` = train/signal accent bloom.

`src/draw.js` is the hand-drawn rasterizer: rough polylines with line boil, jittered polygons, projected 3D boxes, screen-space signboards, abstract glyphs and splashes. Static geometry is still projected every frame so the camera can move.

### 3. Node-based look graph

`src/shaders.js` and `src/graph.js` implement a tiny modular shader system. Each node owns GLSL plus typed parameters; `ShaderGraph.compile()` topologically sorts the graph and emits one WebGL2 fragment shader:

| Node | Role |
| --- | --- |
| `01 · Plate / misregister` | samples the plate, offsets red/blue channels, adds gate weave |
| `02 · Carve / gouge` | edge-aware lino cuts, boiling tool marks, white scratches |
| `03 · Directional hatch` | angled carved hatching in dry dark areas |
| `04 · Rain / reflections` | stretched rain noise and gouged wet-streak reflections |
| `05 · Ink separation` | bleed, dither, four-color posterization, accent bloom |
| `06 · Paper / grain` | grain, fiber, speckle, vignette, projector flicker |
| `07 · Output` | exposure and contrast |

The optional lab (`src/lab.js`) draws this graph as draggable nodes with live sliders. Double-click a node to bypass it. Presets: **Linocut**, **Risograph**, **Newsprint**, **Blueprint**. Changes are uniforms, so they are live with no shader rebuild.

This is raw GLSL ES 3.0 rather than Three.js TSL: it keeps the deliverable to one file with zero runtime dependencies. The graph compiler is the seam where a TSL/WebGPU adapter could be added later without touching the scene modules.

---

## The 20-second signal cycle

`src/timeline.js` is the single source of truth. Every module reads the same normalized time `u = t / 20`:

| Time | Phase | Visual state |
| --- | --- | --- |
| 0.0–3.2s | `WAIT` | dense umbrellas at four corners, red signals, parked vehicles |
| 3.2–4.4s | `SIGNAL` | teal lamps rise, umbrellas lean into the crossing |
| 4.4–11.7s | `CROSS` | two diagonal streams surge; train passes; footsteps break reflections |
| 11.7–15.8s | `DRAIN` | crowd thins toward the far edges, reflections begin to reform |
| 15.8–18.2s | `EMPTY` | road almost clear; zebra, rain and wet reflections dominate |
| 18.2–20.0s | `TRAFFIC` | vehicles cross, headlights smear, umbrellas gather again for the loop |

The loop is designed to be seamless: crossers are invisible while offscreen, vehicles reset offscreen, and the crowd fades back into the waiting corners before `u` wraps.

---

## Repository layout

```
index.html            final self-contained film (generated; commit this)
build.mjs             inlines CSS + bundled JS into index.html
src/template.html     HTML shell
src/style.css         fullscreen film + hidden lab styling
src/math.js           noise, easing, RNG, perspective camera
src/draw.js           rough-stroke 2D painter + 3D box projection helpers
src/shaders.js        GLSL node definitions + presets
src/graph.js          node graph compiler / uniforms / serialization
src/renderer.js       WebGL2 fullscreen pass + 2D fallback
src/camera.js         keyframed camera rig
src/timeline.js       one signal cycle
src/environment.js    road, zebra, buildings, wires, signs, signals, track
src/crowd.js          umbrellas, figures, flow lines, footprints
src/traffic.js        train + vehicles + light reflections
src/weather.js        rain, wet reflections, field data texture
src/scene.js          orchestrates plates and modules
src/lab.js            optional node/parameter editor
src/main.js           wiring, query params, animation loop
```

`index.html` contains no `<script src>`, no `<link href>`, no images, and no external URLs. The only build dependency is `esbuild`, used at authoring time to inline the ES modules.

---

## Design intent

The references are not simulations: they are **representations that embody the structure and feeling** of a place. People are architectural-sketch marks with umbrellas, not rigged characters. Vehicles are essential lines, not detailed models. Rain and grain are atmosphere, not physics. The system has enough parametric complexity to stage waiting, crossing and emptiness clearly — but the shader graph flattens everything back into a consistent black/red/teal/white print.
