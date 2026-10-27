# VALE — architecture

VALE is an engine foundation for a cosy procedural city sim. The unit of the
engine is a **tile**: a modular 3D volume — a cut-away box of city that can be
lifted out, inspected and snapped beside another tile. The sample scene is one
such tile, presented in a physical-looking case (plinth, corner posts, cut-face
caps, engraved label) so the modularity is visible.

Everything inside the tile is generated every frame. Nothing is loaded.

```
        tile.js ── volume, colours, LoD budgets ──┐
                                                  ▼
   world.js  ── data: road, sidewalks, crossing, lanes, lots, flows, puddles
                                                  │
        ┌─────────────────────────────────────────┤
        ▼                 ▼            ▼          ▼
  environment.js     traffic.js    crowd.js   weather.js
  (buildings,        (vehicles,    (people,   (rain, ripples,
   signals, props)    train)        umbrellas) puddles)
        └───────────────── projected to 2D ────────────┘
                            ▼
        scene.js — depth-sorted plate (ink) + field (R puddle / G crowd / B accent)
                            ▼
        shaders.js + graph.js — print finish (source→carve→detail→hatch→
                                rain*→palette→paper→output), *disabled pass-through
                            ▼
        renderer.js — WebGL2 fullscreen pass; `bypass` shows the raw plate
                            ▼
                        index.html
```

---

## 1. The tile (`tile.js`)

`TILE = { x0:-15, x1:15, z0:-14, z1:10.5, y0:-1.6, y1:15.6 }`.

The back wall (z = −14) and left wall (x = −15) are closed; +z and +x are the
open, cut-away faces. The camera sits in the open corner, so the volume reads as
a theatre set, and two tiles placed along x continue the road and the sidewalk
row without a seam. `groundYAt(x, z)` gives the walking surface including kerb
ramps; every foot, puddle and prop uses it.

**Procedural LoD is a property of the tile, not of each asset.** `LOD_LEVELS`
defines three budgets (hero / mid / far) and `lodForScreenHeight(px)` picks one
from the tile's projected height, or the lab forces one via `params.lod`.
`makeDetail(level)` returns the budget object that every drawable receives. The
modules then sample *their own* procedural description more coarsely — fewer
window columns, fewer props, a deterministic subset of people, fewer raindrops,
less hatching. `detail.allowed(fraction, seed)` is the shared seeded sampler, so
the same seed always yields the same subset at a given level: no flicker, no
popping between frames.

---

## 2. World data (`world.js`)

One tile's worth of geometry and intent:

- `ROAD` z −5.0…4.2 across the full x range, `SIDEWALKS` front 4.2→10.5 and
  back −14→−5.0.
- `CROSSWALKS.main` x −4.2…−0.8 (the only crossing; one corner, not an
  intersection).
- `LANES` z ±2.15, two `PARKING` bays, two `SIGNAL_POSITIONS`, four
  `BUILDING_LOTS`, seven `LIGHT_SOURCES`, four `WAIT_ZONES`, seven pedestrian
  `FLOWS`, ten `PUDDLES`.
- `isOnSidewalk`, `clampToWorld`, `weightedWaitZone` are the crowd's contact
  with the world.

---

## 3. Set construction (`environment.js`)

Drawn in explicit stages so the set reads as built rather than painted:

`drawBackdrop → drawStreet → drawPaving → drawRoadMarkings → drawBuildings →
drawSignals → drawFurniture → drawRail → drawReflections → drawFrameBack →
drawFrameFront`

- **Backdrop**: ground slab, back wall with a vertical gradient, a faint
  painted relief skyline behind the buildings.
- **Street / paving**: road base `#101215` with damp bands and a kerb-side
  sheen; sidewalk `#232327` front, `#17171a` back.
- **Markings**: edge lines, dashed lane dividers (`dash:[62,14]`), stop lines,
  a worn and scuffed zebra crossing, manholes, drain grates, tactile paving.
- **Buildings**: cubic masses from `BUILDING_LOTS`; window grid with ~26 % lit
  (warm ember), mullions, sills, balcony rails; the secondary facade runs at
  55 % density and 60 % light so the block reads solid. Shopfronts carry a
  transom bar, a counter line and an occasional silhouette behind the glass.
- **Signals**: vehicle head and pedestrian head are boxes with dark lens rings,
  an additive glow halo and a wet highlight; only at the crossing corner.
- **Furniture**: street trees (tapered trunk, root flares, 4–6 primary limbs,
  leaf cluster per tip, cast shadow), lamps and their pooled light, bollards,
  a poster column, a bicycle, boxes and crates.
- **Frame**: the case — plinth below `y0 − 0.35`, corner posts, cut-face caps,
  an engraved label plate.

---

## 4. Vehicles (`traffic.js`)

Vehicles are extruded 2D profiles (`PROFILES`: car, van, taxi, bus) swept along
the travel axis and projected. The near face gets a vertical gradient body fill
(top-lit → bottom-dark), a pale roof rim, a wet sheen streak, a door seam and a
body crease. Lamps are ellipses with an additive halo; stopped vehicles add a
brake glow. The overhead train is its own module: four cars, a continuous lit
band with mullions, red skirt line, cab windscreen with a teal marker, and an
under-carriage light pool, gated by `trainAlpha` so it passes through the
crossing on the timeline.

---

## 5. People (`crowd.js`)

Procedural people, last on the set:

- 34 × `density` crossers and 18 × `density` waiters, six archetypes
  (commuter, student, elder, child, tourist, worker) with their own scale,
  coat shape, head shape, umbrella probability, gait and lean.
- One filled silhouette per person — shoulders → hips → outer ankles → crotch,
  i.e. a leg split — plus a small head disc and, when moving, two arm strokes.
  Accessories (bag, briefcase, backpack, cane, balloon, …) appear only at L0.
- **Every pixel size derives from the projected body height** (`bodyPx`):
  `headR = max(1.0, bodyPx * 0.082)`, `lineW = clamp(bodyPx * 0.042, .55, 2.1)`.
  This is the lesson from the failed version: world-unit sizes went sub-pixel
  and turned every figure into a wireframe X.
- Umbrellas are domes: rim ring + mid ring + apex, with the rim plane tilted
  and a stub stem. A flat quad on a long stem reads as a flying saucer.
- Separation: `separate()` then `separateGroups()` then `clampToWorld`, so
  nobody overlaps and nobody leaves the tile.
- LoD thins people with a seeded hash and drops accessories before it drops
  silhouettes.

---

## 6. Rain (`weather.js`)

A real particle system: 240 drops with individual alpha and width, 56 ripple
rings that expand and fade, ten tinted puddles projected onto the ground with
`groundYAt`. Puddles also write into the field texture's R channel so the print
shader can treat wet ground differently. There is deliberately **no** wet-glass
canvas or screen-space rain overlay.

---

## 7. Plates (`scene.js`, `draw.js`)

`Scene.render(t, dt)` returns `{ plate, field }`.

- `Painter` (`draw.js`) draws everything as jittered polylines and polygons with
  a seed, so lines look carved by hand rather than vector-perfect. It supports
  fill, stroke, gradient fills (`gradient: [[t, colour], …]`), dashed lines,
  hatching and additive passes.
- The plate is the ink drawing. The field encodes R = puddle mask, G = crowd
  density, B = accent mask for the finish.
- Draw order: backdrop → street → paving → markings → rail → train → frameBack
  → buildings → signals → furniture → puddles → reflections → depth-sorted
  {vehicles, people} → rain → frameFront, then `weather.drawField`.

---

## 8. Finish (`shaders.js`, `graph.js`)

A node-based GLSL graph compiled to one fullscreen fragment shader: source
misregistration and warp, carve (ink edge), detail, hatch, a disabled rain pass,
palette (posterize, bleed, dither, accent), paper (grain, fibre, speckle,
vignette), output. `PRESETS` provides `linocut` (default), `plate` (raw),
`riso`, `newsprint` and `blueprint`. `renderer.bypass` shows the raw plate for
inspection and for the still tools.

---

## 8b. Camera controllers

`camera-modes.js` defines `CameraMode` (`enter/exit/update/onWheel/reset/place`)
and four implementations: `CinematicMode` (the authored `CameraRig` plus the
steady `SHOTS`: `rig`, `tripod`, `crane`, `orbit`, `detail`), `FpsMode`,
`ThirdPersonMode` and `DroneMode`. `camera-director.js` owns the shared state —
eye/target/fov/roll/yaw/pitch/keys — the window-level pointer, wheel and key
handlers, the HUD, and `setMode/cycle/setShot/place/apply`. `scene.js` asks the
director for the camera each frame and hands it to `CameraRig` only in cinematic
mode. Adding a controller means writing one class and pushing it into `MODES`;
no input code changes.

## 8c. The loop (`loop.js`)

The film is a pure function of loop time. `Timeline` exposes `t` (wrapped at
20 s) and `u` (0..1); everything else derives from it.

- `loopFrac(t, period, phase)` — the only way an element advances.
- `loopPeriod(base)` — snaps a period to `20 / integer` so it closes exactly.
- `loopNoise(seed, t)` — seamless noise built from integer-cycle sines; used for
  idle sway and lamp flicker.
- `boundaryAlpha(x, z, box, buffer, mode)` — the boundary buffer (`wrap`, `fade`
  or `clip`), driven by `params.loopBuffer` in metres.
- `seeded(seed, salt, a, b)` — stable per-element constants.

Rules: no `Math.random` at runtime, no `dt`-integrated state, no oscillator whose
frequency does not complete whole cycles per loop. `tools/determinism.mjs` (part
of `npm run verify`) renders t and t + 20 and fails on a single differing pixel.

`Scene._ensureStatic` caches the set in its own canvas; it repaints when the
camera drifts more than 2.5 px, when the LoD or `caseFrame` changes, and at the
loop point. The cached layer is blitted with the sub-pixel delta, which is why
the frame time dropped by more than half.

## 8d. Frame budget and the compiled look graph

`ShaderGraph` (`src/graph.js`) compiles the look into **one** fragment shader.
The rule is: a node that cannot change the image must not exist in it.

- `isLive(node)` — false when the node is disabled or when every key in its
  `bypass` list is 0 (e.g. `hatch.bypass = ['strength']`,
  `detail.bypass = ['contour','micro','spark']`, defined in `NODE_DEFS`).
- `compile()` emits functions, uniforms and calls **only for live nodes**, so
  setting a strength to 0 removes its texture reads and maths from the GPU.
- `activity()` returns a bit string of the live set. `Renderer.render()`
  compares it with `_activity` and rebuilds the program (once) when it changes.

`src/renderer.js` is a full-screen quad over two textures:

- The plate is a Canvas2D drawing; the field carries puddle/reflection masks.
- Textures are allocated once per size and updated with `texSubImage2D` —
  `texImage2D` reallocates VRAM every frame and was the single worst pattern in
  the old renderer.
- `preserveDrawingBuffer` is `false` unless `?capture=1`, because it forces the
  browser to keep a copy of the drawing buffer alive every frame.
- `bypass` (raw plate) and the 2D fallback blit the plate straight to a canvas.

The scene (`src/scene.js`) draws in this order, each stage timed into
`scene.profile` (EMA, shown by the stats overlay):

1. buffer cells (neighbours, behind the hero volume)
2. cached far layer → train → cached near layer
3. signals + lamp flicker
4. case frame members merged into the depth-sorted drawables
5. puddles, reflections
6. people + vehicles, sorted by projected depth
7. rain, then the field texture

`src/stats.js` is a self-contained overlay (no CDN): fps, ms, a 120-sample bar
graph with 16.7/33.3 ms guides, per-stage bars and the live feature flags.

## 9. Runtime surfaces

- `?finish=raw` / `?raw=1` — raw plate.
- `?lab=1` — node graph, scene params (crowd density, walk tempo, rain, puddles,
  wind, camera shake, LoD), camera tab, timeline scrubber, export.
- `?cam=cinematic|fps|third|drone`, `?shot=<id>`, `?hud=0` — camera modes and
  steady-shot selection (`orbit`/`fly`/`auto`/`user` stay as aliases).
- `?ui=1` / `?panel=1` — opens the authoring sidebar (`src/sidebar.js`); `Tab`
  or the ☰ handle toggles it, and it is hidden in a plain `index.html`.
- `window.VALE` — `{ graph, scene, renderer, lab, sidebar, state, W, H, DURATION }`.
- `tools/shot.mjs` renders stills headlessly through a DOM/canvas shim
  (`tools/canvas-env.mjs`) with an optional camera override.
