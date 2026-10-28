import { Camera, lerp, smootherstep, mix3, v3 } from './math.js';

// One tile, seen like a model on a table: front-right three-quarter, high
// enough to read the street plan, low enough to keep the buildings as
// silhouettes. The camera drifts and breathes, but it never leaves the object.
//
// The framing was fitted numerically to the tile volume (30 × 28 × 17.6) so the
// set fills the frame instead of floating as a small diagram.
// Framing was solved numerically against the full object extents (case posts
// and plinth included), so the model fills the frame without cropping.
const KEYS = [
  { u: 0.00, eye: [9.4, 14.6, 38.8], target: [-1.0, 3.6, -2.2], fov: 38.5, roll: -0.005 },
  { u: 0.22, eye: [9.0, 14.3, 37.6], target: [-1.1, 3.6, -2.3], fov: 38.1, roll: -0.002 },
  { u: 0.50, eye: [8.4, 14.0, 36.4], target: [-0.9, 3.5, -2.4], fov: 37.7, roll: 0.004 },
  { u: 0.78, eye: [9.8, 14.8, 39.3], target: [-1.2, 3.7, -2.1], fov: 38.7, roll: 0.004 },
  { u: 0.90, eye: [10.0, 14.9, 39.6], target: [-1.2, 3.7, -2.0], fov: 38.8, roll: 0.001 },
  { u: 1.00, eye: [9.4, 14.6, 38.8], target: [-1.0, 3.6, -2.2], fov: 38.5, roll: -0.005 },
];

export class CameraRig {
  constructor(W, H) {
    this.camera = new Camera();
    this.camera.setViewport(W, H);
    this.shake = 1;
  }
  setViewport(W, H) { this.camera.setViewport(W, H); }
  update(u, params = {}) {
    const shake = (params.cameraShake == null ? this.shake : params.cameraShake);
    let a = KEYS[0], b = KEYS[KEYS.length - 1];
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (u >= KEYS[i].u && u <= KEYS[i + 1].u) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    }
    const t = smootherstep(a.u, b.u, u);
    const eye = mix3(v3(...a.eye), v3(...b.eye), t);
    const target = mix3(v3(...a.target), v3(...b.target), t);
    const fov = lerp(a.fov, b.fov, t);
    const roll = lerp(a.roll, b.roll, t);
    // Gentle gate weave / hand-crank drift: a model held in the hand.
    const s = shake * 0.05;
    eye.x += Math.sin(u * Math.PI * 2 * 2.1) * s;
    eye.y += Math.sin(u * Math.PI * 2 * 1.6 + 1.7) * s * 0.35;
    target.x += Math.cos(u * Math.PI * 2 * 1.4) * s * 0.25;
    this.camera.set(eye, target, fov, roll);
    return this.camera;
  }
}
