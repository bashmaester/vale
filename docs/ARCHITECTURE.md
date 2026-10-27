# VALE — architecture

VALE is an engine foundation for a cosy procedural city sim. The unit of the
engine is a **tile**: a modular 3D volume — a cut-away box of city that can be
lifted out, inspected and snapped beside another tile. The sample scene is one
such tile, presented inside a glass case — four panes and a lid, no posts or
rails — so the modularity is visible without any hardware along the boundary.
Neighbouring cells are complete copies of the same rules (`src/cells.js`), which
is what lets the street run straight through a seam.

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
a theatre set. The cell is an **intersection**: the east–west street runs
through the middle with a building row on each side, and a half north–south
street runs down each x edge. Each cell owns 3.0 m of carriageway and 2.4 m of
pavement, so two cells side by side meet in a 6.0 m street with a walk either
side — wide enough for a car to pass a parked one. The block between the
pavements is 19.2 m (`SIDE_STREET.blockX0..blockX1`).

The pavement is a **ring**: a band along each side of the block plus a corner
return at each end, with a 1.5 m radius on the outer corner (`KERB_RADIUS`),
so the kerb line and the pavement edge are one curve. A pedestrian can walk the
whole block without stepping off it, and cross the side street at the zebra
where the ring meets it.

**Cells tile by edge, not by copy.** `src/cells.js` paints a cell of a given
`kind`:

| kind | side streets | what it is for |
| --- | --- | --- |
| `street` | both x edges | continues the street; two side by side make a full NS street |
| `block` | none — rows run out to both edges | north/south of a street cell, so rows merge across the seam |
| `yard` | both, open lot inside | a street edge meeting something other than a block |

`defaultKindFor(dx, dz)` is the rule (E/W street, N/S block), and
`Scene.LAYOUTS` / `?layout=` applies a whole pattern. A city is a street grid
with T junctions, not nine copies of one intersection — that distinction is what
the kinds encode. A true **corner** tile (streets on two adjacent edges) is not
implemented yet: `cells.js` can only carry the street on the x edges. `groundYAt(x, z)` gives the walking surface including kerb
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

- `ROAD` z −5.9…5.9 across the block, 11.8 m wide, lanes at z ±2.6.
- `SIDE_STREET` x0/x1 = ∓11.4, half width 3.6: the north–south street down each
  edge, shared with the neighbour cell.
- `NORTH_BLOCK` z −14…−9.6 (buildings) and `SOUTH_BLOCK` z 8.3…10.5 (the shop
  row and its forecourt). `SIDEWALKS` are the two pavements of the block: front
  z 5.9…8.3, back z −9.6…−5.9, both clipped to x ∓11.4.
- `CROSSWALKS.main` x −5.2…−0.6, the only crossing.
- `LANES`, two `PARKING` bays, two `SIGNAL_POSITIONS`, four north lots
  (`BUILDING_LOTS`) and two south lots (`SOUTH_LOTS`), `LIGHT_SOURCES`,
  `WAIT_ZONES`, pedestrian `FLOWS`, `PUDDLES`, and `STREET_PROPS` — the list of
  furniture the crowd has to walk around.
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
- **Boundary**: the case — four glass panes and a lid, each a soft vertical
  gradient with one diagonal sheen. No posts, rails, caps, plinth or label: the
  boundary is a plane so that two cells can meet there.

### Cells and tiling

`src/cells.js` paints any cell other than the hero: the same floor slab, road,
kerbs, paving joints, world-periodic lane markings (6 m grid, so a cell boundary
lands on a period), a zebra crossing, the elevated line, four jittered building
lots with window grids, lamps and trees. `bufferStyle` selects `developed`,
`wireframe` or `point cloud`; developed cells are drawn solid and their detail
falls off with distance from the camera.

### Palettes

`src/palette.js` owns the colour of the plate. Every string the `Painter` is
given goes through `grade()`: a monotone paper→ink ramp with a per-palette gamma
and contrast, plus accent preservation for anything with real chroma. `mobius`
is an identity pass, so the default look costs one comparison. Light palettes
scale the additive glows down (`glowScale`) and repaint the plate clear colour,
which is how the same geometry reads as ink on cream paper. The static-set cache
keys on `paletteVersion()`.

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
- One filled coat silhouette per person — shoulders → hem — with the two legs
  drawn underneath it as separate strokes, plus a small head disc and, when
  moving, two arm strokes. Proportions are those of a 1.72 m adult: hip at
  0.86–1.02, shoulder at 1.42, head at 1.58. Accessories (bag, briefcase,
  backpack, cane, balloon, …) appear only at L0.
- **Every pixel size derives from the projected body height** (`bodyPx`):
  `headR = max(1.0, bodyPx * 0.074)`, `lineW = clamp(bodyPx * 0.042, .55, 2.1)`.
  This is the lesson from the failed version: world-unit sizes went sub-pixel
  and turned every figure into a wireframe X.
- Umbrellas are domes: rim ring + mid ring + apex, with the rim plane tilted
  and a stub stem. A flat quad on a long stem reads as a flying saucer.
- **Steering, not shoving.** Every body is a base point on its path plus the
  offset `collision.relax()` asks for. `relax()` is damped, softly saturated
  (`maxOffset * tanh(m / maxOffset)`), weighted by opacity, and biased
  `lateral`: a push that points backwards along someone's heading is turned into
  a sideways slide, which is what walking past somebody looks like. Two passes,
  each single-group — people against the furniture in `STREET_PROPS` (and the
  parked cars), then people against people. A single `clampToWorld` at the end,
  plus a guard that will not let someone who started on a pavement be pushed
  off it. Measured over the 20 s loop at 50 ms steps (640×360), counting only
  bodies above alpha 0.12: **0.0444 m average step, 0.457 m worst single step**.
  The mean is a walking pace, which is the real test.
- **Steering is the last resort, not the first.** The furniture stands against
  the shopfront line rather than in the walking band, vehicles are a row of
  discs along their own axis rather than one big disc, strolling flows clamp
  themselves to their pavement band, and crossing queues start clear of the kerb
  poles. The solver then has little to do — which is why the numbers above are
  calm. A solver that has to work hard is a solver that pops.
- Flows that turn a corner carry absolute waypoints and are walked by
  `pathTable`/`alongPath`: resampled by arc length, smoothed in space, constant
  pace. A single quadratic bezier cuts a corner across the road, and easing the
  crossing parameter through a turn reads as a stumble.
- Pedestrians keep a **lane** along their flow (`lane` ±0.42 applied along the
  flow's side vector, never the current heading), and the scatter keeps clear of
  the furniture, so most conflicts never happen. The walk-in is a short
  1.6–4.6 m at walking pace rather than a sprint from the cell edge.
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

### The cached set

Everything that is a pure function of the camera pose — walls, ground, street,
paving, markings, rail, buildings, street furniture — is painted into
`scene.static` (plus `staticFar` for the walls) and reused while the camera only
drifts. The cached pose is a snapshot (`{...eye}`, `{...target}`); the delta is
applied as an **integer** blit offset (fractional `drawImage` resamples the whole
frame), and the layer repaints when the offset exceeds 1.25 px or when the
line-boil phase ticks (~7.5 Hz). The boil is part of the cache key on purpose:
it is part of the drawing, and freezing it would flatten the animation.

At 1440×810 the set costs ~39 ms to paint, so this is the single biggest win:
the layer repaints about 13 % of frames and the rest cost one blit.

### Glows

Every emitter glow (lamps, signs, headlights, puddle light) draws a cached
radial-gradient sprite (`glowAt` in `src/draw.js`) instead of building a
gradient and rasterising a large additive fill per call.

The scene (`src/scene.js`) draws in this order, each stage timed into
`scene.profile` (EMA, shown by the stats overlay):

1. buffer cells (neighbours, behind the hero volume)
2. cached far layer → train → cached near layer
3. signals + lamp flicker
4. case frame members merged into the depth-sorted drawables
5. puddles, reflections
6. people + vehicles, sorted by projected depth
7. rain, then the field texture

### Tests that cover the GPU path

`npm run verify` runs, in order: `check` (bundle), `build`, `boot` (module boot
with a DOM shim), **`boot:bundle`** (extracts the inline script from the built
`index.html`, evaluates it, drives six frames, and with `--gl` runs them through
`tools/strict-gl.mjs` — a WebGL2 stand-in that throws on wrong-kind arguments),
**`renderer`** (unit tests for upload/draw counts, node-stripping rebuilds, and
the dead-pass fallback), `finite` and `determinism`.

The strict stand-in exists because the headless canvas harness has no WebGL: it
took the 2D fallback every time, so a renderer that threw on a real context
still passed every test. Anything that only runs on a GPU needs
`boot:bundle --gl` or `renderer-smoke` to be covered.

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
