# VALE — changelog

Dates use the user’s local timezone (America/New_York).

## 2026-10-28 — Turn 19: the whole neighbourhood is alive

**User brief (four notes):** people and vehicles should run in loops throughout
the neighbourhood instead of only the centre tile; every random element should
run on its own cyclical random loop; people should walk every block and cars
drive every street; cars must stop **before** the crossing, not in the middle of
the intersection.

### Added

- **A derived road network** (`world.js`): `roadLines()`, `blockCircuits()`,
  `circuitStops()`, `circuitPoint()`, `pavementRuns()`. Streets live on tile
  seams, so one closed circuit is derived around every block they enclose. Each
  circuit carries its own geometry: `x0/x1/z0/z1`, `w`, `d`, `length`, and the
  `ring` in travel order (east along the low-z edge, south, west, north).
  The default 5×5 world yields **9 circuits** covering every street, and
  `?size=` scales it (3→1, 5→9, 7→25, 9→49 circuits).
- **Per-car cyclical random loops** (`traffic.js`). `planCars()` draws each car's
  body, colour, lap count, dwell, speed and start phase from one seeded
  generator. 18 cars (two or three per circuit) each drive their own lap: they
  complete a whole number of laps per 20 s loop, so the frame at t=20 is the
  frame at t=0 — bit-exactly — while no two cars share a rhythm.
- **Pavement strollers** (`crowd.js`). `pavementRuns()` gives one trimmed
  stretch of pavement per block frontage; a stroller patrols its own sub-span,
  out and back, easing to a stop at each end, with its own start phase. At the
  default size that is **36 strollers on 419 m of pavement** — one per frontage,
  on every block, in every direction.
- **Repaint-by-occlusion** (`scene.js`). See Fixed.

### Fixed

- **Cars stopped in the middle of the intersection.** The old model hard-coded a
  single street and a stop ±3.0 m from one crosswalk. A circuit now stops at a
  *stop line*: `gap = HALF_ROAD + 0.9 + half` before each ring corner, measured
  to the car's own nose. Verified across all 72 stop points of the default
  world: every nose comes to rest **6.30 m from the junction centre, 2.70 m
  clear of the 3.6 m junction box** — before the zebra, every time.
- **The neighbourhood was empty because it was faded out.** The crowd's wrap box
  was one tile, so every walker outside `TILE` was drawn at alpha 0 (78 of 132
  were invisible). The box now follows the built set.
- **Cars and people painted over buildings.** The set is baked to a cached
  layer, so the dynamic layer had nothing to depth-test against: once traffic
  ran on every street, cars read as though they were parked on rooftops. The
  blocks that actually hide a moving thing are now collected per frame (segment
  vs. box, six samples per car, two per walker) and re-inserted into the same
  depth sort as the cars and people. Exact occlusion — no clipping, ghosting or
  popping — at the cost of a handful of block repaints a frame.
- **Left-bound vehicles mirrored on the wrong axis.** The body mirror assumed
  x-travel, so a car heading -z would have been reflected across x. The mirror
  now follows `spec.axis`.

### Verified

- `npm run verify`: finite check clean; determinism `t=0 / t=20`, `t=4.5 /
  t=24.5`, `t=11 / t=31` all **bit-exact**.
- Still frames at 2560×1440 (`/home/user/shots/t19/t0.png`, `t11.png`).

### Known follow-ups

- Cars stop at every junction for a fixed dwell; they are **not** signal-coupled
  to the stage crossing any more. A car can therefore pass through the zebra
  while the crowd is crossing it; the crowd solver keeps people off the body, so
  they part around it rather than overlapping. Worth deciding whether the stage
  crossing should stop traffic outright for its ~9 s.
- Strollers walk their own frontage out and back rather than rounding the block
  corner. A full lap of a 95 m block in a 20 s loop would need ~4.7 m/s, which
  reads as running; the turnaround is the honest way to keep a human pace
  inside the loop.

## 2026-10-28 — Turn 18: architect view, corner fillets, walkable streets

**User feedback (four notes):** the default view is missing from the style
choices and should be called `architect`; sidewalk corners curve the wrong way
(they should curve *into* the streets); “sometimes are not combining properly”;
people should walk all over the available streets.

### Added

- **`architect` steady shot.** The film's default eye (high, three-quarter,
  whole volume) was only ever an undocumented hard-coded pose inside the drone
  mode, so it never appeared in the shot list. It is now a named entry,
  `Architect · default`, and the drone reads its numbers from that entry rather
  than duplicating them — the two can no longer drift apart. The sidebar reports
  `architect` while the drone holds that framing.
- **Pavement lanes derived from the built world.** `world.js` grew
  `streetLanes()` and `laneFlows()`: they walk the tiles, and for every street
  edge emit one lane per pavement, split at junctions (a pavement does not carry
  on through another street's carriageway) and emitted once per shared seam.
  `crowd.js` mixes those lanes with the hand-authored stage flows.
- Largest-remainder allocation for walkers. With ~55 flows and ~80 people,
  `floor(N * weight)` silently gave **47 of the 48 lanes zero walkers**.
- Sidebar **Playback** now shows `loop 13.50 s · CROSS` and has a time slider, so
  a moment in the cycle can be found without opening the lab.
- Lab phase bar segments are labelled and titled (`CROSS · 4.4–13.6 s`). They
  were anonymous colour blocks, which is why scrubbing the timeline told you
  nothing.

### Fixed

- **Corner fillets curved the wrong way.** The arc was swept around the pavement
  corner, so the bulge went into the pavement and read as the pavement swelling
  over the road. A true fillet is tangent to both kerbs: its centre sits
  `R` inside the pavement and the arc bulges back toward the street. The sliver
  between corner and arc is roadway.
- **Lane bands were on the wrong side of the seam.** The first version put each
  pavement band against the tile edge. The strip a tile owns on a street edge is
  6 m — `HALF_ROAD` of its own carriageway, *then* `WALK` of pavement — so every
  lane landed inside a carriageway, `isOnSidewalk` rejected all of them, and the
  streets stayed empty. `cells.js` `drawGround` is the authority here.
- Crowd bands are axis-aware (`{ axis, a0, a1 }`). A north-south lane has to be
  clamped in x, and the old band only knew about z.
- **`?shot=` was silently ignored.** Naming a shot while the default drone was
  driving recorded the selection but never applied it, so the URL said one thing
  and the picture showed another. A named shot now implies cinematic mode unless
  `?cam=` was given explicitly.
- `rebuildWorld()` now rebuilds the crowd, so changing the tile grid gives the
  crowd the new pavements instead of the ones it was born with.

### Caught by the checks

Making `architect` the **cinematic** default broke `npm run verify` outright:
the steady shots integrate their own clock, so a drifting shot as the default
made `t = 0` and `t = 20` differ. `rig` stays the cinematic default (it is a
pure function of loop time) and `architect` is a shot you can select. Without
the determinism check this would have shipped as a silently broken loop.

### Verified

`npm run verify` passes, including `looping every 20s, bit-exact`. Crowd census
on the 3×3 default: **55 of 63 lanes occupied**, 78 walkers spanning
`x −44.1 … 42.7`, `z −31.7 … 32.4` (previously the crowd sat inside
`x ±10.4`, `z 6.7 … 17.9`).

---

## 2026-10-28 — Turn 17: recover the real branch, keep only what travels

**What happened:** a session began on `arena/45e6b5a9-vale` from `main`
(`de04b9a`), believing it was the newest work. The clone was single-branch and
only tracked `main` plus that working branch, so `arena/bab4bc10-vale` — 21
commits ahead, and the branch that had redefined the brief to an indie sim
**engine** with a tileable volume — was invisible. That session spent its time
on a film art pass against the superseded brief. Screenshots of both branches
(`docs/shots/compare-branches.jpg`) show Turn 16 is ahead visually as well as in
architecture, LoD, tests and loop determinism.

**Resolution:** `arena/45e6b5a9-vale` now contains the full Turn 16 tree
(`6a57a47`), merged without modifying any tracked file — `src/` diffs empty
against `6a57a47`. The superseded art pass was discarded. Only portable
additions were kept.

### Added

- `scripts/setup-headless.sh` — compiles stub NSS/NSPR shared libraries so the
  `@sparticuz/chromium` npm tarball runs where there is no system Chromium, no
  apt and no Playwright/Puppeteer CDN. Verified from a cold start.
- `scripts/shoot.mjs` — headless stills of the **final composited film** through
  the real WebGL2 look pipeline. Complements `tools/shot.mjs`, which renders the
  2D ink plate without a browser.
- `docs/SCREENSHOTS.md` — both tools, setup, arguments, and how to tell a real
  WebGL capture from a 2D-fallback capture.
- `docs/BRANCH_COMPARISON.md` — the branch audit and the salvage list.
- `npm run serve`, `npm run setup:browser`, `npm run shots`.

### Verified

`npm run verify` passes on the merged tree: check, build, boot, boot:bundle,
renderer smoke, finite, determinism (`looping every 20s, bit-exact`).

### Note

The workflow deploys on any branch, so the superseded branch's deploys had
overwritten Turn 16 on GitHub Pages. This branch's deploy restores it.

---

## 2026-10-27 — Turn 16: the set is a grid of tiles

**User feedback:** the scene was meant to be an intersection and deserves a 3×3
grid of tiles, not one; once tiles were added, buildings stood on the street;
the tile kinds wanted are an intersection, a solo block, a block that extends
EW and one that extends NS; a minimap like the buffer zone, up to at least 5×5,
with the original scene built out of 3×3; tile kinds cyclable and the world
regenerable from a new seed; the whole scene storable as seed + url; crosswalks
only on the corners that match the tile type, optionally a crosswalk-only tile
and diagonal crossings; no parked cars; people must not be able to push cars;
street lights and traffic lights in the right places; the elevated train a
separate system with its own tiles and controls; no camera-facing sign on the
truck; no circular car shadows.

### The tile world

- **A street lives on a seam, never inside a tile.** `src/tiles.js` is now the
  single source of truth. A tile declares which of its four edges carry a
  street half (`BITS { n1, e2, s4, w8 }`); a seam exists only when *both*
  tiles on it ask for it, so two halves always make one 7.2 m carriageway with
  2.4 m pavements. Every street therefore runs exactly down the middle of a
  shared boundary, which is what makes the grid tile at all.
- **Kinds** (`KINDS`, `KIND_IDS`): `block` (solo block — streets on all four
  sides, buildings in the middle), `block_ew` (streets north and south, the
  block runs on east–west), `block_ns` (the mirror), `row` (a low shop row),
  `yard` (an open lot), `intersection` (four streets, a paved crossing in the
  middle, no buildings) and `park` (no streets at all).
- **3×3 by default, up to 9×9.** The main street (the seam at z = +12.25) and
  its cross street (x = +15) are always built, so the film's corner is always
  an intersection whatever the minimap is set to.
- **Buildings cannot stand on a street.** Lots are generated inside each
  tile's interior box and `lot()` clamps them to it, so a lot that asks for the
  pavement is pushed back rather than drawn over it. The two rows of a block
  now meet in the middle, so a block has no gap to see the far street through.
- **The minimap editor** (`sidebar.js`, "Tile world"): click a tile to cycle its
  kind, shift-click back, right-click to reset, plus grid size 3/5/5/7/9,
  presets, a seed slider with *new seed*, *copy link*, and a diagonal-crossings
  toggle. `.sb-tile.k-<kind>` in `style.css` colours every kind so the map reads
  as a plan.
- **The whole scene is seed + url.** `scene.toUrl()` writes
  `?world=&size=&tiles=…&diag=`; `scene.fromUrl()` reads it back, `worldKey()`
  is in the static-cache key so a change repaints the set.

### Drawing fixes

- **The glass-box look is gone.** Three separate causes: `p.box` strokes *all
  twelve* edges unless `edges: false` is passed (every block was a wireframe),
  the roof cornice ran across the wall instead of along it (a fin of glass
  through the block), and roofs were gated on `detail.roofs`, a field that no
  LoD level has, so they were never drawn.
- **One depth-sorted list per frame.** Ground planes go down first, far to near;
  then lots, props, crossings and the four signal heads of every junction sort
  together by projected depth (lots by their nearest box corner). A tile used to
  be painted as a unit, which let a crossing two tiles away print through a
  near shopfront.
- **Cars**: parked cars are gone; every vehicle loops the street as a film set
  does, stopping at the stop line for the pedestrian window. The shadow is a
  ground footprint quad, not a circle, and the taxi's roof sign is a 3D box.
- **People cannot push cars**: vehicles enter the crowd solver as a row of
  fixed discs along their own axis, so a pedestrian walks round a car and never
  moves it.
- **The elevated train is its own system**: its own panel with a switch and a
  0.2–4× speed, its own clock (`timeline.train(speed)`), its own rail. Tiles for
  the line are the next step.

### Tooling

- `tools/shot.mjs` grew `--tiles`, `--size`, `--seed` and `--preset2`, so the
  tile world can be rendered from the command line; `--eye/--target/--fov` is
  unchanged.

## 2026-10-27 — Turn 14: cells that tile by edge, and a pavement you can walk round

**User feedback:** a cell must tile with its neighbours — an EW-street tile either
pairs with another EW street to extend the block, or meets a corner sidewalk;
the E and W spacing was wrong (no pavement to turn on, and the gap to the next
EW tile too small); and turning on **E** in the buffer panel lit the wrong
diagonal (SW).

### Changed

- **The side street is 10.8 m across, not 7.2 m.** `SIDE_STREET` is now
  `{ road: 3.0, walk: 2.4, x0: -12, x1: 12, blockX0: -9.6, blockX1: 9.6 }`. Paired
  with a neighbour that is a 6.0 m carriageway with 2.4 m pavements each side —
  wide enough for a car to pass a parked one, and wide enough that the gap reads
  as a street rather than an alley. The block narrows from 22.8 m to 19.2 m and
  the two rows were re-laid to fit, including a shop row that now clears the
  crossing instead of sitting on it.
- **The pavement is a ring.** `SIDEWALKS` gained four corner returns
  (`EAST_N/EAST_S/WEST_N/WEST_S`), each drawn as a prism with a **rounded outer
  corner** (`KERB_RADIUS = 1.5`, `cornerOutline` + `slabPrism`) so the kerb line
  and the pavement edge are the same curve. That is the surface a pedestrian
  turns on, and it is why the module reads as a finished block before its
  neighbour is placed. The paving joints on the returns run with the side
  street, not across it.
- **Crossings at the ends of the block.** A zebra over each half street where
  the pavement crosses it, plus the ramps; and a zebra across the main road at
  each end of the block, which is the crossing that joins the front band to the
  corner return. Without the pair the ring is decoration.
- **Cells have a kind, and the kinds are what make a set tile.**
  `cells.js` now takes `kind`:
  - `street` — street both ways and a half NS street on both x edges (the
    current module);
  - `block` — **no** side street: the rows run out to both x edges and merge with
    the neighbour's, and the lane dashes run edge to edge;
  - `yard` — the side street stays but the block is an open lot: fence,
    containers, bay stripes, a lamp.

  `defaultKindFor(dx, dz)` is the edge rule — east/west continue the street,
  north/south are block — so a tiled set is a street grid with a T junction at
  each end, not nine copies of one intersection. `neighbourKind` forces one kind
  everywhere for inspection.
- **Layout presets** (`Scene.LAYOUTS`, `?layout=`): `auto`, `grid` (streets on
  all four sides), `row` (E and W only), `block` field, `yard`. A preset sets
  both which neighbours are on and what kind they are, which is the fastest way
  to see how two tiles connect.
- **The crowd turns corners.** A new `corner_e` flow walks the near pavement,
  rounds the corner return and goes north up the east side street. It uses an
  explicit waypoint path (`pathTable` / `alongPath`) resampled by arc length and
  smoothed in space, walked at a constant 1.15 m/s — a single quadratic bezier
  cut the corner straight across the road, and easing the crossing's parameter
  over a corner read as jogging.
- **Stroll bands.** A strolling flow now clamps its own z to its pavement band,
  so the walk-on drift cannot carry somebody into the furniture line.

### Fixed

- **E toggled SW.** The buffer grid has a gap for the hero in the middle, so the
  grid index was off by one from the bit index of `BUFFER_CELLS`. The bit is now
  `1 << BUFFER_CELLS.findIndex(...)`.
- **Parked cars were 2.6 m discs** in the crowd solver, which reached across the
  pavement and shoved pedestrians around a car that was not there. Vehicles are
  now a row of discs along their own axis (`half`, `across` on the traffic item).
- **Furniture stood in the walking lane.** The vending machine, bins, benches,
  planters, tree and the second lamp were at z 6.4–7.5, which is the middle of
  the pavement; they are now against the shopfront line at z 7.85–8.1 and on the
  corner return, with `STREET_PROPS` matching so the steering solve has nothing
  to fight. Crossing queues and wait zones start at z 6.45, clear of the signal
  and lamp posts at 6.1.
- **Cracks were unclamped on the corner slabs**, which drew 2.2 m lines across
  the side street.
- Side-street centre lines sat on the inner kerb instead of the cell boundary,
  so two halves did not join into one street.

### Measured

20 s loop sampled at 50 ms (640×360), counting only bodies above alpha 0.12:
**0.0444 m average step, 0.457 m worst single step** — the worst is now a body
threading a knot at a crossing, not a teleport.

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
  depth, kerbs along the inner edge with stone ticks, a courtesy crossing where
  the pavement picks up again, and a wet band.
- **Walking past the furniture is a nudge, not a shove:** the people-vs-props
  pass runs two iterations with a small cap and a lateral bias, so brushing past
  a lamp post or a planter reads as a step aside. Displacements are capped
  (`maxOffset 0.42` furniture, `0.18` crowd) and every body is weighted by its
  opacity instead of being switched off, which is what used to pop a fading
  pedestrian half a metre sideways.

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
