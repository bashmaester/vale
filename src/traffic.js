import { PALETTE } from './draw.js';
import { v3, clamp, lerp, easeInOut, quadLerp } from './math.js';
import { separate } from './collision.js';
import { ROAD, PARKING, LANES, sanitizePark } from './world.js';

// A few vehicles, not a traffic jam. Three sit legally at curbs; two move in
// separated lanes only after the crossing has cleared.
const VEHICLE_SPECS = [
  { id: 'park_n', type: 'car', w: 3.8, h: 1.7, d: 1.9, axis: 'x', dir: PARKING[0].dir, park: { x: PARKING[0].x, z: PARKING[0].z }, color: PALETTE.ink },
  { id: 'park_s', type: 'van', w: 4.6, h: 2.2, d: 2.0, axis: 'x', dir: PARKING[1].dir, park: { x: PARKING[1].x, z: PARKING[1].z }, color: PALETTE.teal },
  { id: 'park_e', type: 'taxi', w: 4.0, h: 1.8, d: 1.9, axis: 'z', dir: PARKING[2].dir, park: { x: PARKING[2].x, z: PARKING[2].z }, color: PALETTE.red },
  { id: 'move_bus', type: 'bus', w: 5.8, h: 2.8, d: 2.3, axis: 'x', lane: LANES[0].offset, dir: LANES[0].dir, offset: 0.00, color: PALETTE.ink },
  { id: 'move_car', type: 'car', w: 3.8, h: 1.7, d: 1.9, axis: 'x', lane: LANES[1].offset, dir: LANES[1].dir, offset: 0.20, color: PALETTE.ink },
];

function localPoint(world, spec, along, lateral, y) {
  if (spec.axis === 'z') return v3(world.x + lateral, y, world.z + along);
  return v3(world.x + along, y, world.z + lateral);
}
function boxSize(spec, w, h, d) {
  return spec.axis === 'z' ? [d, h, w] : [w, h, d];
}
function boxCenter(world, spec, along, lateral, y) {
  const q = localPoint(world, spec, along, lateral, y);
  return [q.x, q.y, q.z];
}

function vehicleWorld(spec, v, parked) {
  if (parked) return { x: spec.park.x, z: spec.park.z };
  const span = 34;
  const drive = v * 0.78;
  const travel = spec.dir > 0 ? lerp(-span, span, drive) : lerp(span, -span, drive);
  return spec.axis === 'x'
    ? { x: travel, z: spec.lane }
    : { x: spec.lane, z: travel };
}

function drawWheels(p, camera, world, spec, alpha, seed) {
  const wheelR = 0.42;
  const y = wheelR;
  for (const along of [-spec.w * 0.33, spec.w * 0.33]) {
    for (const lateral of [-spec.d * 0.43, spec.d * 0.43]) {
      const c = localPoint(world, spec, along, lateral, y);
      const top = localPoint(world, spec, along, lateral, y + wheelR);
      const qc = camera.project(c), qt = camera.project(top);
      if (!qc || !qt) continue;
      const r = Math.max(1.2, Math.abs(qc.y - qt.y));
      p.ellipse(qc.x, qc.y, r * 1.16, r, {
        stroke: 'rgba(239,233,216,0.28)', width: 0.6, alpha: alpha * 0.5,
      });
      p.ellipse(qc.x, qc.y, r, r * 0.86, {
        fill: PALETTE.black, stroke: PALETTE.ink, width: 0.9, alpha,
      });
      p.ellipse(qc.x, qc.y, r * 0.32, r * 0.26, {
        stroke: 'rgba(239,233,216,0.55)', width: 0.6, alpha: alpha * 0.75,
      });
    }
  }
}

function drawLights(p, camera, world, spec, alpha) {
  const fs = spec.dir > 0 ? 1 : -1;
  const y = 0.5 + spec.h * 0.28;
  for (const lateral of [-spec.d * 0.30, spec.d * 0.30]) {
    const nose = camera.project(localPoint(world, spec, fs * spec.w * 0.5, lateral, y));
    if (nose) {
      const r = Math.max(1, nose.scale * 0.085);
      p.ellipse(nose.x, nose.y, r, r * 0.75, {
        fill: PALETTE.ink, stroke: 'rgba(239,233,216,0.7)', width: 0.6, alpha,
      });
    }
    const rear = camera.project(localPoint(world, spec, -fs * spec.w * 0.5, lateral, y));
    if (rear) {
      const rr = Math.max(1, rear.scale * 0.075);
      p.ellipse(rear.x, rear.y, rr, rr * 0.75, {
        fill: spec.dir > 0 ? PALETTE.red : PALETTE.teal,
        stroke: 'rgba(239,233,216,0.6)', width: 0.6, alpha,
      });
    }
  }
}

function drawVehicle(p, camera, item) {
  const { spec, world, alpha } = item;
  if (alpha < 0.02) return;
  const fs = spec.dir > 0 ? 1 : -1;
  const wheelR = 0.42;
  const bodyBottom = wheelR * 1.1;
  const tall = spec.type === 'bus' || spec.type === 'truck';
  const bodyH = tall ? spec.h * 0.72 : spec.h * 0.52;
  const bodyY = bodyBottom + bodyH / 2;
  const seed = 7 + spec.w * 3.1 + spec.dir;
  const boxOpts = {
    fill: '#070908', stroke: 'rgba(239,233,216,0.86)',
    width: 1.15, alpha, seed, jitter: 0.25, edgeAlpha: 0.85,
  };

  drawWheels(p, camera, world, spec, alpha, seed);

  let bodyFaces = [];
  if (spec.type === 'truck') {
    const cabW = spec.w * 0.30, cargoW = spec.w * 0.60;
    bodyFaces = bodyFaces.concat(p.box(camera, boxCenter(world, spec, fs * (spec.w * 0.5 - cabW / 2), 0, bodyY), boxSize(spec, cabW, bodyH, spec.d), boxOpts));
    bodyFaces = bodyFaces.concat(p.box(camera, boxCenter(world, spec, -fs * (spec.w * 0.5 - cargoW / 2), 0, bodyBottom + bodyH * 0.58), boxSize(spec, cargoW, bodyH * 1.12, spec.d * 0.98), boxOpts));
  } else {
    bodyFaces = bodyFaces.concat(p.box(camera, boxCenter(world, spec, 0, 0, bodyY), boxSize(spec, spec.w, bodyH, spec.d), boxOpts));
  }

  if (!tall) {
    const cabH = Math.max(0.28, spec.h - bodyH - 0.10);
    const cabW = spec.w * 0.58, cabD = spec.d * 0.82;
    const cabY = bodyBottom + bodyH + cabH / 2;
    const cabinFaces = p.box(camera, boxCenter(world, spec, fs * spec.w * 0.06, 0, cabY), boxSize(spec, cabW, cabH, cabD), boxOpts);
    bodyFaces = bodyFaces.concat(cabinFaces);
    const roofY = bodyBottom + bodyH + cabH;
    const hoodY = bodyBottom + bodyH * 0.72;
    p.projectPoly(camera, [
      localPoint(world, spec, fs * spec.w * 0.20, -spec.d * 0.36, roofY),
      localPoint(world, spec, fs * spec.w * 0.20, spec.d * 0.36, roofY),
      localPoint(world, spec, fs * spec.w * 0.50, spec.d * 0.36, hoodY),
      localPoint(world, spec, fs * spec.w * 0.50, -spec.d * 0.36, hoodY),
    ], {
      fill: 'rgba(239,233,216,0.09)', stroke: 'rgba(239,233,216,0.62)',
      width: 0.8, alpha, jitter: 0.25, seed: seed + 9,
    });
    if (spec.type === 'taxi') {
      p.box(camera, boxCenter(world, spec, fs * spec.w * 0.06, 0, roofY + 0.14), boxSize(spec, cabW * 0.28, 0.28, cabD * 0.5), {
        fill: PALETTE.red, stroke: PALETTE.ink, width: 0.8, alpha, seed: seed + 11, jitter: 0.18,
      });
    }
  }

  const front = bodyFaces.find((f) => f.visible && f.name !== 'top' && f.name !== 'bottom');
  if (front) {
    p.gridOnQuad(front.quad, spec.type === 'bus' ? 6 : 3, tall ? 2 : 1, {
      fill: 'rgba(239,233,216,0.12)', stroke: 'rgba(239,233,216,0.58)',
      width: 0.6, alpha: alpha * 0.95, margin: 0.16,
    });
    if (spec.type === 'bus') {
      const d = quadLerp(front.quad, 0.5, 0.10);
      const s = Math.max(2, Math.abs(quadLerp(front.quad, 0.62, 0.10)[0] - d[0]) * 0.5);
      p.rect(d[0] - s * 2, d[1] - s * 0.6, s * 4, s * 1.2, {
        fill: 'rgba(43,184,174,0.5)', stroke: 'rgba(239,233,216,0.8)',
        width: 0.7, alpha, seed: seed + 15, jitter: 0.2,
      });
    }
  }

  // Roof identity line and bumpers.
  const roofLineY = bodyBottom + bodyH + (tall ? 0.04 : spec.h * 0.42);
  p.projectLine(camera, [
    localPoint(world, spec, -spec.w / 2, 0, roofLineY),
    localPoint(world, spec, spec.w / 2, 0, roofLineY),
  ], { color: spec.color, width: 1.0, alpha: alpha * 0.78, jitter: 0.2, seed: seed + 20, double: false });
  for (const along of [-spec.w * 0.5, spec.w * 0.5]) {
    p.projectLine(camera, [
      localPoint(world, spec, along, -spec.d * 0.42, bodyBottom * 0.8),
      localPoint(world, spec, along, spec.d * 0.42, bodyBottom * 0.8),
    ], { color: 'rgba(239,233,216,0.5)', width: 0.85, alpha, jitter: 0.18, seed: seed + 30, double: false });
  }
  drawLights(p, camera, world, spec, alpha);
}

export class Traffic {
  constructor(params = {}) {
    this.specs = VEHICLE_SPECS.map((s) => {
      if (!s.park) return { ...s };
      const p = sanitizePark(s.park.x, s.park.z, 0.8);
      return { ...s, park: { x: p.x, z: p.z } };
    });
    this.trainX = -40;
    this.trainAlpha = 0;
    this.parkedItems = [];
    this.movingItems = [];
  }

  update(camera, timeline, params) {
    const tr = timeline.train();
    this.trainX = lerp(-40, 40, tr);
    this.trainAlpha = smoothBand(tr, 0.02, 0.12) * (1 - smoothBand(tr, 0.88, 0.99));
    const parkedA = timeline.parkedAlpha();
    const movingA = timeline.traffic();
    this.parkedItems = [];
    this.movingItems = [];
    for (const spec of this.specs) {
      if (spec.park) {
        this.parkedItems.push({
          spec, world: vehicleWorld(spec, 0, true), alpha: parkedA * 0.92,
          radius: Math.max(spec.w, spec.d) * 0.5, group: 'vehicle', fixed: true,
        });
      } else {
        const v = clamp((timeline.u - 0.90) / 0.10 - spec.offset, 0, 1);
        const e = easeInOut(v);
        this.movingItems.push({
          spec, world: vehicleWorld(spec, e, false),
          alpha: movingA * smoothBand(v, 0, 0.08) * (1 - smoothBand(v, 0.92, 1)),
          radius: Math.max(spec.w, spec.d) * 0.5, group: 'vehicle', fixed: false,
        });
      }
    }
    separate([...this.parkedItems, ...this.movingItems], {
      iterations: 2, padding: 0.25,
      bounds: { x0: ROAD.x0 + 1, x1: ROAD.x1 - 1, z0: ROAD.z0 + 1, z1: ROAD.z1 - 1 },
    });
    for (const it of this.parkedItems) {
      const s = sanitizePark(it.world.x, it.world.z, 0.8);
      it.world.x = s.x; it.world.z = s.z;
    }
  }

  activeItems() {
    return [...this.parkedItems, ...this.movingItems].filter((it) => it.alpha > 0.06);
  }

  drawTrain(p, camera, timeline, params) {
    const A = this.trainAlpha;
    if (A < 0.01) return;
    const cars = 5;
    const gap = 4.55;
    const y = 8.45;
    const z = -10.0;
    for (let i = 0; i < cars; i++) {
      const x = this.trainX + (i - (cars - 1) / 2) * gap;
      const isCab = i === 0 || i === cars - 1;
      const faces = p.box(camera, [x, y, z], [4.3, 2.1, 1.95], {
        fill: '#070908', stroke: 'rgba(239,233,216,0.88)',
        width: 1.2, alpha: A, seed: 500 + i, jitter: 0.25, edgeAlpha: 0.85,
      });
      const front = faces.find((f) => f.name === 'front' && f.visible);
      if (front) {
        const winColor = i % 3 === 1 ? 'rgba(212,59,48,0.70)' : 'rgba(43,184,174,0.70)';
        p.gridOnQuad(front.quad, isCab ? 3 : 5, 1, {
          fill: winColor, stroke: 'rgba(239,233,216,0.78)',
          width: 0.75, alpha: A, margin: 0.16,
          skip: (cx) => isCab && cx === 1,
        });
      }
      p.projectLine(camera, [v3(x - 2.1, 8.0, z + 1.0), v3(x + 2.1, 8.0, z + 1.0)], {
        color: i % 3 === 1 ? PALETTE.red : PALETTE.teal,
        width: 1.4, alpha: A * 0.88, jitter: 0.2, seed: 600 + i, double: false,
      });
      p.projectLine(camera, [v3(x - 2.0, 9.6, z), v3(x + 2.0, 9.6, z)], {
        color: 'rgba(239,233,216,0.50)', width: 0.75, alpha: A * 0.78,
        jitter: 0.15, seed: 700 + i, double: false,
      });
    }
    const q = camera.project(v3(this.trainX - 10, 8.5, z));
    if (q) {
      for (let k = 0; k < 4; k++) {
        p.line([[q.x - 55 - k * 20, q.y + k * 2], [q.x - 8 - k * 7, q.y + k * 2]], {
          color: k % 2 ? 'rgba(43,184,174,0.30)' : 'rgba(239,233,216,0.24)',
          width: 0.75, alpha: A * 0.45, jitter: 0.3, seed: 800 + k, double: false,
        });
      }
    }
  }

  drawVehicles(p, camera, timeline, params) {
    for (const it of this.parkedItems) drawVehicle(p, camera, it);
    for (const it of this.movingItems) drawVehicle(p, camera, it);
  }

  draw(p, camera, timeline, params) {
    this.drawTrain(p, camera, timeline, params);
    this.drawVehicles(p, camera, timeline, params);
  }
}

function smoothBand(v, a, b) {
  const t = clamp((v - a) / (b - a || 1));
  return t * t * (3 - 2 * t);
}
