# VALE — current state (frank snapshot)

**Last updated:** 2026-10-27, after the user said the result is “very
underwhelming” and “almost none of my notes have landed.”

Read this before making another visual change. The repository has a working
technical scaffold, but it should **not** be treated as a finished or approved
look.

---

## 1. What actually exists right now

- A single self-contained `index.html`: silent, autoplaying 20s loop, no
  external assets, no audio, no visible UI during normal playback.
- Hybrid 3D→2D pipeline: procedural 3D world → perspective projection → 2D ink
  plate + field data texture → WebGL2 node shader → print-like output.
- Hidden lab (`?lab=1`) with node graph, scene params, camera tab, timeline
  scrubber, presets and export controls.
- User camera takeover (`?cam=orbit`, `?cam=fly`, `?hud=0`, WASD/QE, etc.).
- GitHub Pages CI on `arena/082e9ffd-vale` and `main`.
- Human docs: `HANDOFF.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `CI.md`,
  `CURRENT_STATE.md` (this file).

### Current scene contents

- One built-out northeast street corner.
- Two crossing road strips and four raised sidewalk boxes.
- Four straight crosswalks, stop lines, lane dividers, arrows, manhole covers,
  tactile paving.
- Four cubic building volumes with windows, awnings, roof parapets, rooftop
  boxes, accent stripes and oriented 3D signs.
- Four traffic-light poles at the four intersection corners, each with a
  vehicle head and pedestrian head.
- Five vehicles: three parked at legal curbs, two moving in separated lanes,
  plus a five-car overhead train.
- ~122 tiny people (92 crossers + 30 waiters) with archetypes, coat shapes,
  head shapes, umbrellas, long shadows, accessories and occasional companions.
- Raindrop/puddle simulation: 220 persistent 3D raindrop particles, 8 puddle
  polygons, ripple rings, splash spikes and ambient drips.
- No `wet` canvas and no procedural wet-glass shader overlay. The shader `rain`
  node is a disabled pass-through.
- Camera: restrained three-quarter view of the corner, eye roughly
  `[-28, 28, 48]`, target `[0, 1, -3]`.

### Current code state

- Branch before this handoff commit: `arena/082e9ffd-vale`.
- Last functional commit before this handoff: `6080f18`.
- `index.html` is generated from `src/` by `npm run build` and is committed.
- Build/check/docs commands pass locally.
- Live site: https://bashmaester.github.io/vale/

---

## 2. The user’s latest assessment

The user’s exact latest feedback:

> “this is very underwhelming. document the current state, write a handoff,
> commit and push and merge to main. write a handoff doc so we can continue in
> another session. almost none of my notes ahve landed so you can include a
> summary in the handoff”

Interpretation: **stop adding more code on top of the current look.** The next
session should re-art-direct from the references, not assume the current scene
is correct. The infrastructure is useful; the visual result is not approved.

---

## 3. Full summary of user notes (all turns)

### Original brief

Create a silent, autoplaying 20-second film in one self-contained HTML file. A
rainy Tokyo crossing in black / red / teal / white, with rough carved lines and
visible print grain. One signal cycle drives umbrellas waiting, crossing,
draining away, a briefly empty street, and returning traffic. Footsteps break
gouged wet reflections. A train passes overhead. All artwork code-generated. No
outside visual assets, no normal website UI, no audio.

### Architecture / style corrections

- Hybrid **3D-2D** is required. The user explicitly rejected switching to pure
  2D Canvas/SVG as the main architecture.
- Focus on style, aesthetics, execution, shaders / TSL-like modular looks and
  parametric creation.
- Build a representation of structure and feeling, not a simulation.
- Keep a mini modular node-based shader graph for experimenting with looks.
- Keep user camera / fly-around capability.
- Keep CI deploying to GitHub Pages at the end of every turn, and keep docs /
  handoff current for interrupted sessions.

### Crowd / world corrections

- People must not overlap; they should scatter meaningfully.
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
- Build a **cubic volume scene / set**. Block out the big elements first, then
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

- The cumulative result is “very underwhelming.”
- “Almost none” of the visual notes have landed in a way the user can see.
- The next session needs a handoff that records the notes and the gap between
  code and visual outcome.

---

## 4. What technically landed vs. what probably did not land visually

This distinction matters. Code exists for most items, but that does **not** mean
the user can see or feel them.

| Note | Technical implementation | Visual confidence |
| --- | --- | --- |
| Hybrid 3D→2D | Yes, custom camera/projection + WebGL2 shader graph | High |
| One self-contained HTML | Yes | High |
| 20s signal cycle | Yes | Medium |
| Node-based shader graph | Yes, 8 nodes + lab | High |
| User camera takeover | Yes | High |
| Pages CI + docs | Yes | High |
| Tiny people | Yes, archetypes/accessories | Low — may still read as noise or stick marks |
| People don’t overlap | Yes, separation solver | Medium |
| Walk rather than slide | Yes, distance-driven stride | Low — needs visual proof |
| More directions than diagonals | Yes, straight + diagonal + stroll | Medium |
| Slower motion | Yes, `motionT = 0.62 × t` | Medium |
| Proper sidewalk street | Yes, raised boxes + curbs | Low — may still look flat/sparse |
| Cubic volume set | Yes, staged boxes | Low — likely too blocky/unconvincing |
| Traffic lights only at corners | Yes, four poles | Low — may be too small or poorly oriented |
| Few buildings / cars where they belong | Yes, four buildings + five cars | Low — proportions/placement may be wrong |
| Signs 3D, not billboards | Yes, `sign3D()` | Medium |
| Remove wet-glass overlay | Yes | High |
| Raindrop / puddle sim | Yes, particles + ripples | Low — may be too subtle or not readable |
| Rough carved lines / print grain | Yes, shader nodes | Low — likely too generic |
| Expressive non-uniform hatch | Yes, shader code | Low — needs art direction |
| Overall aesthetic / feeling | **No** | **Very low — user says underwhelming** |

---

## 5. Likely root causes

1. **No browser screenshot validation in this sandbox.** All visual tuning was
   done by reasoning about code and projecting coordinates. This is the biggest
   process failure.
2. **Technical scaffolding was mistaken for art direction.** Modules exist, but
   composition, scale, density, contrast, rhythm and texture were not validated
   against the references.
3. **Too many simultaneous corrections.** The current code tries to satisfy
   crowd, world rules, camera, CI, set, rain and shader graph all at once. The
   result is coherent as a system but weak as an image.
4. **The set may be too sparse.** “A few buildings / a few cars” was implemented
   literally, but the scene may need richer big volumes, clearer street
   hierarchy and stronger foreground/midground/background separation.
5. **People may be too small or too uniform at final resolution.** More variety
   was added in code, but the visual signal may be lost.
6. **Rain/puddles may be too subtle.** The fake overlay was removed, but the
   replacement sim may not read strongly enough.
7. **Camera may be wrong.** A three-quarter corner view was chosen by
   projecting key points, not by looking at a render.
8. **Print shader may flatten everything.** The node graph is modular but may
   be washing out the hand-carved / riso / linocut feeling.

---

## 6. Recommended next-session plan

Do **not** start by adding more features. Start by making one compelling frame.

1. Open the current film in a real browser. Capture stills at WAIT, CROSS,
   EMPTY and TRAFFIC. If no browser is available in the next environment, make
   that the first blocker to solve.
2. Put the two supplied architectural-sketch references next to the current
   frames. Compare:
   - people size / density / shadows,
   - building scale and silhouette,
   - street/sidewalk readability,
   - umbrella shapes,
   - rain and puddle readability,
   - black/red/teal/white balance,
   - carved line and grain quality.
3. Re-art-direct from the references. It is acceptable to discard large parts
   of the current environment/camera/crowd code if they are blocking the image.
4. Keep the hybrid 3D→2D architecture, self-contained output, hidden lab, user
   camera and CI. These are the stable parts.
5. Rebuild the set in visible stages and validate each stage with a screenshot:
   - big road/sidewalk/building volumes,
   - crosswalks, signals, cars,
   - people,
   - rain/puddles,
   - shader finish.
6. Tune the **still frame first**, then motion. Slower motion is only useful if
   the figures and rain read clearly.
7. Consider temporarily disabling the shader graph (`?preset=` or lab bypass)
   to judge the raw ink plate, then re-enable the print finish.
8. Only after the images feel right, re-check the 20s cycle and empty-street
   beat.

---

## 7. Invariants to keep

- One self-contained `index.html`, silent autoplay, no external assets.
- Hybrid 3D→2D pipeline; do not regress to pure 2D.
- 20-second signal cycle with waiting → crossing → drain → empty → traffic.
- Black / red / teal / white palette with rough carved lines and controlled
  grain.
- Hidden lab and camera HUD only; no normal website UI.
- User camera takeover.
- All artwork code-generated.
- CI deploys to GitHub Pages on pushes.
- Human docs stay current.
- No procedural wet-glass overlay; rain/puddles should be a real simulation.

---

## 8. Commands

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

## 9. Bottom line

The repository is a working **technical scaffold**, not an approved film. The
next session should treat the user’s notes as the specification and the current
build as a rough prototype. The most important missing step is real visual
validation against the references.
