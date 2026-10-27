# VALE — session handoff

**Purpose:** resume this project immediately if the conversation is interrupted.
Read this first, then `ARCHITECTURE.md` and `CHANGELOG.md`. Fresh commit/build
metadata is always in `BUILD.md` and `DEPLOY_STATUS.md` (generated on deploy).

**Last reviewed:** 2026-10-27, after the “build out the corner / raindrop and
puddle sim” turn.

---

## 1. The core direction (do not lose this)

The user explicitly rejected the earlier recommendation to abandon 3D for a pure
2D illustration. The chosen direction is:

> **A 3D representation rendered as a 2D print.** Not a textured 3D render, not
> a flat sprite animation. The world must be structurally believable when the
> camera moves, but the output stays a high-contrast black / red / teal / white
> linocut-style film.

Active corrections from the user:

- “a 3D-2D approach is much more interesting”
- “focus on style, aesthetics and execution (via shaders, TSL, etc.)”
- “mini modular (node-based) system where we can experiment with looks and parametric creations”
- “we are not building a simulation but a representation that embodies the structure and feeling of the scene”
- “people should not overlap but scatter meaningfully”
- “vehicles can be a bit more than boxes and have wheels and silhouettes”
- “humans should walk rather than slide”
- “the world also has to make sense … cars not park on cross walk, objects not passing through each other”
- “details a bit more expressed, hatching too uniform”
- **Latest:** “this is better but all the elements need a lot more work. let’s focus on the set this time. just build out the corner. start with street and sidewalk. traffic lights only where they belong. add a few buildings. add a few cars where they belong. you are building a cubic volume scene / set. block out the big elements first then proceed smaller and add the people at the end. people look a lot better but could use more variety. REMOVE the procedural wet glass fake overlay. bring back the raindrop and puddle sim.”

Aesthetic target: rainy Tokyo architectural sketch — tiny people with umbrellas
and long shadows, essential-line vehicles, overhead train, heavy rain, puddles,
visible print grain, sparse red and teal accents. The scene should feel like a
hand-printed moving plate, not a game engine demo.

---

## 2. Current state

### Working

- One self-contained `index.html`: silent, autoplaying 20s loop, no external
  assets, no audio, no visible UI during normal playback.
- Source is modular ES modules under `src/`, bundled/inlined by `build.mjs`.
- **One built-out corner.** `src/world.js` defines two crossing road strips,
  four raised sidewalk boxes, and a detailed northeast corner. The other three
  corners are simple receiving slabs.
- **Staged cubic set construction** in `src/environment.js`: `drawBlockout()`
  (roads + sidewalk volumes), `drawRoadMarkings()`, `drawBuildings()`,
  `drawTrafficLights()`, `drawStreetFurniture()`, `drawWires()`, `drawTrack()`.
- **Traffic lights only where they belong.** `SIGNAL_POSITIONS` has exactly four
  poles at the four intersection corners. Each has a vehicle head and a smaller
  pedestrian head drawn as oriented 3D quads.
- **A few buildings.** Four cubic volumes on the northeast corner with visible
  faces, window grids, awnings, roof parapets, rooftop boxes, accent stripes and
  oriented `sign3D()` signs.
- **A few cars.** Three legally parked cars at curbs and two moving cars in
  separated lanes (five total), plus a five-car overhead train. Vehicles are
  axis-aware so the vertical-road parked car is oriented correctly.
- **More varied tiny people.** `src/crowd.js` has six archetypes, five coat
  silhouettes, five head treatments, eight umbrella styles, long directional
  shadows, many accessories, occasional companions, and per-person gait/stride.
  About 92 crossers + 30 waiters.
- **Raindrop / puddle simulation.** `src/weather.js` keeps 220 persistent
  raindrop particles and 8 puddle sites. Drops fall in 3D, spawn expanding
  ripple rings and splash spikes, and are projected as short streaks. Puddles
  and ripples are drawn into the ink plate.
- **No wet-glass overlay.** The `wet` canvas, additive reflection strokes,
  footprint erasures, shader rain noise and broad wetness gradient are gone.
  The shader `rain` node is a disabled pass-through. `field.r` is now only a
  puddle mask.
- **Slower secondary motion.** `timeline.motionT = 0.62 × t` still drives rain,
  grain, line flicker, idle sway, gait cadence and shader time. The signal cycle
  remains exactly 20 seconds.
- **Camera / lab / CI** unchanged in capability: keyframed three-quarter camera,
  user orbit/fly takeover, hidden `?lab=1` patch bay, Pages deployment.

### Still rough / needs eyes

- **No browser screenshot was possible in this sandbox.** Build, self-contained
  validation, GLSL source checks and a DOM smoke test passed across all phases,
  presets and camera modes — but visual tuning still needs a human pass. First
  resumed action: open the live preview, check WAIT / CROSS / EMPTY / TRAFFIC,
  then `?lab=1` and fly around the corner.
- The set is intentionally sparse: one corner, four buildings, five cars. If the
  user wants more, extend `BUILDING_LOTS`, `PARKING` and `SIGNAL_POSITIONS`
  rather than scattering random props.
- Camera framing was tuned by projecting key world points, not by looking at a
  render. Check that the corner tower, shop row, signals and puddles all sit
  comfortably in frame at 1440×810.
- People variety is broad but still tiny marks; if they read as too busy, lower
  `crowdDensity` or reduce accessory probability in `ARCHETYPES`.
- Puddles are mostly on road/curb sites. If they need to spread onto the
  sidewalk, add more `PUDDLE_SITES` in `weather.js`.
- The disabled `rain` shader node remains in the graph for modularity. Do not
  re-enable the old wet-glass code; if the node is removed, update `PRESETS`,
  lab docs and node count.

---

## 3. Important invariants

1. `index.html` must remain **fully self-contained**. CI fails on `<script src>`,
   `<link href>`, or `http(s)://` strings.
2. Silent, UI-free by default. Lab and camera HUD are optional/authoring only.
3. All artwork is drawn in code. No images, fonts, videos or network assets.
4. The 20-second signal cycle is the single source of truth. `motionT` is a
   secondary clock; it must not change the 20s duration.
5. Build the set in stages: big volumes → road markings → buildings → fixed
   props → cars → people → rain. Do not skip back to a flat plan.
6. Traffic lights belong at `SIGNAL_POSITIONS` (four intersection corners). Do
   not scatter random signals.
7. Parked cars must pass `sanitizePark()` / `isParkable()`. Do not place them on
   crosswalks or sidewalks.
8. People are projected 3D world points. Do not regress to screen-space
   billboards or detailed rigged skeletons.
9. Signs are `sign3D()` oriented quads. Do not replace them with camera-facing
   billboards.
10. No procedural wet-glass overlay. Rain and puddles are the `Weather` particle
    / ripple simulation drawn on the plate.
11. The look graph compiles to one shader. Adding/removing a node means updating
    `NODE_DEFS`, inputs, `ui`, presets and docs.

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

Live site: **https://bashmaester.github.io/vale/**

- film: `https://bashmaester.github.io/vale/`
- lab: `https://bashmaester.github.io/vale/?lab=1`
- docs index: `https://bashmaester.github.io/vale/docs/index.html`
- handoff: `https://bashmaester.github.io/vale/docs/HANDOFF.md`

Successful Pages runs on this branch so far: `40521585370`, `40521959240`,
`40531284984`, `40531618858`. Check `DEPLOY_STATUS.md` for the newest run.

---

## 5. File map (quick)

```
index.html                  generated deliverable
build.mjs                   inlines CSS+JS into index.html
scripts/update-docs.mjs     deploy docs generator
.github/workflows/...       Pages CI
src/world.js                corner layout, sidewalks, crosswalks, flows, lanes,
                            parking, signals, building lots
src/collision.js            separation + poissonDisk
src/camera.js               three-quarter corner camera rig
src/camera-control.js       user orbit/fly camera
src/environment.js          staged cubic set: roads, sidewalks, buildings,
                            signals, furniture, wires, track
src/traffic.js              five vehicles + train, legal curbs/lanes
src/crowd.js                varied tiny 3D people, walk cycle, long shadows
src/weather.js              raindrop particles, puddle ripples, field mask
src/scene.js                plate/field orchestration, camera, separation
src/shaders.js              GLSL node defs + presets (rain disabled)
src/graph.js                shader graph compiler, enabled flags
src/draw.js                 painter primitives incl. sign3D()
src/lab.js                  optional patch bay
src/main.js                 wiring + query params + loop
```

---

## 6. Suggested next steps

1. Visually verify in a browser; capture 4–6 representative frames.
2. If the set still feels empty, add 1–2 more building volumes on the northeast
   corner and one more parked car — but keep the “few big elements first” rule.
3. Check that all four traffic lights read from the default camera; adjust pole
   arm direction if any head faces away.
4. Tune puddle count/size and raindrop density with `puddleAmount` and
   `rainAmount` in the lab.
5. If people variety is still too uniform, add more archetype accessories or
   adjust `ARCHETYPES` weights.
6. Optional: add a TSL/WebGPU adapter behind `ShaderGraph`; the GLSL graph is
   the seam.
7. Optional: record a 20s WebM/MP4 export for review while keeping `index.html`
   asset-free.

If the session dies mid-change: check `git status`, rebuild with `npm run build`,
open `?lab=1`, and continue from the first “Still rough” item above.
