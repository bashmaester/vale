// Shared world rules for a single built-out street corner.
// Big volumes first: two road strips, four sidewalk blocks, one detailed
// northeast corner. Smaller props, cars and people are layered on top.
import { clamp } from './math.js';

export const ROAD = { x0: -30, x1: 30, z0: -30, z1: 30 };
export const ROAD_H = { x0: -30, x1: 30, z0: -8, z1: 8 };   // cars drive ±x
export const ROAD_V = { x0: -8, x1: 8, z0: -30, z1: 30 };    // cars drive ±z
export const INTERSECTION = { x0: -8, x1: 8, z0: -8, z1: 8 };

// Four sidewalk blocks. Only NE is fully built out; the others are simple
// receiving slabs so the crossing still reads as a real intersection.
export const SIDEWALKS = [
  { id: 'NW', x0: -30, x1: -8, z0: -30, z1: -8, detail: 0.25 },
  { id: 'NE', x0: 8, x1: 30, z0: -30, z1: -8, detail: 1.0 },
  { id: 'SW', x0: -30, x1: -8, z0: 8, z1: 30, detail: 0.35 },
  { id: 'SE', x0: 8, x1: 30, z0: 8, z1: 30, detail: 0.35 },
];

export const CORNER = SIDEWALKS.find((s) => s.id === 'NE');

// Waiting crowds gather mostly on the built-out corner, with a few on the
// opposite curbs. weight biases Poisson sampling toward the set.
export const WAIT_ZONES = [
  { id: 'NE', weight: 0.46, x0: 9.5, x1: 17.5, z0: -16.0, z1: -9.5 },
  { id: 'NW', weight: 0.20, x0: -17.5, x1: -9.5, z0: -16.0, z1: -9.5 },
  { id: 'SW', weight: 0.19, x0: -17.5, x1: -9.5, z0: 9.5, z1: 16.0 },
  { id: 'SE', weight: 0.15, x0: 9.5, x1: 17.5, z0: 9.5, z1: 16.0 },
];

// A few legible routes rather than a full scramble. Straight crossings first,
// diagonals second, plus a short stroll along the built-out sidewalk.
export const FLOWS = [
  { id: 'NE_S', kind: 'straight', weight: 0.20,
    bounds: { x0: 9.8, x1: 15.5, z0: -14.5, z1: -10.0 }, delta: { x: -6.5, z: 24.0 }, bend: 1.6 },
  { id: 'NE_W', kind: 'straight', weight: 0.17,
    bounds: { x0: 9.8, x1: 15.5, z0: -14.5, z1: -10.0 }, delta: { x: -24.0, z: 1.5 }, bend: -2.4 },
  { id: 'NE_SW', kind: 'diagonal', weight: 0.15,
    bounds: { x0: 9.8, x1: 16.5, z0: -16.5, z1: -10.0 }, delta: { x: -27.0, z: 26.0 }, bend: 0.8 },
  { id: 'SW_NE', kind: 'diagonal', weight: 0.12,
    bounds: { x0: -16.5, x1: -9.8, z0: 10.0, z1: 16.5 }, delta: { x: 27.0, z: -26.0 }, bend: -0.8 },
  { id: 'NW_SE', kind: 'diagonal', weight: 0.10,
    bounds: { x0: -16.5, x1: -9.8, z0: -16.5, z1: -10.0 }, delta: { x: 27.0, z: 26.0 }, bend: 0.7 },
  { id: 'SE_NW', kind: 'diagonal', weight: 0.10,
    bounds: { x0: 9.8, x1: 16.5, z0: 10.0, z1: 16.5 }, delta: { x: -27.0, z: -26.0 }, bend: -0.7 },
  { id: 'CORNER_STROLL', kind: 'stroll', weight: 0.16,
    bounds: { x0: 11.0, x1: 23.0, z0: -23.0, z1: -11.0 }, delta: { x: -7.0, z: 5.0 }, bend: 0.4 },
];

// Crosswalk footprints, kept in sync with environment.js drawing.
export const CROSSWALKS = {
  west: { x0: -8.0, x1: -4.6, z0: -8, z1: 8 },
  east: { x0: 4.6, x1: 8.0, z0: -8, z1: 8 },
  north: { x0: -8, x1: 8, z0: -8.0, z1: -4.6 },
  south: { x0: -8, x1: 8, z0: 4.6, z1: 8.0 },
  diagonalHalfWidth: 2.8,
  diagonalReach: 10.0,
  centerRadius: 5.4,
};

// Two lanes per road. offset is the fixed coordinate perpendicular to travel.
export const LANES = [
  { id: 'H_E', axis: 'x', offset: -3.2, dir: 1 },
  { id: 'H_W', axis: 'x', offset: 3.2, dir: -1 },
  { id: 'V_S', axis: 'z', offset: -3.2, dir: 1 },
  { id: 'V_N', axis: 'z', offset: 3.2, dir: -1 },
];

// Legal curbside parking slots. axis matches vehicle orientation.
export const PARKING = [
  { id: 'north_curb', axis: 'x', x: -18.5, z: -5.9, dir: 1 },
  { id: 'south_curb', axis: 'x', x: 18.5, z: 5.9, dir: -1 },
  { id: 'east_curb', axis: 'z', x: 5.9, z: -18.5, dir: 1 },
  { id: 'west_curb', axis: 'z', x: -5.9, z: 18.5, dir: -1 },
];

// Traffic lights belong at the four intersection corners, nowhere else.
export const SIGNAL_POSITIONS = [
  { id: 'NW', x: -8.9, z: -8.9, toward: { x: 1, z: 1 }, yaw: 0 },
  { id: 'NE', x: 8.9, z: -8.9, toward: { x: -1, z: 1 }, yaw: Math.PI / 2 },
  { id: 'SW', x: -8.9, z: 8.9, toward: { x: 1, z: -1 }, yaw: -Math.PI / 2 },
  { id: 'SE', x: 8.9, z: 8.9, toward: { x: -1, z: -1 }, yaw: Math.PI },
];

// Building volumes on the NE corner. x/z are centers, y is derived from h.
export const BUILDING_LOTS = [
  { id: 'corner_tower', x: 12.5, z: -13.0, w: 7.0, d: 8.0, h: 11.0, face: 'south', accent: 'red', cols: 3, rows: 4 },
  { id: 'shop_row', x: 21.0, z: -12.0, w: 8.0, d: 7.0, h: 6.2, face: 'south', accent: 'teal', cols: 4, rows: 2 },
  { id: 'mid_block', x: 13.0, z: -23.0, w: 7.0, d: 8.0, h: 9.0, face: 'west', accent: null, cols: 3, rows: 3 },
  { id: 'kiosk', x: 24.0, z: -22.0, w: 6.0, d: 6.0, h: 5.0, face: 'west', accent: 'red', cols: 2, rows: 2 },
];

export function rectContains(r, x, z, margin = 0) {
  return x >= r.x0 - margin && x <= r.x1 + margin && z >= r.z0 - margin && z <= r.z1 + margin;
}

export function isOnSidewalk(x, z, margin = 0) {
  return SIDEWALKS.some((s) => rectContains(s, x, z, margin));
}

export function isOnRoad(x, z, margin = 0) {
  const inH = rectContains(ROAD_H, x, z, margin);
  const inV = rectContains(ROAD_V, x, z, margin);
  return inH || inV;
}

export function isOnCrosswalk(x, z, margin = 0) {
  const C = CROSSWALKS;
  if (rectContains(C.west, x, z, margin)) return true;
  if (rectContains(C.east, x, z, margin)) return true;
  if (rectContains(C.north, x, z, margin)) return true;
  if (rectContains(C.south, x, z, margin)) return true;
  if (Math.abs(x + z) / Math.SQRT2 < C.diagonalHalfWidth + margin &&
      Math.abs(x) < C.diagonalReach + margin && Math.abs(z) < C.diagonalReach + margin) return true;
  if (Math.abs(x - z) / Math.SQRT2 < C.diagonalHalfWidth + margin &&
      Math.abs(x) < C.diagonalReach + margin && Math.abs(z) < C.diagonalReach + margin) return true;
  if (Math.hypot(x, z) < C.centerRadius + margin) return true;
  return false;
}

export function isParkable(x, z, margin = 0) {
  return isOnRoad(x, z, margin) &&
         !isOnSidewalk(x, z, margin) &&
         !isOnCrosswalk(x, z, margin + 1.2) &&
         !rectContains(INTERSECTION, x, z, margin + 0.8);
}

// Nudge a would-be illegal parked car to the nearest legal curb slot.
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
    x: clamp(p.x, ROAD.x0 + margin, ROAD.x1 - margin),
    z: clamp(p.z, ROAD.z0 + margin, ROAD.z1 - margin),
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
