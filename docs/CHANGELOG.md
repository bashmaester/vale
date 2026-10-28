# VALE — changelog

Dates use the user’s local timezone (America/New_York).

## 2026-10-28 — Turn 6: first real screenshot pass, and the look rebuilt from it

**Why this turn exists:** the previous session handed off with “no browser
screenshot validation was possible in this sandbox” as the #1 blocker. That
blocker is now solved, and the first look at a real render immediately explained
the user’s “very underwhelming” verdict.

### Solved the screenshot blocker

The sandbox has no system Chromium and can only reach the npm registry, so the
usual Playwright/Puppeteer download paths are closed. `@sparticuz/chromium`
ships a chromium binary inside its npm tarball, but it links against NSS/NSPR.
`scripts/setup-headless.sh` generates stub NSS/NSPR shared libraries exporting
exactly the 44 symbols the binary requests, then verifies with `ldd`.
`scripts/shoot.mjs` drives it through `puppeteer-core`, pauses the film at
chosen times and writes PNGs. Both are committed; see `docs/SCREENSHOTS.md`.

### The diagnosis the screenshots produced

The first frames showed a **wireframe CAD diagram floating in a sea of static**.
Four root causes, none of which are visible from reading the code:

1. `p.box()` filled every face with `PALETTE.black` (`#050605`) against a
   `#070807` background, so buildings and sidewalks were **outlines over
   nothing**. Most of the “underwhelming” verdict is this one bug.
2. `drawBuildings()` painted in array order, so far facades overpainted near
   ones and the whole block read as transparent wireframes.
3. ~70% of the frame was empty black; the set occupied about 30% and floated.
4. The print shaders painted fbm noise across **empty paper**, so mottled static
   covered the entire image and swamped the artwork.

### Changed

- `src/draw.js`: added a real print tonal ladder to `PALETTE` (`massFront`,
  `massSide`, `massTop`, `massDeep`, `lit`) and `faceTone()`. `p.box()` gained
  `shade: true` / `fillFor(name)` so each face is filled at its own tone.
- `src/environment.js`: added `drawBackdrop()` — a ring of 34 distant blocks
  with sparse lit windows — drawn first so the frame has depth instead of a void.
- `src/environment.js`: `drawBuildings()` now sorts lots far-to-near
  (painter’s algorithm) before painting, and facades are solid masses with
  bright paper window openings. Structural outlines softened; the corner
  building keeps stronger edges.
- `src/environment.js`: road planes, junction and sidewalk blocks each get a
  distinct tone so the carriageway and curbs read; tonal ladder pushed darker
  overall so the windows and red/teal accents punch.
- `src/camera.js`: camera moved from an aerial plan of the whole junction to a
  **near-street-level three-quarter view of one corner** — eye ≈
  `[-15.5, 9.6, 17.5]`, target ≈ `[10.5, 4.1, -11.0]`, fov 50.
- `src/shaders.js`: `carve`, `detail`, `hatch` and `paper` multiply their effect
  by a plate-luma coverage gate, so print texture lands on ink and leaves empty
  paper empty. Retuned defaults (`carve` tool size 13→6, `hatch` spacing 7.5→6.5,
  strength 0.34→0.22, warp 0.55→0.18, jitter 0.45→0.14, `bleed` 0.18→0.07,
  `dither` 0.055→0.022, `speckle` 0.5→0.16) and updated every preset to match,
  because presets silently override node defaults.
- `.github/workflows/deploy-pages.yml`: triggers on **any** branch (`'**'`)
  instead of a hard-coded list of two. The old list still named the previous
  session’s branch, so CI silently stopped deploying after handover.
- `package.json`: `setup:browser`, `shots`, `serve` scripts.
- `docs/SCREENSHOTS.md` (new), `docs/shots/` (before/after stills).
- `docs/ARCHITECTURE.md`: tonal ladder, backdrop, painter’s ordering, coverage
  gating and the new camera documented.
- `docs/CURRENT_STATE.md`, `docs/HANDOFF.md`, `docs/CI.md`: refreshed.

### Correction (added 2026-10-28, later the same session)

This whole entry was authored against the wrong base. `main` (`de04b9a`) is not
the newest work: `arena/bab4bc10-vale` (`6a57a47`) is 21 commits ahead, and the
brief there is an **indie sim engine foundation**, not a one-corner film. This
turn's art pass is therefore on a superseded reading of the brief, and the
screenshots show `bab4bc10` is both richer visually and far ahead in
architecture, LoD, tests and loop determinism. See `docs/BRANCH_COMPARISON.md`
for what is worth salvaging (the screenshot harness, the shaded-mass fix, the
painter's ordering, the coverage gating).

### Result

The film now reads as a night street corner with solid building masses, a
readable sidewalk/crossing hierarchy, layered depth and a legible crowd, instead
of a wireframe in a void. Still not approved: see “Still open” in
`docs/SCREENSHOTS.md` — hatch marble on large facades, umbrella silhouettes,
rain/puddle readability, and motion that has only been judged as stills.

---

## 2026-10-27 — Turn 5: current-state documentation and handoff

**User feedback:** “very underwhelming” and “almost none of my notes ahve
landed”. No new visual changes were attempted this turn; the goal is to document
the gap between the technical scaffold and the intended film, then merge the
current branch to `main` so another session can restart from the references.

### Added

- `docs/CURRENT_STATE.md`: frank snapshot of what is actually built, a table of
  “technical implementation vs visual confidence”, likely root causes and a
  next-session plan.
- `docs/HANDOFF.md` rewritten as a resume guide with the full chronological
  summary of user notes, explicit “what has not landed visually” section,
  invariants, commands, file map and merge instructions.

### Changed

- `README.md`: added a status warning that the current build is a technical
  scaffold, not an approved visual result, with links to the current-state and
  handoff docs.
- `docs/CI.md`: note that this turn is merged to `main` via PR #1.
- `docs/CHANGELOG.md`: this entry.

### Merged

- Branch `arena/082e9ffd-vale` → `main` via PR #1.
- Pages CI continues to deploy from both branches.

### Important

- The next session must validate with real browser screenshots against the
  supplied architectural-sketch references before adding more features.
- The visual result is not approved. Do not treat code presence as evidence that
  a note landed.

---

## 2026-10-27 — Turn 4: build out the corner, raindrop / puddle sim

**Direction kept:** hybrid 3D→2D print. The user asked to focus on the set as a
cubic volume scene, block out big elements first, add people last with more
variety, remove the wet-glass overlay, and bring back raindrop/puddle simulation.

### Added

- `src/world.js` rewritten around one built-out corner: `ROAD_H`, `ROAD_V`,
  `CORNER`, `WAIT_ZONES` with weights, `SIGNAL_POSITIONS`, `PARKING`,
  `BUILDING_LOTS`, axis-aware `LANES`, `isOnRoad()`, `weightedWaitZone()`.
- `src/environment.js` rewritten as staged construction: `drawBlockout()`,
  `drawRoadMarkings()`, `drawBuildings()`, `drawTrafficLights()`,
  `drawStreetFurniture()`, `drawWires()`, `drawTrack()`.
- Four cubic building volumes on the northeast corner with window grids,
  awnings, roof parapets, rooftop boxes, accent stripes and `sign3D()` signs.
- Four traffic-light poles at the four intersection corners only, each with a
  vehicle head and a smaller pedestrian head.
- `src/weather.js` rewritten as a real raindrop / puddle simulation: 220
  persistent 3D raindrop particles, 8 irregular puddle polygons, expanding
  ripple rings, splash spikes and ambient drips.
- `SCENE_PARAM_DEFS`: `rainSpeed`, `puddleAmount`; removed `wetness`,
  `reflectionStrength`, `footstepStrength`.
- More people variety: six archetypes, five coat shapes, five head treatments,
  eight umbrella styles, long directional shadows, many accessories and
  occasional companions.

### Changed

- `src/scene.js`: removed the `wet` canvas and `wp` painter entirely. Render
  order is now set → puddles → traffic → crowd → rain, with only `plate` and
  `field` canvases.
- `src/traffic.js`: reduced from 12 vehicles to 5 (3 parked + 2 moving), added
  axis-aware vehicle orientation, aligned parked cars to legal curb slots,
  removed wet reflections.
- `src/crowd.js`: reduced from ~200 to ~122 figures, removed footprint/wet
  methods, added archetypes/accessories/long shadows/groups and updated flows to
  the corner layout.
- `src/camera.js` / `src/camera-control.js`: new three-quarter corner view from
  `[-28, 28, 48]` looking at `[0, 1, -3]`, with subtle drift.
- `src/shaders.js`: the `rain` node is now a disabled pass-through named
  `05 · Puddle mask (plate only)`. All presets disable it. `field.r` is used
  only for puddle masks, not a broad wetness gradient.
- `src/graph.js`: `ShaderGraph` respects `enabled: false` in node definitions,
  presets and reset.
- `README.md`, `docs/HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/CI.md`: updated
  for the corner set, rain sim and no wet overlay.
- `.gitignore`: ignore `image-search/` and `.smoke.mjs` scratch files.

### Removed

- Procedural wet-glass shader overlay.
- Additive wet reflection strokes, train/vehicle light smears and broad wetness
  gradient.
- Footprint `destination-out` erasures and `footstepStrength` parameter.
- Faint diagonal scramble guide markings; the set now has four straight crosswalks.

### Deployed

- GitHub Pages workflow run `40539760362` succeeded for commit `ed3f8e0`.

### Known / unverified

- No browser screenshot available in the sandbox. A DOM smoke test passed across
  all phases, presets and camera modes; visual tuning still needs a human pass.
- Camera framing was verified by projecting key world points, not by looking at
  a render.
- The disabled `rain` shader node remains in the 8-node graph for modularity.
  Re-enabling it does nothing; the real rain is on the plate.

---

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

### Deployed

- GitHub Pages workflow run `40531284984` succeeded for commit `f2d73ed`.

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
