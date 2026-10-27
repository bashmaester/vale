// A compact, believable street set: two crossing roads, four sidewalk blocks,
// straight crosswalks, low buildings and signs that live in world space.
import { PALETTE } from './draw.js';
import { v3, makeRng, hash21, clamp, lerp, quadLerp } from './math.js';
import { SIDEWALKS, CROSSWALKS, LANES, INTERSECTION, ROAD } from './world.js';

const rng = makeRng(20261027);

const BUILDING_SPECS = [
  // North facade, facing the camera across the far road.
  { x: -24, z: -16.5, w: 5.0, d: 6.2, h: 8.2, facing: 'z+' },
  { x: -18, z: -17.0, w: 4.6, d: 6.0, h: 10.4, facing: 'z+' },
  { x: -12, z: -16.2, w: 4.2, d: 5.8, h: 7.4, facing: 'z+' },
  { x: 12, z: -16.2, w: 4.2, d: 5.8, h: 7.8, facing: 'z+' },
  { x: 18, z: -17.0, w: 4.6, d: 6.0, h: 10.0, facing: 'z+' },
  { x: 24, z: -16.5, w: 5.0, d: 6.2, h: 8.6, facing: 'z+' },
  // Side streets.
  { x: -25, z: -3.5, w: 6.0, d: 4.4, h: 6.8, facing: 'x+' },
  { x: -25, z: 3.5, w: 6.0, d: 4.4, h: 6.2, facing: 'x+' },
  { x: 25, z: -3.5, w: 6.0, d: 4.4, h: 7.0, facing: 'x-' },
  { x: 25, z: 3.5, w: 6.0, d: 4.4, h: 6.4, facing: 'x-' },
  // Low foreground corners frame the plate without hiding the crossing.
  { x: -20, z: 20.5, w: 5.2, d: 4.6, h: 5.4, facing: 'z-' },
  { x: 20, z: 20.5, w: 5.2, d: 4.6, h: 5.2, facing: 'z-' },
];
const BUILDINGS = BUILDING_SPECS.map((b, i) => ({
  ...b,
  cols: rng.int(2, 4),
  rows: rng.int(3, 5),
  seed: i * 7.3 + 2,
  accent: rng.pick([null, null, PALETTE.red, PALETTE.teal]),
}));

const WIRES = [];
for (let i = 0; i < 6; i++) {
  WIRES.push({ y: 8.8 + i * 0.36, z: -13.0 - i * 0.62, sag: 0.9 + i * 0.08, seed: 40 + i });
}

function stripe(p, camera, cx, cz, angle, len, wid, opts = {}) {
  const dx = Math.cos(angle), dz = Math.sin(angle);
  const nx = -dz, nz = dx;
  const L = len / 2, W = wid / 2;
  const y = 0.022;
  const pts = [
    v3(cx - dx * L - nx * W, y, cz - dz * L - nz * W),
    v3(cx + dx * L - nx * W, y, cz + dz * L - nz * W),
    v3(cx + dx * L + nx * W, y, cz + dz * L + nz * W),
    v3(cx - dx * L + nx * W, y, cz - dz * L + nz * W),
  ];
  return p.projectPoly(camera, pts, {
    fill: opts.fill || 'rgba(239,233,216,0.82)',
    stroke: opts.stroke || 'rgba(255,250,235,0.68)',
    width: opts.width || 0.85,
    alpha: opts.alpha == null ? 1 : opts.alpha,
    jitter: opts.jitter == null ? 0.5 : opts.jitter,
    seed: opts.seed || cx * 3 + cz,
  });
}

function line3(p, camera, a, b, opts = {}) {
  p.projectLine(camera, [v3(...a), v3(...b)], opts);
}

export function drawHorizon(p, camera, timeline, params) {
  const W = p.W, H = p.H;
  for (let i = 0; i < 10; i++) {
    const y = H * (0.05 + i * 0.018) + Math.sin(i * 3.1) * 3;
    const x0 = W * (0.04 + hash21(i, 4) * 0.18);
    const x1 = W * (0.72 + hash21(i, 9) * 0.24);
    p.line([[x0, y], [x1, y + hash21(i, 7) * 2]], {
      color: i % 5 === 0 ? PALETTE.teal : PALETTE.dim,
      width: 0.6 + hash21(i, 2) * 0.6,
      alpha: 0.08 + hash21(i, 11) * 0.12,
      jitter: 0.25, seed: i * 2.3, double: false,
    });
  }
}

export function drawRoad(p, camera, timeline, params) {
  // Base ground, then the two asphalt strips.
  p.projectPoly(camera, [
    v3(ROAD.x0, 0, ROAD.z0), v3(ROAD.x1, 0, ROAD.z0),
    v3(ROAD.x1, 0, ROAD.z1), v3(ROAD.x0, 0, ROAD.z1),
  ], { fill: '#080b09', stroke: null, jitter: 0, alpha: 1 });
  p.projectPoly(camera, [
    v3(ROAD.x0, 0.005, INTERSECTION.z0), v3(ROAD.x1, 0.005, INTERSECTION.z0),
    v3(ROAD.x1, 0.005, INTERSECTION.z1), v3(ROAD.x0, 0.005, INTERSECTION.z1),
  ], { fill: '#0b0e0c', stroke: null, jitter: 0, alpha: 1 });
  p.projectPoly(camera, [
    v3(INTERSECTION.x0, 0.006, ROAD.z0), v3(INTERSECTION.x1, 0.006, ROAD.z0),
    v3(INTERSECTION.x1, 0.006, ROAD.z1), v3(INTERSECTION.x0, 0.006, ROAD.z1),
  ], { fill: '#0a0d0b', stroke: null, jitter: 0, alpha: 1 });

  // Center double lines, interrupted through the intersection.
  for (const z of [-0.32, 0.32]) {
    line3(p, camera, [ROAD.x0, 0.02, z], [INTERSECTION.x0 - 0.6, 0.02, z], {
      color: 'rgba(239,233,216,0.42)', width: 0.9, alpha: 0.55, jitter: 0.3, seed: 10 + z, double: false,
    });
    line3(p, camera, [INTERSECTION.x1 + 0.6, 0.02, z], [ROAD.x1, 0.02, z], {
      color: 'rgba(239,233,216,0.42)', width: 0.9, alpha: 0.55, jitter: 0.3, seed: 20 + z, double: false,
    });
  }
  for (const x of [-0.32, 0.32]) {
    line3(p, camera, [x, 0.021, ROAD.z0], [x, 0.021, INTERSECTION.z0 - 0.6], {
      color: 'rgba(239,233,216,0.36)', width: 0.85, alpha: 0.48, jitter: 0.3, seed: 30 + x, double: false,
    });
    line3(p, camera, [x, 0.021, INTERSECTION.z1 + 0.6], [x, 0.021, ROAD.z1], {
      color: 'rgba(239,233,216,0.36)', width: 0.85, alpha: 0.48, jitter: 0.3, seed: 40 + x, double: false,
    });
  }

  // Lane dividers: dashed and only outside the junction box.
  for (const lane of LANES) {
    const z = lane.z;
    const segments = lane.dir > 0
      ? [[ROAD.x0, INTERSECTION.x0 - 1], [INTERSECTION.x1 + 1, ROAD.x1]]
      : [[ROAD.x0, INTERSECTION.x0 - 1], [INTERSECTION.x1 + 1, ROAD.x1]];
    for (const [x0, x1] of segments) {
      line3(p, camera, [x0, 0.018, z], [x1, 0.018, z], {
        color: 'rgba(239,233,216,0.24)', width: 0.75, alpha: 0.42,
        dash: [4.5, 9], jitter: 0.2, seed: 60 + z, double: false,
      });
    }
  }

  // Manhole covers.
  for (const [x, z] of [[-15, 3.2], [15, -3.2], [-4, 14], [4, -14]]) {
    const q = camera.project(v3(x, 0.02, z));
    if (!q) continue;
    const r = 0.7 * q.scale;
    p.ellipse(q.x, q.y, r, r * 0.32, {
      stroke: 'rgba(239,233,216,0.30)', width: 0.8, alpha: 0.65,
    });
  }
}

export function drawSidewalks(p, camera, timeline, params) {
  for (let i = 0; i < SIDEWALKS.length; i++) {
    const s = SIDEWALKS[i];
    const quad = p.groundQuad(camera, s.x0, s.z0, s.x1, s.z1, {
      y: 0.055,
      fill: 'rgba(17,22,18,0.97)',
      stroke: 'rgba(239,233,216,0.42)',
      width: 1.0,
      alpha: 0.97,
      seed: 700 + i,
      jitter: 0.3,
    });
    // Slab joints.
    if (quad) {
      for (let k = 1; k < 6; k++) {
        const v = k / 6;
        p.line([quadLerp(quad, 0.02, v), quadLerp(quad, 0.98, v)], {
          color: 'rgba(239,233,216,0.14)', width: 0.65, alpha: 0.65,
          jitter: 0.2, seed: 720 + i * 10 + k, double: false,
        });
      }
      for (let k = 1; k < 5; k++) {
        const u = k / 5;
        p.line([quadLerp(quad, u, 0.02), quadLerp(quad, u, 0.98)], {
          color: 'rgba(239,233,216,0.10)', width: 0.6, alpha: 0.55,
          jitter: 0.2, seed: 780 + i * 10 + k, double: false,
        });
      }
    }
    // Road-facing curbs.
    const edgeX = s.x1 < 0 ? s.x1 : s.x0;
    const edgeZ = s.z1 < 0 ? s.z1 : s.z0;
    line3(p, camera, [edgeX, 0.08, s.z0], [edgeX, 0.08, s.z1], {
      color: 'rgba(239,233,216,0.65)', width: 1.35, alpha: 0.75, jitter: 0.3, seed: 810 + i, double: false,
    });
    line3(p, camera, [s.x0, 0.08, edgeZ], [s.x1, 0.08, edgeZ], {
      color: 'rgba(239,233,216,0.65)', width: 1.35, alpha: 0.75, jitter: 0.3, seed: 820 + i, double: false,
    });
  }
  // Tactile paving at the four curb ramps.
  for (const [sx, sz, ax] of [[-10.4, 9.2, 1], [10.4, 9.2, -1], [-10.4, -9.2, 1], [10.4, -9.2, -1]]) {
    for (let k = 0; k < 5; k++) {
      const x = sx + ax * k * 0.35;
      line3(p, camera, [x, 0.075, sz - 0.18], [x, 0.075, sz + 0.18], {
        color: 'rgba(239,233,216,0.35)', width: 0.6, alpha: 0.55,
        jitter: 0.15, seed: 850 + k + sx, double: false,
      });
    }
  }
}

export function drawZebra(p, camera, timeline, params) {
  // Four straight zebra crossings, one on each approach.
  for (const [id, vertical] of [['south', true], ['north', true], ['west', false], ['east', false]]) {
    const c = CROSSWALKS[id];
    const count = vertical ? 11 : 11;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      if (vertical) {
        const x = lerp(c.x0 + 0.7, c.x1 - 0.7, t);
        const z = (c.z0 + c.z1) / 2;
        stripe(p, camera, x, z, Math.PI / 2, (c.z1 - c.z0) * 0.86, 0.75, {
          alpha: 0.72, seed: 100 + i + (id === 'north' ? 30 : 0), jitter: 0.55,
        });
      } else {
        const z = lerp(c.z0 + 0.7, c.z1 - 0.7, t);
        const x = (c.x0 + c.x1) / 2;
        stripe(p, camera, x, z, 0, (c.x1 - c.x0) * 0.86, 0.75, {
          alpha: 0.72, seed: 200 + i + (id === 'east' ? 30 : 0), jitter: 0.55,
        });
      }
    }
  }
  // Two faint diagonal scramble guides.
  for (const ang of [Math.PI / 4, -Math.PI / 4]) {
    for (let i = -5; i <= 5; i++) {
      const t = i / 5;
      stripe(p, camera, t * 8.0, (ang > 0 ? -t : t) * 8.0, ang, 5.6, 0.50, {
        alpha: 0.16 + 0.08 * (1 - Math.abs(t)),
        fill: 'rgba(239,233,216,0.18)', stroke: 'rgba(239,233,216,0.30)',
        seed: 300 + i + (ang > 0 ? 0 : 40), jitter: 0.4,
      });
    }
  }
  // Small chevron core.
  for (let k = 0; k < 3; k++) {
    const s = 2.4 + k * 2.2;
    p.projectLine(camera, [v3(0, 0.03, -s), v3(s, 0.03, 0), v3(0, 0.03, s), v3(-s, 0.03, 0), v3(0, 0.03, -s)], {
      color: k % 2 ? 'rgba(43,184,174,0.35)' : 'rgba(239,233,216,0.38)',
      width: 0.9, alpha: 0.45, jitter: 0.4, seed: 400 + k, double: false,
    });
  }
}

export function drawRoadDetails(p, camera, timeline, params) {
  // Stop lines before each crosswalk.
  const stopLines = [
    [[-8.2, CROSSWALKS.south.z0 - 0.55], [8.2, CROSSWALKS.south.z0 - 0.55]],
    [[-8.2, CROSSWALKS.north.z1 + 0.55], [8.2, CROSSWALKS.north.z1 + 0.55]],
    [[CROSSWALKS.west.x1 + 0.55, -8.2], [CROSSWALKS.west.x1 + 0.55, 8.2]],
    [[CROSSWALKS.east.x0 - 0.55, -8.2], [CROSSWALKS.east.x0 - 0.55, 8.2]],
  ];
  for (let i = 0; i < stopLines.length; i++) {
    const [a, b] = stopLines[i];
    line3(p, camera, [a[0], 0.03, a[1]], [b[0], 0.03, b[1]], {
      color: 'rgba(239,233,216,0.42)', width: 1.15, alpha: 0.48,
      jitter: 0.3, seed: 801 + i, double: false,
    });
  }
  // Lane direction arrows.
  for (const lane of LANES) {
    const x = lane.dir > 0 ? -16 : 16;
    const s = lane.dir > 0 ? 1 : -1;
    p.projectLine(camera, [
      v3(x - s * 1.1, 0.03, lane.z - 0.8),
      v3(x + s * 0.6, 0.03, lane.z),
      v3(x - s * 1.1, 0.03, lane.z + 0.8),
    ], {
      color: 'rgba(239,233,216,0.24)', width: 0.9, alpha: 0.45,
      jitter: 0.25, seed: 820 + lane.z, double: false,
    });
  }
  // Puddles: irregular flat outlines, kept because they read well.
  const puddles = [[-14, 5.6], [13, -5.4], [-5, 7.0], [16, 6.2], [-18, -6.2], [6, -6.8]];
  for (let i = 0; i < puddles.length; i++) {
    const [x, z] = puddles[i];
    const q = camera.project(v3(x, 0.035, z));
    if (!q) continue;
    const r = q.scale * (0.85 + hash21(i, 3) * 0.65);
    p.ellipse(q.x, q.y, r, r * 0.32, {
      stroke: i % 3 === 0 ? 'rgba(43,184,174,0.30)' : 'rgba(239,233,216,0.20)',
      width: 0.75, alpha: 0.55, rot: (hash21(i, 7) - 0.5) * 0.5,
    });
    p.ellipse(q.x, q.y, r * 0.55, r * 0.16, {
      stroke: 'rgba(239,233,216,0.12)', width: 0.6, alpha: 0.48,
    });
  }
}

function drawAwning(p, camera, b) {
  const y = 2.15;
  let pts;
  if (b.facing === 'z+') {
    const zf = b.z + b.d / 2;
    pts = [v3(b.x - b.w * 0.46, y, zf), v3(b.x + b.w * 0.46, y, zf),
      v3(b.x + b.w * 0.46, y - 0.35, zf + 0.9), v3(b.x - b.w * 0.46, y - 0.35, zf + 0.9)];
  } else if (b.facing === 'z-') {
    const zf = b.z - b.d / 2;
    pts = [v3(b.x - b.w * 0.46, y, zf), v3(b.x + b.w * 0.46, y, zf),
      v3(b.x + b.w * 0.46, y - 0.35, zf - 0.9), v3(b.x - b.w * 0.46, y - 0.35, zf - 0.9)];
  } else if (b.facing === 'x+') {
    const xf = b.x + b.w / 2;
    pts = [v3(xf, y, b.z - b.d * 0.46), v3(xf, y, b.z + b.d * 0.46),
      v3(xf + 0.9, y - 0.35, b.z + b.d * 0.46), v3(xf + 0.9, y - 0.35, b.z - b.d * 0.46)];
  } else {
    const xf = b.x - b.w / 2;
    pts = [v3(xf, y, b.z - b.d * 0.46), v3(xf, y, b.z + b.d * 0.46),
      v3(xf - 0.9, y - 0.35, b.z + b.d * 0.46), v3(xf - 0.9, y - 0.35, b.z - b.d * 0.46)];
  }
  p.projectPoly(camera, pts, {
    fill: b.accent ? `${b.accent}33` : 'rgba(239,233,216,0.07)',
    stroke: 'rgba(239,233,216,0.45)', width: 0.8, alpha: 0.85,
    jitter: 0.3, seed: b.seed + 44,
  });
}

export function drawBuildings(p, camera, timeline, params) {
  for (let i = 0; i < BUILDINGS.length; i++) {
    const b = BUILDINGS[i];
    const faces = p.box(camera, [b.x, b.h / 2, b.z], [b.w, b.h, b.d], {
      fill: '#070908', stroke: 'rgba(239,233,216,0.42)',
      width: 0.95, alpha: 0.92, seed: b.seed, jitter: 0.25, edgeAlpha: 0.6,
    });
    const visible = faces.filter((f) => f.visible).sort((a, b2) => b2.depth - a.depth);
    for (let f = 0; f < Math.min(2, visible.length); f++) {
      p.gridOnQuad(visible[f].quad, b.cols, b.rows, {
        fill: 'rgba(239,233,216,0.06)', stroke: 'rgba(239,233,216,0.26)',
        width: 0.5, alpha: 0.7, margin: 0.22,
        skip: (x, y) => hash21(x + i * 3.1, y * 5.7 + f) > 0.82,
      });
    }
    drawAwning(p, camera, b);
    if (i % 3 === 0) {
      p.projectLine(camera, [v3(b.x, b.h, b.z), v3(b.x + 0.2, b.h + 1.5, b.z)], {
        color: PALETTE.dim, width: 0.7, alpha: 0.45, jitter: 0.2, seed: i, double: false,
      });
    }
    if (b.accent) {
      p.projectLine(camera, [
        v3(b.x - b.w / 2, b.h * 0.78, b.z + b.d / 2 + 0.02),
        v3(b.x + b.w / 2, b.h * 0.78, b.z + b.d / 2 + 0.02),
      ], { color: b.accent, width: 1.2, alpha: 0.55, jitter: 0.25, seed: i + 9, double: false });
    }
  }
}

export function drawStreetFurniture(p, camera, timeline, params) {
  // Lamp posts at curb corners.
  for (const [x, z, dx, dz] of [
    [-10.2, 9.0, 1.1, 0], [10.2, 9.0, -1.1, 0],
    [-10.2, -9.0, 1.1, 0], [10.2, -9.0, -1.1, 0],
    [-19, 9.0, 0, 0.8], [19, 9.0, 0, 0.8],
  ]) {
    line3(p, camera, [x, 0.1, z], [x, 3.1, z], {
      color: 'rgba(239,233,216,0.48)', width: 0.9, alpha: 0.7, jitter: 0.2, seed: 930 + x + z, double: false,
    });
    line3(p, camera, [x, 3.1, z], [x + dx, 3.25, z + dz], {
      color: 'rgba(239,233,216,0.42)', width: 0.8, alpha: 0.65, jitter: 0.2, seed: 940 + x + z, double: false,
    });
    const q = camera.project(v3(x + dx, 3.22, z + dz));
    if (q) p.ellipse(q.x, q.y, 2.4, 1.4, { fill: 'rgba(239,233,216,0.25)', stroke: 'rgba(239,233,216,0.55)', width: 0.6, alpha: 0.65 });
  }
  // A few benches / planters give the sidewalk scale without clutter.
  for (const [x, z, w, d] of [[-16, 11.2, 1.8, 0.55], [16, 11.2, 1.8, 0.55], [-16, -11.2, 1.8, 0.55], [16, -11.2, 1.8, 0.55]]) {
    p.box(camera, [x, 0.36, z], [w, 0.34, d], {
      fill: 'rgba(20,25,21,0.9)', stroke: 'rgba(239,233,216,0.38)',
      width: 0.7, alpha: 0.7, seed: 950 + x + z, jitter: 0.25, edgeAlpha: 0.5,
    });
  }
}

export function drawWires(p, camera, timeline, params) {
  for (let i = 0; i < WIRES.length; i++) {
    const w = WIRES[i];
    const pts = [];
    for (let j = 0; j <= 18; j++) {
      const t = j / 18;
      const x = lerp(-29, 29, t);
      const y = w.y - Math.sin(t * Math.PI) * w.sag;
      pts.push(v3(x, y, w.z));
    }
    p.projectLine(camera, pts, {
      color: i % 3 === 0 ? 'rgba(43,184,174,0.32)' : 'rgba(239,233,216,0.28)',
      width: 0.65 + (i % 2) * 0.2, alpha: 0.7,
      jitter: 0.2, seed: w.seed, double: false,
    });
  }
  for (const x of [-20, -4, 12, 25]) {
    line3(p, camera, [x, 0, -13], [x, 9.5, -13], {
      color: 'rgba(239,233,216,0.28)', width: 0.9, alpha: 0.6, jitter: 0.25, seed: x, double: false,
    });
    const q = camera.project(v3(x, 9.5, -13));
    if (q) p.ellipse(q.x, q.y, 2.0, 2.0, { fill: PALETTE.ink, stroke: false, alpha: 0.45 });
  }
}

// Signs are world-space oriented quads. yaw rotates the horizontal axis; the
// normal follows from cross(u, up), so the sign turns away from the camera.
function signBasis(yaw, w, h) {
  return {
    u: v3(Math.cos(yaw) * w, 0, Math.sin(yaw) * w),
    v: v3(0, h, 0),
  };
}

export function drawSigns(p, camera, timeline, params) {
  const signs = [
    { c: [-17.5, 5.4, -13.1], w: 4.6, h: 1.3, yaw: 0, bar: PALETTE.teal, glyphs: 4, seed: 11 },
    { c: [-11.5, 4.5, -13.0], w: 2.2, h: 2.4, yaw: 0, bar: PALETTE.red, glyphs: 2, seed: 27 },
    { c: [4.5, 6.2, -13.2], w: 5.2, h: 1.5, yaw: 0, bar: PALETTE.teal, glyphs: 5, seed: 43 },
    { c: [16.5, 5.0, -13.1], w: 3.8, h: 1.2, yaw: 0, bar: PALETTE.red, glyphs: 3, seed: 58 },
    { c: [-21.7, 4.4, -3.0], w: 3.6, h: 1.1, yaw: -Math.PI / 2, bar: PALETTE.teal, glyphs: 3, seed: 71 },
    { c: [21.7, 4.8, 3.0], w: 3.4, h: 1.1, yaw: Math.PI / 2, bar: PALETTE.red, glyphs: 3, seed: 83 },
    { c: [0, 8.6, -13.8], w: 11.5, h: 0.8, yaw: 0, bar: PALETTE.teal, glyphs: 7, seed: 91, alpha: 0.72 },
  ];
  for (const s of signs) {
    const { u, v } = signBasis(s.yaw, s.w, s.h);
    p.sign3D(camera, v3(...s.c), u, v, {
      fill: 'rgba(7,9,8,0.94)', stroke: 'rgba(239,233,216,0.78)',
      bar: s.bar, glyphs: s.glyphs, glyphColor: PALETTE.ink,
      seed: s.seed, width: 1.2, alpha: s.alpha == null ? 0.94 : s.alpha,
      bracket: 0.55,
    });
  }
}

export function drawSignals(p, camera, timeline, params) {
  const walk = timeline.walkSignal();
  const stop = timeline.stopSignal();
  const corners = [
    [-10.2, 10.0, 0], [10.2, 10.0, 0],
    [-10.2, -10.0, 0], [10.2, -10.0, 0],
    [-11.4, 0, 1], [11.4, 0, -1],
  ];
  for (let i = 0; i < corners.length; i++) {
    const [x, z, side] = corners[i];
    const y = 3.45;
    line3(p, camera, [x, 0, z], [x, y - 0.7, z], {
      color: 'rgba(239,233,216,0.62)', width: 1.1, alpha: 0.78, jitter: 0.25, seed: i + 5, double: false,
    });
    const housing = side ? [0.42, 1.35, 0.75] : [0.75, 1.35, 0.42];
    p.box(camera, [x, y, z], housing, {
      fill: PALETTE.black, stroke: 'rgba(239,233,216,0.8)',
      width: 0.9, alpha: 0.9, seed: i + 20, jitter: 0.3, edgeAlpha: 0.6,
    });
    const q = camera.project(v3(x, y, z));
    if (!q) continue;
    const s = clamp(q.scale / 18, 0.45, 1.5);
    const r = 3.2 * s;
    p.ellipse(q.x, q.y - r * 1.35, r, r, {
      fill: stop > 0.5 ? PALETTE.red : 'rgba(212,59,48,0.18)',
      stroke: 'rgba(239,233,216,0.55)', width: 0.7 * s, alpha: 0.9,
    });
    p.ellipse(q.x, q.y + r * 1.35, r, r, {
      fill: walk > 0.5 ? PALETTE.teal : 'rgba(43,184,174,0.16)',
      stroke: 'rgba(239,233,216,0.55)', width: 0.7 * s, alpha: 0.9,
    });
    if (walk > 0.5) {
      p.ellipse(q.x, q.y + r * 1.35, r * 1.9, r * 1.9, { stroke: PALETTE.teal, width: 0.7, alpha: walk * 0.28 });
    } else {
      p.ellipse(q.x, q.y - r * 1.35, r * 1.9, r * 1.9, { stroke: PALETTE.red, width: 0.7, alpha: stop * 0.24 });
    }
  }
}

export function drawTrack(p, camera, timeline, params) {
  const y = 7.35;
  for (const z of [-9.6, -7.4]) {
    line3(p, camera, [-34, y, z], [34, y, z], {
      color: 'rgba(239,233,216,0.48)', width: 1.0, alpha: 0.6, jitter: 0.3, seed: z, double: false,
    });
  }
  for (let x = -32; x <= 32; x += 2.2) {
    line3(p, camera, [x, y, -9.6], [x, y, -7.4], {
      color: 'rgba(239,233,216,0.22)', width: 0.65, alpha: 0.55, jitter: 0.2, seed: x, double: false,
    });
  }
  for (let x = -24; x <= 24; x += 8) {
    line3(p, camera, [x, y, -9.6], [x, 0, -9.6], {
      color: 'rgba(239,233,216,0.18)', width: 0.75, alpha: 0.45, jitter: 0.25, seed: x + 3, double: false,
    });
  }
}

export function drawEnvironment(p, camera, timeline, params) {
  drawHorizon(p, camera, timeline, params);
  drawRoad(p, camera, timeline, params);
  drawSidewalks(p, camera, timeline, params);
  drawZebra(p, camera, timeline, params);
  drawRoadDetails(p, camera, timeline, params);
  drawBuildings(p, camera, timeline, params);
  drawStreetFurniture(p, camera, timeline, params);
  drawWires(p, camera, timeline, params);
  drawSigns(p, camera, timeline, params);
  drawTrack(p, camera, timeline, params);
  drawSignals(p, camera, timeline, params);
}
