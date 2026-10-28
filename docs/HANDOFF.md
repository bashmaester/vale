# VALE — session handoff

## ⚠️ BRANCH CORRECTION — read before trusting anything below

**This branch (`arena/45e6b5a9-vale`) is NOT the tip of the project.**

On 2026-10-28 a session started here believing `main` (`de04b9a`, PR #1) was the
newest work. That was wrong. The clone was single-branch and only `main` +
the new working branch were visible, so the newer branch was never seen.

The real tip of the project is **`arena/bab4bc10-vale`** (`6a57a47`,
2026-10-27 23:00), and it is **21 commits ahead** of `main`, with `main` fully
contained in it. It is the same lineage — not a competing fork:

```
a71d529 initial ─▶ d33eb94f (engine/world kit)
                     ╲ de04b9a  (PR #1, arena/082e9ffd-vale)
                        ╲ 2dbcace → … → 6a57a47   arena/bab4bc10-vale  ← TIP
                           ╲ b5f212d              arena/45e6b5a9-vale  ← this branch
```

See `docs/shots/compare-branches.jpg` for the side-by-side and
`docs/BRANCH_COMPARISON.md` for the full audit.

**What `bab4bc10` is:** the project brief changed. In that session the user
redefined the goal:

> “we are building the foundations for a cosy indie sim game engine. the key
> aspect is that everything is procedurally generated with procedural LoD … the
> scene as a modular 3d volume (almost like a snow globe or a vignette that we
> can use to build tiles from.”

So it is **an engine foundation, not a film**. `bab4bc10` has a tile engine
(`src/tiles.js`, `src/cells.js`), a minimap editor (`src/sidebar.js`), LoD, a
frame-budget pass, a real 20 s bit-exact loop, and a 14-file test suite
(`tools/`) wired into `npm run verify` — which passes on that branch.

**This branch, by contrast,** is a first art pass on the *old* one-corner film
reading of the brief. It is not wasted (see below) but it is built against a
superseded brief and must not be treated as ahead.

### Do not repeat this mistake

- Read the brief in `docs/HANDOFF.md` on `arena/bab4bc10-vale` before planning.
- Run `git ls-remote --heads origin` or `gh api repos/:owner/:repo/branches`
  to see *all* branches, not just the ones this clone tracks.
- The single-branch clone config is the trap: `remote.origin.fetch` was
  `+refs/heads/main:refs/remotes/origin/main` plus this branch only.

### Status of the live site

Pushing this branch triggered the any-branch Pages workflow, so
**https://bashmaester.github.io/vale/ currently serves `b5f212d`, this branch's
build, and it overwrote `bab4bc10`'s deploy.** Run `40599010516` was the last
`bab4bc10` deployment. This sandbox's integration has no Actions write scope,
so it cannot re-run or dispatch a workflow for `bab4bc10` (403). Restoring the
site requires a push to `bab4bc10` (any trivial commit), which should happen
before any further push from this branch.

---

**Purpose:** resume this project in another session without losing context.

**Last reviewed:** 2026-10-28. Branch `arena/45e6b5a9-vale` — ⚠️ **behind
`arena/bab4bc10-vale`; see the branch correction above.**

**Read in this order:**

1. `docs/CURRENT_STATE.md` — frank snapshot of what is actually built.
2. `docs/HANDOFF.md` — this file: status, notes, gaps, next steps.
3. `docs/SCREENSHOTS.md` — how to look at the film, and what the stills show.
4. `docs/ARCHITECTURE.md` — technical pipeline.
5. `docs/CHANGELOG.md` — turn-by-turn history.
6. `docs/CI.md` — deployment notes.

---

## 0. TL;DR for the next session (scoped to *this* branch)

> For the real project state, read the handoff on `arena/bab4bc10-vale` instead.
> Everything below describes only the superseded film pass that lives here.


The single biggest process failure — **no one could look at the film** — is
fixed. There is now a working headless screenshot path
(`npm run setup:browser`, `npm run shots`), and the first look at a real render
explained most of the user's dissatisfaction in one shot.

The first render showed a **wireframe CAD diagram floating in static**. Four
causes were found and fixed this turn (invisible volumes, buildings painted in
the wrong order, ~70% empty frame, print noise over empty paper) plus a camera
that was an aerial plan instead of a street-level view of one corner.

The film now reads as a night street corner. It is **better, not approved**.
The next session must keep taking stills, then judge **motion**, which still has
not been reviewed at all.

---

## 1. Reality check

**Solid:**

- one self-contained `index.html`, silent, 20s autoplaying loop, no assets,
- hybrid 3D→2D projection into an ink plate + field texture,
- node-based WebGL2 shader graph with a hidden lab,
- user camera takeover,
- GitHub Pages CI that now deploys from **any** branch,
- a working screenshot harness.

**Not approved:**

- the look has moved from "underwhelming diagram" to "readable night corner",
  but it is still a first art pass,
- the 20s cycle has only been judged as stills, never in motion,
- rain, puddles, umbrellas and individual figures still do not read strongly.

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

- Keep **hybrid 3D-2D**. Pure 2D Canvas/SVG as the main architecture was
  explicitly rejected.
- Focus on style, aesthetics, execution, shaders / TSL-like modular looks and
  parametric creation.
- Build a representation of structure and feeling, not a simulation.
- Keep a mini modular node-based shader graph.
- Keep user camera / fly-around capability.
- Keep CI deploying to GitHub Pages at the end of every turn — **from any
  branch**.
- Keep docs and handoff current for interrupted sessions.

### Crowd / world corrections

- People must not overlap; scatter meaningfully.
- Vehicles should be more than boxes: wheels and silhouettes.
- Humans must walk rather than slide.
- World rules must prevent cars on crosswalks and interpenetration.
- Hatching should be expressive and non-uniform.
- Use “tiny people” architectural-sketch references: small simple bodies, head
  dots/shapes, solid coats/pants, varied umbrella silhouettes, ground shadows,
  occasional pairs/bags/dogs/strollers. Less detail is fine if motion quality
  and feeling are right.
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

### Feedback history

- Turn 5: “this is very underwhelming.” / “almost none of my notes ahve
  landed.” → led to the current-state + handoff pass.
- Turn 6 (this turn): first screenshots taken; root causes found and fixed.
  **No new user art feedback yet** — the next session should get stills in front
  of the user early.

---

## 3. What is in the repo now

- `src/world.js` — corner layout: two road strips, four sidewalk blocks,
  crosswalks, lanes, legal parking, four signal positions, four building lots,
  weighted waiting zones, seven pedestrian flows.
- `src/environment.js` — **backdrop ring of 34 distant blocks**, staged cubic
  set, tonally separated road/junction/sidewalk planes, road markings, solid
  buildings painted far-to-near with paper windows, signals, street furniture,
  wires and track.
- `src/draw.js` — `PALETTE` print tonal ladder + `faceTone()`; `p.box()` can
  shade each face (`shade: true`, `fillFor(name)`); rough lines, `sign3D()`.
- `src/traffic.js` — five vehicles (three parked, two moving) plus a five-car
  overhead train; parked cars sanitized to legal curbs.
- `src/crowd.js` — ~122 tiny people with archetypes, coat/head/umbrella
  variety, long shadows, accessories, distance-driven gait.
- `src/weather.js` — 220 persistent 3D raindrop particles, 8 puddle polygons,
  ripple rings, splash spikes, ambient drips.
- `src/scene.js` — `plate` and `field` canvases only; no wet-glass canvas.
- `src/shaders.js` / `src/graph.js` — 8-node GLSL graph; `rain` is a disabled
  pass-through; `carve`/`detail`/`hatch`/`paper` are coverage-gated to ink.
- `src/camera.js` — street-level three-quarter view of the NE corner.
- `src/lab.js` — hidden patch bay.
- `scripts/setup-headless.sh` — builds stub NSS/NSPR for bundled chromium.
- `scripts/shoot.mjs` — pauses the film and writes PNG stills.
- `.github/workflows/deploy-pages.yml` — Pages CI on **every branch**.
- `docs/shots/` — before/after stills.

---

## 4. What has not landed visually

Verified by looking at stills, not by reading code:

- **Hatch marble.** Unlit coarse hatch still leaves faint marbled swirls on
  large facades. It should be a carved hatch, not marble.
- **Umbrellas** read as thin ellipses. The notes ask for varied silhouettes
  (dome, flat, pointed, tilted) that read at final size.
- **Individual figures** are legible as a crowd mass but thin as people.
- **Rain and puddles** are simulated but nearly invisible in a still.
- **Footsteps breaking gouged reflections** is not yet visible.
- **Signs** exist as `sign3D()` quads but are small and easy to miss.
- **Motion** — walking weight, the drain, the empty beat, returning traffic —
  has never been reviewed. Only stills exist.

---

## 5. Next session: first actions

1. `npm install && npm run setup:browser && npm run build && npm run serve &`
2. `npm run shots` then **look at all four stills**. Do not skip this.
3. Get the stills in front of the user and ask which single flaw matters most.
4. Fix one flaw at a time, re-shooting after each. Suggested order:
   - umbrella silhouettes (cheap, high visual payoff for the crowd),
   - hatch marble on facades,
   - rain/puddle readability,
   - then motion: capture a short sequence of frames across the 20s cycle.
5. Only after stills hold up, judge the cycle in motion (walking weight, drain,
   empty beat, returning traffic).
6. Keep the infrastructure: self-contained output, hybrid 3D→2D, hidden lab,
   user camera, node graph, Pages CI.

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
- CI deploys to GitHub Pages on pushes, **from any branch**.
- Human docs stay current.
- No procedural wet-glass overlay; rain/puddles are a real simulation.
- Traffic lights only at intersection corners.
- Parked cars must pass `sanitizePark()` / `isParkable()`.
- Signs are `sign3D()` oriented quads, not billboards.
- **Big volumes are drawn as shaded masses** (`shade: true`), never as flat
  background-coloured fills — that bug is what made the set a wireframe.
- **New shader effects must be coverage-gated** to plate luma, or they will fog
  empty paper.
- **Look at stills before claiming a visual change landed.**

---

## 7. Commands

```bash
npm install
npm run build           # regenerate self-contained index.html
npm run docs            # regenerate deploy metadata + docs/index.html
npm run deploy:local    # build + docs
npm run serve           # static server on :8123 (0.0.0.0)
npm run dev             # build + serve on :8000
npm run check           # esbuild bundle check
npm run setup:browser   # one-time headless chromium setup
npm run shots           # stills at 0,6,12,16 → shots/latest/
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

- Working branch: `arena/45e6b5a9-vale` (cut from `main` at `de04b9a`).
- Docs and code are committed and pushed to that branch every turn.
- Pages CI triggers on **every branch** (`'**'`), plus `workflow_dispatch`.
  The old hard-coded branch list still named a previous session's branch, which
  is why deploys would silently stop after a handover.
- Generated deploy metadata lives in `docs/BUILD.md`, `docs/DEPLOY_STATUS.md`,
  `docs/manifest.json` and `docs/index.html`; CI regenerates these on deploy.
- `docs/shots/` stills are committed on purpose — they are the visual record the
  next session needs. Working output in `shots/` is gitignored.

---

## 9. File map

```
index.html                  generated deliverable
build.mjs                   inlines CSS+JS into index.html
scripts/update-docs.mjs     deploy docs generator
scripts/setup-headless.sh   stub NSS/NSPR + install bundled chromium
scripts/shoot.mjs           headless stills of the film
.github/workflows/...       Pages CI (any branch)
docs/CURRENT_STATE.md       frank snapshot of what is actually built
docs/HANDOFF.md             this file
docs/SCREENSHOTS.md         how to look at the film + what stills revealed
docs/shots/                 before/after reference stills
docs/ARCHITECTURE.md        system design
docs/CHANGELOG.md           turn-by-turn changes
docs/CI.md                  deployment notes
src/world.js                corner layout and world rules
src/collision.js            separation + poissonDisk
src/camera.js               street-level corner camera rig
src/camera-control.js       user orbit/fly camera
src/environment.js          backdrop + staged cubic set
src/traffic.js              five vehicles + train
src/crowd.js                varied tiny 3D people
src/weather.js              raindrop particles + puddle ripples
src/scene.js                plate/field orchestration
src/shaders.js              GLSL node defs + presets
src/graph.js                shader graph compiler
src/draw.js                 painter primitives + print tonal ladder
src/lab.js                  optional patch bay
src/main.js                 wiring + query params + loop
```

---

## 10. Bottom line

The film went from an unreadable wireframe diagram to a readable night street
corner in one turn, and the reason is simple: it was finally looked at.

Do that first, every turn. `npm run shots`, then open the images. The single
largest remaining risk is a session that edits code, reads the diff, and
declares victory without a still.
