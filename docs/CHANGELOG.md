# VALE — changelog

Dates use the user’s local timezone (America/New_York).

## 2026-10-27 — Turn 3: tiny people, slower motion, street set, quiet wet

**Direction kept:** hybrid 3D→2D print. The user asked to retrace from the
architectural-sketch references rather than add more rigged detail.

### Added

- `Painter.sign3D()` in `src/draw.js`: world-space oriented sign quads with a
  fixed normal, projected glyphs, bar and mounting bracket. Signs now
  foreshorten and can turn away from the camera.
- `LANES` in `src/world.js`: three west→east lanes on the north half and three
  east→west lanes on the south half. Vehicle direction is inherited from the
  lane, so opposing traffic no longer passes through itself.
- Four straight crossing routes plus four diagonal scramble routes, with
  synchronized sidewalk waiting zones and expanded crosswalk predicates.
- `motionScale = 0.62` and `motionT` in `src/timeline.js`: a secondary calmer
  clock for rain boil, grain, line flicker, idle sway, gait cadence and shader
  `uTime`. The signal cycle remains exactly 20 seconds.
- New street furniture: sidewalk slab joints, curbs, tactile paving, stop lines,
  lane dividers, direction arrows, manhole covers, awnings, lamp posts and
  benches.
- Tiny-people accessories: hats, scarves, bags, dogs, strollers, children,
  ground shadows and varied umbrella canopy shapes.

### Changed

- `src/crowd.js` rewritten around “tiny people”: head dots, solid coats, short
  filled legs, minimal arms, faceted umbrellas and hand-varied gait. Removed the
  dense joint skeleton. Crosser count 132→158; waiter count 34→42.
- `src/environment.js` rewritten: two-street intersection, four real sidewalk
  blocks, four straight zebra crossings, faint diagonal guides, low buildings,
  oriented signs and a coherent road/sidewalk hierarchy.
- `src/traffic.js`: six vehicles mapped to `LANES`, slower return phase, legal
  parked positions, quieter reflections and bounded separation.
- `src/scene.js`: wet composite alpha 0.92→0.26, lower default wetness /
  reflection / footstep strength, slower line boil, and propagation of
  `params.motionT` to all secondary animation.
- `src/weather.js`: procedural wet reflection strokes 150→28, long gouges
  16→5, much lower alpha; rain streaks and puddle splashes retained but slowed
  to `motionT`.
- `src/shaders.js`: shader rain/reflection node defaults and all presets made
  quieter; grain, scratch, spark, dither and flicker time multipliers reduced.
- `src/main.js`: `renderer.render()` now receives `scene.timeline.motionT`
  instead of raw 0–20s time.
- `docs/HANDOFF.md`, `docs/ARCHITECTURE.md`, `README.md`, `docs/CI.md`: updated
  for the retrace, slower clock, oriented signs, lanes and quieter wet look.

### Known / unverified

- No browser screenshot available in the sandbox; a DOM smoke test passed across
  all phases, presets and camera modes, but visual tuning still needs a human
  pass. Use `?lab=1` and the timeline scrubber.
- Performance at 1440×810 with ~200 projected tiny figures should be checked;
  `?w=1280&h=720` or the `crowdDensity` slider are the quick mitigation.
- Extreme low camera angles may expose approximate depth ordering.
- Wet reflections are intentionally subtle now; raise `reflectionStrength` in
  the lab if the empty street reads too dry.

---

## 2026-10-27 — Turn 2: camera, 3D figures, world rules, CI

**Direction kept:** hybrid 3D→2D print. The user explicitly disagreed with the
earlier “go pure 2D” assessment; the scene stays 3D underneath and 2D in output.

### Added

- `src/world.js`: sidewalks, crosswalks, waiting zones, four diagonal flows,
  parkable/crosswalk predicates and `sanitizePark()`.
- `src/collision.js`: grid-hashed separation, cross-group separation and
  Poisson-disk blue-noise sampling.
- `src/camera-control.js`: user orbit/fly camera with drag, pan, wheel, WASD/QE,
  Shift boost, smooth return to the auto rig, and an auto-hiding HUD.
- `detail` shader node: tangent-following contour cuts, micro scratches and edge
  sparks.
- `hatch` shader node rewrite: noisy angle drift, variable spacing, wandering
  lines, broken lines and secondary cross-hatching.
- `CAM` tab in the hidden lab with Auto / Orbit / Fly / Reset and live fly-speed
  / easing sliders.
- Query params `?cam=orbit|fly|user`, `?hud=0`.
- `.github/workflows/deploy-pages.yml`: GitHub Actions build + Pages deployment
  on every push to this branch and `main`, plus `workflow_dispatch`.
- `scripts/update-docs.mjs` and `npm run docs`: generated `BUILD.md`,
  `DEPLOY_STATUS.md`, `manifest.json` and `docs/index.html`.
- Human-authored `docs/HANDOFF.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `CI.md`.
- First successful GitHub Pages deployment on this branch: workflow run
  `40521585370`, live at `https://bashmaester.github.io/vale/`.

### Changed

- `src/crowd.js` rewritten: procedural 3D humanoid skeletons, distance-driven
  walk cycle, faceted 3D umbrellas, depth-sorted projected bones, footprint
  trails from real foot joints. No more screen-space sliding billboards.
- `src/traffic.js` rewritten: wheels, hubs, arches, cabins, sloped windshields,
  truck cab/cargo split, bus sign, taxi roof light, bumpers, lamps; vehicles
  separate from each other and park only in legal road slots.
- `src/environment.js`: raised sidewalks, curbs, stop lines, chevrons, puddles,
  facade balconies/drainpipes/AC boxes, signals moved to curb corners.
- `src/scene.js`: camera controller integration, traffic-before-crowd update
  order, crowd/vehicle obstacle separation, `render(t, dt)`.
- `src/timeline.js`: traffic delayed until the crowd has cleared.
- `src/main.js`: passes frame delta to the scene, applies camera/HUD query params.
- `src/shaders.js`: node count 7 → 8; all presets updated with `detail` and new
  hatch parameters.
- `src/draw.js`: `polys()` now accepts projected point objects as well as arrays.
- `package.json` / `.gitignore`: docs script, local deploy helper, `_site/` ignore.

### Known / unverified

- No browser screenshot available in the sandbox; a DOM smoke test passed across
  all phases, presets and camera modes, but visual tuning still needs a human
  pass. Use `?lab=1` and the timeline scrubber.
- Performance at 1440×810 with ~166 projected 3D figures should be checked;
  `?w=1280&h=720` or the `crowdDensity` slider are the quick mitigation.
- Extreme low camera angles may expose approximate depth ordering.

---

## 2026-10-27 — Turn 1: rebuild foundation

The checkout contained only the initial `README.md`; the earlier session’s code
was not present on this branch. Rebuilt from scratch.

### Added

- One self-contained `index.html` silent 20s autoplaying film.
- 3D scene graph with keyframed camera, projected boxes, 2D ink plate, wet plate
  and field data plate.
- WebGL2 node shader graph (source, carve, hatch, rain, palette, paper, output).
- Hidden `?lab=1` patch bay with draggable nodes, presets, scene params, timeline
  scrubber, PNG/JSON export.
- 20s signal cycle: WAIT → SIGNAL → CROSS → DRAIN → EMPTY → TRAFFIC.
- README, build script, esbuild bundling, 2D fallback renderer.

### Note

The first turn used screen-space billboard figures and box-only vehicles. Those
were intentionally replaced in Turn 2 after the user asked for procedural 3D
figures, wheels/silhouettes and a believable fly-around camera.
