// Tiny architectural-sketch people. They are still real 3D world points
// projected into the ink plate, but the silhouette is intentionally simple:
// head dot, solid coat, short legs, a few accessories and umbrella shapes.
import { PALETTE } from './draw.js';
import { v3, clamp, lerp, norm3, makeRng, hash11, TAU } from './math.js';
import { separate, separateGroups, poissonDisk } from './collision.js';
import { FLOWS, WAIT_ZONES, ROAD, isOnSidewalk, clampToWorld } from './world.js';

const UMBRELLAS = [
  { fill: 'rgba(239,233,216,0.13)', stroke: PALETTE.ink, kind: 'white', style: 'dome' },
  { fill: 'rgba(239,233,216,0.10)', stroke: PALETTE.ink, kind: 'white', style: 'flat' },
  { fill: 'rgba(5,6,5,0.94)', stroke: PALETTE.ink, kind: 'black', style: 'dome' },
  { fill: 'rgba(5,6,5,0.92)', stroke: PALETTE.ink, kind: 'black', style: 'pointed' },
  { fill: 'rgba(43,184,174,0.78)', stroke: PALETTE.ink, kind: 'teal', style: 'dome' },
  { fill: 'rgba(212,59,48,0.80)', stroke: PALETTE.ink, kind: 'red', style: 'pointed' },
];

const COATS = [
  PALETTE.black,
  PALETTE.black,
  'rgba(239,233,216,0.10)',
  'rgba(43,184,174,0.48)',
  'rgba(212,59,48,0.50)',
  'rgba(5,6,5,0.92)',
];

const ACCESSORIES = [
  null, null, null, null, null,
  'bag', 'bag', 'hat', 'scarf', 'child', 'dog', 'stroller',
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

function projectAll(camera, pts3) {
  const out = [];
  for (const p of pts3) {
    const q = camera.project(p);
    if (!q) return null;
    out.push(q);
  }
  return out;
}

function makePerson(rng, id, extra = {}) {
  return {
    id,
    phase: rng.range(0, TAU),
    scale: rng.range(0.82, 1.16),
    seed: rng.range(1, 100000),
    umb: rng.pick(UMBRELLAS),
    hasUmbrella: rng.chance(0.86),
    umbrellaTilt: rng.range(-0.18, 0.18),
    coat: rng.pick(COATS),
    accessory: rng.pick(ACCESSORIES),
    lean: rng.range(-0.055, 0.055),
    gait: rng.range(0.86, 1.14),
    trail: [],
    ...extra,
  };
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
    const N = Math.round(158 * this.density);
    this.crossers = [];
    const specs = [];
    for (const f of FLOWS) {
      const count = Math.floor(N * f.weight);
      const pts = poissonDisk(count, f.bounds, 0.92, rng, (x, z) => isOnSidewalk(x, z));
      for (const pt of pts) specs.push({ flow: f, start: pt });
    }
    let guard = 0;
    while (specs.length < N && guard++ < N * 5) {
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
      const bend = rng.range(-1.8, 1.8);
      const ctrl = {
        x: (start.x + end.x) / 2 + side.x * bend,
        z: (start.z + end.z) / 2 + side.z * bend,
      };
      this.crossers.push(makePerson(rng, i, {
        start, end, ctrl, dir, side,
        pathLength: Math.hypot(flow.delta.x, flow.delta.z) + Math.abs(bend) * 0.35,
        delay: clamp((Math.abs(start.x) - 17) / 7, 0, 1) * 0.32 + rng.range(0, 0.42),
        kind: flow.kind,
      }));
    }

    const M = Math.round(42 * this.density);
    this.waiters = [];
    const perZone = Math.ceil(M / WAIT_ZONES.length);
    const waiterPoints = [];
    for (const zone of WAIT_ZONES) {
      const pts = poissonDisk(perZone, zone, 0.88, rng, (x, z) => isOnSidewalk(x, z));
      for (const pt of pts) waiterPoints.push(pt);
    }
    for (let i = 0; i < M; i++) {
      const base = waiterPoints[i % waiterPoints.length] || { x: -20, z: 14 };
      const dir = norm3(v3(-base.x, 0, -base.z));
      this.waiters.push(makePerson(rng, 10000 + i, {
        base: { x: base.x + rng.range(-0.18, 0.18), z: base.z + rng.range(-0.18, 0.18) },
        dir, side: { x: -dir.z, z: dir.x },
        kind: 'wait',
      }));
    }
  }

  setDensity(d) {
    this.density = clamp(d, 0.2, 2.2);
    this.rebuild();
  }

  update(camera, timeline, params, obstacles = []) {
    const u = timeline.u;
    const motionT = timeline.motionT;
    const crowdA = timeline.crowdAlpha();
    const waiterA = timeline.waiterAlpha();
    const wind = params.wind == null ? 0.6 : params.wind;
    const tempo = clamp(params.walkSpeed == null ? 1 : params.walkSpeed, 0.3, 2) * 0.62;
    const raw = [];

    for (const ped of this.crossers) {
      if (u < 0.18) ped.trail.length = 0;
      let world, moving = false, distance = 0;
      if (u > 0.80 || u < 0.18) {
        const idle = Math.sin(motionT * 0.75 + ped.phase) * 0.075;
        world = { x: ped.start.x + idle, z: ped.start.z + Math.cos(motionT * 0.62 + ped.phase) * 0.06 };
      } else {
        const s = timeline.crossWithDelay(ped.delay);
        if (s < 1) {
          world = bezier2(ped.start, ped.ctrl, ped.end, s);
          const sway = Math.sin(motionT * 1.45 + ped.phase) * 0.045;
          world.x += ped.side.x * sway;
          world.z += ped.side.z * sway;
        } else {
          const d = timeline.drain() * 10;
          world = { x: ped.end.x + ped.dir.x * d, z: ped.end.z + ped.dir.z * d };
        }
        distance = (s < 1 ? s * ped.pathLength : ped.pathLength + timeline.drain() * 10);
        moving = true;
      }
      const stridePhase = ped.phase + (moving
        ? distance / (1.38 * ped.scale * ped.gait) * TAU * tempo
        : Math.sin(motionT * 0.65 + ped.phase) * 0.10);
      raw.push({
        ped, world, alpha: crowdA, dir: ped.dir, side: ped.side, scale: ped.scale,
        stridePhase, moving, waiter: false, radius: 0.46 * ped.scale,
        group: 'crowd', fixed: false,
      });
    }

    for (const w of this.waiters) {
      const idle = Math.sin(motionT * 0.68 + w.phase) * 0.085;
      const world = {
        x: w.base.x + idle + wind * 0.10,
        z: w.base.z + Math.cos(motionT * 0.55 + w.phase) * 0.07,
      };
      raw.push({
        ped: w, world, alpha: waiterA * 0.92, dir: w.dir, side: w.side, scale: w.scale,
        stridePhase: w.phase + Math.sin(motionT * 0.55 + w.phase) * 0.08,
        moving: false, waiter: true, radius: 0.46 * w.scale,
        group: 'crowd', fixed: false,
      });
    }

    separate(raw, {
      iterations: 3, padding: 0.08,
      bounds: { x0: ROAD.x0 + 1, x1: ROAD.x1 - 1, z0: ROAD.z0 + 1, z1: ROAD.z1 - 1 },
    });
    if (obstacles.length) separateGroups(raw, obstacles, { iterations: 2, padding: 0.38 });
    for (const r of raw) {
      const c = clampToWorld(r.world, 0.8);
      r.world.x = c.x; r.world.z = c.z;
    }

    this.items = raw.map((r) => this._makeItem(r, camera, params)).filter(Boolean);
    this.items.sort((a, b) => b.depth - a.depth);
    for (const it of this.items) {
      if (it.waiter || it.alpha < 0.18 || !it.ped.trail) continue;
      it.ped.trail.push([it.foot.x, it.foot.y, it.unit]);
      if (it.ped.trail.length > 7) it.ped.trail.shift();
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
    const gait = moving ? Math.sin(phase) : 0.10 * Math.sin(phase * 0.5);
    const liftL = moving ? Math.max(0, Math.cos(phase)) * 0.07 * sc : 0;
    const liftR = moving ? Math.max(0, Math.cos(phase + Math.PI)) * 0.07 * sc : 0;
    const bob = moving ? Math.abs(Math.sin(phase)) * 0.028 * sc : 0.008 * sc * Math.sin(phase * 0.5);
    const lean = (r.ped.lean + wind * 0.012) * sc;
    const A = r.alpha;

    const local = (lat, h, fwd) => v3(
      W.x + side.x * lat + dir.x * fwd,
      h,
      W.z + side.z * lat + dir.z * fwd,
    );
    const q = (w) => camera.project(w);

    const hipY = 0.64 * sc + bob;
    const shoulderY = 1.17 * sc + bob;
    const headY = 1.42 * sc + bob;
    const footY = 0.025;

    const shoulderL = local(-0.20 * sc + lean, shoulderY, 0);
    const shoulderR = local(0.20 * sc + lean, shoulderY, 0);
    const hipL = local(-0.15 * sc + lean * 0.4, hipY, 0);
    const hipR = local(0.15 * sc + lean * 0.4, hipY, 0);
    const footL = local(-0.075 * sc + lean * 0.3, footY + liftL, gait * 0.20 * sc);
    const footR = local(0.075 * sc + lean * 0.3, footY + liftR, -gait * 0.20 * sc);
    const head = local(lean * 0.75, headY, 0);

    const qShoulderL = q(shoulderL), qShoulderR = q(shoulderR);
    const qHipL = q(hipL), qHipR = q(hipR);
    const qFootL = q(footL), qFootR = q(footR);
    const qHead = q(head);
    if (!qShoulderL || !qShoulderR || !qHipL || !qHipR || !qFootL || !qFootR || !qHead) return null;

    const unit = clamp((qFootL.y - qHead.y) / 55, 0.32, 2.2);
    const lineW = clamp(unit * 1.35, 0.65, 2.4);
    const headR = clamp(unit * 1.35, 1.1, 5.2) * sc;
    const foot = {
      x: (qFootL.x + qFootR.x) / 2,
      y: (qFootL.y + qFootR.y) / 2,
      depth: (qFootL.depth + qFootR.depth) / 2,
    };

    // Two short solid pants blocks rather than long stick limbs.
    const legHalf = 0.052 * sc;
    const legL3 = [
      local(-0.075 * sc - legHalf + lean * 0.3, hipY, 0),
      local(-0.075 * sc + legHalf + lean * 0.3, hipY, 0),
      local(-0.075 * sc + legHalf + lean * 0.3, footY + liftL, gait * 0.20 * sc),
      local(-0.075 * sc - legHalf + lean * 0.3, footY + liftL, gait * 0.20 * sc),
    ];
    const legR3 = [
      local(0.075 * sc - legHalf + lean * 0.3, hipY, 0),
      local(0.075 * sc + legHalf + lean * 0.3, hipY, 0),
      local(0.075 * sc + legHalf + lean * 0.3, footY + liftR, -gait * 0.20 * sc),
      local(0.075 * sc - legHalf + lean * 0.3, footY + liftR, -gait * 0.20 * sc),
    ];
    const legLQ = projectAll(camera, legL3);
    const legRQ = projectAll(camera, legR3);
    const coatQ = [qShoulderL, qShoulderR, qHipR, qHipL];
    if (!legLQ || !legRQ) return null;

    const handL = local(-0.27 * sc + lean, 0.92 * sc + bob, -gait * 0.10 * sc);
    const handR = local(0.27 * sc + lean, 0.94 * sc + bob, gait * 0.10 * sc);
    const qHandL = q(handL), qHandR = q(handR);

    // Simple umbrella canopy: projected 3D facets, not a billboard sprite.
    const umb = r.ped.hasUmbrella ? r.ped.umb : null;
    const rimN = umb && umb.style === 'flat' ? 5 : 7;
    const apexH = umb && umb.style === 'pointed' ? 2.28 * sc : 2.13 * sc;
    const rimH = 1.93 * sc + bob;
    const tilt = (r.ped.umbrellaTilt + wind * 0.015) * sc;
    const apex3 = local(tilt * 0.55, apexH + bob, 0);
    const rimCenter3 = local(tilt * 0.18, rimH, 0);
    const rim3 = [];
    for (let i = 0; i < rimN; i++) {
      const a = (i / rimN) * TAU;
      const rr = 0.54 * sc * (i % 2 ? 0.88 : 1.0);
      const h = rimH - (umb && umb.style === 'flat' ? 0 : 0.045 * sc * Math.abs(Math.sin(a)));
      rim3.push(local(tilt * 0.18 + Math.cos(a) * rr, h, Math.sin(a) * rr));
    }
    const qApex = umb ? q(apex3) : null;
    const qRimCenter = umb ? q(rimCenter3) : null;
    const qRim = umb ? projectAll(camera, rim3) : null;
    if (umb && (!qApex || !qRimCenter || !qRim)) return null;

    const seed = r.ped.seed;
    const draws = [];
    const push = (fn) => draws.push(fn);
    const lineOpts = (o = {}) => ({
      color: PALETTE.ink, width: lineW, alpha: A, jitter: 0.22,
      seed, double: false, ...o,
    });

    // Ground shadow.
    push((p) => p.ellipse(foot.x, foot.y + clamp(unit * 0.6, 0.5, 2), clamp(unit * 4.2, 2.2, 10), clamp(unit * 1.5, 0.9, 3.4), {
      fill: 'rgba(0,0,0,0.48)', stroke: false, alpha: A * 0.55,
      rot: Math.atan2(dir.z, dir.x) * 0.18,
    }));

    // Legs.
    for (const leg of [legLQ, legRQ]) {
      push((p) => p.poly(leg, {
        fill: PALETTE.black, stroke: PALETTE.ink,
        width: lineW * 0.8, alpha: A, jitter: 0.16, seed: seed + 3,
      }));
    }

    // Solid coat.
    push((p) => p.poly(coatQ, {
      fill: r.ped.coat, stroke: PALETTE.ink,
      width: lineW, alpha: A, jitter: 0.22, seed: seed + 7,
    }));
    push((p) => p.line([qHipL, qHipR], lineOpts({
      color: 'rgba(239,233,216,0.30)', width: lineW * 0.5, alpha: A * 0.55, seed: seed + 11,
    })));

    // Arms / hands.
    if (qHandL && qHandR) {
      push((p) => p.line([qShoulderL, qHandL], lineOpts({ width: lineW * 0.78, seed: seed + 13 })));
      push((p) => p.line([qShoulderR, qHandR], lineOpts({ width: lineW * 0.78, seed: seed + 17 })));
    }

    // Head dot and a one-line hair / hat cut.
    push((p) => p.ellipse(qHead.x, qHead.y, headR, headR * 1.05, {
      fill: PALETTE.black, stroke: PALETTE.ink, width: lineW * 0.7, alpha: A,
    }));
    if (!umb) {
      push((p) => p.line([[qHead.x - headR * 1.1, qHead.y - headR * 0.75], [qHead.x + headR * 1.1, qHead.y - headR * 0.75]], lineOpts({
        width: lineW * 0.7, seed: seed + 19,
      })));
    }

    // Accessories: small, occasional, hand-drawn additions.
    const acc = r.ped.accessory;
    if (acc === 'scarf') {
      push((p) => p.line([
        [qHead.x - headR * 1.4, qHead.y + headR * 1.25],
        [qHead.x + headR * 1.4, qHead.y + headR * 1.25],
      ], lineOpts({ color: PALETTE.red, width: lineW * 1.0, alpha: A * 0.9, seed: seed + 23 })));
    } else if (acc === 'hat') {
      push((p) => p.ellipse(qHead.x, qHead.y - headR * 1.05, headR * 1.8, headR * 0.45, {
        fill: PALETTE.ink, stroke: PALETTE.ink, width: lineW * 0.5, alpha: A * 0.95,
      }));
    } else if (acc === 'bag' && qHandR) {
      const bag3 = [
        local(0.26 * sc, 0.80 * sc, 0.02), local(0.42 * sc, 0.80 * sc, 0.02),
        local(0.42 * sc, 0.58 * sc, 0.02), local(0.26 * sc, 0.58 * sc, 0.02),
      ];
      const bagQ = projectAll(camera, bag3);
      if (bagQ) push((p) => p.poly(bagQ, {
        fill: 'rgba(239,233,216,0.10)', stroke: PALETTE.ink,
        width: lineW * 0.6, alpha: A, jitter: 0.18, seed: seed + 29,
      }));
    } else if (acc === 'dog') {
      const d0 = local(0.46 * sc, 0, 0.10 * sc);
      const d1 = local(0.68 * sc, 0, 0.16 * sc);
      const qd0 = q(d0), qd1 = q(d1);
      if (qd0 && qd1) {
        push((p) => p.ellipse((qd0.x + qd1.x) / 2, qd0.y - unit * 1.2, unit * 2.4, unit * 1.1, {
          fill: PALETTE.black, stroke: PALETTE.ink, width: lineW * 0.55, alpha: A * 0.9,
        }));
        push((p) => p.ellipse(qd1.x, qd1.y - unit * 2.1, unit * 1.0, unit * 1.0, {
          fill: PALETTE.ink, stroke: PALETTE.ink, width: lineW * 0.5, alpha: A * 0.9,
        }));
        push((p) => p.line([[qd0.x, qd0.y], [qd1.x, qd1.y]], lineOpts({ width: lineW * 0.5, alpha: A * 0.7, seed: seed + 31 })));
      }
    } else if (acc === 'stroller') {
      const s0 = local(0.36 * sc, 0, 0.30 * sc);
      const s1 = local(0.70 * sc, 0, 0.30 * sc);
      const qs0 = q(s0), qs1 = q(s1);
      if (qs0 && qs1) {
        push((p) => p.poly([
          [qs0.x, qs0.y - unit * 3], [qs1.x, qs1.y - unit * 3],
          [qs1.x, qs1.y], [qs0.x, qs0.y],
        ], { fill: 'rgba(43,184,174,0.25)', stroke: PALETTE.ink, width: lineW * 0.55, alpha: A * 0.9, jitter: 0.15, seed: seed + 37 }));
        push((p) => p.ellipse(qs0.x, qs0.y, unit * 1.0, unit * 1.0, { stroke: PALETTE.ink, width: lineW * 0.5, alpha: A * 0.85 }));
        push((p) => p.ellipse(qs1.x, qs1.y, unit * 1.0, unit * 1.0, { stroke: PALETTE.ink, width: lineW * 0.5, alpha: A * 0.85 }));
      }
    } else if (acc === 'child') {
      const child = local(0.44 * sc, 0, 0.06 * sc);
      const qc = q(child);
      const qcHead = q(local(0.44 * sc, headY * 0.72, 0.06 * sc));
      if (qc && qcHead) {
        push((p) => p.line([[qc.x, qc.y], [qc.x, qcHead.y + headR * 0.7]], lineOpts({ width: lineW * 0.9, alpha: A * 0.9, seed: seed + 41 })));
        push((p) => p.ellipse(qcHead.x, qcHead.y, headR * 0.75, headR * 0.8, {
          fill: PALETTE.black, stroke: PALETTE.ink, width: lineW * 0.6, alpha: A * 0.9,
        }));
      }
    }

    // Umbrella: faceted canopy, rim, two ribs, handle and a couple of drips.
    if (umb) {
      const tris = [];
      for (let i = 0; i < rimN; i++) tris.push([qApex, qRim[i], qRim[(i + 1) % rimN]]);
      push((p) => p.polys(tris, { fill: umb.fill, alpha: A }));
      push((p) => p.line(qRim.concat([qRim[0]]), {
        color: umb.stroke, width: lineW * 0.9, alpha: A,
        jitter: 0.28, seed: seed + 43, double: false,
      }));
      for (const idx of [1, Math.floor(rimN / 2) + 1]) {
        push((p) => p.line([qApex, qRim[idx % rimN]], {
          color: umb.kind === 'white' ? 'rgba(239,233,216,0.42)' : 'rgba(239,233,216,0.58)',
          width: lineW * 0.42, alpha: A * 0.8, jitter: 0.18,
          seed: seed + 47 + idx, double: false,
        }));
      }
      if (qHandR) {
        push((p) => p.line([qRimCenter, qHandR], lineOpts({ width: lineW * 0.85, seed: seed + 53 })));
      }
      for (let i = 0; i < 2; i++) {
        const idx = (i * 3 + 1) % rimN;
        const drip3 = local(
          tilt * 0.18 + Math.cos((idx / rimN) * TAU) * 0.50 * sc,
          rimH - 0.20 * sc - hash11(seed + i) * 0.10 * sc,
          Math.sin((idx / rimN) * TAU) * 0.50 * sc,
        );
        const qd = q(drip3);
        if (qd) push((p) => p.line([qRim[idx], qd], {
          color: 'rgba(239,233,216,0.45)', width: lineW * 0.42, alpha: A * 0.55,
          jitter: 0.12, seed: seed + 59 + i, double: false,
        }));
      }
    }

    return {
      ped: r.ped, world: r.world, alpha: A, waiter: r.waiter,
      radius: r.radius, group: 'crowd',
      foot, feet: [qFootL, qFootR], unit, depth: foot.depth,
      stridePhase: phase, trail: r.ped.trail || [], draws,
    };
  }

  drawFlowLines(p, camera, timeline, params) {
    const amt = timeline.cross() * (1 - timeline.drain() * 0.6);
    if (amt < 0.03) return;
    for (let i = 0; i < FLOWS.length; i++) {
      const f = FLOWS[i];
      const cx = (f.bounds.x0 + f.bounds.x1) / 2;
      const cz = (f.bounds.z0 + f.bounds.z1) / 2;
      const a = v3(cx, 0.03, cz);
      const b = v3(cx + f.delta.x, 0.03, cz + f.delta.z);
      p.projectLine(camera, [a, b], {
        color: f.kind === 'straight' ? 'rgba(43,184,174,0.22)' : 'rgba(239,233,216,0.14)',
        width: 0.75, alpha: amt * 0.30, dash: [5, 13], jitter: 0.35,
        seed: 800 + i * 7, double: false,
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
        wp.line([[ft.x, ft.y + 1], [ft.x + (f ? 1.2 : -1.2), ft.y + (8 + it.unit * 12) * refl]], {
          color: 'rgba(239,233,216,0.14)', width: 0.6 + it.unit * 0.35,
          alpha: it.alpha * 0.35, composite: 'lighter', jitter: 0.35,
          seed: it.ped.seed + f, double: false,
        });
      }
      const n = Math.min(3, it.trail.length);
      for (let k = 0; k < n; k++) {
        const t = it.trail[it.trail.length - 1 - k];
        if (!t) continue;
        const age = k / Math.max(1, n - 1);
        const a = it.alpha * (1 - age * 0.55) * strength;
        const rx = 2.0 * (t[2] || it.unit), ry = 0.85 * (t[2] || it.unit);
        const rot = (hash11(it.ped.seed + k) - 0.5) * 0.4;
        wp.ellipse(t[0], t[1], rx, ry, {
          fill: 'rgba(0,0,0,0.95)', stroke: false,
          composite: 'destination-out', alpha: a * 0.55, rot,
        });
      }
    }
  }

  draw(p, camera, timeline, params) {
    for (const it of this.items) {
      if (it.alpha < 0.02) continue;
      for (const d of it.draws) d(p);
    }
  }
}
