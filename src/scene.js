import { Painter } from './draw.js';
import { CameraRig } from './camera.js';
import { CameraController } from './camera-control.js';
import { Timeline } from './timeline.js';
import { drawEnvironment } from './environment.js';
import { Crowd } from './crowd.js';
import { Traffic } from './traffic.js';
import { Weather } from './weather.js';

export const SCENE_PARAM_DEFS = {
  crowdDensity: { value: 1.0, min: 0.3, max: 2.0, step: 0.01, label: 'crowd density' },
  walkSpeed: { value: 1.0, min: 0.3, max: 2.0, step: 0.01, label: 'walk tempo' },
  rainAmount: { value: 1.0, min: 0.0, max: 2.0, step: 0.01, label: 'raindrop amount' },
  rainSpeed: { value: 1.0, min: 0.2, max: 2.0, step: 0.01, label: 'raindrop speed' },
  puddleAmount: { value: 1.0, min: 0.0, max: 2.0, step: 0.01, label: 'puddle / ripple amount' },
  wind: { value: 0.6, min: -1.0, max: 2.0, step: 0.01, label: 'wind / tilt' },
  cameraShake: { value: 1.0, min: 0.0, max: 2.0, step: 0.01, label: 'gate weave' },
  flySpeed: { value: 1.0, min: 0.2, max: 3.0, step: 0.01, label: 'fly speed' },
  cameraEase: { value: 8.0, min: 2.0, max: 20.0, step: 0.1, label: 'camera ease' },
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
    this.pp.ctx = this.plate.getContext('2d');
    this.fp.ctx = this.field.getContext('2d');

    this.timeline = new Timeline(20);
    this.cameraRig = new CameraRig(W, H);
    this.cameraController = new CameraController();
    this.crowd = new Crowd(this.params);
    this.traffic = new Traffic(this.params);
    this.weather = new Weather(W, H);
  }

  setViewport(W, H) {
    this.W = W; this.H = H;
    for (const c of [this.plate, this.field]) { c.width = W; c.height = H; }
    this.pp.W = this.fp.W = W;
    this.pp.H = this.fp.H = H;
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

  render(t, dt = 0.016) {
    const timeline = this.timeline;
    timeline.update(t);
    this.params.motionT = timeline.motionT;
    this.params.motionScale = timeline.motionScale;

    const autoCamera = this.cameraRig.update(timeline.u, this.params);
    const camera = this.cameraController.apply(autoCamera, dt, this.params);
    const boil = Math.floor(timeline.motionT * 7.5);
    this.pp.setBoil(boil); this.fp.setBoil(boil);

    // 1) Set: big volumes, road markings, buildings, fixed props.
    this._clearPlate();
    drawEnvironment(this.pp, camera, timeline, this.params);

    // 2) Simulated puddles live on the ground, below cars and people.
    this.weather.update(dt, timeline, this.params);
    this.weather.drawPuddles(this.pp, camera, timeline, this.params);

    // 3) Cars, then people. Traffic resolves first so walkers avoid hulls.
    this.traffic.update(camera, timeline, this.params);
    const obstacles = this.traffic.activeItems();
    this.crowd.update(camera, timeline, this.params, obstacles);
    this.traffic.draw(this.pp, camera, timeline, this.params);
    this.crowd.draw(this.pp, camera, timeline, this.params);

    // 4) Rain is drawn last, over the whole set.
    this.weather.drawRain(this.pp, camera, timeline, this.params);

    this.weather.drawField(this.fp, timeline, this.crowd, this.traffic, camera, this.params);
    return { plate: this.plate, field: this.field };
  }
}
