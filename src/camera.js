import { Camera, lerp, smootherstep, mix3, v3 } from './math.js';

// A restrained three-quarter view of one built-out corner. The camera keeps
// moving, but the set stays volumetric: we see the tops and two faces of the
// sidewalk block and buildings rather than a flat plan.
const KEYS = [
  { u: 0.00, eye: [-28.0, 28.0, 48.0], target: [0.0, 1.0, -3.0], fov: 52, roll: -0.008 },
  { u: 0.18, eye: [-27.0, 27.4, 47.0], target: [0.4, 1.0, -3.2], fov: 51.5, roll: -0.004 },
  { u: 0.46, eye: [-25.6, 26.6, 45.4], target: [0.9, 0.9, -3.6], fov: 50.5, roll: 0.006 },
  { u: 0.68, eye: [-26.4, 27.0, 46.2], target: [0.6, 0.9, -3.4], fov: 51.2, roll: 0.003 },
  { u: 0.84, eye: [-27.4, 27.7, 47.4], target: [0.2, 1.0, -3.1], fov: 51.8, roll: -0.006 },
  { u: 1.00, eye: [-28.0, 28.0, 48.0], target: [0.0, 1.0, -3.0], fov: 52, roll: -0.008 },
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
    const s = shake * 0.08;
    eye.x += Math.sin(u * Math.PI * 2 * 2.1) * s;
    eye.y += Math.sin(u * Math.PI * 2 * 1.6 + 1.7) * s * 0.4;
    target.x += Math.cos(u * Math.PI * 2 * 1.4) * s * 0.3;
    this.camera.set(eye, target, fov, roll);
    return this.camera;
  }
}
