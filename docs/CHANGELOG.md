# VALE — changelog

Dates use the user’s local timezone (America/New_York).

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
