// Painting a tile.
//
// One function draws any tile of the world, at any distance: the carriageway on
// the seams, the raised plinth, the kerbs, the markings, the crossings, the
// block. `d` is the tile's share of the hero's detail (1 = the tile the camera
// is in, 0.2 = the far edge of the set).
//
// The whole tile is a raised plinth except the streets: the pavement bands and
// the block interior are the same slab at the same height, so there is no step
// between them and a block can run from one tile into the next without a seam.
// The only vertical faces are the kerbs, and they exist only where a street
// does - which is why a tile without a street on an edge has nothing in front
// of its buildings at all.

import { v3, lerp, clamp, hash11, quadLerp } from './math.js';
import { TILE_COLORS as C } from './tile.js';
import {
  HALF_ROAD, WALK, STRIP, KERB_R, WALK_Y, ROAD_Y, TW, TD, bandFor,
} from './tiles.js';
import { drawLot, glow, glowAt, RGB } from './buildings.js';

const BONE = (a = 1) => `rgba(239,233,216,${a})`;
const TEAL = (a = 1) => `rgba(43,184,174,${a})`;
const RED = (a = 1) => `rgba(212,59,48,${a})`;

const ROAD_FILL = '#0b0b0e';
const PAVE_FILL = '#232326';
const PAVE_BACK = '#1b1b1e';

function rect(p, camera, x0, z0, x1, z1, y, opts) {
  p.projectPoly(camera, [
    v3(x0, y, z0), v3(x1, y, z0), v3(x1, y, z1), v3(x0, y, z1),
  ], opts);
}

// A vertical face hanging from y = 0 up to the plinth. `lit` picks the tone:
// the kerb on the camera side of a street is brighter than the far one.
function kerbFace(p, camera, ax, az, bx, bz, lit, seed) {
  p.projectPoly(camera, [
    v3(ax, 0, az), v3(bx, 0, bz), v3(bx, WALK_Y, bz), v3(ax, WALK_Y, az),
  ], {
    fill: lit ? 'rgba(58,58,64,0.97)' : 'rgba(38,38,43,0.97)',
    stroke: null, jitter: 0.1, seed,
  });
}

// The rounded corner where two kerbs meet.
//
// Geometry matters here and the first version had it backwards. The two kerb
// lines are `x = kx` and `z = kz`; the pavement is the quadrant beyond both.
// A true fillet is tangent to both kerbs, so its centre sits R *inside the
// pavement* at (kx + sx*R, kz + sz*R) and the arc bulges back toward the street
// corner. Sweeping the arc around the corner itself — as the old code did —
// put the bulge into the pavement, which read as the pavement swelling out over
// the road. The sliver between the corner and the arc is roadway, not pavement.
function cornerCut(p, camera, cx, cz, sx, sz, seed) {
  const H = HALF_ROAD;
  const R = KERB_R;
  // cx/cz: the tile edge the corner sits on; sx/sz: +1 if the tile's interior
  // is on the positive side of that edge.
  const kx = cx + sx * H;      // the kerb line in x
  const kz = cz + sz * H;      // the kerb line in z
  const fx = kx + sx * R;      // fillet centre, inside the pavement
  const fz = kz + sz * R;
  // Tangent point on each kerb, and the arc between them bulging toward the
  // corner. a = 0 -> (kx, kz + sz*R); a = pi/2 -> (kx + sx*R, kz).
  const arcAt = (a, y) => v3(
    fx - sx * R * Math.cos(a), y, fz - sz * R * Math.sin(a),
  );
  const pts = [v3(kx, ROAD_Y, kz), v3(kx, ROAD_Y, kz + sz * R)];
  for (let i = 1; i < 6; i++) pts.push(arcAt((i / 6) * Math.PI * 0.5, ROAD_Y));
  pts.push(v3(kx + sx * R, ROAD_Y, kz));
  p.projectPoly(camera, pts, { fill: ROAD_FILL, stroke: null, jitter: 0.08, seed });
  // The kerb itself, as a bright stroke along the arc.
  const arc = [];
  for (let i = 0; i <= 6; i++) arc.push(arcAt((i / 6) * Math.PI * 0.5, WALK_Y + 0.004));
  p.projectLine(camera, arc, {
    color: BONE(0.34), width: 0.9, alpha: 0.9, jitter: 0.1, seed: seed + 3, double: false,
  });
}

function drawGround(p, camera, t, d) {
  const { x0, x1, z0, z1, bits, interior: I, seed } = t;
  const H = HALF_ROAD;
  // Road: the whole tile is asphalt first, so every gap between the plinth
  // pieces reads as carriageway rather than as background.
  rect(p, camera, x0, z0, x1, z1, 0, { fill: ROAD_FILL, stroke: null, jitter: 0.16, seed });
  rect(p, camera, x0, z0, x1, z1, ROAD_Y - 0.006, { fill: 'rgba(13,13,16,0.55)', stroke: null, jitter: 0.2, seed: seed + 1 });

  // The plinth: the block interior plus the pavement bands, all at one height.
  rect(p, camera, I.x0, I.z0, I.x1, I.z1, WALK_Y, {
    fill: PAVE_FILL, stroke: null, jitter: 0.14, seed: seed + 2,
  });
  const bands = [];
  if (bits.n) bands.push(['n', [x0 + (bits.w ? H : 0), z0 + H], [x1 - (bits.e ? H : 0), z0 + STRIP]]);
  if (bits.s) bands.push(['s', [x0 + (bits.w ? H : 0), z1 - STRIP], [x1 - (bits.e ? H : 0), z1 - H]]);
  if (bits.w) bands.push(['w', [x0 + H, z0 + (bits.n ? H : 0)], [x0 + STRIP, z1 - (bits.s ? H : 0)]]);
  if (bits.e) bands.push(['e', [x1 - STRIP, z0 + (bits.n ? H : 0)], [x1 - H, z1 - (bits.s ? H : 0)]]);
  for (let i = 0; i < bands.length; i++) {
    const [side, a, b] = bands[i];
    rect(p, camera, a[0], a[1], b[0], b[1], WALK_Y + 0.002, {
      fill: side === 'n' || side === 'w' ? PAVE_FILL : PAVE_BACK,
      stroke: null, jitter: 0.18, seed: seed + 10 + i,
    });
  }

  // Kerbs: only where a street is.
  if (bits.n) {
    const a = x0 + (bits.w ? H : 0);
    const b = x1 - (bits.e ? H : 0);
    kerbFace(p, camera, a, z0 + H, b, z0 + H, false, seed + 20);
  }
  if (bits.s) {
    const a = x0 + (bits.w ? H : 0);
    const b = x1 - (bits.e ? H : 0);
    kerbFace(p, camera, a, z1 - H, b, z1 - H, true, seed + 21);
  }
  if (bits.w) {
    const a = z0 + (bits.n ? H : 0);
    const b = z1 - (bits.s ? H : 0);
    kerbFace(p, camera, x0 + H, a, x0 + H, b, false, seed + 22);
  }
  if (bits.e) {
    const a = z0 + (bits.n ? H : 0);
    const b = z1 - (bits.s ? H : 0);
    kerbFace(p, camera, x1 - H, a, x1 - H, b, true, seed + 23);
  }
  // Rounded corners where two streets meet.
  if (bits.w && bits.n) cornerCut(p, camera, x0, z0, 1, 1, seed + 30);
  if (bits.e && bits.n) cornerCut(p, camera, x1, z0, -1, 1, seed + 31);
  if (bits.w && bits.s) cornerCut(p, camera, x0, z1, 1, -1, seed + 32);
  if (bits.e && bits.s) cornerCut(p, camera, x1, z1, -1, -1, seed + 33);

  // Centre line: dashes along the seam. Drawn by the north and west edges
  // only, so a shared seam is painted once and the dashes stay in register.
  const dash = (xa, xb, z) => {
    const period = 6.0;
    const start = Math.ceil(xa / period) * period;
    let i = 0;
    for (let gx = start; gx < xb - 0.4; gx += period, i++) {
      const b = Math.min(gx + 2.4, xb);
      if (b - gx < 0.3) continue;
      rect(p, camera, gx, z - 0.06, b, z + 0.06, ROAD_Y + 0.01, {
        fill: BONE(d > 0.3 ? 0.30 : 0.16), stroke: null, jitter: 0.14, seed: seed + 40 + i,
      });
    }
  };
  const dashZ = (za, zb, x) => {
    const period = 6.0;
    const start = Math.ceil(za / period) * period;
    let i = 0;
    for (let gz = start; gz < zb - 0.4; gz += period, i++) {
      const b = Math.min(gz + 2.4, zb);
      if (b - gz < 0.3) continue;
      rect(p, camera, x - 0.06, gz, x + 0.06, b, ROAD_Y + 0.01, {
        fill: BONE(d > 0.3 ? 0.30 : 0.16), stroke: null, jitter: 0.14, seed: seed + 50 + i,
      });
    }
  };
  if (bits.n) dash(x0 + (bits.w ? H : 0), x1 - (bits.e ? H : 0), z0);
  if (bits.w) dashZ(z0 + (bits.n ? H : 0), z1 - (bits.s ? H : 0), x0);
}

/** One zebra crossing, in world coordinates. Bars run across the walking line. */
export function drawCrossing(p, camera, c, d) {
  if (d < 0.18) return;
  const along = c.axis === 'z' ? [c.z0, c.z1] : [c.x0, c.x1];
  const across = c.axis === 'z' ? [c.x0, c.x1] : [c.z0, c.z1];
  const bars = d > 0.5 ? 9 : 5;
  for (let i = 0; i < bars; i++) {
    const t = (i + 0.5) / bars;
    const a = lerp(along[0] + 0.32, along[1] - 0.32, t);
    const y = ROAD_Y + 0.014;
    p.projectPoly(camera, c.axis === 'z'
      ? [v3(across[0] + 0.1, y, a - 0.24), v3(across[1] - 0.1, y, a - 0.24),
        v3(across[1] - 0.1, y, a + 0.24), v3(across[0] + 0.1, y, a + 0.24)]
      : [v3(a - 0.24, y, across[0] + 0.1), v3(a + 0.24, y, across[0] + 0.1),
        v3(a + 0.24, y, across[1] - 0.1), v3(a - 0.24, y, across[1] - 0.1)], {
      fill: BONE(0.38 + hash11(i * 3.1 + 7) * 0.12), stroke: null,
      jitter: 0.24, seed: 900 + i * 3.7,
    });
  }
}

// A diagonal crossing across a paved square, drawn from one corner island to
// the one opposite. Only square tiles have these.
function drawDiagonal(p, camera, t, seed) {
  const I = t.interior;
  const m = 0.7;
  for (const dir of [1, -1]) {
    const ax = dir > 0 ? I.x0 + m : I.x1 - m;
    const bx = dir > 0 ? I.x1 - m : I.x0 + m;
    const n = 11;
    for (let i = 0; i < n; i++) {
      const s0 = (i + 0.18) / n;
      const s1 = (i + 0.72) / n;
      const x0 = lerp(ax, bx, s0), x1 = lerp(ax, bx, s1);
      const z0 = lerp(I.z0 + m, I.z1 - m, s0), z1 = lerp(I.z0 + m, I.z1 - m, s1);
      const off = dir > 0 ? 0.26 : -0.26;
      p.projectPoly(camera, [
        v3(x0 - off * 0.4, WALK_Y + 0.006, z0 + off), v3(x1 - off * 0.4, WALK_Y + 0.006, z1 + off),
        v3(x1 + off * 0.4, WALK_Y + 0.006, z1 - off * 0.0), v3(x0 + off * 0.4, WALK_Y + 0.006, z0),
      ], { fill: BONE(0.20), stroke: null, jitter: 0.2, seed: seed + i * 2.3 + dir });
    }
  }
}

// The low stuff: lamps, trees, bins, planters, bollards.
function drawProp(p, camera, t, q, d) {
  if (d < 0.2) return;
  {
    const i = t.props.indexOf(q);
    const seed = t.seed + 700 + i * 11;
    const spot = camera.project(v3(q.x, WALK_Y, q.z));
    if (!spot) return;
    const far = d < 0.42;
    if (q.kind === 'lamp') {
      const h = 5.6;
      p.projectLine(camera, [v3(q.x, WALK_Y, q.z), v3(q.x, h, q.z)], {
        color: BONE(0.40), width: 1.0, alpha: 0.85, jitter: 0.14, seed, double: false,
      });
      // The arm points into the street: away from the tile's interior.
      const I = t.interior;
      const dx = q.x < (I.x0 + I.x1) / 2 ? -1 : 1;
      p.projectLine(camera, [v3(q.x, h, q.z), v3(q.x + dx * 1.3, h - 0.1, q.z)], {
        color: BONE(0.34), width: 0.8, alpha: 0.8, jitter: 0.12, seed: seed + 1, double: false,
      });
      if (!far) {
        const head = camera.project(v3(q.x + dx * 1.3, h - 0.16, q.z));
        if (head) {
          p.ellipse(head.x, head.y, Math.max(1.1, head.scale * 0.10), Math.max(0.7, head.scale * 0.06),
            { fill: 'rgba(239,233,216,0.75)', stroke: false });
          glow(p, head.x, head.y, Math.max(2, head.scale * 0.22), '239,233,216', 0.10);
        }
      }
    } else if (q.kind === 'tree') {
      if (far) return;
      p.projectLine(camera, [v3(q.x, WALK_Y, q.z), v3(q.x, 1.9, q.z)], {
        color: BONE(0.30), width: 0.9, alpha: 0.85, jitter: 0.12, seed, double: false,
      });
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1 + t.seed * 0.01;
        p.projectLine(camera, [
          v3(q.x, 1.9, q.z),
          v3(q.x + Math.cos(a) * 0.9, 2.7 + hash11(seed + k) * 0.5, q.z + Math.sin(a) * 0.7),
        ], { color: BONE(0.22), width: 0.6, alpha: 0.8, jitter: 0.2, seed: seed + k * 7, double: false });
      }
    } else if (q.kind === 'vending') {
      p.box(camera, [q.x, WALK_Y + 0.95, q.z], [0.9, 1.9, 0.72], {
        fill: '#0c1412', stroke: BONE(0.52), width: 0.8, alpha: 0.98,
        seed, jitter: 0.16, edgeAlpha: 0.7,
      });
      const face = camera.project(v3(q.x, WALK_Y + 1.05, q.z + 0.38));
      if (face) {
        p.rect(face.x - 3, face.y - 8, 6, 16, {
          fill: TEAL(0.4), stroke: BONE(0.3), width: 0.5, jitter: 0.1, seed: seed + 1,
        });
      }
    } else if (q.kind === 'bin') {
      if (far) return;
      p.box(camera, [q.x, WALK_Y + 0.42, q.z], [0.5, 0.84, 0.5], {
        fill: '#0e1110', stroke: BONE(0.34), width: 0.6, alpha: 0.95,
        seed, jitter: 0.14, edgeAlpha: 0.6,
      });
      p.projectLine(camera, [v3(q.x - 0.28, WALK_Y + 0.88, q.z), v3(q.x + 0.28, WALK_Y + 0.88, q.z)], {
        color: BONE(0.4), width: 0.6, alpha: 0.85, jitter: 0.1, seed: seed + 1, double: false,
      });
    } else if (q.kind === 'planter') {
      if (far) return;
      p.box(camera, [q.x, WALK_Y + 0.22, q.z], [0.62, 0.44, 0.62], {
        fill: '#101413', stroke: BONE(0.34), width: 0.6, alpha: 0.95,
        seed, jitter: 0.14, edgeAlpha: 0.6,
      });
      const h = 0.9 + hash11(seed) * 0.4;
      const q2 = camera.project(v3(q.x, WALK_Y + 0.44, q.z));
      const q3 = camera.project(v3(q.x, WALK_Y + h, q.z));
      if (q2 && q3) {
        p.line([[q2.x - 4, q2.y], [q3.x, q3.y], [q2.x + 4, q2.y]], {
          color: TEAL(0.34), width: 0.7, alpha: 0.8, jitter: 0.24, seed: seed + 2, double: false,
        });
      }
    }
  }
}

// A traffic signal on the corner of a junction: a pole with a head that reads
// on the camera side, plus a pedestrian head at eye level.
function drawSignal(p, camera, x, z, yaw, walk, seed, d) {
  if (d < 0.22) return;
  const y = WALK_Y;
  p.projectLine(camera, [v3(x, y, z), v3(x, 4.5, z)], {
    color: 'rgba(8,10,9,0.95)', width: 2.0, alpha: 0.95, jitter: 0.1, seed, double: false,
  });
  p.projectLine(camera, [v3(x, y, z), v3(x, 4.5, z)], {
    color: BONE(0.42), width: 0.7, alpha: 0.7, jitter: 0.1, seed: seed + 1, double: false,
  });
  const hx = x - Math.sin(yaw) * 0.0, hz = z - Math.cos(yaw) * 0.0;
  const head = p.box(camera, [hx, 4.15, hz], [0.42, 1.05, 0.34], {
    fill: 'rgba(4,7,5,0.98)', stroke: BONE(0.7), width: 0.8, alpha: 1,
    seed: seed + 2, jitter: 0.12, edgeAlpha: 0.8,
  });
  const facing = camera.project(v3(hx, 4.15, hz + Math.cos(yaw) * 0.2));
  if (facing) {
    const on = walk ? 1 : 0;
    for (let k = 0; k < 3; k++) {
      const col = k === on ? (walk ? TEAL(0.95) : RED(0.95)) : 'rgba(12,14,13,0.9)';
      const q = camera.project(v3(hx, 4.52 - k * 0.31, hz));
      if (!q) continue;
      p.ellipse(q.x, q.y, Math.max(1.2, q.scale * 0.055), Math.max(1.2, q.scale * 0.055),
        { fill: col, stroke: BONE(0.2), width: 0.4, alpha: 1 });
      if (k === on) glow(p, q.x, q.y, Math.max(2, q.scale * 0.2), walk ? '43,184,174' : '212,59,48', 0.4);
    }
  }
  // Pedestrian head, lower on the pole.
  const ped = camera.project(v3(x, y + 2.55, z));
  if (ped) {
    p.rect(ped.x - 4, ped.y - 5, 8, 10, {
      fill: 'rgba(5,8,6,0.95)', stroke: BONE(0.45), width: 0.5, jitter: 0.1, seed: seed + 4,
    });
    glow(p, ped.x, ped.y, Math.max(2, ped.scale * 0.12), walk ? '43,184,174' : '212,59,48', 0.28);
  }
}

/** One tile: ground, block, props. */
export function drawTile(p, camera, t, d, opts = {}) {
  drawGround(p, camera, t, d);
  const detail = {
    windows: clamp(d, 0.3, 1) * (opts.detail ? opts.detail.windows : 1),
    windowLight: clamp(d, 0.3, 1) * (opts.detail ? opts.detail.windowLight : 1),
    props: d > 0.35 ? (opts.detail ? opts.detail.props : 1) : 0,
    roofs: d,
  };
  if (t.mid === 'square') {
    if (opts.diag) drawDiagonal(p, camera, t, t.seed + 60);
    // The square is a crossing place: a bench line and a tree in each corner.
  } else if (t.mid === 'yard') {
    drawYard(p, camera, t, d, detail);
  } else if (t.mid === 'park') {
    drawPark(p, camera, t, d, detail);
  }
  if (t.lots.length) {
    const order = t.lots.map((b, i) => {
      const q = camera.project(v3(b.x, b.h * 0.5, b.z));
      return { i, depth: q && Number.isFinite(q.depth) ? q.depth : 1e6 };
    }).sort((a, b) => b.depth - a.depth);
    for (const ord of order) {
      drawLot(p, camera, t.lots[ord.i], detail, t.seed + 500 + ord.i * 131);
    }
  }
  drawTileProps(p, camera, t, d);
}

// An open lot: hardstanding, bay lines, a fence, containers.
function drawYard(p, camera, t, d, detail) {
  const I = t.interior;
  if (I.x1 - I.x0 < 3 || I.z1 - I.z0 < 3) return;
  const seed = t.seed + 800;
  rect(p, camera, I.x0 + 0.3, I.z0 + 0.3, I.x1 - 0.3, I.z1 - 0.3, WALK_Y + 0.004,
    { fill: 'rgba(24,24,28,0.97)', stroke: BONE(0.16), width: 0.7, jitter: 0.2, seed });
  for (let i = 0; i < 6; i++) {
    const x = lerp(I.x0 + 1.2, I.x1 - 1.2, i / 5);
    rect(p, camera, x - 0.05, I.z1 - 3.6, x + 0.05, I.z1 - 1.0, WALK_Y + 0.008,
      { fill: BONE(0.14), stroke: null, jitter: 0.2, seed: seed + 10 + i });
  }
  const boxes = [
    [I.x0 + 3.0, I.z0 + 1.6, 3.2, 2.6, 2.2, 'rgba(30,44,46,0.98)'],
    [I.x0 + 7.2, I.z0 + 2.6, 2.6, 2.2, 2.0, 'rgba(44,30,30,0.98)'],
  ];
  if (d > 0.4) boxes.push([I.x1 - 3.2, I.z0 + 1.9, 2.2, 1.7, 1.8, 'rgba(34,34,40,0.98)']);
  for (let i = 0; i < boxes.length; i++) {
    const [x, z, w, h, dep, fill] = boxes[i];
    p.box(camera, [x, WALK_Y + h / 2, z], [w, h, dep], {
      fill, stroke: BONE(0.36), width: 0.7, jitter: 0.16, seed: seed + 40 + i,
    });
  }
  // Fence along the two street faces, with a gate gap on the centre line.
  for (const side of ['s', 'n']) {
    const z = side === 's' ? I.z1 - 0.2 : I.z0 + 0.2;
    for (let i = 0; i < 9; i++) {
      const x = lerp(I.x0 + 0.5, I.x1 - 0.5, i / 8);
      if (Math.abs(x - (I.x0 + I.x1) / 2) < 1.2) continue;
      p.projectLine(camera, [v3(x, WALK_Y, z), v3(x, WALK_Y + 1.15, z)], {
        color: BONE(0.32), width: 0.8, alpha: 0.85, jitter: 0.12,
        seed: seed + 60 + i + (side === 'n' ? 20 : 0), double: false,
      });
    }
    p.projectLine(camera, [v3(I.x0 + 0.4, WALK_Y + 1.1, z), v3(I.x1 - 0.4, WALK_Y + 1.1, z)], {
      color: BONE(0.28), width: 0.7, alpha: 0.85, jitter: 0.14, seed: seed + 90 + (side === 'n' ? 1 : 0), double: false,
    });
  }
}

// A park: open ground with a low wall and trees, merging with the blocks
// around it.
function drawPark(p, camera, t, d, detail) {
  const I = t.interior;
  const seed = t.seed + 820;
  rect(p, camera, I.x0, I.z0, I.x1, I.z1, WALK_Y + 0.002,
    { fill: 'rgba(15,22,19,0.97)', stroke: null, jitter: 0.2, seed });
  for (let i = 0; i < 7; i++) {
    const x = lerp(I.x0 + 1.4, I.x1 - 1.4, hash11(seed + i * 3.1));
    const z = lerp(I.z0 + 1.4, I.z1 - 1.4, hash11(seed + i * 5.7));
    p.projectLine(camera, [v3(x, WALK_Y, z), v3(x, WALK_Y + 2.2, z)], {
      color: BONE(0.22), width: 0.8, alpha: 0.8, jitter: 0.2, seed: seed + 10 + i, double: false,
    });
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + i;
      p.projectLine(camera, [
        v3(x, WALK_Y + 2.2, z),
        v3(x + Math.cos(a) * 1.1, WALK_Y + 3.1 + hash11(seed + i + k) * 0.6, z + Math.sin(a) * 0.9),
      ], { color: BONE(0.18), width: 0.6, alpha: 0.75, jitter: 0.2, seed: seed + 20 + i * 3 + k, double: false });
    }
  }
}

/**
 * The whole set. Tiles are painted far to near; inside a tile the ground goes
 * down first, then the block, then the furniture. Crossings come last in the
 * road pass so a zebra is never covered by a pavement.
 */
export function drawWorld(p, camera, world, detail, opts = {}) {
  const list = world.tiles.map((t) => {
    const cx = (t.x0 + t.x1) / 2, cz = (t.z0 + t.z1) / 2;
    const q = camera.project(v3(cx, 0, cz));
    const dist = Math.hypot(cx - camera.eye.x, cz - camera.eye.z);
    return { t, depth: q && Number.isFinite(q.depth) ? q.depth : 1e6, dist };
  }).sort((a, b) => b.depth - a.depth);
  for (const it of list) it.d = clamp(1.2 - it.dist / 118, 0.15, 1);

  // 1) Every ground plane first, far to near. The plinths are flat, so they can
  //    all go down before anything stands on them.
  for (const it of list) drawGround(p, camera, it.t, it.d);

  const depthAt = (x, y, z) => {
    const q = camera.project(v3(x, y, z));
    return q && Number.isFinite(q.depth) ? q.depth : 1e6;
  };

  // 2) Everything that stands on the ground, in one depth-sorted list. Each
  //    tile used to be painted as a unit, which is what let a crossing behind a
  //    building print through it: a street three tiles away and a shopfront in
  //    the foreground share the same screen space, so they have to be compared
  //    by depth, not by tile.
  const items = [];
  for (const it of list) {
    if (it.t.mid === 'square' && opts.diag) {
      items.push({ depth: it.depth + 0.4, draw: (pp) => drawDiagonal(pp, camera, it.t, it.t.seed + 60) });
    } else if (it.t.mid === 'yard') {
      items.push({ depth: it.depth, draw: (pp) => drawYard(pp, camera, it.t, it.d, {}) });
    } else if (it.t.mid === 'park') {
      items.push({ depth: it.depth, draw: (pp) => drawPark(pp, camera, it.t, it.d, {}) });
    }
    if (it.d >= 0.14) {
      for (let i = 0; i < it.t.lots.length; i++) {
        const b = it.t.lots[i];
        // The sort key is the nearest corner of the box: a tall block two
        // streets away has a centre nearer the camera than a low block in the
        // foreground, and sorting on the centre paints it through the near wall.
        let depth = 1e6;
        for (let sx = -1; sx <= 1; sx += 2) {
          for (let sy = 0; sy <= 1; sy += 2) {
            for (let sz = -1; sz <= 1; sz += 2) {
              const q = camera.project(v3(b.x + sx * b.w * 0.5, sy * b.h, b.z + sz * b.d * 0.5));
              if (q && Number.isFinite(q.depth)) depth = Math.min(depth, q.depth);
            }
          }
        }
        const seed = it.t.seed + 500 + i * 131;
        const d = it.d;
        const spec = {
          windows: clamp(d, 0.78, 1) * (detail ? detail.windows : 1),
          windowLight: clamp(d, 0.45, 1) * (detail ? detail.windowLight : 1),
          props: d > 0.4 ? (detail ? detail.props : 1) : 0,
          near: clamp((d - 0.2) / 0.8, 0, 1),
        };
        items.push({ depth, draw: (pp) => drawLot(pp, camera, b, spec, seed) });
      }
    }
    for (const q of it.t.props) {
      items.push({
        depth: depthAt(q.x, WALK_Y, q.z),
        draw: (pp) => drawProp(pp, camera, it.t, q, it.d),
      });
    }
  }
  for (const c of world.crossings) {
    const dist = Math.hypot((c.x0 + c.x1) / 2 - camera.eye.x, (c.z0 + c.z1) / 2 - camera.eye.z);
    const d = clamp(1.1 - dist / 70, 0.15, 1);
    items.push({
      depth: depthAt((c.x0 + c.x1) / 2, 0, (c.z0 + c.z1) / 2),
      draw: (pp) => drawCrossing(pp, camera, c, d),
    });
  }
  for (const j of world.junctions) {
    const dist = Math.hypot(j.x - camera.eye.x, j.z - camera.eye.z);
    const d = clamp(1.1 - dist / 70, 0.15, 1);
    const o = HALF_ROAD + 0.55;
    const spots = [[o, o, 0.25], [o, -o, 1.25], [-o, -o, 0.75], [-o, o, 1.75]];
    for (let k = 0; k < spots.length; k++) {
      const [ox, oz, turn] = spots[k];
      const x = j.x + ox, z = j.z + oz;
      items.push({
        depth: depthAt(x, 2.2, z),
        draw: (pp) => drawSignal(pp, camera, x, z, Math.PI * turn, false, 4000 + k * 37 + j.x, d),
      });
    }
  }
  items.sort((a, b) => b.depth - a.depth);
  for (const it of items) it.draw(p);
}

/**
 * The lit lamp of every signal head, drawn over the cached set so the signal
 * cycle keeps running while the city itself does not repaint. The pedestrian
 * window is the one where the cars are held at the line, so the walk lamp and
 * the stop lamp are the same clock read two ways.
 */
export function drawSignalLamps(p, camera, world, u) {
  if (!world) return;
  const walk = u > 0.14 && u < 0.74;
  for (const j of world.junctions) {
    const o = HALF_ROAD + 0.55;
    const spots = [
      [j.x + o, j.z + o], [j.x + o, j.z - o], [j.x - o, j.z - o], [j.x - o, j.z + o],
    ];
    for (let k = 0; k < spots.length; k++) {
      const [x, z] = spots[k];
      const q = camera.project(v3(x, 4.52 - 1 * 0.31, z));
      if (!q) continue;
      p.ellipse(q.x, q.y, Math.max(1.2, q.scale * 0.055), Math.max(1.2, q.scale * 0.055),
        { fill: walk ? TEAL(0.95) : RED(0.95), stroke: false, alpha: 1 });
      glow(p, q.x, q.y, Math.max(2, q.scale * 0.2), walk ? '43,184,174' : '212,59,48', 0.35);
    }
  }
}
