// The tile is the fundamental unit of the engine.
//
//   A tile is a modular 3D volume: a cut-away box of city that you can lift
//   out, inspect, and snap next to another tile. Think snow globe, diorama,
//   theatre set. Everything inside is procedural; the frame around it is the
//   only "engine" object and it is deliberately drawn like a physical model:
//   a plinth, four corner posts, wall-thickness caps on the open faces, and a
//   small engraved label.
//
// Coordinate conventions (shared by every module):
//   x → right, y → up, z → toward the viewer.
//   The back wall sits at z = -14, the left wall at x = -15. The open,
//   cut-away faces are +z (front) and +x (right).
//
// Procedural LoD:
//   Every drawable module receives a `detail` object (see `makeDetail`).
//   `lod.js` chooses a level from the tile's projected screen height, or the
//   lab can force one. The level budgets windows, props, crowd, rain and
//   hatch density. Nothing is a separate "low poly model": the same
//   procedural descriptions are sampled more coarsely.

export const TILE = {
  x0: -15, x1: 15,
  z0: -14, z1: 10.5,
  y0: -1.6, y1: 15.6,
  floorY: 0,
  wallX: -15,
  wallZ: -14,
  // Thickness of the shell: the walls, floor slab and cut caps.
  shell: 0.55,
  post: 0.30,
  rail: 0.26,
};

export const SIDEWALK_Y = 0.16;

export const TILE_COLORS = {
  paper: '#08080a',
  void: '#050506',
  floor: '#101012',
  sidewalk: '#1a1a1c',
  sidewalkBack: '#141416',
  road: '#0b0b0d',
  liner: '#222226',
  wall: '#0d0d0f',
  wallFar: '#1a1a1e',
  shell: '#0c0c0e',
  shellEdge: '#dfd7c3',
  bone: '#efe9d8',
  dim: '#66666c',
  red: '#d43b30',
  teal: '#2bb8ae',
  ember: '#d8a03a',
};

// Detail budgets. `screenPx` is the projected height of the tile in pixels.
// The thresholds are deliberately generous: the hero tile should almost always
// run at L0, and LoD should only bite when the camera pulls back or the user
// forces it in the lab to inspect the transition.
export const LOD_LEVELS = [
  {
    level: 0, id: 'hero', screenPx: 520,
    windows: 1.0, windowLight: 1.0, props: 1.0, crowd: 1.0, rain: 1.0,
    hatch: 1.0, signs: 1.0, trees: 1.0, wallDetail: 1.0, puddleDetail: 1.0,
  },
  {
    level: 1, id: 'mid', screenPx: 300,
    windows: 0.55, windowLight: 0.7, props: 0.55, crowd: 0.62, rain: 0.6,
    hatch: 0.55, signs: 0.75, trees: 0.8, wallDetail: 0.5, puddleDetail: 0.7,
  },
  {
    level: 2, id: 'far', screenPx: 0,
    windows: 0.28, windowLight: 0.35, props: 0.22, crowd: 0.3, rain: 0.32,
    hatch: 0.28, signs: 0.5, trees: 0.5, wallDetail: 0.2, puddleDetail: 0.45,
  },
];

export function lodForScreenHeight(px) {
  for (const l of LOD_LEVELS) if (px >= l.screenPx) return l;
  return LOD_LEVELS[LOD_LEVELS.length - 1];
}

export function makeDetail(level) {
  const l = LOD_LEVELS[clampLevel(level)] || LOD_LEVELS[0];
  return {
    ...l,
    atLeast(lv) { return this.level <= lv; },
    windowsCols(cols) { return Math.max(1, Math.round(cols * this.windows)); },
    allowed(fraction, seed = 0) {
      // Deterministic subset sampling for props and people.
      if (fraction >= 0.999) return true;
      const s = Math.sin(seed * 12.9898) * 43758.5453;
      return (s - Math.floor(s)) < fraction;
    },
  };
}

export function clampLevel(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(2, Math.round(n)));
}

// Convenience: y of the walking surface at any x/z inside the tile.
// Sidewalk curbs get a short ramp so crossing feet do not pop.
export function groundYAt(x, z) {
  const front = 4.2;   // ROAD.z1
  const back = -5.0;   // ROAD.z0
  if (z > front) return SIDEWALK_Y;
  if (z < back) return SIDEWALK_Y;
  const d = Math.min(front - z, z - back);
  const t = Math.max(0, Math.min(1, d / 0.55));
  return SIDEWALK_Y * (1 - t);
}

export function tileScreenHeight(camera) {
  const a = camera.project({ x: TILE.x0, y: TILE.y0, z: TILE.z1 });
  const b = camera.project({ x: TILE.x1, y: TILE.y1, z: TILE.z1 });
  if (!a || !b) return 9999;
  return Math.abs(a.y - b.y);
}
