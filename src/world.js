// Shared world rules: a believable two-street crossing with four corner
// sidewalks, straight crosswalks, diagonal scramble paths and legal lanes.
import { clamp } from './math.js';

export const ROAD = { x0: -30, x1: 30, z0: -23, z1: 25 };
export const INTERSECTION = { x0: -9.6, x1: 9.6, z0: -8.6, z1: 8.6 };

// Four sidewalk blocks around a cross intersection.
export const SIDEWALKS = [
  { id: 'NW', x0: -30, x1: -9.6, z0: -23, z1: -8.6 },
  { id: 'NE', x0: 9.6, x1: 30, z0: -23, z1: -8.6 },
  { id: 'SW', x0: -30, x1: -9.6, z0: 8.6, z1: 25 },
  { id: 'SE', x0: 9.6, x1: 30, z0: 8.6, z1: 25 },
];

// Waiting crowds gather near the curb ramps, not in the road.
export const WAIT_ZONES = [
  { id: 'SW', x0: -21.5, x1: -10.6, z0: 9.4, z1: 17.5 },
  { id: 'SE', x0: 10.6, x1: 21.5, z0: 9.4, z1: 17.5 },
  { id: 'NW', x0: -21.5, x1: -10.6, z0: -17.5, z1: -9.4 },
  { id: 'NE', x0: 10.6, x1: 21.5, z0: -17.5, z1: -9.4 },
];

// Straight crossings dominate; diagonals remain part of the scramble.
// Bounds are sidewalk waiting areas; delta carries people to the far sidewalk.
export const FLOWS = [
  { id: 'E', kind: 'straight', weight: 0.16,
    bounds: { x0: -20.5, x1: -11.0, z0: 9.6, z1: 12.2 }, delta: { x: 31.0, z: 0 } },
  { id: 'W', kind: 'straight', weight: 0.15,
    bounds: { x0: 11.0, x1: 20.5, z0: -12.2, z1: -9.6 }, delta: { x: -31.0, z: 0 } },
  { id: 'S', kind: 'straight', weight: 0.15,
    bounds: { x0: 9.6, x1: 12.2, z0: -20.5, z1: -11.0 }, delta: { x: 0, z: 31.0 } },
  { id: 'N', kind: 'straight', weight: 0.14,
    bounds: { x0: -12.2, x1: -9.6, z0: 11.0, z1: 20.5 }, delta: { x: 0, z: -31.0 } },
  { id: 'SW_NE', kind: 'diagonal', weight: 0.10,
    bounds: { x0: -20.5, x1: -11.5, z0: 9.6, z1: 17.0 }, delta: { x: 32.0, z: -29.0 } },
  { id: 'NE_SW', kind: 'diagonal', weight: 0.10,
    bounds: { x0: 11.5, x1: 20.5, z0: -17.0, z1: -9.6 }, delta: { x: -32.0, z: 29.0 } },
  { id: 'NW_SE', kind: 'diagonal', weight: 0.10,
    bounds: { x0: -20.5, x1: -11.5, z0: -17.0, z1: -9.6 }, delta: { x: 32.0, z: 29.0 } },
  { id: 'SE_NW', kind: 'diagonal', weight: 0.10,
    bounds: { x0: 11.5, x1: 20.5, z0: 9.6, z1: 17.0 }, delta: { x: -32.0, z: -29.0 } },
];

// Crosswalk footprints, kept in sync with environment.js drawing.
export const CROSSWALKS = {
  south: { x0: -8.3, x1: 8.3, z0: 8.8, z1: 12.2 },
  north: { x0: -8.3, x1: 8.3, z0: -12.2, z1: -8.8 },
  west: { x0: -12.2, x1: -8.8, z0: -8.3, z1: 8.3 },
  east: { x0: 8.8, x1: 12.2, z0: -8.3, z1: 8.3 },
  diagonalHalfWidth: 3.4,
  diagonalReach: 11.5,
  centerRadius: 7.5,
};

// Left/right lanes on the horizontal street. dir = +1 drives west→east on
// the north half; dir = -1 drives east→west on the south half.
export const LANES = [
  { id: 'H1', z: -6.9, dir: 1 },
  { id: 'H2', z: -4.6, dir: 1 },
  { id: 'H3', z: -2.3, dir: 1 },
  { id: 'H4', z: 2.3, dir: -1 },
  { id: 'H5', z: 4.6, dir: -1 },
  { id: 'H6', z: 6.9, dir: -1 },
];

export function rectContains(r, x, z, margin = 0) {
  return x >= r.x0 - margin && x <= r.x1 + margin && z >= r.z0 - margin && z <= r.z1 + margin;
}

export function isOnSidewalk(x, z, margin = 0) {
  return SIDEWALKS.some((s) => rectContains(s, x, z, margin));
}

export function isOnCrosswalk(x, z, margin = 0) {
  const C = CROSSWALKS;
  if (rectContains(C.south, x, z, margin)) return true;
  if (rectContains(C.north, x, z, margin)) return true;
  if (rectContains(C.west, x, z, margin)) return true;
  if (rectContains(C.east, x, z, margin)) return true;
  if (Math.abs(x + z) / Math.SQRT2 < C.diagonalHalfWidth + margin &&
      Math.abs(x) < C.diagonalReach + margin && Math.abs(z) < C.diagonalReach + margin) return true;
  if (Math.abs(x - z) / Math.SQRT2 < C.diagonalHalfWidth + margin &&
      Math.abs(x) < C.diagonalReach + margin && Math.abs(z) < C.diagonalReach + margin) return true;
  if (Math.hypot(x, z) < C.centerRadius + margin) return true;
  return false;
}

export function isParkable(x, z, margin = 0) {
  return x > ROAD.x0 + 1 && x < ROAD.x1 - 1 &&
         z > ROAD.z0 + 1 && z < ROAD.z1 - 1 &&
         !isOnSidewalk(x, z, margin) &&
         !isOnCrosswalk(x, z, margin + 1.4);
}

// Nudge a would-be illegal parked car to the nearest legal road slot.
export function sanitizePark(x, z, margin = 0) {
  let px = x, pz = z;
  for (let i = 0; i < 10 && !isParkable(px, pz, margin); i++) {
    px += (px >= 0 ? 1 : -1) * 1.8;
    if (Math.abs(px) > 25.5) px = (px >= 0 ? 25.5 : -25.5);
  }
  if (!isParkable(px, pz, margin)) {
    px = px >= 0 ? 24.5 : -24.5;
    pz = clamp(pz, -7, 7);
  }
  return { x: px, z: pz };
}

export function clampToWorld(p, margin = 1) {
  return {
    x: clamp(p.x, ROAD.x0 + margin, ROAD.x1 - margin),
    z: clamp(p.z, ROAD.z0 + margin, ROAD.z1 - margin),
  };
}
