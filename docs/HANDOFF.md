# VALE — session handoff

**Purpose:** resume this project in a fresh session without re-deriving
anything. Read this, then `docs/CURRENT_STATE.md`, then `docs/ARCHITECTURE.md`.

**Last reviewed:** 2026-10-27, branch `arena/bab4bc10-vale`.

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

The scene now reads as a **diorama in a case**: plinth, corner posts, cut-face
caps, engraved label, four blocks at the back, one road, two sidewalks, a
crossing, traffic signals, trees, vehicles, an overhead train, a rain-swept
crowd.

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

Measured in this build: `npm run check` passes, `npm run build` is 125.5 KiB,
luminance 47–63 % dark across sizes, and the LoD contact sheet shows the three
tiers degrading as designed.

---

## 3. Do not repeat these

- **No browser in the sandbox.** `apt` cannot reach the Debian mirror, the
  Playwright CDN times out, and `npm i gl` fails in node-gyp. Do not burn a turn
  retrying them; use `tools/shot.mjs` (napi-canvas stills of the ink plate with
  the shader bypassed).
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

---

## 5. Next concrete steps

1. Fill the empty front-left quadrant with LoD-aware street furniture.
2. Crowd pass 3: less conical coats, canopy resting on the head, a few more
   accessories at L0 only.
3. `tools/tiles.mjs`: render two tiles along x to prove snapping and inspect
   the seam (this is the core engine claim, currently unproven visually).
4. Glazing/interiors for vehicles at L0.
5. Add a CI screenshot job (GitHub Actions has a browser) so the WebGL finish
   can be validated for the first time.

---

## 6. File map

| File | Responsibility |
| --- | --- |
| `src/tile.js` | tile volume, colours, `LOD_LEVELS`, `makeDetail`, `groundYAt` |
| `src/world.js` | data for one tile: road, sidewalks, crossing, lanes, lots, flows, puddles |
| `src/environment.js` | all staged street/building/furniture/frame drawing |
| `src/crowd.js` | procedural people: archetypes, LoD thinning, umbrellas |
| `src/traffic.js` | vehicles (extruded profiles) + overhead train |
| `src/weather.js` | raindrops, ripples, puddles |
| `src/scene.js` | orchestration, params, depth sorting, `render(t, dt)` |
| `src/camera.js` | `CameraRig`: fitted keyframes, roll, fov |
| `src/draw.js` | `Painter`: jittered polylines, polys, gradients, hatching |
| `src/shaders.js` / `src/graph.js` | print finish presets and node graph |
| `src/renderer.js` | WebGL2 fullscreen pass, `bypass` for raw plate |
| `src/lab.js` | hidden lab UI |
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
