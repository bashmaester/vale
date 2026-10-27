// One cell of the set, complete enough to be a neighbour.
//
// The hero cell is painted by environment.js at full fidelity. These functions
// paint *any other* cell from the same rules — the same road edges, the same
// pavement ring, the same lane grid — offset by a whole number of cells. That
// is what makes the set tileable: a cell is not a backdrop for the hero, it is
// another copy of the same city, and the street, the kerbs and the markings run
// straight through the seam.
//
// A cell has a **kind**, which is the answer to "what is on my edges?":
//
//   street   an east–west street through the middle and a half north–south
//            street on both x edges. Two of these side by side make one 6 m
//            street with 2.4 m pavements, and the block runs on.
//   block    no side street: the buildings run out to both x edges and merge
//            with the neighbour's. This is what north and south of a street
//            cell has to be, or every cell in the set would be an intersection.
//   yard     the side street is there, but the block is an open lot — fence,
//            containers, parking stripes — so a street edge meets something
//            other than another block.
//
// The edge rule (see `defaultKindFor`) is why a tiled set reads as a city and
// not as nine copies of the same module.
//
// Detail is chosen per cell from its distance to the camera, which is the hook
// the LoD pass needs: `d` here is a fraction (1 = hero, 0.5 = mid, 0.25 = far).

import { v3, lerp, hash11, quadLerp, clamp } from './math.js';
import { TILE, SIDEWALK_Y, TILE_COLORS as C, ROAD_EDGE } from './tile.js';
import {
  ROAD, SIDEWALKS, CROSSWALKS, BUILDING_LOTS, SOUTH_LOTS,
  SOUTH_BLOCK, SIDE_STREET, KERB_RADIUS,
} from './world.js';

const BONE = (a = 1) => `rgba(239,233,216,${a})`;
const TEAL = (a = 1) => `rgba(43,184,174,${a})`;
const RED = (a = 1) => `rgba(212,59,48,${a})`;

export const CELL_W = TILE.x1 - TILE.x0;
export const CELL_D = TILE.z1 - TILE.z0;

export const CELL_KINDS = ['street', 'block', 'yard'];

// Which kind a neighbour is when the set is left on "auto". The street runs
// along x, so the cells to the east and west continue it and the cells to the
// north and south are more block. The diagonals are block as well: a corner
// needs a cell that carries both streets, and this module only carries one.
export function defaultKindFor(dx, dz) {
  if (dz === 0 && dx !== 0) return 'street';
  if (dz === 0 && dx === 0) return 'street';
  return 'block';
}

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
    color = BONE(0.3), width = 0.9, seed = 1, y = 0.024, alpha = 0.85, inset = SIDE_STREET.road,
  } = opts;
  // Dashes start and stop at the side kerbs, not at the cell edge: a dash
  // painted across the north–south street would be a line through a junction.
  // A `block` cell has no side street, so its dashes run edge to edge.
  const X0 = x0 + ox + inset, X1 = x1 + ox - inset;
  const start = Math.ceil(X0 / period) * period;
  let i = 0;
  for (let gx = start; gx < X1 - 0.4; gx += period, i++) {
    const a = gx, b = Math.min(gx + dash, X1);
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

// Plan outline of a pavement corner, rounded at the outside corner. Mirrors the
// hero's corner (environment.cornerOutline) so the seam lands on the same line.
function cornerPlan(kx, bx, cz, sgn, farZ) {
  const out = kx > 0 ? 1 : -1;
  const R = KERB_RADIUS;
  const cx = kx - out * R;
  const cz2 = cz + sgn * R;
  const pts = [[bx, cz], [cx, cz]];
  for (let k = 1; k <= 3; k++) {
    const a = (k / 3) * Math.PI * 0.5;
    pts.push([cx + out * R * Math.sin(a), cz2 - sgn * R * Math.cos(a)]);
  }
  pts.push([kx, farZ], [bx, farZ]);
  return pts;
}

// Ground, road, kerbs, pavements and markings for a cell of any kind.
export function drawCellGround(p, camera, d = 1, ox = 0, oz = 0, seed = 7, kind = 'street') {
  const { x0, x1, z0, z1 } = TILE;
  const X0 = x0 + ox, X1 = x1 + ox, Z0 = z0 + oz, Z1 = z1 + oz;
  const rz0 = ROAD.z0 + oz, rz1 = ROAD.z1 + oz;
  const street = kind !== 'block';

  // The volume's floor slab, then the road, then the raised pavement ring:
  // drawn in that order so a seam has no cracks of background showing through.
  slab(p, camera, X0, X1, Z0, Z1, 0, C.floor, { seed, stroke: BONE(0.06) });
  slab(p, camera, X0, X1, Z0, Z1, 0.004, street ? C.road : C.floor, { seed: seed + 3 });
  if (street) {
    // The two side carriageways, each this cell's half of a shared street.
    slab(p, camera, X0, SIDE_STREET.x0 + ox, Z0, Z1, 0.006, '#0f1116', { seed: seed + 5 });
    slab(p, camera, SIDE_STREET.x1 + ox, X1, Z0, Z1, 0.006, '#0f1116', { seed: seed + 6 });
  }

  // Pavement ring. A `block` cell has pavement right across, because there is no
  // side street to stop it; a `street` cell has the bands plus the four corner
  // returns, which is what lets a pedestrian turn into the side street.
  const bands = street
    ? [[SIDE_STREET.x0, SIDE_STREET.x1], [SIDE_STREET.x0, SIDE_STREET.x1]]
    : [[x0, x1], [x0, x1]];
  slab(p, camera, bands[0][0] + ox, bands[0][1] + ox, rz1, Z1,
    SIDEWALK_Y, C.sidewalk, { seed: seed + 1, stroke: BONE(street ? 0.34 : 0.30) });
  slab(p, camera, bands[1][0] + ox, bands[1][1] + ox, Z0, rz0,
    SIDEWALK_Y, C.sidewalkBack, { seed: seed + 2, stroke: BONE(0.26) });
  // The forecourt: the near block's shops stand on the same level as the
  // pavement, so the seam between them is a step rather than a crack.
  slab(p, camera, bands[1][0] + ox, bands[1][1] + ox, SOUTH_BLOCK.z0 + oz, SOUTH_BLOCK.z1 + oz,
    SIDEWALK_Y, C.sidewalk, { seed: seed + 4 });

  if (street) {
    // Corner returns: the rounded ends of the ring.
    for (const [kx, bx] of [[SIDE_STREET.x0, SIDE_STREET.blockX0], [SIDE_STREET.x1, SIDE_STREET.blockX1]]) {
      for (const [cz, sgn] of [[ROAD.z1, 1], [ROAD.z0, -1]]) {
        const pts = cornerPlan(kx, bx, cz, sgn, sgn > 0 ? z1 : z0);
        const poly = pts.map(([px, pz]) => v3(px + ox, SIDEWALK_Y, pz + oz));
        p.projectPoly(camera, poly, {
          fill: C.sidewalk, stroke: BONE(0.34), width: 0.8, jitter: 0.14, seed: seed + 9 + kx + cz,
        });
      }
    }
  }

  // Kerb faces: a lit edge is what reads as a height difference at this size.
  const kx0 = SIDE_STREET.x0 + ox, kx1 = SIDE_STREET.x1 + ox;
  p.projectPoly(camera, [
    v3(kx0, SIDEWALK_Y, rz1), v3(kx1, SIDEWALK_Y, rz1),
    v3(kx1, 0, rz1), v3(kx0, 0, rz1),
  ], { fill: 'rgba(46,46,52,0.95)', stroke: null, jitter: 0.12, seed: seed + 4 });
  p.projectPoly(camera, [
    v3(kx0, SIDEWALK_Y, rz0), v3(kx1, SIDEWALK_Y, rz0),
    v3(kx1, 0, rz0), v3(kx0, 0, rz0),
  ], { fill: 'rgba(34,34,40,0.95)', stroke: null, jitter: 0.12, seed: seed + 5 });
  // The side kerb, in two runs either side of the main road.
  if (street) {
    for (const kx of [kx0, kx1]) {
      for (const [za, zb] of [[Z0, rz0], [rz1, Z1]]) {
        p.projectPoly(camera, [
          v3(kx, SIDEWALK_Y, za), v3(kx, SIDEWALK_Y, zb),
          v3(kx, 0, zb), v3(kx, 0, za),
        ], { fill: 'rgba(40,40,46,0.92)', stroke: null, jitter: 0.12, seed: seed + 6 + kx + za });
      }
    }
  }

  // Crossings over the side street, mirroring the hero's: bars run along z and
  // repeat across x, at the near pavement band. Two street cells side by side
  // therefore carry one crossing over the whole 6 m street.
  if (street) {
    for (const [sx0, sx1] of [[x0, SIDE_STREET.x0], [SIDE_STREET.x1, x1]]) {
      for (let i = 0; i < 5; i++) {
        const t = (i + 0.5) / 5;
        const xb = lerp(sx0 + 0.55, sx1 - 0.55, t) + ox;
        p.projectPoly(camera, [
          v3(xb - 0.24, 0.022, rz1 + 0.35), v3(xb + 0.24, 0.022, rz1 + 0.35),
          v3(xb + 0.24, 0.022, rz1 + 2.05), v3(xb - 0.24, 0.022, rz1 + 2.05),
        ], {
          fill: BONE(0.40 + hash11(seed + 70 + i) * 0.12), stroke: null,
          jitter: 0.26, seed: seed + 70 + i,
        });
      }
    }
  }

  // Paving joints: coarse on a far cell, one line every 2 m up close.
  const pav = d > 0.55 ? 2.2 : d > 0.3 ? 3.4 : 5.0;
  const jx0 = bands[0][0] + ox, jx1 = bands[0][1] + ox;
  for (let x = jx0 + pav; x < jx1 - 0.2; x += pav) {
    p.projectLine(camera, [v3(x, SIDEWALK_Y + 0.004, rz1 + 0.3), v3(x, SIDEWALK_Y + 0.004, Z1 - 0.2)],
      { color: BONE(0.045), width: 0.55, alpha: 0.8, jitter: 0.14, seed: seed + x * 1.7, double: false });
    p.projectLine(camera, [v3(x, SIDEWALK_Y + 0.004, Z0 + 0.2), v3(x, SIDEWALK_Y + 0.004, rz0 - 0.3)],
      { color: BONE(0.04), width: 0.5, alpha: 0.7, jitter: 0.14, seed: seed + x * 2.3, double: false });
  }

  // Centre line and lane dividers, world-periodic so they cross the seam. A
  // block cell has no side street, so the lines run edge to edge and join the
  // neighbour's lines into one continuous street.
  const inset = kind === 'block' ? 0 : SIDE_STREET.road;
  laneDashes(p, camera, {
    ox, oz, z: 0, color: BONE(d > 0.3 ? 0.32 : 0.2), width: 1.0, seed: seed + 11, inset,
  });
  for (const zz of [-ROAD_EDGE.back * 0.44, ROAD_EDGE.back * 0.44]) {
    laneDashes(p, camera, {
      ox, oz, z: zz, color: BONE(d > 0.3 ? 0.26 : 0.16), width: 0.85, seed: seed + 20 + zz,
      dash: DASH_LEN * 1.35, inset,
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

// The near side of the module: the low shop row. In a `block` cell the row runs
// out to both edges so it meets its neighbour's; in a `street` cell it stops at
// the corner, where the pavement takes over.
function cellShops(p, camera, d, ox, oz, seed, kind) {
  const lots = SOUTH_LOTS.slice();
  if (kind === 'block') {
    // Fill the ends so the row is continuous across the seam.
    const west = { id: 's_fill_w', x: SIDE_STREET.blockX0 - 2.4, z: 9.55, w: 4.6, d: 1.9, h: 2.2, cols: 2, accent: 'teal' };
    const east = { id: 's_fill_e', x: SIDE_STREET.blockX1 + 2.4, z: 9.55, w: 4.6, d: 1.9, h: 2.5, cols: 2, accent: 'red' };
    lots.unshift(west); lots.push(east);
  }
  for (let i = 0; i < lots.length; i++) {
    const b = lots[i];
    const h1 = hash11(seed + i * 4.1), h2 = hash11(seed + i * 8.7);
    const h = b.h * (0.85 + h1 * 0.35);
    const x = b.x + ox + (h2 - 0.5) * 0.8;
    const z = b.z + oz;
    const faces = p.box(camera, [x, SIDEWALK_Y + h / 2, z], [b.w, h, b.d], {
      fill: C.floor, stroke: BONE(0.38), width: 0.8, alpha: 0.98,
      seed: seed + i * 19, jitter: 0.16, edgeAlpha: 0.6, edges: false,
    });
    const front = faces.find((f) => f.name === 'front' && f.visible);
    if (!front) continue;
    p.poly(front.quad, {
      fill: 'rgba(30,30,36,0.97)', stroke: null, jitter: 0.5, seed: seed + i * 5,
    });
    // Sign band facing the street, lit glazing under it.
    p.poly([
      quadLerp(front.quad, 0.03, 0.66), quadLerp(front.quad, 0.97, 0.66),
      quadLerp(front.quad, 0.97, 0.88), quadLerp(front.quad, 0.03, 0.88),
    ], {
      fill: b.accent === 'red' ? RED(0.20) : TEAL(0.16), stroke: null,
      jitter: 0.16, seed: seed + i * 7,
    });
    if (d > 0.35) {
      p.poly([
        quadLerp(front.quad, 0.05, 0.16), quadLerp(front.quad, 0.95, 0.16),
        quadLerp(front.quad, 0.95, 0.60), quadLerp(front.quad, 0.05, 0.60),
      ], {
        fill: b.accent === 'red' ? 'rgba(216,160,58,0.26)' : TEAL(0.20),
        stroke: null, jitter: 0.2, seed: seed + i * 11,
      });
    }
    const top = faces.find((f) => f.name === 'top' && f.visible);
    if (top) p.poly(top.quad, { fill: 'rgba(20,20,24,0.95)', stroke: BONE(0.3), width: 0.7, jitter: 0.14, seed: seed + i * 13 });
  }
}

// The block on the far pavement. In a `street` cell: four lots between the two
// side streets. In a `block` cell: the same lots plus fillers out to each edge,
// so the block runs on across the seam.
export function drawCellBlock(p, camera, d = 1, ox = 0, oz = 0, seed = 7, kind = 'street') {
  const detail = d;
  const lots = BUILDING_LOTS.slice();
  if (kind === 'block') {
    lots.unshift({ id: 'fill_w', x: SIDE_STREET.blockX0 - 2.6, z: -11.8, w: 4.8, d: 4.4, h: 9.4, cols: 3, rows: 4, accent: 'teal', roofTank: false });
    lots.push({ id: 'fill_e', x: SIDE_STREET.blockX1 + 2.6, z: -11.8, w: 4.8, d: 4.4, h: 11.2, cols: 3, rows: 5, accent: 'red', roofTank: true });
  }
  // Painter's algorithm: the lots are drawn far to near, so a tall block never
  // paints its windows through the wall of the one in front of it.
  const order = lots.map((b, i) => {
    const h4 = hash11(seed + i * 11.3);
    const z = b.z + oz + (h4 - 0.5) * 0.8;
    const q = camera.project(v3(b.x + ox, b.h * 0.5, z));
    return { i, depth: q && Number.isFinite(q.depth) ? q.depth : 1e6 };
  }).sort((a, b2) => b2.depth - a.depth);
  for (const ord of order) {
    const i = ord.i;
    const b = lots[i];
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

    // Solid mass: the cell is the same city as the hero, so its walls have to
    // hold the same tone. A cell drawn as an outline only reads as glass.
    for (const f of faces) {
      if (f.name === 'top' || f.name === 'bottom') continue;
      p.poly(f.quad, {
        fill: f.name === 'front' ? 'rgba(30,30,36,0.96)' : 'rgba(15,15,19,0.95)',
        stroke: null, jitter: 0.5, seed: seed + i * 23 + (f.name === 'front' ? 1 : 2),
      });
    }

    // Shopfront band at street level, then the window grid above it.
    const band = [quadLerp(front.quad, 0.06, 0.74), quadLerp(front.quad, 0.94, 0.74),
      quadLerp(front.quad, 0.94, 0.96), quadLerp(front.quad, 0.06, 0.96)];
    p.poly(band, {
      fill: b.accent === 'red' ? RED(0.14) : TEAL(0.12), stroke: null,
      jitter: 0.14, seed: seed + i * 17,
    });

    if (detail > 0.2) {
      const cols = Math.max(2, Math.round((b.cols || 3) * (detail > 0.5 ? 1 : 0.6)));
      const rows = Math.max(2, Math.round((b.rows || 4) * (detail > 0.5 ? 1 : 0.55)));
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
  // The near row goes last: it stands between the camera and everything above.
  cellShops(p, camera, d, ox, oz, seed + 300, kind);
}

// An open lot: what a street edge can meet besides another block. A fence along
// the pavement, containers, parking stripes. Deliberately low so the street it
// borders stays legible.
function cellYard(p, camera, d, ox, oz, seed) {
  const bx0 = SIDE_STREET.blockX0 + ox, bx1 = SIDE_STREET.blockX1 + ox;
  const z0 = TILE.z0 + oz + 1.2, z1 = ROAD.z0 + oz - 0.4;
  // Asphalt, a shade lighter than the street, and painted bay lines.
  slab(p, camera, bx0, bx1, z0, z1, SIDEWALK_Y + 0.002, 'rgba(26,26,30,0.96)', { seed: seed + 1 });
  for (let i = 0; i < 6; i++) {
    const x = lerp(bx0 + 1.2, bx1 - 1.2, i / 5);
    p.projectPoly(camera, [
      v3(x - 0.05, SIDEWALK_Y + 0.006, z1 - 3.4), v3(x + 0.05, SIDEWALK_Y + 0.006, z1 - 3.4),
      v3(x + 0.05, SIDEWALK_Y + 0.006, z1 - 0.8), v3(x - 0.05, SIDEWALK_Y + 0.006, z1 - 0.8),
    ], { fill: BONE(0.16), stroke: null, jitter: 0.2, seed: seed + 10 + i });
  }
  // Fence along the pavement edge, with a gate gap on the centre line.
  for (let i = 0; i < 9; i++) {
    const x = lerp(bx0 + 0.4, bx1 - 0.4, i / 8);
    if (Math.abs(x - (bx0 + bx1) / 2) < 1.1) continue;
    p.projectLine(camera, [v3(x, SIDEWALK_Y, z1 + 0.1), v3(x, SIDEWALK_Y + 1.15, z1 + 0.1)], {
      color: BONE(0.34), width: 0.8, alpha: 0.85, jitter: 0.12, seed: seed + 20 + i, double: false,
    });
  }
  p.projectLine(camera, [v3(bx0 + 0.3, SIDEWALK_Y + 1.1, z1 + 0.1), v3(bx1 - 0.3, SIDEWALK_Y + 1.1, z1 + 0.1)], {
    color: BONE(0.3), width: 0.7, alpha: 0.85, jitter: 0.14, seed: seed + 31, double: false,
  });
  // Containers, a skip, and a low back wall against the rear.
  const boxes = [
    [bx0 + 3.0, 1.3, z0 + 1.4, 3.2, 2.6, 2.2, 'rgba(30,44,46,0.98)'],
    [bx0 + 7.4, 1.1, z0 + 2.6, 2.6, 2.2, 2.0, 'rgba(44,30,30,0.98)'],
  ];
  if (d > 0.35) boxes.push([bx1 - 3.4, 0.85, z0 + 1.9, 2.2, 1.7, 1.8, 'rgba(34,34,40,0.98)']);
  for (let i = 0; i < boxes.length; i++) {
    const [x, hh, z, w, h, dep, fill] = boxes[i];
    p.box(camera, [x, SIDEWALK_Y + h / 2, z], [w, h, dep], {
      fill, stroke: BONE(0.36), width: 0.7, jitter: 0.16, seed: seed + 40 + i,
    });
  }
  // A lamp so the lot is not a hole in the light.
  if (d > 0.4) {
    p.projectLine(camera, [v3(bx1 - 1.0, SIDEWALK_Y, z1 - 2.0), v3(bx1 - 1.0, SIDEWALK_Y + 5.4, z1 - 2.0)], {
      color: BONE(0.36), width: 0.9, alpha: 0.8, jitter: 0.12, seed: seed + 50, double: false,
    });
    const q = camera.project(v3(bx1 - 1.0, SIDEWALK_Y + 5.5, z1 - 2.0));
    if (q) p.ellipse(q.x, q.y, Math.max(1.2, q.scale * 0.12), Math.max(0.8, q.scale * 0.07), {
      fill: 'rgba(239,233,216,0.7)', stroke: false,
    });
  }
}

/** Street furniture, cut down to what survives at a distance. */
export function drawCellProps(p, camera, d = 1, ox = 0, oz = 0, seed = 7, kind = 'street') {
  if (d < 0.18) return;
  if (kind !== 'yard') {
    const lampZ = ROAD.z1 + 0.55 + oz;
    for (const lx of [-8.6, -1.6, 7.4]) {
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
  }
  if (d > 0.32) {
    // Trees on the near pavement: a trunk and three strokes of canopy.
    for (const tx of [-4.6, 5.4]) {
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
export function drawCell(p, camera, d, dx, dz, opacity = 1, kind = 'street') {
  if (opacity <= 0.01) return;
  const { ox, oz } = cellOrigin(dx, dz);
  const seed = 5000 + (dx + 1) * 137 + (dz + 1) * 71;
  // Everything in the cell is drawn through the painter, so one multiplier
  // fades the whole cell without touching any of the call sites inside it.
  const prev = p.alphaMul;
  p.alphaMul = prev * opacity;
  drawCellGround(p, camera, d, ox, oz, seed, kind);
  if (kind === 'yard') {
    // An open lot instead of the far block, and a low fence line where the near
    // row would be: the street edge meets something other than a wall of
    // buildings, which is half of what makes a tiled set read as a city.
    cellYard(p, camera, d, ox, oz, seed + 700);
  } else {
    drawCellBlock(p, camera, d, ox, oz, seed + 500, kind);
  }
  drawCellProps(p, camera, d, ox, oz, seed + 900, kind);
  p.alphaMul = prev;
}
