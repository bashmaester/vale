# Vale World Kit — Session Handoff

**Last updated:** 2026-10-27
**Branch:** `arena/d33eb94f-vale`
**Status:** Visual parity pass — shaders, geometry, scenes significantly improved. Approaching reference fidelity.

---

## What Changed This Session

### Shader Overhaul
- **Linocut shader rewritten** — deeper gouges (8 iterations vs 4), rougher edges, secondary scratch lines, registration error simulation, stronger paper grain, more aggressive edge darkening
- **Post-processing enhanced** — layered film grain (3 octaves), color aberration at edges, warm shadow / cool highlight tinting, stronger contrast curve

### Mountain Scene
- **Multi-layer terrain** — background mountains (distant, muted), main mountains (ridged noise peaks), foreground hills
- **Ridged noise peaks** — sharp alpine ridges using `noise.ridged()` instead of smooth FBM
- **Proper tunnel** — carved into terrain at correct position with stone arch
- **Dense forest** — 70 multi-layer pine trees placed on slopes,避avoiding tunnel
- **Foreground grass** — 25 sparse grass tufts poking through snow
- **Tunnel module** — stone arch with masonry blocks, keystone, dark interior void, pulsing warm glow

### Train
- **Detailed engine** — cylindrical boiler, cab, smokestack, cow catcher, dual headlights
- **Passenger cars** — proper roof, underbody, window frames with warm glow
- **Wheels + rods** — 10 wheels per side with connecting rods
- **Carved smoke** — 8 cloud puffs that drift, expand, and fade (not particles)
- **Snow spray** — 60 particles trailing from wheels

### Sky
- **5000+ stars** — 3 density layers with proper twinkle animation
- **Carved cloud wisps** — 5-octave horizontal streaks, mostly visible in upper sky
- **Horizon glow** — subtle warm glow at the horizon line

### Tokyo Crossing
- **Wet road shader** — mirror-like reflections of signals (red pools), train (teal pools), crosswalk stripes, puddle highlights, carved horizontal gouges
- **Rain streaks** — 3000 particles with wind drift, additive blending
- **Detailed umbrella figures** — canopy with ribs, stick, body, legs; 3 color palette (red/teal/white)
- **Signal cycle** — 4 signal poles with hoods, proper red/teal light animation
- **Overhead teal train** — 14-unit body, roof, 20 windows both sides, white stripe, rails, 13 support pillars with cross braces
- **Buildings** — 10 buildings with warm/teal/red lit windows
- **Street details** — 4 lamp posts with glow, 2 pedestrian signal boxes
- **Crowd animation** — wait (bobbing) → surge diagonally (smoothstep) → drain away, tied to signal phase

### Camera System
- **Smooth dolly animation** — eased start→end positions with orbital drift
- **Per-scene camera config** — startPos, endPos, startTarget, endTarget
- **25s mountain cycle, 20s crossing cycle**

---

## Architecture (unchanged)

```
Engine.js → Scene Manager → SceneGraph (Node/Rules/Registry) → Modules
                                                          ↕
                                                    Shaders (linocut, grain)
                                                    Audio (WebAudio synth)
                                                    Editor (tree/palette/props)
```

### Module Registry
| Module | Factory | Category |
|--------|---------|----------|
| `sky` | createSkyModule | environment |
| `mountain` | createMountainModule | terrain |
| `train` | createTrainModule | vehicle |
| `crossing` | createCrossingModule | environment |
| `tunnel` | createTunnelModule | structure |

### Connection Rules
- `scene → sky/mountain/train/crossing/tunnel` (any port)
- `mountain → train/tunnel` (terrain port)
- `sky → mountain/crossing` (background/atmosphere)

---

## Still Needs Work (vs References)

### Mountain/Train Scene
- [ ] Snow spray needs more volume and better trailing behavior
- [ ] Smoke clouds should be bigger, more sculptural (metaballs?)
- [ ] Train windows should flicker/pulse slightly
- [ ] Camera should do dramatic scale change (far panorama → close wheel detail → back to tunnel)
- [ ] Need ground-level snow detail (footprints, tracks?)
- [ ] Tunnel interior should show train lights approaching

### Tokyo Crossing
- [ ] Rain should leave splash particles on ground
- [ ] Umbrella crowd needs more density and varied sizes
- [ ] Reflections need actual mirror rendering (render target)
- [ ] Train should have proper motion blur
- [ ] Need more atmospheric depth (fog, haze)
- [ ] Signal phase timing needs tuning

### General
- [ ] LOD system for performance
- [ ] Better module parameter inheritance
- [ ] Undo/redo in editor
- [ ] Save/load scenes to JSON
- [ ] More module types (water, cave, bridge, creature)

---

## Running

```bash
npm run dev        # Dev server :5173
npm run build      # Production to dist/
```

## Deployment
- GitHub Actions: `.github/workflows/deploy.yml`
- Deploys to GitHub Pages on push to `arena/*`
- Vite `base: '/vale/'` for subpath

## File Structure
```
src/engine/
├── Engine.js              # Renderer, camera, loop
├── audio/AudioEngine.js   # WebAudio synth
├── editor/EditorUI.js     # Scene tree, palette, props
├── modules/
│   ├── Mountain.js        # Multi-layer terrain + forest
│   ├── Train.js           # Detailed train + smoke + spray
│   ├── Sky.js             # Stars + carved clouds
│   ├── Crossing.js        # Rain, crowd, signals, overhead
│   └── Tunnel.js          # Stone arch entrance
├── procedural/noise.js    # Simplex + FBM + ridged
── scene/
│   ├── SceneGraph.js      # Node, Rules, Registry, Manager
│   └── scenes.js          # Scene builders
└── shaders/
    ├── linocut.js         # Carved print material
    └── grain.js           # Post-processing
```
