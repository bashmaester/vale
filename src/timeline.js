import { clamp, smoothstep, smootherstep } from './math.js';

export const DURATION = 20;

export class Timeline {
  constructor(duration = DURATION) {
    this.duration = duration;
    this.t = 0;
    this.u = 0;
    this.speed = 1;
  }
  update(t) {
    this.t = ((t % this.duration) + this.duration) % this.duration;
    this.u = this.t / this.duration;
    return this.u;
  }

  // One signal cycle. All modules read these curves so waiting, crossing,
  // drainage, emptiness and returning traffic stay legible.
  wait() { return 1 - smoothstep(0.14, 0.21, this.u); }
  walkSignal() {
    return smoothstep(0.155, 0.20, this.u) * (1 - smoothstep(0.565, 0.625, this.u));
  }
  stopSignal() { return 1 - this.walkSignal(); }
  cross() { return smootherstep(0.18, 0.585, this.u); }
  crossWithDelay(delay) {
    const a = 0.18 + delay * 0.10;
    const b = 0.585 + delay * 0.06;
    return smootherstep(a, b, this.u);
  }
  drain() { return smoothstep(0.585, 0.79, this.u); }
  empty() {
    return smoothstep(0.735, 0.815, this.u) * (1 - smoothstep(0.895, 0.955, this.u));
  }
  gather() { return smoothstep(0.91, 1.0, this.u); }
  crowdAlpha() {
    return clamp(1 - smoothstep(0.67, 0.80, this.u) + this.gather());
  }
  waiterAlpha() {
    return 0.20 + 0.80 * (1 - this.empty());
  }
  traffic() {
    return smoothstep(0.88, 0.95, this.u);
  }
  parkedAlpha() { return 1 - smoothstep(0.86, 0.92, this.u); }
  train() { return smootherstep(0.31, 0.73, this.u); }
  reflectionReform() { return smoothstep(0.74, 0.92, this.u); }
  rainPulse() {
    return 0.85 + 0.15 * Math.sin(this.u * Math.PI * 2 * 2) + 0.12 * this.walkSignal();
  }
  label() {
    const u = this.u;
    if (u < 0.16) return 'WAIT';
    if (u < 0.22) return 'SIGNAL';
    if (u < 0.585) return 'CROSS';
    if (u < 0.79) return 'DRAIN';
    if (u < 0.88) return 'EMPTY';
    return 'TRAFFIC';
  }
}

export const PHASES = [
  { id: 'WAIT', a: 0, b: 0.16, color: '#d43b30' },
  { id: 'SIGNAL', a: 0.16, b: 0.22, color: '#d8a03a' },
  { id: 'CROSS', a: 0.22, b: 0.585, color: '#2bb8ae' },
  { id: 'DRAIN', a: 0.585, b: 0.79, color: '#6c8f7f' },
  { id: 'EMPTY', a: 0.79, b: 0.88, color: '#5d6961' },
  { id: 'TRAFFIC', a: 0.88, b: 1, color: '#d43b30' },
];
