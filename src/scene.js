import { Painter } from './draw.js';
import { Camera } from './math.js';
import { CameraRig } from './camera.js';
import { CameraDirector } from './camera-director.js';
import { Timeline } from './timeline.js';
import { Crowd } from './crowd.js';
import { Traffic, drawVehicle } from './traffic.js';
import { Weather } from './weather.js';
import {
  lodForScreenHeight, makeDetail, tileScreenHeight, clampLevel,
} from './tile.js';
import {
  drawBackdrop, drawStreet, drawPaving, drawRoadMarkings, drawRail,
  drawBuildings, drawSignals, drawFurniture, drawReflections, drawFlicker,
  collectFrame,
} from './environment.js';

export const SCENE_PARAM_DEFS = {
  crowdDensity: { value: 1.0, min: 0.2, max: 2.0, step: 0.01, label: 'crowd density' },
  // Metres of boundary buffer: crowd and vehicles fade (or vanish) inside this
  // band instead of popping. 0 = hard clip, which is only useful for tools.
  loopBuffer: { value: 1.1, min: 0.0, max: 3.0, step: 0.05, label: 'boundary buffer' },
  walkSpeed: { value: 1.0, min: 0.3, max: 2.0, step: 0.01, label: 'walk tempo' },
  rainAmount: { value: 1.0, min: 0.0, max: 2.0, step: 0.01, label: 'raindrop amount' },
  rainSpeed: { value: 1.0, min: 0.2, max: 2.0, step: 0.01, label: 'raindrop speed' },
  puddleAmount: { value: 1.0, min: 0.0, max: 2.0, step: 0.01, label: 'puddle / ripple amount' },
  wind: { value: 0.6, min: -1.0, max: 2.0, step: 0.01, label: 'wind / tilt' },
  cameraShake: { value: 1.0, min: 0.0, max: 2.0, step: 0.01, label: 'gate weave' },
  flySpeed: { value: 1.0, min: 0.2, max: 3.0, step: 0.01, label: 'fly speed' },
  cameraEase: { value: 8.0, min: 2.0, max: 20.0, step: 0.1, label: 'camera ease' },
  lod: { value: -1, min: -1, max: 2, step: 1, label: 'LoD (-1 = auto)' },
  // 1 = the museum case is visible, 0 = only the volume itself.
  // Off by default: the case is a diagnostic / gallery object, not part of the
  // film. Turn it on in the sidebar when you want to read the tile boundary.
  caseFrame: { value: 0, min: 0, max: 1, step: 1, label: 'case boundaries' },
};

function defaults() {
  return Object.fromEntries(Object.entries(SCENE_PARAM_DEFS).map(([k, d]) => [k, d.value]));
}

function makeCanvas(W, H, alpha = true) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { alpha });
  ctx.imageSmoothingEnabled = true;
  return c;
}

export class Scene {
  constructor(W, H) {
    this.W = W; this.H = H;
    this.params = defaults();
    this.plate = makeCanvas(W, H, false);
    this.field = makeCanvas(W, H, false);
    this.pp = new Painter(this.plate.getContext('2d'), W, H);
    this.fp = new Painter(this.field.getContext('2d'), W, H);
    // Everything that never moves relative to the camera is painted once into
    // this layer and then blitted (see _ensureStatic). It is by far the biggest
    // saving: the set costs ~34 ms a frame, the blit costs ~1 ms.
    this.static = makeCanvas(W, H, true);
    this.sp = new Painter(this.static.getContext('2d'), W, H);
    this._staticKey = '';
    this._staticPose = null;
    this._staticShift = { x: 0, y: 0 };
    this.staticStats = { redraws: 0, blits: 0 };

    this.timeline = new Timeline(20);
    this.cameraRig = new CameraRig(W, H);
    this.cameraController = new CameraDirector();
    this.crowd = new Crowd(this.params);
    this.traffic = new Traffic(this.params);
    this.weather = new Weather(W, H);
    this.lod = { level: 0, px: 999, id: 'hero' };
    this.detail = makeDetail(0);
  }

  setViewport(W, H) {
    this.W = W; this.H = H;
    for (const c of [this.plate, this.field, this.static]) { c.width = W; c.height = H; }
    this.pp.W = this.fp.W = this.sp.W = W;
    this.pp.H = this.fp.H = this.sp.H = H;
    this._staticKey = '';
    this._staticPose = null;
    this.weather.W = W; this.weather.H = H;
    this.cameraRig.setViewport(W, H);
  }

  setParam(key, value) {
    if (!(key in this.params)) return false;
    this.params[key] = Number(value);
    if (key === 'crowdDensity') this.crowd.setDensity(this.params[key]);
    return true;
  }
  setParams(obj) {
    for (const [k, v] of Object.entries(obj || {})) this.setParam(k, v);
  }
  resetParams() {
    this.params = defaults();
    this.crowd.setDensity(this.params.crowdDensity);
  }
  getParams() { return { ...this.params }; }

  _clearPlate() {
    const ctx = this.pp.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#050605';
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.restore();
  }

  // --- the cached set ----------------------------------------------------
  //
  // The set (backdrop, street, paving, markings, buildings, furniture, rails,
  // far case members) is a pure function of the camera pose and the LoD level.
  // Render it into `this.static` and reuse it while the camera has only drifted
  // a little: the delta is applied as a sub-pixel blit offset, so the plate
  // stays smooth. Above ~2.5 px of drift the layer is repainted, which keeps
  // the parallax error invisible.
  _drawSet(camera, detail) {
    const p = this.sp;
    p.ctx.setTransform(1, 0, 0, 1, 0, 0);
    p.ctx.clearRect(0, 0, this.W, this.H);
    p.setBoil(this.pp.boil);
    drawBackdrop(p, camera, detail);
    drawStreet(p, camera, detail);
    drawPaving(p, camera, detail);
    drawRoadMarkings(p, camera, this.timeline);
    drawRail(p, camera);
    for (const it of collectFrame(p, camera, this.params)) if (it.group === 'far') it.draw(p);
    drawBuildings(p, camera, detail, this.timeline);
    drawFurniture(p, camera, detail, this.timeline);
  }

  _ensureStatic(camera, detail) {
    const key = `${detail.level}|${this.params.caseFrame}|${this.W}x${this.H}`;
    const ref = { x: 0, y: 3.2, z: 0 };
    let needsRepaint = key !== this._staticKey || !this._staticPose;
    let dx = 0, dy = 0;
    if (!needsRepaint) {
      const a = this._staticCamera.project(ref);
      const b = camera.project(ref);
      if (!a || !b) {
        needsRepaint = true;
      } else {
        dx = b.x - a.x; dy = b.y - a.y;
        if (Math.hypot(dx, dy) > 2.5) needsRepaint = true;
      }
    }
    if (needsRepaint) {
      this._drawSet(camera, detail);
      this._staticKey = key;
      this._staticPose = { eye: { ...camera.eye }, target: { ...camera.target }, fov: camera.fov, roll: camera.roll };
      this._staticCamera = new Camera();
      this._staticCamera.setViewport(this.W, this.H);
      this._staticCamera.set(camera.eye, camera.target, camera.fov, camera.roll);
      this._staticCamera.roll = camera.roll;
      dx = 0; dy = 0;
      this.staticStats.redraws++;
    } else {
      this.staticStats.blits++;
    }
    this._staticShift.x = dx; this._staticShift.y = dy;
    return this._staticShift;
  }

  // Resolve procedural LoD for this frame from the tile's projected height.
  resolveDetail(camera) {
    const px = tileScreenHeight(camera);
    const forced = this.params.lod;
    const level = forced >= 0 ? clampLevel(forced) : lodForScreenHeight(px).level;
    const detail = makeDetail(level);
    this.lod = { level, px, id: detail.id };
    this.detail = detail;
    return detail;
  }

  render(t, dt = 0.016) {
    const timeline = this.timeline;
    const prevT = timeline.t;
    timeline.update(t);
    // At the loop point the camera returns to exactly the pose it started from,
    // so the cached set must be repainted there rather than reused with an
    // accumulated blit offset. This is what makes t=0 and t=20 identical.
    if (timeline.t < prevT) this._staticKey = '';
    this.params.motionT = timeline.motionT;
    this.params.motionScale = timeline.motionScale;

    const autoCamera = this.cameraRig.update(timeline.u, this.params);
    const camera = this.cameraController.apply(autoCamera, dt, this.params);
    const detail = this.resolveDetail(camera);
    const boil = Math.floor(timeline.motionT * 7.5);
    this.pp.setBoil(boil); this.fp.setBoil(boil);

    // Simulate before drawing so the plane can be sorted by depth.
    this.profile = this.profile || {};
    const simT = performance.now();
    this.weather.update(t, this.params);
    this.traffic.update(camera, timeline, this.params, detail);
    this.crowd.update(camera, timeline, this.params, this.traffic.activeItems(), detail);
    this.profile.sim = (this.profile.sim || 0) + (performance.now() - simT);

    this._clearPlate();
    const T = this.profile = this.profile || {};
    let mark = performance.now();
    const tick = (k) => { const n = performance.now(); T[k] = (T[k] || 0) + (n - mark); mark = n; };

    // 1) The cached set (backdrop, street, paving, markings, rails, far case,
    //    buildings, furniture). Repainted only when the camera drifts.
    const shift = this._ensureStatic(camera, detail);
    if (shift.x || shift.y) this.pp.ctx.drawImage(this.static, shift.x, shift.y);
    else this.pp.ctx.drawImage(this.static, 0, 0);
    tick('set');

    // 2) The train moves, so it is drawn over the cached set.
    this.traffic.drawTrain(this.pp, camera, timeline, this.params); tick('train');

    // 3) Signals animate through the cycle; lamps flicker on looped noise.
    drawSignals(this.pp, camera, timeline);
    drawFlicker(this.pp, camera, timeline.t); tick('signals');

    // The near case members take part in the depth sort below.
    const frameItems = collectFrame(this.pp, camera, this.params);

    // 4) Wet ground: puddles, then the reflections of the signs.
    this.weather.drawPuddles(this.pp, camera, timeline, this.params, detail); tick('puddles');
    drawReflections(this.pp, camera, timeline, detail); tick('reflections');

    // 5) Cars and people, interleaved by projected depth so a person on the
    //    far sidewalk can be occluded by a car in the near lane.
    const drawables = [];
    for (const it of this.traffic.activeItems()) {
      drawables.push({ depth: it.depth, draw: (p) => drawVehicle(p, camera, it) });
    }
    for (const it of this.crowd.items) {
      if (it.alpha < 0.02) continue;
      drawables.push({
        depth: it.depth,
        draw: (p) => { for (const d of it.draws) d(p); },
      });
    }
    // Near case members (plinth, posts, rails) sort with the scene so a post
    // in front of a vehicle occludes it and the plinth never floats.
    for (const it of frameItems) {
      if (it.group !== 'near') continue;
      drawables.push({ depth: it.depth, draw: it.draw });
    }
    drawables.sort((a, b) => b.depth - a.depth);
    for (const d of drawables) d.draw(this.pp); tick('people+cars');

    // 6) Rain inside the volume. Nothing is drawn over the plate after it: the
    //    case members are already in the depth sort.
    this.weather.drawRain(this.pp, camera, timeline, this.params, detail); tick('rain');

    this.weather.drawField(this.fp, timeline, this.crowd, this.traffic, camera, this.params); tick('field');
    return { plate: this.plate, field: this.field };
  }
}
