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
import { relax, poissonDisk } from './collision.js';
import { groundYAt, TILE } from './tile.js';
import { LOOP, boundaryAlpha } from './loop.js';

// The crowd fades at the back and side edges only. The front (+z) edge is the
// open face of the diorama and the near sidewalk runs along it — fading there
// would dim the whole foreground row.
const CROWD_BOX = { x0: TILE.x0, x1: TILE.x1, z0: TILE.z0, z1: TILE.z1 + 3.0 };
import {
  FLOWS, isOnSidewalk, clampToWorld, weightedWaitZone, STREET_PROPS,
  laneFlows, getWorld, pavementRuns,
} from './world.js';

// Walking pace for the flows that turn a corner, in m/s. A little under the
// crowd's mean: somebody walking round a corner is not in a hurry, and a
// slower pace is what makes the turn read as a turn instead of a swerve.
const CORNER_SPEED = 1.15;

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
// Coats have to sit a step above the pavement, or a dark figure reads as a
// floating head and a pair of white trouser lines.
const COATS = [
  '#1b201e', '#20261f', '#252b26', '#171b19', '#2b312d', '#12160f',
  'rgba(239,233,216,0.92)', 'rgba(239,233,216,0.88)', 'rgba(222,214,196,0.9)',
  'rgba(93,105,97,0.92)', 'rgba(58,66,62,0.95)',
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

// A rounded path through waypoints, walked at a constant pace.
//
// The waypoints are resampled by arc length and then smoothed, so the result is
// monotone in the distance travelled — a body never stalls at a waypoint and
// never jumps over one. Corners are rounded by smoothing in *space*, not by
// easing the parameter: easing shortens the stride at every waypoint, which
// reads as a stumble.
function pathTable(pts) {
  const RAW = 24;
  const raw = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    for (let k = 0; k < RAW; k++) {
      const f = k / RAW;
      const x = lerp(a.x, b.x, f), z = lerp(a.z, b.z, f);
      if (raw.length) total += Math.hypot(x - raw[raw.length - 1].x, z - raw[raw.length - 1].z);
      raw.push({ x, z, s: total });
    }
  }
  const last = pts[pts.length - 1];
  total += Math.hypot(last.x - raw[raw.length - 1].x, last.z - raw[raw.length - 1].z);
  raw.push({ x: last.x, z: last.z, s: total });
  // Smooth, keeping the ends pinned: this is what rounds the corners.
  const R = 6;
  const sm = raw.map((p, i) => {
    if (i < 2 || i > raw.length - 3) return { ...p };
    let sx = 0, sz = 0, n = 0;
    for (let k = -R; k <= R; k++) {
      const q = raw[clamp(i + k, 0, raw.length - 1)];
      sx += q.x; sz += q.z; n++;
    }
    return { x: sx / n, z: sz / n, s: p.s };
  });
  return { pts: sm, total };
}

function alongPath(table, dist) {
  const { pts, total } = table;
  const d = clamp(dist, 0, total);
  let k = 1;
  while (k < pts.length - 1 && pts[k].s < d) k++;
  const a = pts[k - 1], b = pts[k];
  const span = b.s - a.s;
  const f = span < 1e-9 ? 0 : clamp((d - a.s) / span, 0, 1);
  return { x: lerp(a.x, b.x, f), z: lerp(a.z, b.z, f) };
}

function chooseFlow(rng, flows = FLOWS) {
  let r = rng.next();
  for (const f of flows) {
    if (r < f.weight) return f;
    r -= f.weight;
  }
  return flows[flows.length - 1];
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
    // Which side of the pavement they keep. Two people on the same path with
    // different lanes pass each other instead of colliding, which is most of
    // what makes a crowd read as natural.
    lane: rng.range(-0.30, 0.30),
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
    // The crowd is no longer a single tile's crowd. Everything outside the
    // centre tile used to be faded to nothing by the wrap box, which is exactly
    // why the neighbourhood looked empty. The fade now follows the built set.
    const w = getWorld();
    this.box = w && w.tiles && w.tiles.length
      ? {
        x0: Math.min(...w.tiles.map((t) => t.x0)),
        x1: Math.max(...w.tiles.map((t) => t.x1)),
        z0: Math.min(...w.tiles.map((t) => t.z0)),
        z1: Math.max(...w.tiles.map((t) => t.z1)) + 3.0,
      }
      : CROWD_BOX;
    // The stage flows carry the crossings and the corner, and they are what the
    // hero shot reads. Every other pavement in the set is walked too, derived
    // from the built tiles, so the crowd is not pinned to one street when the
    // world grows. Lanes take a minority share and the stage keeps the rest.
    const lanes = laneFlows(getWorld());
    // Split the budget rather than the weights: the stage keeps exactly the
    // crowd it had before, and the lanes add roughly one walker per pavement
    // (each pavement has a lane per direction, so a lane gets about half a
    // person and the two directions share it). Weighting the lanes as a
    // fraction of N instead rounded every one of them to zero walkers.
    const stageN = 34 * this.density;
    const laneN = Math.min(lanes.length, 44) * this.density;
    const N = Math.round(stageN + laneN);
    const flows = [
      ...FLOWS.map((f) => ({ ...f, weight: (f.weight * stageN) / N })),
      ...lanes.map((f) => ({ ...f, weight: laneN / Math.max(1, lanes.length) / N })),
    ];
    this.flows = flows;
    this.crossers = [];
    // A body that is placed inside a lamp post can never be resolved by the
    // solver: it just gets shoved back and forth. So the scatter already keeps
    // clear of the furniture.
    const nearProp = (x, z, pad) => {
      for (const o of STREET_PROPS) {
        const dx = x - o.x, dz = z - o.z;
        const rr = o.r + pad;
        if (dx * dx + dz * dz < rr * rr) return true;
      }
      return false;
    };
    this._nearProp = nearProp;

    // Largest-remainder allocation: with ~58 flows and ~80 walkers, plain
    // `floor(N * weight)` leaves a third of the streets with nobody on them.
    // Handing the leftover people to the largest fractional parts keeps every
    // pavement occupied without changing the stage's density.
    const wanted = flows.map((f) => N * f.weight);
    const counts = wanted.map((w) => Math.floor(w));
    let spare = N - counts.reduce((a, b) => a + b, 0);
    const order = wanted
      .map((w, i) => ({ i, frac: w - Math.floor(w) }))
      .sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < spare && order.length; k++) counts[order[k % order.length].i]++;

    const specs = [];
    for (let fi = 0; fi < flows.length; fi++) {
      const f = flows[fi];
      if (!counts[fi]) continue;
      const pts = poissonDisk(counts[fi], f.bounds, 0.92, rng, (x, z) => isOnSidewalk(x, z) && !nearProp(x, z, 0.52));
      for (const pt of pts) specs.push({ flow: f, start: pt });
    }
    let guard = 0;
    while (specs.length < N && guard++ < N * 6) {
      const f = chooseFlow(rng, flows);
      const x = rng.range(f.bounds.x0, f.bounds.x1);
      const z = rng.range(f.bounds.z0, f.bounds.z1);
      if (isOnSidewalk(x, z) && !nearProp(x, z, 0.52)) specs.push({ flow: f, start: { x, z } });
    }
    for (let i = 0; i < specs.length; i++) {
      const { flow, start } = specs[i];
      // A corner flow is a waypoint path, absolute in the cell: the pavement it
      // turns on is in the same place for everyone. The first point is the
      // walker's own start, so the fan of people still reads as a crowd, and
      // the last leg gives the walk-on direction.
      const via = flow.via ? [{ x: start.x, z: start.z }, ...flow.via.map((v) => ({ x: v.x, z: v.z }))] : null;
      const end = via
        ? { x: via[via.length - 1].x, z: via[via.length - 1].z }
        : { x: start.x + flow.delta.x, z: start.z + flow.delta.z };
      const lastA = via ? via[via.length - 2] : start;
      const dir = norm3(v3(end.x - lastA.x, 0, end.z - lastA.z));
      const side = { x: -dir.z, z: dir.x };
      const bend = (flow.bend || 0) + rng.range(-0.9, 0.9);
      const ctrl = {
        x: (start.x + end.x) / 2 + side.x * bend,
        z: (start.z + end.z) / 2 + side.z * bend,
      };
      // Where this person comes from: a few metres along the pavement, on the
      // side they would have walked from. A short walk-in at walking pace —
      // starting them at the far edge of the tile made them sprint.
      const sign = start.x > 0 ? 1 : -1;
      const room = sign > 0 ? TILE.x1 - 0.6 - start.x : start.x - (TILE.x0 + 0.6);
      const reach = Math.max(1.6, Math.min(4.6, room));
      const approach = {
        x: start.x + sign * reach,
        z: start.z + rng.range(-0.15, 0.15),
      };
      const adx = start.x - approach.x, adz = start.z - approach.z;
      const al = Math.hypot(adx, adz) || 1;
      this.crossers.push(makePerson(rng, i, {
        start, end, ctrl, dir, side, kind: flow.kind, flow: flow.id,
        approach, approachDir: { x: adx / al, z: adz / al },
        // A single bezier from the near pavement to the side street cuts the
        // corner straight across the road, which is the one thing a pedestrian
        // never does; these flows carry absolute waypoints instead, walked at
        // a constant pace through a rounded path.
        table: via ? pathTable(via) : null,
        pathLength: via
          ? via.reduce((acc, p, k) => (k ? acc + Math.hypot(p.x - via[k - 1].x, p.z - via[k - 1].z) : 0), 0)
          : Math.hypot(flow.delta.x, flow.delta.z) + Math.abs(bend) * 0.35,
        delay: clamp((Math.abs(start.x) - 7) / 12, 0, 1) * 0.16 + rng.range(0, 0.30),
        // A stroll keeps to its own pavement band for the whole walk. The band
        // is what makes the pavement a place with lanes instead of an open
        // plane: without it the bezier's bend and the walk-on drift carry
        // people into the furniture line, and the solver then has to steer them
        // out, which is the one job it does badly.
        // A stroll keeps to its own pavement band for the whole walk. Bands are
        // axis-aware: a lane running north-south keeps to an x band, one
        // running east-west to a z band.
        band: flow.kind === 'stroll'
          ? (flow.band
            ? { axis: flow.band.axis, a0: flow.band.a0, a1: flow.band.a1 }
            : { axis: 'z', a0: flow.bounds.z0 - 0.12, a1: flow.bounds.z1 + 0.12 })
          : null,
      }));
    }

    // Strollers: one per pavement frontage, walking its own stretch back and
    // forth. Each keeps its own phase, pace and turnaround, and every one
    // completes whole cycles per loop, so the picture is identical at 0 and 20 s
    // while no two people move together.
    const runs = pavementRuns(getWorld());
    const perRun = 1 + Math.round((this.density - 1) * 0.8);
    this.strollers = [];
    for (const run of runs) {
      for (let k = 0; k < perRun; k++) {
        // A sub-stretch of this frontage, so two people on the same pavement
        // are not shadowing each other.
        const share = run.len >= 12 ? 0.62 : 0.98;
        const mid = 0.3 + rng.range(0.1, 0.4);
        const half = (share * run.len) / 2;
        const ux = (run.b.x - run.a.x) / run.len, uz = (run.b.z - run.a.z) / run.len;
        const c = { x: run.a.x + ux * run.len * mid, z: run.a.z + uz * run.len * mid };
        const a = { x: c.x - ux * half, z: c.z - uz * half };
        const b = { x: c.x + ux * half, z: c.z + uz * half };
        // Whole round trips per 20 s loop, chosen so the walk stays near a
        // human pace instead of sprinting a whole block.
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        this.strollers.push(makePerson(rng, 20000 + this.strollers.length, {
          kind: 'stroll', flow: run.id,
          span: { a, b, len, axis: run.ax },
          cycles: 1,
          // Phase is a free start point along the round trip: this is the
          // "own cyclical loop" of the walker.
          phase2: rng.range(0, 1),
          dir: { x: ux, z: uz }, side: { x: -uz, z: ux },
          lane: rng.range(-0.12, 0.12),
        }));
      }
    }

    const M = Math.round(18 * this.density);
    this.waiters = [];
    for (let i = 0; i < M; i++) {
      const zone = weightedWaitZone(rng);
      const pts = poissonDisk(1, zone, 0.86, rng, (x, z) => isOnSidewalk(x, z) && !nearProp(x, z, 0.50));
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
    this.timeline = timeline;
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
    // Half-width of the sampling window used to work out a heading, in loop
    // phase. 0.02 = 0.4 s at the 20 s loop: long enough to average out the
    // sway, short enough that a corner still reads as a corner.
    const TURN = 0.02;
    const raw = [];

    for (const ped of [...this.crossers, ...(this.strollers || [])]) {
      // Wherever this person is, they are somewhere on one continuous walk.
      // Sampling the path a fraction of a second either side of now gives a
      // heading that turns BEFORE the corner instead of snapping to a new
      // direction when they get there — the difference between walking and
      // hovering. Everything stays a pure function of `u`, so the loop still
      // lands on exactly the same frame at 0 and 20 s.
      const now = this._crosserAt(ped, u, motionT);
      const back = this._crosserAt(ped, Math.max(0, u - TURN), motionT);
      const fwd = this._crosserAt(ped, Math.min(1, u + TURN), motionT);
      let hx = fwd.x - back.x, hz = fwd.z - back.z;
      const hs = Math.hypot(hx, hz);
      const look = this._facing(ped, u);
      let dir;
      if (hs > 1e-5) {
        hx /= hs; hz /= hs;
        // Blend out of the resting pose as they start moving.
        const w = clamp(hs / 0.09, 0, 1);
        const bx = look.x * (1 - w) + hx * w;
        const bz = look.z * (1 - w) + hz * w;
        const bl = Math.hypot(bx, bz) || 1;
        dir = { x: bx / bl, z: bz / bl };
      } else {
        dir = look;
      }
      const side = { x: -dir.z, z: dir.x };
      const world = { x: now.x, z: now.z };
      const moving = now.moving;
      const distance = now.distance;
      const alpha = now.alpha * boundaryAlpha(world.x, world.z, this.box || CROWD_BOX, buffer, 'fade');
      const stridePhase = ped.phase + (moving
        ? distance / (ped.strideLen * ped.scale * ped.gait) * TAU * tempo
        : osc(2, ped.phase) * 0.10);
      raw.push({
        ped, world, alpha, dir, side, scale: ped.scale,
        stridePhase, moving, waiter: false, radius: 0.30 * ped.scale,
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
        ped: w, world, alpha: 0.92 * boundaryAlpha(world.x, world.z, this.box || CROWD_BOX, buffer, 'fade'),
        dir: w.dir, side: w.side, scale: w.scale,
        stridePhase: w.phase + osc(2, w.phase) * 0.08,
        moving: false, waiter: true, radius: 0.30 * w.scale,
        group: 'crowd', fixed: false,
      });
    }

    for (const r of raw) { r.base = { x: r.world.x, z: r.world.z }; }
    // 1) Walk around the street furniture first: a person steering past a lamp
    //    post is the clearest signal that the crowd is alive.
    for (const r of raw) r.dir = r.dir || { x: 0, z: 1 };
    // Lane offset is along the flow's own side vector, never the current
    // heading: a heading that turns at the kerb must not swing the body
    // sideways by half a metre.
    for (const r of raw) {
      if (r.waiter || !r.ped.lane) continue;
      r.world.x += r.ped.side.x * r.ped.lane;
      r.world.z += r.ped.side.z * r.ped.lane;
    }
    const fixedProps = [];
    for (const o of STREET_PROPS) {
      fixedProps.push({ world: { x: o.x, z: o.z }, radius: o.r, alpha: 1, fixed: true, group: 'prop' });
    }
    for (const o of obstacles) {
      // Vehicles are long: approximate one as a row of small discs along its
      // own axis. A single big disc reaches across the pavement beside a parked
      // car, which is where the worst crowd pops came from.
      const half = o.half == null ? 1.6 : o.half;
      const across = o.across == null ? 0.95 : Math.max(0.7, o.across);
      const steps = Math.max(1, Math.ceil(half / across));
      for (let k = 0; k <= steps; k++) {
        const f = steps === 0 ? 0 : (k / steps) * 2 - 1;
        fixedProps.push({
          world: o.axis === 'z'
            ? { x: o.world.x, z: o.world.z + f * half }
            : { x: o.world.x + f * half, z: o.world.z },
          radius: across, alpha: 1, fixed: true, group: 'vehicle',
        });
      }
    }
    if (fixedProps.length) {
      // Only pedestrians move here, and only against the furniture: mixing the
      // two groups into one solve lets a passer-by block someone's escape from
      // a bench and flips the push from one side to the other between frames.
      relax([...raw, ...fixedProps], {
        iterations: 3, padding: 0.22, lateral: 0.5, strength: 0.9,
        damp: 0.7, maxOffset: 0.4, onlyDifferentGroups: true,
      });
    }
    // 2) Then the crowd against itself, and a single clamp to the volume. The
    //    clamp is applied once, after the solver, so a push at the kerb is not
    //    undone and re-applied every iteration (that is what used to make the
    //    edges of the crowd buzz).
    relax(raw, {
      // One pass from the base positions: the push is then a continuous
      // function of where people are standing, which is what keeps the motion
      // smooth frame to frame. Iterating on each other's offsets makes the
      // solution flip when a knot of people is tight.
      iterations: 1, padding: 0.02, lateral: 0.6, strength: 0.9, damp: 1,
      maxOffset: 0.18,
      bounds: { x0: TILE.x0 + 0.9, x1: TILE.x1 - 0.9, z0: TILE.z0 + 0.9, z1: TILE.z1 - 0.9 },
    });
    for (const r of raw) {
      const c = clampToWorld(r.world, 0.9);
      // Someone steering around a neighbour must not be pushed off the kerb:
      // if they started on a pavement, they stay on it. Crossing people are
      // already on the road and are left alone.
      if (isOnSidewalk(r.base.x, r.base.z) && !isOnSidewalk(c.x, c.z)) {
        const dx = c.x - r.base.x, dz = c.z - r.base.z;
        let k = 1;
        for (let step = 0.85; step > 0.05; step -= 0.1) {
          if (isOnSidewalk(r.base.x + dx * step, r.base.z + dz * step)) { k = step; break; }
        }
        c.x = r.base.x + dx * k;
        c.z = r.base.z + dz * k;
      }
      r.world.x = c.x; r.world.z = c.z;
    }

    // Kept for the motion check in tools/ and for the stats HUD: the resolved
    // positions of this frame, before the draw list is built.
    this.lastPositions = raw.map((r) => ({
      id: r.ped.id, x: r.world.x, z: r.world.z, bx: r.base.x, bz: r.base.z,
      moving: r.moving, alpha: r.alpha, kind: r.ped.kind, flow: r.ped.flow,
      waiter: r.waiter,
    }));

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

  // Keep a walker inside its pavement band, whichever axis that band runs on.
  _inBand(x, z, band) {
    if (!band) return { x, z };
    if (band.axis === 'x') return { x: clamp(x, band.a0, band.a1), z };
    return { x, z: clamp(z, band.a0, band.a1) };
  }

  // A pavement stroller: back and forth along one frontage, forever.
  //
  // The motion is a scaled smoothstep on each leg, so a walker eases to a stop
  // at the end of the stretch, turns, and strolls back — no snap, no teleport,
  // and no fade, because they never leave the world. `cycles` round trips fit
  // exactly inside one 20 s loop, and `phase2` decides where in that rhythm
  // this particular person started, so everybody keeps their own clock.
  _strollerAt(ped, u, motionT) {
    const { a, b, len } = ped.span;
    const t = ((u * ped.cycles + ped.phase2) % 1 + 1) % 1;
    const legT = (t * 2) % 1;                    // 0..1 up the stretch, then back
    const outbound = t < 0.5;
    const f = outbound ? legT : 1 - legT;
    const sm = smootherstep(0, 1, f);
    const waddle = Math.sin((TAU * 4 * motionT) / LOOP + ped.phase) * 0.03;
    const sx = ped.side ? ped.side.x * waddle : 0;
    const sz = ped.side ? ped.side.z * waddle : 0;
    // Speed falls to zero at both ends of the stretch: 30 f² (1-f)² is the
    // derivative of smootherstep, scaled by the stretch length and the time it
    // takes to cover one leg.
    const speed = (30 * f * f * (1 - f) * (1 - f)) * (len / (LOOP / ped.cycles / 2));
    return {
      x: lerp(a.x, b.x, sm) + sx,
      z: lerp(a.z, b.z, sm) + sz,
      moving: speed > 0.12,
      // Cumulative distance keeps the stride running forwards on both legs;
      // rewinding it would walk the feet backwards on the way home.
      distance: len * (Math.floor(t * 2) + sm),
      alpha: 1,
    };
  }

  // The path, as a pure function of the loop phase. `u` is timeline.u.
  _crosserAt(ped, u, motionT) {
    const sway = (ph) => Math.sin((TAU * 2 * motionT) / LOOP + ph) * 0.055;
    if (ped.span) return this._strollerAt(ped, u, motionT);
    if (u < 0.18) {
      // Walk in along the sidewalk from the cell seam. They start exactly on
      // the boundary, so the neighbour cell's people can continue the flow
      // when the set is tiled.
      const k = smootherstep(0.0, 0.17, u);
      const idle = Math.sin((TAU * 2 * motionT) / LOOP + ped.phase) * 0.07;
      return {
        x: lerp(ped.approach.x, ped.start.x + idle * k, k),
        z: lerp(ped.approach.z, ped.start.z, k) + sway(ped.phase + 1.57) * k,
        moving: k > 0.02 && k < 0.985,
        distance: k * Math.abs(ped.approach.x - ped.start.x),
        // They walk in from the boundary plane, so they fade there and not in
        // the middle of the pavement.
        alpha: smoothstep(0.0, 0.03, u),
      };
    }
    // A corner flow walks its own waypoints at a constant pace instead of the
    // crossing's eased parameter. The eased curve is tuned for a straight 12 m
    // crossing; on an 18 m path through a corner it peaked at 3.5 m/s and the
    // body read as jogging, so this branch covers a fixed distance per second
    // and simply stops at the end of the path when the loop phase runs out.
    if (ped.table) {
      const travelled = Math.max(0, (u - 0.18) * LOOP) * CORNER_SPEED;
      const w = alongPath(ped.table, travelled);
      const sw = Math.sin((TAU * 4 * motionT) / LOOP + ped.phase) * 0.04;
      const done = travelled >= ped.table.total;
      return {
        x: w.x + ped.side.x * sw,
        z: w.z + ped.side.z * sw,
        moving: !done,
        distance: travelled,
        alpha: 1 - smoothstep(0.74, 0.80, u),
      };
    }
    const s = this.timeline.crossAt(ped.delay * ped.pace, u);
    if (s < 0.999) {
      const w = bezier2(ped.start, ped.ctrl, ped.end, s);
      const sw = Math.sin((TAU * 4 * motionT) / LOOP + ped.phase) * 0.04;
      const kept = this._inBand(w.x + ped.side.x * sw, w.z + ped.side.z * sw, ped.band);
      return {
        x: kept.x,
        z: kept.z,
        moving: true,
        distance: s * ped.pathLength,
        // Walk out into the far pavement, then dissolve before the wrap.
        alpha: 1 - smoothstep(0.74, 0.80, u),
      };
    }
    // Off the crossing and up the far pavement towards the shop windows, where
    // they dissolve. Walking on is what makes the crossing look like a place
    // people go to rather than a stage they step off.
    // `drainAt` is already running when the crossing finishes, so it is
    // measured from that moment: the walk-on starts at zero instead of
    // teleporting the body forward by however far the drain has travelled.
    const db = 0.66 + ped.delay * ped.pace * 0.055;
    const d0 = this.timeline.drainAt(Math.min(0.999, db));
    const d = Math.max(0, this.timeline.drainAt(u) - d0)
      * (ped.kind === 'stroll' ? 2.6 : 3.4);
    const kept = this._inBand(ped.end.x + ped.dir.x * d, ped.end.z + ped.dir.z * d, ped.band);
    return {
      x: kept.x,
      z: kept.z,
      moving: d > 0.001 && u < 0.82,
      distance: ped.pathLength + d,
      alpha: 1 - smoothstep(0.755, 0.815, u),
    };
  }

  // Which way a standing person is facing: along the walk on the approach, then
  // turned towards the crossing as they arrive at the kerb.
  _facing(ped, u) {
    if (u < 0.17 && ped.approachDir) {
      const t = smootherstep(0.09, 0.17, u);
      const x = ped.approachDir.x * (1 - t) + ped.dir.x * t;
      const z = ped.approachDir.z * (1 - t) + ped.dir.z * t;
      const l = Math.hypot(x, z) || 1;
      return { x: x / l, z: z / l };
    }
    return ped.dir;
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

    // Proportions of a 1.72 m adult, times the person's scale. The head sits
    // clear above the shoulders; if it rests on them the figure reads as a
    // lollipop no matter how well it is drawn.
    const hipY = (shape === 'long' ? 0.86 : shape === 'short' ? 1.02 : 0.94) * sc + bob;
    const shoulderY = 1.42 * sc + bob;
    const headY = 1.58 * sc + bob;
    const footY = 0.015;
    const shoulderHalf = (shape === 'hood' ? 0.24 : shape === 'A' ? 0.18 : 0.21) * sc;
    const hipHalf = (shape === 'A' ? 0.26 : shape === 'short' ? 0.15 : 0.17) * sc;
    const strideWide = moving ? gait * 0.13 * sc : 0.03 * sc;

    const shL3 = local(-shoulderHalf + lean, shoulderY, 0);
    const shR3 = local(shoulderHalf + lean, shoulderY, 0);
    const hipL3 = local(-hipHalf + lean * 0.4, hipY, 0);
    const hipR3 = local(hipHalf + lean * 0.4, hipY, 0);
    const footL3 = local(-0.09 * sc + lean * 0.3, footY, strideWide);
    const footR3 = local(0.09 * sc + lean * 0.3, footY, -strideWide);
    const head3 = local(lean * 0.75, headY, 0);

    const qShL = q(shL3), qShR = q(shR3);
    const qHipL = q(hipL3), qHipR = q(hipR3);
    const qFootL = q(footL3), qFootR = q(footR3);
    const qHead = q(head3);
    if (!qShL || !qShR || !qHipL || !qHipR || !qFootL || !qFootR || !qHead) return null;

    // Screen size drives every detail size. This is the scale trap the earlier
    // build fell into: heads and lines were sub-pixel and people became an X.
    const bodyPx = Math.max(4, (qFootL.y + qFootR.y) / 2 - qHead.y);
    const headR = Math.max(1.0, bodyPx * 0.074);
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
    // Procedural LoD for figures: below ~24 px of body height a person is a
    // silhouette, a head and a hint of accessories. Anything finer is
    // sub-pixel work that cannot be seen.
    const fine = bodyPx > 24;

    // Shadow: a short soft ellipse, not a hole in the ground.
    if (fine) push((p) => {
      p.ellipse(foot.x, foot.y + Math.max(0.6, bodyPx * 0.035), Math.max(1.6, bodyPx * 0.22), Math.max(0.7, bodyPx * 0.075), {
        fill: 'rgba(0,0,0,0.58)', stroke: false, alpha: A * 0.4,
      });
    });

    // Coat silhouette: shoulders → hem, then two legs below it. A single
    // triangle down to the ankles reads as a wizard's robe; the hem line and
    // the separate legs are what make it read as a person.
    const hemY = (shape === 'long' ? hipY - 0.26 * sc : hipY - 0.08 * sc) + bob * 0.2;
    const hemL3 = local(-hipHalf * 0.94 + lean * 0.4, hemY, 0);
    const hemR3 = local(hipHalf * 0.94 + lean * 0.4, hemY, 0);
    const qHemL = q(hemL3);
    const qHemR = q(hemR3);
    if (!qHemL || !qHemR) return null;
    // Legs first, so the coat sits over the top of them.
    if (fine) {
      push((p) => p.line([qHemL, qFootL], {
        color: r.ped.coat, width: Math.max(1.2, bodyPx * 0.055), alpha: A,
        jitter: 0.1, seed: seed + 31, double: false,
      }));
      push((p) => p.line([qHemR, qFootR], {
        color: r.ped.coat, width: Math.max(1.2, bodyPx * 0.055), alpha: A,
        jitter: 0.1, seed: seed + 33, double: false,
      }));
    }
    const silhouette = [qShL, qShR, qHemR, qFootR, qFootL, qHemL];
    push((p) => p.poly(silhouette, {
      fill: r.ped.coat,
      stroke: darkCoat ? 'rgba(239,233,216,0.34)' : 'rgba(239,233,216,0.72)',
      width: lineW * (darkCoat ? 0.5 : 0.72), alpha: A, jitter: 0.14, seed: seed + 7,
    }));
    // The hem: one line across the coat, so the legs read as legs.
    if (rich) {
      push((p) => p.line([qHemL, qHemR], {
        color: 'rgba(239,233,216,0.20)', width: lineW * 0.55, alpha: A * 0.55,
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
      const rimN = fine ? (umb.style === 'pointed' ? 8 : 9) : 6;
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
          if (fine) p.polys(upper, { fill: umb.fill, alpha: A, jitter: 0.06 });
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
