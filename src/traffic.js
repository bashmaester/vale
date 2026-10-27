import { PALETTE } from './draw.js';
import { v3, clamp, lerp, easeInOut, makeRng, hash11, quadLerp } from './math.js';
import { separate } from './collision.js';
import { LANES, ROAD, sanitizePark } from './world.js';

// Six vehicles, one per legal lane. dir comes from the lane definition so
// opposing streams never share the same strip of asphalt.
const VEHICLE_SPECS = [
  { type: 'bus', w: 5.8, h: 2.8, d: 2.3, lane: LANES[0].z, dir: LANES[0].dir, offset: 0.00, park: [-22.8, LANES[0].z], color: PALETTE.ink },
  { type: 'car', w: 3.8, h: 1.7, d: 1.9, lane: LANES[1].z, dir: LANES[1].dir, offset: 0.10, park: [-24.5, LANES[1].z], color: PALETTE.ink },
  { type: 'taxi', w: 4.0, h: 1.8, d: 1.9, lane: LANES[2].z, dir: LANES[2].dir, offset: 0.22, park: [-22.8, LANES[2].z], color: PALETTE.red },
  { type: 'truck', w: 6.4, h: 3.0, d: 2.4, lane: LANES[3].z, dir: LANES[3].dir, offset: 0.34, park: [22.8, LANES[3].z], color: PALETTE.ink },
  { type: 'van', w: 4.8, h: 2.4, d: 2.1, lane: LANES[4].z, dir: LANES[4].dir, offset: 0.46, park: [24.5, LANES[4].z], color: PALETTE.teal },
  { type: 'car', w: 3.6, h: 1.6, d: 1.8, lane: LANES[5].z, dir: LANES[5].dir, offset: 0.58, park: [22.8, LANES[5].z], color: PALETTE.ink },
];

function vehicleWorld(spec, v, parked) {
  if (parked) return { x: spec.park[0], z: spec.park[1] };
  const span = 30;
  // Slower return: vehicles only traverse part of the span in the final phase.
  const drive = v * 0.72;
  const x = spec.dir > 0 ? lerp(-span, span, drive) : lerp(span, -span, drive);
  return { x, z: spec.lane + Math.sin(v * Math.PI * 2 + spec.offset * 9) * 0.06 };
}

function drawWheels(p, camera, world, spec, alpha, seed) {
  const wheelR = 0.42;
  const y = wheelR;
  const xs = [-spec.w * 0.33, spec.w * 0.33];
  const zs = [-spec.d * 0.43, spec.d * 0.43];
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < zs.length; j++) {
      const cx = world.x + xs[i], cz = world.z + zs[j];
      const c = camera.project(v3(cx, y, cz));
      const top = camera.project(v3(cx, y + wheelR, cz));
      if (!c || !top) continue;
      const r = Math.max(1.2, Math.abs(c.y - top.y));
      p.ellipse(c.x, c.y, r * 1.18, r, {
        stroke: 'rgba(239,233,216,0.28)', width: 0.6, alpha: alpha * 0.5,
      });
      p.ellipse(c.x, c.y, r, r * 0.86, {
        fill: PALETTE.black, stroke: PALETTE.ink, width: 0.9, alpha,
      });
      p.ellipse(c.x, c.y, r * 0.34, r * 0.28, {
        stroke: 'rgba(239,233,216,0.55)', width: 0.6, alpha: alpha * 0.75,
      });
    }
  }
}

function drawLights(p, camera, world, spec, alpha) {
  const fs = spec.dir > 0 ? 1 : -1;
  const noseX = world.x + fs * spec.w * 0.5;
  const rearX = world.x - fs * spec.w * 0.5;
  const y = 0.45 + spec.h * 0.28;
  for (const z of [-spec.d * 0.30, spec.d * 0.30]) {
    const q = camera.project(v3(noseX, y, world.z + z));
    if (q) {
      const r = Math.max(1, q.scale * 0.09);
      p.ellipse(q.x, q.y, r, r * 0.75, {
        fill: PALETTE.ink, stroke: 'rgba(239,233,216,0.7)', width: 0.6, alpha,
      });
    }
    const r = camera.project(v3(rearX, y, world.z + z));
    if (r) {
      const rr = Math.max(1, r.scale * 0.08);
      p.ellipse(r.x, r.y, rr, rr * 0.75, {
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
  const seed = spec.offset * 100 + 7;
  const boxOpts = {
    fill: '#070908', stroke: 'rgba(239,233,216,0.88)',
    width: 1.2, alpha, seed, jitter: 0.32, edgeAlpha: 0.9,
  };

  drawWheels(p, camera, world, spec, alpha, seed);

  let bodyFaces = [];
  if (spec.type === 'truck') {
    const cabW = spec.w * 0.30, cargoW = spec.w * 0.60;
    const cabX = world.x + fs * (spec.w * 0.5 - cabW / 2);
    const cargoX = world.x - fs * (spec.w * 0.5 - cargoW / 2);
    bodyFaces = bodyFaces.concat(p.box(camera, [cabX, bodyY, world.z], [cabW, bodyH, spec.d], boxOpts));
    bodyFaces = bodyFaces.concat(p.box(camera, [cargoX, bodyBottom + bodyH * 0.58, world.z], [cargoW, bodyH * 1.12, spec.d * 0.98], boxOpts));
    const gapX = world.x + fs * (spec.w * 0.5 - cabW);
    p.projectLine(camera, [v3(gapX, bodyBottom, world.z - spec.d / 2), v3(gapX, bodyBottom + bodyH * 1.2, world.z - spec.d / 2)], {
      color: 'rgba(239,233,216,0.45)', width: 0.8, alpha, jitter: 0.2, seed: seed + 3, double: false,
    });
  } else {
    bodyFaces = bodyFaces.concat(p.box(camera, [world.x, bodyY, world.z], [spec.w, bodyH, spec.d], boxOpts));
  }

  if (!tall) {
    const cabH = Math.max(0.28, spec.h - bodyH - 0.10);
    const cabW = spec.w * 0.58, cabD = spec.d * 0.82;
    const cabX = world.x + fs * spec.w * 0.06;
    const cabY = bodyBottom + bodyH + cabH / 2;
    const cabinFaces = p.box(camera, [cabX, cabY, world.z], [cabW, cabH, cabD], boxOpts);
    bodyFaces = bodyFaces.concat(cabinFaces);
    // Sloped windshield from roof to hood, on the direction-of-travel face.
    const roofY = bodyBottom + bodyH + cabH;
    const hoodY = bodyBottom + bodyH * 0.72;
    const backX = world.x + fs * spec.w * 0.20;
    const noseX = world.x + fs * spec.w * 0.5;
    const z0 = world.z - spec.d * 0.36, z1 = world.z + spec.d * 0.36;
    p.projectPoly(camera, [
      v3(backX, roofY, z0), v3(backX, roofY, z1),
      v3(noseX, hoodY, z1), v3(noseX, hoodY, z0),
    ], {
      fill: 'rgba(239,233,216,0.10)', stroke: 'rgba(239,233,216,0.65)',
      width: 0.8, alpha, jitter: 0.3, seed: seed + 9,
    });
    if (spec.type === 'taxi') {
      p.box(camera, [cabX, roofY + 0.14, world.z], [cabW * 0.28, 0.28, cabD * 0.5], {
        fill: PALETTE.red, stroke: PALETTE.ink, width: 0.8, alpha, seed: seed + 11, jitter: 0.2,
      });
    }
  }

  const front = bodyFaces.find((f) => f.name === 'front' && f.visible);
  if (front) {
    p.gridOnQuad(front.quad, spec.type === 'bus' ? 6 : (tall ? 3 : 3), tall ? 2 : 1, {
      fill: 'rgba(239,233,216,0.13)', stroke: 'rgba(239,233,216,0.62)',
      width: 0.65, alpha: alpha * 0.95, margin: 0.16,
      skip: (x, y) => spec.type === 'truck' && y === 1 && x > 0,
    });
    if (spec.type === 'bus') {
      const d = quadLerp(front.quad, 0.5, 0.10);
      const s = Math.max(2, Math.abs(quadLerp(front.quad, 0.62, 0.10)[0] - d[0]) * 0.5);
      p.rect(d[0] - s * 2, d[1] - s * 0.6, s * 4, s * 1.2, {
        fill: 'rgba(43,184,174,0.5)', stroke: 'rgba(239,233,216,0.8)',
        width: 0.7, alpha, seed: seed + 15, jitter: 0.25,
      });
    }
  }
  const side = bodyFaces.find((f) => (f.name === 'right' || f.name === 'left') && f.visible);
  if (side && (spec.type === 'van' || spec.type === 'bus')) {
    p.gridOnQuad(side.quad, 2, 1, {
      fill: 'rgba(239,233,216,0.08)', stroke: 'rgba(239,233,216,0.42)',
      width: 0.6, alpha: alpha * 0.8, margin: 0.22,
    });
  }

  // Roof identity cut + bumpers.
  p.projectLine(camera, [
    v3(world.x - spec.w / 2, bodyBottom + bodyH + (tall ? 0.04 : spec.h * 0.42), world.z),
    v3(world.x + spec.w / 2, bodyBottom + bodyH + (tall ? 0.04 : spec.h * 0.42), world.z),
  ], { color: spec.color, width: 1.0, alpha: alpha * 0.8, jitter: 0.25, seed: seed + 20, double: false });
  for (const bx of [world.x - spec.w * 0.5, world.x + spec.w * 0.5]) {
    p.projectLine(camera, [
      v3(bx, bodyBottom * 0.8, world.z - spec.d * 0.42),
      v3(bx, bodyBottom * 0.8, world.z + spec.d * 0.42),
    ], { color: 'rgba(239,233,216,0.55)', width: 0.9, alpha, jitter: 0.2, seed: seed + 30, double: false });
  }
  drawLights(p, camera, world, spec, alpha);
}

export class Traffic {
  constructor(params = {}) {
    this.specs = VEHICLE_SPECS.map((s) => {
      const p = sanitizePark(s.park[0], s.park[1], 0);
      return { ...s, park: [p.x, p.z] };
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
      const pw = vehicleWorld(spec, 0, true);
      this.parkedItems.push({
        spec, world: pw, alpha: parkedA * 0.9,
        radius: Math.max(spec.w, spec.d) * 0.5, group: 'vehicle', fixed: true,
      });
      const v = clamp((timeline.u - 0.90) / 0.10 - spec.offset * 0.20, 0, 1);
      const e = easeInOut(v);
      const mw = vehicleWorld(spec, e, false);
      this.movingItems.push({
        spec, world: mw, alpha: movingA * smoothBand(v, 0, 0.08) * (1 - smoothBand(v, 0.92, 1)),
        radius: Math.max(spec.w, spec.d) * 0.5, group: 'vehicle', fixed: false,
      });
    }
    separate([...this.parkedItems, ...this.movingItems], {
      iterations: 2, padding: 0.25,
      bounds: { x0: ROAD.x0 + 2, x1: ROAD.x1 - 2, z0: ROAD.z0 + 2, z1: ROAD.z1 - 2 },
    });
    // Keep parked hulls legal after separation.
    for (const it of this.parkedItems) {
      const s = sanitizePark(it.world.x, it.world.z, 0.35);
      it.world.x = s.x; it.world.z = s.z;
    }
  }

  activeItems() {
    return [...this.parkedItems, ...this.movingItems].filter((it) => it.alpha > 0.06);
  }

  drawTrain(p, camera, timeline, params) {
    const A = this.trainAlpha;
    if (A < 0.01) return;
    const cars = 6;
    const gap = 4.55;
    const y = 8.55;
    const z = -8.5;
    for (let i = 0; i < cars; i++) {
      const x = this.trainX + (i - (cars - 1) / 2) * gap;
      const isCab = i === 0 || i === cars - 1;
      const faces = p.box(camera, [x, y, z], [4.3, 2.25, 1.95], {
        fill: '#070908', stroke: 'rgba(239,233,216,0.9)',
        width: 1.25, alpha: A, seed: 500 + i, jitter: 0.3, edgeAlpha: 0.9,
      });
      const front = faces.find((f) => f.name === 'front' && f.visible);
      if (front) {
        const winColor = i % 3 === 1 ? 'rgba(212,59,48,0.72)' : 'rgba(43,184,174,0.72)';
        p.gridOnQuad(front.quad, isCab ? 3 : 5, 1, {
          fill: winColor, stroke: 'rgba(239,233,216,0.8)',
          width: 0.8, alpha: A, margin: 0.16,
          skip: (cx) => isCab && cx === 1,
        });
      }
      p.projectLine(camera, [
        v3(x - 2.1, 8.05, z + 1.0), v3(x + 2.1, 8.05, z + 1.0),
      ], { color: i % 3 === 1 ? PALETTE.red : PALETTE.teal, width: 1.5, alpha: A * 0.9, jitter: 0.25, seed: 600 + i, double: false });
      p.projectLine(camera, [
        v3(x - 2.0, 9.72, z), v3(x + 2.0, 9.72, z),
      ], { color: 'rgba(239,233,216,0.55)', width: 0.8, alpha: A * 0.8, jitter: 0.2, seed: 700 + i, double: false });
    }
    const q = camera.project(v3(this.trainX - 10, 8.6, z));
    if (q) {
      for (let k = 0; k < 5; k++) {
        p.line([[q.x - 60 - k * 22, q.y + k * 2], [q.x - 10 - k * 8, q.y + k * 2]], {
          color: k % 2 ? 'rgba(43,184,174,0.35)' : 'rgba(239,233,216,0.28)',
          width: 0.8, alpha: A * 0.5, jitter: 0.4, seed: 800 + k, double: false,
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

  drawReflections(wp, camera, timeline, params) {
    const A = this.trainAlpha;
    if (A > 0.02) {
      const q = camera.project(v3(this.trainX, 8.5, -8.5));
      if (q) {
        const y = Math.min(wp.H * 0.82, q.y + wp.H * 0.30);
        for (let k = 0; k < 4; k++) {
          const x0 = q.x - 120 + k * 55;
          wp.line([[x0, y + k], [x0 + 70 + k * 7, y + k + 2]], {
            color: k % 3 === 1 ? 'rgba(212,59,48,0.24)' : 'rgba(43,184,174,0.24)',
            width: 0.9, alpha: A * 0.32, composite: 'lighter',
            jitter: 0.4, seed: 900 + k, double: false,
          });
        }
      }
    }
    const mA = timeline.traffic();
    if (mA < 0.03) return;
    for (const it of this.movingItems) {
      if (it.alpha < 0.05) continue;
      const q = camera.project(v3(it.world.x, 0.02, it.world.z));
      if (!q) continue;
      const len = (20 + it.spec.h * 8) * (params.reflectionStrength || 0.6);
      wp.line([[q.x, q.y], [q.x + (hash11(it.spec.offset * 71) - 0.5) * 6, q.y + len]], {
        color: it.spec.dir > 0 ? 'rgba(212,59,48,0.22)' : 'rgba(43,184,174,0.22)',
        width: 1.0, alpha: it.alpha * 0.28, composite: 'lighter',
        jitter: 0.45, seed: it.spec.offset * 100, double: false,
      });
    }
  }
}

function smoothBand(v, a, b) {
  const t = clamp((v - a) / (b - a || 1));
  return t * t * (3 - 2 * t);
}
