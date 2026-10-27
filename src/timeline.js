import { clamp, smoothstep, smootherstep, mod } from './math.js';

export const DURATION = 20;

export class Timeline {
  constructor(duration = DURATION) {
    this.duration = duration;
    this.t = 0;
    this.u = 0;
    // Secondary animation clock, used for idle sway, line boil and grain.
    // It must be a pure function of t that repeats every `duration`: any
    // per-frame integration or non-integer frequency would break the loop and
    // make t = 0 and t = 20 different frames. Slow motion is achieved by using
    // few cycles per loop inside the oscillators, not by scaling the clock.
    this.motionScale = 1;
    this.motionT = 0;
  }
  update(t) {
    this.t = mod(t, this.duration);
    this.u = this.t / this.duration;
    this.motionT = this.t;
    return this.u;
  }

  // One signal cycle. The crossing window is deliberately long: tiny people
  // should read as walking with weight, not sprinting across the plate.
  wait() { return 1 - smoothstep(0.14, 0.21, this.u); }
  walkSignal() {
    return smoothstep(0.155, 0.20, this.u) * (1 - smoothstep(0.655, 0.715, this.u));
  }
  stopSignal() { return 1 - this.walkSignal(); }
  cross() { return smootherstep(0.18, 0.68, this.u); }
  // Pure in `u` so the crowd can also ask "where would the crossing be a
  // fraction of a second from now?" when it works out which way to face.
  crossAt(delay, u) {
    const a = 0.18 + delay * 0.075;
    const b = 0.66 + delay * 0.055;
    return smootherstep(a, b, u);
  }
  crossWithDelay(delay) { return this.crossAt(delay, this.u); }
  drainAt(u) { return smoothstep(0.68, 0.82, u); }
  drain() { return this.drainAt(this.u); }
  empty() {
    return smoothstep(0.805, 0.855, this.u) * (1 - smoothstep(0.925, 0.975, this.u));
  }
  gather() { return smoothstep(0.93, 1.0, this.u); }
  crowdAlpha() {
    return clamp(1 - smoothstep(0.755, 0.865, this.u) + this.gather());
  }
  waiterAlpha() {
    return 0.18 + 0.82 * (1 - this.empty());
  }
  traffic() {
    return smoothstep(0.90, 0.965, this.u);
  }
  parkedAlpha() { return 1 - smoothstep(0.885, 0.945, this.u); }
  train() { return smootherstep(0.30, 0.76, this.u); }
  reflectionReform() { return smoothstep(0.78, 0.94, this.u); }
  rainPulse() {
    return 0.9 + 0.08 * Math.sin(this.u * Math.PI * 2) + 0.08 * this.walkSignal();
  }
  label() {
    const u = this.u;
    if (u < 0.16) return 'WAIT';
    if (u < 0.22) return 'SIGNAL';
    if (u < 0.68) return 'CROSS';
    if (u < 0.82) return 'DRAIN';
    if (u < 0.90) return 'EMPTY';
    return 'TRAFFIC';
  }
}

export const PHASES = [
  { id: 'WAIT', a: 0, b: 0.16, color: '#d43b30' },
  { id: 'SIGNAL', a: 0.16, b: 0.22, color: '#d8a03a' },
  { id: 'CROSS', a: 0.22, b: 0.68, color: '#2bb8ae' },
  { id: 'DRAIN', a: 0.68, b: 0.82, color: '#6c8f7f' },
  { id: 'EMPTY', a: 0.82, b: 0.90, color: '#5d6961' },
  { id: 'TRAFFIC', a: 0.90, b: 1, color: '#d43b30' },
];
