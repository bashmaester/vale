# VALE — session handoff

**Purpose:** resume this project in another session. The user’s latest
assessment is that the result is “very underwhelming” and that “almost none” of
their notes have landed. Treat this document as the source of truth for the
next art-direction pass.

**Last reviewed:** 2026-10-27, merged to `main` via PR #1.

**Read in this order:**

1. `docs/CURRENT_STATE.md` — frank snapshot of what is actually built.
2. `docs/HANDOFF.md` — this file: notes, gaps, next steps.
3. `docs/ARCHITECTURE.md` — technical pipeline.
4. `docs/CHANGELOG.md` — turn-by-turn history.
5. `docs/CI.md` — deployment notes.

---

## 1. Reality check

The repository has a working technical scaffold:

- one self-contained `index.html`,
- silent autoplaying 20s loop,
- hybrid 3D→2D projection pipeline,
- node-based WebGL2 shader graph,
- hidden lab and user camera,
- GitHub Pages CI,
- one built-out street corner with buildings, signals, cars, people, rain and
  puddles.

But the **visual result is not approved**. The user explicitly said it is
“very underwhelming” and that “almost none” of their notes have landed. Do not
assume that because a feature exists in code, it reads on screen. The next
session must validate against the references with real browser screenshots.

---

## 2. Full summary of user notes

### Original brief

- Silent, autoplaying **20-second film** in one self-contained HTML file.
- Rainy Tokyo crossing.
- Palette: black, red, teal, white.
- Rough carved lines and visible but controlled print grain.
- One signal cycle: umbrellas waiting → crossing → draining away → briefly
  empty street → returning traffic.
- Footsteps break gouged wet reflections.
- Train passes overhead.
- All artwork code-generated.
- No outside visual assets, no normal website UI, no audio.

### Architecture / process corrections

- Keep **hybrid 3D-2D**. The user explicitly rejected switching to pure 2D
  Canvas/SVG as the main architecture.
- Focus on style, aesthetics, execution, shaders / TSL-like modular looks and
  parametric creation.
- Build a representation of structure and feeling, not a simulation.
- Keep a mini modular node-based shader graph.
- Keep user camera / fly-around capability.
- Keep CI deploying to GitHub Pages at the end of every turn.
- Keep docs and handoff current for interrupted sessions.

### Crowd / world corrections

- People must not overlap; scatter meaningfully.
- Vehicles should be more than boxes: wheels and silhouettes.
- Humans must walk rather than slide.
- World rules must prevent cars on crosswalks and interpenetration.
- Hatching should be expressive and non-uniform.
- Use “tiny people” architectural-sketch references:
  small simple bodies, head dots/shapes, solid coats/pants, varied umbrella
  silhouettes, ground shadows, occasional pairs/bags/dogs/strollers. Less detail
  is fine if motion quality and feeling are right.
- All animation was too fast; slow it down while keeping camera movement.
- People should cross in more directions than diagonals only.
- People need more variety.

### Set corrections

- Rebuild the set with a proper sidewalk street and believable but not
  over-detailed street geometry.
- Traffic lights only where they belong.
- Add a few buildings.
- Add a few cars where they belong.
- Build a **cubic volume scene / set**. Block out big elements first, then
  proceed smaller and add people at the end.
- Focus on one corner rather than a giant scramble intersection.
- Start with street and sidewalk.
- Signs should be 3D and not always face the camera.

### Wet / rain corrections

- The procedural wet-glass fake overlay was too strong and broke the vibe.
- Remove that overlay.
- Rain and puddles look good and should remain.
- Bring back a raindrop and puddle simulation, not a shader noise overlay.

### Latest feedback

- “this is very underwhelming.”
- “almost none of my notes ahve landed.”
- Document current state, write handoff, commit/push, merge to main, include a
  summary of the notes.

---

## 3. What is technically in the repo now

- `src/world.js` — corner layout: two road strips, four sidewalk blocks,
  crosswalks, lanes, legal parking, four signal positions, four building lots,
  weighted waiting zones and seven pedestrian flows.
- `src/environment.js` — staged cubic set: road/sidewalk blockout, road
  markings, buildings, traffic lights, street furniture, wires and track.
- `src/traffic.js` — five vehicles (three parked, two moving) plus a five-car
  overhead train; parked cars are sanitized to legal curbs.
- `src/crowd.js` — ~122 tiny people with archetypes, coat/head/umbrella
  variety, long shadows, accessories, companions and distance-driven gait.
- `src/weather.js` — 220 persistent 3D raindrop particles, 8 puddle polygons,
  ripple rings, splash spikes and ambient drips.
- `src/scene.js` — only `plate` and `field` canvases. No wet-glass canvas.
- `src/shaders.js` / `src/graph.js` — 8-node GLSL graph; the `rain` node is a
  disabled pass-through.
- `src/camera.js` / `src/camera-control.js` — three-quarter corner camera plus
  user orbit/fly takeover.
- `src/lab.js` — hidden patch bay.
- `.github/workflows/deploy-pages.yml` — Pages CI.
- `index.html` — generated self-contained deliverable.

See `docs/CURRENT_STATE.md` for a frank table of “technical implementation vs
visual confidence”.

---

## 4. What has not landed visually

The following are implemented in code but are **not approved visually**:

- The set still feels sparse and blocky rather than like a rich street corner.
- Buildings, cars and signals may be too small, too simple or badly placed.
- People may still read as noise or stick marks at final resolution.
- Walking motion may not read as hand-animated.
- Rain and puddles may be too subtle after removing the fake overlay.
- The shader finish may flatten the carved-line / grain feeling.
- Camera framing was chosen by projecting coordinates, not by looking at a
  render.
- Overall composition, scale, density, contrast and rhythm have not been
  validated against the supplied references.

Root cause: no browser screenshot validation was possible in this sandbox. All
visual tuning was done by reasoning about code.

---

## 5. Next session: first actions

1. Open the film in a real browser. Capture stills at WAIT, CROSS, EMPTY and
   TRAFFIC. If no browser is available, solve that first.
2. Put the supplied architectural-sketch references beside those stills.
3. Compare:
   - people scale / density / shadows,
   - building scale and silhouette,
   - street and sidewalk readability,
   - umbrella shapes,
   - rain and puddle readability,
   - palette balance,
   - carved line and grain quality.
4. Re-art-direct from the references. It is acceptable to discard large parts
   of `environment.js`, `camera.js`, `crowd.js` or `weather.js` if they block the
   image.
5. Keep the stable infrastructure: self-contained `index.html`, hybrid 3D→2D,
   hidden lab, user camera, node shader graph and Pages CI.
6. Rebuild the set in visible stages and validate each stage with a screenshot:
   big volumes → road markings → buildings/signals/cars → people → rain/puddles
   → shader finish.
7. Tune a still frame first. Only then tune motion and the 20s cycle.
8. Consider bypassing the shader graph temporarily in the lab to judge the raw
   ink plate, then re-enable the print finish.

---

## 6. Invariants

- One self-contained `index.html`, silent autoplay, no external assets.
- Hybrid 3D→2D pipeline. Do not regress to pure 2D.
- 20-second signal cycle with waiting → crossing → drain → empty → traffic.
- Black / red / teal / white palette with rough carved lines and controlled
  grain.
- Hidden lab / camera HUD only; no normal website UI.
- User camera takeover.
- All artwork code-generated.
- CI deploys to GitHub Pages on pushes.
- Human docs stay current.
- No procedural wet-glass overlay; rain/puddles should be a real simulation.
- Traffic lights only at intersection corners.
- Parked cars must pass `sanitizePark()` / `isParkable()`.
- Signs are `sign3D()` oriented quads, not billboards.

---

## 7. Commands

```bash
npm install
npm run build           # regenerate self-contained index.html
npm run docs            # regenerate deploy metadata + docs/index.html
npm run dev             # build + serve on :8000
npm run check           # esbuild bundle check
```

Useful URLs:

- `index.html` — clean film
- `index.html?lab=1` — hidden lab
- `index.html?lab=1&paused=1&t=7` — paused inspection frame
- `index.html?cam=fly` — user fly camera
- `index.html?preset=riso` — alternate print look
- `index.html?w=1920&h=1080` — higher internal resolution

Live site: https://bashmaester.github.io/vale/

---

## 8. Branch / merge / deploy

- Working branch: `arena/082e9ffd-vale`.
- This handoff commit is pushed to that branch.
- Merged to `main` via PR #1 from
  `arena/082e9ffd-vale` → `main` using `gh pr merge`, without switching the
  local working branch.
- Pages CI triggers on both the working branch and `main`.
- Generated deploy metadata lives in `BUILD.md`, `DEPLOY_STATUS.md`,
  `manifest.json` and `docs/index.html`; CI regenerates these on deploy.

---

## 9. File map

```
index.html                  generated deliverable
build.mjs                   inlines CSS+JS into index.html
scripts/update-docs.mjs     deploy docs generator
.github/workflows/...       Pages CI
docs/CURRENT_STATE.md       frank snapshot of what is actually built
docs/HANDOFF.md             this file
docs/ARCHITECTURE.md        system design
docs/CHANGELOG.md           turn-by-turn changes
docs/CI.md                  deployment notes
src/world.js                corner layout and world rules
src/collision.js            separation + poissonDisk
src/camera.js               three-quarter corner camera rig
src/camera-control.js       user orbit/fly camera
src/environment.js          staged cubic set
src/traffic.js              five vehicles + train
src/crowd.js                varied tiny 3D people
src/weather.js              raindrop particles + puddle ripples
src/scene.js                plate/field orchestration
src/shaders.js              GLSL node defs + presets
src/graph.js                shader graph compiler
src/draw.js                 painter primitives incl. sign3D()
src/lab.js                  optional patch bay
src/main.js                 wiring + query params + loop
```

---

## 10. Bottom line

The current build is a technical prototype, not the film the user asked for.
The next session should start from the references and the notes above, not from
the assumption that the current look is correct. Real browser screenshots are
the missing validation step.
