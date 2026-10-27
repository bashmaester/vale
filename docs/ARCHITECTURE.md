# VALE — architecture

The system is a **representation pipeline**, not a simulation and not a flat
illustration. It has four layers: a shared world model, a parametric 3D scene,
2D printing plates, and a node-based shader finish.

```
        ┌──────────────────────────────────────────────┐
        │ world.js — sidewalks / crosswalks / 8 flows / │
        │ lanes / parkable() / collision rules          │
        └───────────────────┬──────────────────────────┘
                            ▼
 timeline.js ─▶ camera.js ─▶ camera-control.js ─▶ 3D modules
 (20s cycle +    (auto rig)   (user orbit/fly)      │
  motionT)                                         ▼
                          crowd.js / traffic.js / environment.js
                                                    │
                                                    ▼
                         Camera.project() → 2D screen points
                                                    ▼
        ┌──────────────────────────────────────────────┐
        │ scene.js — plate (ink), wet (quiet reflections│
        │ + footprints), field (R wet / G crowd / B accent)│
        └───────────────────┬──────────────────────────┘
                            ▼
        ┌──────────────────────────────────────────────┐
        │ shaders.js + graph.js — 8-node GLSL patch     │
        │ source→carve→detail→hatch→rain→palette→paper→output │
        └───────────────────┬──────────────────────────┘
                            ▼
                    renderer.js (WebGL2 fullscreen pass)
                            ▼
                        index.html film
```

---

## 1. World model (`world.js`)

A single source of truth for spatial sense:

- `SIDEWALKS`: four corner blocks around a cross intersection.
- `WAIT_ZONES`: blue-noise sampling bounds for waiting crowds on those blocks.
- `FLOWS`: eight routes — four straight crossings (E/W/S/N) and four diagonal
  scrambles. Each starts and ends on a sidewalk.
- `CROSSWALKS`: four straight zebra bands, diagonal scramble guides and a
  central diamond predicate.
- `LANES`: three west→east lanes on the north half and three east→west lanes on
  the south half. Vehicles inherit `dir` from their lane.
- `isOnCrosswalk()`, `isOnSidewalk()`, `isParkable()`, `sanitizePark()`,
  `clampToWorld()`.

`traffic.js` runs every parked slot through `sanitizePark()`, so vehicles cannot
be committed on a crosswalk or sidewalk. `crowd.js` uses `isOnSidewalk()` while
generating start and waiting points.

## 2. Collision / scatter (`collision.js`)

- `separate(items, opts)`: grid-hashed 2D relaxation. Supports per-item radius,
  alpha weighting, fixed obstacles, bounds clamping, and “only different groups”.
- `separateGroups(a, b)`: cross-type separation (crowd vs vehicles).
- `poissonDisk(count, bounds, minDist, rng, isValid)`: blue-noise points for
  meaningful scatter instead of random overlap.

Used in three places:

1. `Crowd.update()` separates all pedestrians from each other with 3 iterations.
2. `Traffic.update()` separates vehicles from each other and bounds them to the
   road; parked vehicles are fixed and re-sanitized after separation.
3. `Scene.render()` passes `traffic.activeItems()` as obstacles into
   `crowd.update()`, so walkers are pushed away from real vehicle hulls.

Traffic is delayed until the empty-street beat, so vehicles never share the
crossing with the crowd.

## 3. Camera and time

`camera.js` is a keyframed auto rig: high overhead, slight push-in during the
surge, drift during the train, pull-back for the empty street. It returns a
`Camera` object from `math.js` with a real perspective `project()`.

`camera-control.js` wraps it without destroying it:

- `auto` — keyframed rig.
- `returning` — eased blend back to the auto rig.
- `orbit` — yaw/pitch/distance around a target; drag, wheel, arrow keys.
- `fly` — WASD/QE translation of both eye and target; drag still looks.

`Scene.render(t, dt)` calls `cameraController.apply(autoCamera, dt, params)`.
Because every figure/vehicle/sign point is projected through the returned
camera, flying changes perspective naturally.

`timeline.js` owns the 20-second signal cycle. It also exposes `motionT = t *
0.62` (mod 20): a slower secondary clock for rain boil, grain, line flicker,
idle sway, gait cadence and shader `uTime`. The film duration does not change.

## 4. Tiny people (`crowd.js`)

Each pedestrian has a world position, heading `dir`, perpendicular `side`,
scale, coat, umbrella style, accessory, gait phase and precomputed
start/control/end points.

Per frame:

1. Position comes from the signal cycle (waiting / bezier crossing / drain /
   gather). Distance travelled drives `stridePhase`, so feet step in sync with
   translation instead of skating. The cadence uses `motionT`, not raw time.
2. Separation resolves overlaps before projection.
3. `_makeItem()` builds a small 3D silhouette: shoulders, hips, feet, head,
   hands, coat quad, two filled leg blocks and an optional umbrella canopy.
4. Every point is projected to a screen point with depth.
5. Draw commands are stored in fixed painter order and executed per person,
   sorted far→near by foot depth.

The umbrella is a faceted 3D canopy: rim points around a horizontal circle,
apex tilted by wind, triangles filled as canopy, two ribs and a 3D handle. From
a new camera angle the canopy ellipse and body silhouette change. Accessories
include hats, scarves, bags, dogs, strollers and children. Ground shadows sit
under the projected feet.

Footprints use the projected foot joints. They erase additive wet reflections
(`destination-out`) and leave a faint shoe rim.

## 5. Vehicles (`traffic.js`)

Vehicle specs include type, width/height/depth, lane, direction (from `LANES`),
phase offset and a sanitized park slot. `drawVehicle()` composes 3D primitives:

- four projected wheels with hubs and arch ellipses;
- body box (bus / car / taxi / van) or cab + cargo split (truck);
- raised cabin box and sloped windshield quad for non-tall vehicles;
- window grids on the long side face;
- bus destination sign, taxi roof light, truck cargo divider;
- roof identity line, bumpers, head/tail lamps.

The return phase is slower: vehicles traverse only part of the span in the final
beat. The train remains a sequence of 3D boxes with projected window grids and
teal/red identity stripes, plus motion cuts and quiet wet reflections.

## 6. Environment (`environment.js`)

Two crossing asphalt strips, four raised sidewalks with slab joints and curbs,
tactile paving, four straight zebra crossings, faint diagonal scramble guides,
stop lines, lane dividers, direction arrows, manhole covers, puddles, low
buildings with window grids and awnings, lamp posts, benches, hanging wires,
elevated track and six signal posts. All of it is projected 3D geometry drawn
with the rough-stroke `Painter`.

Signs use `Painter.sign3D()`: a world-space oriented quad with a fixed normal,
projected glyphs, color bar and mounting bracket. They foreshorten and can turn
away from the camera; they are not billboards.

## 7. Printing plates (`scene.js`, `draw.js`, `weather.js`)

Three offscreen canvases:

- `plate` — main ink image on a dark gradient.
- `wet` — quiet additive reflections, train/vehicle light smears, then footprint
  erasures; composited onto the plate with `screen` at low alpha.
- `field` — data texture: `R` wetness, `G` crowd/motion density, `B` accent
  bloom from train and signals.

`Painter` provides rough polylines with line boil, jittered polygons, projected
3D boxes, grid-on-quad, oriented `sign3D()` quads, glyphs, ellipses and
splashes. Static geometry is still projected each frame so the camera can move.

`weather.js` keeps rain streaks, close drops, splashes and puddle outlines but
reduces procedural wet reflection strokes to a faint glaze. Rain and grain now
animate on `motionT`.

## 8. Node shader graph (`shaders.js`, `graph.js`)

`ShaderGraph` topologically sorts nodes, emits uniform declarations + GLSL
functions + a `main()` chain, and feeds live values to `Renderer`.

| # | Node | Role |
| --- | --- | --- |
| 01 | `source` | plate sample, channel misregistration, gate weave |
| 02 | `carve` | edge-aware lino gouges, boiling tool marks, scratches |
| 03 | `detail` | tangent-following contour cuts, micro scratches, edge sparks |
| 04 | `hatch` | noisy angle drift, variable spacing, wandering/broken lines, cross hatch |
| 05 | `rain` | subtle stretched rain noise, faint wet reflections, splash specks |
| 06 | `palette` | bleed, dither, four-color posterization, accent bloom |
| 07 | `paper` | grain, fiber, speckle, vignette, projector flicker |
| 08 | `output` | exposure / contrast |

`hatch` intentionally avoids uniform parallel lines: low-frequency `fbm` warps
angle and spacing, a second noise field breaks lines, and a secondary rotated
pass adds cross-hatching only in the darkest areas. `field.r` suppresses hatch
on wet road; `field.g` adds crowd-driven variation. All time-based noise now
uses the slower `motionT` clock and the rain/reflection node is much quieter.

This is raw GLSL ES 3.0 rather than Three.js TSL: it keeps the deliverable to one
file with zero runtime dependencies. `ShaderGraph.compile()` is the seam where a
TSL/WebGPU adapter could be added without touching the scene modules.

## 9. Renderer / lab / CI

- `renderer.js` uploads `plate` and `field` as WebGL2 textures, draws one
  fullscreen triangle strip, and falls back to a 2D canvas if WebGL2 or shader
  compilation fails.
- `lab.js` is an optional DOM overlay. It never appears during normal playback.
- `.github/workflows/deploy-pages.yml` rebuilds, validates self-containment,
  runs `npm run docs`, assembles `_site/`, and deploys via GitHub Pages actions.
- `scripts/update-docs.mjs` writes generated deploy metadata while keeping
  human-authored handoff/architecture/changelog/CI docs intact.

Live site: **https://bashmaester.github.io/vale/**.
