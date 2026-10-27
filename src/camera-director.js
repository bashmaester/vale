// The camera director: input plumbing, mode switching and blending.
//
// Modes live in `camera-modes.js` and only know about the shared state on this
// object. That keeps new modes cheap to add: one class, one entry in MODES.
//
// Controls
//   C          cycle  cinematic → first person → third person → drone
//   1 2 3 4    jump directly to a mode
//   V          back to cinematic
//   [ ]        previous / next cinematic steady shot
//   drag       look (left button). No right-drag pan: right-drag does nothing.
//   wheel      dolly / zoom (mode dependent)
//   WASD QE    move (mode dependent), shift = run / boost
import { v3, add3, sub3, norm3, clamp } from './math.js';
import { MODES, CinematicMode, SHOTS, dirFromYawPitch, yawPitchFromDir } from './camera-modes.js';

const LOOK_SENSITIVITY = 0.0032;
const MODE_ORDER = ['cinematic', 'fps', 'third', 'drone'];
const KEY_TO_MODE = { 1: 'cinematic', 2: 'fps', 3: 'third', 4: 'drone' };

export class CameraDirector {
  constructor() {
    this.mode = 'cinematic';
    this.modes = new Map();
    for (const Cls of MODES) {
      const m = new Cls(this);
      this.modes.set(m.id, m);
    }
    this.cinematic = this.modes.get('cinematic');

    this.keys = new Set();
    this.dragging = false;
    this.pointerLocked = false;
    this.lastX = 0;
    this.lastY = 0;
    this.hudEnabled = true;
    this.hudTimer = 0;

    this.eye = v3(9.4, 14.6, 38.8);
    this.target = v3(-1.0, 3.6, -2.2);
    this.fov = 38.5;
    this.roll = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.focus = v3();

    this.returning = false;
    this.blend = 1;
    this.onChange = null;

    this._buildHud();
    this._attach();
  }

  // --- HUD ----------------------------------------------------------------

  _buildHud() {
    this.hud = document.createElement('div');
    this.hud.className = 'cam-hud';
    this.hud.hidden = true;
    document.body.appendChild(this.hud);
  }

  showHud(text) {
    if (!this.hudEnabled || !this.hud) return;
    this.hud.hidden = false;
    const mode = this.modes.get(this.mode);
    this.hud.textContent = text || `CAM · ${this.status()}  |  ${mode ? mode.hint : ''}`;
    this.hudTimer = performance.now() + 4200;
  }
  hideHud() { if (this.hud) this.hud.hidden = true; }

  status() {
    if (this.mode === 'cinematic') {
      const s = this.cinematic.shotDef;
      return `CINEMATIC · ${s.label.toUpperCase()}`;
    }
    const m = this.modes.get(this.mode);
    return m ? `${m.label}` : this.mode.toUpperCase();
  }

  // --- input --------------------------------------------------------------

  _isFilmTarget(e) {
    const t = e.target;
    if (!t) return false;
    if (t.closest && (t.closest('#lab') || t.closest('#sidebar'))) return false;
    return t.classList && t.classList.contains('screen');
  }
  _isTyping(e) {
    const t = e.target;
    if (!t) return false;
    const tag = (t.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select'
      || (t.closest && (t.closest('#lab') || t.closest('#sidebar')));
  }

  _attach() {
    window.addEventListener('pointerdown', (e) => {
      if (!this._isFilmTarget(e)) return;
      // Right button never pans or orbits.
      if (e.button === 2) return;
      if (this.mode === 'cinematic') return; // steady shots are not draggable
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      if (e.target.setPointerCapture) {
        try { e.target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
      this.showHud();
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this._look(dx, dy);
    });
    const endDrag = () => { this.dragging = false; };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    window.addEventListener('contextmenu', (e) => { if (this._isFilmTarget(e)) e.preventDefault(); });

    window.addEventListener('wheel', (e) => {
      if (!this._isFilmTarget(e) || this.mode === 'cinematic') return;
      e.preventDefault();
      const m = this.modes.get(this.mode);
      if (m) m.onWheel(e.deltaY);
      this.showHud();
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (this._isTyping(e)) return;
      const k = e.key.toLowerCase();
      if (k === 'c') { this.cycle(); e.preventDefault(); return; }
      if (k === 'v') { this.setMode('cinematic'); e.preventDefault(); return; }
      if (KEY_TO_MODE[k]) { this.setMode(KEY_TO_MODE[k]); e.preventDefault(); return; }
      if (this.mode === 'cinematic' && (k === '[' || k === ']')) {
        this.cinematic.cycleShot(k === ']' ? 1 : -1);
        this.showHud();
        e.preventDefault();
        return;
      }
      if (this._isMoveKey(k)) {
        this.keys.add(k);
        this.showHud();
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.key.toLowerCase()); });
    window.addEventListener('blur', () => { this.keys.clear(); this.dragging = false; });
  }

  _isMoveKey(k) {
    return ['w', 'a', 's', 'd', 'q', 'e', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k);
  }

  _look(dx, dy) {
    this.yaw += dx * LOOK_SENSITIVITY;
    this.pitch = clamp(this.pitch - dy * LOOK_SENSITIVITY, -1.25, 1.25);
    // In cinematic mode looking is disabled at the source, but keyboard modes
    // still need the target recomputed from the mouse each frame.
    if (this.mode !== 'cinematic') {
      this.target = add3(this.eye, dirFromYawPitch(this.yaw, this.pitch));
    }
    this.showHud();
  }

  // --- mode switching -----------------------------------------------------

  onModeChanged() {
    if (this.onChange) this.onChange(this);
    this.showHud();
  }

  setMode(mode, opts = {}) {
    const alias = { orbit: 'third', fly: 'drone', auto: 'cinematic', user: 'third' };
    const id = alias[mode] || mode;
    if (!this.modes.has(id)) return false;
    if (id === this.mode && !opts.force) return true;

    const prev = this.modes.get(this.mode);
    if (prev && prev.exit) prev.exit();
    this.mode = id;
    const next = this.modes.get(id);
    // Inherit the current framing so the switch is a blend, not a cut.
    this.eye = { ...this.eye };
    this.target = { ...this.target };
    const d = sub3(this.target, this.eye);
    const yp = yawPitchFromDir(norm3(d));
    this.yaw = yp.yaw;
    this.pitch = yp.pitch;
    if (next && next.enter) next.enter();
    this.keys.clear();
    this.dragging = false;
    this.returning = false;
    this.blend = 0;
    this.onModeChanged();
    return true;
  }

  cycle(step = 1) {
    const i = MODE_ORDER.indexOf(this.mode);
    const next = MODE_ORDER[(i + step + MODE_ORDER.length) % MODE_ORDER.length];
    this.setMode(next);
    return next;
  }

  forceCinematic() { this.setMode('cinematic'); }

  /** Teleport: set the framing and let the active mode adopt it (tools, deep links). */
  place(eye, target, fov) {
    if (!eye || !target) return false;
    this.eye = { ...eye };
    this.target = { ...target };
    if (fov != null) this.fov = fov;
    const yp = yawPitchFromDir(norm3(sub3(this.target, this.eye)));
    this.yaw = yp.yaw;
    this.pitch = yp.pitch;
    const mode = this.modes.get(this.mode);
    if (mode && mode.place) mode.place(this.eye, this.target);
    this.showHud();
    return true;
  }
  setShot(id) { return this.cinematic.setShot(id); }
  get shot() { return this.cinematic.shot; }
  get shots() { return SHOTS; }

  // --- per frame ----------------------------------------------------------

  apply(autoCamera, dt = 0.016, params = {}) {
    const mode = this.modes.get(this.mode);
    this.blend = Math.min(1, this.blend + dt * 3.2);

    if (this.mode === 'cinematic') {
      const drives = mode.update(dt, params);
      if (!drives) {
        // Auto rig: hand the frame straight back, no easing, no drift.
        this.eye = { ...autoCamera.eye };
        this.target = { ...autoCamera.target };
        this.fov = autoCamera.fov;
        this.roll = autoCamera.roll;
        this._hudTick();
        return autoCamera;
      }
      autoCamera.set(this.eye, this.target, this.fov, this.roll);
      this._hudTick();
      return autoCamera;
    }

    const drove = mode.update(dt, params);
    if (!drove) return autoCamera;
    // Modes write this.eye / this.target directly, so the switch is continuous:
    // they start from the framing the cinematic camera had when you pressed C.
    autoCamera.set(this.eye, this.target, this.fov, this.roll);
    this._hudTick();
    return autoCamera;
  }

  _hudTick() {
    if (this.hudTimer && performance.now() > this.hudTimer) this.hideHud();
  }

  // Kept for the lab's older buttons.
  toggle() { this.cycle(); }
  toggleFly() { this.setMode(this.mode === 'drone' ? 'cinematic' : 'drone'); }
  forceAuto() { this.setMode('cinematic'); }
}

export { SHOTS };
