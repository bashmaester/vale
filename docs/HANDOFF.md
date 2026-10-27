# VALE — session handoff

**Purpose:** resume this project immediately if the conversation is interrupted.
Read this first, then `ARCHITECTURE.md` and `CHANGELOG.md`. Fresh commit/build
metadata is always in `BUILD.md` and `DEPLOY_STATUS.md` (generated on deploy).

**Last reviewed:** 2026-10-27, after the “tiny people / slower motion / street set”
retrace turn.

---

## 1. The core direction (do not lose this)

The user explicitly rejected the earlier recommendation to abandon 3D for a pure
2D illustration. The chosen direction is:

> **A 3D representation rendered as a 2D print.** Not a textured 3D render, not
> a flat sprite animation. The world must be structurally believable when the
> camera moves, but the output stays a high-contrast black / red / teal / white
> linocut-style film.

The user’s corrections that still drive the work:

- “a 3D-2D approach is much more interesting”
- “focus on style, aesthetics and execution (via shaders, TSL, etc.)”
- “mini modular (node-based) system where we can experiment with looks and parametric creations”
- “we are not building a simulation but a representation that embodies the structure and feeling of the scene”
- “people should not overlap but scatter meaningfully”
- “vehicles can be a bit more than boxes and have wheels and silhouettes”
- “humans should walk rather than slide … render procedural 3D figures as 2D outlines so when seen from different angles the scene is believable”
- “the world also has to make sense … cars not park on cross walk, objects not passing through each other”
- “details a bit more expressed, hatching too uniform”
- **Latest:** “tiny people” architectural-sketch quality first; everything was
  animated too fast; rebuild the set with a proper sidewalk street; signs should
  be 3D and not always face the camera; the wet procedural noise overlay was too
  strong; rain and puddles look good; people must cross in more directions than
  diagonals only; cars need real left/right lanes.

Aesthetic target: the supplied rainy Tokyo scramble-crossing references —
minimal architectural-sketch people with umbrellas, essential-line vehicles,
overhead train, heavy rain, gouged reflections, visible print grain, sparse red
and teal accents. The scene should feel like a hand-printed moving plate, not a
game engine demo.

---

## 2. Current state

### Working

- One self-contained `index.html`: silent, autoplaying 20s loop, no external
  assets, no audio, no visible UI during normal playback.
- Source is modular ES modules under `src/`, bundled/inlined by `build.mjs`.
- Real 3D world coordinates (`x` right, `y` up, `z` toward viewer), perspective
  `Camera`, keyframed `CameraRig`, and optional user camera takeover.
- **Tiny people**: `src/crowd.js` now draws small architectural-sketch bodies —
  head dots, solid coats, short filled pants, arms, ground shadows, varied
  umbrella canopies, hats, scarves, bags, dogs, strollers and children. They are
  still projected 3D world points, not screen-space sprites. The stride is
  distance-driven and hand-varied.
- **Eight crossing routes**: four straight crossings and four diagonal scrambles
  in `src/world.js`. Waiting zones sit on four real sidewalk blocks.
- **Slower motion**: `src/timeline.js` keeps a 20s signal cycle but adds
  `motionScale = 0.62` and `motionT`. Rain boil, grain, line flicker, idle sway,
  gait cadence and shader `uTime` all consume the calmer clock. The crossing
  window is longer (roughly `u = 0.22–0.68`).
- **Proper street set**: `src/environment.js` draws two crossing roads, raised
  sidewalks with slab joints and curbs, four straight zebra crossings, faint
  diagonal scramble guides, stop lines, lane dividers, direction arrows, manhole
  covers, puddles, low buildings with awnings, lamps, benches, wires, track and
  signals.
- **Oriented 3D signs**: `Painter.sign3D()` in `src/draw.js` projects a
  world-space quad with a fixed normal. Signs foreshorten and turn away from the
  camera; they no longer billboard.
- **Legal traffic lanes**: `LANES` in `src/world.js` defines three west→east
  lanes on the north half and three east→west lanes on the south half. All six
  vehicles in `src/traffic.js` inherit direction from their lane. Parked hulls
  are sanitized with `isParkable()` / `sanitizePark()` so they never sit on a
  crosswalk or sidewalk.
- **Quieter wet processing**: the noisy wet reflection overlay was drastically
  reduced in `src/weather.js`, `src/scene.js`, `src/shaders.js` and
  `src/traffic.js`. Rain streaks, splashes and puddle outlines remain; the plate
  composite now uses a low-alpha glaze. Default `wetness`, `reflectionStrength`
  and `footstepStrength` are lower.
- **Separation**: `src/collision.js` provides grid-accelerated 2D separation and
  Poisson-disk blue-noise sampling. Crowds scatter with meaningful spacing;
  vehicles separate from each other; crowds are pushed away from active vehicle
  hulls. Traffic is delayed until the crowd has cleared.
- **Camera takeover**: drag to orbit, right-drag to pan, wheel to zoom,
  WASD/QE to fly, Shift to boost, `C` release, `F` fly/orbit, `V`/`0` reset.
  `?cam=orbit`, `?cam=fly`, `?hud=0` are supported. A minimal HUD appears only
  while the user controls the camera.
- **Node-based look graph**: 8 GLSL nodes compiled into one WebGL2 fragment
  shader by `ShaderGraph`. `detail` and `hatch` remain expressive and
  non-uniform; all time-based noise now uses the slower clock.
- **Hidden lab** (`?lab=1`): draggable node graph, live node uniforms, scene
  parameters, camera tab, timeline scrubber, presets, PNG export, JSON/local
  save/load.
- **CI / Pages**: `.github/workflows/deploy-pages.yml` builds, validates
  self-containment, regenerates deploy docs, and deploys `index.html` + `docs/`
  to GitHub Pages on pushes to this branch (and `main`). `npm run docs`
  generates `BUILD.md`, `DEPLOY_STATUS.md`, `manifest.json`, `docs/index.html`.

### Still rough / needs eyes

- **No browser screenshot was possible in this sandbox.** The build is clean and
  a DOM-level smoke test exercised all timeline phases, the lab, presets and
  camera modes without runtime errors — but visual tuning is still unverified.
  First resumed action should be: open the live preview, check WAIT / CROSS /
  EMPTY / TRAFFIC frames, then open `?lab=1` and fly around.
- The tiny-people silhouettes are intentionally sparse. If they read too much
  like stick figures, increase coat/leg fill opacity or reduce umbrella rim
  detail further; the user explicitly said even less detail is fine if motion
  and feeling are right.
- Crowd density is now ~200 projected figures (158 crossers + 42 waiters).
  Check performance at 1440×810; `?w=1280&h=720` or `crowdDensity` are the
  quick mitigations.
- Occlusion is approximate: people are depth-sorted by foot position, but there
  is no true z-buffer for the 2D plate. From extreme low angles some overlaps
  may need extra ordering work.
- Wet reflections are now subtle by design. If the empty street feels too dry,
  raise `wetness` / `reflectionStrength` in the lab rather than restoring the
  old random overlay.
- The camera HUD is intentionally tiny and auto-hides. If the user wants zero UI
  even during camera control, use `?hud=0` or remove `#camHud`.

---

## 3. Important invariants

1. `index.html` must remain **fully self-contained**. The CI grep fails the build
   on `<script src>`, `<link href>`, or `http(s)://` strings.
2. The film must remain **silent** and **UI-free by default**. The lab and camera
   HUD are optional/authoring surfaces only.
3. All artwork is drawn in code. No images, fonts, videos, or network assets.
4. The 20-second signal cycle is the single source of truth (`timeline.js`).
   Waiting → signal → crossing → drainage → empty street → traffic → loop.
   `motionT` is a secondary clock; it must not change the 20s duration.
5. Crosswalk/sidewalk/lane/parking rules live in `world.js`. Do not hardcode
   parked car positions in `traffic.js` without `sanitizePark()`.
6. People are projected 3D world points. Do not regress to screen-space
   billboards; do not reintroduce detailed rigged skeletons.
7. Signs are `sign3D()` oriented quads. Do not replace them with camera-facing
   `sign()` billboards.
8. The look graph compiles to one shader; adding a node means updating
   `NODE_DEFS`, inputs, `ui` positions, and all `PRESETS`.

---

## 4. How to run / deploy

```bash
npm install
npm run build          # regenerate self-contained index.html
npm run docs           # regenerate deploy metadata + docs/index.html
npm run dev            # build + serve on :8000
```

Open:

- `index.html` — clean film
- `index.html?lab=1` — node/scene/camera lab
- `index.html?lab=1&paused=1&t=7` — paused inspection frame
- `index.html?cam=fly` — start in fly camera
- `index.html?preset=riso` — alternate print look
- `index.html?w=1920&h=1080` — higher internal resolution

Deployment is automatic on `git push origin arena/082e9ffd-vale`. The workflow
uploads `_site/` (film + `docs/`) through `actions/deploy-pages`.

Live site for this repository: **https://bashmaester.github.io/vale/**

- film: `https://bashmaester.github.io/vale/`
- lab: `https://bashmaester.github.io/vale/?lab=1`
- docs index: `https://bashmaester.github.io/vale/docs/index.html`
- handoff: `https://bashmaester.github.io/vale/docs/HANDOFF.md`

Successful Pages workflow runs on this branch so far: `40521585370`,
`40521959240`. The retrace turn deploys through the same workflow; check
`DEPLOY_STATUS.md` for the latest run.

---

## 5. File map (quick)

```
index.html                  generated deliverable
build.mjs                   inlines CSS+JS into index.html
scripts/update-docs.mjs     deploy docs generator
.github/workflows/...       Pages CI
src/world.js                sidewalks, crosswalks, 8 flows, lanes, parkable()
src/collision.js            separation + poissonDisk
src/camera-control.js       user orbit/fly camera
src/crowd.js                tiny 3D people + walk cycle + footprints
src/traffic.js              lane-correct vehicles + train + reflections
src/environment.js          street set, sidewalks, buildings, oriented signs
src/weather.js              rain, quiet reflections, field data texture
src/scene.js                orchestration, plates, camera apply, motion clock
src/shaders.js              GLSL node defs + presets (slower time)
src/graph.js                shader graph compiler
src/lab.js                  optional patch bay
src/main.js                 wiring + query params + loop
src/draw.js                 painter primitives incl. sign3D()
```

---

## 6. Suggested next steps

1. Visually verify in a browser; capture 4–6 representative frames.
2. Confirm the straight crossings read clearly and do not collide with parked
   cars; tune `FLOWS` weights if diagonals still dominate.
3. Check that signs visibly turn away when flying around; adjust `yaw` values if
   too many face away from the default camera.
4. Tune tiny-people line weights / umbrella size / crowd density at the new
   scale. The user said less detail is acceptable if motion quality is right.
5. If the wet street feels too flat, raise `reflectionStrength` slightly rather
   than reintroducing broad procedural noise.
6. Optional: add a TSL/WebGPU adapter behind `ShaderGraph` if the user wants to
   move toward Three.js node materials; the current GLSL graph is the seam.
7. Optional: record a 20s WebM/MP4 export from the canvas for review, while
   keeping the HTML file itself asset-free.

If the session dies mid-change: check `git status`, rebuild with `npm run build`,
open `?lab=1`, and continue from the first “Still rough” item above.
