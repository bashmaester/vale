import { Camera, lerp, smootherstep, mix3, v3 } from './math.js';

// A near-street-level three-quarter view of ONE built-out corner, not an
// aerial plan of a whole junction. The camera sits low on the opposite
// sidewalk, looking slightly up at the NE buildings, with the crossing and the
// waiting crowd in the foreground. Framing was validated against real
// screenshots: the set now fills the frame instead of floating in a void.
const KEYS = [
  { u: 0.00, eye: [-15.5, 9.6, 17.5], target: [10.5, 4.1, -11.0], fov: 50, roll: -0.006 },
  { u: 0.18, eye: [-14.9, 9.3, 16.6], target: [10.9, 4.0, -11.4], fov: 50, roll: -0.003 },
  { u: 0.46, eye: [-13.6, 8.7, 14.9], target: [11.6, 3.8, -12.2], fov: 49, roll: 0.004 },
  { u: 0.68, eye: [-14.3, 9.0, 15.8], target: [11.2, 3.9, -11.8], fov: 49.5, roll: 0.002 },
  { u: 0.84, eye: [-15.1, 9.4, 16.9], target: [10.7, 4.0, -11.2], fov: 50, roll: -0.004 },
  { u: 1.00, eye: [-15.5, 9.6, 17.5], target: [10.5, 4.1, -11.0], fov: 50, roll: -0.006 },
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
