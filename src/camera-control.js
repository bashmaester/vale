// Optional user camera: orbit / fly takeover of the keyframed rig.
// Hidden during normal playback; any canvas drag or movement key activates it.
import { v3, add3, sub3, scale3, norm3, cross3, mix3, lerp, clamp, len3 } from './math.js';

const MOVEMENT_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

export class CameraController {
  constructor() {
    this.mode = 'auto'; // auto | returning | orbit | fly
    this.lastUserMode = 'orbit';
    this.keys = new Set();
    this.dragging = false;
    this.dragButton = 0;
    this.lastX = 0;
    this.lastY = 0;
    this.blend = 1;
    this.hudEnabled = true;
    this.hudTimer = 0;
    this.autoEye = v3(-28, 28, 48);
    this.autoTarget = v3(0, 1, -3);
    this.autoFov = 52;
    this.autoRoll = -0.008;
    this.eye = { ...this.autoEye };
    this.target = { ...this.autoTarget };
    this.desiredEye = { ...this.eye };
    this.desiredTarget = { ...this.target };
    this.fov = this.autoFov;
    this.desiredFov = this.autoFov;
    this.roll = this.autoRoll;
    this.distance = 35;
    this.yaw = 0;
    this.pitch = 0.72;
    this._buildHud();
    this.attach();
  }

  _buildHud() {
    this.hud = document.createElement('div');
    this.hud.className = 'cam-hud';
    this.hud.hidden = true;
    document.body.appendChild(this.hud);
  }

  _isFilmTarget(e) {
    const t = e.target;
    if (!t) return false;
    if (t.closest && t.closest('#lab')) return false;
    return t.classList && t.classList.contains('screen');
  }
  _isTyping(e) {
    const t = e.target;
    if (!t) return false;
    const tag = (t.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || (t.closest && t.closest('#lab'));
  }

  attach() {
    window.addEventListener('pointerdown', (e) => {
      if (!this._isFilmTarget(e)) return;
      if (this.mode === 'auto' || this.mode === 'returning') this._initFromAuto();
      if (this.mode === 'auto' || this.mode === 'returning') this.mode = 'orbit';
      this.dragging = true;
      this.dragButton = e.button;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.showHud();
      if (e.button !== 0) e.preventDefault();
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      if (this.dragButton === 0 && !this.keys.has('shift')) {
        this.yaw -= dx * 0.005;
        this.pitch = clamp(this.pitch + dy * 0.004, -1.15, 1.35);
      } else {
        this._pan(dx, dy);
      }
      this.showHud();
    });
    const endDrag = () => { this.dragging = false; };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    window.addEventListener('contextmenu', (e) => { if (this._isFilmTarget(e)) e.preventDefault(); });
    window.addEventListener('wheel', (e) => {
      if (!this._isFilmTarget(e)) return;
      e.preventDefault();
      if (this.mode === 'auto' || this.mode === 'returning') { this._initFromAuto(); this.mode = 'orbit'; }
      if (this.mode === 'orbit') {
        this.distance = clamp(this.distance * Math.exp(e.deltaY * 0.0011), 5, 90);
      } else if (this.mode === 'fly') {
        const f = norm3(sub3(this.target, this.eye));
        const m = scale3(f, -e.deltaY * 0.022);
        this.desiredEye = add3(this.desiredEye, m);
        this.desiredTarget = add3(this.desiredTarget, m);
      }
      this.showHud();
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (this._isTyping(e)) return;
      const k = e.key.toLowerCase();
      if (k === 'c') { this.toggle(); e.preventDefault(); return; }
      if (k === 'f') { this.toggleFly(); e.preventDefault(); return; }
      if (k === 'v' || k === '0') { this.forceAuto(); e.preventDefault(); return; }
      if (MOVEMENT_KEYS.has(k)) {
        if (this.mode === 'auto' || this.mode === 'returning') { this._initFromAuto(); this.mode = 'fly'; }
        this.keys.add(k);
        this.showHud();
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.key.toLowerCase()); });
    window.addEventListener('blur', () => { this.keys.clear(); this.dragging = false; });
  }

  _initFromAuto() {
    this.eye = { ...this.autoEye };
    this.target = { ...this.autoTarget };
    this.desiredEye = { ...this.eye };
    this.desiredTarget = { ...this.target };
    this.fov = this.desiredFov = this.autoFov;
    this.roll = this.autoRoll;
    const d = sub3(this.eye, this.target);
    this.distance = clamp(len3(d), 5, 90);
    this.yaw = Math.atan2(d.x, d.z);
    this.pitch = Math.asin(clamp(d.y / (this.distance || 1), -1, 1));
  }

  _basis() {
    const forward = norm3(sub3(this.target, this.eye));
    let right = norm3(cross3(forward, v3(0, 1, 0)));
    if (len3(right) < 0.001) right = v3(1, 0, 0);
    const up = norm3(cross3(right, forward));
    return { forward, right, up };
  }

  _pan(dx, dy) {
    const { right, up } = this._basis();
    const s = this.distance * 0.0016;
    const m = add3(scale3(right, -dx * s), scale3(up, dy * s));
    this.desiredTarget = add3(this.desiredTarget, m);
    this.desiredEye = add3(this.desiredEye, m);
  }

  _orbitEyeFromTarget() {
    const cp = Math.cos(this.pitch);
    return add3(this.desiredTarget, v3(
      Math.sin(this.yaw) * cp * this.distance,
      Math.sin(this.pitch) * this.distance,
      Math.cos(this.yaw) * cp * this.distance,
    ));
  }

  setMode(mode) {
    if (mode === 'auto') {
      if (this.mode !== 'auto') { this.mode = 'returning'; this.blend = 0; this.showHud(); }
      return;
    }
    if (mode !== 'orbit' && mode !== 'fly') return;
    if (this.mode === 'auto' || this.mode === 'returning') this._initFromAuto();
    this.mode = mode;
    this.lastUserMode = mode;
    this.showHud();
  }
  toggle() {
    if (this.mode === 'auto' || this.mode === 'returning') this.setMode(this.lastUserMode || 'orbit');
    else this.setMode('auto');
  }
  toggleFly() {
    if (this.mode === 'fly') this.setMode('orbit');
    else this.setMode('fly');
  }
  forceAuto() {
    this.mode = 'auto';
    this.blend = 1;
    this.keys.clear();
    this.dragging = false;
    this.hideHud();
  }
  status() {
    if (this.mode === 'auto') return 'AUTO RIG';
    if (this.mode === 'returning') return 'RETURNING TO AUTO';
    return `${this.mode.toUpperCase()} · USER`;
  }

  showHud() {
    if (!this.hudEnabled) return;
    this.hud.hidden = false;
    this.hud.textContent = `CAM · ${this.status()}  |  drag look · right-drag pan · wheel zoom · WASD/QE fly · C release · V reset`;
    this.hudTimer = performance.now() + 3600;
  }
  hideHud() { if (this.hud) this.hud.hidden = true; }

  apply(autoCamera, dt = 0.016, params = {}) {
    this.autoEye = { ...autoCamera.eye };
    this.autoTarget = { ...autoCamera.target };
    this.autoFov = autoCamera.fov;
    this.autoRoll = autoCamera.roll;
    if (this.mode === 'auto') return autoCamera;

    if (this.mode === 'returning') {
      this.blend = Math.min(1, this.blend + dt * 2.1);
      this.eye = mix3(this.eye, this.autoEye, this.blend);
      this.target = mix3(this.target, this.autoTarget, this.blend);
      this.fov = lerp(this.fov, this.autoFov, this.blend);
      this.roll = lerp(this.roll, this.autoRoll, this.blend);
      if (this.blend >= 1) { this.mode = 'auto'; this.hideHud(); }
      autoCamera.set(this.eye, this.target, this.fov, this.roll);
      return autoCamera;
    }

    const flySpeed = params.flySpeed == null ? 1 : params.flySpeed;
    const ease = params.cameraEase == null ? 8 : params.cameraEase;
    const boost = this.keys.has('shift') ? 3 : 1;
    const speed = flySpeed * 7 * dt * boost;
    const { forward, right, up } = this._basis();

    if (this.mode === 'orbit') {
      if (this.keys.has('w')) this.distance = clamp(this.distance - speed, 5, 90);
      if (this.keys.has('s')) this.distance = clamp(this.distance + speed, 5, 90);
      if (this.keys.has('a')) this.yaw -= speed * 0.09;
      if (this.keys.has('d')) this.yaw += speed * 0.09;
      if (this.keys.has('q')) this.pitch = clamp(this.pitch - speed * 0.06, -1.15, 1.35);
      if (this.keys.has('e')) this.pitch = clamp(this.pitch + speed * 0.06, -1.15, 1.35);
      if (this.keys.has('arrowleft')) this.yaw -= speed * 0.08;
      if (this.keys.has('arrowright')) this.yaw += speed * 0.08;
      if (this.keys.has('arrowup')) this.pitch = clamp(this.pitch + speed * 0.05, -1.15, 1.35);
      if (this.keys.has('arrowdown')) this.pitch = clamp(this.pitch - speed * 0.05, -1.15, 1.35);
      this.desiredEye = this._orbitEyeFromTarget();
    } else if (this.mode === 'fly') {
      let m = v3();
      if (this.keys.has('w')) m = add3(m, forward);
      if (this.keys.has('s')) m = sub3(m, forward);
      if (this.keys.has('a')) m = sub3(m, right);
      if (this.keys.has('d')) m = add3(m, right);
      if (this.keys.has('q')) m = sub3(m, v3(0, 1, 0));
      if (this.keys.has('e')) m = add3(m, v3(0, 1, 0));
      if (len3(m) > 0.001) {
        m = scale3(norm3(m), speed);
        this.desiredEye = add3(this.desiredEye, m);
        this.desiredTarget = add3(this.desiredTarget, m);
      }
      // Arrow keys nudge the look target in fly mode.
      if (this.keys.has('arrowleft') || this.keys.has('arrowright') ||
          this.keys.has('arrowup') || this.keys.has('arrowdown')) {
        let lm = v3();
        if (this.keys.has('arrowleft')) lm = sub3(lm, right);
        if (this.keys.has('arrowright')) lm = add3(lm, right);
        if (this.keys.has('arrowup')) lm = add3(lm, up);
        if (this.keys.has('arrowdown')) lm = sub3(lm, up);
        this.desiredTarget = add3(this.desiredTarget, scale3(lm, speed * 0.5));
      }
    }

    const k = 1 - Math.exp(-dt * Math.max(1, ease));
    this.eye = mix3(this.eye, this.desiredEye, k);
    this.target = mix3(this.target, this.desiredTarget, k);
    this.fov = lerp(this.fov, this.desiredFov, k);
    autoCamera.set(this.eye, this.target, this.fov, this.roll);
    if (this.hudTimer && performance.now() > this.hudTimer) this.hideHud();
    return autoCamera;
  }
}
