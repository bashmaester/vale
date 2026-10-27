import { Painter } from './draw.js';
import { CameraRig } from './camera.js';
import { Timeline } from './timeline.js';
import { drawEnvironment } from './environment.js';
import { Crowd } from './crowd.js';
import { Traffic } from './traffic.js';
import { Weather } from './weather.js';

export const SCENE_PARAM_DEFS = {
  crowdDensity: { value: 1.0, min: 0.3, max: 2.0, step: 0.01, label: 'crowd density' },
  walkSpeed: { value: 1.0, min: 0.3, max: 2.0, step: 0.01, label: 'walk tempo' },
  rainAmount: { value: 1.0, min: 0.0, max: 2.0, step: 0.01, label: 'rain amount' },
  wind: { value: 0.6, min: -1.0, max: 2.0, step: 0.01, label: 'wind / tilt' },
  wetness: { value: 1.0, min: 0.0, max: 1.6, step: 0.01, label: 'wetness' },
  reflectionStrength: { value: 1.0, min: 0.0, max: 2.0, step: 0.01, label: 'reflection depth' },
  footstepStrength: { value: 1.0, min: 0.0, max: 2.0, step: 0.01, label: 'footstep gouge' },
  cameraShake: { value: 1.0, min: 0.0, max: 2.0, step: 0.01, label: 'gate weave' },
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
    this.wet = makeCanvas(W, H, true);
    this.field = makeCanvas(W, H, false);
    this.pp = new Painter(this.plate.getContext('2d'), W, H);
    this.wp = new Painter(this.wet.getContext('2d'), W, H);
    this.fp = new Painter(this.field.getContext('2d'), W, H);
    // Use the same contexts for consistency.
    this.pp.ctx = this.plate.getContext('2d');
    this.wp.ctx = this.wet.getContext('2d');
    this.fp.ctx = this.field.getContext('2d');

    this.timeline = new Timeline(20);
    this.cameraRig = new CameraRig(W, H);
    this.crowd = new Crowd(this.params);
    this.traffic = new Traffic(this.params);
    this.weather = new Weather(W, H);
  }

  setViewport(W, H) {
    this.W = W; this.H = H;
    for (const c of [this.plate, this.wet, this.field]) { c.width = W; c.height = H; }
    this.pp.W = this.wp.W = this.fp.W = W;
    this.pp.H = this.wp.H = this.fp.H = H;
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
    const g = ctx.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, '#050605');
    g.addColorStop(0.55, '#080a08');
    g.addColorStop(1, '#0b0d0c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.restore();
  }
  _clearWet() {
    const ctx = this.wp.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.restore();
  }
  _compositeWet() {
    const ctx = this.pp.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.92;
    ctx.drawImage(this.wet, 0, 0);
    ctx.restore();
  }

  render(t) {
    const timeline = this.timeline;
    timeline.update(t);
    const camera = this.cameraRig.update(timeline.u, this.params);
    const boil = Math.floor(timeline.t * 12);
    this.pp.setBoil(boil); this.wp.setBoil(boil); this.fp.setBoil(boil);

    this._clearPlate();
    drawEnvironment(this.pp, camera, timeline, this.params);

    // Wet plate is built before the ink figures: reflections, then gouged footsteps.
    this._clearWet();
    this.crowd.update(camera, timeline, this.params);
    this.traffic.update(camera, timeline, this.params);
    this.weather.drawReflections(this.wp, timeline, this.params);
    this.traffic.drawReflections(this.wp, camera, timeline, this.params);
    this.crowd.drawFootprints(this.wp, timeline, this.params);
    this._compositeWet();

    this.crowd.drawFlowLines(this.pp, camera, timeline, this.params);
    this.traffic.draw(this.pp, camera, timeline, this.params);
    this.crowd.draw(this.pp, camera, timeline, this.params);
    this.weather.drawRain(this.pp, timeline, this.params);

    this.weather.drawField(this.fp, timeline, this.crowd, this.traffic, camera, this.params);
    return { plate: this.plate, field: this.field };
  }
}
