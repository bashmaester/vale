# Vale World Kit — Session Handoff

**Last updated:** 2026-10-27
**Branch:** `arena/d33eb94f-vale`
**Status:** Foundation layer complete — engine, scenes, editor, deployment pipeline operational.

---

## What's Built

### Core Engine (`src/engine/Engine.js`)
- **Three.js WebGL renderer** with post-processing pipeline (film grain, vignette, color tint, scanlines)
- **OrbitControls** for camera navigation (active in Edit mode, auto-animated in Live mode)
- **EffectComposer** for shader-based post-processing
- **Scene lifecycle**: load, unload, transition between scenes

### Scene System (`src/engine/scene/`)
- **SceneNode**: Directed graph node with params, children, connections, spatial transforms
- **ConnectionRules**: Defines which module types can connect and on which ports
- **SceneRegistry**: Module factory registry with growth rules for organic expansion
- **SceneManager**: Scene composition, module indexing, organic growth API, transitions

### Procedural Modules (`src/engine/modules/`)
| Module | Description | Parameters |
|--------|-------------|------------|
| **Mountain** | Carved terrain with peaks, ridges, tunnel, pine forest, snow ground | `numPeaks`, `width`, `depth`, `height`, `hasTunnel`, `tunnelX/Z`, `tunnelRadius`, `trees`, `treeCount` |
| **Train** | Red linocut train with cars, engine, wheels, warm windows, smoke particles | `numCars`, `carLength`, `carWidth`, `carHeight` |
| **Sky** | Night dome with procedural stars, carved cloud wisps, animated twinkle | `radius`, `starDensity` |
| **Crossing** | Rainy Tokyo intersection: wet road with reflections, crosswalk, signals, umbrella crowd, rain particles, overhead train, buildings | `roadWidth`, `crowdCount`, `rainCount`, `rainHeight`, `rainSpread` |

### Shaders (`src/engine/shaders/`)
- **LinocutMaterial**: Custom ShaderMaterial with carve patterns, gouge marks, paper grain, overprint, edge darkening — the core visual aesthetic
- **GrainPass**: Full-screen post-processing with film grain, contrast, vignette, color tint, scanlines

### Audio Engine (`src/engine/audio/AudioEngine.js`)
- All sounds procedurally synthesized via WebAudio (no samples)
- **Ambient pad**: Detuned oscillators with LFO modulation
- **Rain**: Pink noise through bandpass filter
- **Train rumble**: Low-frequency oscillation with rhythmic clatter
- **Wind**: Filtered noise with LFO-driven howl
- **Footsteps**: Rhythmic triangle wave bursts
- **State-driven**: Audio parameters respond to visual state (train proximity, rain intensity, etc.)

### Editor (`src/engine/editor/EditorUI.js`)
- **Live/Edit toggle**: Switch between autoplay cinematic and interactive editor
- **Scene Tree**: Hierarchical display of scene graph nodes
- **Module Palette**: Available module types organized by category
- **Properties Panel**: Edit module parameters inline
- **Connections Panel**: Shows compatible growth options, click to organically grow scene
- **Scene Selector**: Switch between scenes with transition

### Pre-built Scenes
1. **mountain-train**: Snowy mountain landscape with red train emerging from tunnel, camera dollying from far to close-up
2. **tokyo-crossing**: Rainy intersection with signal cycle (umbrellas wait → surge → drain), overhead teal train, wet reflections

---

## Architecture for Next Steps

### Immediate Priorities
1. **Grow more module types**: Water, caves, bridges, settlements, creatures
2. **Procedural terrain engine**: Tiled chunk-based terrain with seamless stitching
3. **Rule-based growth system**: Cellular automaton / L-system for organic map expansion
4. **Save/Load**: Serialize scene graphs to JSON, persist to localStorage or backend
5. **Undo/Redo**: Command pattern for editor operations

### Planned Modules
- `water` — Flowing rivers/lakes with reflection shaders
- `cave` — Underground spaces with stalactite generation
- `bridge` — Connecting module with structural rules
- `settlement` — Cluster of buildings with paths
- `forest` — Dense tree clusters with undergrowth
- `creature` — Animated entities with AI behaviors
- `weather` — Dynamic weather system overlay

### Technical Roadmap
- **WebGPU renderer**: Migrate from WebGL to Three.js WebGPURenderer for compute shaders
- **Compute-based terrain**: GPU-driven chunk generation and LOD
- **Spatial audio**: 3D positioned sound sources using WebAudio PannerNode
- **Node-based editor**: Visual programming interface for scene composition
- **Multiplayer**: CRDT-based scene sync for collaborative world building

---

## Running

```bash
npm install
npm run dev        # Local dev server on :5173
npm run build      # Production build to dist/
npm run preview    # Preview production build
```

## Deployment
- GitHub Actions auto-deploys to GitHub Pages on every push to `arena/*` branches
- Vite configured with `base: '/vale/'` for Pages subpath
- Preview URL: `https://{sandboxId}.e2b.app` (live during sessions)

## File Structure
```
vale/
├── public/
│   ├── index.html
│   └── styles/main.css
├── src/
│   ├── main.js                  # Entry point
│   └── engine/
│       ├── Engine.js            # Core renderer + scene management
│       ├── audio/AudioEngine.js # Procedural audio
│       ├── editor/EditorUI.js   # Editor interface
│       ├── modules/             # Procedural module factories
│       │   ├── Mountain.js
│       │   ├── Train.js
│       │   ├── Sky.js
│       │   └── Crossing.js
│       ├── procedural/noise.js  # Simplex noise + FBM
│       ├── scene/
│       │   ├── SceneGraph.js    # Node, Rules, Registry, Manager
│       │   └── scenes.js        # Scene builders
│       └── shaders/
│           ├── linocut.js       # Carved print aesthetic
│           └── grain.js         # Post-processing
├── .github/workflows/deploy.yml
├── docs/HANDOFF.md
├── package.json
└── vite.config.js
```
