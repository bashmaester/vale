// Vehicles are built as 3D extruded side profiles rather than plain boxes:
// one silhouette polygon in the (along, up) plane, extruded across the width.
// That reads as a car — wheels, bonnet, cabin, tail — instead of a crate,
// while staying fully procedural and projected through the same camera.
//
// Two vehicles sit legally at the kerbs, two move in their own lanes during the
// traffic beat, and a short train passes on the elevated line behind the block.

import { PALETTE, glowAt } from './draw.js';
import { v3, clamp, lerp, easeInOut, quadLerp, smoothstep, smootherstep } from './math.js';
import { separate } from './collision.js';
import { TILE } from './tile.js';
import { HALF_ROAD } from './tiles.js';
import { LOOP, loopFrac, wrapRange, boundaryAlpha } from './loop.js';
import { makeRng } from './math.js';
import {
  ROAD, LANES, CROSSWALKS, getWorld, blockCircuits, circuitPoint, circuitStops,
} from './world.js';

const BONE = (a) => `rgba(239,233,216,${a})`;

// Profiles are normalised: x along the body from -1 (rear) to 1 (front),
// y in world units from the road surface. Different kinds share one wheel base.
const PROFILES = {
  car: {
    w: 4.3, d: 1.85, wheelR: 0.36, wheelAt: 0.62, weight: 1.0,
    body: [
      [-1.00, 0.44], [-1.00, 0.92], [-0.66, 1.06], [-0.50, 1.50],
      [0.12, 1.54], [0.42, 1.14], [0.86, 1.04], [1.00, 0.86],
      [1.00, 0.44], [0.80, 0.34], [-0.80, 0.34],
    ],
    windows: [[-0.46, 1.10], [-0.34, 1.44], [0.04, 1.46], [0.30, 1.12]],
    trim: 1.02,
  },
  van: {
    w: 4.7, d: 1.95, wheelR: 0.40, wheelAt: 0.64, weight: 1.15,
    body: [
      [-1.00, 0.50], [-1.00, 1.86], [-0.72, 1.94], [0.46, 1.90],
      [0.74, 1.42], [0.96, 1.16], [1.00, 0.60], [1.00, 0.44],
      [0.78, 0.38], [-0.78, 0.38],
    ],
    windows: [[0.30, 1.16], [0.44, 1.68], [0.62, 1.66], [0.84, 1.18]],
    trim: 1.05,
  },
  taxi: {
    w: 4.3, d: 1.85, wheelR: 0.36, wheelAt: 0.62, weight: 1.0,
    body: [
      [-1.00, 0.44], [-1.00, 0.94], [-0.64, 1.08], [-0.48, 1.54],
      [0.14, 1.56], [0.44, 1.16], [0.86, 1.06], [1.00, 0.88],
      [1.00, 0.44], [0.80, 0.34], [-0.80, 0.34],
    ],
    windows: [[-0.44, 1.12], [-0.32, 1.46], [0.06, 1.48], [0.32, 1.14]],
    trim: 1.02,
  },
  bus: {
    w: 6.4, d: 2.2, wheelR: 0.46, wheelAt: 0.70, weight: 1.35,
    body: [
      [-1.00, 0.46], [-1.00, 2.42], [-0.80, 2.52], [0.80, 2.52],
      [0.98, 2.30], [1.00, 1.10], [0.92, 0.72], [1.00, 0.46],
      [0.82, 0.40], [-0.82, 0.40],
    ],
    windows: [[-0.86, 1.52], [-0.86, 2.16], [0.86, 2.16], [0.86, 1.46]],
    band: true,
    trim: 1.1,
  },
};

function axisPoint(world, spec, along, lateral, y) {
  return spec.axis === 'z'
    ? v3(world.x + lateral, y, world.z + along)
    : v3(world.x + along, y, world.z + lateral);
}

// Sample the profile at a normalised x for the lower/upper bounds. Profiles are
// convex enough that a piecewise-linear fill over the listed vertices is exact.
function profilePoints(prof, world, spec, lateral, scaleX = 1) {
  return prof.body.map(([px, py]) => axisPoint(world, spec, px * prof.w * 0.5 * scaleX, lateral, py));
}

function projectRing(camera, pts3) {
  const out = [];
  for (const p of pts3) {
    const q = camera.project(p);
    if (!q) return null;
    out.push([q.x, q.y]);
  }
  return out;
}

function wheels(p, camera, world, spec, prof, alpha) {
  const r = prof.wheelR;
  for (const side of [-1, 1]) {
    for (const ax of [-prof.wheelAt, prof.wheelAt]) {
      const c = axisPoint(world, spec, ax * prof.w * 0.5, side * prof.d * 0.46, r);
      const top = axisPoint(world, spec, ax * prof.w * 0.5, side * prof.d * 0.46, r * 2);
      const qc = camera.project(c), qt = camera.project(top);
      if (!qc || !qt) continue;
      const rr = Math.max(1.1, Math.abs(qc.y - qt.y));
      p.ellipse(qc.x, qc.y, rr, rr * 0.94, {
        fill: '#08090c', stroke: BONE(side > 0 ? 0.72 : 0.38), width: side > 0 ? 0.95 : 0.6, alpha,
      });
      if (side > 0) {
        p.ellipse(qc.x, qc.y, rr * 0.36, rr * 0.32, {
          stroke: BONE(0.5), width: 0.55, alpha: alpha * 0.9,
        });
        // Hub cross.
        for (let k = 0; k < 2; k++) {
          const a = k * Math.PI / 2 + 0.4;
          p.line([
            [qc.x - Math.cos(a) * rr * 0.5, qc.y - Math.sin(a) * rr * 0.5],
            [qc.x + Math.cos(a) * rr * 0.5, qc.y + Math.sin(a) * rr * 0.5],
          ], { color: BONE(0.32), width: 0.5, alpha: alpha * 0.8, jitter: 0.1, seed: 11 + k, double: false });
        }
      }
    }
  }
}

export function drawVehicle(p, camera, item) {
  const { spec, world, alpha } = item;
  if (alpha < 0.02) return;
  const prof = PROFILES[spec.type] || PROFILES.car;
  const fs = spec.dir > 0 ? 1 : -1;
  const flip = { ...spec, dir: 1 };
  const seed = 7 + prof.w * 3.1;

  // Contact shadow on the wet road: the vehicle's own footprint, projected,
  // with the corners pulled in a little. A car is a box, so its shadow is a
  // quad - an ellipse reads as a balloon under the wheels.
  const shx = prof.w * 0.5, shz = prof.d * 0.5;
  const sha = spec.dir > 0 ? 0.16 : -0.16;
  p.projectPoly(camera, [
    v3(world.x - shx + sha, 0.016, world.z - shz + 0.05),
    v3(world.x + shx + sha, 0.016, world.z - shz + 0.05),
    v3(world.x + shx + sha, 0.016, world.z + shz - 0.05),
    v3(world.x - shx + sha, 0.016, world.z + shz - 0.05),
  ], { fill: 'rgba(0,0,0,0.55)', stroke: false, alpha: alpha * 0.75, jitter: 0.3, seed: seed + 90 });

  wheels(p, camera, world, spec, prof, alpha);

  const nearLat = prof.d * 0.5;
  const farLat = -prof.d * 0.5;
  const near3 = profilePoints(prof, world, spec, nearLat);
  // Mirror the profile along the travel axis for left-bound vehicles. The axis
  // matters: a car heading -z mirrored about x would face the wrong way.
  const mirror = (pts) => pts.map((q) => {
    if (fs > 0) return q;
    return spec.axis === 'z'
      ? v3(q.x, q.y, 2 * world.z - q.z)
      : v3(2 * world.x - q.x, q.y, q.z);
  });
  const nearQ = projectRing(camera, mirror(near3));
  const farQ = projectRing(camera, mirror(profilePoints(prof, world, spec, farLat)));
  if (!nearQ || !farQ) return;

  // Far face first, darker: it is in shadow.
  p.poly(farQ, {
    gradient: [[0, 'rgba(34,39,44,0.95)'], [1, 'rgba(9,12,14,0.95)']],
    stroke: BONE(0.32), width: 0.7, alpha: alpha * 0.9,
    jitter: 0.16, seed: seed + 1,
  });

  // Bridge the top and bottom edges between the two faces so the body is solid.
  const n = prof.body.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = prof.body[i], b = prof.body[j];
    const isSideEdge = Math.abs(a[1] - b[1]) < 0.001 && (i === n - 1 || j === 0);
    if (!isSideEdge && Math.abs(a[0] - b[0]) < 0.4 && a[1] < 0.6) continue;
    const q = projectRing(camera, mirror([
      axisPoint(world, spec, a[0] * prof.w * 0.5, nearLat, a[1]),
      axisPoint(world, spec, b[0] * prof.w * 0.5, nearLat, b[1]),
      axisPoint(world, spec, b[0] * prof.w * 0.5, farLat, b[1]),
      axisPoint(world, spec, a[0] * prof.w * 0.5, farLat, a[1]),
    ]));
    if (!q) continue;
    p.poly(q, {
      fill: a[1] > 1.0 ? 'rgba(34,38,42,0.95)' : 'rgba(18,21,24,0.95)',
      stroke: BONE(0.28), width: 0.55, alpha: alpha * 0.85,
      jitter: 0.14, seed: seed + 4 + i,
    });
  }

  // Near face: the readable silhouette. A slightly lighter body plus a bright
  // rim is what separates a car from the dark asphalt at final size.
  // Gradient fill: the body is a box, so it needs a top-lit / bottom-dark
  // shading ramp or it collapses into a flat silhouette.
  p.poly(nearQ, {
    gradient: spec.color === PALETTE.red
      ? [[0, 'rgba(150,52,40,0.98)'], [0.42, 'rgba(96,26,22,0.97)'], [1, 'rgba(30,10,9,0.98)']]
      : [[0, 'rgba(54,60,66,0.98)'], [0.4, 'rgba(30,35,40,0.97)'], [1, 'rgba(11,14,17,0.98)']],
    stroke: BONE(0.82), width: 1.25, alpha,
    jitter: 0.16, seed: seed + 9,
  });

  // Windows on the near face, projected with the same body.
  const win = prof.windows;
  const wq = projectRing(camera, mirror(win.map(([wx, wy]) => axisPoint(world, spec, wx * prof.w * 0.5, nearLat + 0.01, wy))));
  if (wq) {
    if (prof.band) {
      // Bus: a continuous glazed band with mullions.
      p.poly(wq, { fill: 'rgba(43,184,174,0.30)', stroke: BONE(0.6), width: 0.75, alpha, jitter: 0.14, seed: seed + 12 });
      const mull = 5;
      for (let i = 1; i < mull; i++) {
        const t = i / mull;
        const a = quadLerp(wq, t, 0);
        const b = quadLerp(wq, t, 1);
        p.line([a, b], { color: '#0b1210', width: 1.2, alpha: alpha * 0.95, jitter: 0.1, seed: seed + 20 + i, double: false });
      }
      // Door.
      p.poly([
        quadLerp(wq, 0.62, 0.1), quadLerp(wq, 0.86, 0.1),
        quadLerp(wq, 0.86, 0.9), quadLerp(wq, 0.62, 0.9),
      ], { fill: 'rgba(6,9,7,0.65)', stroke: BONE(0.45), width: 0.6, alpha, jitter: 0.12, seed: seed + 30 });
      // Destination blind.
      const b0 = quadLerp(wq, 0.12, 0.02), b1 = quadLerp(wq, 0.44, 0.02);
      p.line([b0, b1], { color: PALETTE.teal, width: 2.0, alpha: alpha * 0.9, jitter: 0.1, seed: seed + 31, double: false });
    } else {
      p.poly(wq, {
        fill: 'rgba(36,62,60,0.95)', stroke: BONE(0.72), width: 0.85, alpha, jitter: 0.12, seed: seed + 12,
      });
      // Windscreen divider and a diagonal reflection.
      const m = quadLerp(wq, 0.5, 0);
      const m2 = quadLerp(wq, 0.5, 1);
      p.line([m, m2], { color: BONE(0.5), width: 0.7, alpha: alpha * 0.9, jitter: 0.1, seed: seed + 13, double: false });
      const r0 = quadLerp(wq, 0.06, 0.18), r1 = quadLerp(wq, 0.44, 0.72);
      p.line([r0, r1], { color: 'rgba(239,233,216,0.22)', width: 0.7, alpha: alpha * 0.8, jitter: 0.12, seed: seed + 14, double: false });
    }
  }

  // Door seam, handle and a body crease: tiny cues that read as a vehicle.
  const seam = mirror([
    axisPoint(world, spec, 0.04 * prof.w * 0.5, nearLat + 0.01, 0.52),
    axisPoint(world, spec, 0.04 * prof.w * 0.5, nearLat + 0.01, prof.trim * 1.42),
  ]);
  const seamQ = projectRing(camera, seam);
  if (seamQ) {
    p.line(seamQ, { color: BONE(0.34), width: 0.6, alpha: alpha * 0.85, jitter: 0.1, seed: seed + 22, double: false });
  }
  const crease = projectRing(camera, mirror([
    axisPoint(world, spec, -0.94 * prof.w * 0.5, nearLat + 0.01, 0.66),
    axisPoint(world, spec, 0.94 * prof.w * 0.5, nearLat + 0.01, 0.66),
  ]));
  if (crease) {
    p.line(crease, { color: BONE(0.20), width: 0.5, alpha: alpha * 0.75, jitter: 0.1, seed: seed + 23, double: false });
  }

  // Roof rim: a pale top edge. Without it a dark body dissolves into the wet
  // asphalt and the vehicle reads as a hole in the road.
  const roofY = Math.max(...prof.body.map((b) => b[1]));
  const roofPts = prof.body.filter((b) => b[1] >= roofY - 0.04).map((b) => b[0]);
  if (roofPts.length >= 2) {
    const rx0 = Math.min(...roofPts) * prof.w * 0.5;
    const rx1 = Math.max(...roofPts) * prof.w * 0.5;
    const roofQ = projectRing(camera, mirror([
      axisPoint(world, spec, rx0, nearLat + 0.005, roofY),
      axisPoint(world, spec, rx1, nearLat + 0.005, roofY),
    ]));
    if (roofQ) {
      p.line(roofQ, {
        color: BONE(0.42), width: 1.0, alpha: alpha * 0.9,
        jitter: 0.12, seed: seed + 26, double: false,
      });
    }
  }

  // Wet sheen: one pale streak along the flank, following the body crease.
  const sheen = projectRing(camera, mirror([
    axisPoint(world, spec, -0.42 * prof.w * 0.5, nearLat + 0.012, prof.trim * 0.92),
    axisPoint(world, spec, 0.24 * prof.w * 0.5, nearLat + 0.012, prof.trim * 1.05),
  ]));
  if (sheen) {
    p.line(sheen, {
      color: 'rgba(239,233,216,0.16)', width: Math.max(1.4, prof.w * 0.5), alpha: alpha * 0.8,
      jitter: 0.2, seed: seed + 27, double: false,
    });
  }

  // Lights: headlamps forward, tail lamps rear.
  const lampY = prof.type === 'bus' ? 0.9 : 0.70;
  for (const lat of [prof.d * 0.34, -prof.d * 0.34]) {
    const nose = camera.project(mirror([axisPoint(world, spec, 0.99 * prof.w * 0.5, lat, lampY)])[0]);
    if (nose && Number.isFinite(nose.x) && Number.isFinite(nose.y)) {
      const r = Math.max(1, nose.scale * 0.085);
      p.ellipse(nose.x, nose.y, r * 1.3, r * 0.8, {
        fill: BONE(0.92), stroke: BONE(0.8), width: 0.55, alpha,
      });
      if (item.moving) {
        glowAt(p.ctx, nose.x, nose.y, r * 11, '239,233,216', 0.18 * alpha);
      }
    }
    const rear = camera.project(mirror([axisPoint(world, spec, -0.99 * prof.w * 0.5, lat, lampY)])[0]);
    if (rear && Number.isFinite(rear.x) && Number.isFinite(rear.y)) {
      const rr = Math.max(1, rear.scale * 0.075);
      if (!item.moving) {
        const col = spec.dir > 0 ? '212,59,48' : '43,184,174';
        glowAt(p.ctx, rear.x, rear.y, rr * 9, col, 0.30 * alpha);
      }
      p.ellipse(rear.x, rear.y, rr * 1.25, rr * 0.75, {
        fill: spec.dir > 0 ? PALETTE.red : PALETTE.teal,
        stroke: BONE(0.6), width: 0.55, alpha,
      });
    }
  }

  // Taxi roof sign.
  if (spec.type === 'taxi') {
    const q = projectRing(camera, mirror([
      axisPoint(world, spec, -0.1 * prof.w * 0.5, -0.28, 1.58),
      axisPoint(world, spec, 0.1 * prof.w * 0.5, -0.28, 1.58),
      axisPoint(world, spec, 0.1 * prof.w * 0.5, 0.28, 1.58),
      axisPoint(world, spec, -0.1 * prof.w * 0.5, 0.28, 1.58),
    ]));
    if (q) p.poly(q, { fill: PALETTE.red, stroke: BONE(0.75), width: 0.7, alpha, jitter: 0.14, seed: seed + 40 });
  }

  // Roof rim light.
  const roof = mirror([
    axisPoint(world, spec, -0.5 * prof.w * 0.5, 0, prof.type === 'bus' ? 2.52 : 1.55),
    axisPoint(world, spec, 0.4 * prof.w * 0.5, 0, prof.type === 'bus' ? 2.52 : 1.55),
  ]);
  const roofQ = projectRing(camera, roof);
  if (roofQ) {
    p.line(roofQ, { color: BONE(0.55), width: 1.0, alpha: alpha * 0.85, jitter: 0.12, seed: seed + 50, double: false });
  }
}

export class Traffic {
  constructor(params = {}) {
    this.cars = [];
    this.rebuild();
    this.trainX = -40;
    this.trainAlpha = 0;
    this.parkedItems = [];
    this.movingItems = [];
    this.items = [];
  }

  /** Re-plan the traffic against the current tile grid. */
  rebuild() {
    this.circuits = blockCircuits(getWorld());
    this.cars = planCars(this.circuits);
    return this.cars.length;
  }

  update(camera, timeline, params, detail = { props: 1 }) {
    const tr = timeline.train(params.trainSpeed);
    this.trainX = lerp(TILE.x0 - 14.0, TILE.x1 + 14.0, tr);
    this.trainAlpha = smoothstep(0.01, 0.08, tr) * (1 - smoothstep(0.92, 0.99, tr));
    // Nothing is parked at the kerb: a 7.2 m street with two 3.6 m lanes gives
    // every moving vehicle room to pass without either of them swerving.
    this.parkedItems = [];
    this.movingItems = [];
    const t = timeline.t;
    for (const car of this.cars) {
      const st = carState(car, t);
      const at = circuitPoint(car.circuit, st.s);
      const spec = {
        id: car.id, type: car.type, color: car.color,
        axis: at.axis, dir: at.dir,
        braking: st.braking,
      };
      const world = { x: at.x, z: at.z };
      this.movingItems.push({
        spec, world, alpha: 1,
        // `fixed: true` is the "people cannot push a car" rule: the crowd
        // solver treats the vehicle as immovable and yields to it.
        radius: 2.6, group: 'vehicle', fixed: true, moving: st.moving, depth: 0,
        half: (PROFILES[car.type] || PROFILES.car).w / 2 - 0.5,
        across: (PROFILES[car.type] || PROFILES.car).d / 2,
      });
    }
    for (const it of this.movingItems) {
      const q = camera.project(v3(it.world.x, 0.8, it.world.z));
      it.depth = q ? q.depth : 0;
    }
    this.items = [...this.parkedItems, ...this.movingItems];
  }

  activeItems() {
    return this.items.filter((it) => it.alpha > 0.06);
  }

  drawTrain(p, camera, timeline, params) {
    const A = this.trainAlpha;
    if (A < 0.01) return;
    const cars = 4;
    const gap = 4.6;
    const y = 10.85;
    const z = -12.95;

    // The train belongs to the cell, not to the whole set: it slides in and out
    // through the cut faces instead of hanging off the end of the model. Clip
    // to the projected window of the cell at the train's own depth; a little
    // slack absorbs the perspective offset between the front and back of a car.
    const c = p.ctx;
    const pad = 0.35;
    const corners = [
      camera.project(v3(TILE.x0 - pad, 9.2, z + 0.85)),
      camera.project(v3(TILE.x1 + pad, 9.2, z + 0.85)),
      camera.project(v3(TILE.x1 + pad, 12.6, z + 0.85)),
      camera.project(v3(TILE.x0 - pad, 12.6, z + 0.85)),
    ];
    let clipped = false;
    if (corners.every(Boolean)) {
      c.save();
      c.beginPath();
      c.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < corners.length; i++) c.lineTo(corners[i].x, corners[i].y);
      c.closePath();
      c.clip();
      clipped = true;
    }
    for (let i = 0; i < cars; i++) {
      const x = this.trainX + (i - (cars - 1) / 2) * gap;
      const isCab = i === 0 || i === cars - 1;
      const faces = p.box(camera, [x, y, z], [4.3, 1.95, 1.55], {
        fill: '#0b0d11', stroke: 'rgba(239,233,216,0.9)',
        width: 1.15, alpha: A, seed: 500 + i, jitter: 0.16, edgeAlpha: 0.92,
      });
      const front = faces.find((f) => f.name === 'front' && f.visible);
      if (front) {
        // A continuous band of lit windows with heavy mullions: the train
        // should read as one long light, not as a row of separate panes.
        const bandTop = 0.30, bandBot = 0.62;
        const band = [
          quadLerp(front.quad, 0.04, bandTop), quadLerp(front.quad, 0.96, bandTop),
          quadLerp(front.quad, 0.96, bandBot), quadLerp(front.quad, 0.04, bandBot),
        ];
        p.poly(band, {
          fill: i === 2 ? 'rgba(212,59,48,0.55)' : 'rgba(239,233,216,0.55)',
          stroke: 'rgba(239,233,216,0.7)', width: 0.6, alpha: A, jitter: 0.12, seed: 505 + i,
        });
        for (let m = 1; m < 5; m++) {
          const u = m / 5;
          p.line([quadLerp(front.quad, u, bandTop), quadLerp(front.quad, u, bandBot)], {
            color: 'rgba(11,13,17,0.92)', width: 2.2, alpha: A, jitter: 0.08,
            seed: 506 + i * 5 + m, double: false,
          });
        }
        // Doors at the car ends.
        for (const u of [0.16, 0.84]) {
          p.line([quadLerp(front.quad, u, 0.34), quadLerp(front.quad, u, 0.90)], {
            color: 'rgba(11,13,17,0.85)', width: 1.4, alpha: A * 0.95, jitter: 0.08,
            seed: 530 + i + u, double: false,
          });
        }
        // Roof and skirt lines.
        p.line([quadLerp(front.quad, 0.03, 0.12), quadLerp(front.quad, 0.97, 0.12)], {
          color: 'rgba(239,233,216,0.55)', width: 0.8, alpha: A, jitter: 0.1,
          seed: 540 + i, double: false,
        });
        p.line([quadLerp(front.quad, 0.03, 0.92), quadLerp(front.quad, 0.97, 0.92)], {
          color: 'rgba(212,59,48,0.75)', width: 1.1, alpha: A, jitter: 0.1,
          seed: 545 + i, double: false,
        });
        // Cab: a lit windscreen plus a headlamp.
        if (isCab) {
          const cabU = i === 0 ? 0.06 : 0.94;
          const cab = camera.project(v3(x + (i === 0 ? -1.85 : 1.85), y + 0.25, z + 0.8));
          if (cab) {
            const rr = clamp(cab.scale * 0.14, 1.4, 5.0);
            p.ellipse(cab.x, cab.y, rr * 1.4, rr, {
              fill: 'rgba(239,233,216,0.9)', stroke: 'rgba(239,233,216,0.8)', width: 0.6, alpha: A,
            });
          }
          p.line([quadLerp(front.quad, cabU, 0.2), quadLerp(front.quad, cabU, 0.78)], {
            color: 'rgba(43,184,174,0.9)', width: 1.6, alpha: A, jitter: 0.1,
            seed: 550 + i, double: false,
          });
        }
      }
      // Under-carriage light on the wet street below.
      const q = camera.project(v3(x, 8.6, z + 0.9));
      if (q && A > 0.2) {
        glowAt(p.ctx, q.x, q.y, q.scale * 2.4, '216,190,150', 0.10 * A);
      }
    }
    if (clipped) c.restore();
  }

  draw(p, camera, timeline, params) {
    this.drawTrain(p, camera, timeline, params);
    for (const it of this.parkedItems) drawVehicle(p, camera, it);
    for (const it of this.movingItems) drawVehicle(p, camera, it);
  }
}

// --- traffic planning -----------------------------------------------------
//
// Each car owns a closed circuit around one block and completes a whole number
// of laps per 20 s loop. Everything that varies between cars — body, colour,
// lap count, dwell, start phase — is drawn from a seeded generator once, at
// plan time, so the picture is identical at t = 0 and t = 20 while still
// looking irregular.

const CAR_TYPES = ['car', 'car', 'car', 'taxi', 'van', 'bus'];

function planCars(circuits, loop = LOOP) {
  const rng = makeRng(77121);
  const cars = [];
  for (const c of circuits) {
    // Two cars a circuit, half a lap apart, so a block is never empty and the
    // two are never nose to tail.
    const perCircuit = c.length > 120 ? 3 : 2;
    for (let k = 0; k < perCircuit; k++) {
      const type = rng.pick(CAR_TYPES);
      const prof = PROFILES[type] || PROFILES.car;
      const half = prof.w * 0.5;
      // Stop with the nose `clear` of the junction box, plus the body's own
      // half length so the *front bumper* is clear, not the centre.
      const gap = HALF_ROAD + 0.9 + half;
      // Whole laps per loop, so the wrap is invisible.
      const laps = rng.pick([1, 1, 2]);
      const lapTime = loop / laps;
      const dwell = rng.range(0.32, 0.78);
      const stops = circuitStops(c, gap);
      const perim = c.length;
      // Dwell at four junctions a lap, so the rest of the lap has to absorb it.
      const travel = Math.max(lapTime * 0.45, lapTime - 4 * dwell);
      const speed = perim / travel;
      cars.push({
        id: `car_${c.id}_${k}`,
        circuit: c, type, color: type === 'taxi' ? PALETTE.red
          : rng.pick([PALETTE.ink, PALETTE.ink, PALETTE.teal, PALETTE.ink]),
        half, gap, laps, lapTime, dwell, stops, perim, speed,
        // Own phase: where this car already is in its lap at t = 0.
        phase: (k / perCircuit + rng.range(-0.03, 0.03) + 0.5) % 1,
        // Own clock: a small wobble on dwell, so the four stops are not
        // mechanically identical.
        dwellJitter: rng.range(-0.14, 0.14),
      });
    }
  }
  return cars;
}

// Position along the lap at time `elapsed` (seconds into this lap).
//
// The lap is five straight runs separated by four holds. Each hold is at a stop
// line, `gap` short of a junction, which is what keeps a waiting car *before*
// the crossing instead of parked in the middle of the intersection.
function carState(car, t) {
  const { perim, speed, dwell, stops, lapTime, dwellJitter } = car;
  const laps = t / lapTime + car.phase;
  const elapsed = (laps - Math.floor(laps)) * lapTime;
  const legs = [
    stops[0],
    stops[1] - stops[0],
    stops[2] - stops[1],
    stops[3] - stops[2],
    perim - stops[3],
  ];
  let s = 0;
  let time = elapsed;
  for (let i = 0; i < 4; i++) {
    const legT = legs[i] / speed;
    if (time < legT) {
      return { s: s + time * speed, moving: true, braking: false };
    }
    time -= legT;
    s += legs[i];
    const hold = Math.max(0.08, dwell + dwellJitter * (i % 2 ? 1 : -1));
    if (time < hold) return { s, moving: false, braking: true };
    time -= hold;
  }
  // Last run of the lap, back to the start point.
  const legT = legs[4] / speed;
  return { s: s + Math.min(time, legT) * speed, moving: time < legT, braking: false };
}

function VEHICLE_SPECS() {
  return [];
}
