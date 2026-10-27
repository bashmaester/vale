import { Camera, lerp, smootherstep, mix3, v3 } from './math.js';

// A small keyframed camera rig. Movement is deliberately restrained:
// the image should feel like a printed plate, not a flying 3D camera.
const KEYS = [
  { u: 0.00, eye: [0, 23.5, 25.0], target: [0, 0.2, -1.0], fov: 50, roll: -0.012 },
  { u: 0.18, eye: [-0.8, 22.6, 24.0], target: [0, 0.4, -1.2], fov: 49, roll: -0.006 },
  { u: 0.46, eye: [1.8, 21.3, 22.4], target: [0.4, 0.2, -1.4], fov: 47.5, roll: 0.010 },
  { u: 0.68, eye: [0.4, 22.0, 23.2], target: [0, 0.2, -1.0], fov: 49, roll: 0.004 },
  { u: 0.84, eye: [-0.5, 23.0, 24.6], target: [0, 0.2, -0.8], fov: 50, roll: -0.010 },
  { u: 1.00, eye: [0, 23.5, 25.0], target: [0, 0.2, -1.0], fov: 50, roll: -0.012 },
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
    let a = KEYS[0], b = KEYS[KEYS.length - 1], t = 0;
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (u >= KEYS[i].u && u <= KEYS[i + 1].u) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    }
    t = smootherstep(a.u, b.u, u);
    const eye = mix3(v3(...a.eye), v3(...b.eye), t);
    const target = mix3(v3(...a.target), v3(...b.target), t);
    const fov = lerp(a.fov, b.fov, t);
    const roll = lerp(a.roll, b.roll, t);
    // Gentle gate weave / hand-crank drift.
    const s = shake * 0.10;
    eye.x += Math.sin(u * Math.PI * 2 * 3.1) * s;
    eye.y += Math.sin(u * Math.PI * 2 * 2.3 + 1.7) * s * 0.45;
    target.x += Math.cos(u * Math.PI * 2 * 1.7) * s * 0.35;
    this.camera.set(eye, target, fov, roll);
    return this.camera;
  }
}
