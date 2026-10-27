// Small math / noise / camera toolkit. No dependencies.

export const PI = Math.PI;
export const TAU = Math.PI * 2;

export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const fract = (v) => v - Math.floor(v);
export const mod = (a, n) => ((a % n) + n) % n;

export function smoothstep(a, b, v) {
  const t = clamp(invLerp(a, b, v));
  return t * t * (3 - 2 * t);
}
export function smootherstep(a, b, v) {
  const t = clamp(invLerp(a, b, v));
  return t * t * t * (t * (t * 6 - 15) + 10);
}
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const add3 = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub3 = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale3 = (a, s) => v3(a.x * s, a.y * s, a.z * s);
export const dot3 = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross3 = (a, b) => v3(
  a.y * b.z - a.z * b.y,
  a.z * b.x - a.x * b.z,
  a.x * b.y - a.y * b.x,
);
export const len3 = (a) => Math.sqrt(dot3(a, a));
export const norm3 = (a) => {
  const l = len3(a) || 1;
  return v3(a.x / l, a.y / l, a.z / l);
};
export const mix3 = (a, b, t) => v3(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));

export function hash11(n) {
  const s = Math.sin(n * 127.1) * 43758.5453123;
  return fract(s);
}
export function hash21(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return fract(s);
}
export function hash31(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return fract(s);
}

export function valueNoise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash21(ix, iy);
  const b = hash21(ix + 1, iy);
  const c = hash21(ix, iy + 1);
  const d = hash21(ix + 1, iy + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

export function fbm2(x, y, octaves = 4) {
  let v = 0, a = 0.5, fx = x, fy = y;
  for (let i = 0; i < octaves; i++) {
    v += a * valueNoise2(fx, fy);
    fx = fx * 2.03 + 11.7;
    fy = fy * 2.01 - 7.3;
    a *= 0.5;
  }
  return v;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const r = mulberry32(seed);
  return {
    next: r,
    range: (a, b) => lerp(a, b, r()),
    int: (a, b) => Math.floor(lerp(a, b + 1, r())),
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    chance: (p) => r() < p,
  };
}

// Perspective camera. World: x right, y up, z toward viewer.
// Returns screen coords plus a world-units-to-pixels scale.
export class Camera {
  constructor() {
    this.eye = v3(0, 22, 24);
    this.target = v3(0, 0, -1);
    this.fov = 50;
    this.roll = 0;
    this.W = 1;
    this.H = 1;
  }
  set(eye, target, fov = 50, roll = 0) {
    this.eye = Array.isArray(eye) ? v3(eye[0], eye[1], eye[2]) : eye;
    this.target = Array.isArray(target) ? v3(target[0], target[1], target[2]) : target;
    this.fov = fov;
    this.roll = roll;
  }
  setViewport(W, H) { this.W = W; this.H = H; }
  basis() {
    const forward = norm3(sub3(this.target, this.eye));
    let right = norm3(cross3(forward, v3(0, 1, 0)));
    if (len3(right) < 0.0001) right = v3(1, 0, 0);
    const up = norm3(cross3(right, forward));
    return { forward, right, up };
  }
  project(p) {
    const { forward, right, up } = this.basis();
    const v = sub3(p, this.eye);
    const x = dot3(v, right);
    const y = dot3(v, up);
    const z = dot3(v, forward);
    if (z <= 0.05) return null;
    const focal = 1 / Math.tan((this.fov * PI) / 360);
    const aspect = this.W / this.H;
    let nx = (x * focal) / (z * aspect);
    let ny = (y * focal) / z;
    if (this.roll) {
      const c = Math.cos(this.roll), s = Math.sin(this.roll);
      const rx = nx * c - ny * s;
      const ry = nx * s + ny * c;
      nx = rx; ny = ry;
    }
    return {
      x: (nx * 0.5 + 0.5) * this.W,
      y: (0.5 - ny * 0.5) * this.H,
      depth: z,
      scale: (focal / z) * (this.H * 0.5),
    };
  }
}

export function quadLerp(q, u, v) {
  // q = [TL, TR, BR, BL]
  const top = [lerp(q[0][0], q[1][0], u), lerp(q[0][1], q[1][1], u)];
  const bottom = [lerp(q[3][0], q[2][0], u), lerp(q[3][1], q[2][1], u)];
  return [lerp(top[0], bottom[0], v), lerp(top[1], bottom[1], v)];
}
