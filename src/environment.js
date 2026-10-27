// The set: one cut-away city tile.
//
// Construction order is the same as the idea of the place:
//   1. the case — back wall, left wall, ground slab, cut faces,
//   2. the street — asphalt, kerbs, two raised sidewalks,
//   3. the markings — zebra, stop lines, arrows, patching, drains,
//   4. the buildings — four lots with lit windows, shopfronts, signs, roofs,
//   5. the furniture — signals, lamps, wires, tree, vending machine, bicycles,
//   6. the boundary — glass panes and a lid on the plinth, no posts or rails.
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
import {
  ROAD, SIDEWALKS, CROSSWALKS, LANES, SIGNAL_POSITIONS, BUILDING_LOTS,
  LIGHT_SOURCES, PUDDLES,
} from './world.js';

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

export function drawStreet(p, camera, detail = { hatch: 1 }) {
  const { x0, x1, z1 } = TILE;
  const rx0 = ROAD.x0, rx1 = ROAD.x1, rz0 = ROAD.z0, rz1 = ROAD.z1;

  // Asphalt with a subtle crown: overlapping bands rather than one flat fill.
  p.groundQuad(camera, rx0, rz0, rx1, rz1, { fill: '#101215', stroke: null, jitter: 0, y: 0.0 });
  p.groundQuad(camera, rx0, rz0 + 0.4, rx1, 1.4, {
    fill: 'rgba(30,32,37,0.55)', stroke: null, jitter: 0.4, y: 0.006,
  });
  // Damp gradient: the far lane catches the shopfronts, the near lane the sky.
  p.groundQuad(camera, rx0, rz0, rx1, rz0 + 2.4, {
    fill: 'rgba(58,54,50,0.26)', stroke: null, jitter: 0.6, y: 0.009,
  });
  p.groundQuad(camera, rx0, rz1 - 2.2, rx1, rz1, {
    fill: 'rgba(40,42,46,0.22)', stroke: null, jitter: 0.6, y: 0.009,
  });

  // Asphalt grain: long, uneven, mostly horizontal strokes.
  const hatch = detail.hatch == null ? 1 : detail.hatch;
  groundHatch(p, camera, rx0, rz0 + 0.2, rx1, -0.4, 0.012, Math.round(40 * hatch), 1200, BONE(0.16), 0.55, 5.5);
  groundHatch(p, camera, rx0, 0.4, rx1, rz1 - 0.2, 0.012, Math.round(36 * hatch), 1400, BONE(0.13), 0.5, 5.0);
  // Dark tar patches.
  for (let i = 0; i < 4; i++) {
    const px = -12.5 + i * 7.1;
    const pz = 1.9 - i * 1.4;
    p.projectPoly(camera, [
      v3(px - 1.5, 0.014, pz - 0.5), v3(px + 1.08, 0.014, pz - 0.66),
      v3(px + 1.62, 0.014, pz + 0.32), v3(px - 0.62, 0.014, pz + 0.52),
    ], {
      fill: 'rgba(4,6,5,0.55)', stroke: BONE(0.05), width: 0.5,
      jitter: 0.7, seed: 1500 + i,
    });
  }

  // Wet sheen: broad, low-alpha bands following the lane direction.
  for (let i = 0; i < 3; i++) {
    const z = -3.0 + i * 2.9;
    p.projectPoly(camera, [
      v3(rx0, 0.016, z - 0.8), v3(rx1, 0.016, z - 0.55),
      v3(rx1, 0.016, z + 0.62), v3(rx0, 0.016, z + 0.86),
    ], {
      fill: i === 1 ? 'rgba(43,184,174,0.055)' : 'rgba(239,233,216,0.045)',
      stroke: null, jitter: 0.5, seed: 1550 + i,
    });
  }

  // Two raised sidewalks. The far one reads darker so the near one holds the eye.
  for (const s of SIDEWALKS) {
    const isFront = s.id === 'FRONT';
    const cx = (s.x0 + s.x1) / 2;
    const cz = (s.z0 + s.z1) / 2;
    const w = s.x1 - s.x0;
    const d = s.z1 - s.z0;
    const faces = p.box(camera, [cx, SIDEWALK_Y / 2, cz], [w, SIDEWALK_Y, d], {
      fill: isFront ? '#232327' : '#17171a',
      stroke: BONE(isFront ? 0.50 : 0.36),
      width: isFront ? 1.05 : 0.85,
      alpha: 1, seed: isFront ? 1600 : 1650, jitter: 0.16,
      edgeAlpha: isFront ? 0.9 : 0.7,
    });
    const top = faceOf(faces, 'top');
    if (top) {
      // Slab tone variation.
      p.poly(top.quad, {
        fill: isFront ? 'rgba(44,44,49,0.34)' : 'rgba(32,32,36,0.30)',
        stroke: null, jitter: 0.8, seed: isFront ? 1610 : 1660,
      });
    }
  }

  // Wet apron along the near kerb: the brightest ground in the shot, because
  // it is where the crowd's feet and the light reflections meet.
  p.groundQuad(camera, rx0, ROAD.z1 - 1.5, rx1, ROAD.z1, {
    fill: 'rgba(60,58,58,0.20)', stroke: null, jitter: 0.5, y: 0.010,
  });

  // Kerb faces: a bright top edge and a darker riser, with stone ticks.
  for (const [z, dir] of [[rz1, 1], [rz0, -1]]) {
    line3(p, camera, [rx0, SIDEWALK_Y, z], [rx1, SIDEWALK_Y, z], {
      color: BONE(0.62), width: 1.5, alpha: 0.85, jitter: 0.14, seed: 1700 + z, double: false,
    });
    line3(p, camera, [rx0, 0.015, z], [rx1, 0.015, z], {
      color: BONE(0.20), width: 1.0, alpha: 0.7, jitter: 0.2, seed: 1710 + z, double: false,
    });
    for (let x = x0 + 1.4; x < x1; x += 1.55) {
      line3(p, camera, [x, 0.01, z], [x, SIDEWALK_Y - 0.01, z], {
        color: BONE(0.16), width: 0.55, alpha: 0.65,
        jitter: 0.12, seed: 1720 + x * 3 + dir, double: false,
      });
    }
  }

  // Kerb ramps at the crossing: a lighter wedge on both kerbs.
  const cw = CROSSWALKS.main;
  for (const [z, sgn] of [[rz1, 1], [rz0, -1]]) {
    p.projectPoly(camera, [
      v3(cw.x0, SIDEWALK_Y + 0.004, z + sgn * 0.02),
      v3(cw.x1, SIDEWALK_Y + 0.004, z + sgn * 0.02),
      v3(cw.x1, 0.02, z + sgn * 0.74),
      v3(cw.x0, 0.02, z + sgn * 0.74),
    ], {
      fill: 'rgba(239,233,216,0.055)', stroke: BONE(0.30), width: 0.7,
      jitter: 0.35, seed: 1760 + sgn,
    });
  }
}

function paving(p, camera, s, detail, seed) {
  const hatch = detail.hatch == null ? 1 : detail.hatch;
  const y = SIDEWALK_Y + 0.004;
  const front = s.id === 'FRONT';
  const bandH = front ? 1.05 : 1.35;
  const rows = Math.max(2, Math.round((s.z1 - s.z0) / bandH));
  // Long, slightly wavy slab joints running along the street.
  for (let r = 1; r < rows; r++) {
    const z = lerp(s.z0, s.z1, r / rows);
    const xa = s.x0 + 0.4, xb = s.x1 - 0.4;
    const segs = 3;
    for (let k = 0; k < segs; k++) {
      const x0 = lerp(xa, xb, k / segs);
      const x1 = lerp(xa, xb, (k + 1) / segs);
      if (hash11(seed + r * 13.1 + k * 7.7) > (front ? 0.86 : 0.7)) continue;
      p.projectLine(camera, [
        v3(x0, y, z + (hash11(seed + r + k) - 0.5) * 0.14),
        v3(lerp(x0, x1, 0.5), y, z + (hash11(seed + r * 2 + k) - 0.5) * 0.2),
        v3(x1, y, z + (hash11(seed + r * 3 + k) - 0.5) * 0.14),
      ], {
        color: BONE(front ? 0.30 : 0.17), width: 0.65,
        alpha: 0.55 + hash11(seed + r * 5 + k) * 0.35,
        jitter: 0.22, seed: seed + r * 31 + k, double: false,
      });
    }
  }
  // Sparse short cross joints, offset band to band.
  const cols = Math.max(3, Math.round((s.x1 - s.x0) / (front ? 3.4 : 4.4)));
  for (let c = 1; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (hash11(seed + c * 9.3 + r * 2.1) > (front ? 0.55 : 0.4)) continue;
      const x = lerp(s.x0, s.x1, c / cols) + (hash11(seed + r * 3) - 0.5) * 0.5;
      const za = lerp(s.z0, s.z1, r / rows);
      const zb = lerp(s.z0, s.z1, (r + 1) / rows);
      p.projectLine(camera, [v3(x, y, za + 0.08), v3(x, y, zb - 0.08)], {
        color: BONE(front ? 0.22 : 0.13), width: 0.5, alpha: 0.65,
        jitter: 0.2, seed: seed + c * 17 + r, double: false,
      });
    }
  }
  // Wear marks and cracks.
  const cracks = Math.round(16 * hatch);
  for (let i = 0; i < cracks; i++) {
    const x = lerp(s.x0 + 1, s.x1 - 1, hash11(seed + i * 11.3));
    const z = lerp(s.z0 + 0.5, s.z1 - 0.5, hash11(seed + i * 5.9));
    const len = 0.8 + hash11(seed + i * 2.1) * 2.2;
    p.projectLine(camera, [
      v3(x, y, z), v3(x + len * 0.6, y, z + len * 0.2), v3(x + len, y, z - len * 0.3),
    ], {
      color: BONE(0.11), width: 0.45, alpha: 0.75,
      jitter: 0.3, seed: seed + i * 13, double: false,
    });
  }
  // A few damp patches, tinted to the nearest sign.
  for (let i = 0; i < 4; i++) {
    const x = lerp(s.x0 + 2, s.x1 - 2, hash11(seed + 60 + i * 4.7));
    const z = lerp(s.z0 + 0.8, s.z1 - 0.8, hash11(seed + 70 + i * 3.1));
    const rx = 0.9 + hash11(seed + 80 + i) * 1.4;
    const rz = 0.35 + hash11(seed + 90 + i) * 0.5;
    p.projectPoly(camera, [
      v3(x - rx, y, z - rz), v3(x + rx * 0.82, y, z - rz * 0.7),
      v3(x + rx, y, z + rz), v3(x - rx * 0.9, y, z + rz * 0.8),
    ], {
      fill: i % 3 === 0 ? TEAL(0.045) : BONE(0.03), stroke: null, jitter: 0.4, seed: seed + 100 + i,
    });
  }
}

export function drawPaving(p, camera, detail = { hatch: 1 }) {
  paving(p, camera, SIDEWALKS[1], detail, 1800);
  paving(p, camera, SIDEWALKS[0], detail, 1900);

  // Tactile strip and dots at the crossing (front sidewalk only).
  const cw = CROSSWALKS.main;
  const y = SIDEWALK_Y + 0.006;
  p.projectPoly(camera, [
    v3(cw.x0 + 0.15, y, ROAD.z1 + 0.25), v3(cw.x1 - 0.15, y, ROAD.z1 + 0.25),
    v3(cw.x1 - 0.15, y, ROAD.z1 + 1.15), v3(cw.x0 + 0.15, y, ROAD.z1 + 1.15),
  ], {
    fill: 'rgba(239,233,216,0.06)', stroke: BONE(0.26), width: 0.6,
    jitter: 0.3, seed: 2000,
  });
  const dots = detail.hatch > 0.5 ? 24 : 10;
  for (let i = 0; i < dots; i++) {
    const u = (i % 6 + 0.5) / 6;
    const v = (Math.floor(i / 6) + 0.5) / (dots / 6);
    const q = camera.project(v3(lerp(cw.x0 + 0.3, cw.x1 - 0.3, u), y, lerp(ROAD.z1 + 0.36, ROAD.z1 + 1.04, v)));
    if (!q) continue;
    const r = clamp(q.scale * 0.035, 0.5, 2.2);
    p.ellipse(q.x, q.y, r, r * 0.6, { fill: BONE(0.30), stroke: false, alpha: 0.8 });
  }

  // Drain grates along the near kerb.
  for (const gx of [-11.6, -6.4, 2.2, 10.8]) {
    p.projectPoly(camera, [
      v3(gx - 0.55, 0.02, ROAD.z1 - 0.42), v3(gx + 0.55, 0.02, ROAD.z1 - 0.42),
      v3(gx + 0.55, 0.02, ROAD.z1 - 0.06), v3(gx - 0.55, 0.02, ROAD.z1 - 0.06),
    ], {
      fill: 'rgba(4,6,5,0.9)', stroke: BONE(0.30), width: 0.6,
      jitter: 0.2, seed: 2050 + gx,
    });
    for (let k = 0; k < 4; k++) {
      const x = gx - 0.42 + k * 0.28;
      line3(p, camera, [x, 0.025, ROAD.z1 - 0.38], [x, 0.025, ROAD.z1 - 0.10], {
        color: BONE(0.18), width: 0.5, alpha: 0.8,
        jitter: 0.1, seed: 2060 + gx + k, double: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Road markings.
// ---------------------------------------------------------------------------

export function drawRoadMarkings(p, camera, timeline = { empty: () => 0 }) {
  const cw = CROSSWALKS.main;
  const y = 0.022;

  // Zebra bars: long along x, repeated along z. Worn, uneven edges.
  const bars = 8;
  for (let i = 0; i < bars; i++) {
    const t = (i + 0.5) / bars;
    const z = lerp(cw.z0 + 0.28, cw.z1 - 0.28, t);
    const inset = 0.12 + hash11(300 + i) * 0.18;
    // Worn paint: duller than a road sign, and broken by dark scuffs. Bright
    // bars fight the umbrellas and the lit windows for attention.
    const alpha = 0.46 + hash11(310 + i) * 0.16;
    p.projectPoly(camera, [
      v3(cw.x0 + inset, y, z - 0.26), v3(cw.x1 - inset, y, z - 0.26),
      v3(cw.x1 - inset, y, z + 0.26), v3(cw.x0 + inset, y, z + 0.26),
    ], {
      fill: BONE(alpha), stroke: BONE(Math.min(0.62, alpha * 1.05)), width: 0.7,
      jitter: 0.34, seed: 320 + i,
    });
    // Scuffs across the bar.
    for (let k = 0; k < 3; k++) {
      const u = 0.14 + hash11(330 + i * 3 + k) * 0.7;
      const sx = lerp(cw.x0, cw.x1, u);
      const w = 0.16 + hash11(340 + i * 5 + k) * 0.22;
      p.projectPoly(camera, [
        v3(sx - w, y + 0.002, z - 0.27), v3(sx + w, y + 0.002, z - 0.27),
        v3(sx + w, y + 0.002, z + 0.27), v3(sx - w, y + 0.002, z + 0.27),
      ], { fill: 'rgba(17,19,22,0.82)', stroke: null, jitter: 0.4, seed: 350 + i * 7 + k });
    }
  }

  // Stop lines: eastbound before the crossing on the near lane, westbound on
  // the far lane, each on its own side of the centre line.
  p.projectPoly(camera, [
    v3(cw.x0 - 0.92, y, 0.18), v3(cw.x0 - 0.52, y, 0.18),
    v3(cw.x0 - 0.52, y, ROAD.z1 - 0.25), v3(cw.x0 - 0.92, y, ROAD.z1 - 0.25),
  ], { fill: BONE(0.46), stroke: BONE(0.5), width: 0.6, jitter: 0.25, seed: 340 });
  p.projectPoly(camera, [
    v3(cw.x1 + 0.42, y, ROAD.z0 + 0.25), v3(cw.x1 + 0.82, y, ROAD.z0 + 0.25),
    v3(cw.x1 + 0.82, y, -0.18), v3(cw.x1 + 0.42, y, -0.18),
  ], { fill: BONE(0.42), stroke: BONE(0.46), width: 0.6, jitter: 0.25, seed: 341 });

  // Centre line, broken through the crossing.
  line3(p, camera, [ROAD.x0, y, 0], [cw.x0 - 0.5, y, 0], {
    color: BONE(0.34), width: 0.95, alpha: 0.8,
    dash: [66, 14], jitter: 0.2, seed: 350, double: false,
  });
  line3(p, camera, [cw.x1 + 0.5, y, 0], [ROAD.x1, y, 0], {
    color: BONE(0.34), width: 0.95, alpha: 0.8,
    dash: [68, 14], jitter: 0.2, seed: 351, double: false,
  });

  // Kerb-side edge lines and broken lane dividers.
  for (const l of LANES) {
    const edgeZ = l.offset + l.dir * 1.75;
    line3(p, camera, [ROAD.x0, y, edgeZ], [cw.x0 - 0.8, y, edgeZ], {
      color: BONE(0.26), width: 0.8, alpha: 0.8,
      jitter: 0.2, seed: 360 + l.offset, double: false,
    });
    line3(p, camera, [cw.x1 + 0.8, y, edgeZ], [ROAD.x1, y, edgeZ], {
      color: BONE(0.26), width: 0.8, alpha: 0.8,
      jitter: 0.2, seed: 370 + l.offset, double: false,
    });
    // Lane divider dashes on the open road either side of the crossing.
    for (const [xa, xb] of [[ROAD.x0, cw.x0 - 1.2], [cw.x1 + 1.2, ROAD.x1]]) {
      line3(p, camera, [xa, y + 0.002, l.offset], [xb, y + 0.002, l.offset], {
        color: BONE(0.34), width: 0.9, alpha: 0.85,
        dash: [62, 14], jitter: 0.18, seed: 375 + l.offset, double: false,
      });
    }
  }

  // Direction arrows, one per lane, drawn as thin open chevrons.
  for (const l of LANES) {
    const ax = l.dir > 0 ? -9.2 : 5.2;
    const s = l.dir;
    p.projectLine(camera, [
      v3(ax - s * 0.9, y, l.offset - 0.62),
      v3(ax + s * 0.55, y, l.offset),
      v3(ax - s * 0.9, y, l.offset + 0.62),
    ], {
      color: BONE(0.24), width: 0.9, alpha: 0.8,
      jitter: 0.2, seed: 380 + l.offset, double: false,
    });
  }

  // Manholes and a couple of utility covers.
  for (const [mx, mz, r] of [[-11.2, 2.6, 0.62], [4.2, -2.8, 0.58], [12.4, 2.1, 0.5], [-6.8, -2.4, 0.45]]) {
    const q = camera.project(v3(mx, 0.03, mz));
    if (!q) continue;
    const rr = r * q.scale;
    p.ellipse(q.x, q.y, rr, rr * 0.34, {
      fill: 'rgba(8,9,11,0.92)', stroke: BONE(0.16), width: 0.6, alpha: 0.9,
    });
    p.ellipse(q.x, q.y, rr * 0.58, rr * 0.19, {
      stroke: BONE(0.11), width: 0.5, alpha: 0.7,
    });
  }

  // Skid / wear streaks along the lanes.
  for (let i = 0; i < 7; i++) {
    const z = (i % 2 ? 1 : -1) * (1.2 + hash11(400 + i) * 0.9);
    const xa = -14.2 + hash11(410 + i) * 10;
    const len = 4 + hash11(420 + i) * 7;
    line3(p, camera, [xa, 0.018, z], [xa + len, 0.018, z + (hash11(430 + i) - 0.5) * 0.3], {
      color: i % 3 === 0 ? BONE(0.055) : RED(0.045), width: 0.8 + hash11(440 + i) * 1.2,
      alpha: 0.55, jitter: 0.25, seed: 450 + i, double: false,
    });
  }
}

// ---------------------------------------------------------------------------
// 4. Buildings.
// ---------------------------------------------------------------------------

function facadeGrid(p, camera, b, face, detail, seed) {
  const cols = Math.max(1, Math.round((detail.windows == null ? 1 : detail.windows) * b.cols));
  const rows = Math.max(1, Math.round((detail.windows == null ? 1 : detail.windows) * b.rows));
  const lit = detail.windowLight == null ? 1 : detail.windowLight;
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const h = hash21(c * 3.7 + seed, r * 5.1 + b.h);
      const u0 = (c + 0.16) / cols, u1 = (c + 0.84) / cols;
      const v0 = (r + 0.16) / rows, v1 = (r + 0.66) / rows;
      const quad = [quadLerp(face.quad, u0, v0), quadLerp(face.quad, u1, v0),
        quadLerp(face.quad, u1, v1), quadLerp(face.quad, u0, v1)];
      // Most windows are dark glass with a faint reflection. Only a minority
      // are lit, and those are warm. That is what stops the grid reading as
      // a spreadsheet.
      const isLit = h < 0.26 * lit;
      const fill = isLit
        ? (h < 0.05 ? 'rgba(216,160,58,0.62)' : 'rgba(239,233,216,0.42)')
        : (hash21(c + 4.1, r + 8.3) > 0.72 ? 'rgba(43,184,174,0.18)' : 'rgba(9,12,13,0.92)');
      out.push({ pts: quad, fill, stroke: BONE(isLit ? 0.48 : 0.22), width: 0.5 });
      // Mullion: a vertical bar through the middle of each window.
      if (detail.windows > 0.5) {
        out.push({ line: [quadLerp(face.quad, (u0 + u1) / 2, v0), quadLerp(face.quad, (u0 + u1) / 2, v1)],
          stroke: BONE(0.20), width: 0.45 });
      }
      // Sill.
      out.push({ line: [quadLerp(face.quad, u0 - 0.02, v1), quadLerp(face.quad, u1 + 0.02, v1)],
        stroke: BONE(0.26), width: 0.5 });
      // Balcony rail on alternate floors of the taller blocks.
      if (b.rows >= 4 && r % 2 === 1 && detail.props > 0.5) {
        const vb = Math.min(1, v1 + 0.035);
        out.push({ line: [quadLerp(face.quad, u0 - 0.04, vb), quadLerp(face.quad, u1 + 0.04, vb)],
          stroke: BONE(0.34), width: 0.7 });
        for (let k = 1; k < 4; k++) {
          const uu = lerp(u0 - 0.04, u1 + 0.04, k / 4);
          out.push({ line: [quadLerp(face.quad, uu, vb), quadLerp(face.quad, uu, Math.min(1, vb + 0.022))],
            stroke: BONE(0.24), width: 0.4 });
        }
      }
    }
  }
  return out;
}

function drawRoof(p, camera, b, detail, seed) {
  const roofY = b.h;
  const { x, z, w, d } = b;
  // Parapet.
  p.projectLine(camera, [
    v3(x - w / 2, roofY + 0.18, z - d / 2), v3(x - w / 2, roofY + 0.18, z + d / 2),
    v3(x + w / 2, roofY + 0.18, z + d / 2), v3(x + w / 2, roofY + 0.18, z - d / 2),
    v3(x - w / 2, roofY + 0.18, z - d / 2),
  ], { color: BONE(0.36), width: 0.9, alpha: 0.85, jitter: 0.2, seed: seed + 1, double: false });
  // Railing posts along the front edge.
  for (let i = 0; i <= 5; i++) {
    const rx = lerp(x - w / 2, x + w / 2, i / 5);
    line3(p, camera, [rx, roofY, z + d / 2], [rx, roofY + 0.72, z + d / 2], {
      color: BONE(0.20), width: 0.55, alpha: 0.8, jitter: 0.12, seed: seed + 10 + i, double: false,
    });
  }
  line3(p, camera, [x - w / 2, roofY + 0.72, z + d / 2], [x + w / 2, roofY + 0.72, z + d / 2], {
    color: BONE(0.24), width: 0.6, alpha: 0.8, jitter: 0.15, seed: seed + 20, double: false,
  });

  // Rooftop boxes and a water tank.
  const boxes = b.roofTank ? 2 : 1;
  for (let i = 0; i < boxes; i++) {
    const bx = x - w * 0.18 + i * w * 0.34;
    const bz = z - d * 0.16 + i * d * 0.18;
    p.box(camera, [bx, roofY + 0.52, bz], [w * 0.18, 0.9, d * 0.22], {
      fill: '#0b100c', stroke: BONE(0.28), width: 0.6, alpha: 0.9,
      seed: seed + 30 + i, jitter: 0.2, edgeAlpha: 0.6,
    });
  }
  if (b.roofTank) {
    const tx = x + w * 0.22, tz = z - d * 0.12;
    const tankH = 1.1;
    p.box(camera, [tx, roofY + 0.55 + tankH / 2, tz], [w * 0.21, tankH, d * 0.24], {
      fill: '#0d130f', stroke: BONE(0.34), width: 0.7, alpha: 0.92,
      seed: seed + 40, jitter: 0.18, edgeAlpha: 0.7,
    });
    for (const ox of [-0.22, 0.22]) {
      line3(p, camera, [tx + w * 0.21 * ox, roofY + 0.02, tz - d * 0.12], [tx + w * 0.21 * ox, roofY + 0.55, tz - d * 0.12], {
        color: BONE(0.25), width: 0.6, alpha: 0.8, jitter: 0.15, seed: seed + 41 + ox, double: false,
      });
    }
  }
  // Antenna.
  line3(p, camera, [x + w * 0.34, roofY, z - d * 0.3], [x + w * 0.34, roofY + 2.1, z - d * 0.3], {
    color: BONE(0.30), width: 0.6, alpha: 0.8, jitter: 0.18, seed: seed + 50, double: false,
  });
  line3(p, camera, [x + w * 0.34 - 0.35, roofY + 1.7, z - d * 0.3], [x + w * 0.34 + 0.35, roofY + 1.7, z - d * 0.3], {
    color: BONE(0.24), width: 0.5, alpha: 0.7, jitter: 0.12, seed: seed + 51, double: false,
  });
  if (detail.windows > 0.5) {
    // Small aviation light.
    glowAt(p, camera, v3(x + w * 0.34, roofY + 2.15, z - d * 0.3), 0.55, 'red', 0.55);
  }
}

function drawShopfront(p, camera, b, face, detail, seed) {
  if (!b.shop || !face) return;
  const h = b.h;
  const gy0 = 1 - 3.05 / h;
  const gy1 = 1 - 0.18 / h;
  // Dark recess behind the glass.
  p.poly([
    quadLerp(face.quad, 0.06, gy0), quadLerp(face.quad, 0.94, gy0),
    quadLerp(face.quad, 0.94, gy1), quadLerp(face.quad, 0.06, gy1),
  ], { fill: 'rgba(4,6,5,0.94)', stroke: BONE(0.34), width: 0.8, jitter: 0.3, seed: seed + 1 });

  const panes = detail.windows > 0.6 ? 5 : 3;
  const warm = b.accent === 'red';
  for (let i = 0; i < panes; i++) {
    const u0 = 0.09 + i * (0.82 / panes);
    const u1 = u0 + (0.82 / panes) * 0.80;
    const v0 = gy0 + 0.02, v1 = gy1 - 0.02;
    p.poly([
      quadLerp(face.quad, u0, v0), quadLerp(face.quad, u1, v0),
      quadLerp(face.quad, u1, v1), quadLerp(face.quad, u0, v1),
    ], {
      fill: i === 1 && !warm ? TEAL(0.34) : (warm ? EMBER(0.26) : BONE(0.22)),
      stroke: BONE(0.5), width: 0.6, jitter: 0.16, seed: seed + 10 + i,
    });
    // Transom bar and a counter line inside each pane.
    const vt = v0 + (v1 - v0) * 0.30;
    p.line([quadLerp(face.quad, u0, vt), quadLerp(face.quad, u1, vt)], {
      color: 'rgba(6,9,7,0.85)', width: 1.4, alpha: 0.9, jitter: 0.1,
      seed: seed + 15 + i, double: false,
    });
    const cv = v0 + (v1 - v0) * 0.62;
    p.line([quadLerp(face.quad, u0 + 0.005, cv), quadLerp(face.quad, u1 - 0.005, cv)], {
      color: 'rgba(4,6,5,0.75)', width: 1.2, alpha: 0.85, jitter: 0.12,
      seed: seed + 20 + i, double: false,
    });
    // Occasional silhouette inside the shop: a figure behind the glass.
    if (detail.props > 0.5 && (i === 1 || i === 3)) {
      const fx = (u0 + u1) / 2;
      p.line([quadLerp(face.quad, fx, v0 + 0.02), quadLerp(face.quad, fx, v0 + 0.10)], {
        color: 'rgba(4,6,5,0.8)', width: 2.2, alpha: 0.9, jitter: 0.1,
        seed: seed + 25 + i, double: false,
      });
      p.ellipse(quadLerp(face.quad, fx, v0 + 0.015)[0], quadLerp(face.quad, fx, v0 + 0.015)[1],
        1.6, 1.6, { fill: 'rgba(4,6,5,0.85)', stroke: false, alpha: 0.9 });
    }
  }
  // Door on the right.
  p.poly([
    quadLerp(face.quad, 0.80, gy0 + 0.012), quadLerp(face.quad, 0.93, gy0 + 0.012),
    quadLerp(face.quad, 0.93, gy1 - 0.01), quadLerp(face.quad, 0.80, gy1 - 0.01),
  ], { fill: 'rgba(7,10,8,0.96)', stroke: BONE(0.55), width: 0.7, jitter: 0.2, seed: seed + 30 });

  // Noren / hanging banners over the glass.
  if (detail.props > 0.5) {
    for (let i = 0; i < 3; i++) {
      const u0 = 0.12 + i * 0.11;
      const u1 = u0 + 0.085;
      p.poly([
        quadLerp(face.quad, u0, gy0 + 0.002), quadLerp(face.quad, u1, gy0 + 0.002),
        quadLerp(face.quad, u1, gy0 + 0.06), quadLerp(face.quad, u0, gy0 + 0.06),
      ], { fill: i === 1 ? RED(0.72) : TEAL(0.55), stroke: BONE(0.4), width: 0.5, jitter: 0.18, seed: seed + 40 + i });
    }
  }

  // Awning above the shopfront.
  const awningY = 3.35;
  const front = b.z + b.d / 2;
  const aw = b.w * 0.42;
  const aq = p.projectPoly(camera, [
    v3(b.x - aw, awningY, front + 0.02), v3(b.x + aw, awningY, front + 0.02),
    v3(b.x + aw, awningY - 0.28, front + 0.95), v3(b.x - aw, awningY - 0.28, front + 0.95),
  ], {
    fill: warm ? 'rgba(212,59,48,0.30)' : 'rgba(43,184,174,0.26)',
    stroke: warm ? RED(0.9) : TEAL(0.9), width: 0.9, alpha: 0.95, jitter: 0.3, seed: seed + 50,
  });
  if (aq) {
    for (let i = 1; i < 6; i++) {
      const t = i / 6;
      p.line([quadLerp(aq, t, 0), quadLerp(aq, t, 1)], {
        color: warm ? RED(0.45) : TEAL(0.4), width: 0.5, alpha: 0.7,
        jitter: 0.15, seed: seed + 55 + i, double: false,
      });
    }
  }

  // Light spilling onto the pavement from the shopfront.
  const spill = camera.project(v3(b.x, 0.16, front + 0.5));
  if (spill) {
    glow(p, spill.x, spill.y, spill.scale * 2.6, RGB[warm ? 'ember' : 'teal'], 0.20);
  }
}

function drawSignBox(p, camera, side, y, w, h, d, tint, detail, seed) {
  const faces = p.box(camera, [side.x, side.y + y, side.z], [w, h, d], {
    fill: tint === 'red' ? 'rgba(150,36,30,0.92)' : 'rgba(26,120,114,0.92)',
    stroke: BONE(0.72), width: 0.9, alpha: 0.96,
    seed, jitter: 0.2, edgeAlpha: 0.8,
  });
  const front = faceOf(faces, 'front');
  const right = faceOf(faces, 'right');
  for (const [face, cols] of [[front, 1], [right, 1]]) {
    if (!face) continue;
    const n = Math.max(2, Math.round(h * 1.4));
    for (let i = 0; i < n; i++) {
      const v = 0.08 + (i + 0.5) * (0.84 / n);
      const du = 0.30;
      const a = quadLerp(face.quad, 0.5 - du, v);
      const bq = quadLerp(face.quad, 0.5 + du, v);
      const cp = quadLerp(face.quad, 0.5, v);
      p.line([a, bq], {
        color: 'rgba(6,9,7,0.92)', width: clamp(face.quad ? 1.4 : 1.0, 1.0, 2.2),
        alpha: 0.95, jitter: 0.12, seed: seed + i * 7, double: false,
      });
      if (i % 3 === 0) {
        p.line([cp, quadLerp(face.quad, 0.5 + du, v - 0.03)], {
          color: 'rgba(6,9,7,0.9)', width: 1.0, alpha: 0.9,
          jitter: 0.1, seed: seed + i * 3 + 1, double: false,
        });
      }
    }
  }
  const c = camera.project(v3(side.x + w * 0.4, side.y + y, side.z + d * 0.4));
  if (c) glow(p, c.x, c.y, c.scale * h * 0.9, RGB[tint] || RGB.bone, 0.16);
  return faces;
}

export function drawBuildings(p, camera, detail = { windows: 1 }, timeline = null) {
  for (let i = 0; i < BUILDING_LOTS.length; i++) {
    const b = BUILDING_LOTS[i];
    const seed = 2400 + i * 137;
    const faces = p.box(camera, [b.x, b.h / 2, b.z], [b.w, b.h, b.d], {
      fill: SHADE.building,
      stroke: BONE(0.42),
      width: 1.0, alpha: 1, seed, jitter: 0.2, edgeAlpha: 0.72,
    });
    const visible = faces.filter((f) => f.visible && f.name !== 'top' && f.name !== 'bottom')
      .sort((a, b2) => a.depth - b2.depth);

    // Facade shading: the front face is a touch lighter than the side.
    for (const f of visible) {
      p.poly(f.quad, {
        fill: f.name === 'front' ? 'rgba(34,34,40,0.75)' : 'rgba(16,16,20,0.6)',
        stroke: null, jitter: 0.6, seed: seed + (f.name === 'front' ? 1 : 2),
      });
    }

    // Windows: the full grid on the primary (front) facade, a sparser one on
    // the side face. Equal density on both makes the block look transparent.
    for (let fi = 0; fi < Math.min(2, visible.length); fi++) {
      const f = visible[fi];
      const sideDetail = fi === 0 ? detail : {
        ...detail,
        windows: (detail.windows || 1) * 0.55,
        windowLight: (detail.windowLight || 1) * 0.6,
        props: 0,
      };
      const grid = facadeGrid(p, camera, b, f, sideDetail, seed + fi * 31);
      for (const cell of grid) {
        if (cell.line) {
          p.line(cell.line, { color: cell.stroke, width: cell.width, alpha: 0.8, jitter: 0.15, seed: seed + fi, double: false });
        } else {
          p.poly(cell.pts, {
            fill: cell.fill, stroke: cell.stroke, width: cell.width,
            alpha: 1, jitter: 0.16, seed: seed + fi * 7, double: false,
          });
        }
      }
    }

    // Facade structure: vertical piers, floor bands and a cornice. Without
    // these a grid of windows reads as a chart, not as a building.
    const fac = visible[0];
    if (fac) {
      const floors = Math.max(2, b.rows);
      for (let r = 1; r < floors; r++) {
        const v = r / floors;
        p.line([quadLerp(fac.quad, 0.02, v), quadLerp(fac.quad, 0.98, v)], {
          color: BONE(0.10), width: 0.55, alpha: 0.85, jitter: 0.18,
          seed: seed + 600 + r, double: false,
        });
      }
      // Piers between window bays, only on the taller facades.
      if (b.rows >= 3) {
        const bays = Math.max(2, Math.round(b.cols * (detail.windows || 1)));
        for (let c = 1; c < bays; c++) {
          const u = c / bays;
          p.line([quadLerp(fac.quad, u, 0.06), quadLerp(fac.quad, u, 0.60)], {
            color: BONE(0.07), width: 0.5, alpha: 0.75, jitter: 0.14,
            seed: seed + 620 + c, double: false,
          });
        }
      }
    }

    // Cornice: a lip of volume at the roof line, cast in the round.
    p.box(camera, [b.x, b.h - 0.16, b.z + b.d / 2 + 0.10], [b.w * 1.04, 0.34, b.d * 0.16], {
      fill: '#111116', stroke: BONE(0.5), width: 0.8, alpha: 0.98,
      seed: seed + 560, jitter: 0.14, edgeAlpha: 0.75,
    });

    const front = faceOf(faces, 'front');
    drawShopfront(p, camera, b, front, detail, seed + 100);

    // Entrance canopy and door on the taller, non-shop buildings.
    if (!b.shop && front) {
      const gy0 = 1 - 2.6 / b.h;
      const gy1 = 1 - 0.2 / b.h;
      p.poly([
        quadLerp(front.quad, 0.34, gy0), quadLerp(front.quad, 0.52, gy0),
        quadLerp(front.quad, 0.52, gy1), quadLerp(front.quad, 0.34, gy1),
      ], { fill: 'rgba(5,7,6,0.9)', stroke: BONE(0.46), width: 0.7, jitter: 0.2, seed: seed + 570 });
      const canopy = p.projectPoly(camera, [
        v3(b.x - b.w * 0.18, 2.55, b.z + b.d / 2 + 0.02),
        v3(b.x + b.w * 0.02, 2.55, b.z + b.d / 2 + 0.02),
        v3(b.x + b.w * 0.02, 2.4, b.z + b.d / 2 + 1.0),
        v3(b.x - b.w * 0.18, 2.4, b.z + b.d / 2 + 1.0),
      ], { fill: 'rgba(30,30,36,0.9)', stroke: BONE(0.42), width: 0.65, alpha: 0.95, jitter: 0.2, seed: seed + 571 });
      // Lit doorway.
      const dq = p.projectPoly(camera, [
        v3(b.x - b.w * 0.20, 2.4, b.z + b.d / 2 + 0.03),
        v3(b.x, 2.4, b.z + b.d / 2 + 0.03),
        v3(b.x, 0.2, b.z + b.d / 2 + 0.03),
        v3(b.x - b.w * 0.20, 0.2, b.z + b.d / 2 + 0.03),
      ], { fill: 'rgba(216,190,150,0.20)', stroke: BONE(0.5), width: 0.7, jitter: 0.2, seed: seed + 572 });
      glowAt(p, camera, v3(b.x - b.w * 0.1, 1.2, b.z + b.d / 2 + 0.3), 0.9, 'ember', 0.22);
      if (canopy) p.line([quadLerp(canopy, 0.1, 0.5), quadLerp(canopy, 0.9, 0.5)], {
        color: BONE(0.3), width: 0.55, alpha: 0.8, jitter: 0.14, seed: seed + 573, double: false,
      });
      if (dq) {
        p.line([quadLerp(dq, 0.5, 0.02), quadLerp(dq, 0.5, 0.98)], {
          color: BONE(0.4), width: 0.6, alpha: 0.85, jitter: 0.12, seed: seed + 574, double: false,
        });
      }
      // Address plate beside the door.
      const ap = camera.project(v3(b.x - b.w * 0.26, 1.9, b.z + b.d / 2 + 0.05));
      if (ap) {
        p.rect(ap.x - 3, ap.y - 4, 6, 8, {
          fill: 'rgba(8,10,9,0.9)', stroke: BONE(0.4), width: 0.5, jitter: 0.1, seed: seed + 575,
        });
      }
    }

    // Air conditioners / balconies on a couple of floors.
    if (detail.props > 0.5 && front && b.rows >= 3) {
      for (let k = 0; k < 3; k++) {
        const u = 0.18 + k * 0.3;
        const v = 0.18 + (k % 2) * 0.16;
        const c0 = quadLerp(front.quad, u, v);
        const c1 = quadLerp(front.quad, u + 0.09, v);
        const c2 = quadLerp(front.quad, u + 0.09, v + 0.08);
        const c3 = quadLerp(front.quad, u, v + 0.08);
        p.poly([c0, c1, c2, c3], {
          fill: 'rgba(52,52,58,0.85)', stroke: BONE(0.34), width: 0.45,
          alpha: 0.9, jitter: 0.16, seed: seed + 580 + k,
        });
      }
    }

    // Vertical blade sign near the left front corner.
    if (b.verticalSign && b.accent) {
      drawSignBox(p, camera, {
        x: b.x - b.w / 2 + 0.62, y: 3.0, z: b.z + b.d / 2 + 0.46,
      }, 0, 0.62, 3.1, 0.62, b.accent, detail, seed + 200);
    }

    // Horizontal fascia sign above the awning.
    if (b.shop) {
      const fs = camera.project(v3(b.x, 3.95, b.z + b.d / 2 + 0.06));
      const wq = p.sign3D(camera, v3(b.x, 3.95, b.z + b.d / 2 + 0.10),
        v3(b.w * 0.66, 0, 0), v3(0, 0.78, 0), {
          fill: 'rgba(7,10,8,0.96)',
          stroke: BONE(0.66), bar: b.accent === 'red' ? RED(0.9) : TEAL(0.9),
          glyphs: 3, glyphColor: BONE(0.9), seed: seed + 300, width: 0.9, alpha: 0.95,
        });
      if (fs && wq) glow(p, fs.x, fs.y, fs.scale * 0.8, RGB[b.accent === 'red' ? 'red' : 'teal'], 0.10);
    }

    // Downpipe on the left edge and a conduit on the right.
    line3(p, camera, [b.x - b.w / 2 + 0.12, 0.2, b.z + b.d / 2 + 0.03], [b.x - b.w / 2 + 0.12, b.h - 0.2, b.z + b.d / 2 + 0.03], {
      color: BONE(0.26), width: 0.8, alpha: 0.85, jitter: 0.14, seed: seed + 310, double: false,
    });
    if (detail.props > 0.5) {
      line3(p, camera, [b.x + b.w / 2 - 0.18, 0.2, b.z + b.d / 2 + 0.03], [b.x + b.w / 2 - 0.18, b.h - 0.8, b.z + b.d / 2 + 0.03], {
        color: BONE(0.20), width: 0.6, alpha: 0.8, jitter: 0.12, seed: seed + 311, double: false,
      });
    }

    // Vertical accent stripe, tied to the building's colour.
    if (b.accent) {
      const col = b.accent === 'red' ? RED(0.5) : TEAL(0.5);
      line3(p, camera, [b.x - b.w / 2 + 0.02, 0.3, b.z + b.d / 2 + 0.04],
        [b.x - b.w / 2 + 0.02, b.h * 0.94, b.z + b.d / 2 + 0.04], {
          color: col, width: 1.4, alpha: 0.7, jitter: 0.15, seed: seed + 320, double: false,
        });
    }

    drawRoof(p, camera, b, detail, seed + 400);

    // Top-front rim light: sells the volume more than any other line.
    line3(p, camera, [b.x - b.w / 2, b.h, b.z + b.d / 2], [b.x + b.w / 2, b.h, b.z + b.d / 2], {
      color: BONE(0.62), width: 1.35, alpha: 0.9, jitter: 0.16, seed: seed + 500, double: false,
    });
    line3(p, camera, [b.x + b.w / 2, b.h, b.z + b.d / 2], [b.x + b.w / 2, 0, b.z + b.d / 2], {
      color: BONE(0.30), width: 0.9, alpha: 0.8, jitter: 0.16, seed: seed + 501, double: false,
    });
  }
}

// ---------------------------------------------------------------------------
// 5. Signals, lamps, wires and props.
// ---------------------------------------------------------------------------

function signalHead(p, camera, center, size, facing, walk, stop, seed) {
  const [w, h, d] = size;
  const faces = p.box(camera, [center.x, center.y, center.z], [w, h, d], {
    fill: 'rgba(4,7,5,0.98)', stroke: BONE(0.72), width: 0.9,
    alpha: 1, seed, jitter: 0.15, edgeAlpha: 0.85,
  });
  const face = faceOf(faces, facing);
  if (!face) return;
  const lampV = [0.22, 0.5, 0.78];
  const lamps = [
    { on: stop > 0.5, col: 'red' },
    { on: false, col: 'ember' },
    { on: walk > 0.5, col: 'teal' },
  ];
  for (let i = 0; i < 3; i++) {
    const q = quadLerp(face.quad, 0.5, lampV[i]);
    const r = clamp(face.scale * 0.085, 1.6, 9.0);
    // Dark lens ring, then the lamp itself.
    p.ellipse(q[0], q[1], r * 1.22, r * 1.22, {
      fill: 'rgba(3,5,4,0.96)', stroke: BONE(0.30), width: 0.6, alpha: 1,
    });
    p.ellipse(q[0], q[1], r, r, {
      fill: lamps[i].on ? (lamps[i].col === 'red' ? RED(0.98) : TEAL(0.98)) : 'rgba(16,22,19,0.95)',
      stroke: BONE(lamps[i].on ? 0.85 : 0.26), width: 0.75, alpha: 1,
    });
    if (lamps[i].on) {
      glow(p, q[0], q[1], r * 8.0, RGB[lamps[i].col], 0.5);
      // A drop of light on the wet lens.
      p.ellipse(q[0] - r * 0.3, q[1] - r * 0.34, r * 0.26, r * 0.2, {
        fill: 'rgba(255,250,238,0.75)', stroke: false, alpha: 1,
      });
    }
  }
}

export function drawSignals(p, camera, timeline) {
  const walk = timeline.walkSignal();
  const stop = timeline.stopSignal();
  for (let i = 0; i < SIGNAL_POSITIONS.length; i++) {
    const s = SIGNAL_POSITIONS[i];
    const seed = 3000 + i * 41;
    const ground = SIDEWALK_Y;
    // Pole.
    line3(p, camera, [s.x, ground, s.z], [s.x, 5.5, s.z], {
      color: BONE(0.66), width: 1.5, alpha: 0.95,
      jitter: 0.12, seed, double: false,
    });
    line3(p, camera, [s.x - 0.14, ground, s.z - 0.14], [s.x + 0.14, ground, s.z + 0.14], {
      color: BONE(0.4), width: 1.0, alpha: 0.8, jitter: 0.1, seed: seed + 1, double: false,
    });
    // Arm over the road.
    const hz = s.z + s.toward.z * s.arm;
    p.projectLine(camera, [
      v3(s.x, 5.5, s.z),
      v3(s.x, 5.42, lerp(s.z, hz, 0.5)),
      v3(s.x, 5.34, hz),
    ], { color: BONE(0.6), width: 1.2, alpha: 0.9, jitter: 0.14, seed: seed + 2, double: false });
    // Vehicle head hangs from the arm, faces traffic.
    signalHead(p, camera, v3(s.x, 4.62, hz), [0.62, 2.0, 1.35],
      s.yaw === 0 ? 'right' : 'left', walk, stop, seed + 10);
    // Pedestrian head lower on the pole, faces the crossing.
    signalHead(p, camera, v3(s.x, 2.45, s.z + s.toward.z * 0.16), [0.86, 1.25, 0.42],
      s.toward.z > 0 ? 'front' : 'back', walk, stop, seed + 20);
  }
}

function streetLamp(p, camera, x, z, dir) {
  const ground = SIDEWALK_Y;
  line3(p, camera, [x, ground, z], [x, 5.35, z], {
    color: BONE(0.50), width: 1.15, alpha: 0.9, jitter: 0.14, seed: 3200 + x, double: false,
  });
  p.projectLine(camera, [
    v3(x, 5.35, z), v3(x + dir * 0.35, 5.62, z), v3(x + dir * 1.55, 5.55, z),
  ], { color: BONE(0.46), width: 0.9, alpha: 0.85, jitter: 0.14, seed: 3210 + x, double: false });
  // Shade and lamp.
  p.projectPoly(camera, [
    v3(x + dir * 1.18, 5.55, z - 0.28), v3(x + dir * 1.86, 5.55, z - 0.28),
    v3(x + dir * 1.86, 5.55, z + 0.28), v3(x + dir * 1.18, 5.55, z + 0.28),
  ], { fill: BONE(0.16), stroke: BONE(0.55), width: 0.7, jitter: 0.2, seed: 3220 + x });
  glowAt(p, camera, v3(x + dir * 1.5, 5.35, z), 1.5, 'ember', 0.34);
  glowAt(p, camera, v3(x + dir * 1.5, 0.3, z), 1.9, 'ember', 0.10);
}


// A bench: slatted seat, backrest and two iron legs. Drawn as boxes and bars
// because at tile scale a bench is a horizontal line with legs.
function bench(p, camera, x, z, rot, seed) {
  const c = Math.cos(rot), sn = Math.sin(rot);
  const at = (a, y, b) => v3(x + a * c - b * sn, SIDEWALK_Y + y, z + a * sn + b * c);
  const A = (q) => [q.x, q.y, q.z];
  const seat = [at(-0.85, 0.44, -0.20), at(0.85, 0.44, -0.20), at(0.85, 0.44, 0.20), at(-0.85, 0.44, 0.20)];
  p.projectPoly(camera, seat, {
    fill: '#141a16', stroke: BONE(0.42), width: 0.7, alpha: 0.95, jitter: 0.2, seed,
  });
  const back = [at(-0.85, 0.44, -0.20), at(0.85, 0.44, -0.20), at(0.85, 0.86, -0.26), at(-0.85, 0.86, -0.26)];
  p.projectPoly(camera, back, {
    fill: 'rgba(16,22,18,0.95)', stroke: BONE(0.38), width: 0.65, alpha: 0.92, jitter: 0.2, seed: seed + 1,
  });
  for (let i = 0; i < 3; i++) {
    const b = -0.14 + i * 0.14;
    line3(p, camera, A(at(-0.8, 0.50, b)), A(at(0.8, 0.50, b)), {
      color: BONE(0.22), width: 0.5, alpha: 0.85, jitter: 0.12, seed: seed + 5 + i, double: false,
    });
  }
  for (const a of [-0.7, 0.7]) {
    line3(p, camera, A(at(a, 0, -0.16)), A(at(a, 0.44, 0.06)), {
      color: BONE(0.34), width: 0.9, alpha: 0.9, jitter: 0.12, seed: seed + 9 + a, double: false,
    });
    line3(p, camera, A(at(a, 0.44, 0.06)), A(at(a, 0.86, -0.24)), {
      color: BONE(0.30), width: 0.8, alpha: 0.9, jitter: 0.12, seed: seed + 12 + a, double: false,
    });
  }
  // Contact shadow.
  p.projectPoly(camera, [
    at(-0.95, 0.008, -0.3), at(0.95, 0.008, -0.3), at(0.95, 0.008, 0.3), at(-0.95, 0.008, 0.3),
  ], { fill: 'rgba(0,0,0,0.4)', stroke: null, jitter: 0.4, seed: seed + 20 });
}

// A bike rack: three steel hoops along the kerb.
function bikeRack(p, camera, x, z, count, seed) {
  for (let i = 0; i < count; i++) {
    const bx = x + i * 0.9;
    const pts = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const ang = Math.PI * t;
      pts.push(v3(bx + Math.cos(ang) * 0.34, SIDEWALK_Y + Math.sin(ang) * 0.62, z));
    }
    p.projectLine(camera, pts, {
      color: BONE(0.34), width: 1.3, alpha: 0.9, jitter: 0.12, seed: seed + i, double: false,
    });
    for (const e of [0, 1]) {
      const ex = bx + (e ? 0.34 : -0.34);
      line3(p, camera, [ex, SIDEWALK_Y, z], [ex, SIDEWALK_Y + 0.05, z + 0.3], {
        color: BONE(0.22), width: 0.7, alpha: 0.85, jitter: 0.1, seed: seed + 10 + i + e, double: false,
      });
    }
  }
}

function tree(p, camera, x, z, scale, seed, detail) {
  // A street tree drawn the way an ink sketch would draw one: a tapered trunk,
  // a small number of primary limbs, and a dark leaf cluster at each terminus.
  // That reads at thumbnail size and still feels hand-drawn up close.
  const ground = SIDEWALK_Y;
  const rng = makeRng(seed);
  const limbs = [];
  const tips = [];

  const limb = (from, to, w0, w1, depth) => {
    const dx = to.x - from.x, dz = to.z - from.z;
    const nl = Math.hypot(dx, dz) || 1;
    const ox = (-dz / nl) * w0 * 0.5, oz = (dx / nl) * w0 * 0.5;
    const ox1 = (-dz / nl) * w1 * 0.5, oz1 = (dx / nl) * w1 * 0.5;
    limbs.push({
      pts: [
        v3(from.x - ox, from.y, from.z - oz), v3(from.x + ox, from.y, from.z + oz),
        v3(to.x + ox1, to.y, to.z + oz1), v3(to.x - ox1, to.y, to.z - oz1),
      ],
      depth,
    });
  };

  const trunkTop = v3(x + 0.08 * scale, ground + 2.15 * scale, z - 0.04 * scale);
  limb(v3(x, ground, z), trunkTop, 0.52 * scale, 0.30 * scale, 3);
  // Two root flares.
  for (const a of [-1, 1]) {
    limb(v3(x, ground + 0.01, z), v3(x + a * 0.4 * scale, ground + 0.01, z + 0.22 * scale),
      0.14 * scale, 0.06 * scale, 2);
  }

  const branches = detail.trees > 0.7 ? 6 : 4;
  for (let b = 0; b < branches; b++) {
    const a = (b / branches) * TAU + rng.range(-0.4, 0.4);
    const tilt = rng.range(0.55, 1.0);
    const len = rng.range(0.9, 1.45) * scale;
    const mid = v3(
      trunkTop.x + Math.cos(a) * len * 0.55,
      trunkTop.y + len * tilt * 0.62,
      trunkTop.z + Math.sin(a) * len * 0.42,
    );
    limb(trunkTop, mid, 0.22 * scale, 0.14 * scale, 2);
    // Two sub-branches from each.
    for (let k = 0; k < 2; k++) {
      const a2 = a + (k ? 0.6 : -0.6) + rng.range(-0.25, 0.25);
      const len2 = len * rng.range(0.55, 0.8);
      const tip = v3(
        mid.x + Math.cos(a2) * len2,
        mid.y + len2 * rng.range(0.35, 0.8),
        mid.z + Math.sin(a2) * len2 * 0.7,
      );
      limb(mid, tip, 0.13 * scale, 0.055 * scale, 1);
      tips.push(tip);
    }
  }

  // Leaf clusters at the tips, then the woody structure in front.
  for (let i = 0; i < tips.length; i++) {
    const t = tips[i];
    const rr = (0.42 + hash11(seed + i * 3.1) * 0.22) * scale;
    const poly = [];
    const N = 9;
    for (let k = 0; k < N; k++) {
      const b = (k / N) * TAU;
      const wob = 0.8 + 0.24 * hash11(seed + i * 5.1 + k * 2.7);
      poly.push(v3(
        t.x + Math.cos(b) * rr * wob,
        t.y + Math.sin(b) * rr * 0.85 * wob,
        t.z + Math.sin(b) * rr * 0.4,
      ));
    }
    p.projectPoly(camera, poly, {
      fill: 'rgba(11,16,13,0.92)', stroke: TEAL(0.14), width: 0.4,
      alpha: 0.96, jitter: 0.22, seed: seed + 300 + i,
    });
  }
  // Cast shadow under the canopy: anchors the tree to the pavement.
  p.projectPoly(camera, [
    v3(x - 1.5 * scale, ground + 0.008, z - 0.2 * scale),
    v3(x + 0.6 * scale, ground + 0.008, z - 0.5 * scale),
    v3(x + 1.9 * scale, ground + 0.008, z + 0.7 * scale),
    v3(x - 0.2 * scale, ground + 0.008, z + 1.1 * scale),
  ], { fill: 'rgba(0,0,0,0.45)', stroke: null, jitter: 0.6, seed: seed + 900 });
  limbs.sort((a, b) => b.depth - a.depth);
  for (let i = 0; i < limbs.length; i++) {
    const l = limbs[i];
    p.projectPoly(camera, l.pts, {
      fill: '#0a0e0c', stroke: BONE(0.16 + l.depth * 0.035),
      width: clamp(0.5 + l.depth * 0.18, 0.4, 1.05),
      alpha: 0.98, jitter: 0.18, seed: seed + 40 + i,
    });
  }
}

function bicycle(p, camera, x, z, rot, seed) {
  const ground = SIDEWALK_Y;
  const c = Math.cos(rot), s = Math.sin(rot);
  const at = (a, b, y) => v3(x + a * c - b * s, ground + y, z + a * s + b * c);
  for (const a of [-0.52, 0.52]) {
    const q = camera.project(at(a, 0, 0.34));
    if (!q) continue;
    const r = Math.max(1.2, 0.34 * q.scale);
    p.ellipse(q.x, q.y, r, r * 0.92, {
      stroke: BONE(0.44), width: 0.65, alpha: 0.85,
    });
    p.ellipse(q.x, q.y, r * 0.18, r * 0.18, { fill: BONE(0.35), stroke: false });
  }
  p.projectLine(camera, [at(-0.52, 0, 0.34), at(-0.12, 0, 0.62), at(0.2, 0, 0.3), at(0.52, 0, 0.34)], {
    color: BONE(0.44), width: 0.65, alpha: 0.85, jitter: 0.15, seed, double: false,
  });
  p.projectLine(camera, [at(-0.12, 0, 0.62), at(0.38, 0, 0.72), at(0.2, 0, 0.3)], {
    color: BONE(0.36), width: 0.55, alpha: 0.8, jitter: 0.12, seed: seed + 1, double: false,
  });
  p.projectLine(camera, [at(0.36, 0, 0.74), at(0.5, 0, 0.88), at(0.44, 0, 1.0)], {
    color: BONE(0.4), width: 0.55, alpha: 0.85, jitter: 0.1, seed: seed + 2, double: false,
  });
  p.projectLine(camera, [at(-0.14, 0, 0.64), at(-0.22, 0, 0.84), at(-0.12, 0, 0.92)], {
    color: BONE(0.36), width: 0.5, alpha: 0.8, jitter: 0.1, seed: seed + 3, double: false,
  });
}

export function drawFurniture(p, camera, detail = { props: 1 }, timeline = null) {
  // Street lamps along both kerbs.
  streetLamp(p, camera, -12.9, ROAD.z1 + 0.55, 1);
  // A second lamp on the near-left sidewalk so that corner is not a black hole.
  streetLamp(p, camera, -13.6, 8.6, 1);
  streetLamp(p, camera, 10.9, ROAD.z1 + 0.55, -1);
  streetLamp(p, camera, -6.9, ROAD.z0 - 0.55, 1);
  streetLamp(p, camera, 4.6, ROAD.z0 - 0.55, -1);

  // Utility poles and wires over the street.
  const wireSets = [
    { z: 1.15, y: 7.6, sag: 0.55, seed: 1 },
    { z: 0.62, y: 7.9, sag: 0.62, seed: 2 },
    { z: 0.10, y: 8.2, sag: 0.58, seed: 3 },
    { z: -0.46, y: 8.45, sag: 0.66, seed: 4 },
  ];
  for (const w of wireSets) {
    const pts = [];
    for (let j = 0; j <= 24; j++) {
      const t = j / 24;
      pts.push(v3(lerp(TILE.x0 + 0.3, TILE.x1 - 0.3, t), w.y - Math.sin(t * Math.PI) * w.sag, w.z));
    }
    p.projectLine(camera, pts, {
      color: w.seed % 2 ? BONE(0.20) : TEAL(0.14), width: 0.55,
      alpha: 0.85, jitter: 0.12, seed: 3300 + w.seed, double: false,
    });
  }
  for (const px of [-14.1, 14.1]) {
    const zz = 1.4;
    line3(p, camera, [px, SIDEWALK_Y, zz], [px, 8.9, zz], {
      color: BONE(0.34), width: 1.1, alpha: 0.85,
      jitter: 0.14, seed: 3310 + px, double: false,
    });
    for (const [yy, ww] of [[8.55, 1.3], [8.15, 0.9], [7.7, 0.7]]) {
      line3(p, camera, [px - ww, yy, zz], [px + ww, yy, zz], {
        color: BONE(0.30), width: 0.6, alpha: 0.8,
        jitter: 0.12, seed: 3320 + px + yy, double: false,
      });
    }
  }

  // Vending machine: the bright foreground note on the near right.
  const vx = 12.9, vz = 6.2;
  const vfaces = p.box(camera, [vx, SIDEWALK_Y + 0.95, vz], [1.05, 1.9, 0.75], {
    fill: '#0e0f11', stroke: BONE(0.55), width: 0.9, alpha: 0.98,
    seed: 3400, jitter: 0.16, edgeAlpha: 0.8,
  });
  const vf = faceOf(vfaces, 'front');
  if (vf) {
    p.poly(vf.quad, {
      fill: 'rgba(43,184,174,0.26)', stroke: TEAL(0.9), width: 0.9,
      jitter: 0.14, seed: 3401,
    });
    // Bottle rows.
    for (let r = 0; r < 3; r++) {
      for (let c2 = 0; c2 < 4; c2++) {
        const u = 0.13 + c2 * 0.21, v = 0.18 + r * 0.17;
        const q = quadLerp(vf.quad, u, v);
        const s = clamp(vf.scale * 0.07, 0.8, 3.0);
        p.rect(q[0] - s * 0.5, q[1] - s, s, s * 1.6, {
          fill: c2 % 3 === 0 ? RED(0.9) : BONE(0.75), stroke: null, jitter: 0.08, seed: 3402 + r * 4 + c2,
        });
      }
    }
    const q = camera.project(v3(vx, SIDEWALK_Y + 1.2, vz + 0.4));
    if (q) glow(p, q.x, q.y, q.scale * 1.5, RGB.teal, 0.26);
  }

  // Bench, planters, bin, bollards.
  for (const [bx, bz] of [[-12.6, 7.6]]) {
    for (let i = 0; i < 4; i++) {
      p.projectPoly(camera, [
        v3(bx - 1.1, SIDEWALK_Y + 0.42, bz - 0.26 + i * 0.14),
        v3(bx + 1.1, SIDEWALK_Y + 0.42, bz - 0.26 + i * 0.14),
        v3(bx + 1.1, SIDEWALK_Y + 0.46, bz - 0.26 + i * 0.14),
        v3(bx - 1.1, SIDEWALK_Y + 0.46, bz - 0.26 + i * 0.14),
      ], { fill: BONE(0.10), stroke: BONE(0.34), width: 0.5, jitter: 0.12, seed: 3500 + i });
    }
    for (const ox of [-0.85, 0.85]) {
      line3(p, camera, [bx + ox, SIDEWALK_Y, bz - 0.2], [bx + ox, SIDEWALK_Y + 0.44, bz - 0.2], {
        color: BONE(0.34), width: 0.7, alpha: 0.85, jitter: 0.12, seed: 3510 + ox, double: false,
      });
      line3(p, camera, [bx + ox, SIDEWALK_Y + 0.44, bz - 0.3], [bx + ox, SIDEWALK_Y + 1.0, bz - 0.38], {
        color: BONE(0.3), width: 0.6, alpha: 0.8, jitter: 0.12, seed: 3511 + ox, double: false,
      });
    }
  }
  for (const [px, pz, s] of [[-7.4, 8.9, 1.0], [2.4, 9.2, 0.9], [-1.4, 9.3, 0.7]]) {
    p.box(camera, [px, SIDEWALK_Y + 0.28 * s, pz], [0.9 * s, 0.56 * s, 0.7 * s], {
      fill: '#101711', stroke: BONE(0.34), width: 0.6, alpha: 0.92,
      seed: 3520 + px, jitter: 0.2, edgeAlpha: 0.6,
    });
    // Bare shrub: three strokes.
    for (let k = 0; k < 4; k++) {
      const a = -0.8 + k * 0.55;
      p.projectLine(camera, [
        v3(px, SIDEWALK_Y + 0.55 * s, pz),
        v3(px + Math.cos(a) * 0.55, SIDEWALK_Y + (1.05 + hash11(k + px) * 0.4) * s, pz + Math.sin(a) * 0.4),
      ], {
        color: TEAL(0.22), width: 0.7, alpha: 0.8,
        jitter: 0.2, seed: 3530 + k + px, double: false,
      });
    }
  }
  // Bollards near the crossing.
  for (let i = 0; i < 3; i++) {
    const bx = -6.6 + i * 1.5;
    line3(p, camera, [bx, SIDEWALK_Y, ROAD.z1 + 0.4], [bx, SIDEWALK_Y + 0.72, ROAD.z1 + 0.4], {
      color: BONE(0.4), width: 1.0, alpha: 0.9, jitter: 0.1, seed: 3540 + i, double: false,
    });
    const q = camera.project(v3(bx, SIDEWALK_Y + 0.76, ROAD.z1 + 0.4));
    if (q) p.ellipse(q.x, q.y, clamp(q.scale * 0.05, 0.7, 3), clamp(q.scale * 0.05, 0.7, 3) * 0.7, {
      fill: BONE(0.35), stroke: BONE(0.5), width: 0.5,
    });
  }

  // Poster column, plastered in torn red bills: a pure accent note.
  const colX = -6.8, colZ = 7.9;
  const colFaces = p.box(camera, [colX, SIDEWALK_Y + 0.95, colZ], [0.72, 1.9, 0.72], {
    fill: '#0a0f0c', stroke: BONE(0.4), width: 0.7, alpha: 0.96,
    seed: 3570, jitter: 0.16, edgeAlpha: 0.65,
  });
  const cf = faceOf(colFaces, 'front');
  if (cf) {
    for (let i = 0; i < 6; i++) {
      const u = 0.12 + (i % 3) * 0.28;
      const v = 0.10 + Math.floor(i / 3) * 0.44;
      p.poly([
        quadLerp(cf.quad, u, v), quadLerp(cf.quad, u + 0.22, v),
        quadLerp(cf.quad, u + 0.22, v + 0.30), quadLerp(cf.quad, u, v + 0.30),
      ], {
        fill: i % 2 ? RED(0.62) : BONE(0.14), stroke: BONE(0.3), width: 0.45,
        alpha: 0.9, jitter: 0.3, seed: 3571 + i,
      });
    }
  }
  // Paper lanterns strung along the shop frontage.
  for (let i = 0; i < 7; i++) {
    const lx = -6.4 + i * 2.35;
    const lz = 6.5;
    const ly = SIDEWALK_Y + 3.15 - Math.sin((i / 6) * Math.PI) * 0.22;
    const q = camera.project(v3(lx, ly, lz));
    if (!q) continue;
    const r = clamp(q.scale * 0.20, 2.4, 11.0);
    p.ellipse(q.x, q.y, r, r * 1.14, {
      fill: i % 3 === 0 ? BONE(0.5) : RED(0.72), stroke: BONE(0.6), width: 0.55, alpha: 0.95,
    });
    p.line([[q.x, q.y + r * 1.14], [q.x, q.y - r * 1.5]], {
      color: BONE(0.32), width: 0.45, alpha: 0.8, jitter: 0.1, seed: 3580 + i, double: false,
    });
    glow(p, q.x, q.y, r * 4.5, i % 3 === 0 ? RGB.bone : RGB.red, 0.16);
  }
  // The string itself.
  const lanternPts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    lanternPts.push(v3(lerp(-7.4, 8.4, t), SIDEWALK_Y + 3.42 - Math.sin(t * Math.PI) * 0.3, 6.5));
  }
  p.projectLine(camera, lanternPts, {
    color: BONE(0.22), width: 0.5, alpha: 0.8, jitter: 0.12, seed: 3588, double: false,
  });

  // Trash bin and a bus-stop pole.
  p.box(camera, [12.0, SIDEWALK_Y + 0.45, 8.2], [0.6, 0.9, 0.6], {
    fill: '#0d130f', stroke: BONE(0.34), width: 0.6, alpha: 0.92,
    seed: 3550, jitter: 0.18, edgeAlpha: 0.6,
  });
  line3(p, camera, [-3.9, SIDEWALK_Y, 9.0], [-3.9, SIDEWALK_Y + 2.7, 9.0], {
    color: BONE(0.4), width: 0.8, alpha: 0.85, jitter: 0.12, seed: 3560, double: false,
  });
  const bq = camera.project(v3(-3.9, SIDEWALK_Y + 2.45, 9.0));
  if (bq) {
    p.rect(bq.x - bq.scale * 0.28, bq.y - bq.scale * 0.2, bq.scale * 0.56, bq.scale * 0.4, {
      fill: 'rgba(239,233,216,0.10)', stroke: BONE(0.55), width: 0.6, jitter: 0.2, seed: 3561,
    });
  }

  // Trees: the strongest foreground silhouette.
  if (detail.trees > 0.4) {
    tree(p, camera, 6.6, 8.0, 1.10, 3570, detail);
    tree(p, camera, -10.6, 9.2, 1.00, 3590, detail);
  }

  // Front-left street furniture: the near corner was bare pavement.
  if (detail.props > 0.4) {
    bench(p, camera, -12.6, 8.4, 0.06, 3602);
    bench(p, camera, -12.9, 9.9, Math.PI + 0.04, 3604);
    bikeRack(p, camera, -8.8, 5.6, 3, 3610);
    // Bin beside the bench.
    p.box(camera, [-11.2, SIDEWALK_Y + 0.32, 8.6], [0.44, 0.64, 0.44], {
      fill: '#0d130f', stroke: BONE(0.34), width: 0.6, alpha: 0.92,
      seed: 3618, jitter: 0.18, edgeAlpha: 0.6,
    });
  }

  // Bicycles leaning by the shop.
  if (detail.props > 0.5) {
    bicycle(p, camera, 4.2, 5.2, 0.10, 3600);
    bicycle(p, camera, 5.4, 5.45, 0.16, 3620);
  }

  // A few people-scale details that make the sidewalk feel used: chalk marks,
  // a dropped flyer, a puddle-side crate.
  for (let i = 0; i < 5; i++) {
    const q = camera.project(v3(-8 + i * 4.2, SIDEWALK_Y + 0.01, 7.6 + hash11(i) * 3.4));
    if (!q) continue;
    p.line([
      [q.x - 6 - hash11(i * 3) * 5, q.y],
      [q.x + 5 + hash11(i * 5) * 6, q.y - 1.5],
    ], {
      color: BONE(0.10), width: 0.5, alpha: 0.7, jitter: 0.2,
      seed: 3700 + i, double: false,
    });
  }
}

// ---------------------------------------------------------------------------
// 6. The elevated line behind the block.
// ---------------------------------------------------------------------------

export function drawRail(p, camera) {
  const y = 10.15;
  const z = -13.1;
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
  for (const cx of [-13.5, -7.5, -0.5, 6.5, 13.5]) {
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
  const kerb = -4.95;
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

  // Signal heads throw a small teal pool onto the wet road.
  for (let i = 0; i < SIGNAL_POSITIONS.length; i++) {
    const s = SIGNAL_POSITIONS[i];
    const hz = s.z + s.toward.z * s.arm;
    const q = camera.project(v3(s.x, 0.04, hz));
    if (q && Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.scale)) {
      const c = p.ctx;
      const g = c.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.scale * 2.4);
      g.addColorStop(0, grade('rgba(43,184,174,0.14)'));
      g.addColorStop(1, grade('rgba(43,184,174,0)'));
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = g;
      c.fillRect(q.x - q.scale * 2.4, q.y - q.scale * 2.4, q.scale * 4.8, q.scale * 4.8);
      c.restore();
    }
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

export function drawEnvironment(p, camera, timeline, params, detail) {
  drawBackdrop(p, camera, detail);
  drawStreet(p, camera, detail);
  drawPaving(p, camera, detail);
  drawRoadMarkings(p, camera, timeline);
  drawRail(p, camera);
  drawBuildings(p, camera, detail, timeline);
  drawSignals(p, camera, timeline);
  drawFurniture(p, camera, detail, timeline);
  drawReflections(p, camera, timeline, detail);
  drawFrameBack(p, camera);
  drawFrameFront(p, camera);
}
