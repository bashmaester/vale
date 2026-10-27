import { PALETTE } from './draw.js';
import { v3, clamp, lerp, easeInOut, makeRng, hash11 } from './math.js';

const VEHICLE_SPECS = [
  { type: 'bus', w: 5.6, h: 2.7, d: 2.2, lane: -5.2, dir: 1, offset: 0.00, park: [-17.5, -5.2], color: PALETTE.ink },
  { type: 'car', w: 3.7, h: 1.7, d: 1.9, lane: 0.4, dir: 1, offset: 0.12, park: [17.0, 0.4], color: PALETTE.ink },
  { type: 'taxi', w: 3.9, h: 1.8, d: 1.9, lane: 4.8, dir: -1, offset: 0.22, park: [-16.0, 4.8], color: PALETTE.red },
  { type: 'truck', w: 6.2, h: 2.9, d: 2.3, lane: -1.8, dir: -1, offset: 0.34, park: [18.0, -1.8], color: PALETTE.ink },
  { type: 'van', w: 4.6, h: 2.3, d: 2.0, lane: 2.6, dir: 1, offset: 0.46, park: [-18.5, 2.6], color: PALETTE.teal },
  { type: 'car', w: 3.5, h: 1.6, d: 1.8, lane: 7.0, dir: -1, offset: 0.58, park: [16.5, 7.0], color: PALETTE.ink },
];

function vehicleWorld(spec, v, parked) {
  if (parked) return { x: spec.park[0], z: spec.park[1] };
  const span = 34;
  const x = spec.dir > 0 ? lerp(-span, span, v) : lerp(span, -span, v);
  return { x, z: spec.lane + Math.sin(v * Math.PI * 2 + spec.offset * 9) * 0.15 };
}

function drawVehicle(p, camera, item) {
  const { spec, world, alpha } = item;
  if (alpha < 0.02) return;
  const y = spec.h / 2 + 0.02;
  const faces = p.box(camera, [world.x, y, world.z], [spec.w, spec.h, spec.d], {
    fill: '#070908',
    stroke: 'rgba(239,233,216,0.88)',
    width: 1.25,
    alpha,
    seed: spec.offset * 100 + 7,
    jitter: 0.35,
    edgeAlpha: 0.9,
  });
  const front = faces.find((f) => f.name === 'front' && f.visible);
  if (front) {
    p.gridOnQuad(front.quad, spec.type === 'bus' || spec.type === 'truck' ? 5 : 3, 1, {
      fill: 'rgba(239,233,216,0.14)',
      stroke: 'rgba(239,233,216,0.65)',
      width: 0.7,
      alpha: alpha * 0.95,
      margin: 0.18,
    });
  }
  const side = faces.find((f) => (f.name === 'right' || f.name === 'left') && f.visible);
  if (side && (spec.type === 'bus' || spec.type === 'van')) {
    p.gridOnQuad(side.quad, 3, 1, {
      fill: 'rgba(239,233,216,0.10)',
      stroke: 'rgba(239,233,216,0.45)',
      width: 0.6, alpha: alpha * 0.8, margin: 0.22,
    });
  }
  // Essential lamps and a roof cut.
  const q = camera.project(v3(world.x, spec.h * 0.55, world.z + spec.d / 2 + 0.03));
  if (q) {
    const dx = spec.w * q.scale * 0.32;
    const r = Math.max(1.2, q.scale * 0.11);
    p.ellipse(q.x - dx, q.y, r, r * 0.7, {
      fill: spec.dir > 0 ? PALETTE.ink : PALETTE.red,
      stroke: 'rgba(239,233,216,0.7)', width: 0.7, alpha,
    });
    p.ellipse(q.x + dx, q.y, r, r * 0.7, {
      fill: spec.dir > 0 ? PALETTE.ink : PALETTE.teal,
      stroke: 'rgba(239,233,216,0.7)', width: 0.7, alpha,
    });
  }
  p.projectLine(camera, [
    v3(world.x - spec.w / 2, spec.h + 0.03, world.z),
    v3(world.x + spec.w / 2, spec.h + 0.03, world.z),
  ], {
    color: spec.color, width: 1.0, alpha: alpha * 0.8,
    jitter: 0.25, seed: spec.offset * 40, double: false,
  });
}

export class Traffic {
  constructor(params = {}) {
    this.specs = VEHICLE_SPECS;
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
      this.parkedItems.push({ spec, world: pw, alpha: parkedA * 0.9 });
      const v = clamp((timeline.u - 0.78) / 0.20 - spec.offset, 0, 1);
      const e = easeInOut(v);
      const mw = vehicleWorld(spec, e, false);
      this.movingItems.push({ spec, world: mw, alpha: movingA * smoothBand(v, 0, 0.08) * (1 - smoothBand(v, 0.92, 1)) });
    }
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
        fill: '#070908',
        stroke: 'rgba(239,233,216,0.9)',
        width: 1.25,
        alpha: A,
        seed: 500 + i,
        jitter: 0.3,
        edgeAlpha: 0.9,
      });
      const front = faces.find((f) => f.name === 'front' && f.visible);
      if (front) {
        const winColor = i % 3 === 1 ? 'rgba(212,59,48,0.72)' : 'rgba(43,184,174,0.72)';
        p.gridOnQuad(front.quad, isCab ? 3 : 5, 1, {
          fill: winColor,
          stroke: 'rgba(239,233,216,0.8)',
          width: 0.8,
          alpha: A,
          margin: 0.16,
          skip: (cx) => isCab && cx === 1,
        });
      }
      // Teal / red identity stripe.
      p.projectLine(camera, [
        v3(x - 2.1, 8.05, z + 1.0),
        v3(x + 2.1, 8.05, z + 1.0),
      ], {
        color: i % 3 === 1 ? PALETTE.red : PALETTE.teal,
        width: 1.5, alpha: A * 0.9, jitter: 0.25, seed: 600 + i, double: false,
      });
      // Roof connector.
      p.projectLine(camera, [
        v3(x - 2.0, 9.72, z),
        v3(x + 2.0, 9.72, z),
      ], {
        color: 'rgba(239,233,216,0.55)', width: 0.8, alpha: A * 0.8,
        jitter: 0.2, seed: 700 + i, double: false,
      });
    }
    // Speed cuts behind the train.
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
        for (let k = 0; k < 7; k++) {
          const x0 = q.x - 150 + k * 42;
          wp.line([[x0, y + k], [x0 + 90 + k * 7, y + k + 2]], {
            color: k % 3 === 1 ? 'rgba(212,59,48,0.30)' : 'rgba(43,184,174,0.30)',
            width: 1.1, alpha: A * 0.55, composite: 'lighter',
            jitter: 0.6, seed: 900 + k, double: false,
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
      const len = (26 + it.spec.h * 10) * (params.reflectionStrength || 1);
      wp.line([[q.x, q.y], [q.x + (hash11(it.spec.offset * 71) - 0.5) * 8, q.y + len]], {
        color: it.spec.dir > 0 ? 'rgba(212,59,48,0.28)' : 'rgba(43,184,174,0.28)',
        width: 1.4, alpha: it.alpha * 0.55, composite: 'lighter',
        jitter: 0.7, seed: it.spec.offset * 100, double: false,
      });
    }
  }
}

function smoothBand(v, a, b) {
  const t = clamp((v - a) / (b - a || 1));
  return t * t * (3 - 2 * t);
}
