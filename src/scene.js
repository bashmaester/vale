import { Painter } from './draw.js';
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
  drawBuildings, drawSignals, drawFurniture, drawReflections,
  collectFrame,
} from './environment.js';

export const SCENE_PARAM_DEFS = {
  crowdDensity: { value: 1.0, min: 0.2, max: 2.0, step: 0.01, label: 'crowd density' },
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
  caseFrame: { value: 1, min: 0, max: 1, step: 1, label: 'case boundaries' },
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
    ctx.fillStyle = '#050605';
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.restore();
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
    timeline.update(t);
    this.params.motionT = timeline.motionT;
    this.params.motionScale = timeline.motionScale;

    const autoCamera = this.cameraRig.update(timeline.u, this.params);
    const camera = this.cameraController.apply(autoCamera, dt, this.params);
    const detail = this.resolveDetail(camera);
    const boil = Math.floor(timeline.motionT * 7.5);
    this.pp.setBoil(boil); this.fp.setBoil(boil);

    // Simulate before drawing so the plane can be sorted by depth.
    this.weather.update(dt, timeline, this.params);
    this.traffic.update(camera, timeline, this.params, detail);
    this.crowd.update(camera, timeline, this.params, this.traffic.activeItems(), detail);

    this._clearPlate();

    // 1) The case and the street.
    drawBackdrop(this.pp, camera, detail);
    drawStreet(this.pp, camera, detail);
    drawPaving(this.pp, camera, detail);
    drawRoadMarkings(this.pp, camera, timeline);

    // 2) The elevated line sits behind the buildings but above the street.
    drawRail(this.pp, camera);
    this.traffic.drawTrain(this.pp, camera, timeline, this.params);

    // The case shell is drawn here (behind the set), the near members take part
    // in the depth sort below. `caseFrame = 0` hides the museum case entirely.
    const frameItems = collectFrame(this.pp, camera, this.params);
    for (const it of frameItems) if (it.group === 'far') it.draw(this.pp);

    // 3) Buildings, signals, furniture.
    drawBuildings(this.pp, camera, detail, timeline);
    drawSignals(this.pp, camera, timeline);
    drawFurniture(this.pp, camera, detail, timeline);

    // 4) Wet ground: puddles, then the reflections of the signs.
    this.weather.drawPuddles(this.pp, camera, timeline, this.params, detail);
    drawReflections(this.pp, camera, timeline, detail);

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
    for (const d of drawables) d.draw(this.pp);

    // 6) Rain inside the volume. Nothing is drawn over the plate after it: the
    //    case members are already in the depth sort.
    this.weather.drawRain(this.pp, camera, timeline, this.params, detail);

    this.weather.drawField(this.fp, timeline, this.crowd, this.traffic, camera, this.params);
    return { plate: this.plate, field: this.field };
  }
}
