# VALE — session handoff

**Purpose:** resume this project in a fresh session without re-deriving
anything. Read this, then `docs/CURRENT_STATE.md`, then `docs/ARCHITECTURE.md`.

---

## Turn 17 — continuity note (2026-10-28)

**Branch:** `arena/45e6b5a9-vale` now **contains the state of
`arena/bab4bc10-vale` (Turn 16, `6a57a47`) in full**, merged in, plus two
extras. Nothing from Turn 16 was modified: every tracked file is byte-identical
to `6a57a47`, and `src/` diffs empty against it.

Why the merge: a session started on `arena/45e6b5a9-vale` believing `main` was
the tip (the clone was single-branch and could not see other branches). It
produced a first art pass on the **old one-corner film reading** of the brief
before discovering Turn 16 existed and had redefined the goal to an indie sim
**engine** with a tileable volume. See `docs/BRANCH_COMPARISON.md` for the full
audit and the visual comparison.

That superseded pass was **not** merged in. Only what is genuinely portable was
kept:

1. **`scripts/shoot.mjs` + `scripts/setup-headless.sh` + `docs/SCREENSHOTS.md`** —
   headless *film* stills. `tools/shot.mjs` already renders the 2D ink plate
   without a browser; this adds the missing final-composite check through the
   real WebGL2 look pipeline (grain, hatching, palette separation, posterize).
   They are complementary — see `docs/SCREENSHOTS.md`.
2. Three npm scripts: `serve`, `setup:browser`, `shots`.

`npm run verify` passes on this merged tree (check, build, boot, boot:bundle,
renderer, finite, determinism — including `looping every 20s, bit-exact`).

**Live site:** the two deploys from the superseded branch had overwritten
Turn 16's Pages deployment (the workflow deploys on any branch). This branch's
deploy now serves Turn 16's build again.

**Next session:** nothing changed about the work itself — the “known gaps” in
section 0 below still stand. Start there.

---

**Last reviewed:** 2026-10-28 (Turn 17), branch `arena/45e6b5a9-vale`
(which now carries the Turn 16 state described below).

---

## 0. Read this first (Turn 16)

The set is now a **grid of tiles**, not one module. `src/tiles.js` is the only
place that decides where a street is:

- a tile declares street halves on its four edges (`BITS { n1, e2, s4, w8 }`);
- a seam exists only when *both* tiles on it ask for a street, so the
  carriageway is always shared and always 7.2 m with 2.4 m pavements;
- a tile's lots are generated inside its interior box and `lot()` clamps them
  there, so **a building cannot be placed on a street**;
- `KINDS` is the vocabulary: `block` (solo block), `block_ew`, `block_ns`,
  `row`, `yard`, `intersection`, `park`;
- the world is 3×3 by default (5×5 / 7×7 / 9×9 available). The main street
  (seam z = +12.25) and its cross street (x = +15) are always built, so the
  film's corner is always an intersection.

Everything else hangs off that: `src/world.js` derives the stage (road, kerbs,
lanes, crosswalks, wait zones, crowd flows, street props) from the built world;
`src/cells.js` paints every tile, one depth-sorted item list per frame;
`src/sidebar.js` has the minimap editor plus the seed / copy-link / diagonal
controls and an Elevated train panel.

The whole scene is `?world=&size=&tiles=…&diag=` (see `scene.toUrl()`).

Known gaps for the next session: the train still rides on the north street
(it wants its own tiles), the cross street has no traffic yet, and the far
tiles lose their window count with distance rather than their sills.

---

## 1. What the user asked for

> “we are building the foundations for a cosy indie sim game engine. the key
> aspect is that everything is procedurally generated with procedural LoD. we
> are starting with trying to get a sample scene to use as a baseline and
> template. previous attempts failed at getting the sample scene right. think of
> the scene as a modular 3d volume (almost like a snow globe or a vignette that
> we can use to build tiles from.”

So: **engine foundation**, not a film. The sample scene is the *template*. Every
element must be procedural, must degrade through LoD, and must live inside one
modular volume that can be instanced into tiles.

Standing constraints carried from earlier sessions (do not break them):

- Hybrid 3D→2D. Pure 2D canvas/SVG was explicitly rejected.
- Everything code-generated; `index.html` self-contained, no external assets,
  silent autoplay, no website chrome during playback.
- Black / red / teal / white palette, rough carved lines, controlled grain.
- Rain and puddles are a real particle/puddle simulation — **no wet-glass
  overlay**.
- People: tiny architectural-sketch figures, walking (never sliding), varied
  directions, no overlaps.
- Build order inside the volume: cubic masses → street furniture → vehicles →
  people last.
- Hidden lab, node shader graph, user camera takeover all stay.

---

## 2. Where the work stands

The scene now reads as **one module of a city**: a glass case with no hardware
on its boundary, an east–west street with four blocks on the north frontage and
two low shop blocks on the south frontage, a half street at each x edge with a
pavement ring that turns the corners, a crossing with signals, trees, parked and
moving vehicles, an overhead train and a steering crowd. Neighbouring cells are
painted from the same rules with a **kind** (`street`, `block`, `yard`), so the
set tiles as a street grid.

Recent fixes that matter (all verified with stills):

- **Camera refit** against the full extents so the whole case is in frame
  (`.shots/v19-*.png` onwards).
- **People rewritten twice**: the earlier version drew heads at ~1 px and limb
  strokes below 1 px, which collapsed every figure into a wireframe X. The rule
  now is *all sizes derive from the projected body height* (`bodyPx`), with a
  single filled silhouette that includes a leg split, a small head disc, and an
  umbrella dome built from rim + mid ring + apex.
- **Umbrellas** are now a tilted dome sitting just above the head — not a flat
  saucer on a long stem. Fewer people carry one (~35 % average), which stops
  the crowd reading as a mushroom farm.
- **Trees** are a tapered trunk + 4–6 primary limbs with leaf clusters at the
  tips, drawn over a cast shadow. Three earlier attempts (bright thin strokes =
  white ferns; a single dark cloud = a floating blob) are documented as dead
  ends.
- **Facades** run the full window grid on the primary face and 55 % density on
  the side face, with mullions, sills and balcony rails; a uniform grid on both
  faces made the blocks look transparent.
- **Road** is darker than the pavement (`#101215` base vs `#232327` sidewalk),
  and the zebra bars are dulled and scuffed so they no longer compete with the
  umbrellas.
- **Vehicles** get a vertical gradient body fill, roof rim, wet sheen and brake
  glow — a flat fill had made them read as holes in the road.

Measured in this build: `npm run verify` passes, `npm run build` is 141.5 KiB,
luminance 46.8–60.3 % dark at 900×506, and the LoD contact sheet shows the three
tiers degrading as designed.

### Turn 14 — cells that tile by edge, a pavement you can walk round

The module did not actually tile: the side street was too narrow to read as one,
there was no pavement at the corners, and every neighbour was another
intersection. Three things changed.

1. **The side street is a real street.** `SIDE_STREET = { road: 3.0, walk: 2.4,
   x0: -12, x1: 12, blockX0: -9.6, blockX1: 9.6 }`. Two cells side by side make a
   6.0 m carriageway with 2.4 m pavements. The block is 19.2 m wide; the four
   north lots and the two south lots were re-laid to fit, and the south row now
   clears the crossing (x −5.2…−0.6) instead of sitting on it.
2. **The pavement is a ring with rounded corners.** `SIDEWALKS` has the two
   bands plus four corner returns; the returns are prisms built from
   `cornerOutline()` with a 1.5 m radius (`KERB_RADIUS`), so the kerb and the
   pavement edge are one curve. A zebra crosses each half street at the near
   band and the main road at each end of the block, which is how a pedestrian
   gets from the front band onto the return and round into the side street.
3. **Cells have a kind.** `drawCell(..., kind)` where kind is `street`
   (street both ways), `block` (no side street: rows merge with the neighbour,
   dashes run edge to edge) or `yard` (open lot: fence, containers, bay
   stripes). `defaultKindFor(dx, dz)` is the edge rule: E/W continue the street,
   N/S are block. `Scene.LAYOUTS` / `?layout=` sets a whole pattern at once
   (`auto`, `grid`, `row`, `block`, `yard`).

The crowd gained a `corner_e` flow with an explicit waypoint path
(`pathTable`/`alongPath`, arc-length, constant 1.15 m/s) so people actually walk
the corner; a stroll also clamps itself to its pavement band.

**Bugs fixed this turn:** the buffer grid's `E` button toggled SW (grid index vs.
bit index — the grid has a gap for the hero); parked cars were 2.6 m discs in the
crowd solver and reached across the pavement; the vending machine, bins, benches,
planters, a tree and the second lamp stood in the walking lane; cracks were
unclamped on the corner slabs; the side-street centre line sat on the inner kerb
instead of the cell boundary.

**Measured:** 0.0444 m mean step, 0.457 m worst visible step over the 20 s loop
at 50 ms (only bodies above alpha 0.12 are counted — a correction at alpha 0 does
not matter and chasing it distorts the solver).

**Still open:** a diagonal neighbour cannot be drawn correctly by this module —
a corner tile needs streets on two adjacent edges, and `cells.js` only knows how
to carry a street on the x edges. `layout=grid` hides this by making every
neighbour a street cell, but a real corner tile is the next piece of work.

### Turn 13 — a module with two frontages, and crowds that steer

The module is now an **intersection**, not a street with a backdrop:

- `world.js` has `SIDE_STREET` (half width 3.6 at each x edge → two cells meet in
  a 7.2 m north–south street), `NORTH_BLOCK` (−14…−9.6) and `SOUTH_BLOCK`
  (8.3…10.5). Pavements are clipped to the block between the half streets, the
  four lots sit on the north frontage at z −11.8, and `SOUTH_LOTS` puts two
  single-storey shop blocks on the near side with a gap on the centre line — the
  gap is what keeps the street and the crowd legible from the film's camera.
- The south row is drawn per lot (`drawSouthLot`: solid mass, glazing, lettered
  sign band, awning, blade sign) and returned as depth-sorted items
  (`southRowItems`) so it occludes the crowd instead of being pasted behind it.
  `drawBuildings` and `drawCellBlock` sort their lots far-to-near for the same
  reason: a block drawn after its neighbour printed its windows through it.
- `cells.js` paints the south row and the half streets, clips pavements/kerbs to
  the block, and the lane dashes now take the neighbour's own z offset.
- **Crowd steering.** `collision.relax()` is a damped, softly saturated solver
  (tanh cap, so a rotated push never jumps) with a `lateral` bias that turns a
  backwards shove into a sideways slide; bodies are weighted by opacity instead
  of being switched in and out; each pass is single-group (people vs furniture,
  then people vs people). Pedestrians carry a lane along their flow, the furniture
  is an explicit obstacle list (`STREET_PROPS`), scatter avoids the furniture, and
  the walk-in is 1.6–4.6 m at walking pace. Measured: 0.045 m mean step at 20 fps
  (≈0.9 m/s), worst step 0.8 m, no teleports.

### Turn 12 — glass planes, wide street, tileable cells, palettes

Four things changed under the film, and one of them is structural:

1. **The case is glass.** `environment.collectFrame()` returns four panes and a
   lid (soft gradient + one diagonal sheen) and nothing else — no posts, no
   rails, no cut caps, no plinth, no label. `TILE.post` and `TILE.rail` are gone.
   Rationale: any hardware on the boundary belongs to one cell and would break
   the moment two cells are side by side, which is what tiling is for.
2. **The street is 11.8 m wide.** `ROAD_EDGE` in `tile.js` is the only place the
   road edges are written down; `groundYAt`, the sidewalks, the crossing, the
   signals, the parking bays, the wait zones and the pedestrian flows all derive
   from it. Lanes at z ±2.6, parking at ±4.85, crossing 4.6 m.
3. **Cells tile.** `src/cells.js` paints a complete cell — ground, road, kerbs,
   paving joints, world-periodic lane markings, zebra, elevated line, four
   jittered lots with window grids, lamps, trees — from the same rules as the
   hero, offset by whole cells. `bufferStyle` = `developed | wireframe | points`;
   developed cells are solid (a faded cell leaves a tone step at the seam) and
   their detail is chosen by distance, which is where LoD will hook in. The
   train is clipped to the projected window of its own cell.
4. **Palettes.** `src/palette.js` grades every colour handed to the Painter:
   paper→ink ramp, per-palette gamma and contrast, accents preserved, glows
   scaled down for light palettes. Möbius (authored), Patent sketch, Ink, B/W,
   Custom (four colour wells, persisted). The static-set cache keys on the
   palette version.

Keybinds: `Tab` panel, `\` stats, `H` hide all UI, `C` camera. The drone opens
on `v3(10.2, 21.0, 34.0) → v3(-1, 1.8, -2.8)` (fov 39), which is the framing the
two-sided module was composed for: high enough to see the crowd over the near
shop row. `tools/shot.mjs` with no `--eye` renders the *cinematic* rig, not this
pose, so pass the eye/target explicitly when judging the film's default frame.

### Turn 11 — frame budget, GPU-side look graph, walls, 3×3 buffer

Perf was still the complaint, so this turn went after the two structural costs
rather than more micro-tuning:

1. **The look graph is compiled, not branched.** `ShaderGraph.isLive()` decides
   whether a node contributes at all; `compile()` skips the function, the
   uniforms and the call for dead nodes, and the renderer rebuilds the program
   when `graph.activity()` changes. Switching the hatch to 0 now removes its
   texture reads from the fragment shader instead of multiplying by 0.
2. **No per-frame texture reallocation.** `texImage2D` per frame was replaced
   with one allocation per size plus `texSubImage2D`, and
   `preserveDrawingBuffer` is opt-in (`?capture=1`). That flag alone costs a
   frame copy in every browser.

Three more structural wins landed after the first numbers: the set is painted
into a cached layer and re-blitted (repainting on ~13 % of frames or when the
line boil ticks), empty layers are not blitted at all, and emitter glows blit a
cached sprite instead of building a gradient per call. Measured in Node
(`@napi-rs/canvas`, 1440×810, real-time pacing, 120 frames) — these rank costs,
they do not predict browser timings:

| Case | ms/frame |
| --- | --- |
| everything on | 31.3 (was 54.7 at the start of the turn) |
| crowd off | 21.5 |
| rain + puddles off | 21.9 |
| vehicles off | 26.1 |
| signals off | 28.7 |
| walls closed | 30.3 |
| reflections off | 30.9 |
| render scale 0.75 | 26.7 |
| render scale 0.5 | 17.7 |

The lesson: the plate is painted on the CPU, so **pixels are the budget**. Every
subsystem is now a switch, and the governor trades resolution instead of frames.

Also this turn: `walls` is a bitmask (back / left, default open), the eight
buffer cells render as wireframe or point cloud with per-cell toggles, the
drone is the default camera, and `\` hides the whole UI.

**Trap that cost a deploy:** `initGL()` must compile the program *before* the
quad. `getAttribLocation(undefined, 'a_pos')` throws on a real context, which
killed the constructor and left a black canvas — and the headless harness never
saw it, because without WebGL it takes the 2D fallback. `tools/renderer-smoke.mjs`
now covers the GL path with a strict stand-in (wrong-kind arguments throw), and
`npm run verify` includes it. When something on screen goes blank, check
`?renderer=2d` and the on-screen error strip first.

**Next architectural step (not done):** move the set and the actors off
Canvas2D — batched WebGL2 instancing first (quads for strokes, one draw call per
line weight), WebGPU behind a capability check once the geometry contract is
stable. The Painter API (`projectPoly`, `line3`, `box`, `ellipse`, `rect`) is the
migration seam: it is already the only surface the scene draws through.

### Turn 10 — perfect loop, performance, cleaner case

1. **The loop is now a hard invariant.** `src/loop.js` forbids integrating
   state over `dt`; rain, crowd idle sway, vehicles and the shader grain are all
   pure functions of loop time with integer-cycle periods. `npm run determinism`
   (in `verify` and CI) fails the build if t and t+20 differ by a single pixel.
   If you add animation, use `loopFrac` / `loopNoise` / `loopPeriod` — never
   `Math.random` and never an accumulator.
2. **Loop instead of fade.** Walkers enter from the tile edge and leave at the
   far edge; cars pull up to the stop line, wait, then drive through and wrap
   off-screen. `params.loopBuffer` is the fade band. Nothing dissolves mid-shot.
3. **Performance.** The set is cached (`Scene._ensureStatic`) and blitted with a
   sub-pixel offset; the plate follows the viewport and `?scale=` shrinks the
   shader. 1440×810 went from 54.7 ms to 21.9 ms in the Node benchmark.
4. **`S` key.** A bare `S` used to save a PNG frame from anywhere (so walking
   backwards stuttered). It is now `Ctrl/Cmd+S`, lab-only.
5. **Case** is off by default, cleaner when on (no bolts/ticks, thinner posts,
   one rail weight), and the sidebar sections collapse.

### Turn 9 — cameras, case sorting, sidebar

The user is **encouraged** by the plate and asked for three things, all landed:

1. **Game-style navigation.** `src/camera-modes.js` holds one class per mode
   (`cinematic`, `fps`, `third`, `drone`) behind a `CameraMode` base;
   `src/camera-director.js` owns input, mode switching and the HUD. `C` cycles,
   `1`–`4` jump, `V` returns to the rig, `[` / `]` step the steady shots. The
   old right-drag pan is gone and `src/camera-control.js` is deleted — do not
   bring it back. Adding a mode = one class + one entry in `MODES`.
2. **Depth-sorted case + visibility toggle.** `environment.collectFrame()`
   returns depth-tagged drawables; the shell goes down before the set, the near
   posts and rails join the scene's sorted list. `params.caseFrame = 0` hides
   the case; the sidebar exposes it as “show boundaries”.
3. **Hidden sidebar.** `src/sidebar.js`, opened by `Tab`, the ☰ handle,
   `?ui=1` or `?panel=1`. Rows keep a `sync()` so external changes flow back;
   the master fader now scales *relative to the active preset* (`texBase`) and
   the smudge has its own on/off toggle.

The lens-dirt complaint was addressed at the **preset** level: `PRESETS.linocut`
now ships hatch 0.11, contour 0.24, fiber 0.026, vignette 0.11. Editing node
defaults in `shaders.js` does nothing at runtime because `applyPreset` runs at
boot — change the preset too, always.

Open items: the front-left quadrant is still sparse, people are schematic in
close-up, and the WebGL finish cannot be judged in this sandbox.

---

## 2b. The blank-page bug (fixed 2026-10-27)

The deployed page was blank because **the build corrupted the inline script**.
`build.mjs` injected the bundle with `template.replace('/*__SCRIPT__*/', js)`,
and `String.replace` expands `$&`, `` $` ``, `$'` and `$$` inside a *string*
replacement. The minified bundle contains `$&&` (esbuild names variables `$`),
so the marker was re-inserted into the middle of the code and the whole script
failed to parse — a black canvas, no console output the user could see.

Fixes in place:

- `build.mjs` uses function replacers (`() => js`), refuses to write a file
  that still contains a template marker, and parses the emitted bundle with
  `new Function(js)` so a syntax error fails the build.
- `src/main.js` published `window.VALE = { …, lab, … }` *before* `const lab`
  was initialised — a temporal-dead-zone ReferenceError that also blanked the
  page. Handles are now published after construction.
- `tools/boot-smoke.mjs` (`npm run boot`) executes the built bundle in Node with
  a DOM shim, drives six real frames, and fails on any startup error. CI runs it.
- `npm run verify` = check + build + boot.

Lesson: a build that "succeeds" can still ship a syntactically invalid page.
The boot test is the guard.

## 2c. The NaN bug (fixed later the same day)

After the build was fixed the page still threw on frame 1:
`createRadialGradient … non-finite`. A blade-sign call passed one extra leading
argument, so the box depth became the string `"teal"`, the projection produced
`NaN`, and the glow gradient threw. Headless canvas coerces `NaN` to `0`, so
stills and boot tests all looked healthy.

Guards now in place:

- `tools/finite.mjs` (`npm run finite`) wraps every Canvas2D entry point and
  fails on non-finite coordinates or negative radii across the loop at three
  viewport sizes.
- `main.js` catches per-frame errors, logs once, and keeps the loop alive.
- Glow/gradient helpers refuse non-finite geometry instead of forwarding it.
- CI runs `npm run verify`-equivalent steps: check, build, boot, finite.

**Rule for future work:** `@napi-rs/canvas` is more forgiving than a browser.
Any numeric bug that reaches the canvas must be caught by the finite check, not
by the stills.

## 3. Do not repeat these

- **No browser in the sandbox.** `apt` cannot reach the Debian mirror, the
  Playwright CDN times out, `npm i gl` fails in node-gyp, and `puppeteer`'s
  Chrome download is blocked. Do not burn a turn retrying them; use
  `tools/shot.mjs` (napi-canvas stills) and `tools/boot-smoke.mjs` (real startup
  path). `tools/browse.mjs` is kept for environments that do have Chrome.
- **Flat-rim umbrella discs** and long stems: they read as flying saucers /
  lollipops. The rim + mid + apex dome with a tilted rim plane is the only
  version that worked.
- **Sub-pixel detail.** Anything smaller than ~1 px vanishes or turns to noise.
  Budget facade props, crowd accessories and leaf ticks by screen scale.
- **Trees as thin bright strokes** read as white ferns; **trees as one big
  dark blob** read as a floating cloud. Tapered limbs *plus* leaf clusters at
  the tips is the working recipe.
- **Uniform window grids on every face** make a block look transparent.
- **Heavy posterize + vignette** once dropped the film to 94 % dark. Keep the
  current presets.
- **Vertical mirror polys** for road reflections cover the road. Use
  kerb-anchored floor wedges only.

---

## 4. Verify

```bash
npm run check
node tools/shot.mjs --t 3,9,15,19 --prefix vX   # → .shots/vX-*.png
npm run build                                   # → index.html (self-contained)
npm run docs                                    # → docs/BUILD.md, DEPLOY_STATUS.md
```

Stills use the raw plate. To inspect a region at 2×:

```bash
node -e "const {createCanvas,loadImage}=require('@napi-rs/canvas');(async()=>{
  const i=await loadImage('.shots/vX-9.png');const c=createCanvas(1120,460);
  c.getContext('2d').drawImage(i,230,430,560,230,0,0,1120,460);
  require('fs').writeFileSync('.shots/crop.png',c.toBuffer('image/png'))})()"
```

LoD sheet: `node tools/lod.mjs [time] [width]` → `.shots/lod.png`.
Luminance sweep: `node tools/smoke.mjs` (guard rail against an all-dark film).
Determinism: `node tools/determinism.mjs` (must stay bit-exact; it is in `verify`).

---

## 5. Next concrete steps

1. Give the front-left quadrant real content (bus shelter, bike rack, café
   tables), then re-shoot `npm run stills`.
2. Second crowd pass for close-ups: coat silhouettes that are less conical and
   umbrellas that sit on the head.
3. `tools/tiles.mjs`: render two tiles along x to prove the seam.
4. Only then touch the finish passes again — and always in `PRESETS.linocut`.

Still open from the same list: vehicle glazing at L0, and a CI screenshot job
(GitHub Actions has a browser) so the WebGL finish can finally be validated.

---

## 6. File map

| File | Responsibility |
| --- | --- |
| `src/tile.js` | tile volume, colours, `LOD_LEVELS`, `makeDetail`, `groundYAt` |
| `src/world.js` | one module's data: road, half streets, both blocks, lots (N + S), props, flows, puddles |
| `src/environment.js` | all staged street/building/furniture/frame drawing |
| `src/crowd.js` | procedural people: archetypes, lanes, steering, LoD thinning, umbrellas |
| `src/traffic.js` | vehicles (extruded profiles) + overhead train |
| `src/weather.js` | raindrops, ripples, puddles |
| `src/scene.js` | orchestration, params, depth sorting, cached set, `render(t, dt)` |
| `src/loop.js` | loop primitives: quantised periods, seamless noise, boundary alpha |
| `src/camera.js` | `CameraRig`: fitted keyframes, roll, fov (cinematic mode) |
| `src/camera-modes.js` | modular controllers + `SHOTS` |
| `src/camera-director.js` | mode switching, input, HUD |
| `src/draw.js` | `Painter`: jittered polylines, polys, gradients, hatching |
| `src/shaders.js` / `src/graph.js` | print finish presets and node graph |
| `src/renderer.js` | WebGL2 fullscreen pass, `bypass` for raw plate |
| `src/lab.js` | hidden lab UI |
| `src/cells.js` | one complete neighbour cell: ground, half streets, both rows, props, rail |
| `src/palette.js` | colour palettes + the grade every mark passes through |
| `src/sidebar.js` | hidden scene-control sidebar (Tab) |
| `src/style.css` | film screen, lab, camera HUD, `.sb-*` sidebar |
| `tools/shot.mjs` | stills renderer (`--t`, `--eye`, `--target`, `--fov`) |
| `tools/lod.mjs` | three-tier LoD contact sheet |
| `tools/smoke.mjs` | luminance sweep at three viewport sizes |
| `tools/canvas-env.mjs` | DOM/canvas shim so `src/` can run under Node |

---

## 7. Deploy

`npm run build && npm run docs`, commit, push. `.github/workflows/deploy-pages.yml`
now triggers on **every branch** (`'**'`) and runs `npm run check` before the
build, so any branch is a previewable build of the sample scene; the newest push
wins the single Pages site: https://bashmaester.github.io/vale/
