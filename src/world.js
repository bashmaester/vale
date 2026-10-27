// Shared world rules. One place defines where sidewalks, crosswalks,
// waiting zones and legal parking slots are so the scene makes spatial sense.
import { clamp } from './math.js';

export const ROAD = { x0: -27, x1: 27, z0: -21, z1: 23 };

// Four corner sidewalk blocks. x = left/right, z = near/far.
export const SIDEWALKS = [
  { id: 'NW', x0: -27, x1: -16, z0: -21, z1: -9 },
  { id: 'NE', x0: 16, x1: 27, z0: -21, z1: -9 },
  { id: 'SW', x0: -27, x1: -16, z0: 9, z1: 23 },
  { id: 'SE', x0: 16, x1: 27, z0: 9, z1: 23 },
];

// Waiting crowds live on the sidewalks, not in the road.
export const WAIT_ZONES = [
  { id: 'SW', x0: -24.5, x1: -17.2, z0: 11.0, z1: 18.0 },
  { id: 'SE', x0: 17.2, x1: 24.5, z0: 11.0, z1: 18.0 },
  { id: 'NW', x0: -24.5, x1: -17.2, z0: -18.0, z1: -11.0 },
  { id: 'NE', x0: 17.2, x1: 24.5, z0: -18.0, z1: -11.0 },
];

// Two diagonals, each flowing in both directions. Start and end bounds are
// sidewalk corners; the delta carries people to the opposite sidewalk.
export const FLOWS = [
  { id: 'A', weight: 0.34, bounds: { x0: -24.5, x1: -17.2, z0: 11.0, z1: 18.0 }, delta: { x: 40, z: -30 } },
  { id: 'B', weight: 0.22, bounds: { x0: -24.5, x1: -17.2, z0: -18.0, z1: -11.0 }, delta: { x: 40, z: 30 } },
  { id: 'C', weight: 0.24, bounds: { x0: 17.2, x1: 24.5, z0: -18.0, z1: -11.0 }, delta: { x: -40, z: 30 } },
  { id: 'D', weight: 0.20, bounds: { x0: 17.2, x1: 24.5, z0: 11.0, z1: 18.0 }, delta: { x: -40, z: -30 } },
];

// Crosswalk footprints, kept in sync with environment.js drawing.
export const CROSSWALKS = {
  foreground: { x0: -20, x1: 20, z0: 7.4, z1: 15.8 },
  sideLeft: { x0: -18.8, x1: -11.6, z0: -15, z1: 15 },
  sideRight: { x0: 11.6, x1: 18.8, z0: -15, z1: 15 },
  diagonalHalfWidth: 4.6,
  diagonalReach: 16,
  diamondRadius: 12,
};

export function rectContains(r, x, z, margin = 0) {
  return x >= r.x0 - margin && x <= r.x1 + margin && z >= r.z0 - margin && z <= r.z1 + margin;
}

export function isOnSidewalk(x, z, margin = 0) {
  return SIDEWALKS.some((s) => rectContains(s, x, z, margin));
}

export function isOnCrosswalk(x, z, margin = 0) {
  const C = CROSSWALKS;
  if (rectContains(C.foreground, x, z, margin)) return true;
  if (rectContains(C.sideLeft, x, z, margin)) return true;
  if (rectContains(C.sideRight, x, z, margin)) return true;
  if (Math.abs(x + z) / Math.SQRT2 < C.diagonalHalfWidth + margin &&
      Math.abs(x) < C.diagonalReach + margin && Math.abs(z) < C.diagonalReach + margin) return true;
  if (Math.abs(x) + Math.abs(z) < C.diamondRadius + margin) return true;
  return false;
}

export function isParkable(x, z, margin = 0) {
  return x > ROAD.x0 + 1 && x < ROAD.x1 - 1 &&
         z > ROAD.z0 + 1 && z < ROAD.z1 - 1 &&
         !isOnSidewalk(x, z, margin) &&
         !isOnCrosswalk(x, z, margin + 1.6);
}

// Nudge a would-be illegal parked car to the nearest legal road slot.
export function sanitizePark(x, z, margin = 0) {
  let px = x, pz = z;
  for (let i = 0; i < 10 && !isParkable(px, pz, margin); i++) {
    px += (px >= 0 ? 1 : -1) * 1.8;
    if (Math.abs(px) > 24.5) px = (px >= 0 ? 24.5 : -24.5);
  }
  if (!isParkable(px, pz, margin)) {
    px = px >= 0 ? 23.5 : -23.5;
    pz = clamp(pz, -5, 5);
  }
  return { x: px, z: pz };
}

export function clampToWorld(p, margin = 1) {
  return {
    x: clamp(p.x, ROAD.x0 + margin, ROAD.x1 - margin),
    z: clamp(p.z, ROAD.z0 + margin, ROAD.z1 - margin),
  };
}
