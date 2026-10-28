// Camera modes: small, self-contained controllers.
//
// Every mode talks to the same `Director` state (eye / target / fov / roll /
// focus / yaw / pitch) and receives only the events it cares about. Adding a
// new mode means adding one class here and one line in `MODES` — the input
// plumbing, blending and HUD are shared.
//
// Conventions:
//   +x right, +y up, +z toward the camera. yaw 0 looks toward -z.
//   Mouse look is left-drag (or pointer lock). There is no right-drag pan.
import { v3, add3, sub3, scale3, norm3, cross3, lerp, clamp, len3 } from './math.js';
import { TILE, groundYAt } from './tile.js';

const TAU = Math.PI * 2;

export function dirFromYawPitch(yaw, pitch) {
  const cp = Math.cos(pitch);
  return v3(Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}

export function yawPitchFromDir(d) {
  return {
    yaw: Math.atan2(d.x, -d.z),
    pitch: Math.asin(clamp(d.y, -1, 1)),
  };
}

function flatBasis(yaw) {
  const forward = v3(Math.sin(yaw), 0, -Math.cos(yaw));
  const right = norm3(cross3(forward, v3(0, 1, 0)));
  return { forward, right };
}

function clampToTile(p, inset = 1.2) {
  return v3(
    clamp(p.x, TILE.x0 + inset, TILE.x1 - inset),
    p.y,
    clamp(p.z, TILE.z0 + inset, TILE.z1 - inset),
  );
}

// --- base -----------------------------------------------------------------

export class CameraMode {
  constructor(dir) {
    this.dir = dir;
    this.id = 'mode';
    this.label = 'MODE';
    this.hint = '';
    this.usesAuto = false;
  }
  enter() {}
  exit() {}
  /** Optional: honour an externally supplied framing (teleport, tools, deep links). */
  place() {}
  /** @returns {boolean} true when the mode drives the camera itself. */
  update() { return false; }
  onLook() {}
  onMove() {}
  onWheel() {}
  reset() {}
}

// --- cinematic ------------------------------------------------------------

// Fixed framings that hold for a while: the "steady shots" the user asked for.
export const SHOTS = [
  {
    id: 'rig', label: 'Auto rig',
    // The keyframed camera from camera.js drives everything.
    auto: true,
  },
  {
    id: 'tripod', label: 'Tripod · street level',
    eye: v3(-8.4, 7.2, 28.5), target: v3(2.0, 3.0, 4.0), fov: 34,
    drift: 0.14,
  },
  {
    id: 'crane', label: 'Crane · rise',
    eye: v3(6.0, 5.6, 27.0), target: v3(3.0, 4.0, 8.0), fov: 38,
    rise: 8.5, drift: 0.10,
  },
  {
    id: 'orbit', label: 'Slow orbit',
    radius: 40, height: 20, target: v3(2.0, 2.4, 4.0), fov: 36,
    speed: 0.035, drift: 0.12,
  },
  {
    id: 'detail', label: 'Detail · crossing',
    eye: v3(-2.6, 3.6, 14.4), target: v3(2.4, 2.2, 6.0), fov: 32,
    drift: 0.10,
  },
];

export class CinematicMode extends CameraMode {
  constructor(dir) {
    super(dir);
    this.id = 'cinematic';
    this.label = 'CINEMATIC';
    this.hint = 'steady shots · [ ] change shot · C for free camera';
    this.shot = 'rig';
    this.time = 0;
  }
  get shotDef() { return SHOTS.find((s) => s.id === this.shot) || SHOTS[0]; }
  setShot(id) {
    if (!SHOTS.some((s) => s.id === id)) return false;
    this.shot = id;
    this.time = 0;
    this.dir.onModeChanged();
    return true;
  }
  cycleShot(step = 1) {
    const i = SHOTS.findIndex((s) => s.id === this.shot);
    const n = (i + step + SHOTS.length) % SHOTS.length;
    this.shot = SHOTS[n].id;
    this.time = 0;
    this.dir.onModeChanged();
    return this.shot;
  }
  enter() { this.time = 0; }
  reset() { this.time = 0; }
  update(dt) {
    const s = this.shotDef;
    if (s.auto) return false;
    this.time += dt;
    const d = this.dir;
    const drift = s.drift == null ? 0 : s.drift;
    let eye = { ...s.eye };
    if (s.rise) {
      // A slow crane: rise over ~14 s, then hold with a little breathing.
      const k = clamp(this.time / 14, 0, 1);
      eye = v3(eye.x, eye.y + s.rise * (k * k * (3 - 2 * k)), eye.z + s.rise * 0.25 * k);
    }
    if (s.radius) {
      const a = this.time * (s.speed || 0.04);
      eye = v3(
        Math.sin(a) * s.radius,
        s.height + Math.sin(this.time * 0.11) * 0.6,
        Math.cos(a) * s.radius * 0.62 + 2,
      );
    }
    // Handheld drift: tiny, slow, never enough to read as shake.
    const t = this.time;
    const wob = v3(Math.sin(t * 0.37) * drift, Math.sin(t * 0.53 + 1.7) * drift * 0.6, Math.cos(t * 0.29) * drift * 0.5);
    d.eye = add3(eye, wob);
    d.target = add3(s.target, scale3(wob, -0.6));
    d.fov = s.fov;
    d.roll = Math.sin(t * 0.17) * 0.0022;
    return true;
  }
}

// --- first person ---------------------------------------------------------

export class FpsMode extends CameraMode {
  constructor(dir) {
    super(dir);
    this.id = 'fps';
    this.label = 'FIRST PERSON';
    this.hint = 'WASD walk · drag look · shift run · wheel speed · C next mode';
    this.pos = v3(-6.5, 0, 8.0);
    this.eyeHeight = 1.66;
    this.walkSpeed = 3.2;
    this.runSpeed = 6.4;
  }
  enter() {
    // Start where the previous camera was looking, on the ground.
    this.pos = clampToTile(v3(this.dir.target.x, 0, this.dir.target.z));
    this.pos = v3(this.pos.x, groundYAt(this.pos.x, this.pos.z), this.pos.z);
  }
  reset() { this.enter(); }
  place(eye) {
    if (!eye) return;
    const p = clampToTile(v3(eye.x, 0, eye.z), 1.0);
    this.pos = v3(p.x, groundYAt(p.x, p.z), p.z);
  }
  update(dt, params) {
    const d = this.dir;
    const mult = (params.walkSpeed == null ? 1 : params.walkSpeed);
    const speed = (d.keys.has('shift') ? this.runSpeed : this.walkSpeed) * mult;
    const { forward, right } = flatBasis(d.yaw);
    let m = v3();
    if (d.keys.has('w') || d.keys.has('arrowup')) m = add3(m, forward);
    if (d.keys.has('s') || d.keys.has('arrowdown')) m = sub3(m, forward);
    if (d.keys.has('a') || d.keys.has('arrowleft')) m = sub3(m, right);
    if (d.keys.has('d') || d.keys.has('arrowright')) m = add3(m, right);
    if (len3(m) > 0.001) {
      m = scale3(norm3(m), speed * dt);
      this.pos = clampToTile(add3(this.pos, m), 1.0);
    }
    const gy = groundYAt(this.pos.x, this.pos.z);
    const bob = len3(m) > 0.001 ? Math.sin(performance.now() * 0.0085) * 0.014 : 0;
    d.eye = v3(this.pos.x, gy + this.eyeHeight + bob, this.pos.z);
    d.target = add3(d.eye, dirFromYawPitch(d.yaw, d.pitch));
    d.fov = 55;
    d.roll = 0;
    return true;
  }
}

// --- third person ---------------------------------------------------------

export class ThirdPersonMode extends CameraMode {
  constructor(dir) {
    super(dir);
    this.id = 'third';
    this.label = 'THIRD PERSON';
    this.hint = 'WASD move · drag orbit · wheel zoom · shift run · C next mode';
    this.pos = v3(-6.0, 0, 6.0);
    this.distance = 4.6;
    this.height = 1.35;
    this.walkSpeed = 2.9;
    this.runSpeed = 5.6;
    this.turn = 0;
  }
  enter() {
    this.pos = clampToTile(v3(this.dir.target.x, 0, this.dir.target.z));
    this.pos = v3(this.pos.x, groundYAt(this.pos.x, this.pos.z), this.pos.z);
    this.turn = this.dir.yaw;
  }
  reset() { this.enter(); }
  place(eye, target) {
    if (!target) return;
    const p = clampToTile(v3(target.x, 0, target.z), 1.0);
    this.pos = v3(p.x, groundYAt(p.x, p.z), p.z);
    if (eye) {
      const pivot = v3(p.x, this.pos.y + this.height, p.z);
      this.distance = clamp(len3(sub3(eye, pivot)), 1.8, 12);
    }
  }
  onWheel(dy) {
    this.distance = clamp(this.distance * Math.exp(dy * 0.0011), 1.8, 12);
  }
  update(dt, params) {
    const d = this.dir;
    const mult = (params.walkSpeed == null ? 1 : params.walkSpeed);
    const speed = (d.keys.has('shift') ? this.runSpeed : this.walkSpeed) * mult;
    const { forward, right } = flatBasis(d.yaw);
    let m = v3();
    if (d.keys.has('w') || d.keys.has('arrowup')) m = add3(m, forward);
    if (d.keys.has('s') || d.keys.has('arrowdown')) m = sub3(m, forward);
    if (d.keys.has('a') || d.keys.has('arrowleft')) m = sub3(m, right);
    if (d.keys.has('d') || d.keys.has('arrowright')) m = add3(m, right);
    const moving = len3(m) > 0.001;
    if (moving) {
      m = scale3(norm3(m), speed * dt);
      this.pos = clampToTile(add3(this.pos, m), 1.0);
      // The character faces the direction of travel, smoothly.
      const want = Math.atan2(m.x, -m.z);
      let delta = ((want - this.turn + Math.PI * 3) % TAU) - Math.PI;
      this.turn += delta * clamp(dt * 9, 0, 1);
    }
    this.pos.y = groundYAt(this.pos.x, this.pos.z);

    const pivot = v3(this.pos.x, this.pos.y + this.height, this.pos.z);
    const back = dirFromYawPitch(d.yaw, d.pitch);
    const eye = sub3(pivot, scale3(back, this.distance));
    eye.y = Math.max(eye.y, groundYAt(eye.x, eye.z) + 0.35);
    d.eye = eye;
    d.target = add3(pivot, scale3(back, 1.4));
    d.fov = 48;
    d.roll = 0;
    d.focus = this.pos;
    return true;
  }
}

// --- drone ----------------------------------------------------------------

export class DroneMode extends CameraMode {
  constructor(dir) {
    super(dir);
    this.id = 'drone';
    this.label = 'DRONE';
    this.hint = 'WASD fly · Q/E down/up · shift boost · wheel speed · drag look';
    this.speed = 11;
  }
  onWheel(dy) {
    this.speed = clamp(this.speed * Math.exp(-dy * 0.0009), 2, 60);
  }
  // The drone is the default eye of the film, so it opens on the shot the
  // cinematic rig established: high, three-quarter, whole volume in frame.
  enter() {
    const d = this.dir;
    d.fov = 40;
    if (this.touched) return;
    d.eye = v3(20.0, 20.0, 36.0);
    d.target = v3(2.0, 1.6, 6.0);
    const yp = yawPitchFromDir(norm3(sub3(d.target, d.eye)));
    d.yaw = yp.yaw;
    d.pitch = yp.pitch;
  }
  reset() {}
  update(dt, params) {
    const d = this.dir;
    const boost = d.keys.has('shift') ? 2.6 : 1;
    const speed = this.speed * (params.flySpeed == null ? 1 : params.flySpeed) * boost * dt;
    const look = dirFromYawPitch(d.yaw, d.pitch);
    const right = norm3(cross3(look, v3(0, 1, 0)));
    let m = v3();
    if (d.keys.has('w') || d.keys.has('arrowup')) m = add3(m, look);
    if (d.keys.has('s') || d.keys.has('arrowdown')) m = sub3(m, look);
    if (d.keys.has('a') || d.keys.has('arrowleft')) m = sub3(m, right);
    if (d.keys.has('d') || d.keys.has('arrowright')) m = add3(m, right);
    if (d.keys.has('e') || d.keys.has(' ')) m = add3(m, v3(0, 1, 0));
    if (d.keys.has('q')) m = sub3(m, v3(0, 1, 0));
    if (len3(m) > 0.001) {
      this.touched = true;
      const step = scale3(norm3(m), speed);
      d.eye = add3(d.eye, step);
      d.target = add3(d.target, step);
    } else {
      d.target = add3(d.eye, look);
    }
    // Held at the film's framing until the pilot actually flies, then widened
    // for a natural flying fov.
    d.fov = this.touched ? 52 : 38.5;
    d.roll = 0;
    return true;
  }
}

export const MODES = [CinematicMode, FpsMode, ThirdPersonMode, DroneMode];
