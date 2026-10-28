// The tile world.
//
// A tile is one 30 x 24.5 m cell of the city. Streets live on the *seams*
// between tiles, never inside one: a street is 7.2 m of carriageway split 3.6 m
// per tile plus a 2.4 m pavement on each side, so a tile that carries a street
// on one of its edges owns a 6.0 m strip there. Two tiles that both carry the
// street on their shared edge make the whole street; that is the only rule the
// world builder needs.
//
//   seam z = k * TD      an east-west street, carriageway split 3.6 + 3.6
//   seam x = k * TW      a north-south street
//
// A tile therefore declares which of its four edges carry a street, and
// everything else - the pavement ring, the building line, the crossings, the
// kerbs - is derived. The block is clipped to the interior between the strips,
// which is what stops a lot from ever standing on the road: there is no
// coordinate in the lot pass that is not inside the interior box.
//
// Kinds are named presets over those four bits:
//
//   block        streets on all four edges - a block with a street on every
//                side (the "solo block")
//   block_ew     north and south only - the block runs on east-west and merges
//                with its neighbours' blocks
//   block_ns     east and west only - the block runs on north-south
//   row          all four, one low storey of shops round the block
//   yard         all four, an open lot instead of buildings
//   intersection all four, the block is a paved crossing square
//   park         no streets, open ground that merges with the neighbouring
//                blocks (a courtyard, not a street)
//
// A seam is built only where both tiles ask for the street, and a street whose
// end would run into a wall is pruned, so any arrangement of kinds produces a
// network with no dead ends. The two lines through the stage (the film's main
// street and its cross street) are always built, so the hero shot cannot be
// authored away.

import { hash11, clamp, lerp } from './math.js';

export const TW = 30;
export const TD = 24.5;

// 7.2 m of carriageway: two 3.6 m lanes, a bus and a car pass with room to
// spare and nothing is parked at the kerb.
export const HALF_ROAD = 3.6;
export const WALK = 2.4;
export const STRIP = HALF_ROAD + WALK;      // 6.0 m: seam -> building line
export const KERB_R = 1.5;
export const WALK_Y = 0.16;                 // pavement top
export const ROAD_Y = 0.012;

export const BITS = { n: 1, e: 2, s: 4, w: 8 };

export const KINDS = [
  { id: 'block', bits: 15, mid: 'block', label: 'block' },
  { id: 'block_ew', bits: 5, mid: 'block', label: 'block e–w' },
  { id: 'block_ns', bits: 10, mid: 'block', label: 'block n–s' },
  { id: 'row', bits: 15, mid: 'row', label: 'shop row' },
  { id: 'yard', bits: 15, mid: 'yard', label: 'yard' },
  { id: 'intersection', bits: 15, mid: 'square', label: 'intersection' },
  { id: 'park', bits: 0, mid: 'park', label: 'park' },
];

export const KIND_IDS = KINDS.map((k) => k.id);
const KIND_BY_ID = new Map(KINDS.map((k) => [k.id, k]));

export function kindFor(id) { return KIND_BY_ID.get(id) || KINDS[0]; }

export function kindIndex(id) {
  const i = KIND_IDS.indexOf(id);
  return i < 0 ? 0 : i;
}

// The stage: the film's main street runs east-west on the seam between tile
// rows 0 and 1, and its cross street runs north-south on the seam between
// columns 0 and 1. Those two lines are always built.
export const STAGE = {
  hz: TD * 0.5,      // main street centre line (z = 12.25)
  hx: TW * 0.5,      // cross street centre line (x = 15)
};

export function tileBounds(i, j) {
  return {
    i, j,
    x0: i * TW - TW / 2,
    x1: i * TW + TW / 2,
    z0: j * TD - TD / 2,
    z1: j * TD + TD / 2,
  };
}

const key = (i, j) => `${i},${j}`;

export const DEFAULT_WORLD = ['block', 'block', 'row', 'block', 'block', 'row', 'row', 'row', 'row'];

// --- the world ------------------------------------------------------------

export function buildWorld({ size = 3, ids = DEFAULT_WORLD, seed = 1 } = {}) {
  const n = Math.max(1, size | 0);
  const half = (n - 1) / 2;
  const indexOf = (i, j) => (j + half) * n + (i + half);
  const inBounds = (i, j) => i >= -half && i <= half && j >= -half && j <= half;
  const kindAt = (i, j) => (inBounds(i, j) ? kindFor(ids[indexOf(i, j)]) : null);

  // Outer edges never carry a street: the block runs out to the edge of the
  // set, so nothing opens out of the volume.
  const wants = (i, j, side) => {
    const k = kindAt(i, j);
    if (!k) return false;
    if (!inBounds(i + (side === 'e' ? 1 : side === 'w' ? -1 : 0),
      j + (side === 'n' ? -1 : side === 's' ? 1 : 0))) return false;
    return (k.bits & BITS[side]) !== 0;
  };

  // Seam segments. H(i,j) is the seam along the north edge of tile (i,j);
  // V(i,j) is the seam along its west edge.
  const H = new Set();
  const V = new Set();
  // Build every seam both sides ask for, then prune the ones that would run
  // into a wall. The stage lines are added whatever the kinds say.
  for (let j = -half; j <= half; j++) {
    for (let i = -half; i <= half; i++) {
      if (wants(i, j, 'n') && wants(i, j - 1, 's')) H.add(key(i, j));
      if (wants(i, j, 'w') && wants(i - 1, j, 'e')) V.add(key(i, j));
    }
  }
  for (let i = -half; i <= half; i++) H.add(key(i, 1));
  for (let j = -half; j <= half; j++) V.add(key(1, j));

  const hOn = (i, j) => H.has(key(i, j));
  const vOn = (i, j) => V.has(key(i, j));
  // The two forced lines: the stage street (south edge of row 0) and its cross
  // street (east edge of column 0).
  const forcedH = (i, j) => j === 1 && inBounds(i, j) && inBounds(i, j - 1);
  const forcedV = (i, j) => i === 1 && inBounds(i, j) && inBounds(i - 1, j);

  for (let pass = 0; pass < 12; pass++) {
    let changed = false;
    for (const k of [...H]) {
      const [i, j] = k.split(',').map(Number);
      if (!inBounds(i, j) || !inBounds(i, j - 1)) { H.delete(k); changed = true; continue; }
      if (!forcedH(i, j) && !(wants(i, j, 'n') && wants(i, j - 1, 's'))) {
        H.delete(k); changed = true; continue;
      }
      const westOk = i === -half || vOn(i, j) || vOn(i, j - 1);
      const eastOk = i === half || vOn(i + 1, j) || vOn(i + 1, j - 1);
      if ((!westOk || !eastOk) && !forcedH(i, j)) { H.delete(k); changed = true; }
    }
    for (const k of [...V]) {
      const [i, j] = k.split(',').map(Number);
      if (!inBounds(i, j) || !inBounds(i - 1, j)) { V.delete(k); changed = true; continue; }
      if (!forcedV(i, j) && !(wants(i, j, 'w') && wants(i - 1, j, 'e'))) {
        V.delete(k); changed = true; continue;
      }
      const northOk = j === -half || hOn(i, j) || hOn(i - 1, j);
      const southOk = j === half || hOn(i, j + 1) || hOn(i - 1, j + 1);
      if ((!northOk || !southOk) && !forcedV(i, j)) { V.delete(k); changed = true; }
    }
    if (!changed) break;
  }

  const tiles = [];
  for (let j = -half; j <= half; j++) {
    for (let i = -half; i <= half; i++) {
      const bits = { n: hOn(i, j), e: vOn(i + 1, j), s: hOn(i, j + 1), w: vOn(i, j) };
      tiles.push(makeTile(i, j, kindAt(i, j), bits, seed, half));
    }
  }

  // Crossings and junctions belong to seams, not tiles: a crossing spans the
  // whole street, so both halves agree on where it is by construction.
  const crossings = [];
  const junctions = [];
  const seamPoint = (i, j) => ({ x: i * TW - TW / 2, z: j * TD - TD / 2 });
  const pushCross = (axis, at, road, corner) => {
    crossings.push({
      id: `x${crossings.length}`, axis, corner,
      x0: axis === 'z' ? at - 1.15 : road[0],
      x1: axis === 'z' ? at + 1.15 : road[1],
      z0: axis === 'z' ? road[0] : at - 1.15,
      z1: axis === 'z' ? road[1] : at + 1.15,
    });
  };

  for (let j = -half; j <= half; j++) {
    for (let i = -half; i <= half; i++) {
      if (hOn(i, j)) {
        const p = seamPoint(i, j);
        const road = [p.z - HALF_ROAD, p.z + HALF_ROAD];
        const west = vOn(i, j) || vOn(i, j - 1);
        const east = vOn(i + 1, j) || vOn(i + 1, j - 1);
        if (west) pushCross('z', p.x + HALF_ROAD + 1.9, road, true);
        if (east) pushCross('z', p.x + TW - HALF_ROAD - 1.9, road, true);
        if (!west && !east) pushCross('z', p.x + TW / 2, road, false);
      }
      if (vOn(i, j)) {
        const p = seamPoint(i, j);
        const road = [p.x - HALF_ROAD, p.x + HALF_ROAD];
        const north = hOn(i, j) || hOn(i - 1, j);
        const south = hOn(i, j + 1) || hOn(i - 1, j + 1);
        if (north) pushCross('x', p.z + HALF_ROAD + 1.9, road, true);
        if (south) pushCross('x', p.z + TD - HALF_ROAD - 1.9, road, true);
        if (!north && !south) pushCross('x', p.z + TD / 2, road, false);
      }
      // A crossroads at the NW corner of the tile.
      // The corner at the NW of this tile: west/east run along the seam in
      // this row, north/south along the seam in the row above and below.
      const arms = {
        e: hOn(i, j), w: hOn(i - 1, j), n: vOn(i, j - 1), s: vOn(i, j),
      };
      const count = [arms.n, arms.e, arms.s, arms.w].filter(Boolean).length;
      if (count === 4) {
        const p = seamPoint(i, j);
        junctions.push({ x: p.x, z: p.z, arms });
      }
    }
  }

  const world = {
    size: n, half, seed, tiles, junctions, crossings,
    props: [], tileAt: new Map(),
    /** the stage street: the seam at z = STAGE.hz */
    stage: {
      hz: STAGE.hz, hx: STAGE.hx,
      n: HALF_ROAD, walk: WALK,
      // the main street, and the cross street that crosses it
      mainOn: hOn(0, 1) || hOn(-1 + 0, 1) || hOn(0, 1),
      crossOn: vOn(1, 0),
    },
  };
  for (const t of tiles) {
    world.tileAt.set(key(t.i, t.j), t);
    world.props.push(...t.props);
  }
  world.stage.mainOn = [...H].some((k) => k.endsWith(',1'));
  world.stage.crossOn = [...V].some((k) => k.startsWith('1,'));
  return world;
}

// One tile: bounds, interior, lots, props.
function makeTile(i, j, kind, bits, seed, half) {
  const b = tileBounds(i, j);
  const s = seed * 977 + (i + half) * 137 + (j + half) * 71;
  const interior = {
    x0: b.x0 + (bits.w ? STRIP : 0),
    x1: b.x1 - (bits.e ? STRIP : 0),
    z0: b.z0 + (bits.n ? STRIP : 0),
    z1: b.z1 - (bits.s ? STRIP : 0),
  };
  const t = {
    i, j, kind: kind.id, mid: kind.mid, bits, seed: s,
    ...b, interior, lots: [], props: [],
  };
  if (kind.mid === 'block') lotsForBlock(t);
  else if (kind.mid === 'row') lotsForRow(t);
  propsForTile(t);
  return t;
}

// --- lots -----------------------------------------------------------------
//
// Every lot is inside the interior box: `lot()` clamps it there, so no lot can
// stand on a street even if a hand-written one asks to. `face` is which side of
// the box the facade looks out of.
function lot(t, o) {
  const I = t.interior;
  if (o.w > I.x1 - I.x0 + 0.01 || o.d > I.z1 - I.z0 + 0.01) return;
  const x = clamp(o.x, I.x0 + o.w / 2, I.x1 - o.w / 2);
  const z = clamp(o.z, I.z0 + o.d / 2, I.z1 - o.d / 2);
  t.lots.push({ ...o, x, z });
}

function lotsForBlock(t) {
  const I = t.interior;
  const w = I.x1 - I.x0;
  const d = I.z1 - I.z0;
  if (w < 4 || d < 4) return;
  const rnd = (k) => hash11(t.seed + k * 7.3);
  // The two rows meet in the middle of the block: a block with a gap between
  // its rows is a block you can see the far street through, which is what made
  // the city read as glass.
  const depth = d / 2;

  const row = (face, k) => {
    const north = face === 'n';
    const n = w > 21 ? 3 : (w > 12.5 ? 2 : 1);
    for (let a = 0; a < n; a++) {
      const lw = w / n;
      const x = I.x0 + (a + 0.5) * lw;
      const h = north ? 5.0 + rnd(k + a) * 9.6 : 2.8 + rnd(k + a + 3) * 5.4;
      lot(t, {
        x, z: north ? I.z0 + depth / 2 : I.z1 - depth / 2,
        w: lw, d: depth, h, face,
        cols: Math.max(2, Math.round(lw / 1.3)),
        rows: Math.max(1, Math.round(h / 2.6)),
        accent: ((t.seed + a + k) | 0) % 3 === 0 ? 'red' : 'teal',
        shop: !north || h < 6.5,
        verticalSign: h > 7.5 && rnd(k + a + 9) > 0.5,
        roofTank: h > 9.5,
      });
    }
  };
  row('n', 10);
  row('s', 20);

}

function lotsForRow(t) {
  const I = t.interior;
  const w = I.x1 - I.x0;
  const d = I.z1 - I.z0;
  if (w < 4 || d < 3) return;
  const depth = d / 2;
  lot(t, {
    x: (I.x0 + I.x1) / 2, z: I.z1 - depth / 2,
    w, d: depth, h: 2.6 + hash11(t.seed + 3) * 0.7,
    face: 's', cols: Math.max(3, Math.round(w / 1.55)), rows: 1,
    accent: 'red', shop: true, awning: true, roofTank: false,
  });
  lot(t, {
    x: (I.x0 + I.x1) / 2, z: I.z0 + depth / 2,
    w, d: depth, h: 2.7 + hash11(t.seed + 7) * 0.8,
    face: 'n', cols: Math.max(3, Math.round(w / 1.55)), rows: 1,
    accent: 'teal', shop: true, awning: true, roofTank: false,
  });
}

// --- props ----------------------------------------------------------------
//
// Furniture stands on the kerb line (0.55 m off the road) or against the
// shopfront line (0.45 m off the building). Nothing goes in the walking band
// between them: that band is what the crowd solver has to keep clear, and a
// prop in it is the one thing steering cannot fix.
function propsForTile(t) {
  const { bits, x0, x1, z0, z1, interior: I } = t;
  const push = (x, z, r, kind) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    if (x < x0 + 0.35 || x > x1 - 0.35 || z < z0 + 0.35 || z > z1 - 0.35) return;
    t.props.push({ x, z, r, kind });
  };
  const kerb = HALF_ROAD + 0.5;
  const span = (a, b, k, bit) => lerp(bit ? a + STRIP + 0.6 : a + 1.5, bit ? b - STRIP - 0.6 : b - 1.5, k);
  if (bits.n) for (const k of [0.26, 0.74]) push(span(x0, x1, k, bits.w || bits.e), z0 + kerb, 0.22, 'lamp');
  if (bits.s) for (const k of [0.34, 0.82]) push(span(x0, x1, k, bits.w || bits.e), z1 - kerb, 0.22, 'lamp');
  if (bits.w) for (const k of [0.42]) push(x0 + kerb, span(z0, z1, k, bits.n || bits.s), 0.22, 'lamp');
  if (bits.e) for (const k of [0.58]) push(x1 - kerb, span(z0, z1, k, bits.n || bits.s), 0.22, 'lamp');

  if (t.mid !== 'square' && t.mid !== 'yard' && t.mid !== 'park') {
    const sz = I.z1 - 0.5;
    const nz = I.z0 + 0.5;
    if (bits.s) {
      push(I.x0 + 1.2, sz, 0.34, 'bin');
      push((I.x0 + I.x1) * 0.5, sz, 0.46, 'vending');
      push(I.x1 - 1.6, sz, 0.30, 'planter');
    }
    if (bits.n) {
      push(I.x0 + 2.0, nz, 0.30, 'bin');
      push(I.x1 - 2.2, nz, 0.28, 'planter');
    }
  }
  // Trees on the long faces, just inside the kerb line.
  if (I.x1 - I.x0 > 11) {
    for (const k of [0.32, 0.7]) {
      const tx = lerp(I.x0, I.x1, k);
      if (bits.s) push(tx, z1 - HALF_ROAD - 1.5, 0.28, 'tree');
      if (bits.n) push(tx, z0 + HALF_ROAD + 1.5, 0.28, 'tree');
    }
  }
}

/** Pavement band of one street edge of a tile, in world coordinates. */
export function bandFor(tile, side) {
  const { x0, x1, z0, z1, bits } = tile;
  const xa = bits.w ? x0 + STRIP : x0;
  const xb = bits.e ? x1 - STRIP : x1;
  const za = bits.n ? z0 + STRIP : z0;
  const zb = bits.s ? z1 - STRIP : z1;
  if (side === 'n') return { x0: xa, x1: xb, z0: z0 + HALF_ROAD, z1: z0 + HALF_ROAD + WALK };
  if (side === 's') return { x0: xa, x1: xb, z0: z1 - HALF_ROAD - WALK, z1: z1 - HALF_ROAD };
  if (side === 'w') return { x0: x0 + HALF_ROAD, x1: x0 + HALF_ROAD + WALK, z0: za, z1: zb };
  return { x0: x1 - HALF_ROAD - WALK, x1: x1 - HALF_ROAD, z0: za, z1: zb };
}
