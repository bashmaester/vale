// Procedural 3D humanoids, projected to 2D ink outlines.
// Every joint is a world-space point, so camera movement changes the figure's
// silhouette instead of sliding a billboard around.
import { PALETTE } from './draw.js';
import { v3, clamp, lerp, norm3, makeRng, hash11, TAU } from './math.js';
import { separate, separateGroups, poissonDisk } from './collision.js';
import { FLOWS, WAIT_ZONES, ROAD, isOnSidewalk, clampToWorld } from './world.js';

const UMBRELLA_COLORS = [
  { fill: 'rgba(239,233,216,0.10)', stroke: PALETTE.ink, kind: 'white' },
  { fill: 'rgba(239,233,216,0.10)', stroke: PALETTE.ink, kind: 'white' },
  { fill: PALETTE.black, stroke: PALETTE.ink, kind: 'black' },
  { fill: PALETTE.black, stroke: PALETTE.ink, kind: 'black' },
  { fill: 'rgba(43,184,174,0.78)', stroke: PALETTE.ink, kind: 'teal' },
  { fill: 'rgba(212,59,48,0.80)', stroke: PALETTE.ink, kind: 'red' },
  { fill: 'rgba(239,233,216,0.10)', stroke: PALETTE.ink, kind: 'white' },
];

function bezier2(p0, p1, p2, t) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    z: u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z,
  };
}

function chooseFlow(rng) {
  let r = rng.next();
  for (const f of FLOWS) {
    if (r < f.weight) return f;
    r -= f.weight;
  }
  return FLOWS[FLOWS.length - 1];
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
    const N = Math.round(132 * this.density);
    this.crossers = [];
    const specs = [];
    for (const f of FLOWS) {
      const count = Math.floor(N * f.weight);
      const pts = poissonDisk(count, f.bounds, 0.95, rng, (x, z) => isOnSidewalk(x, z));
      for (const pt of pts) specs.push({ flow: f, start: pt });
    }
    let guard = 0;
    while (specs.length < N && guard++ < N * 4) {
      const f = chooseFlow(rng);
      const x = rng.range(f.bounds.x0, f.bounds.x1);
      const z = rng.range(f.bounds.z0, f.bounds.z1);
      if (isOnSidewalk(x, z)) specs.push({ flow: f, start: { x, z } });
    }
    for (let i = 0; i < specs.length; i++) {
      const { flow, start } = specs[i];
      const end = { x: start.x + flow.delta.x, z: start.z + flow.delta.z };
      const dir = norm3(v3(flow.delta.x, 0, flow.delta.z));
      const side = { x: -dir.z, z: dir.x };
      const bend = rng.range(-2.2, 2.2);
      const ctrl = {
        x: (start.x + end.x) / 2 + side.x * bend,
        z: (start.z + end.z) / 2 + side.z * bend,
      };
      this.crossers.push({
        id: i, start, end, ctrl, dir, side,
        pathLength: Math.hypot(flow.delta.x, flow.delta.z) + Math.abs(bend) * 0.4,
        delay: clamp((Math.abs(start.x) - 17) / 7, 0, 1) * 0.45 + rng.range(0, 0.55),
        phase: rng.range(0, TAU),
        scale: rng.range(0.86, 1.14),
        seed: rng.range(1, 10000),
        umb: rng.pick(UMBRELLA_COLORS),
        coatFilled: rng.chance(0.22),
        trail: [],
      });
    }

    const M = Math.round(34 * this.density);
    this.waiters = [];
    const perZone = Math.ceil(M / WAIT_ZONES.length);
    const waiterPoints = [];
    for (const z of WAIT_ZONES) {
      const pts = poissonDisk(perZone, z, 0.92, rng, (x, zz) => isOnSidewalk(x, zz));
      for (const pt of pts) waiterPoints.push(pt);
    }
    for (let i = 0; i < M; i++) {
      const base = waiterPoints[i % waiterPoints.length] || { x: -20, z: 14 };
      const dir = norm3(v3(-base.x, 0, -base.z));
      this.waiters.push({
        id: 10000 + i,
        base: { x: base.x + rng.range(-0.2, 0.2), z: base.z + rng.range(-0.2, 0.2) },
        dir, side: { x: -dir.z, z: dir.x },
        phase: rng.range(0, TAU),
        scale: rng.range(0.82, 1.1),
        seed: rng.range(10000, 20000),
        umb: rng.pick(UMBRELLA_COLORS),
        coatFilled: rng.chance(0.18),
      });
    }
  }

  setDensity(d) {
    this.density = clamp(d, 0.2, 2.2);
    this.rebuild();
  }

  update(camera, timeline, params, obstacles = []) {
    const u = timeline.u;
    const crowdA = timeline.crowdAlpha();
    const waiterA = timeline.waiterAlpha();
    const wind = params.wind == null ? 0.6 : params.wind;
    const raw = [];

    for (const ped of this.crossers) {
      let world, moving = false, distance = 0;
      if (u > 0.79 || u < 0.18) {
        const idle = Math.sin(timeline.t * 1.3 + ped.phase) * 0.10;
        world = { x: ped.start.x + idle, z: ped.start.z + Math.cos(timeline.t * 1.1 + ped.phase) * 0.08 };
      } else {
        const s = timeline.crossWithDelay(ped.delay);
        if (s < 1) {
          world = bezier2(ped.start, ped.ctrl, ped.end, s);
          const sway = Math.sin(timeline.t * 5 + ped.phase) * 0.07;
          world.x += ped.side.x * sway;
          world.z += ped.side.z * sway;
        } else {
          const d = timeline.drain() * 16;
          world = { x: ped.end.x + ped.dir.x * d, z: ped.end.z + ped.dir.z * d };
        }
        distance = (s < 1 ? s * ped.pathLength : ped.pathLength + timeline.drain() * 16);
        moving = true;
      }
      const stridePhase = ped.phase + (moving ? (distance / (0.78 * ped.scale)) * TAU : Math.sin(timeline.t * 1.4 + ped.phase) * 0.18);
      raw.push({
        ped, world, alpha: crowdA, dir: ped.dir, side: ped.side, scale: ped.scale,
        stridePhase, moving, waiter: false, radius: 0.54 * ped.scale,
        group: 'crowd', fixed: false,
      });
    }

    for (const w of this.waiters) {
      const idle = Math.sin(timeline.t * 1.2 + w.phase) * 0.11;
      const world = {
        x: w.base.x + idle + wind * 0.15,
        z: w.base.z + Math.cos(timeline.t * 0.9 + w.phase) * 0.09,
      };
      raw.push({
        ped: w, world, alpha: waiterA * 0.92, dir: w.dir, side: w.side, scale: w.scale,
        stridePhase: w.phase + Math.sin(timeline.t * 1.1 + w.phase) * 0.12,
        moving: false, waiter: true, radius: 0.54 * w.scale,
        group: 'crowd', fixed: false,
      });
    }

    separate(raw, {
      iterations: 2, padding: 0.06,
      bounds: { x0: ROAD.x0 + 1, x1: ROAD.x1 - 1, z0: ROAD.z0 + 1, z1: ROAD.z1 - 1 },
    });
    if (obstacles.length) separateGroups(raw, obstacles, { iterations: 2, padding: 0.42 });
    for (const r of raw) {
      const c = clampToWorld(r.world, 0.8);
      r.world.x = c.x; r.world.z = c.z;
    }

    this.items = raw.map((r) => this._makeItem(r, camera, params)).filter(Boolean);
    this.items.sort((a, b) => b.depth - a.depth);
    for (const it of this.items) {
      if (it.waiter || it.alpha < 0.18 || !it.ped.trail) continue;
      it.ped.trail.push([it.foot.x, it.foot.y, it.unit]);
      if (it.ped.trail.length > 9) it.ped.trail.shift();
      it.trail = it.ped.trail;
    }
    return this.items;
  }

  _makeItem(r, camera, params) {
    const sc = r.scale;
    const W = r.world;
    const dir = r.dir, side = r.side;
    const phase = r.stridePhase;
    const moving = r.moving;
    const wind = params.wind == null ? 0.6 : params.wind;
    const tilt = wind * 0.075 + (moving ? Math.sin(phase) * 0.018 : Math.sin(phase) * 0.008);
    const stride = Math.sin(phase);
    const stride2 = Math.sin(phase + Math.PI);
    const bob = moving ? Math.abs(Math.sin(phase)) * 0.045 * sc : 0.012 * sc * Math.sin(phase * 0.5);

    const local = (lat, h, fwd) => v3(
      W.x + side.x * lat + dir.x * fwd,
      h,
      W.z + side.z * lat + dir.z * fwd,
    );
    const J = {};
    const set = (name, lat, h, fwd) => {
      const w = local(lat, h, fwd);
      J[name] = { w, s: camera.project(w) };
      return J[name];
    };
    set('pelvis', 0, 0.92 * sc + bob, 0);
    set('chest', 0, 1.38 * sc + bob, 0);
    set('neck', 0, 1.56 * sc + bob, 0);
    set('head', 0, 1.71 * sc + bob, 0);
    set('headTop', 0, 1.87 * sc + bob, 0);
    set('hairL', -0.13 * sc, 1.82 * sc + bob, 0);
    set('hairR', 0.13 * sc, 1.82 * sc + bob, 0);
    set('shoulderL', -0.23 * sc, 1.44 * sc + bob, 0);
    set('shoulderR', 0.23 * sc, 1.44 * sc + bob, 0);
    set('hipL', -0.13 * sc, 0.92 * sc + bob, 0);
    set('hipR', 0.13 * sc, 0.92 * sc + bob, 0);
    set('button1', 0, 1.28 * sc + bob, 0.015 * sc);
    set('button2', 0, 1.10 * sc + bob, 0.015 * sc);

    const armSwing = moving ? stride : 0.12 * Math.sin(phase * 0.5);
    set('elbowL', -0.31 * sc, 1.18 * sc + bob, -armSwing * 0.16 * sc);
    set('handL', -0.34 * sc, 0.95 * sc + bob, -armSwing * 0.30 * sc);
    set('elbowR', 0.31 * sc, 1.18 * sc + bob, armSwing * 0.10 * sc);
    set('handR', 0.22 * sc, 1.00 * sc + bob, 0.02 * sc);

    const liftL = moving ? Math.max(0, Math.cos(phase)) * 0.13 * sc : 0;
    const liftR = moving ? Math.max(0, Math.cos(phase + Math.PI)) * 0.13 * sc : 0;
    set('kneeL', -0.12 * sc, 0.50 * sc + bob + liftL * 0.4, stride * 0.20 * sc);
    set('footL', -0.12 * sc, 0.05 * sc + liftL, stride * 0.35 * sc);
    set('toeL', -0.12 * sc, 0.04 * sc + liftL, stride * 0.35 * sc + 0.14 * sc);
    set('kneeR', 0.12 * sc, 0.50 * sc + bob + liftR * 0.4, stride2 * 0.20 * sc);
    set('footR', 0.12 * sc, 0.05 * sc + liftR, stride2 * 0.35 * sc);
    set('toeR', 0.12 * sc, 0.04 * sc + liftR, stride2 * 0.35 * sc + 0.14 * sc);

    set('apex', tilt * 0.6 * sc, 2.38 * sc + bob, -tilt * 0.3 * sc);
    set('knob', tilt * 0.65 * sc, 2.49 * sc + bob, -tilt * 0.32 * sc);
    set('rimCenter', tilt * 0.12 * sc, 2.06 * sc + bob, -tilt * 0.06 * sc);
    set('handleMid', 0.20 * sc, 1.46 * sc + bob, 0.02 * sc);
    set('hook', 0.31 * sc, 0.94 * sc + bob, 0.05 * sc);

    const rim = [];
    const RN = 9;
    for (let i = 0; i < RN; i++) {
      const a = (i / RN) * TAU;
      const rr = 0.58 * sc * (i % 2 ? 0.90 : 1.0);
      const lat = tilt * 0.12 * sc + Math.cos(a) * rr;
      const fwd = -tilt * 0.06 * sc + Math.sin(a) * rr;
      const h = 2.06 * sc + bob - 0.03 * sc * Math.sin(a * 2);
      const w = local(lat, h, fwd);
      rim.push({ w, s: camera.project(w) });
    }
    const drips = [];
    for (let i = 0; i < 4; i++) {
      const idx = (i * 2) % RN;
      const rp = rim[idx];
      const a = (idx / RN) * TAU;
      const lat = tilt * 0.12 * sc + Math.cos(a) * 0.55 * sc;
      const fwd = -tilt * 0.06 * sc + Math.sin(a) * 0.55 * sc;
      const w = local(lat, 1.88 * sc + bob - hash11(r.ped.seed + i) * 0.12 * sc, fwd);
      drips.push({ a: rp.s, b: camera.project(w) });
    }

    const essentials = Object.values(J).map((o) => o.s)
      .concat(rim.map((o) => o.s))
      .concat(drips.map((d) => d.b));
    if (essentials.some((s) => !s)) return null;

    const footL = J.footL.s, footR = J.footR.s;
    const unit = clamp((footL.y - J.headTop.s.y) / 70, 0.34, 2.7);
    const lineW = clamp(unit * 1.5, 0.6, 2.6);
    const A = r.alpha;
    const umb = r.ped.umb;
    const draws = [];
    const avg = (...pts) => pts.reduce((a, p) => a + p.depth, 0) / pts.length;
    const push = (depth, fn) => draws.push({ depth, fn });
    const line = (opts = {}) => ({
      color: PALETTE.ink, width: lineW, alpha: A, jitter: 0.3,
      seed: r.ped.seed, double: false, ...opts,
    });

    // Coat: a real 3D quad (shoulders/hips), not a screen-space sprite.
    const coat = [J.shoulderL.s, J.shoulderR.s, J.hipR.s, J.hipL.s];
    push(avg(...coat), (p) => p.poly(coat, {
      fill: r.ped.coatFilled ? 'rgba(239,233,216,0.08)' : PALETTE.black,
      stroke: PALETTE.ink, width: lineW, alpha: A,
      seed: r.ped.seed + 3, jitter: 0.35,
    }));
    push(avg(J.neck.s, J.pelvis.s), (p) => p.line([J.neck.s, J.pelvis.s], line({
      color: 'rgba(239,233,216,0.42)', width: lineW * 0.55, alpha: A * 0.8,
    })));
    push(avg(J.shoulderL.s, J.shoulderR.s), (p) => p.line([J.shoulderL.s, J.shoulderR.s], line({ width: lineW * 0.9 })));
    for (const btn of [J.button1, J.button2]) {
      push(btn.s.depth, (p) => p.ellipse(btn.s.x, btn.s.y, clamp(unit * 0.8, 0.8, 2.2), clamp(unit * 0.8, 0.8, 2.2), {
        fill: 'rgba(239,233,216,0.5)', stroke: false, alpha: A * 0.7,
      }));
    }

    // Limbs: each bone is a projected 3D segment.
    const bones = [
      [J.shoulderL, J.elbowL, J.handL],
      [J.shoulderR, J.elbowR, J.handR],
      [J.hipL, J.kneeL, J.footL],
      [J.hipR, J.kneeR, J.footR],
    ];
    for (let b = 0; b < bones.length; b++) {
      const pts = bones[b].map((o) => o.s);
      push(avg(...pts), (p) => p.line(pts, line({ seed: r.ped.seed + 10 + b })));
    }
    for (const [f, t] of [[J.footL, J.toeL], [J.footR, J.toeR]]) {
      push(avg(f.s, t.s), (p) => p.line([f.s, t.s], line({ width: lineW * 0.9, seed: r.ped.seed + 20 })));
    }

    // Head + hair cut.
    const hr = clamp(J.head.s.scale * 0.15 * sc, 2, 12);
    push(J.head.s.depth, (p) => p.ellipse(J.head.s.x, J.head.s.y, hr, hr * 1.05, {
      fill: PALETTE.black, stroke: PALETTE.ink, width: lineW * 0.8, alpha: A,
    }));
    push(avg(J.hairL.s, J.hairR.s), (p) => p.line([J.hairL.s, J.hairR.s], line({ width: lineW * 0.65 })));

    // Umbrella: faceted 3D dome, rim, ribs, handle and drips.
    const tris = [];
    for (let i = 0; i < RN; i++) tris.push([J.apex.s, rim[i].s, rim[(i + 1) % RN].s]);
    const domeDepth = avg(J.apex.s, ...rim.map((o) => o.s));
    push(domeDepth, (p) => p.polys(tris, { fill: umb.fill, alpha: A }));
    push(domeDepth - 0.2, (p) => p.line(rim.map((o) => o.s).concat([rim[0].s]), {
      color: umb.stroke, width: lineW, alpha: A, jitter: 0.4,
      seed: r.ped.seed + 30, double: false,
    }));
    for (let i = 0; i < RN; i++) {
      push(avg(J.apex.s, rim[i].s), (p) => p.line([J.apex.s, rim[i].s], {
        color: umb.kind === 'white' ? 'rgba(239,233,216,0.45)' : 'rgba(239,233,216,0.55)',
        width: lineW * 0.42, alpha: A * 0.75, jitter: 0.22,
        seed: r.ped.seed + 40 + i, double: false,
      }));
    }
    push(avg(J.apex.s, J.knob.s), (p) => p.line([J.apex.s, J.knob.s], line({ width: lineW * 0.8 })));
    push(avg(J.rimCenter.s, J.handleMid.s, J.handR.s, J.hook.s), (p) => p.line(
      [J.rimCenter.s, J.handleMid.s, J.handR.s, J.hook.s],
      line({ width: lineW, seed: r.ped.seed + 60 }),
    ));
    for (let i = 0; i < drips.length; i++) {
      push(avg(drips[i].a, drips[i].b), (p) => p.line([drips[i].a, drips[i].b], {
        color: 'rgba(239,233,216,0.55)', width: lineW * 0.5, alpha: A * 0.6,
        jitter: 0.2, seed: r.ped.seed + 70 + i, double: false,
      }));
    }

    draws.sort((a, b) => b.depth - a.depth);
    const foot = {
      x: (footL.x + footR.x) / 2,
      y: (footL.y + footR.y) / 2,
      depth: avg(footL, footR),
    };
    return {
      ped: r.ped, world: r.world, alpha: A, waiter: r.waiter,
      radius: r.radius, group: 'crowd',
      foot, feet: [footL, footR], unit, depth: foot.depth,
      stridePhase: phase, trail: r.ped.trail || [], draws,
    };
  }

  drawFlowLines(p, camera, timeline, params) {
    const amt = timeline.cross() * (1 - timeline.drain() * 0.6);
    if (amt < 0.03) return;
    for (const f of FLOWS) {
      const cx = (f.bounds.x0 + f.bounds.x1) / 2;
      const cz = (f.bounds.z0 + f.bounds.z1) / 2;
      const a = v3(cx, 0.03, cz);
      const b = v3(cx + f.delta.x, 0.03, cz + f.delta.z);
      p.projectLine(camera, [a, b], {
        color: f.id === 'A' || f.id === 'C' ? 'rgba(43,184,174,0.26)' : 'rgba(239,233,216,0.18)',
        width: 0.8, alpha: amt * 0.36, dash: [5, 13], jitter: 0.4,
        seed: 800 + f.id.charCodeAt(0), double: false,
      });
    }
  }

  drawFootprints(wp, timeline, params) {
    const strength = params.footstepStrength == null ? 1 : params.footstepStrength;
    const refl = params.reflectionStrength == null ? 1 : params.reflectionStrength;
    for (const it of this.items) {
      if (it.waiter || it.alpha < 0.16) continue;
      for (let f = 0; f < it.feet.length; f++) {
        const ft = it.feet[f];
        wp.line([[ft.x, ft.y + 1], [ft.x + (f ? 1.4 : -1.4), ft.y + (12 + it.unit * 18) * refl]], {
          color: 'rgba(239,233,216,0.20)', width: 0.7 + it.unit * 0.45,
          alpha: it.alpha * 0.5, composite: 'lighter', jitter: 0.5,
          seed: it.ped.seed + f, double: false,
        });
      }
      const n = Math.min(5, it.trail.length);
      for (let k = 0; k < n; k++) {
        const t = it.trail[it.trail.length - 1 - k];
        if (!t) continue;
        const age = k / Math.max(1, n - 1);
        const a = it.alpha * (1 - age * 0.65) * strength;
        const rx = 2.5 * (t[2] || it.unit), ry = 1.1 * (t[2] || it.unit);
        const rot = (hash11(it.ped.seed + k) - 0.5) * 0.5;
        wp.ellipse(t[0], t[1], rx, ry, {
          fill: 'rgba(0,0,0,0.95)', stroke: false,
          composite: 'destination-out', alpha: a * 0.9, rot,
        });
        wp.ellipse(t[0], t[1], rx, ry, {
          stroke: 'rgba(239,233,216,0.55)', width: 0.65,
          composite: 'source-over', alpha: a * 0.45, rot,
        });
      }
    }
  }

  draw(p, camera, timeline, params) {
    for (const it of this.items) {
      if (it.alpha < 0.02) continue;
      for (const d of it.draws) d.fn(p);
    }
  }
}
