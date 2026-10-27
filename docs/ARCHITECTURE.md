# VALE — architecture

The system is a **representation pipeline**, not a simulation and not a flat
illustration. It has four layers: a shared world model, a parametric 3D scene,
2D printing plates, and a node-based shader finish.

```
        ┌──────────────────────────────────────────────┐
        │ world.js — sidewalks / crosswalks / flows /   │
        │ parkable() / collision separation rules      │
        └───────────────────┬──────────────────────────┘
                            ▼
 timeline.js ─▶ camera.js ─▶ camera-control.js ─▶ 3D modules
 (signal cycle)  (auto rig)   (user orbit/fly)      │
                                                    ▼
                            crowd.js / traffic.js / environment.js
                                                    │
                                                    ▼
                         Camera.project() → 2D screen points
                                                    ▼
        ┌──────────────────────────────────────────────┐
        │ scene.js — plate (ink), wet (reflections +   │
        │ footprints), field (R wet / G crowd / B accent)│
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

- `SIDEWALKS`: four corner blocks. Waiting crowds live here.
- `WAIT_ZONES`: blue-noise sampling bounds for waiting umbrellas.
- `FLOWS`: four diagonal pedestrian streams, each starting and ending on
  opposite sidewalks. Two diagonals × two directions.
- `CROSSWALKS`: foreground band, two side bands, diagonal band, central diamond.
- `isOnCrosswalk()`, `isOnSidewalk()`, `isParkable()`, `sanitizePark()`,
  `clampToWorld()`.

`traffic.js` runs every parked slot through `sanitizePark()`, so vehicles cannot
be committed on a crosswalk. `crowd.js` uses `isOnSidewalk()` while generating
start points and waiting points.

## 2. Collision / scatter (`collision.js`)

- `separate(items, opts)`: grid-hashed 2D relaxation. Supports per-item radius,
  alpha weighting, fixed obstacles, bounds clamping, and “only different groups”.
- `separateGroups(a, b)`: cross-type separation (crowd vs vehicles).
- `poissonDisk(count, bounds, minDist, rng, isValid)`: blue-noise points for
  meaningful scatter instead of random overlap.

Used in three places:

1. `Crowd.update()` separates all pedestrians from each other.
2. `Traffic.update()` separates vehicles from each other; parked vehicles are
   fixed.
3. `Scene.render()` passes `traffic.activeItems()` as obstacles into
   `crowd.update()`, so walkers are pushed away from real vehicle hulls.

Traffic is also delayed until `u > 0.88`, after the empty-street beat, so vehicles never share the crossing with the crowd.

## 3. Camera

`camera.js` is a keyframed auto rig: high overhead, slight push-in during the
surge, drift during the train, pull-back for the empty street. It returns a
`Camera` object from `math.js` with a real perspective `project()`.

`camera-control.js` wraps it without destroying it:

- `auto` — keyframed rig.
- `returning` — eased blend back to the auto rig.
- `orbit` — yaw/pitch/distance around a target; drag, wheel, arrow keys.
- `fly` — WASD/QE translation of both eye and target; drag still looks.

`Scene.render(t, dt)` calls `cameraController.apply(autoCamera, dt, params)`.
Because every figure/vehicle point is projected through the returned camera,
flying changes perspective naturally.

## 4. Procedural 3D humanoids (`crowd.js`)

Each pedestrian has a world position, heading `dir`, perpendicular `side`,
scale, umbrella color, phase and precomputed start/control/end points.

Per frame:

1. Position comes from the signal cycle (waiting / bezier crossing / drain /
   gather). Distance travelled drives `stridePhase`, so feet step in sync with
   translation instead of skating.
2. Separation resolves overlaps before projection.
3. `_makeItem()` builds a 3D skeleton: pelvis, chest, neck, head, shoulders,
   hips, elbows, hands, knees, feet, toes, buttons, umbrella apex/rim/handle/drips.
4. Every joint is projected to a screen point with depth.
5. Draw commands (polylines, polygons, ellipses, canopy triangles) are stored
   with an average depth, sorted far→near, then executed by `Painter`.

The umbrella is a faceted 3D dome: rim points around a horizontal circle, apex
slightly tilted by wind, triangles filled as canopy, ribs from apex to rim, a
3D handle down to the right hand. From a new camera angle the dome ellipse,
ribs and body silhouette change.

Footprints use the projected foot joints, not a guessed billboard center. They
erase additive wet reflections (`destination-out`) and leave a faint shoe rim.

## 5. Vehicles (`traffic.js`)

Vehicle specs include type, width/height/depth, lane, direction, phase offset
and a sanitized park slot. `drawVehicle()` composes 3D primitives:

- four projected wheels with hubs and arch ellipses;
- body box (bus / car / taxi / van) or cab + cargo split (truck);
- raised cabin box and sloped windshield quad for non-tall vehicles;
- window grids on the long side face;
- bus destination sign, taxi roof light, truck cargo divider;
- roof identity line, bumpers, head/tail lamps.

The train remains a sequence of 3D boxes with projected window grids and
teal/red identity stripes, plus motion cuts and wet reflections.

## 6. Environment (`environment.js`)

Road plane, zebra stripes, central diamond, four raised sidewalks with curb
lines and scoring, stop lines, chevrons, puddles, manholes, buildings with
window grids + balconies + drainpipes + AC boxes, hanging wires, signboards,
elevated track and four signal posts. All of it is projected 3D geometry drawn
with the rough-stroke `Painter`.

## 7. Printing plates (`scene.js`, `draw.js`, `weather.js`)

Three offscreen canvases:

- `plate` — main ink image on a dark gradient.
- `wet` — additive reflections, train/vehicle light smears, then footprint
  erasures; composited onto the plate with `screen`.
- `field` — data texture: `R` wetness, `G` crowd/motion density, `B` accent
  bloom from train and signals.

`Painter` provides rough polylines with line boil, jittered polygons, projected
3D boxes, grid-on-quad, billboard signs, glyphs, ellipses and splashes. Static
geometry is still projected each frame so the camera can move.

## 8. Node shader graph (`shaders.js`, `graph.js`)

`ShaderGraph` topologically sorts nodes, emits uniform declarations + GLSL
functions + a `main()` chain, and feeds live values to `Renderer`.

| # | Node | Role |
| --- | --- | --- |
| 01 | `source` | plate sample, channel misregistration, gate weave |
| 02 | `carve` | edge-aware lino gouges, boiling tool marks, scratches |
| 03 | `detail` | tangent-following contour cuts, micro scratches, edge sparks |
| 04 | `hatch` | noisy angle drift, variable spacing, wandering/broken lines, cross hatch |
| 05 | `rain` | stretched rain noise, gouged wet reflections, splash specks |
| 06 | `palette` | bleed, dither, four-color posterization, accent bloom |
| 07 | `paper` | grain, fiber, speckle, vignette, projector flicker |
| 08 | `output` | exposure / contrast |

`hatch` intentionally avoids uniform parallel lines: low-frequency `fbm` warps
angle and spacing, a second noise field breaks lines, and a secondary rotated
pass adds cross-hatching only in the darkest areas. `field.r` suppresses hatch
on wet road; `field.g` adds crowd-driven variation.

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
