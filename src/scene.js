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
  drawWalls, drawGroundSlab, drawRail, drawReflections, drawFlicker,
  collectFrame, drawBackdrop,
} from './environment.js';
import { drawWorld, drawSignalLamps } from './cells.js';
import {
  buildWorld, DEFAULT_WORLD, KIND_IDS, kindIndex,
} from './tiles.js';
import { setWorld } from './world.js';
import { BANDS } from './world.js';
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

  // --- the tile world ------------------------------------------------------
  // The whole city is described by these two numbers plus the kind of each
  // tile, and that is enough to put it in a URL (see `Scene.fromUrl`).
  worldSeed: { value: 1, min: 1, max: 9999, step: 1, label: 'world seed' },
  worldSize: { value: 1, min: 0, max: 3, step: 1, label: 'world size (3/5/7/9)' },
  // Diagonal crossings across a paved crossing square.
  diagCross: { value: 1, min: 0, max: 1, step: 1, label: 'diagonal crossings' },
  // The elevated line is its own system, with its own switch and its own speed.
  featTrain: { value: 1, min: 0, max: 1, step: 1, label: 'elevated train' },
  trainSpeed: { value: 1, min: 0.2, max: 4, step: 0.05, label: 'train speed' },
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
    // The world has to exist before the crowd is built: the crowd reads the
    // street furniture out of it, and a crowd built against an empty world
    // places people inside the lamp posts.
    this.tiles = DEFAULT_WORLD.slice();
    this.world = null;
    this.rebuildWorld();
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

  // Rebuild the tile grid from `this.tiles` + the params, and hand the result
  // to world.js so the crowd and the traffic know where the streets are.
  rebuildWorld() {
    const sizes = [3, 5, 7, 9];
    const size = sizes[clamp(this.params.worldSize | 0, 0, 3)];
    const ids = [];
    for (let i = 0; i < size * size; i++) ids.push(this.tiles[i] || 'block');
    this.tiles = ids;
    this.worldSize = size;
    this.world = buildWorld({ size, ids, seed: Math.max(1, this.params.worldSeed | 0) });
    setWorld(this.world);
    this._staticKey = '';
    return this.world;
  }

  setTile(i, kindId) {
    if (i < 0 || i >= this.tiles.length) return false;
    if (!KIND_IDS.includes(kindId)) return false;
    this.tiles[i] = kindId;
    this.rebuildWorld();
    return true;
  }

  cycleTile(i, dir = 1) {
    const k = kindIndex(this.tiles[i]);
    this.setTile(i, KIND_IDS[(k + dir + KIND_IDS.length) % KIND_IDS.length]);
    return this.tiles[i];
  }

  /** A stable, URL-sized description of the whole scene. */
  worldKey() {
    return `${this.params.worldSize}|${Math.max(1, this.params.worldSeed | 0)}|${this.params.diagCross | 0}|${this.tiles.join('.')}`;
  }

  /**
   * The whole scene as a URL: seed, size and one kind letter per tile.
   * `?world=1234&size=1&tiles=0.0.3...` — nothing else is needed to rebuild it.
   */
  toUrl(base = location.href) {
    const u = new URL(base);
    u.searchParams.set('world', String(Math.max(1, this.params.worldSeed | 0)));
    u.searchParams.set('size', String(this.params.worldSize | 0));
    u.searchParams.set('tiles', this.tiles.map((t) => kindIndex(t)).join('.'));
    u.searchParams.set('diag', String(this.params.diagCross | 0));
    return u.toString();
  }

  fromUrl(search = '') {
    const q = new URLSearchParams(search);
    if (q.has('size')) this.params.worldSize = clamp(Number(q.get('size')) || 1, 0, 3);
    if (q.has('world')) this.params.worldSeed = clamp(Number(q.get('world')) || 1, 1, 9999);
    if (q.has('diag')) this.params.diagCross = Number(q.get('diag')) ? 1 : 0;
    if (q.has('tiles')) {
      const want = [3, 5, 7, 9][clamp(this.params.worldSize | 0, 0, 3)] ** 2;
      const list = q.get('tiles').split('.').map((v) => KIND_IDS[clamp(Number(v) || 0, 0, KIND_IDS.length - 1)]);
      this.tiles = list.slice(0, want);
    }
    this.rebuildWorld();
    return this;
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

  // Presets are whole tile patterns: they are what the minimap starts from and
  // what `?tiles=` saves, so a preset is just a kind per tile.
  static PRESETS = [
    { id: 'grid', label: 'grid — one block per tile', make: (n) => new Array(n * n).fill('block') },
    { id: 'cross', label: 'cross — a paved crossing at the centre', make: (n) => {
      const a = new Array(n * n).fill('block');
      const c = Math.floor(n / 2) * n + Math.floor(n / 2);
      a[c] = 'intersection';
      return a;
    } },
    { id: 'avenue', label: 'avenue — blocks run east–west', make: (n) => {
      const a = new Array(n * n).fill('block');
      for (let j = 0; j < n; j++) a[Math.floor(n / 2) * n + j] = 'block_ew';
      return a;
    } },
    { id: 'row', label: 'shop rows — low blocks at the front', make: (n) => {
      const a = new Array(n * n).fill('block');
      for (let i = 0; i < n; i++) a[(n - 1) * n + i] = 'row';
      return a;
    } },
    { id: 'yard', label: 'yards — open lots behind the street', make: (n) => {
      const a = new Array(n * n).fill('block');
      for (let i = 0; i < n; i++) a[i] = 'yard';
      return a;
    } },
  ];

  applyPreset(id) {
    const P = Scene.PRESETS.find((p) => p.id === id) || Scene.PRESETS[0];
    const n = [3, 5, 7, 9][clamp(this.params.worldSize | 0, 0, 3)];
    this.tiles = P.make(n);
    this.rebuildWorld();
    return P;
  }

  reseed(seed) {
    this.params.worldSeed = clamp(seed | 0, 1, 9999) || 1;
    this.rebuildWorld();
    return this.params.worldSeed;
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

    // Near layer: the city, one tile at a time.
    const p = this.sp;
    p.ctx.setTransform(1, 0, 0, 1, 0, 0);
    p.ctx.clearRect(0, 0, this.W, this.H);
    p.setBoil(this.pp.boil);
    drawBackdrop(p, camera, detail);
    drawGroundSlab(p, camera);
    if (this.params.featTrain) drawRail(p, camera);
    for (const it of collectFrame(p, camera, this.params)) if (it.group === 'far') it.draw(p);
    drawWorld(p, camera, this.world, detail, {
      detail, diag: this.params.diagCross !== 0,
    });
  }

  _ensureStatic(camera, detail) {
    // `boil` is in the key on purpose: the hand-drawn jitter regenerates at
    // ~7.5 Hz, so a cached set must repaint when it ticks, or the artwork stops
    // boiling while the people and rain keep going.
    const key = `${detail.level}|${this.params.caseFrame}|${this.params.walls}|${paletteVersion()}|${this.pp.boil}|${this.W}x${this.H}|${this.worldKey()}`;
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

    // 1) Cached layers. The far layer is only the closed walls; the train runs
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
    tick('train');
    blit(this.static);
    tick('set');
    // The train is its own system with its own clock (see the Elevated train
    // panel). It rides over the set: an elevated line three streets back, drawn
    // after the city, is the cheapest way to keep it reading as a viaduct.
    if (this.params.featTrain) this.traffic.drawTrain(this.pp, camera, timeline, this.params);

    // 3) Signals animate through the cycle; lamps flicker on looped noise.
    if (this.params.featSignals) {
      // Signal heads are painted with the set; only their lit lamp moves, so it
      // goes over the cached layer like the lamp flicker does.
      drawSignalLamps(this.pp, camera, this.world, timeline.u);
    }
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
    // Case members (the glass boundary) sort with the scene so the set can
    // occlude them and they never float over a vehicle.
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
