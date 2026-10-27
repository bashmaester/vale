# VALE — changelog

Dates use the user’s local timezone (America/New_York).

## 2026-10-27 — Turn 13: a module with two frontages, and crowds that steer

**User feedback:** every module must have buildings on **both** sides of its
street — an east–west street with buildings N and S, joined by north–south half
streets at the cell edges — so modules connect and tile; and the obstacle
avoidance still looks "funny and unnatural".

### Changed

- **The cell is an intersection, not a street with a backdrop.** `world.js` now
  carries `SIDE_STREET` (a 3.6 m half street at each x edge, so two cells meet in
  a 7.2 m north–south street), `NORTH_BLOCK` (−14…−9.6) and `SOUTH_BLOCK`
  (8.3…10.5). Both pavements are clipped to the block between the half streets,
  the lots moved back onto the north frontage and a second row — `SOUTH_LOTS`,
  two single-storey shop blocks with a gap on the centre line — faces the street
  from the near side.
- **Both rows are real, drawn geometry.** The south row is drawn per lot
  (`drawSouthLot`), with a solid mass, a glazed shopfront, a lettered sign band,
  an awning and a blade sign. It sorts with the people and the cars
  (`southRowItems`), so it occludes the crowd correctly instead of being pasted
  behind it; the buildings were also sorted far-to-near so a block can no longer
  print its windows through its neighbour.
- **Neighbour cells are the same module.** `cells.js` now draws the south row
  and the half streets, clips the pavements and the kerbs to the block, and runs
  the lane dashes at the neighbour's own z (they used to land on the hero cell).
  The near row of buffer cells is drawn *after* the hero and sorts with it.
- **The crowd steers instead of being shoved.** `collision.js` gained `relax()`:
  a damped, softly-saturated solver with a `lateral` bias, so a body pushed
  backwards along its own heading slides sideways instead of reversing. Bodies
  are weighted by opacity rather than switched in and out, and each solver pass
  is single-group (people vs furniture, then people vs people). Pedestrians get a
  lane offset along their flow, street furniture is an explicit obstacle list
  (`STREET_PROPS`), placement keeps clear of the furniture, and the walk-in is a
  short 1.6–4.6 m at walking pace instead of a sprint from the cell edge. Average
  step is 0.0451 m per frame (a 20 s sweep at 50 ms, 640×360), down from
  5.455 m; the worst single step is 0.796 m, and it is a single-frame correction
  where a body threads between two props, not a teleport.
- **The side streets carry their own markings:** asphalt through the full cell
  depth, kerbs along the inner edge with stone ticks, and a wet band.

### Fixed

- **Proportions.** Figures were 1.3 m tall with the head resting on the
  shoulders; they are now built as a 1.72 m adult — head clear of the collar, a
  coat hem with two legs below it instead of one triangle down to the ankles —
  and the pale coats are opaque.
- The camera framings were recomposed for the module: the drone opens on
  `(10.2, 21.0, 34.0) → (−1, 1.8, −2.8)` at fov 39 — high enough to see the
  crowd over the near shop row — the tripod shot is axial down the street where
  both frontages read, and the crane, orbit and detail shots were raised above
  the near row.
- The south row and the forecourt now sit on the raised slab, so the near block
  reads as a pavement rather than a floating shelf.
- Crowd walk-on no longer starts 20 m away at sprint speed; the drain no longer
  jumps its own offset when the crossing ends.

## 2026-10-27 — Turn 12: glass planes, a wider street, tileable cells, palettes

**User feedback:** “let the glass box just [be] planes without frames along the
edges”; every neighbouring cell must be fully developed and self-contained so
cells can be tiled (the train must sit inside its own cell); the street must be
wide enough for cars to pass naturally; people must move naturally, not like
hover bots with instant circumnavigation; `Tab` stays the sidebar and the stats
overlay moves to `\`; add palette options alongside styles — patent sketch, ink,
b/w, möbius and a custom user palette.

### Changed

- **The case is glass, not carpentry.** `collectFrame()` now draws four panes
  and a lid — a soft vertical gradient plus one diagonal sheen each — and no
  posts, rails, cut caps, plinth or label. `TILE.post` / `TILE.rail` are gone.
  A frame along an edge would read as hardware around *one* cell and would break
  the moment two cells sit side by side.
- **Street widened from 9.2 m to 11.8 m.** `ROAD_EDGE` in `tile.js` is the single
  source of truth (`groundYAt` uses it, so every foot and every camera follows).
  Lanes at z ±2.6 (5.2 m apart, 3.3 m of passing clearance), parking bays at
  z ±4.85, crossing 4.6 m wide, signal arms 4.3 m, wait zones and pedestrian
  flows moved out to the new kerbs.
- **Crowd motion is now heading-driven.** `_crosserAt()` returns the path as a
  pure function of loop phase; the heading is a central difference over ±0.4 s,
  blended out of a resting pose. People turn *towards* a corner before they
  reach it, walk along the pavement on the approach leg instead of sliding
  sideways, and settle into a slow weight shift when they stop. Still bit-exact
  over the loop (the determinism check passes).
- **The train belongs to its cell.** It is clipped to the projected window of
  the tile at its own depth, so it slides in and out through the cut faces
  instead of hanging off the end of the model.
- **Lane markings are world-periodic.** Dashes are laid out on a 6 m world grid
  (`cells.js`), so a cell boundary lands exactly on a period and the centre line
  continues across the seam.
- **Keybinds:** `Tab` opens the sidebar (unchanged), `\` toggles the stats
  overlay, `H` hides/shows all UI. The footer and the console greeting say so.
- **Neighbour cells are real cells.** `src/cells.js` paints ground, road, kerbs,
  paving joints, world-periodic markings, a zebra crossing, the elevated line,
  four jittered building lots with window grids, lamps and trees from the same
  rules as the hero. `bufferStyle` is now `developed` (default) / `wireframe` /
  `point cloud`; developed cells are drawn solid, because a faded cell leaves a
  tone step at the seam.
- **Palettes.** `src/palette.js` grades every colour the Painter is handed:
  a paper→ink ramp with per-palette gamma and contrast plus accent preservation.
  Five palettes: *Möbius* (the authored night), *Patent sketch* (cream paper,
  blue-black ink, vermilion stamps), *Ink* (monochrome on black), *B/W*
  (black on white) and *Custom* (four colour wells, remembered in
  `localStorage`). `glowScale` keeps the additive glows from burning out a light
  palette. The cached set keys on the palette version.
- **Style presets** `patent`, `ink`, `bw` and `mobius` join `linocut`, `plate`,
  `riso`, `newsprint` and `blueprint` in the print-finish graph.
- Sidebar: a new **Palette** section with swatches and custom wells, the print
  section renamed **Style**, buffer style options, and the new key hints.

### Added

- `?palette=patent|ink|bw|mobius|custom` to boot into a palette.
- `window.VALE.setPalette(id, custom)` / `window.VALE.palette()`.
- `Painter.alphaMul` (fade a whole neighbour cell without touching call sites)
  and `Scene.invalidateStatic()`.

## 2026-10-27 — Turn 11: the frame budget pass

**User feedback:** still not smooth; add a stats overlay and switches for every
feature; “rebuild the engine from scratch if you must while trying to keep the
look”; audit the texture features so a strength of 0 really switches them off;
default camera should be the drone; remaining z-sorting errors; walls should be
a toggle; render the surrounding cells of a 3×3 volume as a cheap point cloud,
each neighbour switchable and off by default; hide the UI until `\` is pressed.

### Added

- `src/stats.js` — a self-contained stats.js-style overlay (fps, ms, 120-sample
  graph with 16.7/33.3 ms guides, per-stage bars, live feature flags). No CDN.
- `src/neighbors.js` — the eight buffer cells of the 3×3 volume. Each cell is a
  real, correctly-offset copy of the tile's footprint and building lots, drawn
  as a wireframe or a point cloud with adjustable opacity.
- `CameraDirector.place()` and per-mode `place()` hooks, so tools and deep links
  can teleport the camera without fighting the mode's own integrator.
- `params.walls` bitmask (`1` back wall, `2` left wall, `0` = open diorama,
  default `0`), `params.bufferCells` bitmask, `params.bufferStyle`,
  `params.bufferOpacity`, and seven `feat*` switches (crowd, traffic, rain,
  puddles, reflections, signals, lamp flicker).
- Adaptive resolution: a governor in `src/main.js` moves the render scale in
  5 % steps between 45 % and 100 % to hold ~60 fps (`?scale=` pins it).
- A cached static set: the backdrop, street, paving, rail, buildings and
  furniture are painted into an offscreen layer and re-blitted (with an integer
  drift offset) instead of being redrawn every frame.
- Glow sprites: emitter glows blit a cached radial-gradient sprite instead of
  building a gradient per call.

### Changed

- **The shader graph compiles only live nodes.** A node that is switched off, or
  whose every driving strength is 0, is dropped entirely — no function, no
  uniforms, no call. Previously each node compiled in and early-returned on a
  `u_enabled` uniform, which still paid for the branch and the preamble.
- **Renderer no longer reallocates its textures every frame.** The plate and
  field textures are allocated once per size and updated with `texSubImage2D`;
  the program is rebuilt only when the live-node set changes; and
  `preserveDrawingBuffer` is off unless `?capture=1` (it forced a full-frame
  copy every frame).
- The backdrop is split into two cached layers — `drawWalls()` (behind the
  train) and the rest of the set (in front) — so the elevated train no longer
  paints over the buildings. `drawGroundSlab()` closes the floor on its own.
- Default camera is the drone, opening on the cinematic rig's framing.
- The UI is hidden on load. `\` shows/hides it; the tab handle fades in on
  hover and disappears entirely while the UI is hidden.

### Fixed

- **Frame-killing canvas arguments (the actual cause of the blank page).** The
  blade-sign call in `environment.js` passed its arguments one slot out of
  order, so `drawSignBox` received an object where it expected a tint and `NaN`
  where it expected an alpha. `@napi-rs/canvas` coerces those silently and every
  headless still looked fine; a browser throws from `createRadialGradient` and
  the frame dies. The call is fixed, `glowAt()` refuses non-finite input, and
  `tools/finite.mjs` (wired into CI as `npm run finite`) now re-renders the whole
  loop at three viewport sizes through a browser-strict canvas guard. The boot
  test does the same to the *built bundle*, so this class of bug fails the build.
- **Blank page after the Turn 11 renderer refactor.** `initGL()` built the
  full-screen quad before compiling the look program, so `_initQuad()` called
  `gl.getAttribLocation(undefined, 'a_pos')`. On a real WebGL2 context that
  throws, the `Renderer` constructor threw, module evaluation stopped and the
  canvas stayed black — the failure was invisible in Node because the headless
  harness has no WebGL and took the 2D fallback every time. The program is now
  built first, the attribute is bound (and re-bound whenever the program is
  rebuilt), and two new tests cover the path that used to be untested:
  `tools/renderer-smoke.mjs` (unit, strict GL) and `tools/boot-bundle.mjs --gl`
  (boots the *built* bundle through the real WebGL path). Both are in
  `npm run verify`; reintroducing the boot order makes them fail.
- The renderer can no longer die silently: a GPU pass that produces nothing for
  three frames falls back to the 2D composite (logging the reason and the
  renderer string), `?renderer=2d` forces that path, and frame errors are shown
  in an on-screen strip instead of only in the console.
- `caseFrame` was never read by the case builder (it checked `params.case`), so
  the toggle did nothing; the frame now disappears when switched off.
- Shader presets no longer leak `enabled: false` from `plate` into the next
  preset.

## 2026-10-27 — Turn 10: perfect loop, faster frames, cleaner case

Tagged `v0.1.1` at the start of the turn (the state the user had just reviewed).

**User feedback:** “better, let’s tag this with v0.1.1 and continue”, plus:
cleaner/off-by-default case, collapsible menu sections, a thorough performance
pass, “S does weird things and start stuttering”, and a demand that every
random element use looped noise with predictable seeds so the whole scene is a
perfect deterministic loop, with looping rather than fading.

### Added

- `src/loop.js`: the loop rulebook — `loopFrac`, `loopCycles`/`loopPeriod`
  (periods quantised to `20 / integer`), `loopNoise` (seamless, integer-cycle),
  `loopTri`, `wrapRange`, `boundaryAlpha` (wrap / fade / clip buffer) and
  `seeded`.
- `tools/determinism.mjs` + `npm run determinism`, wired into `npm run verify`:
  asserts the plate at t and t + 20 is byte-identical, from a cold scene and
  after a full playback.
- `params.loopBuffer`: metres of boundary band where crowd and vehicles fade.
- Scene parameters: `caseFrame` is now **0 by default**.
- Sidebar: collapsible sections (click the header), a `boundary buffer` slider
  and a `render scale` row.

### Changed

- `weather.js` rewritten: no `dt` integration, no respawn RNG. Drops are seeded
  specs with quantised periods; ripples are derived from landing times.
- `timeline.motionT` is now the loop clock itself (`motionScale = 1`); crowd
  idle sway uses integer cycles per loop, so t = 0 and t = 20 match exactly.
- Crowd walks in from the tile edge, crosses on the green and walks off the far
  side; alpha comes from the boundary buffer, not from a global fade.
- Vehicles are choreographed against the signal (approach → wait at the stop
  line → drive through → wrap off-screen) instead of fading in during a surge.
- The case is cleaner: no bolts or corner ticks, thinner posts, one crisp rail
  weight, less jitter.
- `lab.js`: `S` only saves a frame with `Ctrl/Cmd+S` and only while the lab is
  open — walking backwards no longer triggers a full-resolution PNG export
  (that was the stutter).

### Performance

- `Scene._ensureStatic`: the static set is cached and blitted with a sub-pixel
  offset, repainted only when the camera drifts > 2.5 px, the LoD level changes
  or the loop wraps.
- The plate follows the viewport (≤ 1.25× DPR, 640–1440 px) instead of always
  rendering 1440×810; `?scale=` and the sidebar’s render-scale row shrink the
  shader too.
- Measured in the Node canvas benchmark: **54.7 → 21.9 ms** per frame at
  1440×810 (2.5×), 15.7 ms at 1280×720, 11.6 ms at 900×506.

## 2026-10-27 — Turn 9: game-style cameras, sorted case, sidebar

**User feedback:** “the render is coming along… still things to solve but I'm
encouraged.” Three requests: game-style navigation (no right-drag pan), toggles
for the case boundaries (badly depth-sorted) and the unnatural static smudge,
and a hidden sidebar for live parameters.

### Added

- `src/camera-modes.js`: `CameraMode` base and four controllers — `CinematicMode`
  (`SHOTS`: `rig`, `tripod`, `crane`, `orbit`, `detail`), `FpsMode`,
  `ThirdPersonMode`, `DroneMode` — plus `MODES`, `dirFromYawPitch`,
  `yawPitchFromDir`, `clampToTile`.
- `src/camera-director.js`: shared input plumbing (pointer look, wheel, keys,
  HUD), runtime `setMode/cycle/setShot/place`, aliases (`orbit→third`,
  `fly→drone`, `auto→cinematic`, `user→third`).
- `src/sidebar.js` + `.sb-*` CSS: hidden authoring panel (`Tab`, ☰ handle,
  `?ui=1`, `?panel=1`) with Camera / Scene / Texture / Palette / Case / Playback
  sections; every row re-reads its live value through `sync()`.
- `params.caseFrame` and `environment.collectFrame()`: frame members return
  `{ depth, draw, group }`; far shell before the set, near posts merged into the
  scene's depth sort.

### Changed

- `scene.js` draws the case through the sorted list (a post in front of a car now
  occludes it), and `camera.js` is used only by `CinematicMode`.
- `lab.js` camera section now exposes cinematic / first person / third person /
  drone.
- `PRESETS.linocut` softened at the preset level (hatch 0.20 → 0.11, contour
  0.40 → 0.24, fiber 0.045 → 0.026, vignette 0.16 → 0.11, grain 0.070 → 0.062).
  The node defaults in `shaders.js` were softened too, but the preset is what
  actually ships.

### Removed

- `src/camera-control.js` (superseded by the director; nothing imports it) and
  its right-drag pan.

### Verified

- `npm run verify` green; build 141.5 KiB; boot `fallback: true`; finite check
  clean.
- Camera probe: all four modes move and stay finite; cinematic shots drift
  0.08–2.42 m over 60 frames (steady, not static).
- Sidebar probe (headless DOM): 24 rows, and external changes to mode, case,
  hatch strength, LoD, speed and pause all flow back into the widgets.
- Case A/B stills with rain disabled: entering the volume, the back posts are
  hidden by the building block and only the top rail above the roofline remains
  visible — no frame lines drawn over the set.

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

## 2026-10-27 — Turn 6: the tile becomes an engine unit

**User brief:** “we are building the foundations for a cosy indie sim game
engine… everything is procedurally generated with procedural LoD… think of the
scene as a modular 3d volume (almost like a snow globe or a vignette that we can
use to build tiles from).”

### Added

- `src/tile.js`: the tile volume (`x −15…15`, `z −14…10.5`, `y −1.6…15.6`),
  colours, three `LOD_LEVELS` with detail budgets, `makeDetail`,
  `lodForScreenHeight`, `groundYAt`, `tileScreenHeight`.
- `src/world.js` rewritten as one-tile data (single road, two sidewalks, one
  crossing, four lots, seven flows, ten puddles).
- `src/environment.js` rewritten as staged set construction, including the
  physical case (plinth, posts, cut-face caps, engraved label).
- `tools/shot.mjs` + `tools/canvas-env.mjs`: headless stills through a
  DOM/canvas shim, with `--t`, `--eye`, `--target`, `--fov`.
- `src/renderer.js` `bypass`; `?finish=raw` / `?raw=1` in `src/main.js`.
- `docs/CURRENT_STATE.md`, `docs/HANDOFF.md`, `docs/ARCHITECTURE.md` rewritten
  for the engine framing.

### Changed

- Camera refit against the full object extents so the whole case is in frame
  (eye ≈ `[9.4,14.6,38.8]`, target ≈ `[−1.0,3.6,−2.2]`, fov 37.7–38.8).
- Crowd rewritten twice. The final version gives every person a filled
  silhouette with a leg split, a head disc sized from the projected body
  height, arms, and a dome umbrella whose rim plane is tilted; density reduced
  to 34 + 18, umbrella rate to ~35 %.
- Trees rebuilt: tapered trunk, root flares, 4–6 primary limbs with
  sub-branches, a 9-sided leaf cluster per tip, cast shadow.
- Facades: full window grid on the primary face, 55 % density / 60 % light on
  the side face; mullions, sills, balcony rails; shopfront transom, counter and
  interior silhouette.
- Road darkened (`#101215` base, `#232327` front sidewalk); zebra bars dulled
  and scuffed.
- Vehicles: gradient body fill, roof rim, wet sheen, brake glow for stopped
  vehicles.
- `draw.js`: `poly` accepts `gradient: [[t, colour], …]`.

### Fixed

- People no longer collapse into wireframe X's: every size is derived from the
  projected body height, not from world units.
- Umbrellas no longer read as flying saucers or lollipops.
- Trees no longer read as white ferns or as a single floating blob.
- Windows no longer read as a spreadsheet, and blocks no longer look
  transparent.

### CI

- `deploy-pages.yml` now triggers on **every branch** (`'**'`) and runs
  `npm run check` before building, so any branch is a previewable build.

## 2026-10-27 — Turn 7: fix the blank deploy

**Symptom:** the GitHub Pages build rendered a black screen.

**Root cause (two, both fatal):**

1. `build.mjs` substituted the bundle with `String.replace(marker, js)`. A
   string replacement expands `$&`, `` $` ``, `$'` and `$$`; the minified bundle
   contains `$&&` (esbuild names variables `$`), so the marker was injected into
   the middle of the code. The inline script no longer parsed → blank page.
2. `src/main.js` published `window.VALE` before `const lab = new Lab(...)`, a
   temporal-dead-zone `ReferenceError` at startup.

**Fixed**

- `build.mjs`: function replacers, marker-survival check, and a `new Function`
  parse check on the emitted bundle (fails the build on a syntax error).
- `src/main.js`: `window.VALE` is published after all construction.
- `tools/boot-smoke.mjs` + `npm run boot`: runs the *built* bundle under a DOM
  shim, drives six frames, fails on any startup error. Wired into CI.
- `npm run verify` = check + build + boot.
- `.gitignore`: `.boot-smoke.cjs`.

**Verified:** default, `?finish=raw` and `?cam=fly&lab=1` all boot clean; the
extracted inline script passes `node --check`; the served page is 200 / ~127 KiB.

## 2026-10-27 — Turn 8: the NaN that blanked the page

**Symptom:** `?finish=raw` threw
`TypeError: Failed to execute 'createRadialGradient' … non-finite` and the
canvas stayed blank.

**Root cause:** the vertical blade sign was called with a stray leading argument:

```js
drawSignBox(p, camera, side, 0.62, 3.1, 0.62, b.accent, detail, seed + 200);
//                          ^ stray: d received "teal"
```

so `side.z + d * 0.4` became `NaN`, the projection returned `NaN` coordinates,
and the glow gradient threw. Headless `@napi-rs/canvas` silently coerces `NaN`
to `0`, so every still and every boot test passed while the browser died on
frame 1.

**Fixed**

- Corrected the `drawSignBox` call (y = 0, w = 0.62, h = 3.1, d = 0.62).
- `glow()`, the signal glow pool, vehicle lamp glows and the weather field blobs
  now refuse non-finite geometry instead of handing it to the canvas.
- `main.js` guards the frame loop: a single bad frame is logged once
  (`window.__valeError`) and the loop keeps running, so one error can never
  freeze the page black again.
- `tools/finite.mjs` (`npm run finite`): wraps every Canvas2D entry point and
  fails on non-finite coordinates or negative radii across the whole loop at
  three viewport sizes. Wired into CI.
- `npm run verify` = check → build → boot → finite.

**Verified:** the finite check is clean across 0–20 s at 1440×810, 900×506 and
640×360; boot still passes; build 127.4 KiB.
