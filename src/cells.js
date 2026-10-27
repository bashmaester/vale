// One cell of the set, complete enough to be a neighbour.
//
// The hero cell is painted by environment.js at full fidelity. These functions
// paint *any other* cell from the same rules — the same road edges, the same
// sidewalk bands, the same lane grid — offset by a whole number of cells. That
// is what makes the set tileable: a cell is not a backdrop for the hero, it is
// another copy of the same city, and the street, the kerbs and the markings run
// straight through the seam.
//
// Detail is chosen per cell from its distance to the camera, which is the hook
// the LoD pass needs later: `detail` here is a fraction (1 = hero, 0.5 = mid,
// 0.25 = far), not a full LoD record.

import { v3, lerp, hash11, quadLerp } from './math.js';
import { TILE, SIDEWALK_Y, TILE_COLORS as C, ROAD_EDGE } from './tile.js';
import { ROAD, SIDEWALKS, CROSSWALKS, BUILDING_LOTS } from './world.js';

const BONE = (a = 1) => `rgba(239,233,216,${a})`;
const TEAL = (a = 1) => `rgba(43,184,174,${a})`;
const RED = (a = 1) => `rgba(212,59,48,${a})`;

export const CELL_W = TILE.x1 - TILE.x0;
export const CELL_D = TILE.z1 - TILE.z0;

export function cellOrigin(dx, dz) {
  return { ox: dx * CELL_W, oz: dz * CELL_D };
}

// Lane dashes are laid out in WORLD x, not screen space: a cell boundary is
// always a whole number of dash periods away, so the line continues across the
// seam instead of restarting mid-dash.
export const DASH_PERIOD = 6.0;
export const DASH_LEN = 2.4;

export function laneDashes(p, camera, opts = {}) {
  const {
    ox = 0, oz = 0, z, x0 = TILE.x0, x1 = TILE.x1, dash = DASH_LEN, period = DASH_PERIOD,
    color = BONE(0.3), width = 0.9, seed = 1, y = 0.024, alpha = 0.85,
  } = opts;
  const start = Math.ceil((x0 + ox) / period) * period;
  let i = 0;
  for (let gx = start; gx < x1 + ox - 0.4; gx += period, i++) {
    const a = gx, b = Math.min(gx + dash, x1 + ox);
    if (b - a < 0.3) continue;
    p.projectPoly(camera, [
      v3(a, y, z + oz - width * 0.055), v3(b, y, z + oz - width * 0.055),
      v3(b, y, z + oz + width * 0.055), v3(a, y, z + oz + width * 0.055),
    ], { fill: color, stroke: null, jitter: 0.14, seed: seed + i * 3.1, alpha });
  }
}

function slab(p, camera, x0, x1, z0, z1, y, fill, opts = {}) {
  p.projectPoly(camera, [
    v3(x0, y, z0), v3(x1, y, z0), v3(x1, y, z1), v3(x0, y, z1),
  ], { fill, stroke: opts.stroke || null, width: opts.width || 0.7, jitter: opts.jitter == null ? 0.22 : opts.jitter, seed: opts.seed || 1 });
}

/** Ground, road, kerbs, sidewalks and markings for a cell. */
export function drawCellGround(p, camera, d = 1, ox = 0, oz = 0, seed = 7) {
  const { x0, x1, z0, z1 } = TILE;
  const X0 = x0 + ox, X1 = x1 + ox, Z0 = z0 + oz, Z1 = z1 + oz;
  const rz0 = ROAD.z0 + oz, rz1 = ROAD.z1 + oz;

  // The volume's floor slab, then the two raised pavements, then the road:
  // drawn in that order so a seam has no cracks of background showing through.
  slab(p, camera, X0, X1, Z0, Z1, 0, C.floor, { seed, stroke: BONE(0.06) });
  slab(p, camera, X0, X1, rz1, Z1, SIDEWALK_Y, C.sidewalk, { seed: seed + 1 });
  slab(p, camera, X0, X1, Z0, rz0, SIDEWALK_Y, C.sidewalkBack, { seed: seed + 2 });
  slab(p, camera, X0, X1, rz0, rz1, 0.006, C.road, { seed: seed + 3 });

  // Kerb faces: a lit edge is what reads as a height difference at this size.
  p.projectPoly(camera, [
    v3(X0, SIDEWALK_Y, rz1), v3(X1, SIDEWALK_Y, rz1),
    v3(X1, 0, rz1), v3(X0, 0, rz1),
  ], { fill: 'rgba(46,46,52,0.95)', stroke: null, jitter: 0.12, seed: seed + 4 });
  p.projectPoly(camera, [
    v3(X0, SIDEWALK_Y, rz0), v3(X1, SIDEWALK_Y, rz0),
    v3(X1, 0, rz0), v3(X0, 0, rz0),
  ], { fill: 'rgba(34,34,40,0.95)', stroke: null, jitter: 0.12, seed: seed + 5 });

  // Paving joints: coarse on a far cell, one line every 2 m up close.
  const pav = d > 0.55 ? 2.2 : d > 0.3 ? 3.4 : 5.0;
  for (let x = X0 + pav; x < X1 - 0.2; x += pav) {
    p.projectLine(camera, [v3(x, SIDEWALK_Y + 0.004, rz1 + 0.3), v3(x, SIDEWALK_Y + 0.004, Z1 - 0.2)],
      { color: BONE(0.045), width: 0.55, alpha: 0.8, jitter: 0.14, seed: seed + x * 1.7, double: false });
    p.projectLine(camera, [v3(x, SIDEWALK_Y + 0.004, Z0 + 0.2), v3(x, SIDEWALK_Y + 0.004, rz0 - 0.3)],
      { color: BONE(0.04), width: 0.5, alpha: 0.7, jitter: 0.14, seed: seed + x * 2.3, double: false });
  }

  // Centre line and lane dividers, world-periodic so they cross the seam.
  laneDashes(p, camera, { ox, oz: 0, z: 0, color: BONE(d > 0.3 ? 0.32 : 0.2), width: 1.0, seed: seed + 11 });
  for (const zz of [-ROAD_EDGE.back * 0.44, ROAD_EDGE.back * 0.44]) {
    laneDashes(p, camera, {
      ox, z: zz, color: BONE(d > 0.3 ? 0.26 : 0.16), width: 0.85, seed: seed + 20 + zz,
      dash: DASH_LEN * 1.35,
    });
  }

  // The elevated line crosses the cell at a fixed z, so it lines up with the
  // hero's rail and with the next cell's: a beam, two running rails and the
  // catenary. Columns only survive at close range.
  if (d > 0.2) {
    const ry = 10.15, rz = -13.1 + oz;
    p.projectPoly(camera, [
      v3(X0, ry + 0.18, rz - 0.9), v3(X1, ry + 0.18, rz - 0.9),
      v3(X1, ry - 0.18, rz - 0.9), v3(X0, ry - 0.18, rz - 0.9),
    ], { fill: 'rgba(10,15,12,0.98)', stroke: BONE(0.26), width: 0.8, jitter: 0.16, seed: seed + 60 });
    p.projectPoly(camera, [
      v3(X0, ry, rz + 0.9), v3(X1, ry, rz + 0.9),
      v3(X1, ry + 0.3, rz + 0.9), v3(X0, ry + 0.3, rz + 0.9),
    ], { fill: 'rgba(10,15,12,0.98)', stroke: BONE(0.22), width: 0.7, jitter: 0.16, seed: seed + 61 });
    for (const zz of [rz - 0.62, rz + 0.62]) {
      p.projectLine(camera, [v3(X0, ry + 0.2, zz), v3(X1, ry + 0.2, zz)], {
        color: BONE(0.36), width: 0.75, alpha: 0.85, jitter: 0.16, seed: seed + 62 + zz, double: false,
      });
    }
    p.projectLine(camera, [
      v3(X0, ry + 2.45, rz), v3((X0 + X1) / 2, ry + 2.2, rz), v3(X1, ry + 2.45, rz),
    ], { color: BONE(0.18), width: 0.5, alpha: 0.8, jitter: 0.1, seed: seed + 66, double: false });
    if (d > 0.4) {
      for (let cx = X0 + 1.5; cx < X1; cx += 7.0) {
        p.projectLine(camera, [v3(cx, 0, rz), v3(cx, ry - 0.2, rz)], {
          color: BONE(0.14), width: 0.8, alpha: 0.7, jitter: 0.14, seed: seed + cx, double: false,
        });
      }
    }
  }

  if (d > 0.22) {
    // Zebra: bars run along x and repeat across the road, exactly as the hero's.
    const cw = CROSSWALKS.main;
    const bars = d > 0.55 ? 8 : 5;
    for (let i = 0; i < bars; i++) {
      const t = (i + 0.5) / bars;
      const z = lerp(cw.z0 + 0.28, cw.z1 - 0.28, t) + oz;
      p.projectPoly(camera, [
        v3(cw.x0 + 0.15 + ox, 0.022, z - 0.26), v3(cw.x1 - 0.15 + ox, 0.022, z - 0.26),
        v3(cw.x1 - 0.15 + ox, 0.022, z + 0.26), v3(cw.x0 + 0.15 + ox, 0.022, z + 0.26),
      ], { fill: BONE(0.44), stroke: null, jitter: 0.3, seed: seed + 30 + i });
    }
    // Stop lines either side of the crossing.
    p.projectPoly(camera, [
      v3(cw.x0 - 0.92 + ox, 0.022, 0.18 + oz), v3(cw.x0 - 0.52 + ox, 0.022, 0.18 + oz),
      v3(cw.x0 - 0.52 + ox, 0.022, rz1 - 0.25), v3(cw.x0 - 0.92 + ox, 0.022, rz1 - 0.25),
    ], { fill: BONE(0.4), stroke: null, jitter: 0.24, seed: seed + 40 });
  }
}

/**
 * The block on the far pavement: four lots, each jittered per cell so the
 * neighbours are siblings rather than clones.
 */
export function drawCellBlock(p, camera, d = 1, ox = 0, oz = 0, seed = 7) {
  const detail = d;
  for (let i = 0; i < BUILDING_LOTS.length; i++) {
    const b = BUILDING_LOTS[i];
    const h1 = hash11(seed + i * 3.1), h2 = hash11(seed + i * 7.7);
    const h3 = hash11(seed + i * 5.9), h4 = hash11(seed + i * 11.3);
    const w = b.w * (0.86 + h1 * 0.3);
    const dep = b.d * (0.9 + h2 * 0.2);
    const h = b.h * (0.72 + h3 * 0.55);
    const x = b.x + ox + (h2 - 0.5) * 1.6;
    const z = b.z + oz + (h4 - 0.5) * 0.8;
    // `edges: false`: only the faces that are actually facing the camera get
    // an outline, otherwise the hidden edges read through the walls and every
    // building turns into a glass box.
    const faces = p.box(camera, [x, h / 2, z], [w, h, dep], {
      fill: C.floor, stroke: BONE(0.40), width: 0.85, alpha: 0.98,
      seed: seed + i * 13, jitter: 0.16, edgeAlpha: 0.6, edges: false,
    });
    const front = faces.find((f) => f.name === 'front' && f.visible);
    if (!front) continue;

    // Shopfront band at street level, then the window grid above it.
    const band = [quadLerp(front.quad, 0.06, 0.74), quadLerp(front.quad, 0.94, 0.74),
      quadLerp(front.quad, 0.94, 0.96), quadLerp(front.quad, 0.06, 0.96)];
    p.poly(band, {
      fill: b.accent === 'red' ? RED(0.14) : TEAL(0.12), stroke: null,
      jitter: 0.14, seed: seed + i * 17,
    });

    if (detail > 0.2) {
      const cols = Math.max(2, Math.round(b.cols * (detail > 0.5 ? 1 : 0.6)));
      const rows = Math.max(2, Math.round(b.rows * (detail > 0.5 ? 1 : 0.55)));
      const wins = [];
      for (let r = 0; r < rows; r++) {
        for (let c2 = 0; c2 < cols; c2++) {
          const u0 = 0.08 + (c2 + 0.12) * (0.84 / cols);
          const u1 = u0 + (0.84 / cols) * 0.64;
          const v0 = 0.06 + (r + 0.16) * (0.84 / rows);
          const v1 = v0 + (0.84 / rows) * 0.62;
          wins.push([
            quadLerp(front.quad, u0, v0), quadLerp(front.quad, u1, v0),
            quadLerp(front.quad, u1, v1), quadLerp(front.quad, u0, v1),
          ]);
        }
      }
      // Lit windows: a deterministic subset, brighter on the lower floors.
      wins.forEach((q, k) => {
        const lit = hash11(seed + i * 31 + k * 1.7);
        const on = lit < 0.42;
        p.poly(q, {
          fill: on ? (lit < 0.12 ? 'rgba(216,160,58,0.5)' : TEAL(0.28)) : 'rgba(10,12,14,0.9)',
          stroke: BONE(0.16), width: 0.5, jitter: 0.1, seed: seed + k * 3.3,
        });
      });
    }

    // Roof cap and tank.
    if (detail > 0.3) {
      const top = faces.find((f) => f.name === 'top' && f.visible);
      if (top) p.poly(top.quad, { fill: 'rgba(20,20,24,0.95)', stroke: BONE(0.34), width: 0.8, jitter: 0.14, seed: seed + i * 19 });
      if (b.roofTank) {
        p.box(camera, [x + w * 0.18, h + 0.55, z - dep * 0.1], [1.5, 1.1, 1.3], {
          fill: '#0a0d0b', stroke: BONE(0.4), width: 0.7, seed: seed + i * 23, jitter: 0.14,
        });
      }
    }
  }
}

/** Street furniture, cut down to what survives at a distance. */
export function drawCellProps(p, camera, d = 1, ox = 0, oz = 0, seed = 7) {
  if (d < 0.18) return;
  const lampZ = ROAD.z1 + 0.55 + oz;
  for (const lx of [-12.2, -1.6, 9.4]) {
    const x = lx + ox;
    p.projectLine(camera, [v3(x, SIDEWALK_Y, lampZ), v3(x, 6.4, lampZ)], {
      color: BONE(0.4), width: 1.0, alpha: 0.85, jitter: 0.14, seed: seed + lx, double: false,
    });
    p.projectLine(camera, [v3(x, 6.4, lampZ), v3(x + 1.4, 6.4, lampZ)], {
      color: BONE(0.34), width: 0.8, alpha: 0.8, jitter: 0.12, seed: seed + lx + 1, double: false,
    });
    const q = camera.project(v3(x + 1.4, 6.3, lampZ));
    if (q && d > 0.35) {
      p.ellipse(q.x, q.y, Math.max(1.2, q.scale * 0.14), Math.max(0.8, q.scale * 0.08), {
        fill: 'rgba(239,233,216,0.75)', stroke: false,
      });
    }
  }
  if (d > 0.32) {
    // Trees on the near pavement: a trunk and three strokes of canopy.
    for (const tx of [-5.2, 6.8]) {
      const x = tx + ox, z = ROAD.z1 + 2.6 + oz;
      p.projectLine(camera, [v3(x, SIDEWALK_Y, z), v3(x, 1.9, z)], {
        color: BONE(0.3), width: 0.9, alpha: 0.85, jitter: 0.12, seed: seed + tx * 1.3, double: false,
      });
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1 + seed;
        p.projectLine(camera, [
          v3(x, 1.9, z),
          v3(x + Math.cos(a) * 0.9, 2.7 + hash11(seed + k) * 0.5, z + Math.sin(a) * 0.7),
        ], { color: BONE(0.22), width: 0.6, alpha: 0.8, jitter: 0.2, seed: seed + k * 7, double: false });
      }
    }
  }
}

/** A complete neighbour cell. `d` is its share of the hero's detail. */
export function drawCell(p, camera, d, dx, dz, opacity = 1) {
  if (opacity <= 0.01) return;
  const { ox, oz } = cellOrigin(dx, dz);
  const seed = 5000 + (dx + 1) * 137 + (dz + 1) * 71;
  // Everything in the cell is drawn through the painter, so one multiplier
  // fades the whole cell without touching any of the call sites inside it.
  const prev = p.alphaMul;
  p.alphaMul = prev * opacity;
  drawCellGround(p, camera, d, ox, oz, seed);
  drawCellBlock(p, camera, d, ox, oz, seed + 500);
  drawCellProps(p, camera, d, ox, oz, seed + 900);
  p.alphaMul = prev;
}
