import { PALETTE } from './draw.js';
import { v3, clamp, lerp, norm3, makeRng, hash11, smoothstep } from './math.js';

const UMBRELLA_COLORS = [
  { fill: 'rgba(239,233,216,0.10)', stroke: PALETTE.ink, kind: 'white' },
  { fill: 'rgba(239,233,216,0.10)', stroke: PALETTE.ink, kind: 'white' },
  { fill: PALETTE.black, stroke: PALETTE.ink, kind: 'black' },
  { fill: PALETTE.black, stroke: PALETTE.ink, kind: 'black' },
  { fill: 'rgba(43,184,174,0.78)', stroke: PALETTE.ink, kind: 'teal' },
  { fill: 'rgba(212,59,48,0.80)', stroke: PALETTE.ink, kind: 'red' },
  { fill: 'rgba(239,233,216,0.10)', stroke: PALETTE.ink, kind: 'white' },
];

const FLOWS = [
  { a: [-19.5, 15.5], b: [19.5, -15.5], weight: 0.62 },
  { a: [-19.5, -15.5], b: [19.5, 15.5], weight: 0.38 },
];

function bezier2(p0, p1, p2, t) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    z: u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z,
  };
}

function drawUmbrella(p, item, A) {
  const u = item.umb;
  const ctx = p.ctx;
  ctx.save();
  ctx.translate(0, -70);
  ctx.rotate(item.tilt);
  // Scalloped canopy, still only lines and flat ink.
  const dome = [
    [-39, 0], [-31, -7], [-22, -12], [-12, -16], [0, -18],
    [12, -16], [22, -12], [31, -7], [39, 0],
    [32, 2], [24, -1], [16, 2], [8, -1], [0, 2],
    [-8, -1], [-16, 2], [-24, -1], [-32, 2], [-39, 0],
  ];
  p.poly(dome, {
    fill: u.fill, stroke: u.stroke, width: 1.6, alpha: A,
    seed: item.seed, jitter: 0.45,
  });
  // Ribs.
  for (let i = 0; i < 9; i++) {
    const x = -36 + i * 9;
    p.line([[0, -18], [x, i % 2 ? 1.5 : -1]], {
      color: u.kind === 'white' ? 'rgba(239,233,216,0.45)' : 'rgba(239,233,216,0.55)',
      width: 0.65, alpha: A * 0.75, jitter: 0.25, seed: item.seed + i, double: false,
    });
  }
  // Handle and a small hook.
  p.line([[0, 0], [0, 34], [3, 39], [7, 38], [8, 34]], {
    color: PALETTE.ink, width: 1.5, alpha: A, jitter: 0.3, seed: item.seed + 20, double: false,
  });
  // Drips from the rim.
  for (let i = 0; i < 4; i++) {
    const x = -28 + i * 18 + hash11(item.seed + i) * 3;
    const len = 5 + hash11(item.seed + i * 3) * 9;
    p.line([[x, 2], [x + 1, 2 + len]], {
      color: 'rgba(239,233,216,0.55)', width: 0.7, alpha: A * 0.6,
      jitter: 0.2, seed: item.seed + i * 7, double: false,
    });
  }
  ctx.restore();
}

function drawFigure(p, item, A, params) {
  const ctx = p.ctx;
  ctx.save();
  ctx.translate(item.foot.x, item.foot.y);
  ctx.scale(item.unit, item.unit);
  ctx.rotate(item.stride * 0.012);

  const swing = item.stride;
  const bob = Math.abs(Math.sin(item.stridePhase)) * 0.9;
  ctx.translate(0, -bob);

  // Legs and shoes.
  p.line([[-3.5, -16], [-5 + swing * 2.2, -1]], {
    color: PALETTE.ink, width: 1.8, alpha: A, jitter: 0.35, seed: item.seed + 1,
  });
  p.line([[3.5, -16], [5 - swing * 2.2, -1]], {
    color: PALETTE.ink, width: 1.8, alpha: A, jitter: 0.35, seed: item.seed + 2,
  });
  p.ellipse(-5 + swing * 2.2, 0, 3.2, 1.5, {
    stroke: PALETTE.ink, width: 1.0, alpha: A, rot: swing * 0.12,
  });
  p.ellipse(5 - swing * 2.2, 0, 3.2, 1.5, {
    stroke: PALETTE.ink, width: 1.0, alpha: A, rot: -swing * 0.12,
  });

  // Coat: architectural-sketch silhouette.
  const coat = item.coatFilled
    ? [[-8, -46], [8, -46], [11, -15], [-11, -15]]
    : [[-7, -46], [7, -46], [9, -15], [-9, -15]];
  p.poly(coat, {
    fill: item.coatFilled ? 'rgba(239,233,216,0.08)' : PALETTE.black,
    stroke: PALETTE.ink, width: 1.7, alpha: A, seed: item.seed + 3, jitter: 0.4,
  });
  p.line([[0, -44], [0, -17]], {
    color: 'rgba(239,233,216,0.42)', width: 0.8, alpha: A * 0.8,
    jitter: 0.25, seed: item.seed + 4, double: false,
  });
  p.line([[-5, -34], [5, -34]], {
    color: 'rgba(239,233,216,0.28)', width: 0.7, alpha: A * 0.7,
    jitter: 0.2, seed: item.seed + 5, double: false,
  });

  // Head and shoulder line.
  p.ellipse(0, -54, 4.7, 5.4, {
    fill: PALETTE.black, stroke: PALETTE.ink, width: 1.5, alpha: A,
  });
  p.line([[-9, -45], [9, -45]], {
    color: PALETTE.ink, width: 1.3, alpha: A, jitter: 0.3, seed: item.seed + 6, double: false,
  });
  // Arm to the umbrella handle.
  p.line([[6, -43], [3, -36], [0, -31]], {
    color: PALETTE.ink, width: 1.5, alpha: A, jitter: 0.3, seed: item.seed + 7, double: false,
  });

  drawUmbrella(p, item, A);
  ctx.restore();
}

export class Crowd {
  constructor(params = {}) {
    this.params = params;
    this.items = [];
    this.density = 1;
    this.rebuild();
  }
  rebuild() {
    const rng = makeRng(918273);
    const N = Math.round(118 * this.density);
    this.crossers = [];
    for (let i = 0; i < N; i++) {
      const flow = rng.chance(FLOWS[0].weight) ? FLOWS[0] : FLOWS[1];
      const a = { x: flow.a[0], z: flow.a[1] };
      const b = { x: flow.b[0], z: flow.b[1] };
      const dir = norm3(v3(b.x - a.x, 0, b.z - a.z));
      const perp = { x: -dir.z, z: dir.x };
      const lane = rng.range(-7.2, 7.2);
      const start = { x: a.x + perp.x * lane, z: a.z + perp.z * lane };
      const end = { x: b.x + perp.x * lane, z: b.z + perp.z * lane };
      const bend = rng.range(-2.6, 2.6);
      const ctrl = {
        x: (start.x + end.x) / 2 + perp.x * bend,
        z: (start.z + end.z) / 2 + perp.z * bend,
      };
      this.crossers.push({
        id: i, start, end, ctrl, dir,
        delay: rng.range(0, 1),
        phase: rng.range(0, Math.PI * 2),
        scale: rng.range(0.86, 1.14),
        seed: rng.range(1, 1000),
        umb: rng.pick(UMBRELLA_COLORS),
        coatFilled: rng.chance(0.22),
        trail: [],
      });
    }
    const M = Math.round(30 * this.density);
    this.waiters = [];
    const corners = [[-15, 12], [15, 12], [-15, -12], [15, -12]];
    for (let i = 0; i < M; i++) {
      const c = corners[i % corners.length];
      this.waiters.push({
        id: 1000 + i,
        base: { x: c[0] + rng.range(-2.4, 2.4), z: c[1] + rng.range(-2.2, 2.2) },
        phase: rng.range(0, Math.PI * 2),
        scale: rng.range(0.82, 1.08),
        seed: rng.range(1000, 2000),
        umb: rng.pick(UMBRELLA_COLORS),
        coatFilled: rng.chance(0.18),
      });
    }
  }
  setDensity(d) {
    this.density = clamp(d, 0.2, 2.2);
    this.rebuild();
  }

  _makeItem(ped, world, alpha, camera, timeline, params, waiter = false) {
    const foot = camera.project(v3(world.x, 0, world.z));
    const head = camera.project(v3(world.x, 1.72, world.z));
    if (!foot || !head) return null;
    const unit = clamp((foot.y - head.y) / 60, 0.34, 2.7) * ped.scale;
    const stridePhase = timeline.t * (5.2 + params.walkSpeed * 2.4) + ped.phase + (waiter ? 0 : timeline.cross() * 9);
    const stride = Math.sin(stridePhase);
    return {
      ped, foot, head, unit, alpha, waiter,
      depth: foot.depth,
      stride, stridePhase,
      tilt: params.wind * 0.10 + Math.sin(stridePhase * 0.5) * 0.035 + stride * 0.025,
      umb: ped.umb,
      coatFilled: ped.coatFilled,
      seed: ped.seed,
    };
  }

  update(camera, timeline, params) {
    this.items = [];
    const u = timeline.u;
    const crowdA = timeline.crowdAlpha();
    const waiterA = timeline.waiterAlpha();
    const wind = params.wind || 0;

    for (const p of this.crossers) {
      let world;
      let alpha = crowdA;
      if (u > 0.79 || u < 0.18) {
        // Waiting / gathering at the start edge.
        const idle = Math.sin(timeline.t * 1.4 + p.phase) * 0.10;
        world = { x: p.start.x + idle, z: p.start.z + Math.cos(timeline.t * 1.1 + p.phase) * 0.08 };
      } else {
        const s = timeline.crossWithDelay(p.delay);
        if (s < 1) {
          world = bezier2(p.start, p.ctrl, p.end, s);
          const sway = Math.sin(timeline.t * 5 + p.phase) * 0.08;
          world.x += -p.dir.z * sway;
          world.z += p.dir.x * sway;
        } else {
          const d = timeline.drain() * 16;
          world = {
            x: p.end.x + p.dir.x * d + Math.sin(timeline.t * 5 + p.phase) * 0.06,
            z: p.end.z + p.dir.z * d,
          };
        }
      }
      const item = this._makeItem(p, world, alpha, camera, timeline, params, false);
      if (!item) continue;
      if (!p.trail) p.trail = [];
      if (alpha > 0.18) {
        p.trail.push([item.foot.x, item.foot.y, item.unit]);
        if (p.trail.length > 9) p.trail.shift();
      }
      item.trail = p.trail;
      this.items.push(item);
    }

    for (const w of this.waiters) {
      const idle = Math.sin(timeline.t * 1.2 + w.phase) * 0.12;
      const world = {
        x: w.base.x + idle + wind * 0.2,
        z: w.base.z + Math.cos(timeline.t * 0.9 + w.phase) * 0.10,
      };
      const item = this._makeItem(w, world, waiterA * 0.92, camera, timeline, params, true);
      if (item) { item.trail = []; this.items.push(item); }
    }
    // Far planes first: larger camera depth is farther away in this rig.
    this.items.sort((a, b) => b.depth - a.depth);
    return this.items;
  }

  drawFlowLines(p, camera, timeline, params) {
    const amt = timeline.cross() * (1 - timeline.drain() * 0.6);
    if (amt < 0.03) return;
    for (let k = -3; k <= 3; k++) {
      const off = k * 3.4;
      const a = v3(-20 + off, 0.03, 16 - off);
      const b = v3(20 + off, 0.03, -16 - off);
      p.projectLine(camera, [a, b], {
        color: k % 2 ? 'rgba(43,184,174,0.30)' : 'rgba(239,233,216,0.22)',
        width: 0.8, alpha: amt * 0.42, dash: [5, 12], jitter: 0.4,
        seed: 800 + k, double: false,
      });
    }
    for (let k = -2; k <= 2; k++) {
      const off = k * 3.8;
      const a = v3(-20 + off, 0.03, -16 + off);
      const b = v3(20 + off, 0.03, 16 + off);
      p.projectLine(camera, [a, b], {
        color: 'rgba(239,233,216,0.16)', width: 0.7, alpha: amt * 0.28,
        dash: [3, 14], jitter: 0.4, seed: 900 + k, double: false,
      });
    }
  }

  drawFootprints(wp, timeline, params) {
    const strength = params.footstepStrength == null ? 1 : params.footstepStrength;
    const refl = params.reflectionStrength == null ? 1 : params.reflectionStrength;
    for (const it of this.items) {
      if (it.waiter || it.alpha < 0.16 || !it.trail || it.trail.length < 2) continue;
      // Broken vertical reflection under the walker.
      const off = (hash11(it.seed) - 0.5) * 2;
      wp.line([
        [it.foot.x + off, it.foot.y + 1],
        [it.foot.x + off + 1.5, it.foot.y + (14 + it.unit * 20) * refl],
      ], {
        color: 'rgba(239,233,216,0.20)', width: 0.7 + it.unit * 0.45,
        alpha: it.alpha * 0.55, composite: 'lighter', jitter: 0.5,
        seed: it.seed + 2, double: false,
      });
      const n = Math.min(5, it.trail.length);
      for (let k = 0; k < n; k++) {
        const idx = it.trail.length - 1 - k;
        const t = it.trail[idx];
        if (!t) continue;
        const age = k / Math.max(1, n - 1);
        const a = it.alpha * (1 - age * 0.65) * strength;
        const rx = 2.6 * (t[2] || it.unit), ry = 1.15 * (t[2] || it.unit);
        // Gouge the wet reflection away.
        wp.ellipse(t[0], t[1], rx, ry, {
          fill: 'rgba(0,0,0,0.95)', stroke: false,
          composite: 'destination-out', alpha: a * 0.9,
          rot: (hash11(it.seed + k) - 0.5) * 0.5,
        });
        // Leave a faint shoe rim.
        wp.ellipse(t[0], t[1], rx, ry, {
          stroke: 'rgba(239,233,216,0.55)', width: 0.65,
          composite: 'source-over', alpha: a * 0.45,
          rot: (hash11(it.seed + k) - 0.5) * 0.5,
        });
      }
    }
  }

  draw(p, camera, timeline, params) {
    for (const it of this.items) {
      if (it.alpha < 0.02) continue;
      drawFigure(p, it, it.alpha, params);
    }
  }
}
