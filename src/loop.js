// Loop primitives.
//
// The whole scene has to be a *perfect* loop: the frame at t = 0 must be
// identical to the frame at t = DURATION, not merely similar. That rules out
// anything that integrates state frame by frame (a drop that falls by `dt`
// each tick drifts out of phase the instant the frame rate changes), and it
// rules out `Math.random`.
//
// So every animated element is a pure function of loop time:
//
//   position = f(seed, t)      with f(seed, t + DURATION) === f(seed, t)
//
// The helpers here are the only way the scene is allowed to introduce
// randomness or time: a seeded hash for stable per-element constants, and
// period-quantised motion so a fall/traverse always completes an integer number
// of times per loop.

import { TAU, hash11 } from './math.js';

export const LOOP = 20;

/** Fractional part of `t / period + phase`, always in [0, 1). */
export function loopFrac(t, period, phase = 0) {
  if (!(period > 0)) return 0;
  const x = t / period + phase;
  return x - Math.floor(x);
}

/**
 * Snap a duration to an integer number of cycles inside the loop.
 * `loopCycles(20, 1.7)` → 12 cycles → 1.6667 s, which loops exactly at t = 20.
 */
export function loopCycles(duration = LOOP, base = 1, min = 1) {
  return Math.max(min, Math.round(duration / Math.max(0.0001, base)));
}

/** A period that divides the loop exactly. */
export function loopPeriod(base = 1, duration = LOOP, min = 1) {
  return duration / loopCycles(duration, base, min);
}

/** Wrap `v` into [a, b). */
export function wrapRange(v, a, b) {
  const L = b - a;
  if (!(L > 0)) return a;
  return a + ((((v - a) % L) + L) % L);
}

/** 0..1..0 triangle wave, one cycle per call of `period`. */
export function loopTri(t, period, phase = 0) {
  const f = loopFrac(t, period, phase);
  return 1 - Math.abs(2 * f - 1);
}

/**
 * Seamless 1-D noise in [-1, 1] that repeats exactly every `duration`.
 * Built from sines whose frequencies are integer cycles per loop, so there is
 * no seam at the loop point and no stored state between frames.
 */
export function loopNoise(seed, t, duration = LOOP, harmonics = 3) {
  let sum = 0, amp = 1, total = 0;
  for (let k = 1; k <= harmonics; k++) {
    const cycles = k + Math.floor(hash11(seed * 0.37 + k * 5.1) * 2);
    const phase = hash11(seed * 1.91 + k * 3.7);
    sum += Math.sin(TAU * (cycles * (t / duration) + phase)) * amp;
    total += amp;
    amp *= 0.55;
  }
  return total > 0 ? sum / total : 0;
}

/** Seeded per-element constant in [a, b]. */
export function seeded(seed, salt, a = 0, b = 1) {
  return a + (b - a) * hash11(seed * 2.17 + salt * 7.13);
}

/**
 * Boundary policy shared by the crowd and the vehicles.
 *
 * `mode`:
 *   'wrap'  – the element is already out of frame; do nothing.
 *   'fade'  – fade out over `buffer` world units before the tile edge.
 *   'clip'  – vanish the moment it touches the buffer.
 *
 * Returns an alpha multiplier (0..1). A person standing in the middle of the
 * tile always gets 1, so nothing fades in the middle of the shot — which was
 * the actual complaint.
 */
export function boundaryAlpha(x, z, tile, buffer = 0, mode = 'wrap') {
  // `tile` may be widened on a side to disable the fade there: the near (+z)
  // edge of the set is the open side, where people walk normally.
  if (mode === 'wrap' || !(buffer > 0)) return 1;
  const d = Math.min(x - tile.x0, tile.x1 - x, z - tile.z0, tile.z1 - z);
  if (d >= buffer) return 1;
  const k = Math.max(0, d / buffer);
  if (mode === 'clip') return k > 0.001 ? 1 : 0;
  // Smoothstep so the fade never shows a hard edge.
  return k * k * (3 - 2 * k);
}
