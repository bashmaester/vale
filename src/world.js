// World rules for the stage.
//
// The city is a grid of tiles (see tiles.js). The film's *stage* is the east-west
// street on the seam at z = 12.25 and the crossroads where it meets the street
// at x = 15: that is where the crowd walks, where the cars drive and where the
// camera lives. Everything here is measured from that seam, so moving the stage
// moves every prop, flow and signal with it.
//
//   z  6.25 ..  8.65   north pavement (in front of the centre block)
//   z  8.65 .. 12.25   north half of the carriageway, westbound lane at 10.45
//   z 12.25 .. 15.85   south half, eastbound lane at 14.05
//   z 15.85 .. 18.25   south pavement (in front of the near shop row)
//
// The street is 7.2 m of carriageway with 2.4 m pavements: two lanes of 3.6 m,
// nothing parked at the kerb, so a bus and a car pass without either of them
// swerving.

import { clamp } from './math.js';
import { HALF_ROAD, WALK, TW, TD, STAGE, KERB_R, WALK_Y } from './tiles.js';

export const HZ = STAGE.hz;          // 12.25, the main street centre line
export const HX = STAGE.hx;          // 15.0, the cross street centre line
export const H = HALF_ROAD;

// The carriageway of the stage street, in world z.
export const ROAD = { x0: STAGE.hx - TW * 1.5, x1: STAGE.hx + TW * 1.5, z0: HZ - H, z1: HZ + H };

// Kerb offsets: anything that wants to stand just off the road.
export const KERB = {
  north: ROAD.z0 - 0.55,
  south: ROAD.z1 + 0.55,
  northIn: ROAD.z0 + 0.9,
  southIn: ROAD.z1 - 0.9,
};

// Walking bands. The pavement is 2.4 m deep; people walk down the middle of it
// and the furniture stands on the two edges.
export const BANDS = {
  n: { z0: ROAD.z0 - WALK, z1: ROAD.z0, mid: ROAD.z0 - WALK * 0.55 },
  s: { z0: ROAD.z1, z1: ROAD.z1 + WALK, mid: ROAD.z1 + WALK * 0.45 },
};

// One lane each way, 3.6 m apart inside a 7.2 m carriageway. Right-hand rule:
// eastbound in the near lane, westbound in the far one.
export const LANES = [
  { id: 'E', axis: 'x', offset: HZ + H * 0.5, dir: 1 },
  { id: 'W', axis: 'x', offset: HZ - H * 0.5, dir: -1 },
];

// The four signal heads on the corners of the stage junction. `arm` is how far
// the head reaches out over its own lane and `toward` which way it looks, so the
// light is over the traffic that has to obey it and the head faces that traffic.
export const SIGNAL_POSITIONS = [
  { id: 'nw', x: HX - H - 0.6, z: HZ - H - 0.6, yaw: 0, toward: { x: 0, z: 1 }, arm: 2.6 },
  { id: 'ne', x: HX + H + 0.6, z: HZ - H - 0.6, yaw: Math.PI, toward: { x: 0, z: 1 }, arm: 2.6 },
  { id: 'se', x: HX + H + 0.6, z: HZ + H + 0.6, yaw: Math.PI, toward: { x: 0, z: -1 }, arm: 2.6 },
  { id: 'sw', x: HX - H - 0.6, z: HZ + H + 0.6, yaw: 0, toward: { x: 0, z: -1 }, arm: 2.6 },
];

// Crossings the traffic has to obey. The stage street crosses the side street
// at x = ±9.5 from its kerbs, so a car stops short of the near one and drives
// through the junction in the pedestrian window.
export const CROSSWALKS = {
  main: { x0: HX - H - 4.0, x1: HX - H - 1.7, z0: ROAD.z0, z1: ROAD.z1 },
  west: { x0: -HX + H + 1.7, x1: -HX + H + 4.0, z0: ROAD.z0, z1: ROAD.z1 },
  diagonalHalfWidth: 2.0,
};

// Things a person has to walk around. Kept in step with the tile furniture
// pass: the crowd uses this list to steer, so a lamp post that is not here is a
// lamp post people walk straight through. `setWorld` refills it when the tile
// grid changes, so the two never drift.
export const STREET_PROPS = [];

// Waiting zones, biased toward the crossings.
export const WAIT_ZONES = [
  { id: 'cross_w_s', weight: 0.26, x0: CROSSWALKS.west.x0 - 1.2, x1: CROSSWALKS.west.x1 + 2.2, z0: BANDS.s.z0 + 0.35, z1: BANDS.s.z1 - 0.2 },
  { id: 'cross_e_n', weight: 0.24, x0: CROSSWALKS.main.x1 + 0.2, x1: CROSSWALKS.main.x1 + 3.4, z0: BANDS.n.z0 + 0.35, z1: BANDS.n.z1 - 0.2 },
  { id: 'shop_s', weight: 0.28, x0: -7.4, x1: 7.4, z0: BANDS.s.z0 + 0.35, z1: BANDS.s.z1 - 0.25 },
  { id: 'shop_n', weight: 0.22, x0: -11.6, x1: 8.4, z0: BANDS.n.z0 + 0.35, z1: BANDS.n.z1 - 0.25 },
];

// Pedestrian motion. Strolling runs along x inside a pavement band; crossings
// run along z and land on the same x as the zebra under the signal. Every flow
// is a patch plus a delta, so people fan out instead of marching in line.
const SN = BANDS.n;
const SS = BANDS.s;
const CW = 9.5;    // the stage crossing, near the junction
const CWE = -9.5;  // the other one, at the west junction

export const FLOWS = [
  { id: 'cross_e_s2n', kind: 'cross', weight: 0.15,
    bounds: { x0: CW - 0.9, x1: CW + 0.9, z0: SS.z0 + 0.4, z1: SS.z1 - 0.3 },
    delta: { x: 0.1, z: -(SS.z0 - SN.z1) - 0.8 }, bend: 0.5, corner: CW },
  { id: 'cross_e_n2s', kind: 'cross', weight: 0.13,
    bounds: { x0: CW - 0.9, x1: CW + 0.9, z0: SN.z0 + 0.3, z1: SN.z1 - 0.4 },
    delta: { x: -0.1, z: (SS.z0 - SN.z1) + 0.8 }, bend: -0.5, corner: CW },
  { id: 'cross_w_n2s', kind: 'cross', weight: 0.10,
    bounds: { x0: CWE - 0.9, x1: CWE + 0.9, z0: SN.z0 + 0.3, z1: SN.z1 - 0.4 },
    delta: { x: 0.2, z: (SS.z0 - SN.z1) + 0.8 }, bend: 0.4, corner: CWE },
  { id: 'south_e', kind: 'stroll', weight: 0.16,
    bounds: { x0: -8.6, x1: -2.4, z0: SS.z0 + 0.45, z1: SS.z1 - 0.35 }, delta: { x: 15.0, z: 0 }, bend: 0.8 },
  { id: 'south_w', kind: 'stroll', weight: 0.14,
    bounds: { x0: 2.4, x1: 8.6, z0: SS.z0 + 0.45, z1: SS.z1 - 0.35 }, delta: { x: -15.0, z: 0 }, bend: -0.7 },
  { id: 'north_e', kind: 'stroll', weight: 0.12,
    bounds: { x0: -11.4, x1: -4.6, z0: SN.z0 + 0.4, z1: SN.z1 - 0.45 }, delta: { x: 13.0, z: 0.2 }, bend: 0.6 },
  { id: 'north_w', kind: 'stroll', weight: 0.10,
    bounds: { x0: 1.4, x1: 7.2, z0: SN.z0 + 0.4, z1: SN.z1 - 0.45 }, delta: { x: -13.0, z: -0.2 }, bend: -0.6 },
  // Round the corner: east along the near pavement, across at the junction,
  // then north up the cross street's west pavement. This is the flow the corner
  // paving exists for.
  { id: 'corner_ne', kind: 'stroll', weight: 0.10,
    bounds: { x0: 4.2, x1: 7.2, z0: SS.z0 + 0.5, z1: SS.z1 - 0.4 }, delta: { x: 0, z: -1 }, bend: 0,
    via: [
      { x: 9.9, z: SS.z0 + 1.15 },
      { x: 10.2, z: 14.4 },
      { x: 10.2, z: 9.4 },
      { x: 10.2, z: 8.2 },
      { x: 10.2, z: 4.0 },
      { x: 10.2, z: -3.2 },
      { x: 10.2, z: -8.2 },
    ] },
];

// Colour accents as light on the wet ground. z is the base of each source, so
// the smear runs toward the camera.
export const LIGHT_SOURCES = [
  { x: 1.9, z: 6.7, color: 'teal', w: 4.2, h: 3.0, seed: 11 },
  { x: 6.9, z: 6.7, color: 'red', w: 3.0, h: 3.4, seed: 12 },
  { x: 11.4, z: 6.7, color: 'teal', w: 1.1, h: 5.2, seed: 13 },
  { x: -2.55, z: 6.7, color: 'red', w: 1.1, h: 4.8, seed: 14 },
  { x: -7.15, z: 6.7, color: 'red', w: 2.6, h: 7.5, seed: 15 },
  { x: 4.4, z: 17.6, color: 'red', w: 2.2, h: 2.2, seed: 16 },
  { x: -7.6, z: 17.6, color: 'teal', w: 1.8, h: 2.2, seed: 17 },
];

// Puddles pool at the kerbs and under the lights.
export const PUDDLES = [
  { x: -8.4, z: 10.6, rx: 2.7, rz: 0.8, rot: 0.04, tint: 'teal', seed: 21 },
  { x: -1.1, z: 13.6, rx: 2.05, rz: 0.72, rot: -0.10, tint: 'red', seed: 22 },
  { x: 6.3, z: 11.2, rx: 2.35, rz: 0.86, rot: 0.09, tint: 'bone', seed: 23 },
  { x: 11.9, z: 14.4, rx: 1.75, rz: 0.62, rot: 0.20, tint: 'teal', seed: 24 },
  { x: -13.2, z: 13.4, rx: 2.15, rz: 0.74, rot: -0.14, tint: 'bone', seed: 25 },
  { x: 2.5, z: 9.8, rx: 1.55, rz: 0.55, rot: 0.28, tint: 'red', seed: 26 },
  { x: -2.4, z: 7.3, rx: 1.55, rz: 0.58, rot: 0.06, tint: 'bone', seed: 27 },
  { x: 8.4, z: 16.9, rx: 1.75, rz: 0.68, rot: 0.18, tint: 'teal', seed: 28 },
  { x: -9.8, z: 17.6, rx: 1.35, rz: 0.52, rot: -0.18, tint: 'bone', seed: 29 },
  { x: 4.7, z: 12.9, rx: 1.20, rz: 0.48, rot: 0.12, tint: 'teal', seed: 30 },
];

// --- the live world -------------------------------------------------------
//
// crowd.js and traffic.js ask where the ground and the roads are; that depends
// on the tile grid, which the sidebar can rebuild. One mutable reference keeps
// the question cheap.
let WORLD = null;

export function setWorld(world) {
  WORLD = world;
  LINES = null;
  STREET_PROPS.length = 0;
  // Only the props the stage can reach take part in the crowd solve.
  for (const q of world.props) {
    if (q.x < -46 || q.x > 44 || q.z < -4 || q.z > 30) continue;
    STREET_PROPS.push(q);
  }
}

export function getWorld() { return WORLD; }

// Horizontal and vertical road centre lines with the spans they occupy.
function linesOf(world) {
  const out = { h: [], v: [] };
  if (!world) return out;
  const spans = new Map();
  for (const t of world.tiles) {
    if (t.bits.n) {
      const z = t.z0;
      const a = spans.get(`h${z}`) || { z, spans: [] };
      a.spans.push([t.x0, t.x1]);
      spans.set(`h${z}`, a);
    }
    if (t.bits.w) {
      const x = t.x0;
      const a = spans.get(`v${x}`) || { x, spans: [] };
      a.spans.push([t.z0, t.z1]);
      spans.set(`v${x}`, a);
    }
  }
  for (const a of spans.values()) {
    if (a.z != null) out.h.push(a); else out.v.push(a);
  }
  return out;
}

let LINES = null;

/** True when (x, z) is on a carriageway. */
export function isOnRoad(x, z, margin = 0) {
  if (!WORLD) return false;
  if (!LINES) LINES = linesOf(WORLD);
  const lim = HALF_ROAD + margin;
  for (const l of LINES.h) {
    if (Math.abs(z - l.z) > lim) continue;
    for (const s of l.spans) if (x >= s[0] - TW && x <= s[1] + TW) return true;
  }
  for (const l of LINES.v) {
    if (Math.abs(x - l.x) > lim) continue;
    for (const s of l.spans) if (z >= s[0] - TD && z <= s[1] + TD) return true;
  }
  return false;
}

/** True when (x, z) is on a raised pavement or a block, but not a street. */
export function isOnSidewalk(x, z, margin = 0) {
  return !isOnRoad(x, z, -margin);
}

export function clampToWorld(p, margin = 1) {
  return {
    x: clamp(p.x, -TW * 1.5 + margin, TW * 1.5 - margin),
    z: clamp(p.z, -TD * 1.5 + margin, TD * 1.5 - margin),
  };
}

// Walking lanes, derived from the built world.
//
// The hand-authored FLOWS above only know about the stage street, so the crowd
// used to be pinned to one street even when the set grew a whole grid. Every
// street in the set has pavements on both sides, so every pavement is a place
// people can walk. This walks the built tiles and returns one straight lane per
// pavement segment:
//
//   { axis: 'x', a0, a1, b0, b1 }  a = the walking axis, b = across it
//
// Lanes are split at junctions: a pavement does not continue through another
// street's carriageway, and a walker that did would be marching across the
// junction. Only the tile at the low end of a seam emits a lane, so a shared
// street yields one lane rather than two overlapping ones.
export function streetLanes(world = WORLD) {
  if (!world || !world.tiles || !world.tiles.length) return [];
  const tiles = world.tiles;
  const seen = new Set();
  const lanes = [];

  // Every vertical street centre line, so horizontal lanes can be cut at them
  // (and vice versa). A seam line is the tile edge that carries the street.
  const vx = [];
  const hz = [];
  for (const t of tiles) {
    if (t.bits.w) vx.push(t.x0);
    if (t.bits.n) hz.push(t.z0);
  }
  const uniq = (a) => [...new Set(a.map((v) => Math.round(v * 100) / 100))];

  // Cut [a0,a1] wherever a crossing street's carriageway interrupts it.
  const cut = (a0, a1, cuts) => {
    let spans = [[a0, a1]];
    for (const c of cuts) {
      const lo = c - H, hi = c + H;
      const next = [];
      for (const [s0, s1] of spans) {
        if (hi <= s0 || lo >= s1) { next.push([s0, s1]); continue; }
        if (lo > s0) next.push([s0, lo]);
        if (hi < s1) next.push([hi, s1]);
      }
      spans = next;
    }
    return spans.filter(([s0, s1]) => s1 - s0 > 3.5);
  };

  const push = (axis, band0, band1, a0, a1, cuts, id) => {
    for (const [s0, s1] of cut(a0, a1, cuts)) {
      const key = `${axis}|${s0.toFixed(1)}|${s1.toFixed(1)}|${band0.toFixed(1)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lanes.push({
        id: `${id}_${lanes.length}`, axis,
        a0: s0, a1: s1,
        b0: band0, b1: band1,
        // Across-band mid line: walkers keep to it so they read as using a
        // pavement rather than drifting over the whole slab.
        mid: (band0 + band1) / 2,
        half: (band1 - band0) / 2,
      });
    }
  };

  const V = uniq(vx);
  const HZ = uniq(hz);
  for (const t of tiles) {
    // The strip a tile owns on a street edge is 6 m deep: HALF_ROAD of its own
    // carriageway, then WALK of pavement. So the pavement is *past* the road,
    // not against the seam. This is the same rule cells.js paints from (see
    // drawGround) — getting it backwards put every lane inside a carriageway,
    // where `isOnSidewalk` rejected all of them and the streets stayed empty.
    if (t.bits.n) push('x', t.z0 + H, t.z0 + H + WALK, t.x0, t.x1, V, `h${t.i}_${t.j}n`);
    if (t.bits.s) push('x', t.z1 - H - WALK, t.z1 - H, t.x0, t.x1, V, `h${t.i}_${t.j}s`);
    if (t.bits.w) push('z', t.x0 + H, t.x0 + H + WALK, t.z0, t.z1, HZ, `v${t.i}_${t.j}w`);
    if (t.bits.e) push('z', t.x1 - H - WALK, t.x1 - H, t.z0, t.z1, HZ, `v${t.i}_${t.j}e`);
  }
  return lanes;
}

// Strolling flows for every derived lane, so the crowd uses the whole network
// instead of only the stage street. Each lane becomes two flows (one per
// direction) so people pass each other rather than all walking the same way.
export function laneFlows(world = WORLD) {
  const out = [];
  for (const L of streetLanes(world)) {
    const south = L.mid;
    const len = L.a1 - L.a0;
    for (const dirSign of [1, -1]) {
      const band = 0.62;   // how far either side of the mid line they scatter
      const lo = south - band, hi = south + band;
      const a0 = L.a0 + 0.7, a1 = L.a1 - 0.7;
      const startAt = dirSign > 0 ? a0 : a1;
      out.push({
        id: `${L.id}_${dirSign > 0 ? 'f' : 'b'}`,
        kind: 'stroll',
        laneAxis: L.axis,
        // bounds is in world axes regardless of the lane's walking axis.
        bounds: L.axis === 'x'
          ? { x0: a0, x1: a1, z0: lo, z1: hi }
          : { x0: lo, x1: hi, z0: a0, z1: a1 },
        delta: L.axis === 'x'
          ? { x: dirSign * (len - 1.4), z: 0 }
          : { x: 0, z: dirSign * (len - 1.4) },
        band: L.axis === 'x'
          ? { axis: 'z', a0: lo, a1: hi }
          : { axis: 'x', a0: lo, a1: hi },
        bend: 0,
        startAt,
        weight: 0,
      });
    }
  }
  return out;
}

// --- road network ---------------------------------------------------------
//
// Streets live on tile seams (see tiles.js), so the drivable network is derived
// from the built world rather than authored: distinct street centre lines in x
// and z, and one closed circuit around every block they enclose.
//
// A car drives a circuit repeatedly. Two properties matter:
//
//   1. the circuit is *closed*, and each car completes a whole number of laps
//      per loop, so at t = 20 it is exactly where it was at t = 0 — continuous
//      traffic with no teleport and no fade;
//   2. the lane is offset to the RIGHT of travel (right-hand traffic), which is
//      what keeps opposing cars on opposite sides of the centre line.
//
// z points toward the viewer, so for a travel direction d = (dx, dz) the
// driver's right is r = (-dz, dx). A lane inset `o` into the block is therefore
// correct for the traversal used below: +x along the low-z edge, +z along the
// high-x edge, and so on.

export const LANE_OFFSET = HALF_ROAD * 0.5;
// 4.8 m: the middle of the 2.4 m pavement that sits outside the 3.6 m half
// carriageway. Walkers keep to this line.
export const PAVEMENT_OFFSET = HALF_ROAD + WALK * 0.5;

/**
 * Straight stretches of pavement, one per block frontage, trimmed at both ends
 * so nobody stands in a corner fillet. Walkers patrol these back and forth, so
 * every block and every street frontage has people on it.
 */
export function pavementRuns(world = WORLD, trim = 3.0) {
  const out = [];
  for (const c of blockCircuits(world, PAVEMENT_OFFSET)) {
    const r = c.ring;
    for (let i = 0; i < 4; i++) {
      const a = r[i], b = r[(i + 1) % 4];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const use = len - trim * 2;
      if (use < 5) continue;
      const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
      out.push({
        id: `${c.id}_e${i}`,
        ax: Math.abs(ux) > Math.abs(uz) ? 'x' : 'z',
        a: { x: a.x + ux * trim, z: a.z + uz * trim },
        b: { x: b.x - ux * trim, z: b.z - uz * trim },
        len: use,
      });
    }
  }
  return out;
}
   // 1.8 m: centre of one 3.6 m lane

/** Distinct street centre lines, sorted. `x` from west/east seams, `z` from n/s. */
export function roadLines(world = WORLD) {
  if (!world || !world.tiles) return { x: [], z: [] };
  const xs = new Set();
  const zs = new Set();
  for (const t of world.tiles) {
    if (t.bits.w) xs.add(Math.round(t.x0 * 100) / 100);
    if (t.bits.n) zs.add(Math.round(t.z0 * 100) / 100);
  }
  return {
    x: [...xs].sort((a, b) => a - b),
    z: [...zs].sort((a, b) => a - b),
  };
}

/**
 * One closed, axis-aligned circuit per enclosed block.
 *
 * `ring` is the inset lane rectangle in travel order; `length` is its arc
 * length. Every edge is axis-aligned, so a vehicle only ever needs one of four
 * headings — which is exactly what the extruded-profile vehicle renderer
 * supports.
 */
export function blockCircuits(world = WORLD, inset = LANE_OFFSET) {
  const { x: xs, z: zs } = roadLines(world);
  const out = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const x0 = xs[i] + inset;
      const x1 = xs[i + 1] - inset;
      const z0 = zs[j] + inset;
      const z1 = zs[j + 1] - inset;
      const w = x1 - x0;
      const d = z1 - z0;
      // A block needs room for a lane on each side plus a body between them.
      if (w < 8 || d < 8) continue;
      out.push({
        id: `c${i}_${j}`,
        // Street corners (not lane corners) delimit the intersections the car
        // has to stop before entering.
        corners: {
          nx: xs[i], fx: xs[i + 1], nz: zs[j], fz: zs[j + 1],
        },
        x0, x1, z0, z1, w, d,
        length: 2 * (w + d),
        // Travel order: east along the low-z edge, then south, west, north.
        ring: [
          { x: x0, z: z0 }, { x: x1, z: z0 },
          { x: x1, z: z1 }, { x: x0, z: z1 },
        ],
      });
    }
  }
  return out;
}

/** Arc length at which each ring corner falls, in travel order. */
export function circuitStops(c, gap) {
  const { w, d } = c;
  // The four corners sit at w, w+d, 2w+d and 2w+2d along the ring. Each stop is
  // `gap` earlier: the vehicle's nose is clear of the junction box by then.
  return [w - gap, w + d - gap, 2 * w + d - gap, 2 * w + 2 * d - gap];
}

/** World position + heading at arc length `s` around a ring. */
export function circuitPoint(c, s) {
  const { x0, x1, z0, z1, w, d, length } = c;
  let u = ((s % length) + length) % length;
  if (u < w) return { x: x0 + u, z: z0, axis: 'x', dir: 1, edge: 0 };
  u -= w;
  if (u < d) return { x: x1, z: z0 + u, axis: 'z', dir: 1, edge: 1 };
  u -= d;
  if (u < w) return { x: x1 - u, z: z1, axis: 'x', dir: -1, edge: 2 };
  u -= w;
  return { x: x0, z: z1 - u, axis: 'z', dir: -1, edge: 3 };
}

export function weightedWaitZone(rng) {
  let r = rng.next();
  for (const z of WAIT_ZONES) {
    if (r < z.weight) return z;
    r -= z.weight;
  }
  return WAIT_ZONES[WAIT_ZONES.length - 1];
}

// Height of the walking surface: the kerb gets a short ramp so a foot crossing
// the street steps down and up instead of popping.
export function groundYAt(x, z) {
  if (!isOnRoad(x, z)) {
    // Distance to the nearest kerb, for the ramp.
    const dy = Math.abs(Math.abs(z - HZ) - HALF_ROAD);
    const dx = Math.abs(Math.abs(x - HX) - HALF_ROAD);
    const d = Math.min(dy, dx);
    return WALK_Y * clamp(d / 0.5, 0, 1);
  }
  const dy = Math.abs(Math.abs(z - HZ) - HALF_ROAD);
  const dx = Math.abs(Math.abs(x - HX) - HALF_ROAD);
  return WALK_Y * clamp(Math.min(dy, dx) / 0.5, 0, 1);
}

export { WALK_Y, KERB_R, TW, TD };
