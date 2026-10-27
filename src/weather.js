import { PALETTE } from './draw.js';
import { v3, clamp, lerp, makeRng, hash11, TAU } from './math.js';
import { ROAD, SIGNAL_POSITIONS } from './world.js';

// Real, persistent raindrop particles and puddle ripples. There is no
// full-screen wet-glass shader and no per-frame random reflection overlay.
const PUDDLE_SITES = [
  { x: -19.0, z: -2.6, rx: 2.4, rz: 1.10, rot: 0.18, seed: 1 },
  { x: -12.0, z: 5.2, rx: 1.9, rz: 0.90, rot: -0.25, seed: 2 },
  { x: -2.5, z: -5.8, rx: 2.7, rz: 1.25, rot: 0.10, seed: 3 },
  { x: 13.0, z: 2.8, rx: 2.2, rz: 1.05, rot: 0.35, seed: 4 },
  { x: 5.6, z: -14.0, rx: 1.8, rz: 0.85, rot: 0.55, seed: 5 },
  { x: -5.4, z: 14.0, rx: 2.3, rz: 1.05, rot: -0.18, seed: 6 },
  { x: 11.0, z: -9.4, rx: 1.5, rz: 0.72, rot: 0.28, seed: 7 },
  { x: -11.0, z: -9.4, rx: 1.4, rz: 0.68, rot: 0.05, seed: 8 },
];

const MAX_DROPS = 220;
const MAX_RIPPLES = 64;

export class Weather {
  constructor(W, H) {
    this.W = W; this.H = H;
    this.rng = makeRng(918273);
    this.puddles = PUDDLE_SITES.map((p) => ({ ...p }));
    this.drops = [];
    for (let i = 0; i < MAX_DROPS; i++) this.drops.push(this._newDrop(true));
    this.ripples = [];
    this.rippleTimer = 0.4;
    this.time = 0;
  }

  _newDrop(initial = false) {
    const r = this.rng;
    return {
      x: r.range(ROAD.x0 + 4, ROAD.x1 - 4),
      z: r.range(-24, 20),
      y: initial ? r.range(0.6, 17) : r.range(11, 18),
      len: r.range(0.7, 1.9),
      speed: r.range(6.5, 12.5),
      drift: r.range(0.6, 1.35),
      alpha: r.range(0.10, 0.30),
      color: r.chance(0.025) ? PALETTE.teal : PALETTE.ink,
      seed: r.range(1, 100000),
    };
  }

  _nearestPuddle(x, z) {
    let best = null, bestD = Infinity;
    for (const p of this.puddles) {
      const dx = (x - p.x) / (p.rx + 1.4);
      const dz = (z - p.z) / (p.rz + 1.4);
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = p; }
    }
    return { puddle: best, dist: bestD };
  }

  _spawnRipple(x, z, strength = 1) {
    const { puddle, dist } = this._nearestPuddle(x, z);
    if (!puddle || dist > 4.5) return;
    const r = this.rng;
    this.ripples.push({
      x: lerp(x, puddle.x, 0.55),
      z: lerp(z, puddle.z, 0.55),
      age: 0,
      life: r.range(0.9, 1.7),
      r0: 0.12,
      r1: Math.max(puddle.rx, puddle.rz) * r.range(0.42, 0.82),
      spikes: r.int(3, 5),
      seed: r.range(1, 100000),
      strength,
    });
    if (this.ripples.length > MAX_RIPPLES) this.ripples.shift();
  }

  update(dt, timeline, params) {
    const step = clamp(dt, 0, 0.05) * (timeline.motionScale || 0.62);
    const rainSpeed = clamp(params.rainSpeed == null ? 1 : params.rainSpeed, 0.2, 2);
    const wind = params.wind == null ? 0.6 : params.wind;
    const puddleAmt = clamp(params.puddleAmount == null ? 1 : params.puddleAmount, 0, 2);
    this.time += step;

    for (const d of this.drops) {
      d.y -= d.speed * rainSpeed * step;
      d.x += wind * 0.55 * d.drift * rainSpeed * step;
      d.z += wind * 0.18 * d.drift * rainSpeed * step;
      if (d.y <= 0 || d.x < ROAD.x0 + 2 || d.x > ROAD.x1 - 2 || d.z < -26 || d.z > 22) {
        if (this.rng.chance(0.32 * puddleAmt)) this._spawnRipple(d.x, d.z);
        Object.assign(d, this._newDrop(false));
      }
    }

    for (const r of this.ripples) r.age += step;
    this.ripples = this.ripples.filter((r) => r.age < r.life);

    // Ambient drips keep puddles alive even when few drops happen to land.
    this.rippleTimer -= step;
    if (this.rippleTimer <= 0 && puddleAmt > 0.05) {
      const visible = Math.min(this.puddles.length, Math.max(1, Math.round(this.puddles.length * puddleAmt)));
      const p = this.puddles[Math.floor(this.rng.next() * visible)];
      this._spawnRipple(p.x, p.z, 0.7);
      this.rippleTimer = this.rng.range(0.28, 0.78) / clamp(puddleAmt, 0.35, 2);
    }
  }

  _puddlePolygon(p, scale = 1) {
    const pts = [];
    const N = 14;
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const wob = 0.82 + 0.18 * hash11(p.seed * 7.1 + i * 3.3);
      const lx = Math.cos(a) * p.rx * wob * scale;
      const lz = Math.sin(a) * p.rz * wob * scale;
      pts.push(v3(
        p.x + lx * c - lz * s,
        0.048,
        p.z + lx * s + lz * c,
      ));
    }
    return pts;
  }

  drawPuddles(p, camera, timeline, params) {
    const amt = clamp(params.puddleAmount == null ? 1 : params.puddleAmount, 0, 2);
    const visible = Math.min(this.puddles.length, Math.round(this.puddles.length * amt));
    const emptyBoost = 0.82 + 0.18 * timeline.empty();
    for (let i = 0; i < visible; i++) {
      const pd = this.puddles[i];
      const poly = this._puddlePolygon(pd, 1);
      p.projectPoly(camera, poly, {
        fill: 'rgba(43,184,174,0.055)',
        stroke: 'rgba(239,233,216,0.30)',
        width: 0.8,
        alpha: 0.74 * emptyBoost,
        jitter: 0.12,
        seed: 1300 + i,
      });
      const inner = this._puddlePolygon(pd, 0.55);
      p.projectLine(camera, inner.concat([inner[0]]), {
        color: 'rgba(43,184,174,0.18)', width: 0.6, alpha: 0.48 * emptyBoost,
        jitter: 0.08, seed: 1320 + i, double: false,
      });
    }

    for (const r of this.ripples) {
      const t = clamp(r.age / r.life, 0, 1);
      const rad = lerp(r.r0, r.r1, t);
      const alpha = (1 - t) * 0.68 * r.strength;
      const pts = [];
      const N = 12;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU;
        pts.push(v3(r.x + Math.cos(a) * rad, 0.055, r.z + Math.sin(a) * rad * 0.55));
      }
      p.projectLine(camera, pts.concat([pts[0]]), {
        color: 'rgba(239,233,216,0.55)', width: 0.75, alpha,
        jitter: 0.07, seed: r.seed, double: false,
      });
      if (t < 0.30) {
        const spikeA = (1 - t / 0.30) * 0.55 * r.strength;
        for (let k = 0; k < r.spikes; k++) {
          const a = (k / r.spikes) * TAU + hash11(r.seed + k) * 0.7;
          const ex = r.x + Math.cos(a) * rad * 0.45;
          const ez = r.z + Math.sin(a) * rad * 0.25;
          p.projectLine(camera, [v3(r.x, 0.06, r.z), v3(ex, 0.10, ez)], {
            color: 'rgba(239,233,216,0.65)', width: 0.6, alpha: spikeA,
            jitter: 0.05, seed: r.seed + 40 + k, double: false,
          });
        }
      }
    }
  }

  drawRain(p, camera, timeline, params) {
    const amount = clamp(params.rainAmount == null ? 1 : params.rainAmount, 0, 2);
    const wind = params.wind == null ? 0.6 : params.wind;
    const count = Math.min(this.drops.length, Math.round(this.drops.length * amount));
    for (let i = 0; i < count; i++) {
      const d = this.drops[i];
      if (d.y <= 0.05) continue;
      const a = v3(d.x, d.y, d.z);
      const b = v3(d.x + wind * 0.22 * d.len, d.y - d.len, d.z + wind * 0.06 * d.len);
      const qa = camera.project(a);
      if (!qa) continue;
      const width = clamp(qa.scale * 0.012, 0.5, 1.35);
      const alpha = d.alpha * (0.70 + 0.30 * clamp(d.y / 18, 0, 1)) * clamp(amount, 0, 1.5);
      p.projectLine(camera, [a, b], {
        color: d.color,
        width,
        alpha,
        jitter: 0.07,
        seed: d.seed,
        double: false,
      });
    }
  }

  drawField(fp, timeline, crowd, traffic, camera, params) {
    const ctx = fp.ctx;
    const W = this.W, H = this.H;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    // R = puddle mask only. No broad wetness gradient, no fake glass.
    const puddleAmt = clamp(params.puddleAmount == null ? 1 : params.puddleAmount, 0, 2);
    const visible = Math.min(this.puddles.length, Math.round(this.puddles.length * puddleAmt));
    const puddleAlpha = 0.26 * puddleAmt * (0.85 + 0.15 * timeline.empty());
    for (let i = 0; i < visible; i++) {
      const pd = this.puddles[i];
      const q = camera.project(v3(pd.x, 0.05, pd.z));
      if (!q) continue;
      const r = Math.max(6, q.scale * (pd.rx + pd.rz) * 0.9);
      const rg = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
      rg.addColorStop(0, `rgba(255,0,0,${puddleAlpha})`);
      rg.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(q.x - r, q.y - r, r * 2, r * 2);
    }

    // G = crowd / motion density, sampled from the actual projected people.
    const items = crowd.items || [];
    const step = Math.max(1, Math.floor(items.length / 28));
    for (let i = 0; i < items.length; i += step) {
      const it = items[i];
      if (it.alpha < 0.05) continue;
      const r = 24 * it.unit + 9;
      const rg = ctx.createRadialGradient(it.foot.x, it.foot.y, 0, it.foot.x, it.foot.y, r);
      rg.addColorStop(0, `rgba(0,255,0,${0.12 * it.alpha})`);
      rg.addColorStop(1, 'rgba(0,255,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(it.foot.x - r, it.foot.y - r, r * 2, r * 2);
    }
    const cross = timeline.cross() * (1 - timeline.drain() * 0.5);
    if (cross > 0.02) {
      for (let k = 0; k < 7; k++) {
        const t = k / 6;
        const q = camera.project(v3(lerp(13, -13, t), 0, lerp(-13, 13, t)));
        if (!q) continue;
        const r = 72;
        const rg = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
        rg.addColorStop(0, `rgba(0,255,0,${0.09 * cross})`);
        rg.addColorStop(1, 'rgba(0,255,0,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(q.x - r, q.y - r, r * 2, r * 2);
      }
    }

    // B = train / signal bloom.
    if (traffic.trainAlpha > 0.02) {
      const q = camera.project(v3(traffic.trainX, 8.5, -10));
      if (q) {
        const r = 200;
        const rg = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
        rg.addColorStop(0, `rgba(0,0,255,${0.50 * traffic.trainAlpha})`);
        rg.addColorStop(1, 'rgba(0,0,255,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(q.x - r, q.y - r, r * 2, r * 2);
      }
    }
    const walk = timeline.walkSignal();
    if (walk > 0.02) {
      for (const s of SIGNAL_POSITIONS) {
        const q = camera.project(v3(s.x, 3.6, s.z));
        if (!q) continue;
        const r = 42;
        const rg = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
        rg.addColorStop(0, `rgba(0,0,255,${0.28 * walk})`);
        rg.addColorStop(1, 'rgba(0,0,255,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(q.x - r, q.y - r, r * 2, r * 2);
      }
    }
    ctx.restore();
  }
}
