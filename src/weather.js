// Real raindrop particles and puddle ripples, drawn into the plate.
// There is no full-screen wet-glass shader and no per-frame random overlay.
//
// Everything here is a *pure function of loop time*. A drop is a seeded spec
// (x, z, fall period, drift, colour); its height at time t comes from
// `loopFrac(t, period)` and its period is quantised so an integer number of
// falls fits inside the 20 s loop. Change the frame rate, scrub the timeline or
// jump to t = 20 and the drop is exactly where it belongs. Ripples are derived
// from the moment a drop lands, so they cannot drift out of phase either.

import { PALETTE } from './draw.js';
import { v3, clamp, lerp, makeRng, hash11, TAU, smoothstep } from './math.js';
import { groundYAt, TILE } from './tile.js';
import { PUDDLES, SIGNAL_POSITIONS, LIGHT_SOURCES } from './world.js';
import { LOOP, loopFrac, loopCycles, wrapRange, boundaryAlpha } from './loop.js';

const MAX_DROPS = 240;
const MAX_RIPPLES = 56;
const RIPPLE_LIFE = 1.45;

function tintRGB(tint) {
  if (tint === 'red') return '212,59,48';
  if (tint === 'teal') return '43,184,174';
  return '239,233,216';
}
function tintRGBA(tint, a) {
  return `rgba(${tintRGB(tint)},${a})`;
}

export class Weather {
  constructor(W, H) {
    this.W = W; this.H = H;
    this.loopT = 0;
    this.puddles = PUDDLES.map((p) => ({ ...p, y: groundYAt(p.x, p.z) + 0.012 }));
    // Drop specs are made once from a fixed seed; nothing is drawn randomly.
    const r = makeRng(4711);
    this.drops = [];
    for (let i = 0; i < MAX_DROPS; i++) {
      this.drops.push({
        x0: r.range(TILE.x0 + 1, TILE.x1 - 1),
        z: r.range(TILE.z0 + 1, TILE.z1 - 1),
        phase: r.next(),
        // 10..20 falls per 20 s loop → 1..2 s each.
        cycles: r.int(10, 20),
        drift: r.range(0.35, 1.1),
        len: r.range(0.9, 2.3),
        alpha: r.range(0.22, 0.55),
        color: r.chance(0.035) ? PALETTE.teal : PALETTE.ink,
        seed: r.range(1, 100000),
        // Only a minority of drops splash: otherwise the puddles boil.
        splash: r.chance(0.11),
      });
    }
    this.live = [];
    this.ripples = [];
  }

  _nearestPuddle(x, z) {
    let best = null, bestD = Infinity;
    for (const p of this.puddles) {
      const dx = (x - p.x) / (p.rx + 1.2);
      const dz = (z - p.z) / (p.rz + 1.2);
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = p; }
    }
    return { puddle: best, dist: bestD };
  }

  /**
   * Advance to loop time t. No integration: every position is recomputed from
   * `t`, so the frame at t and t + 20 are identical by construction.
   */
  update(t, params = {}) {
    const lt = ((t % LOOP) + LOOP) % LOOP;
    this.loopT = lt;
    const wind = params.wind == null ? 0.6 : params.wind;
    const rainSpeed = clamp(params.rainSpeed == null ? 1 : params.rainSpeed, 0.2, 2);
    const puddleAmt = clamp(params.puddleAmount == null ? 1 : params.puddleAmount, 0, 2);
    const amount = clamp(params.rainAmount == null ? 1 : params.rainAmount, 0, 2);

    const visible = Math.min(this.drops.length, Math.round(this.drops.length * Math.min(1, amount)));
    this.live.length = 0;
    this.ripples.length = 0;
    const spanX0 = TILE.x0 + 1, spanX1 = TILE.x1 - 1;
    const fall = TILE.y1 + 0.35;

    for (let i = 0; i < visible; i++) {
      const d = this.drops[i];
      // Quantising the cycle count keeps `rainSpeed` loop-safe: the period is
      // always LOOP / (integer).
      const cycles = Math.max(2, Math.round(d.cycles * rainSpeed));
      const period = LOOP / cycles;
      const p = loopFrac(lt, period, d.phase);
      const y = TILE.y1 - p * fall;
      const x = wrapRange(d.x0 + d.drift * wind * p * period * 4.2, spanX0, spanX1);
      this.live.push({ x, y, z: d.z, len: d.len, alpha: d.alpha, color: d.color, seed: d.seed, y01: y / TILE.y1 });

      if (!d.splash || puddleAmt <= 0.05) continue;
      const age = p * period;
      if (age > RIPPLE_LIFE) continue;
      const landingX = wrapRange(d.x0, spanX0, spanX1);
      const { puddle, dist } = this._nearestPuddle(landingX, d.z);
      if (!puddle || dist > 3.0) continue;
      const k = hash11(d.seed);
      this.ripples.push({
        x: lerp(landingX, puddle.x, 0.6),
        z: lerp(d.z, puddle.z, 0.6),
        y: puddle.y + 0.006,
        age,
        life: RIPPLE_LIFE,
        r0: 0.12,
        r1: Math.max(puddle.rx, puddle.rz) * (0.40 + k * 0.4),
        spikes: 3 + Math.floor(k * 3),
        seed: d.seed,
        strength: puddleAmt,
      });
      if (this.ripples.length > MAX_RIPPLES) break;
    }
    this.time = lt;
  }

  _puddlePolygon(p, scale = 1, segments = 16) {
    const pts = [];
    const N = segments;
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const wob = 0.80 + 0.20 * hash11(p.seed * 7.1 + i * 3.3);
      const lx = Math.cos(a) * p.rx * wob * scale;
      const lz = Math.sin(a) * p.rz * wob * scale;
      pts.push(v3(
        p.x + lx * c - lz * s,
        p.y,
        p.z + lx * s + lz * c,
      ));
    }
    return pts;
  }

  drawPuddles(p, camera, timeline, params, detail = { puddleDetail: 1 }) {
    const amt = clamp(params.puddleAmount == null ? 1 : params.puddleAmount, 0, 2);
    const visible = Math.min(this.puddles.length, Math.round(this.puddles.length * amt));
    const emptyBoost = 0.86 + 0.14 * timeline.empty();
    const segs = detail.puddleDetail > 0.7 ? 16 : 10;
    for (let i = 0; i < visible; i++) {
      const pd = this.puddles[i];
      const poly = this._puddlePolygon(pd, 1, segs);
      const rgb = tintRGB(pd.tint);
      // Water body: dark, with a tinted rim where it catches a sign.
      p.projectPoly(camera, poly, {
        fill: `rgba(${rgb},0.10)`,
        stroke: `rgba(${rgb},0.52)`,
        width: 1.05,
        alpha: 0.95 * emptyBoost,
        jitter: 0.14,
        seed: 1300 + i,
      });
      // A second, thinner rim inside the first.
      p.projectLine(camera, this._puddlePolygon(pd, 0.72, segs).concat([this._puddlePolygon(pd, 0.72, segs)[0]]), {
        color: `rgba(${rgb},0.20)`, width: 0.55, alpha: 0.55 * emptyBoost,
        jitter: 0.08, seed: 1320 + i, double: false,
      });
      // Sky reflection glint, offset toward the camera.
      const g = camera.project(v3(pd.x + pd.rx * 0.18, pd.y + 0.004, pd.z + pd.rz * 0.2));
      if (g) {
        p.ellipse(g.x, g.y, clamp(g.scale * pd.rx * 0.42, 1.5, 80), clamp(g.scale * pd.rz * 0.3, 1, 26), {
          fill: 'rgba(239,233,216,0.075)', stroke: false, alpha: 0.85 * emptyBoost,
        });
      }
    }

    for (const r of this.ripples) {
      const t = clamp(r.age / r.life, 0, 1);
      const rad = lerp(r.r0, r.r1, t);
      const alpha = (1 - t) * 0.62 * r.strength;
      const pts = [];
      const N = 14;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU;
        pts.push(v3(r.x + Math.cos(a) * rad, r.y, r.z + Math.sin(a) * rad * 0.52));
      }
      p.projectLine(camera, pts.concat([pts[0]]), {
        color: 'rgba(239,233,216,0.6)', width: 0.7, alpha,
        jitter: 0.07, seed: r.seed, double: false,
      });
      if (t < 0.32) {
        const spikeA = (1 - t / 0.32) * 0.55 * r.strength;
        for (let k = 0; k < r.spikes; k++) {
          const a = (k / r.spikes) * TAU + hash11(r.seed + k) * 0.7;
          const ex = r.x + Math.cos(a) * rad * 0.45;
          const ez = r.z + Math.sin(a) * rad * 0.24;
          p.projectLine(camera, [v3(r.x, r.y + 0.01, r.z), v3(ex, r.y + 0.06, ez)], {
            color: 'rgba(239,233,216,0.7)', width: 0.6, alpha: spikeA,
            jitter: 0.05, seed: r.seed + 40 + k, double: false,
          });
        }
      }
    }
  }

  drawRain(p, camera, timeline, params, detail = { rain: 1 }) {
    const amount = clamp(params.rainAmount == null ? 1 : params.rainAmount, 0, 2);
    const wind = params.wind == null ? 0.6 : params.wind;
    const budget = detail.rain == null ? 1 : detail.rain;
    const count = Math.min(this.live.length, Math.round(this.live.length * budget));
    for (let i = 0; i < count; i++) {
      const d = this.live[i];
      if (d.y <= 0.05 || d.y > TILE.y1 + 0.3) continue;
      const a = v3(d.x, d.y, d.z);
      const b = v3(d.x + wind * 0.22 * d.len, d.y - d.len, d.z + wind * 0.06 * d.len);
      const qa = camera.project(a);
      if (!qa) continue;
      const width = clamp(qa.scale * 0.016, 0.6, 1.9);
      const alpha = d.alpha * (0.55 + 0.45 * clamp(1 - d.y01, 0, 1)) * clamp(amount, 0, 1.5);
      p.projectLine(camera, [a, b], {
        color: d.color,
        width,
        alpha,
        jitter: 0.06,
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

    const blob = (x, y, r, rgb, a) => {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r)) return;
      if (r <= 0 || a <= 0) return;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb},${a})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };

    // R = puddle mask only. No broad wetness gradient, no fake glass.
    const puddleAmt = clamp(params.puddleAmount == null ? 1 : params.puddleAmount, 0, 2);
    const visible = Math.min(this.puddles.length, Math.round(this.puddles.length * puddleAmt));
    const puddleAlpha = 0.30 * puddleAmt * (0.85 + 0.15 * timeline.empty());
    for (let i = 0; i < visible; i++) {
      const pd = this.puddles[i];
      const q = camera.project(v3(pd.x, pd.y, pd.z));
      if (!q) continue;
      blob(q.x, q.y, Math.max(6, q.scale * (pd.rx + pd.rz) * 0.9), '255,0,0', puddleAlpha);
    }

    // G = crowd / motion density, sampled from the actual projected people.
    const items = crowd.items || [];
    const step = Math.max(1, Math.floor(items.length / 26));
    for (let i = 0; i < items.length; i += step) {
      const it = items[i];
      if (it.alpha < 0.05) continue;
      blob(it.foot.x, it.foot.y, 22 * it.unit + 8, '0,255,0', 0.13 * it.alpha);
    }
    const cross = timeline.cross() * (1 - timeline.drain() * 0.5);
    if (cross > 0.02) {
      for (let k = 0; k < 4; k++) {
        const t = (k + 0.5) / 4;
        const q = camera.project(v3(lerp(-2.5, -2.5, t), 0, lerp(4.4, -4.4, t)));
        if (!q) continue;
        blob(q.x, q.y, 64, '0,255,0', 0.08 * cross);
      }
    }

    // B = emitters: train, signals, shop signs.
    if (traffic.trainAlpha > 0.02) {
      const q = camera.project(v3(traffic.trainX, 10.9, -13.05));
      if (q) blob(q.x, q.y, 190, '0,0,255', 0.55 * traffic.trainAlpha);
    }
    const walk = timeline.walkSignal();
    if (walk > 0.02) {
      for (const s of SIGNAL_POSITIONS) {
        const q = camera.project(v3(s.x, 4.7, s.z + s.toward.z * s.arm));
        if (!q) continue;
        blob(q.x, q.y, 46, '0,0,255', 0.30 * walk);
      }
    }
    for (const l of LIGHT_SOURCES) {
      const q = camera.project(v3(l.x, 2.0, l.z));
      if (!q) continue;
      blob(q.x, q.y, q.scale * l.w * 1.4, '0,0,255', 0.10);
    }
    ctx.restore();
  }
}
