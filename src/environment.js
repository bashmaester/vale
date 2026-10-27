import { PALETTE } from './draw.js';
import { v3, makeRng, hash21, clamp, lerp } from './math.js';

const rng = makeRng(20241027);
const BUILDINGS = [];
for (let i = 0; i < 12; i++) {
  BUILDINGS.push({
    x: -23 + i * 4.1 + rng.range(-0.35, 0.35),
    z: -15.5 - rng.range(0, 2.8),
    w: rng.range(3.0, 4.6),
    d: rng.range(3.0, 5.2),
    h: rng.range(6.2, 11.4),
    cols: rng.int(2, 4),
    rows: rng.int(3, 6),
    seed: i * 7.3 + 2,
    accent: rng.pick([null, null, PALETTE.red, PALETTE.teal]),
  });
}

const WIRES = [];
for (let i = 0; i < 7; i++) {
  WIRES.push({ y: 9.4 + i * 0.42, z: -13.2 - i * 0.75, sag: 1.1 + i * 0.08, seed: 40 + i });
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
    fill: opts.fill || 'rgba(239,233,216,0.88)',
    stroke: opts.stroke || 'rgba(255,250,235,0.75)',
    width: opts.width || 0.9,
    alpha: opts.alpha == null ? 1 : opts.alpha,
    jitter: opts.jitter == null ? 0.55 : opts.jitter,
    seed: opts.seed || cx * 3 + cz,
  });
}

export function drawHorizon(p, camera, timeline, params) {
  const W = p.W, H = p.H;
  // Distant signage glow, reduced to thin carved marks.
  for (let i = 0; i < 14; i++) {
    const y = H * (0.055 + i * 0.018) + Math.sin(i * 3.1) * 3;
    const x0 = W * (0.02 + hash21(i, 4) * 0.18);
    const x1 = W * (0.72 + hash21(i, 9) * 0.26);
    p.line([[x0, y], [x1, y + hash21(i, 7) * 2]], {
      color: i % 5 === 0 ? PALETTE.teal : PALETTE.dim,
      width: 0.6 + hash21(i, 2) * 0.7,
      alpha: 0.10 + hash21(i, 11) * 0.16,
      jitter: 0.3, seed: i * 2.3, double: false,
    });
  }
}

export function drawRoad(p, camera, timeline, params) {
  p.projectPoly(camera, [
    v3(-27, 0, -21), v3(27, 0, -21), v3(27, 0, 23), v3(-27, 0, 23),
  ], { fill: '#090b0a', stroke: null, jitter: 0, alpha: 1 });

  // Road edges and lane cuts.
  for (const z of [-18, -6, 6, 18]) {
    p.projectLine(camera, [v3(-27, 0.015, z), v3(27, 0.015, z)], {
      color: PALETTE.dim, width: 0.9, alpha: 0.30, jitter: 0.4, seed: z, double: false,
    });
  }
  for (let i = 0; i < 18; i++) {
    const x = -24 + i * 2.8;
    p.projectLine(camera, [v3(x, 0.016, -5.8), v3(x + 1.1, 0.016, -5.8)], {
      color: PALETTE.dim, width: 0.8, alpha: 0.28, jitter: 0.25, seed: i, double: false,
    });
    p.projectLine(camera, [v3(x, 0.016, 6.2), v3(x + 1.1, 0.016, 6.2)], {
      color: PALETTE.dim, width: 0.8, alpha: 0.22, jitter: 0.25, seed: i + 30, double: false,
    });
  }

  // Manhole covers.
  for (const [x, z] of [[-8, 2], [8, -2], [0, 9], [-15, -9], [15, 9]]) {
    const q = camera.project(v3(x, 0.02, z));
    if (!q) continue;
    const r = 0.75 * q.scale;
    p.ellipse(q.x, q.y, r, r * 0.32, {
      stroke: 'rgba(239,233,216,0.35)', width: 0.9, alpha: 0.7,
    });
    p.ellipse(q.x, q.y, r * 0.55, r * 0.18, {
      stroke: 'rgba(239,233,216,0.22)', width: 0.7, alpha: 0.6,
    });
  }
}

export function drawZebra(p, camera, timeline, params) {
  // Foreground crossing: vertical bands across the lower road.
  for (let i = 0; i < 15; i++) {
    const x = -18.2 + i * 2.6;
    stripe(p, camera, x, 11.6, Math.PI / 2, 8.4, 1.25, {
      alpha: 0.86, seed: 100 + i, jitter: 0.7,
    });
  }
  // Side crossings.
  for (const sx of [-15.2, 15.2]) {
    for (let i = 0; i < 11; i++) {
      const z = -12 + i * 2.45;
      stripe(p, camera, sx, z, 0, 7.2, 1.15, {
        alpha: 0.72, seed: 200 + i + (sx > 0 ? 20 : 0), jitter: 0.6,
      });
    }
  }
  // Diagonal scramble band.
  for (let i = -7; i <= 7; i++) {
    const t = i / 7;
    stripe(p, camera, t * 11.5, -t * 11.5, Math.PI / 4, 9.2, 1.0, {
      alpha: 0.30 + 0.20 * (1 - Math.abs(t)), seed: 300 + i, jitter: 0.5,
      fill: 'rgba(239,233,216,0.34)', stroke: 'rgba(239,233,216,0.45)',
    });
  }
  // Central diamond / chevron core.
  for (let k = 0; k < 5; k++) {
    const s = 2.6 + k * 2.5;
    const pts = [v3(0, 0.03, -s), v3(s, 0.03, 0), v3(0, 0.03, s), v3(-s, 0.03, 0), v3(0, 0.03, -s)];
    p.projectLine(camera, pts, {
      color: k % 2 ? 'rgba(43,184,174,0.55)' : 'rgba(239,233,216,0.62)',
      width: k === 0 ? 1.5 : 1.0, alpha: 0.55 + k * 0.05,
      jitter: 0.45, seed: 400 + k, double: false,
    });
  }
}

export function drawBuildings(p, camera, timeline, params) {
  for (let i = 0; i < BUILDINGS.length; i++) {
    const b = BUILDINGS[i];
    const faces = p.box(camera, [b.x, b.h / 2, b.z], [b.w, b.h, b.d], {
      fill: '#070908',
      stroke: 'rgba(239,233,216,0.48)',
      width: 1.0,
      alpha: 0.94,
      seed: b.seed,
      jitter: 0.28,
      edgeAlpha: 0.65,
    });
    const front = faces.find((f) => f.name === 'front' && f.visible);
    if (front) {
      p.gridOnQuad(front.quad, b.cols, b.rows, {
        fill: 'rgba(239,233,216,0.085)',
        stroke: 'rgba(239,233,216,0.32)',
        width: 0.55,
        alpha: 0.85,
        margin: 0.22,
        skip: (x, y) => hash21(x + i * 3.1, y * 5.7 + i) > 0.80,
      });
    }
    // Sparse rooftop antennae.
    if (i % 3 === 0) {
      p.projectLine(camera, [v3(b.x, b.h, b.z), v3(b.x + 0.2, b.h + 1.8, b.z)], {
        color: PALETTE.dim, width: 0.8, alpha: 0.55, jitter: 0.2, seed: i, double: false,
      });
    }
    // A thin accent band on a few facades.
    if (b.accent) {
      p.projectLine(camera, [
        v3(b.x - b.w / 2, b.h * 0.72, b.z + b.d / 2 + 0.02),
        v3(b.x + b.w / 2, b.h * 0.72, b.z + b.d / 2 + 0.02),
      ], { color: b.accent, width: 1.6, alpha: 0.75, jitter: 0.3, seed: i + 9, double: false });
    }
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
      color: i % 3 === 0 ? 'rgba(43,184,174,0.38)' : 'rgba(239,233,216,0.32)',
      width: 0.7 + (i % 2) * 0.2,
      alpha: 0.75,
      jitter: 0.22,
      seed: w.seed,
      double: false,
    });
  }
  for (const x of [-20, -4, 12, 25]) {
    p.projectLine(camera, [v3(x, 0, -13), v3(x, 10.4, -13)], {
      color: 'rgba(239,233,216,0.35)', width: 1.0, alpha: 0.7, jitter: 0.3, seed: x, double: false,
    });
    const q = camera.project(v3(x, 10.4, -13));
    if (q) p.ellipse(q.x, q.y, 2.2, 2.2, { fill: PALETTE.ink, stroke: false, alpha: 0.55 });
  }
}

export function drawSigns(p, camera, timeline, params) {
  const signs = [
    { c: [-8.5, 6.7, -11.6], w: 4.6, h: 1.25, bar: PALETTE.teal, glyphs: 4, seed: 11 },
    { c: [7.8, 7.4, -11.2], w: 3.8, h: 1.15, bar: PALETTE.red, glyphs: 3, seed: 27 },
    { c: [0, 5.2, -10.8], w: 5.4, h: 1.5, bar: PALETTE.teal, glyphs: 5, seed: 43, glyphColor: PALETTE.ink },
    { c: [-15.5, 4.6, -10.5], w: 2.2, h: 2.6, bar: PALETTE.red, glyphs: 2, seed: 58 },
    { c: [15.2, 5.0, -10.2], w: 2.4, h: 2.2, bar: PALETTE.teal, glyphs: 2, seed: 71 },
  ];
  for (const s of signs) {
    p.sign(camera, v3(...s.c), s.w, s.h, {
      fill: 'rgba(7,9,8,0.94)',
      stroke: 'rgba(239,233,216,0.85)',
      bar: s.bar,
      glyphs: s.glyphs,
      glyphColor: s.glyphColor || PALETTE.ink,
      seed: s.seed,
      width: 1.5,
      alpha: 0.95,
    });
  }
  // Long platform-like sign strip.
  p.sign(camera, v3(0, 9.1, -12.4), 12, 0.75, {
    fill: 'rgba(7,9,8,0.9)', stroke: 'rgba(239,233,216,0.55)', bar: PALETTE.teal,
    glyphs: 7, seed: 91, width: 1.0, alpha: 0.7,
  });
}

export function drawSignals(p, camera, timeline, params) {
  const walk = timeline.walkSignal();
  const stop = timeline.stopSignal();
  const corners = [[-13, 9], [13, 9], [-13, -9], [13, -9]];
  for (let i = 0; i < corners.length; i++) {
    const [x, z] = corners[i];
    p.projectLine(camera, [v3(x, 0, z), v3(x, 3.4, z)], {
      color: 'rgba(239,233,216,0.7)', width: 1.2, alpha: 0.8, jitter: 0.3, seed: i + 5, double: false,
    });
    const q = camera.project(v3(x, 3.5, z));
    if (!q) continue;
    const s = clamp(q.scale / 18, 0.45, 1.5);
    const w = 16 * s, h = 26 * s;
    p.rect(q.x - w / 2, q.y - h / 2, w, h, {
      fill: PALETTE.black, stroke: 'rgba(239,233,216,0.85)', width: 1.1 * s, seed: i + 20, jitter: 0.4,
    });
    // Two lamps: active one glows.
    p.ellipse(q.x, q.y - h * 0.22, w * 0.26, w * 0.26, {
      fill: stop > 0.5 ? PALETTE.red : 'rgba(212,59,48,0.18)',
      stroke: 'rgba(239,233,216,0.6)', width: 0.8 * s, alpha: 0.9,
    });
    p.ellipse(q.x, q.y + h * 0.18, w * 0.26, w * 0.26, {
      fill: walk > 0.5 ? PALETTE.teal : 'rgba(43,184,174,0.16)',
      stroke: 'rgba(239,233,216,0.6)', width: 0.8 * s, alpha: 0.9,
    });
    if (walk > 0.5) {
      p.ellipse(q.x, q.y + h * 0.18, w * 0.5, w * 0.5, {
        stroke: PALETTE.teal, width: 0.8, alpha: walk * 0.35,
      });
    } else {
      p.ellipse(q.x, q.y - h * 0.22, w * 0.5, w * 0.5, {
        stroke: PALETTE.red, width: 0.8, alpha: stop * 0.3,
      });
    }
  }
}

export function drawTrack(p, camera, timeline, params) {
  const y = 7.35;
  for (const z of [-9.6, -7.4]) {
    p.projectLine(camera, [v3(-34, y, z), v3(34, y, z)], {
      color: 'rgba(239,233,216,0.55)', width: 1.1, alpha: 0.65, jitter: 0.35, seed: z, double: false,
    });
  }
  for (let x = -32; x <= 32; x += 2.2) {
    p.projectLine(camera, [v3(x, y, -9.6), v3(x, y, -7.4)], {
      color: 'rgba(239,233,216,0.28)', width: 0.7, alpha: 0.6, jitter: 0.2, seed: x, double: false,
    });
  }
  for (let x = -24; x <= 24; x += 8) {
    p.projectLine(camera, [v3(x, y, -9.6), v3(x, 0, -9.6)], {
      color: 'rgba(239,233,216,0.22)', width: 0.8, alpha: 0.5, jitter: 0.3, seed: x + 3, double: false,
    });
  }
}

export function drawEnvironment(p, camera, timeline, params) {
  drawHorizon(p, camera, timeline, params);
  drawRoad(p, camera, timeline, params);
  drawZebra(p, camera, timeline, params);
  drawBuildings(p, camera, timeline, params);
  drawWires(p, camera, timeline, params);
  drawSigns(p, camera, timeline, params);
  drawTrack(p, camera, timeline, params);
  drawSignals(p, camera, timeline, params);
}
