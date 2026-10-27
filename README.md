# Vale — Procedural World Kit

A modular world-building engine for stylized procedural environments. Built on Three.js, WebAudio, and custom GLSL shaders — zero external assets.

**Live demo:** [GitHub Pages](https://bashmaester.github.io/vale/)

## Features

- **Procedural rendering** — Linocut/woodcut print aesthetic via custom shaders
- **Modular scene graph** — Node-based composition with connection rules
- **Organic growth** — Expand environments through compatible module connections
- **Procedural audio** — All sound synthesized via WebAudio, tied to visual state
- **Live + Edit modes** — Toggle between cinematic autoplay and interactive editor
- **Zero assets** — Everything generated in code

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`

## Controls

- **Live View**: Camera auto-animates through scene
- **Edit Mode**: Click "Edit Mode" to open scene tree, module palette, and properties
- **Orbit**: Click + drag to orbit camera (edit mode)
- **Scene Selector**: Switch between pre-built scenes

## Modules

| Module | Description |
|--------|-------------|
| Mountain | Carved terrain with peaks, tunnels, forest |
| Train | Red linocut train with smoke particles |
| Sky | Star field with carved cloud wisps |
| Crossing | Rainy intersection with signal cycles |

## Architecture

```
Engine → Scene Manager → Scene Graph → Modules
                                    ↕
                              Connection Rules
                                    ↕
                              Registry (growth)
```

See `docs/HANDOFF.md` for full technical details.
