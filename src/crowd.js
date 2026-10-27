// Tiny architectural-sketch people, added last on top of the built-out set.
// They remain projected 3D world points, but the silhouettes are varied:
// archetypes, coat shapes, head shapes, long shadows, accessories, groups
// and umbrella styles. No screen-space sprites and no fake wet footprints.
import { PALETTE } from './draw.js';
import { v3, clamp, norm3, makeRng, hash11, TAU } from './math.js';
import { separate, separateGroups, poissonDisk } from './collision.js';
import {
  FLOWS, ROAD, isOnSidewalk, clampToWorld, weightedWaitZone,
} from './world.js';

const UMBRELLAS = [
  { fill: 'rgba(239,233,216,0.13)', stroke: PALETTE.ink, kind: 'white', style: 'dome', radius: 0.52 },
  { fill: 'rgba(239,233,216,0.10)', stroke: PALETTE.ink, kind: 'white', style: 'flat', radius: 0.56 },
  { fill: 'rgba(5,6,5,0.94)', stroke: PALETTE.ink, kind: 'black', style: 'dome', radius: 0.50 },
  { fill: 'rgba(5,6,5,0.92)', stroke: PALETTE.ink, kind: 'black', style: 'pointed', radius: 0.48 },
  { fill: 'rgba(43,184,174,0.78)', stroke: PALETTE.ink, kind: 'teal', style: 'dome', radius: 0.55 },
  { fill: 'rgba(212,59,48,0.80)', stroke: PALETTE.ink, kind: 'red', style: 'pointed', radius: 0.50 },
  { fill: 'rgba(239,233,216,0.16)', stroke: PALETTE.ink, kind: 'white', style: 'dome', radius: 0.60 },
  { fill: 'rgba(93,105,97,0.72)', stroke: PALETTE.ink, kind: 'dim', style: 'flat', radius: 0.53 },
];

const COATS = [
  PALETTE.black,
  'rgba(5,6,5,0.94)',
  'rgba(239,233,216,0.09)',
  'rgba(239,233,216,0.16)',
  'rgba(43,184,174,0.52)',
  'rgba(43,184,174,0.32)',
  'rgba(212,59,48,0.54)',
  'rgba(212,59,48,0.34)',
  'rgba(93,105,97,0.55)',
  'rgba(239,233,216,0.06)',
];

const ARCHETYPES = [
  { id: 'commuter', scale: [0.92, 1.12], coat: 'straight', head: 'round', umbrella: 0.88,
    accessory: ['bag', 'briefcase', 'none', 'scarf'], gait: [0.90, 1.08], lean: [-0.04, 0.04] },
  { id: 'student', scale: [0.84, 1.02], coat: 'hood', head: 'hood', umbrella: 0.52,
    accessory: ['backpack', 'phone', 'none', 'bicycle'], gait: [1.00, 1.22], lean: [-0.07, 0.02] },
  { id: 'elder', scale: [0.86, 1.02], coat: 'long', head: 'hat', umbrella: 0.92,
    accessory: ['cane', 'scarf', 'none'], gait: [0.70, 0.88], lean: [0.02, 0.09] },
  { id: 'child', scale: [0.68, 0.86], coat: 'short', head: 'round', umbrella: 0.60,
    accessory: ['balloon', 'child', 'none'], gait: [1.10, 1.34], lean: [-0.06, 0.06] },
  { id: 'tourist', scale: [0.90, 1.10], coat: 'A', head: 'hat', umbrella: 0.76,
    accessory: ['camera', 'map', 'bag', 'none'], gait: [0.84, 1.04], lean: [-0.05, 0.05] },
  { id: 'worker', scale: [0.95, 1.16], coat: 'short', head: 'cap', umbrella: 0.68,
    accessory: ['lunchbox', 'newspaper', 'none'], gait: [0.88, 1.06], lean: [-0.03, 0.06] },
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
  const arch = rng.pick(ARCHETYPES);
  return {
    id,
    archetype: arch.id,
    phase: rng.range(0, TAU),
    scale: rng.range(arch.scale[0], arch.scale[1]),
    seed: rng.range(1, 100000),
    umb: rng.pick(UMBRELLAS),
    hasUmbrella: rng.chance(arch.umbrella),
    umbrellaTilt: rng.range(-0.24, 0.24),
    coat: rng.pick(COATS),
    coatShape: arch.coat,
    headShape: arch.head,
    accessory: rng.pick(arch.accessory),
    lean: rng.range(arch.lean[0], arch.lean[1]),
    gait: rng.range(arch.gait[0], arch.gait[1]),
    strideLen: rng.range(1.12, 1.72),
    pace: rng.range(0.82, 1.18),
    shadowLen: rng.range(0.9, 1.9),
    entourage: rng.chance(0.10) ? 1 : 0,
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
    const N = Math.round(92 * this.density);
    this.crossers = [];
    const specs = [];
    for (const f of FLOWS) {
      const count = Math.floor(N * f.weight);
      const pts = poissonDisk(count, f.bounds, 0.82, rng, (x, z) => isOnSidewalk(x, z));
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
      const bend = (flow.bend || 0) + rng.range(-1.0, 1.0);
      const ctrl = {
        x: (start.x + end.x) / 2 + side.x * bend,
        z: (start.z + end.z) / 2 + side.z * bend,
      };
      this.crossers.push(makePerson(rng, i, {
        start, end, ctrl, dir, side, kind: flow.kind, flow: flow.id,
        pathLength: Math.hypot(flow.delta.x, flow.delta.z) + Math.abs(bend) * 0.35,
        delay: clamp((Math.abs(start.x) - 10) / 12, 0, 1) * 0.22 + rng.range(0, 0.36),
      }));
    }

    const M = Math.round(30 * this.density);
    this.waiters = [];
    for (let i = 0; i < M; i++) {
      const zone = weightedWaitZone(rng);
      const pts = poissonDisk(1, zone, 0.78, rng, (x, z) => isOnSidewalk(x, z));
      const base = pts[0] || { x: 13, z: -13 };
      const dir = norm3(v3(-base.x, 0, -base.z));
      this.waiters.push(makePerson(rng, 10000 + i, {
        base: { x: base.x + rng.range(-0.15, 0.15), z: base.z + rng.range(-0.15, 0.15) },
        dir, side: { x: -dir.z, z: dir.x }, kind: 'wait', flow: 'WAIT',
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
      let world, moving = false, distance = 0;
      if (u > 0.80 || u < 0.18) {
        const idle = Math.sin(motionT * 0.72 + ped.phase) * 0.07;
        world = { x: ped.start.x + idle, z: ped.start.z + Math.cos(motionT * 0.60 + ped.phase) * 0.055 };
      } else {
        const s = timeline.crossWithDelay(ped.delay * ped.pace);
        if (s < 1) {
          world = bezier2(ped.start, ped.ctrl, ped.end, s);
          const sway = Math.sin(motionT * 1.35 + ped.phase) * 0.04;
          world.x += ped.side.x * sway;
          world.z += ped.side.z * sway;
        } else {
          const d = timeline.drain() * (ped.kind === 'stroll' ? 3.5 : 10);
          world = { x: ped.end.x + ped.dir.x * d, z: ped.end.z + ped.dir.z * d };
        }
        distance = (s < 1 ? s * ped.pathLength : ped.pathLength + timeline.drain() * (ped.kind === 'stroll' ? 3.5 : 10));
        moving = true;
      }
      const stridePhase = ped.phase + (moving
        ? distance / (ped.strideLen * ped.scale * ped.gait) * TAU * tempo
        : Math.sin(motionT * 0.62 + ped.phase) * 0.10);
      raw.push({
        ped, world, alpha: crowdA, dir: ped.dir, side: ped.side, scale: ped.scale,
        stridePhase, moving, waiter: false, radius: 0.44 * ped.scale,
        group: 'crowd', fixed: false,
      });
    }

    for (const w of this.waiters) {
      const idle = Math.sin(motionT * 0.66 + w.phase) * 0.08;
      const world = {
        x: w.base.x + idle + wind * 0.08,
        z: w.base.z + Math.cos(motionT * 0.52 + w.phase) * 0.065,
      };
      raw.push({
        ped: w, world, alpha: waiterA * 0.9, dir: w.dir, side: w.side, scale: w.scale,
        stridePhase: w.phase + Math.sin(motionT * 0.52 + w.phase) * 0.08,
        moving: false, waiter: true, radius: 0.44 * w.scale,
        group: 'crowd', fixed: false,
      });
    }

    separate(raw, {
      iterations: 3, padding: 0.08,
      bounds: { x0: ROAD.x0 + 1, x1: ROAD.x1 - 1, z0: ROAD.z0 + 1, z1: ROAD.z1 - 1 },
    });
    if (obstacles.length) separateGroups(raw, obstacles, { iterations: 2, padding: 0.36 });
    for (const r of raw) {
      const c = clampToWorld(r.world, 0.8);
      r.world.x = c.x; r.world.z = c.z;
    }

    this.items = raw.map((r) => this._makeItem(r, camera, params)).filter(Boolean);
    this.items.sort((a, b) => b.depth - a.depth);
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
    const liftL = moving ? Math.max(0, Math.cos(phase)) * 0.065 * sc : 0;
    const liftR = moving ? Math.max(0, Math.cos(phase + Math.PI)) * 0.065 * sc : 0;
    const bob = moving ? Math.abs(Math.sin(phase)) * 0.026 * sc : 0.008 * sc * Math.sin(phase * 0.5);
    const lean = (r.ped.lean + wind * 0.01) * sc;
    const A = r.alpha;
    const shape = r.ped.coatShape;

    const local = (lat, h, fwd) => v3(
      W.x + side.x * lat + dir.x * fwd,
      h,
      W.z + side.z * lat + dir.z * fwd,
    );
    const q = (w) => camera.project(w);

    const hipY = (shape === 'long' ? 0.52 : shape === 'short' ? 0.74 : 0.64) * sc + bob;
    const shoulderY = 1.16 * sc + bob;
    const headY = 1.40 * sc + bob;
    const footY = 0.025;
    const shoulderHalf = (shape === 'hood' ? 0.24 : shape === 'A' ? 0.18 : 0.20) * sc;
    const hipHalf = (shape === 'A' ? 0.27 : shape === 'short' ? 0.15 : 0.17) * sc;

    const shoulderL = local(-shoulderHalf + lean, shoulderY, 0);
    const shoulderR = local(shoulderHalf + lean, shoulderY, 0);
    const hipL = local(-hipHalf + lean * 0.4, hipY, 0);
    const hipR = local(hipHalf + lean * 0.4, hipY, 0);
    const footL = local(-0.075 * sc + lean * 0.3, footY + liftL, gait * 0.18 * sc);
    const footR = local(0.075 * sc + lean * 0.3, footY + liftR, -gait * 0.18 * sc);
    const head = local(lean * 0.75, headY, 0);

    const qShoulderL = q(shoulderL), qShoulderR = q(shoulderR);
    const qHipL = q(hipL), qHipR = q(hipR);
    const qFootL = q(footL), qFootR = q(footR);
    const qHead = q(head);
    if (!qShoulderL || !qShoulderR || !qHipL || !qHipR || !qFootL || !qFootR || !qHead) return null;

    const unit = clamp((qFootL.y - qHead.y) / 52, 0.30, 2.2);
    const lineW = clamp(unit * 1.30, 0.6, 2.3);
    const headR = clamp(unit * 1.32, 1.0, 5.0) * sc;
    const foot = {
      x: (qFootL.x + qFootR.x) / 2,
      y: (qFootL.y + qFootR.y) / 2,
      depth: (qFootL.depth + qFootR.depth) / 2,
    };

    const legHalf = 0.05 * sc;
    const legL3 = [
      local(-0.075 * sc - legHalf + lean * 0.3, hipY, 0),
      local(-0.075 * sc + legHalf + lean * 0.3, hipY, 0),
      local(-0.075 * sc + legHalf + lean * 0.3, footY + liftL, gait * 0.18 * sc),
      local(-0.075 * sc - legHalf + lean * 0.3, footY + liftL, gait * 0.18 * sc),
    ];
    const legR3 = [
      local(0.075 * sc - legHalf + lean * 0.3, hipY, 0),
      local(0.075 * sc + legHalf + lean * 0.3, hipY, 0),
      local(0.075 * sc + legHalf + lean * 0.3, footY + liftR, -gait * 0.18 * sc),
      local(0.075 * sc - legHalf + lean * 0.3, footY + liftR, -gait * 0.18 * sc),
    ];
    const legLQ = projectAll(camera, legL3);
    const legRQ = projectAll(camera, legR3);
    const coatQ = [qShoulderL, qShoulderR, qHipR, qHipL];
    if (!legLQ || !legRQ) return null;

    const handL = local(-0.28 * sc + lean, 0.92 * sc + bob, -gait * 0.09 * sc);
    const handR = local(0.28 * sc + lean, 0.94 * sc + bob, gait * 0.09 * sc);
    const qHandL = q(handL), qHandR = q(handR);

    // Umbrella geometry: a few faceted styles, not one repeated dome.
    const umb = r.ped.hasUmbrella ? r.ped.umb : null;
    const rimN = umb && umb.style === 'flat' ? 5 : (umb && umb.style === 'pointed' ? 6 : 7);
    const apexH = umb && umb.style === 'pointed' ? 2.32 * sc : (umb && umb.style === 'flat' ? 2.04 * sc : 2.14 * sc);
    const rimH = 1.92 * sc + bob;
    const radius = (umb ? umb.radius : 0.54) * sc;
    const tilt = (r.ped.umbrellaTilt + wind * 0.012) * sc;
    const apex3 = local(tilt * 0.55, apexH + bob, 0);
    const rimCenter3 = local(tilt * 0.18, rimH, 0);
    const rim3 = [];
    for (let i = 0; i < rimN; i++) {
      const a = (i / rimN) * TAU;
      const rr = radius * (i % 2 ? 0.88 : 1.0);
      const h = rimH - (umb && umb.style === 'flat' ? 0 : 0.04 * sc * Math.abs(Math.sin(a)));
      rim3.push(local(tilt * 0.18 + Math.cos(a) * rr, h, Math.sin(a) * rr));
    }
    const qApex = umb ? q(apex3) : null;
    const qRimCenter = umb ? q(rimCenter3) : null;
    const qRim = umb ? projectAll(camera, rim3) : null;
    if (umb && (!qApex || !qRimCenter || !qRim)) return null;

    // A small companion for occasional pairs.
    let companion = null;
    if (r.ped.entourage > 0) {
      const cLat = 0.46 * sc, cFwd = -0.12 * sc;
      const cHead = q(local(cLat, headY * 0.72, cFwd));
      const cFoot = q(local(cLat, footY, cFwd));
      if (cHead && cFoot) companion = { head: cHead, foot: cFoot };
    }

    const seed = r.ped.seed;
    const draws = [];
    const push = (fn) => draws.push(fn);
    const lineOpts = (o = {}) => ({
      color: PALETTE.ink, width: lineW, alpha: A, jitter: 0.18,
      seed, double: false, ...o,
    });

    // Long directional ground shadow (architectural-sketch reference).
    const shadowDir = v3(-0.72, 0, -0.30);
    const shadowLen = (0.9 + r.ped.shadowLen * 0.8) * sc;
    const shadowTip = camera.project(v3(
      W.x + shadowDir.x * shadowLen, 0.02, W.z + shadowDir.z * shadowLen,
    ));
    push((p) => {
      p.ellipse(foot.x, foot.y + clamp(unit * 0.5, 0.4, 1.8), clamp(unit * 3.6, 1.8, 8), clamp(unit * 1.3, 0.8, 3), {
        fill: 'rgba(0,0,0,0.42)', stroke: false, alpha: A * 0.5,
      });
      if (shadowTip) {
        p.line([[foot.x, foot.y], [shadowTip.x, shadowTip.y]], {
          color: 'rgba(0,0,0,0.40)', width: clamp(unit * 2.1, 1.2, 5.5), alpha: A * 0.34,
          jitter: 0.18, seed: seed + 1, double: false,
        });
      }
    });

    // Legs.
    for (const leg of [legLQ, legRQ]) {
      push((p) => p.poly(leg, {
        fill: PALETTE.black, stroke: PALETTE.ink,
        width: lineW * 0.78, alpha: A, jitter: 0.14, seed: seed + 3,
      }));
    }

    // Coat: shape varies by archetype.
    push((p) => p.poly(coatQ, {
      fill: r.ped.coat, stroke: PALETTE.ink,
      width: lineW, alpha: A, jitter: 0.18, seed: seed + 7,
    }));
    if (shape === 'long' || shape === 'A') {
      push((p) => p.line([qHipL, qHipR], lineOpts({
        color: 'rgba(239,233,216,0.28)', width: lineW * 0.5, alpha: A * 0.5, seed: seed + 11,
      })));
    }

    // Arms.
    if (qHandL && qHandR) {
      push((p) => p.line([qShoulderL, qHandL], lineOpts({ width: lineW * 0.76, seed: seed + 13 })));
      push((p) => p.line([qShoulderR, qHandR], lineOpts({ width: lineW * 0.76, seed: seed + 17 })));
    }

    // Head shapes.
    const headShape = r.ped.headShape;
    push((p) => {
      if (headShape === 'hood') {
        p.ellipse(qHead.x, qHead.y, headR * 1.35, headR * 1.25, {
          fill: PALETTE.black, stroke: PALETTE.ink, width: lineW * 0.7, alpha: A,
        });
      } else if (headShape === 'oval') {
        p.ellipse(qHead.x, qHead.y, headR * 0.9, headR * 1.25, {
          fill: PALETTE.black, stroke: PALETTE.ink, width: lineW * 0.7, alpha: A,
        });
      } else {
        p.ellipse(qHead.x, qHead.y, headR, headR * 1.04, {
          fill: PALETTE.black, stroke: PALETTE.ink, width: lineW * 0.7, alpha: A,
        });
      }
      if (headShape === 'hat' || headShape === 'cap') {
        const brim = headShape === 'hat' ? headR * 1.8 : headR * 1.25;
        p.line([[qHead.x - brim, qHead.y - headR * 0.65], [qHead.x + brim, qHead.y - headR * 0.65]], lineOpts({
          width: lineW * 0.7, seed: seed + 19,
        }));
      } else if (!umb) {
        p.line([[qHead.x - headR, qHead.y - headR * 0.72], [qHead.x + headR, qHead.y - headR * 0.72]], lineOpts({
          width: lineW * 0.6, seed: seed + 19,
        }));
      }
    });

    // Accessories.
    const acc = r.ped.accessory;
    if (acc === 'scarf') {
      push((p) => p.line([
        [qHead.x - headR * 1.3, qHead.y + headR * 1.25],
        [qHead.x + headR * 1.3, qHead.y + headR * 1.25],
      ], lineOpts({ color: PALETTE.red, width: lineW * 0.95, alpha: A * 0.9, seed: seed + 23 })));
    } else if (acc === 'hat' || acc === 'cap') {
      push((p) => p.ellipse(qHead.x, qHead.y - headR * 1.05, headR * (acc === 'hat' ? 1.8 : 1.3), headR * 0.42, {
        fill: PALETTE.ink, stroke: PALETTE.ink, width: lineW * 0.5, alpha: A * 0.95,
      }));
    } else if (['bag', 'briefcase', 'lunchbox'].includes(acc) && qHandR) {
      const w = acc === 'briefcase' ? 0.20 : 0.16;
      const h = acc === 'briefcase' ? 0.16 : 0.22;
      const bag3 = [
        local(0.28 * sc, 0.80 * sc, 0.02), local((0.28 + w) * sc, 0.80 * sc, 0.02),
        local((0.28 + w) * sc, (0.80 - h) * sc, 0.02), local(0.28 * sc, (0.80 - h) * sc, 0.02),
      ];
      const bagQ = projectAll(camera, bag3);
      if (bagQ) push((p) => p.poly(bagQ, {
        fill: acc === 'briefcase' ? 'rgba(239,233,216,0.08)' : 'rgba(239,233,216,0.12)',
        stroke: PALETTE.ink, width: lineW * 0.6, alpha: A, jitter: 0.14, seed: seed + 29,
      }));
    } else if (acc === 'backpack') {
      const bp3 = [
        local(-0.22 * sc, 1.10 * sc, -0.12 * sc), local(-0.30 * sc, 1.10 * sc, -0.12 * sc),
        local(-0.30 * sc, 0.72 * sc, -0.12 * sc), local(-0.22 * sc, 0.72 * sc, -0.12 * sc),
      ];
      const bpQ = projectAll(camera, bp3);
      if (bpQ) push((p) => p.poly(bpQ, {
        fill: 'rgba(43,184,174,0.30)', stroke: PALETTE.ink,
        width: lineW * 0.6, alpha: A * 0.9, jitter: 0.12, seed: seed + 31,
      }));
    } else if (acc === 'phone' && qHandR) {
      push((p) => p.ellipse(qHandR.x, qHandR.y - unit, clamp(unit * 0.6, 0.7, 2), clamp(unit * 1.0, 1, 3), {
        fill: PALETTE.ink, stroke: PALETTE.ink, width: 0.5, alpha: A * 0.9,
      }));
    } else if (acc === 'camera') {
      push((p) => p.rect(qHead.x - headR * 1.1, qHead.y + headR * 1.1, headR * 2.2, headR * 1.0, {
        fill: 'rgba(239,233,216,0.12)', stroke: PALETTE.ink, width: lineW * 0.55, alpha: A * 0.9,
      }));
    } else if (acc === 'map' && qHandL) {
      push((p) => p.poly([
        [qHandL.x - unit * 2, qHandL.y - unit], [qHandL.x + unit * 2, qHandL.y - unit * 1.4],
        [qHandL.x + unit * 2.2, qHandL.y + unit], [qHandL.x - unit * 1.8, qHandL.y + unit * 1.2],
      ], { fill: 'rgba(239,233,216,0.10)', stroke: PALETTE.ink, width: lineW * 0.5, alpha: A * 0.85, jitter: 0.1, seed: seed + 33 }));
    } else if (acc === 'newspaper') {
      push((p) => p.poly([
        [qHead.x - headR * 2.2, qHead.y - headR * 1.5],
        [qHead.x + headR * 2.2, qHead.y - headR * 1.5],
        [qHead.x + headR * 1.8, qHead.y - headR * 0.2],
        [qHead.x - headR * 1.8, qHead.y - headR * 0.2],
      ], { fill: 'rgba(239,233,216,0.10)', stroke: PALETTE.ink, width: lineW * 0.5, alpha: A * 0.8, jitter: 0.1, seed: seed + 35 }));
    } else if (acc === 'cane' && qHandR) {
      const caneTip = q(local(0.36 * sc, 0.02, 0.20 * sc));
      if (caneTip) push((p) => p.line([qHandR, caneTip], lineOpts({ width: lineW * 0.6, alpha: A * 0.8, seed: seed + 37 })));
    } else if (acc === 'balloon' && qHandR) {
      const bq = q(local(0.42 * sc, 1.65 * sc, 0.10 * sc));
      if (bq) {
        push((p) => p.line([qHandR, bq], lineOpts({ width: lineW * 0.4, alpha: A * 0.7, seed: seed + 39 })));
        push((p) => p.ellipse(bq.x, bq.y, headR * 1.4, headR * 1.7, {
          fill: rngAccentColor(seed), stroke: PALETTE.ink, width: lineW * 0.5, alpha: A * 0.9,
        }));
      }
    } else if (acc === 'dog') {
      const d0 = q(local(0.46 * sc, 0, 0.10 * sc));
      const d1 = q(local(0.68 * sc, 0, 0.16 * sc));
      if (d0 && d1) {
        push((p) => p.ellipse((d0.x + d1.x) / 2, d0.y - unit * 1.1, unit * 2.3, unit * 1.0, {
          fill: PALETTE.black, stroke: PALETTE.ink, width: lineW * 0.5, alpha: A * 0.9,
        }));
        push((p) => p.ellipse(d1.x, d1.y - unit * 2.0, unit * 0.9, unit * 0.9, {
          fill: PALETTE.ink, stroke: PALETTE.ink, width: lineW * 0.45, alpha: A * 0.9,
        }));
        push((p) => p.line([d0, d1], lineOpts({ width: lineW * 0.45, alpha: A * 0.65, seed: seed + 41 })));
      }
    } else if (acc === 'stroller') {
      const s0 = q(local(0.36 * sc, 0, 0.30 * sc));
      const s1 = q(local(0.70 * sc, 0, 0.30 * sc));
      if (s0 && s1) {
        push((p) => p.poly([
          [s0.x, s0.y - unit * 3], [s1.x, s1.y - unit * 3],
          [s1.x, s1.y], [s0.x, s0.y],
        ], { fill: 'rgba(43,184,174,0.22)', stroke: PALETTE.ink, width: lineW * 0.5, alpha: A * 0.9, jitter: 0.1, seed: seed + 43 }));
        push((p) => p.ellipse(s0.x, s0.y, unit, unit, { stroke: PALETTE.ink, width: lineW * 0.45, alpha: A * 0.8 }));
        push((p) => p.ellipse(s1.x, s1.y, unit, unit, { stroke: PALETTE.ink, width: lineW * 0.45, alpha: A * 0.8 }));
      }
    } else if (acc === 'bicycle') {
      const w0 = q(local(0.50 * sc, 0.35 * sc, 0.05 * sc));
      const w1 = q(local(0.92 * sc, 0.35 * sc, 0.05 * sc));
      if (w0 && w1) {
        push((p) => p.ellipse(w0.x, w0.y, unit * 1.5, unit * 1.5, { stroke: PALETTE.ink, width: lineW * 0.5, alpha: A * 0.8 }));
        push((p) => p.ellipse(w1.x, w1.y, unit * 1.5, unit * 1.5, { stroke: PALETTE.ink, width: lineW * 0.5, alpha: A * 0.8 }));
        push((p) => p.line([w0, w1], lineOpts({ width: lineW * 0.45, alpha: A * 0.7, seed: seed + 45 })));
      }
    }

    // Companion / pair.
    if (companion) {
      push((p) => p.line([companion.foot, companion.head], lineOpts({ width: lineW * 0.8, alpha: A * 0.9, seed: seed + 47 })));
      push((p) => p.ellipse(companion.head.x, companion.head.y, headR * 0.75, headR * 0.8, {
        fill: PALETTE.black, stroke: PALETTE.ink, width: lineW * 0.55, alpha: A * 0.9,
      }));
      if (umb) {
        push((p) => p.ellipse(companion.head.x, companion.head.y - headR * 1.2, headR * 1.8, headR * 0.8, {
          fill: umb.fill, stroke: umb.stroke, width: lineW * 0.5, alpha: A * 0.8,
        }));
      }
    }

    // Umbrella.
    if (umb) {
      const tris = [];
      for (let i = 0; i < rimN; i++) tris.push([qApex, qRim[i], qRim[(i + 1) % rimN]]);
      push((p) => p.polys(tris, { fill: umb.fill, alpha: A }));
      push((p) => p.line(qRim.concat([qRim[0]]), {
        color: umb.stroke, width: lineW * 0.85, alpha: A,
        jitter: 0.22, seed: seed + 49, double: false,
      }));
      const ribCount = umb.style === 'flat' ? 2 : 3;
      for (let i = 0; i < ribCount; i++) {
        const idx = Math.floor((i + 1) * rimN / (ribCount + 1));
        push((p) => p.line([qApex, qRim[idx]], {
          color: umb.kind === 'white' ? 'rgba(239,233,216,0.40)' : 'rgba(239,233,216,0.55)',
          width: lineW * 0.4, alpha: A * 0.75, jitter: 0.14,
          seed: seed + 53 + i, double: false,
        }));
      }
      if (qHandR) push((p) => p.line([qRimCenter, qHandR], lineOpts({ width: lineW * 0.8, seed: seed + 59 })));
      for (let i = 0; i < 2; i++) {
        const idx = (i * 3 + 1) % rimN;
        const drip3 = local(
          tilt * 0.18 + Math.cos((idx / rimN) * TAU) * radius * 0.94,
          rimH - 0.18 * sc - hash11(seed + i) * 0.09 * sc,
          Math.sin((idx / rimN) * TAU) * radius * 0.94,
        );
        const qd = q(drip3);
        if (qd) push((p) => p.line([qRim[idx], qd], {
          color: 'rgba(239,233,216,0.42)', width: lineW * 0.4, alpha: A * 0.5,
          jitter: 0.1, seed: seed + 61 + i, double: false,
        }));
      }
    }

    return {
      ped: r.ped, world: r.world, alpha: A, waiter: r.waiter,
      radius: r.radius, group: 'crowd',
      foot, feet: [qFootL, qFootR], unit, depth: foot.depth,
      stridePhase: phase, draws,
    };
  }

  draw(p, camera, timeline, params) {
    for (const it of this.items) {
      if (it.alpha < 0.02) continue;
      for (const d of it.draws) d(p);
    }
  }
}

function rngAccentColor(seed) {
  const r = hash11(seed * 1.7);
  if (r < 0.34) return 'rgba(212,59,48,0.75)';
  if (r < 0.68) return 'rgba(43,184,174,0.75)';
  return 'rgba(239,233,216,0.28)';
}
