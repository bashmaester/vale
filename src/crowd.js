// Tiny architectural-sketch people, added last on top of the built set.
//
// The rule for this scale: ONE solid silhouette per person (coat + legs as a
// single closed shape), a head disc, and an umbrella dome. Detail beyond that
// turns to noise at final resolution, so accessories are deliberately sparse.
//
// People are still projected 3D points: they stand on the real sidewalk
// (including the kerb ramps), they walk beziers between kerbs, they are pushed
// apart by a separation solver, and their size follows perspective.
//
// LoD thins the crowd deterministically (same seed → same people at the same
// level) and strips accessories before it strips silhouettes.

import { PALETTE } from './draw.js';
import { v3, clamp, lerp, norm3, makeRng, hash11, TAU, smoothstep, smootherstep } from './math.js';
import { separate, separateGroups, poissonDisk } from './collision.js';
import { groundYAt, TILE } from './tile.js';
import { LOOP, boundaryAlpha } from './loop.js';

// The crowd fades at the back and side edges only. The front (+z) edge is the
// open face of the diorama and the near sidewalk runs along it — fading there
// would dim the whole foreground row.
const CROWD_BOX = { x0: TILE.x0, x1: TILE.x1, z0: TILE.z0, z1: TILE.z1 + 3.0 };
import {
  FLOWS, isOnSidewalk, clampToWorld, weightedWaitZone,
} from './world.js';

// Canopy colours. The palette is carried mostly by umbrellas, so they get the
// saturated values while the coats stay near-black.
const UMBRELLAS = [
  { fill: 'rgba(239,233,216,0.92)', stroke: '#0a0c0a', kind: 'white', style: 'dome', radius: 0.40 },
  { fill: 'rgba(239,233,216,0.72)', stroke: '#0a0c0a', kind: 'white', style: 'flat', radius: 0.44 },
  { fill: 'rgba(12,15,13,0.97)', stroke: PALETTE.ink, kind: 'black', style: 'dome', radius: 0.38 },
  { fill: 'rgba(12,15,13,0.95)', stroke: PALETTE.ink, kind: 'black', style: 'pointed', radius: 0.36 },
  { fill: 'rgba(43,184,174,0.95)', stroke: '#0a0c0a', kind: 'teal', style: 'dome', radius: 0.42 },
  { fill: 'rgba(239,233,216,0.86)', stroke: '#0a0c0a', kind: 'white', style: 'pointed', radius: 0.46 },
  { fill: 'rgba(52,60,54,0.95)', stroke: PALETTE.ink, kind: 'dim', style: 'flat', radius: 0.41 },
  { fill: 'rgba(212,59,48,0.96)', stroke: '#0a0c0a', kind: 'red', style: 'pointed', radius: 0.38 },
  { fill: 'rgba(10,13,11,0.97)', stroke: 'rgba(239,233,216,0.7)', kind: 'black', style: 'flat', radius: 0.44 },
];

// Coats: opaque, mostly dark, a few carrying colour.
const COATS = [
  '#080a09', '#0d100e', '#12160f', '#1a1e18', '#0a0d0c', '#141a17',
  'rgba(239,233,216,0.82)', 'rgba(239,233,216,0.55)', 'rgba(222,214,196,0.66)',
  'rgba(93,105,97,0.78)',
  'rgba(43,184,174,0.80)', 'rgba(212,59,48,0.82)',
];

const ARCHETYPES = [
  { id: 'commuter', scale: [0.98, 1.20], coat: 'straight', head: 'round', umbrella: 0.52,
    accessory: ['bag', 'briefcase', 'none', 'none'], gait: [0.90, 1.08], lean: [-0.04, 0.04] },
  { id: 'student', scale: [0.90, 1.08], coat: 'hood', head: 'hood', umbrella: 0.20,
    accessory: ['backpack', 'phone', 'none'], gait: [1.00, 1.22], lean: [-0.07, 0.02] },
  { id: 'elder', scale: [0.92, 1.08], coat: 'long', head: 'hat', umbrella: 0.62,
    accessory: ['cane', 'none', 'none'], gait: [0.70, 0.88], lean: [0.02, 0.09] },
  { id: 'child', scale: [0.72, 0.92], coat: 'short', head: 'round', umbrella: 0.22,
    accessory: ['balloon', 'child', 'none'], gait: [1.10, 1.34], lean: [-0.06, 0.06] },
  { id: 'tourist', scale: [0.96, 1.18], coat: 'A', head: 'hat', umbrella: 0.34,
    accessory: ['camera', 'bag', 'none'], gait: [0.84, 1.04], lean: [-0.05, 0.05] },
  { id: 'worker', scale: [1.00, 1.22], coat: 'short', head: 'cap', umbrella: 0.24,
    accessory: ['lunchbox', 'newspaper', 'none'], gait: [0.88, 1.06], lean: [-0.03, 0.06] },
];

// Coats are split into dark and pale. Dark ones only need a whisper of edge —
// a bright outline turns them into hollow wireframes on dark asphalt.
function coatIsDark(coat) {
  if (coat.startsWith('#') && coat.length === 7) {
    const r = parseInt(coat.slice(1, 3), 16);
    const g = parseInt(coat.slice(3, 5), 16);
    const b = parseInt(coat.slice(5, 7), 16);
    return (r + g + b) / 3 < 40;
  }
  const m = coat.match(/rgba\((\d+),(\d+),(\d+)/);
  if (m) return (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3 < 80;
  return false;
}

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
    umbrellaTilt: rng.range(-0.20, 0.20),
    umbrellaLift: rng.range(0.86, 1.14),
    coat: rng.pick(COATS),
    coatShape: arch.coat,
    headShape: arch.head,
    accessory: rng.pick(arch.accessory),
    lean: rng.range(arch.lean[0], arch.lean[1]),
    gait: rng.range(arch.gait[0], arch.gait[1]),
    strideLen: rng.range(1.12, 1.72),
    pace: rng.range(0.82, 1.18),
    shadowLen: rng.range(1.0, 2.2),
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
    const N = Math.round(34 * this.density);
    this.crossers = [];
    const specs = [];
    for (const f of FLOWS) {
      const count = Math.floor(N * f.weight);
      const pts = poissonDisk(count, f.bounds, 0.70, rng, (x, z) => isOnSidewalk(x, z));
      for (const pt of pts) specs.push({ flow: f, start: pt });
    }
    let guard = 0;
    while (specs.length < N && guard++ < N * 6) {
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
      const bend = (flow.bend || 0) + rng.range(-0.9, 0.9);
      const ctrl = {
        x: (start.x + end.x) / 2 + side.x * bend,
        z: (start.z + end.z) / 2 + side.z * bend,
      };
      // Where this person comes from: along the sidewalk, at the edge of the
      // tile. They walk in from there, so nobody ever pops into mid-frame.
      const approachSign = rng.chance(0.5) ? 1 : -1;
      const edgeX = approachSign > 0 ? TILE.x1 - 0.35 : TILE.x0 + 0.35;
      this.crossers.push(makePerson(rng, i, {
        start, end, ctrl, dir, side, kind: flow.kind, flow: flow.id,
        approach: { x: edgeX, z: start.z + side.z * 0.0 },
        pathLength: Math.hypot(flow.delta.x, flow.delta.z) + Math.abs(bend) * 0.35,
        delay: clamp((Math.abs(start.x) - 7) / 12, 0, 1) * 0.16 + rng.range(0, 0.30),
      }));
    }

    const M = Math.round(18 * this.density);
    this.waiters = [];
    for (let i = 0; i < M; i++) {
      const zone = weightedWaitZone(rng);
      const pts = poissonDisk(1, zone, 0.62, rng, (x, z) => isOnSidewalk(x, z));
      const base = pts[0] || { x: -2.6, z: 5.8 };
      const dir = norm3(v3(-base.x, 0, -base.z));
      this.waiters.push(makePerson(rng, 10000 + i, {
        base: { x: base.x + rng.range(-0.1, 0.1), z: base.z + rng.range(-0.1, 0.1) },
        dir, side: { x: -dir.z, z: dir.x }, kind: 'wait', flow: 'WAIT',
      }));
    }
  }

  setDensity(d) {
    this.density = clamp(d, 0.2, 2.2);
    this.rebuild();
  }

  update(camera, timeline, params, obstacles = [], detail = { crowd: 1, windows: 1, props: 1 }) {
    const u = timeline.u;
    const buffer = params.loopBuffer == null ? 1.1 : params.loopBuffer;
    const motionT = timeline.motionT;
    // Integer cycles per loop: a sine that does not complete whole cycles inside
    // the 20 s loop would make t=0 and t=20 different frames.
    const osc = (cycles, phase) => Math.sin((TAU * cycles * motionT) / LOOP + phase);
    const crowdA = timeline.crowdAlpha();
    const waiterA = timeline.waiterAlpha();
    const wind = params.wind == null ? 0.6 : params.wind;
    const tempo = clamp(params.walkSpeed == null ? 1 : params.walkSpeed, 0.3, 2) * 0.62;
    const raw = [];

    for (const ped of this.crossers) {
      let world, moving = false, distance = 0;
      // Alpha is driven by where the person is, not by the clock: they fade in
      // at the edge of the tile, walk in, wait at the kerb, cross on the green
      // and walk off the far side. The loop point therefore happens while they
      // are already invisible, so there is no pop.
      let alpha = 1;
      if (u > 0.80 || u < 0.18) {
        const idle = osc(2, ped.phase) * 0.07;
        if (u < 0.18) {
          // Approach leg: from the tile edge to the kerb.
          const k = smootherstep(0.0, 0.17, u);
          world = {
            x: lerp(ped.approach.x, ped.start.x + idle, k),
            z: lerp(ped.approach.z, ped.start.z, k) + Math.sin((TAU * 2 * motionT) / LOOP + ped.phase + 1.57) * 0.055 * k,
          };
          moving = k > 0.01 && k < 0.99;
          alpha = boundaryAlpha(world.x, world.z, CROWD_BOX, buffer, 'fade');
        } else {
          world = {
            x: ped.start.x + idle,
            z: ped.start.z + Math.sin((TAU * 2 * motionT) / LOOP + ped.phase + 1.57) * 0.055,
          };
          alpha = boundaryAlpha(world.x, world.z, CROWD_BOX, buffer, 'fade');
        }
      } else {
        const s = timeline.crossWithDelay(ped.delay * ped.pace);
        if (s < 1) {
          world = bezier2(ped.start, ped.ctrl, ped.end, s);
          const sway = osc(4, ped.phase) * 0.04;
          world.x += ped.side.x * sway;
          world.z += ped.side.z * sway;
        } else {
          const d = timeline.drain() * (ped.kind === 'stroll' ? 4.5 : 8);
          world = { x: ped.end.x + ped.dir.x * d, z: ped.end.z + ped.dir.z * d };
        }
        distance = (s < 1 ? s * ped.pathLength : ped.pathLength + timeline.drain() * (ped.kind === 'stroll' ? 4.5 : 8));
        moving = true;
        // Walk into the far edge and dissolve there, not in the middle.
        alpha = boundaryAlpha(world.x, world.z, CROWD_BOX, buffer, 'fade') *
          (1 - smoothstep(0.74, 0.9, u));
      }
      const stridePhase = ped.phase + (moving
        ? distance / (ped.strideLen * ped.scale * ped.gait) * TAU * tempo
        : osc(2, ped.phase) * 0.10);
      raw.push({
        ped, world, alpha, dir: ped.dir, side: ped.side, scale: ped.scale,
        stridePhase, moving, waiter: false, radius: 0.44 * ped.scale,
        group: 'crowd', fixed: false,
      });
    }

    for (const w of this.waiters) {
      const idle = osc(2, w.phase) * 0.08;
      const world = {
        x: w.base.x + idle + wind * 0.08,
        z: w.base.z + Math.sin((TAU * 2 * motionT) / LOOP + w.phase + 1.57) * 0.065,
      };
      raw.push({
        ped: w, world, alpha: 0.92 * boundaryAlpha(world.x, world.z, CROWD_BOX, buffer, 'fade'),
        dir: w.dir, side: w.side, scale: w.scale,
        stridePhase: w.phase + osc(2, w.phase) * 0.08,
        moving: false, waiter: true, radius: 0.44 * w.scale,
        group: 'crowd', fixed: false,
      });
    }

    separate(raw, {
      iterations: 3, padding: 0.10,
      bounds: { x0: TILE.x0 + 1, x1: TILE.x1 - 1, z0: TILE.z0 + 1, z1: TILE.z1 - 1 },
    });
    if (obstacles.length) separateGroups(raw, obstacles, { iterations: 2, padding: 0.42 });
    for (const r of raw) {
      const c = clampToWorld(r.world, 0.9);
      r.world.x = c.x; r.world.z = c.z;
    }

    const budget = detail.crowd == null ? 1 : detail.crowd;
    this.items = [];
    for (const r of raw) {
      if (budget < 0.999 && hash11(r.ped.seed * 3.71) > budget) continue;
      const it = this._makeItem(r, camera, params, detail);
      if (it) this.items.push(it);
    }
    this.items.sort((a, b) => b.depth - a.depth);
    return this.items;
  }

  _makeItem(r, camera, params, detail = { props: 1, windows: 1 }) {
    const sc = r.scale;
    const W = r.world;
    const dir = r.dir, side = r.side;
    const phase = r.stridePhase;
    const moving = r.moving;
    const wind = params.wind == null ? 0.6 : params.wind;
    const base = groundYAt(W.x, W.z);
    const gait = moving ? Math.sin(phase) : 0.10 * Math.sin(phase * 0.5);
    const bob = moving ? Math.abs(Math.sin(phase)) * 0.022 * sc : 0.006 * sc * Math.sin(phase * 0.5);
    const lean = (r.ped.lean + wind * 0.01) * sc;
    const A = r.alpha;
    const shape = r.ped.coatShape;
    const darkCoat = coatIsDark(r.ped.coat);

    const local = (lat, h, fwd) => v3(
      W.x + side.x * lat + dir.x * fwd,
      base + h,
      W.z + side.z * lat + dir.z * fwd,
    );
    const q = (w) => camera.project(w);

    const hipY = (shape === 'long' ? 0.54 : shape === 'short' ? 0.76 : 0.66) * sc + bob;
    const shoulderY = 1.12 * sc + bob;
    const headY = 1.30 * sc + bob;
    const footY = 0.015;
    const shoulderHalf = (shape === 'hood' ? 0.20 : shape === 'A' ? 0.16 : 0.175) * sc;
    const hipHalf = (shape === 'A' ? 0.23 : shape === 'short' ? 0.125 : 0.145) * sc;
    const strideWide = moving ? gait * 0.11 * sc : 0.025 * sc;

    const shL3 = local(-shoulderHalf + lean, shoulderY, 0);
    const shR3 = local(shoulderHalf + lean, shoulderY, 0);
    const hipL3 = local(-hipHalf + lean * 0.4, hipY, 0);
    const hipR3 = local(hipHalf + lean * 0.4, hipY, 0);
    const footL3 = local(-0.075 * sc + lean * 0.3, footY, strideWide);
    const footR3 = local(0.075 * sc + lean * 0.3, footY, -strideWide);
    const head3 = local(lean * 0.75, headY, 0);

    const qShL = q(shL3), qShR = q(shR3);
    const qHipL = q(hipL3), qHipR = q(hipR3);
    const qFootL = q(footL3), qFootR = q(footR3);
    const qHead = q(head3);
    if (!qShL || !qShR || !qHipL || !qHipR || !qFootL || !qFootR || !qHead) return null;

    // Screen size drives every detail size. This is the scale trap the earlier
    // build fell into: heads and lines were sub-pixel and people became an X.
    const bodyPx = Math.max(4, (qFootL.y + qFootR.y) / 2 - qHead.y);
    const headR = Math.max(1.0, bodyPx * 0.082);
    const lineW = clamp(bodyPx * 0.042, 0.55, 2.1);
    const foot = {
      x: (qFootL.x + qFootR.x) / 2,
      y: (qFootL.y + qFootR.y) / 2,
      depth: (qFootL.depth + qFootR.depth) / 2,
    };

    const seed = r.ped.seed;
    const draws = [];
    const push = (fn) => draws.push(fn);
    const rich = detail.windows > 0.5;

    // Shadow: a short soft ellipse, not a hole in the ground.
    push((p) => {
      p.ellipse(foot.x, foot.y + Math.max(0.6, bodyPx * 0.035), Math.max(1.6, bodyPx * 0.22), Math.max(0.7, bodyPx * 0.075), {
        fill: 'rgba(0,0,0,0.58)', stroke: false, alpha: A * 0.4,
      });
    });

    // One solid silhouette with a leg split: shoulders → hips → outer ankles →
    // crotch → other ankle. At this size that is all a body needs to read.
    const crotch3 = local(lean * 0.4, footY + (hipY - footY) * 0.38, 0);
    const qCrotch = q(crotch3);
    if (!qCrotch) return null;
    const silhouette = [qShL, qShR, qHipR, qFootR, qCrotch, qFootL, qHipL];
    push((p) => p.poly(silhouette, {
      fill: r.ped.coat,
      stroke: darkCoat ? 'rgba(239,233,216,0.34)' : 'rgba(239,233,216,0.72)',
      width: lineW * (darkCoat ? 0.5 : 0.72), alpha: A, jitter: 0.14, seed: seed + 7,
    }));
    // A single vertical value break reads as the two legs.
    if (rich) {
      push((p) => p.line([qHipL, qHipR], {
        color: 'rgba(239,233,216,0.22)', width: lineW * 0.6, alpha: A * 0.5,
        jitter: 0.12, seed: seed + 11, double: false,
      }));
    }
    // Arms: one line per side, drawn over the coat. Idle people get arms
    // hanging down; walkers get a swing.
    if (!moving && rich) {
      const handL = q(local(-0.26 * sc + lean, (hipY + shoulderY) * 0.46, 0.02 * sc));
      const handR = q(local(0.26 * sc + lean, (hipY + shoulderY) * 0.46, 0.02 * sc));
      if (handL) push((p) => p.line([qShL, handL], {
        color: 'rgba(239,233,216,0.5)', width: lineW * 0.65, alpha: A * 0.8,
        jitter: 0.12, seed: seed + 13, double: false,
      }));
      if (handR) push((p) => p.line([qShR, handR], {
        color: 'rgba(239,233,216,0.5)', width: lineW * 0.65, alpha: A * 0.8,
        jitter: 0.12, seed: seed + 17, double: false,
      }));
    } else if (moving && rich) {
      const handL = q(local(-0.30 * sc + lean, (hipY + shoulderY) * 0.52, -gait * 0.10 * sc));
      const handR = q(local(0.30 * sc + lean, (hipY + shoulderY) * 0.52, gait * 0.10 * sc));
      if (handL) push((p) => p.line([qShL, handL], {
        color: 'rgba(239,233,216,0.6)', width: lineW * 0.7, alpha: A * 0.85,
        jitter: 0.14, seed: seed + 13, double: false,
      }));
      if (handR) push((p) => p.line([qShR, handR], {
        color: 'rgba(239,233,216,0.6)', width: lineW * 0.7, alpha: A * 0.85,
        jitter: 0.14, seed: seed + 17, double: false,
      }));
    }

    // Head: pale disc with a dark rim or dark disc with a pale rim, alternating
    // by person. That single choice makes a row of people read.
    const paleHead = hash11(seed * 2.31) > 0.45;
    const headShape = r.ped.headShape;
    push((p) => {
      const rx = headShape === 'hood' ? headR * 1.25 : headShape === 'oval' ? headR * 0.92 : headR;
      const ry = headShape === 'hood' ? headR * 1.12 : headShape === 'oval' ? headR * 1.2 : headR * 0.98;
      p.ellipse(qHead.x, qHead.y, rx, ry, {
        fill: paleHead ? 'rgba(239,233,216,0.92)' : '#070909',
        stroke: paleHead ? 'rgba(7,9,9,0.9)' : PALETTE.ink,
        width: Math.max(0.5, lineW * 0.6), alpha: A,
      });
      if (headShape === 'hat' || headShape === 'cap') {
        const brim = headShape === 'hat' ? headR * 2.0 : headR * 1.3;
        p.line([[qHead.x - brim, qHead.y - headR * 0.5], [qHead.x + brim, qHead.y - headR * 0.5]], {
          color: PALETTE.ink, width: lineW * 0.7, alpha: A * 0.95,
          jitter: 0.12, seed: seed + 19, double: false,
        });
      }
    });

    // Accessories: sparse, only where they read.
    const acc = r.ped.accessory;
    if (rich && ['bag', 'briefcase', 'lunchbox'].includes(acc)) {
      const w = acc === 'briefcase' ? 0.20 : 0.16;
      const h = acc === 'briefcase' ? 0.16 : 0.22;
      const bagQ = projectAll(camera, [
        local(0.30 * sc, 0.78 * sc, 0.02), local((0.30 + w) * sc, 0.78 * sc, 0.02),
        local((0.30 + w) * sc, (0.78 - h) * sc, 0.02), local(0.30 * sc, (0.78 - h) * sc, 0.02),
      ]);
      if (bagQ) push((p) => p.poly(bagQ, {
        fill: 'rgba(239,233,216,0.24)', stroke: PALETTE.ink,
        width: lineW * 0.55, alpha: A * 0.95, jitter: 0.12, seed: seed + 29,
      }));
    } else if (rich && acc === 'backpack') {
      const bpQ = projectAll(camera, [
        local(-0.20 * sc, 1.10 * sc, -0.11 * sc), local(-0.30 * sc, 1.10 * sc, -0.11 * sc),
        local(-0.30 * sc, 0.74 * sc, -0.11 * sc), local(-0.20 * sc, 0.74 * sc, -0.11 * sc),
      ]);
      if (bpQ) push((p) => p.poly(bpQ, {
        fill: 'rgba(43,184,174,0.5)', stroke: PALETTE.ink,
        width: lineW * 0.55, alpha: A * 0.95, jitter: 0.12, seed: seed + 31,
      }));
    } else if (rich && acc === 'cane') {
      const tip = q(local(0.34 * sc, 0.02, 0.18 * sc));
      const hand = q(local(0.30 * sc + lean, (hipY + shoulderY) * 0.52, 0));
      if (tip && hand) push((p) => p.line([hand, tip], {
        color: 'rgba(239,233,216,0.75)', width: lineW * 0.5, alpha: A * 0.85,
        jitter: 0.1, seed: seed + 37, double: false,
      }));
    } else if (rich && acc === 'child') {
      const c0 = q(local(0.34 * sc, 0, -0.04 * sc));
      const c1 = q(local(0.34 * sc, 0.92 * sc, -0.04 * sc));
      if (c0 && c1) {
        push((p) => p.line([c0, c1], {
          color: 'rgba(239,233,216,0.72)', width: lineW * 0.85, alpha: A * 0.9,
          jitter: 0.14, seed: seed + 41, double: false,
        }));
        push((p) => p.ellipse(c1.x, c1.y - headR * 0.9, headR * 0.72, headR * 0.72, {
          fill: paleHead ? '#070909' : 'rgba(239,233,216,0.9)',
          stroke: PALETTE.ink, width: lineW * 0.5, alpha: A * 0.9,
        }));
      }
    } else if (rich && acc === 'balloon') {
      const bp = q(local(0.4 * sc, 1.72 * sc, 0.08 * sc));
      const hand = q(local(0.30 * sc + lean, (hipY + shoulderY) * 0.52, 0));
      if (bp && hand) {
        push((p) => p.line([hand, bp], {
          color: 'rgba(239,233,216,0.45)', width: lineW * 0.35, alpha: A * 0.7,
          jitter: 0.1, seed: seed + 39, double: false,
        }));
        push((p) => p.ellipse(bp.x, bp.y, headR * 1.15, headR * 1.4, {
          fill: accentColor(seed), stroke: '#0a0c0a', width: lineW * 0.45, alpha: A * 0.95,
        }));
      }
    }

    // Umbrella: a dome built from a rim ring, a mid ring and an apex, so it
    // reads as a dome from above instead of a floating disc.
    const umb = r.ped.hasUmbrella ? r.ped.umb : null;
    if (umb) {
      const rimN = umb.style === 'pointed' ? 8 : 9;
      const lift = r.ped.umbrellaLift || 1.0;
      const domeH = (umb.style === 'pointed' ? 0.40 : umb.style === 'flat' ? 0.22 : 0.30) * sc * lift;
      const rimH = 1.42 * sc * lift + bob;
      const radius = umb.radius * sc * 0.88;
      const tilt = (r.ped.umbrellaTilt + wind * 0.02) * sc * 1.15;
      const apex3 = local(tilt * 0.5, rimH + domeH, 0);
      const rimCenter3 = local(tilt * 0.22, rimH, 0);
      const rim3 = [], mid3 = [];
      for (let i = 0; i < rimN; i++) {
        const a = (i / rimN) * TAU;
        const rr = radius * (i % 2 ? 0.93 : 1.0);
        const sag = 0.045 * sc * Math.pow(Math.abs(Math.sin(a * rimN * 0.5)), 0.7);
        // Tilt the canopy plane, not just its apex: the rim then reads as a
        // leaning dome instead of a flat saucer.
        const h = rimH - sag + Math.cos(a) * tilt * 0.40;
        rim3.push(local(tilt * 0.2 + Math.cos(a) * rr, h, Math.sin(a) * rr));
        mid3.push(local(tilt * 0.42 + Math.cos(a) * rr * 0.46, h + domeH * 0.74, Math.sin(a) * rr * 0.46));
      }
      const qApex = q(apex3);
      const qRimCenter = q(rimCenter3);
      const qRim = projectAll(camera, rim3);
      const qMid = projectAll(camera, mid3);
      if (qApex && qRimCenter && qRim && qMid) {
        const lower = [], upper = [];
        for (let i = 0; i < rimN; i++) {
          const j = (i + 1) % rimN;
          lower.push([qRim[i], qRim[j], qMid[j], qMid[i]]);
          upper.push([qMid[i], qMid[j], qApex]);
        }
        push((p) => {
          p.polys(lower, { fill: umb.fill, alpha: A, jitter: 0.06 });
          p.polys(upper, { fill: umb.fill, alpha: A, jitter: 0.06 });
          // Shaded far half of the canopy: gives the dome a lit side and a dark
          // side even when it is seen almost edge-on.
          const far = [];
          for (let i = 0; i < rimN; i++) far.push(qRim[i]);
          p.line([qRim[0], qMid[Math.floor(rimN / 2)], qApex], {
            color: 'rgba(4,6,5,0.35)', width: Math.max(0.8, lineW * 1.1), alpha: A * 0.9,
            jitter: 0.08, seed: seed + 47, double: false,
          });
          // Rim and ribs: the canopy's structure.
          p.line(qRim.concat([qRim[0]]), {
            color: umb.stroke, width: Math.max(0.6, lineW * 0.8), alpha: A,
            jitter: 0.16, seed: seed + 49, double: false,
          });
          for (let i = 0; i < rimN; i += 3) {
            p.line([qRim[i], qApex], {
              color: umb.stroke, width: Math.max(0.4, lineW * 0.3),
              alpha: A * 0.45, jitter: 0.1, seed: seed + 53 + i, double: false,
            });
          }
        });
        // Stub stem just under the canopy. Anything longer turns the figure
        // into a lollipop and cuts the head in half.
        const hand = q(local(tilt * 0.22, rimH - 0.05 * sc, 0));
        if (hand) push((p) => p.line([qRimCenter, hand], {
          color: PALETTE.ink, width: Math.max(0.5, lineW * 0.5), alpha: A * 0.7,
          jitter: 0.08, seed: seed + 59, double: false,
        }));
      }
    }

    return {
      ped: r.ped, world: r.world, alpha: A, waiter: r.waiter,
      radius: r.radius, group: 'crowd',
      foot, feet: [qFootL, qFootR], unit: bodyPx / 52, depth: foot.depth,
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

function accentColor(seed) {
  const r = hash11(seed * 1.7);
  if (r < 0.34) return 'rgba(212,59,48,0.9)';
  if (r < 0.68) return 'rgba(43,184,174,0.9)';
  return 'rgba(239,233,216,0.85)';
}
