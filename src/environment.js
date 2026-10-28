// The set: the volume the tile world stands in.
//
// Painting the city itself lives in cells.js (one tile at a time) and
// buildings.js (one lot at a time). What is left here is everything that is not
// a tile: the walls of the volume, the ground slab, the elevated rail, the wet
// reflections, the case, and the lamp flicker that has to keep moving.
//
// Everything is drawn into the 2D plate through Camera.project(), so the same
// scene can be flown around. Nothing here is screen-space art except glows.

import { PALETTE, glowAt as glowBlit } from './draw.js';
import { grade } from './palette.js';
import {
  v3, clamp, lerp, hash11, hash21, makeRng, quadLerp, smoothstep, TAU,
} from './math.js';
import { TILE, SIDEWALK_Y, TILE_COLORS as C } from './tile.js';
import { LOOP, loopNoise } from './loop.js';
import { HALF_ROAD, TW, TD, STAGE } from './tiles.js';
import { ROAD, LIGHT_SOURCES, PUDDLES } from './world.js';

const RNG = makeRng(20261027);

const BONE = (a = 1) => `rgba(239,233,216,${a})`;
const RED = (a = 1) => `rgba(212,59,48,${a})`;
const TEAL = (a = 1) => `rgba(43,184,174,${a})`;
const EMBER = (a = 1) => `rgba(216,160,58,${a})`;
const DIM = (a = 1) => `rgba(93,105,97,${a})`;

// Neutral charcoal with a whisper of warmth. Keeping green out of the
// structure means teal reads as an accent, not as the whole world's cast.
const SHADE = {
  road: '#0b0b0d',
  roadHi: '#131316',
  roadLo: '#08080a',
  sidewalk: '#1b1b1e',
  sidewalkBack: '#131315',
  sidewalkEdge: '#2a2a2e',
  wall: '#0d0d0f',
  wallHi: '#1d1d21',
  shell: '#0c0c0e',
  cap: '#24242a',
  building: '#0a0a0c',
  buildingHi: '#131316',
};

function rgbaOf(tint, a) {
  if (tint === 'red') return RED(a);
  if (tint === 'teal') return TEAL(a);
  if (tint === 'ember') return EMBER(a);
  return BONE(a);
}

function line3(p, camera, a, b, opts = {}) {
  p.projectLine(camera, [v3(...a), v3(...b)], opts);
}

// A raised slab from an arbitrary plan outline: a prism with a flat top at
// `y`. Used for the corner returns, whose outer corner is rounded rather than
// square, so the pavement edge and the kerb line are the same curve.
function slabPrism(p, camera, pts, y, opts) {
  const n = pts.length;
  // Sides first: a riser is a quad from the outline down to the ground.
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    p.projectPoly(camera, [
      v3(a[0], y, a[1]), v3(b[0], y, b[1]),
      v3(b[0], 0, b[1]), v3(a[0], 0, a[1]),
    ], {
      fill: opts.riser || 'rgba(20,20,24,0.96)', stroke: null,
      jitter: 0.1, seed: (opts.seed || 1) + i,
    });
  }
  p.projectPoly(camera, pts.map(([x, z]) => v3(x, y, z)), {
    fill: opts.fill, stroke: opts.stroke || null, width: opts.width || 0.9,
    jitter: 0.14, seed: opts.seed || 1,
  });
  // Repeat the top edge as a line loop: a stroke on the filled polygon loses
  // itself against the slab tone, and the kerb has to read from every angle.
  if (opts.edge !== false) {
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      p.projectLine(camera, [v3(a[0], y + 0.004, a[1]), v3(b[0], y + 0.004, b[1])], {
        color: opts.stroke || BONE(0.4), width: opts.width || 0.9,
        alpha: 0.85, jitter: 0.12, seed: (opts.seed || 1) + 40 + i, double: false,
      });
    }
  }
}

// Plan outline of a pavement corner return, rounded at the outside corner.
// `kx` is the side kerb (the cell boundary side of the pavement), `bx` the
// building line, `cz` the front or back kerb of the main road, `sgn` +1 toward
// +z. `R` is the kerb radius.
function cornerOutline(kx, bx, cz, sgn, R) {
  const out = kx > 0 ? 1 : -1;
  // Corner centre: one radius back along both kerbs.
  const cx = kx - out * R;
  const cz2 = cz + sgn * R;
  const pts = [[bx, cz]];
  pts.push([cx, cz]);
  for (let k = 1; k <= 3; k++) {
    const a = (k / 3) * Math.PI * 0.5;
    pts.push([cx + out * R * Math.sin(a), cz2 - sgn * R * Math.cos(a)]);
  }
  // The return runs out to the cell edge, where the neighbour's pavement
  // picks it up.
  const farZ = sgn > 0 ? TILE.z1 : TILE.z0;
  pts.push([kx, farZ]);
  pts.push([bx, farZ]);
  return pts;
}

function faceOf(faces, name) {
  return faces.find((f) => f.name === name && f.visible);
}

// Screen-space glow. Used only for emitters (lamps, signs, shopfronts).
function glow(p, x, y, r, rgb, a) {
  // One sprite blit instead of a fresh radial gradient every call (see
  // draw.js). The sprite already carries the falloff profile.
  glowBlit(p.ctx, x, y, r, rgb, a);
}

const RGB = {
  bone: '239,233,216',
  red: '212,59,48',
  teal: '43,184,174',
  ember: '216,160,58',
};

function glowAt(p, camera, point3, radius, tint, alpha) {
  const q = camera.project(point3);
  if (!q) return;
  glow(p, q.x, q.y, radius * q.scale, RGB[tint] || RGB.bone, alpha);
}

// ---------------------------------------------------------------------------
// 1. The case: walls, floor slab, backdrop relief.
// ---------------------------------------------------------------------------

// The closed walls of the volume: back wall + relief + left wall. These are
// cached in their own layer so the elevated train can be drawn between the wall
// and the buildings (it runs behind the block). `params.walls = 0` opens the
// diorama up and drops them entirely.
export function drawWalls(p, camera, detail = { wallDetail: 1 }, params = {}) {
  const { x0, x1, z0, z1, y1 } = TILE;
  const ctx = p.ctx;
  // Bit 1 = back wall, bit 2 = left wall. 0 = open diorama (default).
  const W = params.walls | 0;
  if (!W) return;

  if (W & 1) {
  // Back wall with a vertical gradient so the box has an interior.
  const wallQuad = p.projectPoly(camera, [
    v3(x0, y1, z0), v3(x1, y1, z0), v3(x1, 0, z0), v3(x0, 0, z0),
  ], { fill: null, stroke: null, jitter: 0 });
  if (wallQuad) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(wallQuad[0][0], wallQuad[0][1]);
    for (let i = 1; i < wallQuad.length; i++) ctx.lineTo(wallQuad[i][0], wallQuad[i][1]);
    ctx.closePath();
    ctx.clip();
    const top = camera.project(v3(0, y1, z0));
    const bot = camera.project(v3(0, 0, z0));
    if (top && bot) {
      const g = ctx.createLinearGradient(0, top.y, 0, bot.y);
      g.addColorStop(0, grade(SHADE.wallHi));
      g.addColorStop(0.45, grade(SHADE.wall));
      g.addColorStop(1, grade('#08080a'));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, p.W, p.H);
    }
    // Faint relief: a distant skyline painted on the back wall, like a
    // backdrop flat behind the set.
    const relief = [
      { a: -14.8, b: -9.4, h: 11.5, seed: 1 },
      { a: -8.8, b: -3.2, h: 8.2, seed: 2 },
      { a: -2.6, b: 2.4, h: 12.6, seed: 3 },
      { a: 3.0, b: 8.6, h: 9.4, seed: 4 },
      { a: 9.2, b: 14.8, h: 13.6, seed: 5 },
    ];
    for (const r of relief) {
      p.projectPoly(camera, [
        v3(r.a, r.h, z0 + 0.01), v3(r.b, r.h, z0 + 0.01),
        v3(r.b, 0, z0 + 0.01), v3(r.a, 0, z0 + 0.01),
      ], { fill: 'rgba(30,30,34,0.60)', stroke: BONE(0.05), width: 0.5, jitter: 0.6, seed: 400 + r.seed });
      // Sparse lit windows on the relief.
      for (let i = 0; i < 10; i++) {
        const u = hash11(r.seed * 7.3 + i * 2.7);
        const v = hash11(r.seed * 3.1 + i * 5.3);
        const wx = lerp(r.a + 0.54, r.b - 0.54, u);
        const wy = r.h * (0.12 + v * 0.8);
        const q = camera.project(v3(wx, wy, z0 + 0.02));
        if (!q) continue;
        const s = clamp(q.scale * 0.20, 0.8, 3.2);
        p.rect(q.x - s * 0.5, q.y - s * 0.7, s, s * 1.4, {
          fill: hash11(r.seed * 11.1 + i) > 0.7 ? TEAL(0.16) : BONE(0.13),
          stroke: null, jitter: 0.1, seed: 500 + i,
        });
      }
    }
    ctx.restore();
  }

  // Wall seams and service lines: low contrast, just enough to read as a wall.
  const seams = [-12.0, -8.4, -2.2, 2.6, 6.4, 11.2];
  for (let i = 0; i < seams.length; i++) {
    line3(p, camera, [seams[i], 0, z0 + 0.02], [seams[i], y1 * 0.82, z0 + 0.02], {
      color: BONE(0.045), width: 0.6, jitter: 0.4, seed: 600 + i, double: false,
    });
  }
  for (let i = 1; i < 5; i++) {
    const y = i * 3.1;
    line3(p, camera, [x0, y, z0 + 0.02], [x1, y, z0 + 0.02], {
      color: BONE(0.035), width: 0.55, jitter: 0.5, seed: 610 + i, double: false,
    });
  }
  if ((detail.wallDetail || 1) > 0.4) {
    // Fire-escape / pipe shadow, left of the frame.
    for (let f = 0; f < 3; f++) {
      const fy = 3.0 + f * 3.4;
      line3(p, camera, [-14.6, fy, z0 + 0.05], [-11.6, fy, z0 + 0.05], {
        color: BONE(0.06), width: 0.7, jitter: 0.25, seed: 620 + f, double: false,
      });
      for (let k = 0; k < 5; k++) {
        const fx = lerp(-14.6, -11.6, k / 4);
        line3(p, camera, [fx, fy - 0.7, z0 + 0.05], [fx, fy, z0 + 0.05], {
          color: BONE(0.05), width: 0.5, jitter: 0.2, seed: 630 + f * 5 + k, double: false,
        });
      }
    }
  }
  } // end back wall

  if (W & 2) {
  // Left wall, dimmer: it is the other closed face of the globe.
  const leftQuad = p.projectPoly(camera, [
    v3(x0, y1, z0), v3(x0, y1, z1), v3(x0, 0, z1), v3(x0, 0, z0),
  ], { fill: '#0a0a0c', stroke: null, jitter: 0 });
  if (leftQuad) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(leftQuad[0][0], leftQuad[0][1]);
    for (let i = 1; i < leftQuad.length; i++) ctx.lineTo(leftQuad[i][0], leftQuad[i][1]);
    ctx.closePath();
    ctx.clip();
    const top = camera.project(v3(x0, y1, 0));
    const bot = camera.project(v3(x0, 0, 0));
    if (top && bot) {
      const g = ctx.createLinearGradient(0, top.y, 0, bot.y);
      g.addColorStop(0, grade('#18181c'));
      g.addColorStop(0.5, grade('#0c0c0e'));
      g.addColorStop(1, grade('#070709'));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, p.W, p.H);
    }
    ctx.restore();
  }
  for (let i = 0; i < 6; i++) {
    const z = lerp(z0, z1, (i + 1) / 7);
    line3(p, camera, [x0 + 0.02, 0, z], [x0 + 0.02, y1 * 0.78, z], {
      color: BONE(0.035), width: 0.6, jitter: 0.5, seed: 650 + i, double: false,
    });
  }
  } // end left wall

  // Top edges catch the light, each with its own wall.
  if (W & 1) {
    line3(p, camera, [x0, y1, z0], [x1, y1, z0], {
      color: BONE(0.34), width: 1.1, jitter: 0.18, seed: 660, double: false,
    });
  }
  if (W & 2) {
    line3(p, camera, [x0, y1, z0], [x0, y1, z1], {
      color: BONE(0.22), width: 0.9, jitter: 0.18, seed: 661, double: false,
    });
  }
}

// ---------------------------------------------------------------------------
// 2. Street and sidewalks.
// ---------------------------------------------------------------------------

function groundHatch(p, camera, x0, z0, x1, z1, y, count, seed, color, alpha, maxLen = 4) {
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const z = lerp(z0, z1, t) + (hash11(seed + i * 3.1) - 0.5) * ((z1 - z0) / count) * 0.8;
    const xa = x0 + hash11(seed + i * 7.7) * (x1 - x0) * 0.5;
    const len = maxLen * (0.35 + hash11(seed + i * 5.3) * 0.9);
    p.projectLine(camera, [
      v3(xa, y, z), v3(Math.min(x1, xa + len), y, z),
    ], {
      color, width: 0.45 + hash11(seed + i) * 0.5, alpha: alpha * (0.5 + hash11(seed + i * 2.2) * 0.7),
      jitter: 0.16, seed: seed + i * 11, double: false,
    });
  }
}

// Ground slab top (under everything, closes gaps at the sidewalk joins).
export function drawGroundSlab(p, camera) {
  const { x0, x1, z0, z1 } = TILE;
  p.projectPoly(camera, [
    v3(x0, -0.01, z0), v3(x1, -0.01, z0), v3(x1, -0.01, z1), v3(x0, -0.01, z1),
  ], { fill: '#0a0a0c', stroke: null, jitter: 0, alpha: 1 });
}

// Kept for older call sites (tools, drawEnvironment).
export function drawBackdrop(p, camera, detail = { wallDetail: 1 }, params = {}) {
  drawGroundSlab(p, camera);
  drawWalls(p, camera, detail, params);
}


export function drawRail(p, camera) {
  const y = 10.15;
  const z = -STAGE.hz;
  // Beam and rails; the train rides just above this.
  p.box(camera, [0, y, z], [TILE.x1 - TILE.x0, 0.35, 2.0], {
    fill: '#0a0f0c', stroke: BONE(0.30), width: 0.9, alpha: 0.95,
    seed: 3800, jitter: 0.2, edgeAlpha: 0.65,
  });
  for (const zz of [z - 0.62, z + 0.62]) {
    line3(p, camera, [TILE.x0, y + 0.2, zz], [TILE.x1, y + 0.2, zz], {
      color: BONE(0.42), width: 0.8, alpha: 0.85,
      jitter: 0.16, seed: 3810 + zz, double: false,
    });
  }
  // Columns, mostly hidden behind the buildings.
  for (const cx of [-28.5, -19.5, -10.5, -1.5, 7.5, 16.5, 25.5]) {
    line3(p, camera, [cx, 0, z], [cx, y - 0.2, z], {
      color: BONE(0.16), width: 0.9, alpha: 0.7, jitter: 0.16, seed: 3820 + cx, double: false,
    });
  }
  // Catenary wire above the track.
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    pts.push(v3(lerp(TILE.x0 + 0.2, TILE.x1 - 0.2, t), y + 2.5 - Math.sin(t * Math.PI) * 0.25, z));
  }
  p.projectLine(camera, pts, {
    color: BONE(0.22), width: 0.55, alpha: 0.8, jitter: 0.1, seed: 3830, double: false,
  });
}

// ---------------------------------------------------------------------------
// 7. Wet reflections from the light sources.
// ---------------------------------------------------------------------------

export function drawReflections(p, camera, timeline, detail = { puddleDetail: 1 }) {
  const t = timeline && timeline.t ? timeline.t : 0;
  const kerb = ROAD.z0 - 0.35;
  for (let i = 0; i < LIGHT_SOURCES.length; i++) {
    const l = LIGHT_SOURCES[i];
    const onBack = l.z < ROAD.z0;
    if (detail.puddleDetail < 0.5 && i % 2) continue;
    const colA = l.color === 'red' ? RED : l.color === 'teal' ? TEAL : BONE;
    const flicker = 0.74 + 0.26 * Math.sin(t * 2.0 + i * 1.7);
    const baseY = onBack ? 0.028 : 0.028;
    const zStart = onBack ? kerb : l.z + 0.25;
    const len = onBack ? 4.6 + hash11(l.seed) * 4.2 : 2.4 + hash11(l.seed) * 2.0;
    const width0 = onBack ? l.w * 0.62 : l.w * 0.5;

    // The smear itself: a floor-hugging wedge that tapers as it reaches us.
    const steps = 8;
    for (let k = 0; k < steps; k++) {
      const t0 = k / steps, t1 = (k + 1) / steps;
      const z0 = zStart + t0 * len;
      const z1 = zStart + t1 * len;
      const w0 = width0 * (1 - t0 * 0.45);
      const w1 = width0 * (1 - t1 * 0.45);
      const dx0 = Math.sin(t0 * 6.3 + i * 1.9) * 0.30;
      const dx1 = Math.sin(t1 * 6.3 + i * 1.9) * 0.30;
      p.projectPoly(camera, [
        v3(l.x - w0 + dx0, baseY, z0), v3(l.x + w0 + dx0, baseY, z0),
        v3(l.x + w1 + dx1, baseY, z1), v3(l.x - w1 + dx1, baseY, z1),
      ], {
        fill: colA(0.075 * flicker * (1 - t0 * 0.55)),
        stroke: null, jitter: 0.4, seed: 3900 + i * 10 + k,
      });
    }
    // Bright broken strokes: the reflection is chopped by the asphalt grain.
    for (let k = 0; k < 7; k++) {
      const u = hash11(l.seed + k * 2.3);
      const zz = zStart + 0.3 + u * len;
      const ww = width0 * (0.22 + hash11(l.seed + k) * 0.5) * (1 - u * 0.5);
      const xo = Math.sin(u * 6.3 + i) * 0.3;
      line3(p, camera, [l.x - ww + xo, baseY + 0.004, zz], [l.x + ww * 0.7 + xo, baseY + 0.004, zz], {
        color: colA(0.30 * flicker), width: 0.8 + hash11(l.seed + k * 3) * 0.7,
        alpha: 0.85, jitter: 0.25, seed: 3950 + i * 9 + k, double: false,
      });
    }
    // A pool of light where the source meets the pavement.
    const pool = camera.project(v3(l.x, 0.03, onBack ? kerb + 0.4 : l.z + 0.4));
    if (pool) glow(p, pool.x, pool.y, pool.scale * (onBack ? 2.2 : 1.6), RGB[l.color] || RGB.bone, 0.10 * flicker);
  }

}

// ---------------------------------------------------------------------------
// 8. The frame: plinth, posts, rails, cut caps, engraved label.
// ---------------------------------------------------------------------------


// The case is a physical object, so it has to take part in the depth sort like
// everything else inside the volume. These builders return drawables that the
// scene merges into its sorted list: a frame member in front of a building now
// occludes it, and one behind it is occluded.

export function collectFrame(p, camera, params = {}) {
  if (params.caseFrame === 0) return [];
  const { x0, x1, z0, z1, y0, y1 } = TILE;
  const s = TILE.shell;
  const items = [];

  const depthAt = (x, y, z) => {
    const q = camera.project(v3(x, y, z));
    return q && Number.isFinite(q.depth) ? q.depth : 1e6;
  };
  const add = (x, y, z, draw, bias = 0, group = 'near') => {
    items.push({ depth: depthAt(x, y, z) + bias, draw, group });
  };

  // --- glass: the boundary is a pane, never a frame -----------------------
  //
  // Four sides and a lid, each a single translucent plane with a soft gradient
  // and one diagonal sheen. No posts, no rails, no cut caps: hardware on the
  // edge would read as a frame around one cell, and cells have to butt
  // together without a seam for the neighbouring tiles (and LoD) to work.
  const W = x1 - x0, D = z1 - z0;
  const pane = (pts, seed, a0, a1, group, bias = 0) => {
    let cx = 0, cy = 0, cz = 0;
    for (const q of pts) { cx += q.x; cy += q.y; cz += q.z; }
    cx /= pts.length; cy /= pts.length; cz /= pts.length;
    add(cx, cy, cz, (pp) => {
      pp.poly(pts, {
        gradient: [[0, TEAL(a0)], [0.72, TEAL((a0 + a1) * 0.5)], [1, TEAL(a1)]],
        gradientDir: 'v', stroke: null, jitter: 0.12, seed,
      });
    }, bias, group);
  };
  const sheen = (a3, b3, c3, d3, seed, alpha, group, bias = 0) => {
    const cx = (a3.x + b3.x + c3.x + d3.x) / 4;
    const cy = (a3.y + b3.y + c3.y + d3.y) / 4;
    const cz = (a3.z + b3.z + c3.z + d3.z) / 4;
    add(cx, cy, cz, (pp) => {
      pp.poly([a3, b3, c3, d3], {
        fill: BONE(alpha), stroke: null, jitter: 0.16, seed,
      });
    }, bias, group);
  };

  // Closed sides first (behind the set).
  pane([v3(x0, y0, z0), v3(x1, y0, z0), v3(x1, y1, z0), v3(x0, y1, z0)],
    4700, 0.055, 0.135, 'far', 0.4);
  sheen(v3(x0 + W * 0.22, y1, z0), v3(x0 + W * 0.34, y1, z0),
    v3(x0 + W * 0.10, y0, z0), v3(x0 + W * 0.02, y0, z0), 4701, 0.035, 'far', 0.3);
  pane([v3(x0, y0, z0), v3(x0, y0, z1), v3(x0, y1, z1), v3(x0, y1, z0)],
    4702, 0.05, 0.12, 'far', 0.4);
  sheen(v3(x0, y1, z0 + D * 0.24), v3(x0, y1, z0 + D * 0.36),
    v3(x0, y0, z0 + D * 0.10), v3(x0, y0, z0 + D * 0.02), 4703, 0.03, 'far', 0.3);

  // Open sides and the lid last (in front of the set). They only tint, so the
  // film still reads through them.
  pane([v3(x0, y0, z1), v3(x1, y0, z1), v3(x1, y1, z1), v3(x0, y1, z1)],
    4704, 0.012, 0.05, 'near', -0.6);
  sheen(v3(x1 - W * 0.18, y1, z1), v3(x1 - W * 0.30, y1, z1),
    v3(x1 - W * 0.06, y0, z1), v3(x1 + W * 0.02, y0, z1), 4705, 0.028, 'near', -0.7);
  pane([v3(x1, y0, z0), v3(x1, y0, z1), v3(x1, y1, z1), v3(x1, y1, z0)],
    4706, 0.012, 0.045, 'near', -0.6);
  pane([v3(x0, y1, z0), v3(x1, y1, z0), v3(x1, y1, z1), v3(x0, y1, z1)],
    4707, 0.01, 0.022, 'near', -0.8);

  // --- the near slab face: what the streets sit on -------------------------
  add((x0 + x1) / 2, 0, z1, (pp) => {
    pp.projectPoly(camera, [
      v3(x0, y0, z1), v3(x1, y0, z1), v3(x1, -0.10, z1), v3(x0, -0.10, z1),
    ], { fill: 'rgba(34,34,39,0.98)', stroke: null, jitter: 0.14, seed: 4320 });
    pp.projectPoly(camera, [
      v3(x0, -0.10, z1), v3(x1, -0.10, z1), v3(x1, SIDEWALK_Y, z1), v3(x0, SIDEWALK_Y, z1),
    ], { fill: 'rgba(62,62,68,0.98)', stroke: null, jitter: 0.14, seed: 4321 });
  }, 0.3, 'far');

  // No plinth and no label plate: the case is glass and planes, so the volume
  // stands on its own floor slab instead of on furniture. Anything along an
  // edge would read as a frame around a single cell.

  return items;
}

// Lamp flicker is the one thing in the set that keeps moving, so it is drawn
// over the cached layer instead of being baked into it. `loopNoise` is seamless
// over the loop, so the flicker repeats exactly every 20 s.
export function drawFlicker(p, camera, t) {
  for (let i = 0; i < LIGHT_SOURCES.length; i++) {
    const l = LIGHT_SOURCES[i];
    const q = camera.project(v3(l.x, 2.0, l.z));
    if (!q) continue;
    const n = loopNoise(100 + i, t, LOOP, 3);
    const a = 0.05 + 0.045 * (n * 0.5 + 0.5);
    glow(p, q.x, q.y, q.scale * l.w * 1.15, RGB[l.color] || RGB.bone, a);
  }
}

// Backwards-compatible single-pass draw (used by drawEnvironment and tools).
export function drawFrameBack(p, camera) {
  for (const it of collectFrame(p, camera).filter((i) => i.group === 'far')) it.draw(p);
}

export function drawFrameFront(p, camera) {
  for (const it of collectFrame(p, camera).filter((i) => i.group === 'near')) it.draw(p);
}

// ---------------------------------------------------------------------------
// Compatibility: the whole static set in one call.
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// The whole non-tile part of the set, in order.
// ---------------------------------------------------------------------------

export function drawEnvironment(p, camera, timeline, params, detail) {
  drawBackdrop(p, camera, detail);
  drawGroundSlab(p, camera);
  drawRail(p, camera);
  drawReflections(p, camera, timeline, detail);
  drawFrameBack(p, camera);
  drawFrameFront(p, camera);
}
