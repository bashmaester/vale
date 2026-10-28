// A single built-out street corner. Construction order is deliberate:
// 1) big cubic volumes (road plane, sidewalk blocks, buildings),
// 2) road markings and fixed street furniture,
// 3) signals, wires, track,
// 4) people and weather are added later by scene.js.
import { PALETTE } from './draw.js';
import { v3, clamp, lerp, hash21, makeRng, quadLerp } from './math.js';
import {
  ROAD, ROAD_H, ROAD_V, INTERSECTION, SIDEWALKS, CORNER,
  CROSSWALKS, LANES, SIGNAL_POSITIONS, BUILDING_LOTS,
} from './world.js';

const rng = makeRng(20261027);

const WIRES = [];
for (let i = 0; i < 5; i++) {
  WIRES.push({ y: 7.7 + i * 0.42, z: -9.5 - i * 0.7, sag: 0.65 + i * 0.10, seed: 40 + i });
}

function line3(p, camera, a, b, opts = {}) {
  p.projectLine(camera, [v3(...a), v3(...b)], opts);
}

function stripe(p, camera, cx, cz, angle, len, wid, opts = {}) {
  const dx = Math.cos(angle), dz = Math.sin(angle);
  const nx = -dz, nz = dx;
  const L = len / 2, W = wid / 2;
  const y = 0.035;
  const pts = [
    v3(cx - dx * L - nx * W, y, cz - dz * L - nz * W),
    v3(cx + dx * L - nx * W, y, cz + dz * L - nz * W),
    v3(cx + dx * L + nx * W, y, cz + dz * L + nz * W),
    v3(cx - dx * L + nx * W, y, cz - dz * L + nz * W),
  ];
  return p.projectPoly(camera, pts, {
    fill: opts.fill || 'rgba(239,233,216,0.72)',
    stroke: opts.stroke || 'rgba(255,250,235,0.55)',
    width: opts.width || 0.75,
    alpha: opts.alpha == null ? 1 : opts.alpha,
    jitter: opts.jitter == null ? 0.35 : opts.jitter,
    seed: opts.seed || cx * 3 + cz,
  });
}

function accentColor(name) {
  if (name === 'red') return PALETTE.red;
  if (name === 'teal') return PALETTE.teal;
  return PALETTE.dim;
}

export function drawHorizon(p, camera, timeline, params) {
  const W = p.W, H = p.H;
  for (let i = 0; i < 7; i++) {
    const y = H * (0.04 + i * 0.017) + Math.sin(i * 3.1) * 2;
    const x0 = W * (0.04 + hash21(i, 4) * 0.22);
    const x1 = W * (0.62 + hash21(i, 9) * 0.30);
    p.line([[x0, y], [x1, y + hash21(i, 7) * 1.5]], {
      color: i % 4 === 0 ? PALETTE.teal : PALETTE.dim,
      width: 0.55 + hash21(i, 2) * 0.5,
      alpha: 0.05 + hash21(i, 11) * 0.08,
      jitter: 0.2, seed: i * 2.3, double: false,
    });
  }
}

// A ring of distant blocks so the frame has depth instead of a void. The
// previous build left ~70% of the image as empty black, which is why the set
// read as a tiny diagram floating in nothing. These are intentionally cheap:
// dark masses, a few lit windows, no outlines competing with the corner.
const BACKDROP = (() => {
  const out = [];
  const r = makeRng(77113);
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + r.range(-0.05, 0.05);
    const dist = r.range(44, 78);
    const x = Math.cos(a) * dist;
    const z = Math.sin(a) * dist;
    const w = r.range(6, 15);
    const d = r.range(6, 15);
    const h = r.range(9, 30) * (dist / 60);
    out.push({ x, z, w, d, h, seed: r.range(1, 999), lit: r.range(0, 1) });
  }
  return out;
})();

export function drawBackdrop(p, camera, timeline, params) {
  for (const b of BACKDROP) {
    const faces = p.box(camera, [b.x, b.h / 2, b.z], [b.w, b.h, b.d], {
      shade: true,
      fillFor: (name) => (name === 'top' ? '#232a22' : name === 'front' || name === 'back' ? '#1b211a' : '#131812'),
      stroke: 'rgba(239,233,216,0.26)',
      width: 0.7,
      alpha: 1,
      seed: b.seed,
      jitter: 0.18,
      edgeAlpha: 0.4,
    });
    // Sparse lit windows are what make a dark city mass read as a city.
    const front = faces.filter((f) => f.visible && f.name !== 'top' && f.name !== 'bottom');
    if (!front.length) continue;
    const f = front[0];
    const cols = Math.max(2, Math.round(b.w / 2.6));
    const rows = Math.max(3, Math.round(b.h / 3.0));
    const litPolys = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const hsh = hash21(x * 7.7 + b.seed, y * 3.1 + b.seed * 0.7);
        if (hsh < 0.62 + b.lit * 0.2) continue;
        const u0 = (x + 0.3) / cols, u1 = (x + 0.7) / cols;
        const v0 = (y + 0.3) / rows, v1 = (y + 0.62) / rows;
        litPolys.push([
          quadLerp(f.quad, u0, v0), quadLerp(f.quad, u1, v0),
          quadLerp(f.quad, u1, v1), quadLerp(f.quad, u0, v1),
        ]);
      }
    }
    if (litPolys.length) {
      p.polys(litPolys, {
        fill: 'rgba(239,233,216,0.20)', stroke: null, alpha: 0.9,
      });
    }
  }
}

// STAGE 1 — big cubic volumes.
export function drawBlockout(p, camera, timeline, params) {
  // Ground / asphalt planes.
  p.projectPoly(camera, [
    v3(ROAD.x0, 0, ROAD.z0), v3(ROAD.x1, 0, ROAD.z0),
    v3(ROAD.x1, 0, ROAD.z1), v3(ROAD.x0, 0, ROAD.z1),
  ], { fill: '#11150f', stroke: null, jitter: 0, alpha: 1 });
  p.projectPoly(camera, [
    v3(ROAD_H.x0, 0.005, ROAD_H.z0), v3(ROAD_H.x1, 0.005, ROAD_H.z0),
    v3(ROAD_H.x1, 0.005, ROAD_H.z1), v3(ROAD_H.x0, 0.005, ROAD_H.z1),
  ], { fill: '#171c15', stroke: null, jitter: 0, alpha: 1 });
  p.projectPoly(camera, [
    v3(ROAD_V.x0, 0.006, ROAD_V.z0), v3(ROAD_V.x1, 0.006, ROAD_V.z0),
    v3(ROAD_V.x1, 0.006, ROAD_V.z1), v3(ROAD_V.x0, 0.006, ROAD_V.z1),
  ], { fill: '#151a14', stroke: null, jitter: 0, alpha: 1 });
  p.projectPoly(camera, [
    v3(INTERSECTION.x0, 0.007, INTERSECTION.z0), v3(INTERSECTION.x1, 0.007, INTERSECTION.z0),
    v3(INTERSECTION.x1, 0.007, INTERSECTION.z1), v3(INTERSECTION.x0, 0.007, INTERSECTION.z1),
  ], { fill: '#1a2019', stroke: null, jitter: 0, alpha: 1 });

  // Raised sidewalk blocks as shallow boxes, not flat decals.
  for (let i = 0; i < SIDEWALKS.length; i++) {
    const s = SIDEWALKS[i];
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    const w = s.x1 - s.x0, d = s.z1 - s.z0;
    const isCorner = s.id === CORNER.id;
    const faces = p.box(camera, [cx, 0.18, cz], [w, 0.36, d], {
      fill: isCorner ? 'rgba(30,36,30,0.99)' : 'rgba(23,28,23,0.97)',
      stroke: isCorner ? 'rgba(239,233,216,0.78)' : 'rgba(239,233,216,0.45)',
      width: isCorner ? 1.15 : 0.8,
      alpha: 0.96,
      seed: 700 + i,
      jitter: 0.16,
      edgeAlpha: isCorner ? 0.85 : 0.55,
    });
    const top = faces.find((f) => f.name === 'top' && f.visible);
    if (top) drawSidewalkTop(p, top.quad, s, i);
  }
}

function drawSidewalkTop(p, quad, s, index) {
  const detail = s.detail;
  const cols = Math.max(2, Math.round((s.x1 - s.x0) / (detail > 0.8 ? 2.3 : 4.0)));
  const rows = Math.max(2, Math.round((s.z1 - s.z0) / (detail > 0.8 ? 2.3 : 4.0)));
  for (let k = 1; k < cols; k++) {
    const u = k / cols;
    p.line([quadLerp(quad, u, 0.02), quadLerp(quad, u, 0.98)], {
      color: 'rgba(239,233,216,0.16)', width: detail > 0.8 ? 0.65 : 0.45,
      alpha: 0.30 + detail * 0.35, jitter: 0.12,
      seed: 720 + index * 20 + k, double: false,
    });
  }
  for (let k = 1; k < rows; k++) {
    const v = k / rows;
    p.line([quadLerp(quad, 0.02, v), quadLerp(quad, 0.98, v)], {
      color: 'rgba(239,233,216,0.11)', width: detail > 0.8 ? 0.6 : 0.4,
      alpha: 0.24 + detail * 0.30, jitter: 0.12,
      seed: 760 + index * 20 + k, double: false,
    });
  }
  // Tactile paving only at the two curb ramps of the built-out corner.
  if (s.id === CORNER.id) {
    for (let k = 0; k < 6; k++) {
      const u = 0.03 + k * 0.025;
      p.line([quadLerp(quad, u, 0.90), quadLerp(quad, u, 0.98)], {
        color: 'rgba(239,233,216,0.42)', width: 0.7, alpha: 0.55,
        jitter: 0.1, seed: 800 + k, double: false,
      });
    }
    for (let k = 0; k < 6; k++) {
      const v = 0.03 + k * 0.025;
      p.line([quadLerp(quad, 0.02, v), quadLerp(quad, 0.10, v)], {
        color: 'rgba(239,233,216,0.42)', width: 0.7, alpha: 0.55,
        jitter: 0.1, seed: 820 + k, double: false,
      });
    }
  }
}

// STAGE 2 — road markings and small fixed geometry.
export function drawRoadMarkings(p, camera, timeline, params) {
  // Center lines, interrupted through the junction.
  for (const [a, b] of [
    [[ROAD_H.x0, 0.025, 0], [INTERSECTION.x0 - 0.8, 0.025, 0]],
    [[INTERSECTION.x1 + 0.8, 0.025, 0], [ROAD_H.x1, 0.025, 0]],
    [[0, 0.026, ROAD_V.z0], [0, 0.026, INTERSECTION.z0 - 0.8]],
    [[0, 0.026, INTERSECTION.z1 + 0.8], [0, 0.026, ROAD_V.z1]],
  ]) {
    line3(p, camera, a, b, {
      color: 'rgba(239,233,216,0.30)', width: 0.85, alpha: 0.5,
      dash: [5, 10], jitter: 0.18, seed: 100 + a[0] + a[2], double: false,
    });
  }
  // Lane divider dashes.
  for (const lane of LANES) {
    if (lane.axis === 'x') {
      for (const [x0, x1] of [[ROAD_H.x0, INTERSECTION.x0 - 1], [INTERSECTION.x1 + 1, ROAD_H.x1]]) {
        line3(p, camera, [x0, 0.022, lane.offset], [x1, 0.022, lane.offset], {
          color: 'rgba(239,233,216,0.18)', width: 0.7, alpha: 0.38,
          dash: [3.5, 8], jitter: 0.15, seed: 120 + lane.offset, double: false,
        });
      }
    } else {
      for (const [z0, z1] of [[ROAD_V.z0, INTERSECTION.z0 - 1], [INTERSECTION.z1 + 1, ROAD_V.z1]]) {
        line3(p, camera, [lane.offset, 0.023, z0], [lane.offset, 0.023, z1], {
          color: 'rgba(239,233,216,0.18)', width: 0.7, alpha: 0.38,
          dash: [3.5, 8], jitter: 0.15, seed: 140 + lane.offset, double: false,
        });
      }
    }
  }

  // Four straight zebra crossings, one on each approach.
  for (const id of ['west', 'east', 'north', 'south']) {
    const c = CROSSWALKS[id];
    const alongX = id === 'west' || id === 'east';
    const count = 9;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const alpha = 0.58 + 0.18 * (1 - Math.abs(t - 0.5) * 2);
      if (alongX) {
        const z = lerp(c.z0 + 0.8, c.z1 - 0.8, t);
        const x = (c.x0 + c.x1) / 2;
        stripe(p, camera, x, z, 0, (c.x1 - c.x0) * 0.84, 0.58, {
          alpha, seed: 200 + i + (id === 'east' ? 30 : 0), jitter: 0.4,
        });
      } else {
        const x = lerp(c.x0 + 0.8, c.x1 - 0.8, t);
        const z = (c.z0 + c.z1) / 2;
        stripe(p, camera, x, z, Math.PI / 2, (c.z1 - c.z0) * 0.84, 0.58, {
          alpha, seed: 260 + i + (id === 'south' ? 30 : 0), jitter: 0.4,
        });
      }
    }
  }

  // Stop lines before the crosswalks.
  const stops = [
    [[-8.9, 0.04, -3.4], [-8.9, 0.04, 3.4]],
    [[8.9, 0.04, -3.4], [8.9, 0.04, 3.4]],
    [[-3.4, 0.041, -8.9], [3.4, 0.041, -8.9]],
    [[-3.4, 0.041, 8.9], [3.4, 0.041, 8.9]],
  ];
  for (let i = 0; i < stops.length; i++) {
    line3(p, camera, stops[i][0], stops[i][1], {
      color: 'rgba(239,233,216,0.36)', width: 1.0, alpha: 0.48,
      jitter: 0.2, seed: 320 + i, double: false,
    });
  }

  // Direction arrows on the two horizontal lanes.
  for (const lane of LANES.filter((l) => l.axis === 'x')) {
    const x = lane.dir > 0 ? -17 : 17;
    const s = lane.dir > 0 ? 1 : -1;
    p.projectLine(camera, [
      v3(x - s * 1.0, 0.045, lane.offset - 0.7),
      v3(x + s * 0.55, 0.045, lane.offset),
      v3(x - s * 1.0, 0.045, lane.offset + 0.7),
    ], {
      color: 'rgba(239,233,216,0.20)', width: 0.85, alpha: 0.42,
      jitter: 0.18, seed: 340 + lane.offset, double: false,
    });
  }

  // Manhole covers.
  for (const [x, z] of [[-14, 2.4], [15, -2.4], [-3, -15], [3, 15]]) {
    const q = camera.project(v3(x, 0.045, z));
    if (!q) continue;
    const r = 0.65 * q.scale;
    p.ellipse(q.x, q.y, r, r * 0.34, {
      stroke: 'rgba(239,233,216,0.24)', width: 0.7, alpha: 0.55,
    });
  }
}

// STAGE 3 — buildings on the NE corner.
function drawAwning(p, camera, b) {
  const y = 2.05;
  let pts;
  if (b.face === 'south') {
    const zf = b.z + b.d / 2;
    pts = [v3(b.x - b.w * 0.44, y, zf), v3(b.x + b.w * 0.44, y, zf),
      v3(b.x + b.w * 0.44, y - 0.32, zf + 0.85), v3(b.x - b.w * 0.44, y - 0.32, zf + 0.85)];
  } else {
    const xf = b.x - b.w / 2;
    pts = [v3(xf, y, b.z - b.d * 0.44), v3(xf, y, b.z + b.d * 0.44),
      v3(xf - 0.85, y - 0.32, b.z + b.d * 0.44), v3(xf - 0.85, y - 0.32, b.z - b.d * 0.44)];
  }
  p.projectPoly(camera, pts, {
    fill: b.accent ? 'rgba(239,233,216,0.10)' : 'rgba(239,233,216,0.05)',
    stroke: b.accent ? accentColor(b.accent) : 'rgba(239,233,216,0.42)',
    width: 0.85, alpha: 0.85, jitter: 0.25, seed: 900 + b.h,
  });
}

function drawBuildingSign(p, camera, b) {
  const y = b.h * 0.62;
  let center, u, v;
  if (b.face === 'south') {
    center = v3(b.x, y, b.z + b.d / 2 + 0.06);
    u = v3(b.w * 0.72, 0, 0);
    v = v3(0, 1.05, 0);
  } else {
    center = v3(b.x - b.w / 2 - 0.06, y, b.z);
    u = v3(0, 0, b.d * 0.72);
    v = v3(0, 1.05, 0);
  }
  p.sign3D(camera, center, u, v, {
    fill: 'rgba(7,9,8,0.94)',
    stroke: 'rgba(239,233,216,0.72)',
    bar: b.accent ? accentColor(b.accent) : PALETTE.dim,
    glyphs: b.id === 'kiosk' ? 2 : 4,
    glyphColor: PALETTE.ink,
    seed: 940 + b.h,
    width: 1.0,
    alpha: 0.92,
    bracket: 0.35,
  });
}

export function drawBuildings(p, camera, timeline, params) {
  // Painter's algorithm across separate buildings. Previously they were drawn
  // in array order, so a near facade was overpainted by a far one and the
  // whole block read as transparent wireframes.
  const order = BUILDING_LOTS
    .map((b, idx) => ({ b, idx, d: Math.hypot(b.x - camera.eye.x, b.z - camera.eye.z) }))
    .sort((a, b) => b.d - a.d);
  for (const { b, idx: i } of order) {
    const faces = p.box(camera, [b.x, b.h / 2, b.z], [b.w, b.h, b.d], {
      shade: true,
      fillFor: (name) => (name === 'top'
        ? '#2b332a'
        : name === 'front' || name === 'back' ? '#212820' : '#121611'),
      stroke: 'rgba(239,233,216,0.34)',
      width: 0.95,
      alpha: 1,
      seed: 950 + i,
      jitter: 0.20,
      edgeAlpha: 0.55,
    });
    const visible = faces.filter((f) => f.visible).sort((a, b2) => b2.depth - a.depth);
    for (let f = 0; f < Math.min(2, visible.length); f++) {
      p.gridOnQuad(visible[f].quad, b.cols, b.rows, {
        fill: 'rgba(239,233,216,0.52)',
        stroke: 'rgba(12,15,11,0.85)',
        width: 0.7,
        alpha: 0.95,
        margin: 0.22,
        skip: (x, y) => hash21(x + i * 3.1, y * 5.7 + f) > 0.86,
      });
    }
    drawAwning(p, camera, b);
    drawBuildingSign(p, camera, b);
    // Roof parapet / small rooftop box.
    const roofY = b.h + 0.02;
    p.projectLine(camera, [
      v3(b.x - b.w / 2, roofY, b.z - b.d / 2),
      v3(b.x + b.w / 2, roofY, b.z - b.d / 2),
      v3(b.x + b.w / 2, roofY, b.z + b.d / 2),
      v3(b.x - b.w / 2, roofY, b.z + b.d / 2),
      v3(b.x - b.w / 2, roofY, b.z - b.d / 2),
    ], {
      color: 'rgba(239,233,216,0.38)', width: 0.8, alpha: 0.6,
      jitter: 0.18, seed: 980 + i, double: false,
    });
    if (i % 2 === 0) {
      p.box(camera, [b.x + b.w * 0.16, b.h + 0.45, b.z - b.d * 0.12], [b.w * 0.24, 0.9, b.d * 0.26], {
        fill: 'rgba(12,16,13,0.95)', stroke: 'rgba(239,233,216,0.40)',
        width: 0.7, alpha: 0.85, seed: 990 + i, jitter: 0.15, edgeAlpha: 0.6,
      });
    }
    if (b.accent) {
      const col = accentColor(b.accent);
      if (b.face === 'south') {
        line3(p, camera, [b.x - b.w / 2, b.h * 0.82, b.z + b.d / 2 + 0.03],
          [b.x + b.w / 2, b.h * 0.82, b.z + b.d / 2 + 0.03], {
            color: col, width: 1.1, alpha: 0.5, jitter: 0.2, seed: 1000 + i, double: false,
          });
      } else {
        line3(p, camera, [b.x - b.w / 2 - 0.03, b.h * 0.82, b.z - b.d / 2],
          [b.x - b.w / 2 - 0.03, b.h * 0.82, b.z + b.d / 2], {
            color: col, width: 1.1, alpha: 0.5, jitter: 0.2, seed: 1010 + i, double: false,
          });
      }
    }
  }
}

// Traffic lights: four poles at the four intersection corners only.
function drawSignalHead(p, camera, center, u, v, walk, stop, seed) {
  const q = p.sign3D(camera, center, u, v, {
    fill: 'rgba(5,6,5,0.96)',
    stroke: 'rgba(239,233,216,0.82)',
    glyphs: 0,
    seed,
    width: 1.0,
    alpha: 0.96,
  });
  if (!q) return;
  const lamps = [
    { v: 0.20, color: stop > 0.5 ? PALETTE.red : 'rgba(212,59,48,0.16)' },
    { v: 0.50, color: 'rgba(239,233,216,0.20)' },
    { v: 0.80, color: walk > 0.5 ? PALETTE.teal : 'rgba(43,184,174,0.16)' },
  ];
  for (let i = 0; i < lamps.length; i++) {
    const [x, y] = quadLerp(q.quad, 0.5, lamps[i].v);
    const r = clamp(q.scale * 0.055, 1.4, 5.5);
    p.ellipse(x, y, r, r, {
      fill: lamps[i].color,
      stroke: 'rgba(239,233,216,0.55)',
      width: 0.6,
      alpha: 0.9,
    });
  }
  if (walk > 0.5) {
    const [x, y] = quadLerp(q.quad, 0.5, 0.80);
    p.ellipse(x, y, clamp(q.scale * 0.12, 4, 14), clamp(q.scale * 0.12, 4, 14), {
      stroke: PALETTE.teal, width: 0.6, alpha: walk * 0.22,
    });
  } else {
    const [x, y] = quadLerp(q.quad, 0.5, 0.20);
    p.ellipse(x, y, clamp(q.scale * 0.12, 4, 14), clamp(q.scale * 0.12, 4, 14), {
      stroke: PALETTE.red, width: 0.6, alpha: stop * 0.18,
    });
  }
}

export function drawTrafficLights(p, camera, timeline, params) {
  const walk = timeline.walkSignal();
  const stop = timeline.stopSignal();
  for (let i = 0; i < SIGNAL_POSITIONS.length; i++) {
    const s = SIGNAL_POSITIONS[i];
    // Pole on the sidewalk corner, arm and head over the kerb.
    line3(p, camera, [s.x, 0.4, s.z], [s.x, 4.15, s.z], {
      color: 'rgba(239,233,216,0.58)', width: 1.1, alpha: 0.78,
      jitter: 0.18, seed: 1100 + i, double: false,
    });
    const cx = s.x + s.toward.x * 1.35;
    const cz = s.z + s.toward.z * 1.35;
    line3(p, camera, [s.x, 3.95, s.z], [cx, 3.72, cz], {
      color: 'rgba(239,233,216,0.52)', width: 0.85, alpha: 0.72,
      jitter: 0.15, seed: 1110 + i, double: false,
    });
    const u = v3(Math.cos(s.yaw) * 0.9, 0, Math.sin(s.yaw) * 0.9);
    const v = v3(0, 1.5, 0);
    drawSignalHead(p, camera, v3(cx, 3.55, cz), u, v, walk, stop, 1120 + i);

    // Smaller pedestrian head lower on the same pole.
    const pu = v3(Math.cos(s.yaw + Math.PI / 2) * 0.55, 0, Math.sin(s.yaw + Math.PI / 2) * 0.55);
    const pv = v3(0, 0.85, 0);
    drawSignalHead(p, camera, v3(s.x + s.toward.x * 0.35, 2.35, s.z + s.toward.z * 0.35), pu, pv, walk, stop, 1140 + i);
  }
}

export function drawStreetFurniture(p, camera, timeline, params) {
  // Lamp posts on the built-out corner only.
  for (const [x, z, dx, dz] of [
    [10.2, -10.5, 0.9, 0], [17.5, -10.5, -0.9, 0],
    [10.2, -18.5, 0.9, 0], [26.0, -10.5, -0.9, 0],
  ]) {
    line3(p, camera, [x, 0.4, z], [x, 3.4, z], {
      color: 'rgba(239,233,216,0.52)', width: 0.9, alpha: 0.7,
      jitter: 0.15, seed: 1200 + x + z, double: false,
    });
    line3(p, camera, [x, 3.4, z], [x + dx, 3.55, z + dz], {
      color: 'rgba(239,233,216,0.48)', width: 0.8, alpha: 0.65,
      jitter: 0.15, seed: 1210 + x + z, double: false,
    });
    const q = camera.project(v3(x + dx, 3.52, z + dz));
    if (q) p.ellipse(q.x, q.y, 2.4, 1.3, {
      fill: 'rgba(239,233,216,0.20)', stroke: 'rgba(239,233,216,0.55)',
      width: 0.6, alpha: 0.62,
    });
  }

  // Benches, planters and a simple bus shelter.
  for (const [x, z, w, d] of [[14.5, -10.6, 1.8, 0.5], [22.5, -18.5, 1.8, 0.5]]) {
    p.box(camera, [x, 0.62, z], [w, 0.34, d], {
      fill: 'rgba(20,25,21,0.92)', stroke: 'rgba(239,233,216,0.42)',
      width: 0.7, alpha: 0.8, seed: 1230 + x + z, jitter: 0.2, edgeAlpha: 0.55,
    });
  }
  for (const [x, z] of [[9.6, -12.0], [9.6, -16.5], [18.5, -9.7]]) {
    p.box(camera, [x, 0.62, z], [0.9, 0.5, 0.9], {
      fill: 'rgba(18,23,19,0.95)', stroke: 'rgba(43,184,174,0.48)',
      width: 0.7, alpha: 0.75, seed: 1240 + x + z, jitter: 0.2, edgeAlpha: 0.55,
    });
  }
  // Bus shelter frame on the corner's south frontage.
  const sx = 20.0, sz = -9.6;
  for (const ox of [-1.4, 1.4]) {
    line3(p, camera, [sx + ox, 0.4, sz], [sx + ox, 2.5, sz], {
      color: 'rgba(239,233,216,0.55)', width: 0.8, alpha: 0.65,
      jitter: 0.12, seed: 1250 + ox, double: false,
    });
  }
  p.projectPoly(camera, [
    v3(sx - 1.6, 2.5, sz - 0.35), v3(sx + 1.6, 2.5, sz - 0.35),
    v3(sx + 1.6, 2.5, sz + 0.35), v3(sx - 1.6, 2.5, sz + 0.35),
  ], {
    fill: 'rgba(43,184,174,0.12)', stroke: 'rgba(239,233,216,0.50)',
    width: 0.8, alpha: 0.7, jitter: 0.15, seed: 1260,
  });
}

export function drawWires(p, camera, timeline, params) {
  for (let i = 0; i < WIRES.length; i++) {
    const w = WIRES[i];
    const pts = [];
    for (let j = 0; j <= 18; j++) {
      const t = j / 18;
      const x = lerp(-30, 30, t);
      const y = w.y - Math.sin(t * Math.PI) * w.sag;
      pts.push(v3(x, y, w.z));
    }
    p.projectLine(camera, pts, {
      color: i % 3 === 0 ? 'rgba(43,184,174,0.28)' : 'rgba(239,233,216,0.24)',
      width: 0.6 + (i % 2) * 0.15, alpha: 0.62,
      jitter: 0.15, seed: w.seed, double: false,
    });
  }
  for (const x of [-22, -6, 10, 26]) {
    line3(p, camera, [x, 0.4, -9.5], [x, 8.5, -9.5], {
      color: 'rgba(239,233,216,0.24)', width: 0.8, alpha: 0.55,
      jitter: 0.18, seed: 1270 + x, double: false,
    });
    const q = camera.project(v3(x, 8.5, -9.5));
    if (q) p.ellipse(q.x, q.y, 1.8, 1.8, { fill: PALETTE.ink, stroke: false, alpha: 0.4 });
  }
}

export function drawTrack(p, camera, timeline, params) {
  const y = 7.4;
  const z = -10.0;
  for (const zz of [z - 1.1, z + 1.1]) {
    line3(p, camera, [-34, y, zz], [34, y, zz], {
      color: 'rgba(239,233,216,0.42)', width: 0.95, alpha: 0.58,
      jitter: 0.2, seed: 1280 + zz, double: false,
    });
  }
  for (let x = -32; x <= 32; x += 2.4) {
    line3(p, camera, [x, y, z - 1.1], [x, y, z + 1.1], {
      color: 'rgba(239,233,216,0.18)', width: 0.6, alpha: 0.5,
      jitter: 0.12, seed: 1290 + x, double: false,
    });
  }
  for (let x = -24; x <= 24; x += 8) {
    line3(p, camera, [x, y, z - 1.1], [x, 0.4, z - 1.1], {
      color: 'rgba(239,233,216,0.16)', width: 0.7, alpha: 0.42,
      jitter: 0.15, seed: 1300 + x, double: false,
    });
  }
}

export function drawEnvironment(p, camera, timeline, params) {
  drawBackdrop(p, camera, timeline, params);
  drawHorizon(p, camera, timeline, params);
  drawBlockout(p, camera, timeline, params);
  drawRoadMarkings(p, camera, timeline, params);
  drawBuildings(p, camera, timeline, params);
  drawTrafficLights(p, camera, timeline, params);
  drawStreetFurniture(p, camera, timeline, params);
  drawWires(p, camera, timeline, params);
  drawTrack(p, camera, timeline, params);
}
