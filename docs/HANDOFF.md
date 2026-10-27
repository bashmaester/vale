# VALE — session handoff

**Purpose:** resume this project immediately if the conversation is interrupted.
Read this first, then `ARCHITECTURE.md` and `CHANGELOG.md`. Fresh commit/build
metadata is always in `BUILD.md` and `DEPLOY_STATUS.md` (generated on deploy).

**Last reviewed:** 2026-10-27, after the “camera / 3D figures / world rules / CI” turn.

---

## 1. The core direction (do not lose this)

The user explicitly rejected the earlier recommendation to abandon 3D for a pure
2D illustration. The chosen direction is:

> **A 3D representation rendered as a 2D print.** Not a textured 3D render, not
> a flat sprite animation. The world must be structurally believable when the
> camera moves, but the output stays a high-contrast black / red / teal / white
> linocut-style film.

The user’s words that matter most:

- “a 3D-2D approach is much more interesting”
- “focus on style, aesthetics and execution (via shaders, TSL, etc.)”
- “mini modular (node-based) system where we can experiment with looks and parametric creations”
- “we are not building a simulation but a representation that embodies the structure and feeling of the scene”
- “people should not overlap but scatter meaningfully”
- “vehicles can be a bit more than boxes and have wheels and silhouettes”
- “humans should walk rather than slide … render procedural 3D figures as 2D outlines so when seen from different angles the scene is believable”
- “the world also has to make sense … cars not park on cross walk, objects not passing through each other”
- “details a bit more expressed, hatching too uniform”

Aesthetic target: the supplied rainy Tokyo scramble-crossing reference —
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
- **Procedural 3D humanoids**: every joint, coat quad, umbrella dome rim, rib,
  handle and drip is a world-space point projected to 2D outlines. Walking is a
  distance-driven leg/arm stride, not a sliding billboard. Camera movement now
  changes figure silhouettes.
- **Vehicles are no longer plain boxes**: wheels, hubs, wheel arches, separate
  cabins, sloped windshields, truck cab/cargo split, bus destination sign, taxi
  roof light, bumpers, head/tail lamps, window grids.
- **World rules**: `src/world.js` defines sidewalks, crosswalks, waiting zones,
  diagonal flows and legal parking. Parked vehicles are sanitized through
  `isParkable()` / `sanitizePark()` so they never sit on a crosswalk or sidewalk.
- **Separation**: `src/collision.js` provides grid-accelerated 2D separation and
  Poisson-disk blue-noise sampling. Crowds scatter with meaningful spacing;
  vehicles separate from each other; crowds are pushed away from active vehicle
  hulls. Traffic is delayed until the crowd has cleared.
- **Camera takeover**: drag to orbit, right-drag to pan, wheel to zoom,
  WASD/QE to fly, Shift to boost, `C` release, `F` fly/orbit, `V`/`0` reset.
  `?cam=orbit`, `?cam=fly`, `?hud=0` are supported. A minimal HUD appears only
  while the user controls the camera.
- **Node-based look graph**: 8 GLSL nodes compiled into one WebGL2 fragment
  shader by `ShaderGraph`. Added `detail` (edge contour / micro scratches) and
  rewrote `hatch` to be noisy, broken, warped, jittered and cross-hatched rather
  than uniform.
- **Hidden lab** (`?lab=1`): draggable node graph, live node uniforms, scene
  parameters, camera tab, timeline scrubber, presets, PNG export, JSON/local
  save/load.
- **CI / Pages**: `.github/workflows/deploy-pages.yml` builds, validates
  self-containment, regenerates deploy docs, and deploys `index.html` + `docs/`
  to GitHub Pages on pushes to this branch (and `main`). `npm run docs`
  generates `BUILD.md`, `DEPLOY_STATUS.md`, `manifest.json`, `docs/index.html`.

### Still rough / needs eyes

- **No browser screenshot was possible in this sandbox.** The build is clean,
  the GLSL was manually checked, and a DOM-level smoke test exercised all
  timeline phases, the lab, presets and camera modes without runtime errors —
  but visual tuning is still unverified. First resumed action should be: open
  the live preview, check WAIT / CROSS / EMPTY / TRAFFIC frames, then open
  `?lab=1` and fly around.
- Crowd density and line weight may need tuning after seeing the new 3D figures.
  `crowdDensity`, `walkSpeed`, `flySpeed`, `cameraEase` and all look nodes are
  live in the lab.
- Vehicle silhouettes are more expressive but still intentionally minimal; the
  user asked for “a bit more than boxes”, not detailed models.
- Occlusion is approximate: bones/coat/umbrella are depth-sorted per draw, but
  there is no true z-buffer for the 2D plate. From extreme low angles some
  overlaps may need extra ordering work.
- Hatching/detail nodes can be too strong in dark areas; use the lab to dial
  `hatch.strength`, `hatch.breakup`, `detail.contour`, `paper.grain`.
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
5. Crosswalk/sidewalk/parking rules live in `world.js`. Do not hardcode parked
   car positions in `traffic.js` without `sanitizePark()`.
6. Humanoids are 3D skeletons. Do not regress to screen-space billboards.
7. The look graph compiles to one shader; adding a node means updating
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

The first successful Pages workflow for this turn was run `40521585370`.

---

## 5. File map (quick)

```
index.html                  generated deliverable
build.mjs                   inlines CSS+JS into index.html
scripts/update-docs.mjs     deploy docs generator
.github/workflows/...       Pages CI
src/world.js                sidewalks, crosswalks, flows, parkable()
src/collision.js            separation + poissonDisk
src/camera-control.js       user orbit/fly camera
src/crowd.js                3D humanoids + walk cycle + footprints
src/traffic.js              detailed vehicles + train + reflections
src/environment.js          road, zebra, sidewalks, buildings, signs, wires
src/weather.js              rain, reflections, field data texture
src/scene.js                orchestration, plates, camera apply
src/shaders.js              GLSL node defs + presets
src/graph.js                shader graph compiler
src/lab.js                  optional patch bay
src/main.js                 wiring + query params + loop
```

---

## 6. Suggested next steps

1. Visually verify in a browser; capture 4–6 representative frames.
2. Tune figure line weights / umbrella size / crowd density at the new 3D scale.
3. Add a few more foreground umbrellas and building details if it still reads
   “too minimal” — the user liked the vibe but wants more expressed detail.
4. Consider a lightweight occlusion pass for extreme camera angles.
5. Optional: add a TSL/WebGPU adapter behind `ShaderGraph` if the user wants to
   move toward Three.js node materials; the current GLSL graph is the seam.
6. Optional: record a 20s WebM/MP4 export from the canvas for review, while
   keeping the HTML file itself asset-free.

If the session dies mid-change: check `git status`, rebuild with `npm run build`,
open `?lab=1`, and continue from the first “Still rough” item above.
