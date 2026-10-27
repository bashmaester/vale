import { Painter } from './draw.js';
import { Camera, v3, clamp } from './math.js';
import { CameraRig } from './camera.js';
import { CameraDirector } from './camera-director.js';
import { Timeline } from './timeline.js';
import { Crowd } from './crowd.js';
import { Traffic, drawVehicle } from './traffic.js';
import { Weather } from './weather.js';
import {
  lodForScreenHeight, makeDetail, tileScreenHeight, clampLevel, TILE,
} from './tile.js';
import {
  drawWalls, drawGroundSlab, drawStreet, drawSideStreet, drawPaving,
  drawRoadMarkings, drawRail, drawBuildings, southRowItems, drawSignals,
  drawFurniture, drawReflections, drawFlicker, collectFrame,
} from './environment.js';
import { drawBufferCells, BUFFER_CELLS, CELL_D } from './neighbors.js';
import { defaultKindFor } from './cells.js';
import { grade, paletteVersion, PLATE_CLEAR } from './palette.js';

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
  // Closed back/left walls. Off by default: the open diorama reads better and
  // the walls are expensive to paint.
  walls: { value: 0, min: 0, max: 1, step: 1, label: 'closed walls' },

  // --- feature switches (0 = the subsystem is skipped entirely) ------------
  featCrowd: { value: 1, min: 0, max: 1, step: 1, label: 'crowd' },
  featTraffic: { value: 1, min: 0, max: 1, step: 1, label: 'vehicles' },
  featRain: { value: 1, min: 0, max: 1, step: 1, label: 'rain' },
  featPuddles: { value: 1, min: 0, max: 1, step: 1, label: 'puddles + ripples' },
  featReflections: { value: 1, min: 0, max: 1, step: 1, label: 'reflections' },
  featSignals: { value: 1, min: 0, max: 1, step: 1, label: 'signals' },
  featFlicker: { value: 1, min: 0, max: 1, step: 1, label: 'lamp flicker' },

  // --- buffer cells (0 = hidden; neighbours are off by default) ------------
  bufferStyle: { value: 0, min: 0, max: 1, step: 1, label: 'buffer style (0 wire)' },
  bufferOpacity: { value: 0.35, min: 0, max: 1, step: 0.01, label: 'buffer opacity' },
  bufferCells: { value: 0, min: 0, max: 255, step: 1, label: 'buffer cells (bitmask)' },
  neighbourKind: { value: 0, min: 0, max: 3, step: 1, label: 'neighbour kind (0 auto)' },
  layout: { value: 0, min: 0, max: 4, step: 1, label: 'layout preset (0 auto)' },
};

function defaults() {
  return Object.fromEntries(Object.entries(SCENE_PARAM_DEFS).map(([k, d]) => [k, d.value]));
}

// How far (in pixels) the cached set may drift before it is repainted.
const STATIC_SHIFT = 1.25;

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
    // The far layer holds only the closed walls, so the elevated train can be
    // painted between it and the set (it runs behind the block).
    this.staticFar = makeCanvas(W, H, true);
    this.spFar = new Painter(this.staticFar.getContext('2d'), W, H);
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
    for (const c of [this.plate, this.field, this.static, this.staticFar]) { c.width = W; c.height = H; }
    this._fieldBlank = false;
    this.pp.W = this.fp.W = this.sp.W = this.spFar.W = W;
    this.pp.H = this.fp.H = this.sp.H = this.spFar.H = H;
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
    ctx.fillStyle = grade(PLATE_CLEAR);
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.restore();
  }

  // Which tile a neighbour is: 'street', 'block' or 'yard'. Auto follows the
  // edge rule (east/west continue the street, north/south are more block), and
  // the param forces one kind for every neighbour so a seam can be inspected.
  // Layout presets: a whole neighbour pattern, so the ways cells connect can be
  // inspected in one click instead of toggling eight buttons. Each preset also
  // sets which cells are on — that is the point, a layout is a layout.
  static LAYOUTS = [
    // `auto` is the honest default: east and west continue the street, north
    // and south are more block, which leaves a T junction at each end of the
    // module. `grid` is the same module tiled into a full street grid — every
    // neighbour carries its own street, so the block between them closes up.
    { id: 'auto', label: 'auto — street E/W, block N/S', cells: 0b010111010, kind: 'auto' },
    { id: 'grid', label: 'grid — streets on all four sides', cells: 0b111111111, kind: 'street' },
    { id: 'row', label: 'row — E and W only', cells: 0b010101010, kind: 'street' },
    { id: 'block', label: 'block field — no side streets', cells: 0b111111111, kind: 'block' },
    { id: 'yard', label: 'yard — street with open lots', cells: 0b010111010, kind: 'yard' },
  ];

  applyLayout(i) {
    const L = Scene.LAYOUTS[clamp(i | 0, 0, Scene.LAYOUTS.length - 1)];
    this.params.layout = i | 0;
    this.params.bufferCells = L.cells;
    this.params.neighbourKind = L.kind === 'street' ? 1 : L.kind === 'block' ? 2 : L.kind === 'yard' ? 3 : 0;
  }

  neighbourKindFor(cell) {
    const mode = this.params.neighbourKind | 0;
    if (mode === 1) return 'street';
    if (mode === 2) return 'block';
    if (mode === 3) return 'yard';
    return defaultKindFor(cell.dx, cell.dz);
  }

  // Bitmask → set of buffer cell ids (bit order matches BUFFER_CELLS).
  bufferMask() {
    const mask = new Set();
    const bits = this.params.bufferCells | 0;
    if (!bits) return mask;
    for (let i = 0; i < BUFFER_CELLS.length; i++) {
      if (bits & (1 << i)) mask.add(BUFFER_CELLS[i].id);
    }
    return mask;
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
    // Far layer: the closed walls only.
    const far = this.spFar;
    far.ctx.setTransform(1, 0, 0, 1, 0, 0);
    far.ctx.clearRect(0, 0, this.W, this.H);
    far.setBoil(this.pp.boil);
    drawWalls(far, camera, detail, this.params);

    // Near layer: everything from the ground up.
    const p = this.sp;
    p.ctx.setTransform(1, 0, 0, 1, 0, 0);
    p.ctx.clearRect(0, 0, this.W, this.H);
    p.setBoil(this.pp.boil);
    drawGroundSlab(p, camera);
    drawStreet(p, camera, detail);
    drawSideStreet(p, camera, detail);
    drawPaving(p, camera, detail);
    drawRoadMarkings(p, camera, this.timeline);
    drawRail(p, camera);
    for (const it of collectFrame(p, camera, this.params)) if (it.group === 'far') it.draw(p);
    drawBuildings(p, camera, detail, this.timeline);
    drawFurniture(p, camera, detail, this.timeline);
  }

  _ensureStatic(camera, detail) {
    // `boil` is in the key on purpose: the hand-drawn jitter regenerates at
    // ~7.5 Hz, so a cached set must repaint when it ticks, or the artwork stops
    // boiling while the people and rain keep going.
    const key = `${detail.level}|${this.params.caseFrame}|${this.params.walls}|${paletteVersion()}|${this.pp.boil}|${this.W}x${this.H}`;
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
        if (Math.hypot(dx, dy) > STATIC_SHIFT) needsRepaint = true;
      }
    }
    if (needsRepaint) {
      this._drawSet(camera, detail);
      this._staticKey = key;
      this._staticPose = { eye: { ...camera.eye }, target: { ...camera.target }, fov: camera.fov, roll: camera.roll };
      this._staticCamera = new Camera();
      this._staticCamera.setViewport(this.W, this.H);
      // Snapshot: Camera.set stores references, and the rig mutates its own
      // eye/target every frame. Sharing them made the cached pose follow the
      // live camera, so the shift was always 0 and the layer went stale.
      this._staticCamera.set({ ...camera.eye }, { ...camera.target }, camera.fov, camera.roll);
      this._staticCamera.roll = camera.roll;
      dx = 0; dy = 0;
      this.staticStats.redraws++;
    } else {
      this.staticStats.blits++;
    }
    this._staticShift.x = dx; this._staticShift.y = dy;
    return this._staticShift;
  }

  // Drop the cached set (palette change, resize, a param that is baked in).
  invalidateStatic() { this._staticKey = ''; }

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
    if (this.params.featRain || this.params.featPuddles) this.weather.update(t, this.params);
    if (this.params.featTraffic) this.traffic.update(camera, timeline, this.params, detail);
    else this.traffic.items = [];
    if (this.params.featCrowd) {
      this.crowd.update(camera, timeline, this.params, this.traffic.activeItems(), detail);
    } else {
      this.crowd.items = [];
    }
    const T = this.profile = this.profile || {};
    const simMs = performance.now() - simT;
    T.sim = T.sim == null ? simMs : T.sim * 0.85 + simMs * 0.15;

    this._clearPlate();
    let mark = performance.now();
    // Per-frame stage cost with a light EMA, so the stats HUD reads "ms this
    // frame", not a running total.
    const tick = (k) => {
      const n = performance.now();
      const dt = n - mark;
      T[k] = T[k] == null ? dt : T[k] * 0.85 + dt * 0.15;
      mark = n;
    };

    // 1) Buffer cells go down first: they are neighbours, so the hero volume
    //    must be able to cover them.
    const cells = this.bufferMask();
    const bufferStyle = this.params.bufferStyle === 1 ? 'wire' : this.params.bufferStyle === 2 ? 'points' : 'full';
    if (cells.size) {
      // The cells behind the hero are part of its backdrop; the ones in front
      // of it are not, and must be drawn over it further down.
      drawBufferCells(this.pp, camera, cells, bufferStyle, this.params.bufferOpacity,
        (c) => c.dz <= 0, (c) => this.neighbourKindFor(c));
    }
    tick('buffer');

    // 2) Cached layers. The far layer is only the closed walls; the train runs
    //    between it and the set, which is why it no longer paints over the
    //    buildings. Both layers are repainted only when the camera drifts.
    const shift = this._ensureStatic(camera, detail);
    const blit = (canvas) => {
      // Integer offsets only: a fractional drawImage resamples the whole frame.
      const x = Math.round(shift.x), y = Math.round(shift.y);
      if (x || y) this.pp.ctx.drawImage(canvas, x, y);
      else this.pp.ctx.drawImage(canvas, 0, 0);
    };
    // The far layer only holds the closed walls. With the diorama open there is
    // nothing in it, and a full-frame blit of an empty canvas still costs a
    // full frame of work.
    if (this.params.walls) blit(this.staticFar);
    if (this.params.featTraffic) this.traffic.drawTrain(this.pp, camera, timeline, this.params);
    tick('train');
    blit(this.static);
    tick('set');

    // 3) Signals animate through the cycle; lamps flicker on looped noise.
    if (this.params.featSignals) drawSignals(this.pp, camera, timeline);
    if (this.params.featFlicker) drawFlicker(this.pp, camera, timeline.t);
    tick('signals');

    // The near case members take part in the depth sort below.
    const frameItems = collectFrame(this.pp, camera, this.params);

    // 4) Wet ground: puddles, then the reflections of the signs.
    if (this.params.featPuddles) this.weather.drawPuddles(this.pp, camera, timeline, this.params, detail);
    tick('puddles');
    if (this.params.featReflections) drawReflections(this.pp, camera, timeline, detail);
    tick('reflections');

    // 5) Cars and people, interleaved by projected depth so a person on the
    //    far sidewalk can be occluded by a car in the near lane.
    const drawables = [];
    if (this.params.featTraffic) for (const it of this.traffic.activeItems()) {
      drawables.push({ depth: it.depth, draw: (p) => drawVehicle(p, camera, it) });
    }
    if (this.params.featCrowd) for (const it of this.crowd.items) {
      if (it.alpha < 0.02) continue;
      drawables.push({
        depth: it.depth,
        draw: (p) => { for (const d of it.draws) d(p); },
      });
    }
    // Neighbour cells in front of the hero.
    if (cells.size) {
      const nearer = new Set([...cells].filter((id) => {
        const c = BUFFER_CELLS.find((b) => b.id === id);
        return c && c.dz > 0;
      }));
      if (nearer.size) {
        const q = camera.project(v3(0, 1.5, TILE.z1 + CELL_D * 0.5));
        drawables.push({
          depth: q && Number.isFinite(q.depth) ? q.depth : 1e6,
          draw: (p) => drawBufferCells(p, camera, nearer, bufferStyle, this.params.bufferOpacity,
            null, (c) => this.neighbourKindFor(c)),
        });
      }
    }
    // The row of shops across the street: nearer than the crowd, so it sorts
    // with them instead of being baked into the set behind them.
    for (const it of southRowItems(camera, detail)) drawables.push(it);
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
    if (this.params.featRain) this.weather.drawRain(this.pp, camera, timeline, this.params, detail); tick('rain');

    // The field is only read by the wet-ground passes: skip the whole pass and
    // hand the shader a blank field when both are switched off.
    if (this.params.featPuddles || this.params.featRain) {
      this.weather.drawField(this.fp, timeline, this.crowd, this.traffic, camera, this.params);
      this._fieldBlank = false;
    } else if (!this._fieldBlank) {
      const c = this.field.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = '#000';
      c.fillRect(0, 0, this.W, this.H);
      this._fieldBlank = true;
    }
    tick('field');
    return { plate: this.plate, field: this.field };
  }
}
