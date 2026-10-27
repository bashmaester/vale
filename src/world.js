// World rules for the tile.
//
// One tile = a street segment seen from the front-right. The road runs along
// x. The cut-away back wall is at z = -14, the left wall at x = -15, the open
// faces are +z (front) and +x (right).
//
//   z -14 ────────── back wall / elevated line
//   z -8.6..-5.0     far sidewalk (buildings, shopfronts)
//   z -5.0..4.2      road, two lanes
//   z  4.2..10.5     near sidewalk (the stage: people, trees, lamps)
//
// Everything here is small and declarative so the environment, crowd, traffic
// and weather modules share one set of rules.

import { clamp } from './math.js';
import { TILE, SIDEWALK_Y, groundYAt } from './tile.js';

export const ROAD = { x0: TILE.x0, x1: TILE.x1, z0: -5.0, z1: 4.2 };

// Kept for modules that still speak in road rectangles.
export const ROAD_H = ROAD;
export const ROAD_V = { x0: 0.0, x1: 0.0, z0: ROAD.z0, z1: ROAD.z1 };
export const INTERSECTION = { x0: -4.2, x1: -0.8, z0: ROAD.z0, z1: ROAD.z1 };

// Two raised slabs: the far sidewalk (buildings) and the near one (stage).
export const SIDEWALKS = [
  { id: 'FRONT', x0: TILE.x0, x1: TILE.x1, z0: ROAD.z1, z1: TILE.z1, detail: 1.0 },
  { id: 'BACK', x0: TILE.x0, x1: TILE.x1, z0: TILE.z0, z1: ROAD.z0, detail: 0.85 },
];

export const CORNER = SIDEWALKS[0];

// The single crossing. Pedestrians walk along z; zebra bars run along x.
export const CROSSWALKS = {
  main: { x0: -4.2, x1: -0.8, z0: ROAD.z0, z1: ROAD.z1 },
  west: { x0: -4.2, x1: -0.8, z0: ROAD.z0, z1: ROAD.z1 },
  east: { x0: -4.2, x1: -0.8, z0: ROAD.z0, z1: ROAD.z1 },
  north: { x0: -4.2, x1: -0.8, z0: ROAD.z0, z1: ROAD.z1 },
  south: { x0: -4.2, x1: -0.8, z0: ROAD.z0, z1: ROAD.z1 },
  diagonalHalfWidth: 2.0,
  diagonalReach: 0.0,
  centerRadius: 0.0,
};

// One lane each way. `offset` is the fixed z of the lane centre.
export const LANES = [
  { id: 'E', axis: 'x', offset: 2.15, dir: 1 },
  { id: 'W', axis: 'x', offset: -2.15, dir: -1 },
];

// Legal kerbside slots, parallel to the road.
export const PARKING = [
  { id: 'front_curb', axis: 'x', x: 7.4, z: 3.32, dir: 1 },
  { id: 'back_curb', axis: 'x', x: -7.2, z: -4.10, dir: -1 },
];

// Two poles just outside the crossing, each with an arm over the road.
// yaw 0 faces +x, yaw PI faces -x. The front pole's head faces the camera so
// the signal beat reads on screen.
export const SIGNAL_POSITIONS = [
  { id: 'front', x: -5.15, z: 4.85, yaw: 0, toward: { x: 0, z: -1 }, arm: 3.4 },
  { id: 'back', x: 0.30, z: -5.65, yaw: Math.PI, toward: { x: 0, z: 1 }, arm: 3.4 },
];

// Facades sit on the far sidewalk. `face` is which cut face carries the shop.
export const BUILDING_LOTS = [
  {
    id: 'tower', x: -11.3, z: -11.2, w: 6.2, d: 5.2, h: 13.1,
    cols: 4, rows: 6, accent: 'red', face: 'south', lit: 0.42,
    shop: false, roofTank: true, verticalSign: false,
  },
  {
    id: 'mid', x: -5.1, z: -10.9, w: 5.6, d: 5.4, h: 8.4,
    cols: 3, rows: 4, accent: 'teal', face: 'south', lit: 0.5,
    shop: true, roofTank: false, verticalSign: true,
  },
  {
    id: 'shop', x: 1.7, z: -10.6, w: 6.8, d: 5.8, h: 5.4,
    cols: 4, rows: 2, accent: 'teal', face: 'south', lit: 0.66,
    shop: true, roofTank: false, verticalSign: false,
  },
  {
    id: 'corner', x: 9.6, z: -10.9, w: 7.4, d: 5.4, h: 7.6,
    cols: 5, rows: 4, accent: 'red', face: 'south', lit: 0.38,
    shop: true, roofTank: true, verticalSign: true,
  },
];

// Colour accents as light on the wet ground. z is the base of each source
// (just in front of the shopfronts), so the smear runs toward the camera.
export const LIGHT_SOURCES = [
  { x: 1.8, z: -7.72, color: 'teal', w: 4.2, h: 3.0, seed: 11 },
  { x: 9.6, z: -8.22, color: 'red', w: 3.0, h: 3.4, seed: 12 },
  { x: 12.6, z: -8.22, color: 'teal', w: 1.1, h: 5.2, seed: 13 },
  { x: -5.1, z: -8.22, color: 'red', w: 1.1, h: 4.8, seed: 14 },
  { x: -11.3, z: -8.62, color: 'red', w: 2.6, h: 7.5, seed: 15 },
  { x: 13.0, z: 6.4, color: 'teal', w: 1.0, h: 1.7, seed: 16 },
  { x: -9.2, z: 8.4, color: 'bone', w: 1.4, h: 2.6, seed: 17 },
];

// Waiting zones. Weights bias the crowd toward the crossing itself.
export const WAIT_ZONES = [
  { id: 'cross_front', weight: 0.40, x0: -7.4, x1: 0.4, z0: 4.75, z1: 6.9 },
  { id: 'cross_back', weight: 0.20, x0: -7.4, x1: 0.4, z0: -7.3, z1: -5.35 },
  { id: 'shop_front', weight: 0.26, x0: 2.2, x1: 11.4, z0: 4.9, z1: 7.6 },
  { id: 'left_front', weight: 0.14, x0: -13.4, x1: -8.4, z0: 5.4, z1: 9.4 },
];

// Pedestrian motion. Crossings run along z; strolling runs along x. Every flow
// is a bezier from a start patch, so people fan out instead of marching in a
// single line.
export const FLOWS = [
  { id: 'cross_s', kind: 'cross', weight: 0.19,
    bounds: { x0: -3.85, x1: -1.15, z0: 4.7, z1: 6.2 }, delta: { x: 0.0, z: -10.9 }, bend: 0.5 },
  { id: 'cross_n', kind: 'cross', weight: 0.15,
    bounds: { x0: -3.85, x1: -1.15, z0: -6.2, z1: -4.7 }, delta: { x: -0.3, z: 10.9 }, bend: -0.5 },
  { id: 'cross_diag', kind: 'cross', weight: 0.10,
    bounds: { x0: -3.9, x1: -1.2, z0: 4.7, z1: 6.0 }, delta: { x: 6.2, z: -10.5 }, bend: 0.7 },
  { id: 'front_e', kind: 'stroll', weight: 0.18,
    bounds: { x0: -13.6, x1: -4.4, z0: 7.4, z1: 9.9 }, delta: { x: 15.0, z: -0.7 }, bend: 1.1 },
  { id: 'front_w', kind: 'stroll', weight: 0.16,
    bounds: { x0: 4.2, x1: 13.6, z0: 7.4, z1: 9.9 }, delta: { x: -15.0, z: 0.6 }, bend: -1.0 },
  { id: 'back_e', kind: 'stroll', weight: 0.11,
    bounds: { x0: -13.2, x1: -5.8, z0: -7.2, z1: -5.35 }, delta: { x: 14.0, z: 0.2 }, bend: 0.6 },
  { id: 'shop_front', kind: 'stroll', weight: 0.11,
    bounds: { x0: 1.6, x1: 9.6, z0: 5.2, z1: 7.4 }, delta: { x: -8.0, z: 0.4 }, bend: 0.8 },
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
