# Vale World Kit — Session Handoff

**Last updated:** 2026-10-27
**Branch:** `arena/d33eb94f-vale`
**Status:** Complete parity pass. Scenes, sets, characters significantly developed. Ready for review.

---

## What Changed This Session

### Camera Rig System (`src/engine/scene/CameraRig.js`)
- **Keyframe-based cinematic sequences** — position, target, FOV, duration, easing
- **Mountain-Train sequence (25s):**
  1. Wide establishing shot [35,16,40] → [0,10,0], FOV 50
  2. Dolly toward mountain [18,8,20] → [5,6,0], FOV 45
  3. **Dramatic close wheel detail** [3,1.5,6] → [0,0.5,0], FOV 70 ← major scale change
  4. Pull back, train entering tunnel [12,5,15] → [8,3,0], FOV 55
  5. Tunnel entrance [15,4,8] → [8,2.5,0], FOV 50
- **Tokyo-Crossing sequence (20s):**
  1. High overview → street level → crossing surge → overhead train → pull back
- **Smooth easing** — smooth, accel, decel per shot
- **Auto-lerp** — camera and controls smoothly interpolate between keyframes

### Train Module — Major Detail Pass
- **Engine:** boiler with 3 metal bands, flared smokestack, 5-slat cow catcher, dual headlights with housings, bell
- **Passenger cars:** arched roof, underbody, body trim line, window dividers (cross mullions), MAIL sign
- **Wheels:** 5-spoke design with hub, all rotate with animation
- **Connecting rods** — visible mechanical linkage between wheels
- **Window flicker** — warm lights pulse and flicker realistically
- **Metaball smoke** — 8 large sculptural cloud puffs that drift, grow, rotate, fade (replaces particle smoke)
- **Snow spray** — 80 particles with gravity, emitted from wheels

### Mountain Module — Ground Detail & Tunnel Interior
- **Train tracks** — dual rails + wooden ties on ground
- **Snow ground** — subtle FBM undulation + carved footprints
- **Tunnel interior** — dark walls/ceiling/floor, **approaching train lights** (pulsing warm glow deep inside, slowly moving forward)

### Crossing Module — Atmosphere & Splashes
- **Rain splashes** — 200 ground-level particles that spawn, expand, fade where rain hits
- **Atmospheric fog** — two haze layers (ground + mid) with slow pulse
- **Building window reflections** — scattered warm/teal dots on wet road
- **Puddle ripples** — animated concentric rings in puddles
- **Lamp posts** — arms, lamp heads, glow spheres, **light pools on ground**
- **Signal pole bases** — proper mounting
- **Umbrella figures** — canopy tip, hook handle, head sphere, 8 ribs

### Engine Integration
- **Camera rig auto-setup** per scene
- **Deep traversal** for nested module updates (tunnel interior inside mountain)
- **Proximity-based audio** — camera distance to train drives rumble/wind
- **FOV animation** — dramatic wide-to-telephoto shifts during close-ups

---

## File Structure
```
src/engine/
├── Engine.js              # Renderer, camera rig, audio, loop
├── scene/
│   ├── CameraRig.js       # NEW — keyframe cinematic system
│   ├── SceneGraph.js      # Node, Rules, Registry, Manager
│   └── scenes.js          # Scene builders
├── modules/
│   ├── Mountain.js        # +tracks, +footprints, +tunnel interior
│   ├── Train.js           # +bands, +flared stack, +cow catcher, +spoke wheels, +flicker, +metaball smoke
│   ├── Sky.js             # 5000 stars, carved clouds
│   ├── Crossing.js        # +splashes, +fog, +reflections, +lamp pools
│   ── Tunnel.js          # Stone arch entrance
├── shaders/
│   ├── linocut.js         # 8-iter gouges, rough edges, registration error
│   └── grain.js           # 3-octave grain, aberration, warm/cool tint
├── procedural/noise.js    # Simplex + FBM + ridged
└── audio/AudioEngine.js   # WebAudio synth
```

---

## Remaining Work (Post-Review)

### Visual
- [ ] LOD system for performance at scale
- [ ] Actual mirror reflection rendering (render target)
- [ ] Train motion blur on close pass
- [ ] More character variety (different heights, coat colors, umbrella patterns)
- [ ] Snow accumulation on surfaces
- [ ] Dynamic weather system

### Systems
- [ ] Undo/redo in editor
- [ ] Save/load scenes to JSON
- [ ] Module parameter inheritance/overrides
- [ ] More module types (water, cave, bridge, creature, settlement)
- [ ] Tile-based terrain with seamless chunk stitching
- [ ] L-system / cellular automaton for organic map growth

### Technical
- [ ] WebGPU renderer migration
- [ ] Compute-shader terrain generation
- [ ] 3D spatial audio (WebAudio PannerNode)
- [ ] Node-based visual editor

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
