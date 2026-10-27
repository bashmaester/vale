# VALE — architecture

The system is a **representation pipeline**, not a simulation and not a flat
illustration. This turn concentrates on one built-out street corner: big cubic
volumes first, then fixed street furniture and cars, then varied people, then
rain and puddles.

```
        ┌──────────────────────────────────────────────┐
        │ world.js — one corner: 2 road strips, 4       │
        │ sidewalk blocks, crosswalks, lanes, parking   │
        │ signals, building lots, pedestrian flows      │
        └───────────────────┬──────────────────────────┘
                            ▼
 timeline.js ─▶ camera.js ─▶ camera-control.js ─▶ 3D modules
 (20s cycle +    (corner     (user orbit/fly)        │
  motionT)        rig)                              ▼
                          environment.js / traffic.js / crowd.js / weather.js
                                                    │
                                                    ▼
                         Camera.project() → 2D screen points
                                                    ▼
        ┌──────────────────────────────────────────────┐
        │ scene.js — plate (ink), field (R puddle /     │
        │ G crowd / B accent). No wet-glass canvas.     │
        └───────────────────┬──────────────────────────┘
                            ▼
        ┌──────────────────────────────────────────────┐
        │ shaders.js + graph.js — 8-node GLSL patch     │
        │ source→carve→detail→hatch→rain*→palette→paper→output │
        │ *rain node is a disabled pass-through         │
        └───────────────────┬──────────────────────────┘
                            ▼
                    renderer.js (WebGL2 fullscreen pass)
                            ▼
                        index.html film
```

---

## 1. World model (`world.js`)

A single source of truth for the corner:

- `ROAD_H` / `ROAD_V`: two crossing asphalt strips, one running ±x and one ±z.
- `SIDEWALKS`: four raised sidewalk blocks. `CORNER` is the northeast block and
  is the only one fully built out; the others are simple receiving slabs.
- `WAIT_ZONES`: four waiting areas with a weight that biases the crowd toward
  the built-out corner.
- `FLOWS`: two straight crossings from the corner, four diagonal routes, plus a
  short stroll along the corner sidewalk.
- `CROSSWALKS`: four straight zebra bands and diagonal predicates.
- `LANES`: two lanes per road, each with an axis, offset and direction.
- `PARKING`: four legal curbside slots. `SIGNAL_POSITIONS`: exactly four traffic
  light poles at the intersection corners. `BUILDING_LOTS`: four cubic building
  volumes on the corner.
- `isOnRoad()`, `isOnSidewalk()`, `isOnCrosswalk()`, `isParkable()`,
  `sanitizePark()`, `clampToWorld()`, `weightedWaitZone()`.

`traffic.js` validates parked cars through `sanitizePark()`. `crowd.js` uses
`isOnSidewalk()` while generating start and waiting points.

## 2. Camera and time

`camera.js` is a restrained three-quarter view of the corner. It shows the tops
and two faces of the sidewalk blocks and buildings, with a slight push-in during
the surge and pull-back for the empty street. `camera-control.js` wraps it with
`auto`, `returning`, `orbit` and `fly` modes.

`timeline.js` owns the 20-second signal cycle and a slower secondary clock
`motionT = 0.62 × t` for rain, grain, line flicker, idle sway and gait cadence.
The film duration does not change.

## 3. Staged set construction (`environment.js`)

The drawing order is the construction order:

1. **`drawBlockout()`** — ground plane, two road planes, intersection plane, and
   four shallow sidewalk boxes. The northeast corner gets denser paving lines
   and tactile paving at its curb ramps.
2. **`drawRoadMarkings()`** — center dashes, lane dividers, four zebra
   crossings, stop lines, direction arrows and manhole covers.
3. **`drawBuildings()`** — four `p.box()` volumes with window grids, awnings,
   roof parapets, rooftop boxes, accent stripes and `sign3D()` shop signs.
4. **`drawTrafficLights()`** — four poles at the four intersection corners
   only. Each pole carries a vehicle head and a smaller pedestrian head, both
   drawn as oriented 3D quads with projected lamps.
5. **`drawStreetFurniture()`** — lamp posts, benches, planters and a simple bus
   shelter on the built-out corner.
6. **`drawWires()` / `drawTrack()`** — overhead wires, utility poles and the
   elevated track behind the corner.

Signs use `Painter.sign3D()`: a world-space oriented quad with a fixed normal.
They foreshorten and can turn away from the camera; they are not billboards.

## 4. Vehicles (`traffic.js`)

Five vehicles total:

- three parked cars at legal curbs (two along the horizontal road, one along
  the vertical road), with axis-aware wheels, cabins, windshields and lamps;
- two moving cars in separated horizontal lanes during the traffic phase;
- a five-car train passing overhead on the track.

`vehicleWorld()` maps each spec onto its axis and lane. Parked slots are
re-sanitized after separation. There are no traffic-light reflections or wet
light smears.

## 5. People (`crowd.js`)

About 92 crossers and 30 waiters. People are added last and are deliberately
varied:

- six archetypes (commuter, student, elder, child, tourist, worker) with
  different scale ranges, gaits, leans and umbrella probabilities;
- five coat silhouettes (straight, A-line, long, short, hood) and five head
  treatments (round, oval, hat, cap, hood);
- eight umbrella styles/colors; some people have no umbrella;
- long directional ground shadows, plus small foot shadows;
- accessories: bags, briefcases, backpacks, phones, cameras, maps, newspapers,
  canes, balloons, dogs, strollers, bicycles and occasional companions;
- distance-driven stride with per-person stride length, pace and phase.

All points are projected 3D world points. Separation prevents overlap and
pushes walkers away from active vehicle hulls.

## 6. Rain and puddles (`weather.js`)

The procedural wet-glass shader overlay is gone. Instead there is a real,
persistent particle/ripple simulation:

- 220 raindrop particles with fixed seeds, positions, fall speeds, lengths and
  colors. They fall in 3D, drift with wind, and are projected as short streaks.
- 8 irregular puddle polygons on the asphalt / curb, drawn as projected 3D
  ground shapes.
- When a drop lands near a puddle it spawns an expanding 3D ripple ring with
  splash spikes. Ambient drips keep puddles alive. Ripples age and fade.
- The `field` texture gets a red radial mask only at puddle locations, so the
  hatch node can suppress lines inside puddles. There is no broad wetness
  gradient.

`scene.js` draws puddles before cars/people and rain last, over the whole set.

## 7. Printing plates (`scene.js`, `draw.js`)

Two offscreen canvases:

- `plate` — main ink image. Set → puddles → traffic → crowd → rain.
- `field` — `R` puddle mask, `G` crowd/motion density, `B` accent bloom from
  train and signals.

There is no `wet` canvas. `Painter` provides rough polylines with line boil,
jittered polygons, projected 3D boxes, grid-on-quad, oriented `sign3D()` quads,
glyphs, ellipses and splashes.

## 8. Node shader graph (`shaders.js`, `graph.js`)

`ShaderGraph` topologically sorts nodes, emits uniform declarations + GLSL
functions + a `main()` chain, and feeds live values to `Renderer`.

| # | Node | Role |
| --- | --- | --- |
| 01 | `source` | plate sample, channel misregistration, gate weave |
| 02 | `carve` | edge-aware lino gouges, boiling tool marks, scratches |
| 03 | `detail` | tangent-following contour cuts, micro scratches, edge sparks |
| 04 | `hatch` | noisy angle drift, variable spacing, wandering/broken lines, cross hatch |
| 05 | `rain` | disabled pass-through; rain/puddles are simulated on the plate |
| 06 | `palette` | bleed, dither, four-color posterization, accent bloom |
| 07 | `paper` | grain, fiber, speckle, vignette, projector flicker |
| 08 | `output` | exposure / contrast |

`ShaderGraph` respects `enabled: false` in node definitions and presets. The
`rain` node remains in the graph for modularity but returns `c` unchanged. This
is raw GLSL ES 3.0 rather than Three.js TSL: it keeps the deliverable to one
file with zero runtime dependencies.

## 9. Renderer / lab / CI

- `renderer.js` uploads `plate` and `field` as WebGL2 textures and draws one
  fullscreen triangle strip, with a 2D fallback.
- `lab.js` is an optional DOM overlay; it never appears during normal playback.
- `.github/workflows/deploy-pages.yml` rebuilds, validates self-containment,
  runs `npm run docs`, assembles `_site/`, and deploys via GitHub Pages.
- `scripts/update-docs.mjs` writes generated deploy metadata while keeping
  human-authored docs intact.

Live site: **https://bashmaester.github.io/vale/**.
