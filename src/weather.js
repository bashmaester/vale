import { PALETTE } from './draw.js';
import { v3, clamp, lerp, makeRng, hash11 } from './math.js';

export class Weather {
  constructor(W, H) {
    this.W = W; this.H = H;
  }

  // Reflections are a quiet glaze now. The old random wet-noise overlay was
  // removed; rain and puddle outlines on the ink plate carry the atmosphere.
  drawReflections(wp, timeline, params) {
    const W = this.W, H = this.H;
    const wet = clamp(params.wetness == null ? 0.65 : params.wetness, 0, 1.6);
    const reflect = clamp(params.reflectionStrength == null ? 0.6 : params.reflectionStrength, 0, 2);
    const reform = timeline.reflectionReform();
    const base = (0.10 + 0.10 * reform) * wet * reflect;
    const frame = Math.floor(timeline.motionT * 3.2);
    const rng = makeRng(7000 + frame);
    const count = Math.round(28 * clamp(wet, 0.2, 1.6));
    for (let i = 0; i < count; i++) {
      const x = rng.range(-20, W + 20);
      const y = rng.range(H * 0.46, H * 0.98);
      const len = rng.range(10, 34) * (0.6 + (y / H));
      const wob = rng.range(-2, 2);
      const col = rng.chance(0.08) ? PALETTE.red : (rng.chance(0.22) ? PALETTE.teal : PALETTE.ink);
      wp.line([[x, y], [x + wob, y + len]], {
        color: col,
        width: rng.range(0.5, 1.1),
        alpha: base * rng.range(0.10, 0.30),
        composite: 'lighter',
        jitter: 0.35,
        seed: i + frame * 13,
        double: false,
      });
    }
    // A few long, faint signage gouges.
    for (let i = 0; i < 5; i++) {
      const y = H * (0.50 + i * 0.065) + Math.sin(timeline.motionT * 0.28 + i) * 1.5;
      const x0 = rng.range(-30, W * 0.35);
      const x1 = x0 + rng.range(W * 0.18, W * 0.45);
      wp.line([[x0, y], [x1, y + rng.range(-1.5, 1.5)]], {
        color: i % 3 === 0 ? PALETTE.red : (i % 2 === 0 ? PALETTE.teal : PALETTE.ink),
        width: rng.range(0.6, 1.2),
        alpha: base * rng.range(0.06, 0.16),
        composite: 'lighter',
        jitter: 0.5,
        seed: 300 + i,
        double: false,
      });
    }
  }

  drawRain(p, timeline, params) {
    const W = this.W, H = this.H;
    const amount = clamp(params.rainAmount == null ? 1 : params.rainAmount, 0, 2);
    const wind = params.wind == null ? 0.6 : params.wind;
    const frame = Math.floor(timeline.motionT * 5);
    const rng = makeRng(31000 + frame);
    const count = Math.round(250 * amount);
    for (let i = 0; i < count; i++) {
      const x = rng.range(-40, W + 40);
      const y = rng.range(-40, H + 40);
      const len = rng.range(8, 26) * (0.7 + (y / H) * 0.8);
      const dx = len * (0.24 + wind * 0.16);
      const col = rng.chance(0.035) ? PALETTE.teal : PALETTE.ink;
      p.line([[x, y], [x + dx, y + len]], {
        color: col,
        width: rng.range(0.45, 1.15),
        alpha: rng.range(0.06, 0.20) * clamp(amount, 0, 1.5),
        jitter: 0.25,
        seed: i + frame * 7,
        double: false,
      });
    }
    // A few close streaks.
    for (let i = 0; i < 14; i++) {
      const x = rng.range(0, W);
      const y = rng.range(H * 0.1, H);
      const len = rng.range(30, 80);
      p.line([[x, y], [x + len * 0.30, y + len]], {
        color: i % 5 === 0 ? PALETTE.teal : 'rgba(239,233,216,0.8)',
        width: rng.range(0.8, 1.8),
        alpha: rng.range(0.05, 0.13) * clamp(amount, 0, 1.5),
        jitter: 0.4, seed: 900 + i, double: false,
      });
    }
    // Splashes on the wet plate.
    for (let i = 0; i < 30; i++) {
      const x = rng.range(0, W);
      const y = rng.range(H * 0.55, H * 0.98);
      const r = rng.range(2, 7) * (y / H);
      p.splash(x, y, r, {
        color: i % 6 === 0 ? PALETTE.teal : 'rgba(239,233,216,0.65)',
        width: 0.7,
        alpha: rng.range(0.06, 0.18) * clamp(amount, 0, 1.4),
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

    // R = wetness / reflection zone.
    const wet = clamp(params.wetness == null ? 0.65 : params.wetness, 0, 1.6);
    const g = ctx.createLinearGradient(0, H * 0.34, 0, H);
    g.addColorStop(0, 'rgba(255,0,0,0)');
    g.addColorStop(0.55, `rgba(255,0,0,${0.14 * wet})`);
    g.addColorStop(1, `rgba(255,0,0,${0.55 * wet})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.34, W, H * 0.66);

    // G = crowd / motion density. Sampled from the actual 3D crowd.
    const items = crowd.items || [];
    const step = Math.max(1, Math.floor(items.length / 26));
    for (let i = 0; i < items.length; i += step) {
      const it = items[i];
      if (it.alpha < 0.05) continue;
      const r = 26 * it.unit + 10;
      const rg = ctx.createRadialGradient(it.foot.x, it.foot.y, 0, it.foot.x, it.foot.y, r);
      rg.addColorStop(0, `rgba(0,255,0,${0.13 * it.alpha})`);
      rg.addColorStop(1, 'rgba(0,255,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(it.foot.x - r, it.foot.y - r, r * 2, r * 2);
    }
    // A moving diagonal wash during the surge.
    const cross = timeline.cross() * (1 - timeline.drain() * 0.5);
    if (cross > 0.02) {
      for (let k = 0; k < 9; k++) {
        const t = k / 8;
        const q = camera.project(v3(lerp(-18, 18, t), 0, lerp(14, -14, t)));
        if (!q) continue;
        const r = 80;
        const rg = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
        rg.addColorStop(0, `rgba(0,255,0,${0.10 * cross})`);
        rg.addColorStop(1, 'rgba(0,255,0,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(q.x - r, q.y - r, r * 2, r * 2);
      }
    }
    // Traffic motion.
    const tr = timeline.traffic();
    if (tr > 0.02) {
      for (let k = 0; k < 5; k++) {
        const x = W * (0.15 + k * 0.18);
        const y = H * (0.62 + (k % 2) * 0.08);
        const r = 95;
        const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, `rgba(0,255,0,${0.08 * tr})`);
        rg.addColorStop(1, 'rgba(0,255,0,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }

    // B = accent / train / signal bloom.
    if (traffic.trainAlpha > 0.02) {
      const q = camera.project(v3(traffic.trainX, 8.5, -8.5));
      if (q) {
        const r = 220;
        const rg = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
        rg.addColorStop(0, `rgba(0,0,255,${0.55 * traffic.trainAlpha})`);
        rg.addColorStop(1, 'rgba(0,0,255,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(q.x - r, q.y - r, r * 2, r * 2);
      }
    }
    const walk = timeline.walkSignal();
    if (walk > 0.02) {
      for (const [x, z] of [[-13, 9], [13, 9], [-13, -9], [13, -9]]) {
        const q = camera.project(v3(x, 3.5, z));
        if (!q) continue;
        const r = 45;
        const rg = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
        rg.addColorStop(0, `rgba(0,0,255,${0.32 * walk})`);
        rg.addColorStop(1, 'rgba(0,0,255,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(q.x - r, q.y - r, r * 2, r * 2);
      }
    }
    ctx.restore();
  }
}
