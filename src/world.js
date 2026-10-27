// World rules for the tile.
//
// One tile = a street segment seen from the front-right. The road runs along
// x. The cut-away back wall is at z = -14, the left wall at x = -15, the open
// faces are +z (front) and +x (right).
//
// The cell is an intersection module: an east–west street through the middle,
// buildings on BOTH sides of it (north row and a low south row), and a
// half-width north–south street down each side. Two cells side by side make the
// south–north street whole, so a tiled set is a street grid rather than a row
// of islands.
//
//   x -15..-11.4     north–south street, west half
//   x  11.4..15      north–south street, east half
//   z -14..-9.6      north block: tower / mid / shop / corner
//   z -9.6..-5.9     far sidewalk (buildings, shopfronts)
//   z -5.9..5.9      east–west street: two travel lanes + parking bays
//   z  5.9..8.3      near sidewalk (the stage: people, trees, lamps)
//   z  8.3..10.5     south block: a low row of shops facing the street
//
// Every z below is measured from the road edges in tile.js, so widening the
// street (or tiling the cell) does not leave stray kerbs behind.
//
// Everything here is small and declarative so the environment, crowd, traffic
// and weather modules share one set of rules.

import { clamp } from './math.js';
import { TILE, SIDEWALK_Y, ROAD_EDGE, groundYAt } from './tile.js';

// 11.8 m of asphalt: two 3.5 m travel lanes with a 5.2 m centre-to-centre
// spacing (a bus and a car pass with room to spare) plus a parking bay at
// each kerb.
export const ROAD = { x0: TILE.x0, x1: TILE.x1, z0: ROAD_EDGE.back, z1: ROAD_EDGE.front };

// The north–south street lives on the cell boundary: each cell owns a half of
// it, so two neighbours meet in the middle of a whole street. `x0`/`x1` are the
// inner kerbs of that street (the block edge).
export const SIDE_STREET = {
  half: 3.6,
  x0: -11.4,
  x1: 11.4,
  wid: TILE.x1 - TILE.x0,
};

// Kerb offsets, in world z, for anything that wants to stand just off the road.
export const KERB = {
  front: ROAD.z1 + 0.55,        // lamp posts, signal poles
  back: ROAD.z0 - 0.55,
  frontIn: ROAD.z1 - 1.0,       // parking bays, drain grates
  backIn: ROAD.z0 + 1.0,
};

// Kept for modules that still speak in road rectangles.
export const ROAD_H = ROAD;
export const ROAD_V = { x0: 0.0, x1: 0.0, z0: ROAD.z0, z1: ROAD.z1 };
export const INTERSECTION = { x0: -5.2, x1: -0.6, z0: ROAD.z0, z1: ROAD.z1 };

// Two raised slabs: the far sidewalk (buildings) and the near one (stage).
// The raised slabs stop at the inner kerb of the north–south street: beyond
// that line the ground is the side street itself.
export const SOUTH_BLOCK = { z0: TILE.z1 - 2.2, z1: TILE.z1 };   // 8.3 .. 10.5
export const NORTH_BLOCK = { z0: TILE.z0, z1: -9.6 };

export const SIDEWALKS = [
  { id: 'FRONT', x0: SIDE_STREET.x0, x1: SIDE_STREET.x1, z0: ROAD.z1, z1: SOUTH_BLOCK.z0, detail: 1.0 },
  { id: 'BACK', x0: SIDE_STREET.x0, x1: SIDE_STREET.x1, z0: NORTH_BLOCK.z1, z1: ROAD.z0, detail: 0.85 },
];

export const CORNER = SIDEWALKS[0];

// The single crossing. Pedestrians walk along z; zebra bars run along x.
const CROSSING = { x0: -5.2, x1: -0.6, z0: ROAD.z0, z1: ROAD.z1 };
export const CROSSWALKS = {
  main: CROSSING,
  west: CROSSING,
  east: CROSSING,
  north: CROSSING,
  south: CROSSING,
  diagonalHalfWidth: 2.0,
  diagonalReach: 0.0,
  centerRadius: 0.0,
};

// One lane each way, 5.2 m apart centre to centre. `offset` is the fixed z of
// the lane centre; a car is 1.85 m wide, so two vehicles pass with 3.3 m of
// clearance instead of shaving each other's mirrors.
export const LANES = [
  { id: 'E', axis: 'x', offset: 2.6, dir: 1 },
  { id: 'W', axis: 'x', offset: -2.6, dir: -1 },
];

// Legal kerbside slots, parallel to the road, clear of the travel lanes.
export const PARKING = [
  { id: 'front_curb', axis: 'x', x: 7.4, z: ROAD.z1 - 1.05, dir: 1 },
  { id: 'back_curb', axis: 'x', x: -7.2, z: ROAD.z0 + 1.05, dir: -1 },
];

// Two poles just outside the crossing, each with an arm over the road.
// yaw 0 faces +x, yaw PI faces -x. The front pole's head faces the camera so
// the signal beat reads on screen.
export const SIGNAL_POSITIONS = [
  { id: 'front', x: -6.05, z: KERB.front, yaw: 0, toward: { x: 0, z: -1 }, arm: 4.3 },
  { id: 'back', x: 1.05, z: KERB.back, yaw: Math.PI, toward: { x: 0, z: 1 }, arm: 4.3 },
];

// Things a person has to walk around. Kept in step with the furniture pass in
// environment.js: the crowd uses this list to steer, so a lamp post that is not
// here is a lamp post people walk straight through.
export const STREET_PROPS = [
  // street lamps
  { x: -10.9, z: 6.45, r: 0.26 }, { x: -10.7, z: 7.4, r: 0.26 },
  { x: 10.6, z: 6.45, r: 0.26 }, { x: -6.9, z: -6.45, r: 0.26 },
  { x: 4.6, z: -6.45, r: 0.26 },
  // utility poles
  { x: -10.9, z: 6.05, r: 0.22 }, { x: 10.9, z: 6.05, r: 0.22 },
  // signals
  { x: -6.05, z: 6.1, r: 0.26 }, { x: 1.05, z: -6.1, r: 0.26 },
  // vending machine, bin, benches, planters, trees, bike rack
  { x: 10.5, z: 6.9, r: 0.66 },
  { x: 10.4, z: 7.5, r: 0.34 }, { x: -10.7, z: 7.5, r: 0.3 },
  { x: -9.8, z: 7.3, r: 0.6 }, { x: -7.9, z: 7.5, r: 0.55 },
  { x: -7.4, z: 7.4, r: 0.4 }, { x: 2.4, z: 7.5, r: 0.36 }, { x: -1.4, z: 7.6, r: 0.3 },
  { x: 6.6, z: 7.4, r: 0.42 }, { x: -10.0, z: 7.3, r: 0.42 },
  { x: -8.8, z: 6.4, r: 0.85 },
  // bus stop pole
  { x: -3.9, z: 7.5, r: 0.24 },
];

// Facades sit on the far sidewalk. `face` is which cut face carries the shop.
// North row: four lots between the two side streets, their fronts on the far
// sidewalk. Depth is measured back from the building line at z = -9.6.
export const BUILDING_LOTS = [
  {
    id: 'tower', x: -8.5, z: -11.8, w: 5.6, d: 4.4, h: 13.1,
    cols: 4, rows: 6, accent: 'red', face: 'south', lit: 0.42,
    shop: false, roofTank: true, verticalSign: false,
  },
  {
    id: 'mid', x: -3.0, z: -11.8, w: 4.9, d: 4.4, h: 8.4,
    cols: 3, rows: 4, accent: 'teal', face: 'south', lit: 0.5,
    shop: true, roofTank: false, verticalSign: true,
  },
  {
    id: 'shop', x: 2.1, z: -11.8, w: 5.1, d: 4.4, h: 5.4,
    cols: 4, rows: 2, accent: 'teal', face: 'south', lit: 0.66,
    shop: true, roofTank: false, verticalSign: false,
  },
  {
    id: 'corner', x: 8.1, z: -11.8, w: 6.2, d: 4.4, h: 7.6,
    cols: 5, rows: 4, accent: 'red', face: 'south', lit: 0.38,
    shop: true, roofTank: true, verticalSign: true,
  },
];

// South row: the other side of the street. These are deliberately low — a
// single storey of shops with a sign band — so the near pavement, the crossing
// and the crowd in front of them stay visible from the camera.
export const SOUTH_LOTS = [
  // Two blocks with a gap on the centre line. The gap is what lets the street
  // read from the film's camera; when cells tile, the blocks meet at the seam
  // and the gaps repeat every 30 m as mid-block yards.
  { id: 's_west', x: -7.55, z: 9.55, w: 7.7, d: 1.9, h: 2.7, cols: 4, rows: 1, accent: 'red', lit: 0.7 },
  { id: 's_east', x: 7.85, z: 9.55, w: 7.1, d: 1.9, h: 2.9, cols: 4, rows: 1, accent: 'teal', lit: 0.8 },
];

// Colour accents as light on the wet ground. z is the base of each source
// (just in front of the shopfronts), so the smear runs toward the camera.
export const LIGHT_SOURCES = [
  { x: 2.1, z: -9.4, color: 'teal', w: 4.2, h: 3.0, seed: 11 },
  { x: 8.1, z: -9.4, color: 'red', w: 3.0, h: 3.4, seed: 12 },
  { x: 10.9, z: -9.4, color: 'teal', w: 1.1, h: 5.2, seed: 13 },
  { x: -3.0, z: -9.4, color: 'red', w: 1.1, h: 4.8, seed: 14 },
  { x: -8.5, z: -9.4, color: 'red', w: 2.6, h: 7.5, seed: 15 },
  { x: 6.1, z: 8.5, color: 'red', w: 2.2, h: 2.2, seed: 16 },
  { x: -8.4, z: 8.5, color: 'teal', w: 1.8, h: 2.2, seed: 17 },
];

// Waiting zones. Weights bias the crowd toward the crossing itself.
export const WAIT_ZONES = [
  { id: 'cross_front', weight: 0.40, x0: -8.0, x1: 0.8, z0: 6.05, z1: 7.85 },
  { id: 'cross_back', weight: 0.20, x0: -8.0, x1: 0.8, z0: -7.9, z1: -6.1 },
  { id: 'shop_front', weight: 0.26, x0: 2.2, x1: 10.8, z0: 6.1, z1: 7.95 },
  { id: 'left_front', weight: 0.14, x0: -10.9, x1: -8.4, z0: 6.3, z1: 7.95 },
];

// Pedestrian motion. Crossings run along z; strolling runs along x. Every flow
// is a bezier from a start patch, so people fan out instead of marching in a
// single line.
export const FLOWS = [
  { id: 'cross_s', kind: 'cross', weight: 0.19,
    bounds: { x0: -4.85, x1: -1.0, z0: 6.0, z1: 7.6 }, delta: { x: 0.0, z: -12.0 }, bend: 0.5 },
  { id: 'cross_n', kind: 'cross', weight: 0.15,
    bounds: { x0: -4.85, x1: -1.0, z0: -7.6, z1: -6.0 }, delta: { x: -0.3, z: 12.0 }, bend: -0.5 },
  { id: 'cross_diag', kind: 'cross', weight: 0.10,
    bounds: { x0: -4.9, x1: -1.1, z0: 6.0, z1: 7.4 }, delta: { x: 6.2, z: -11.6 }, bend: 0.7 },
  { id: 'front_e', kind: 'stroll', weight: 0.18,
    bounds: { x0: -10.9, x1: -4.4, z0: 6.35, z1: 7.05 }, delta: { x: 15.0, z: -0.5 }, bend: 1.0 },
  { id: 'front_w', kind: 'stroll', weight: 0.16,
    bounds: { x0: 4.2, x1: 10.8, z0: 6.35, z1: 7.05 }, delta: { x: -15.0, z: 0.5 }, bend: -0.9 },
  { id: 'back_e', kind: 'stroll', weight: 0.11,
    bounds: { x0: -10.9, x1: -5.8, z0: -7.6, z1: -6.4 }, delta: { x: 14.0, z: 0.2 }, bend: 0.5 },
  { id: 'shop_front', kind: 'stroll', weight: 0.11,
    bounds: { x0: 1.6, x1: 9.6, z0: 6.2, z1: 7.0 }, delta: { x: -8.0, z: 0.3 }, bend: 0.7 },
];

// Puddles are procedural but seeded: they pool at the kerbs and under lights.
export const PUDDLES = [
  { x: -8.4, z: 3.0, rx: 2.7, rz: 0.85, rot: 0.04, tint: 'teal', seed: 21 },
  { x: -1.1, z: -3.4, rx: 2.05, rz: 0.78, rot: -0.10, tint: 'red', seed: 22 },
  { x: 6.3, z: 2.6, rx: 2.35, rz: 0.92, rot: 0.09, tint: 'bone', seed: 23 },
  { x: 11.9, z: -1.9, rx: 1.75, rz: 0.66, rot: 0.20, tint: 'teal', seed: 24 },
  { x: -12.2, z: -2.0, rx: 2.15, rz: 0.80, rot: -0.14, tint: 'bone', seed: 25 },
  { x: 2.5, z: -4.0, rx: 1.55, rz: 0.58, rot: 0.28, tint: 'red', seed: 26 },
  { x: -2.4, z: 5.4, rx: 1.55, rz: 0.62, rot: 0.06, tint: 'bone', seed: 27 },
  { x: 8.4, z: 6.1, rx: 1.75, rz: 0.72, rot: 0.18, tint: 'teal', seed: 28 },
  { x: -9.8, z: 8.6, rx: 1.35, rz: 0.55, rot: -0.18, tint: 'bone', seed: 29 },
  { x: 4.7, z: 9.0, rx: 1.20, rz: 0.50, rot: 0.12, tint: 'teal', seed: 30 },
];

export function rectContains(r, x, z, margin = 0) {
  return x >= r.x0 - margin && x <= r.x1 + margin && z >= r.z0 - margin && z <= r.z1 + margin;
}

export function isOnSidewalk(x, z, margin = 0) {
  return SIDEWALKS.some((s) => rectContains(s, x, z, margin));
}

export function isOnRoad(x, z, margin = 0) {
  return rectContains(ROAD, x, z, margin);
}

export function isOnCrosswalk(x, z, margin = 0) {
  return rectContains(CROSSWALKS.main, x, z, margin);
}

export function isParkable(x, z, margin = 0) {
  return isOnRoad(x, z, margin) &&
         !isOnSidewalk(x, z, margin) &&
         !isOnCrosswalk(x, z, margin + 0.9);
}

export function sanitizePark(x, z, margin = 0) {
  if (isParkable(x, z, margin)) return { x, z };
  let best = PARKING[0];
  let bestD = Infinity;
  for (const p of PARKING) {
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bestD && isParkable(p.x, p.z, margin)) { bestD = d; best = p; }
  }
  return { x: best.x, z: best.z };
}

export function clampToWorld(p, margin = 1) {
  return {
    x: clamp(p.x, TILE.x0 + margin, TILE.x1 - margin),
    z: clamp(p.z, TILE.z0 + margin, TILE.z1 - margin),
  };
}

export function weightedWaitZone(rng) {
  let r = rng.next();
  for (const z of WAIT_ZONES) {
    if (r < z.weight) return z;
    r -= z.weight;
  }
  return WAIT_ZONES[WAIT_ZONES.length - 1];
}

export { groundYAt, SIDEWALK_Y };
