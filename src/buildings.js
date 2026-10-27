// One building lot, drawn from any of its four faces.
//
// A lot is a box with a facade: `face` says which side of the box the shopfront,
// windows, awning and signs look out of, so a block that faces four streets can
// show a front on all of them. Everything on the facade is placed through
// `quadLerp` on the projected face quad, so it inherits the face's winding and
// needs no special case per direction; the handful of details that have to hang
// off the wall (awning, canopy, blade sign, downpipes) are placed in wall
// coordinates (u along the wall, v height) and get the lot's outward normal.

import { v3, clamp, lerp, hash21, quadLerp } from './math.js';


const BONE = (a = 1) => `rgba(239,233,216,${a})`;
const RED = (a = 1) => `rgba(212,59,48,${a})`;
const TEAL = (a = 1) => `rgba(43,184,174,${a})`;
const EMBER = (a = 1) => `rgba(216,160,58,${a})`;

const RGB = {
  red: '212,59,48', teal: '43,184,174', ember: '216,160,58', bone: '239,233,216',
};

const SHADE = {
  building: '#16171c',
};

// Distance tone: a block three streets away should sit back into the night,
// otherwise every tile competes for the same attention and the set reads as a
// wall of boxes rather than as a city.
function dimmed(hex, dim = 0) {
  if (!dim) return hex;
  const k = 1 - clamp(dim, 0, 1) * 0.62;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}

function glow(p, x, y, r, rgb, a) {
  if (r < 0.5) return;
  const g = p.ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  const prev = p.ctx.fillStyle;
  p.ctx.fillStyle = g;
  p.ctx.beginPath();
  p.ctx.arc(x, y, r, 0, Math.PI * 2);
  p.ctx.fill();
  p.ctx.fillStyle = prev;
}

function glowAt(p, camera, point3, radius, tint, alpha) {
  const q = camera.project(point3);
  if (!q) return;
  glow(p, q.x, q.y, q.scale * radius * 2.2, RGB[tint] || RGB.bone, alpha);
}

const FACES = {
  n: { n: v3(0, 0, -1), t: v3(1, 0, 0), box: 'back' },
  s: { n: v3(0, 0, 1), t: v3(1, 0, 0), box: 'front' },
  w: { n: v3(-1, 0, 0), t: v3(0, 0, -1), box: 'left' },
  e: { n: v3(1, 0, 0), t: v3(0, 0, 1), box: 'right' },
};

// The frame a lot's facade lives in.
function frameOf(b) {
  const f = FACES[b.face] || FACES.s;
  const alongX = f.n.x !== 0;
  const halfN = (alongX ? b.w : b.d) / 2;   // distance from centre to the facade
  const halfT = (alongX ? b.d : b.w) / 2;   // half the facade's width
  return { ...f, halfN, halfT, alongX };
}

function drawWindows(p, b, face, detail, seed) {
  const cols = Math.max(1, Math.round((detail.windows == null ? 1 : detail.windows) * b.cols));
  const rows = Math.max(1, Math.round((detail.windows == null ? 1 : detail.windows) * b.rows));
  const lit = detail.windowLight == null ? 1 : detail.windowLight;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const h = hash21(c * 3.7 + seed, r * 5.1 + b.h);
      const u0 = (c + 0.16) / cols, u1 = (c + 0.84) / cols;
      const v0 = (r + 0.16) / rows, v1 = (r + 0.66) / rows;
      const quad = [
        quadLerp(face.quad, u0, v0), quadLerp(face.quad, u1, v0),
        quadLerp(face.quad, u1, v1), quadLerp(face.quad, u0, v1),
      ];
      const isLit = h < 0.17 * lit;
      const fill = isLit
        ? (h < 0.04 ? 'rgba(190,140,52,0.86)' : 'rgba(206,198,180,0.72)')
        : (hash21(c + 4.1, r + 8.3) > 0.72 ? 'rgba(38,120,114,0.55)' : 'rgba(7,9,10,0.97)');
      p.poly(quad, { fill, stroke: BONE(isLit ? 0.48 : 0.22), width: 0.5, jitter: 0.16, seed: seed + c * 3 + r * 7 });
      if (detail.windows > 0.5) {
        p.line([quadLerp(face.quad, (u0 + u1) / 2, v0), quadLerp(face.quad, (u0 + u1) / 2, v1)],
          { color: BONE(0.20), width: 0.45, alpha: 0.85, jitter: 0.1, seed: seed + c + 1, double: false });
      }
      p.line([quadLerp(face.quad, u0 - 0.02, v1), quadLerp(face.quad, u1 + 0.02, v1)],
        { color: BONE(0.26), width: 0.5, alpha: 0.8, jitter: 0.1, seed: seed + c + 2, double: false });
      if (b.rows >= 4 && r % 2 === 1 && detail.props > 0.5) {
        const vb = Math.min(1, v1 + 0.035);
        p.line([quadLerp(face.quad, u0 - 0.04, vb), quadLerp(face.quad, u1 + 0.04, vb)],
          { color: BONE(0.34), width: 0.7, alpha: 0.8, jitter: 0.1, seed: seed + c + 3, double: false });
      }
    }
  }
}

function drawShopfront(p, camera, b, face, detail, seed) {
  if (!b.shop || !face) return;
  const h = b.h;
  const gy0 = 1 - 3.05 / h;
  const gy1 = 1 - 0.18 / h;
  p.poly([
    quadLerp(face.quad, 0.06, gy0), quadLerp(face.quad, 0.94, gy0),
    quadLerp(face.quad, 0.94, gy1), quadLerp(face.quad, 0.06, gy1),
  ], { fill: 'rgba(4,6,5,0.94)', stroke: BONE(0.34), width: 0.8, jitter: 0.3, seed: seed + 1 });

  const panes = detail.windows > 0.6 && h * 1 < 1e9 ? 5 : 3;
  const warm = b.accent === 'red';
  for (let i = 0; i < panes; i++) {
    const u0 = 0.09 + i * (0.82 / panes);
    const u1 = u0 + (0.82 / panes) * 0.80;
    const v0 = gy0 + 0.02, v1 = gy1 - 0.02;
    p.poly([
      quadLerp(face.quad, u0, v0), quadLerp(face.quad, u1, v0),
      quadLerp(face.quad, u1, v1), quadLerp(face.quad, u0, v1),
    ], {
      fill: i === 1 && !warm ? TEAL(0.20) : (warm ? EMBER(0.15) : BONE(0.12)),
      stroke: BONE(0.5), width: 0.6, jitter: 0.16, seed: seed + 10 + i,
    });
    const vt = v0 + (v1 - v0) * 0.30;
    p.line([quadLerp(face.quad, u0, vt), quadLerp(face.quad, u1, vt)], {
      color: 'rgba(6,9,7,0.85)', width: 1.4, alpha: 0.9, jitter: 0.1, seed: seed + 15 + i, double: false,
    });
    if (detail.props > 0.5 && (i === 1 || i === 3)) {
      const fx = (u0 + u1) / 2;
      const q0 = quadLerp(face.quad, fx, v0 + 0.02);
      p.line([q0, quadLerp(face.quad, fx, v0 + 0.10)], {
        color: 'rgba(4,6,5,0.8)', width: 2.2, alpha: 0.9, jitter: 0.1, seed: seed + 25 + i, double: false,
      });
      p.ellipse(q0[0], q0[1], 1.6, 1.6, { fill: 'rgba(4,6,5,0.85)', stroke: false, alpha: 0.9 });
    }
  }
  // Door on the right.
  p.poly([
    quadLerp(face.quad, 0.80, gy0 + 0.012), quadLerp(face.quad, 0.93, gy0 + 0.012),
    quadLerp(face.quad, 0.93, gy1 - 0.01), quadLerp(face.quad, 0.80, gy1 - 0.01),
  ], { fill: 'rgba(7,10,8,0.96)', stroke: BONE(0.55), width: 0.7, jitter: 0.2, seed: seed + 30 });
  if (detail.props > 0.5) {
    for (let i = 0; i < 3; i++) {
      const u0 = 0.12 + i * 0.11;
      const u1 = u0 + 0.085;
      p.poly([
        quadLerp(face.quad, u0, gy0 + 0.002), quadLerp(face.quad, u1, gy0 + 0.002),
        quadLerp(face.quad, u1, gy0 + 0.06), quadLerp(face.quad, u0, gy0 + 0.06),
      ], { fill: i === 1 ? RED(0.72) : TEAL(0.55), stroke: BONE(0.4), width: 0.5, jitter: 0.18, seed: seed + 40 + i });
    }
  }
}

// Awning: a strip that leans out of the wall. Placed in wall coordinates so it
// works on any face.
function drawAwning(p, camera, b, fr, seed) {
  if (!b.shop && !b.awning) return;
  const warm = b.accent === 'red';
  const y = Math.min(3.35, b.h * 0.82);
  const aw = fr.halfT * 0.8;
  const P = (a, yy, out) => v3(
    b.x + fr.n.x * (fr.halfN + out) + fr.t.x * a,
    yy,
    b.z + fr.n.z * (fr.halfN + out) + fr.t.z * a,
  );
  const aq = p.projectPoly(camera, [
    P(-aw, y, 0.02), P(aw, y, 0.02), P(aw, y - 0.30, 0.95), P(-aw, y - 0.30, 0.95),
  ], {
    fill: warm ? 'rgba(212,59,48,0.30)' : 'rgba(43,184,174,0.26)',
    stroke: warm ? RED(0.9) : TEAL(0.9), width: 0.9, alpha: 0.95, jitter: 0.3, seed: seed + 50,
  });
  if (aq) {
    for (let i = 1; i < 6; i++) {
      const t = i / 6;
      p.line([quadLerp(aq, t, 0), quadLerp(aq, t, 1)], {
        color: warm ? RED(0.45) : TEAL(0.4), width: 0.5, alpha: 0.7, jitter: 0.15,
        seed: seed + 55 + i, double: false,
      });
    }
  }
  // Light spilling onto the pavement.
  const q = camera.project(P(0, 0.2, 0.5));
  if (q) glow(p, q.x, q.y, q.scale * 2.4, RGB[warm ? 'ember' : 'teal'], 0.18);
}

function drawRoof(p, camera, b, fr, detail, seed) {
  const y = b.h;
  const P = (a, out, yy) => v3(
    b.x + fr.n.x * (fr.halfN + out) + fr.t.x * a,
    yy,
    b.z + fr.n.z * (fr.halfN + out) + fr.t.z * a,
  );
  const hw = fr.halfT * 0.98;
  p.projectLine(camera, [
    P(-hw, 0.1, y + 0.18), P(hw, 0.1, y + 0.18), P(hw, -0.1, y + 0.18), P(-hw, -0.1, y + 0.18), P(-hw, 0.1, y + 0.18),
  ], { color: BONE(0.36), width: 0.9, alpha: 0.85, jitter: 0.2, seed: seed + 1, double: false });
  for (let i = 0; i <= 5; i++) {
    const a = lerp(-hw, hw, i / 5);
    p.projectLine(camera, [P(a, 0.1, y), P(a, 0.1, y + 0.7)], {
      color: BONE(0.20), width: 0.55, alpha: 0.8, jitter: 0.12, seed: seed + 10 + i, double: false,
    });
  }
  p.projectLine(camera, [P(-hw, 0.1, y + 0.7), P(hw, 0.1, y + 0.7)], {
    color: BONE(0.24), width: 0.6, alpha: 0.8, jitter: 0.15, seed: seed + 20, double: false,
  });
  // Rooftop boxes and a water tank.
  const boxes = b.roofTank ? 2 : 1;
  for (let i = 0; i < boxes; i++) {
    const off = (b.w * 0.18) * (i === 0 ? -1 : 1) * (fr.alongX ? 0.2 : 1);
    p.box(camera, [
      b.x + fr.t.x * (fr.halfT * 0.4 * (i === 0 ? -1 : 1)),
      y + 0.52,
      b.z - b.d * 0.12,
    ], [b.w * 0.18, 0.9, b.d * 0.22], {
      fill: '#0b100c', stroke: BONE(0.28), width: 0.6, alpha: 0.9,
      seed: seed + 30 + i, jitter: 0.2, edgeAlpha: 0.6, edges: false,
    });
  }
  if (b.roofTank) {
    const tz = b.z - b.d * 0.14;
    p.box(camera, [b.x + b.w * 0.16, y + 0.55 + 0.55, tz], [b.w * 0.2, 1.1, b.d * 0.24], {
      fill: '#0d130f', stroke: BONE(0.34), width: 0.7, alpha: 0.92,
      seed: seed + 40, jitter: 0.18, edgeAlpha: 0.7, edges: false,
    });
    p.projectLine(camera, [v3(b.x + b.w * 0.16, y, tz), v3(b.x + b.w * 0.16, y + 0.55, tz)], {
      color: BONE(0.25), width: 0.6, alpha: 0.8, jitter: 0.15, seed: seed + 41, double: false,
    });
  }
  p.projectLine(camera, [P(fr.halfT * 0.5, -0.3, y), P(fr.halfT * 0.5, -0.3, y + 2.1)], {
    color: BONE(0.30), width: 0.6, alpha: 0.8, jitter: 0.18, seed: seed + 50, double: false,
  });
  if (detail.windows > 0.5) glowAt(p, camera, P(fr.halfT * 0.5, -0.3, y + 2.15), 0.5, 'red', 0.5);
}

function drawSignBox(p, camera, at, w, h, d, tint, seed) {
  const faces = p.box(camera, [at.x, at.y, at.z], [w, h, d], {
    fill: tint === 'red' ? 'rgba(150,36,30,0.92)' : 'rgba(26,120,114,0.92)',
    stroke: BONE(0.72), width: 0.9, alpha: 0.96, seed, jitter: 0.2, edgeAlpha: 0.8,
  });
  const front = faces.find((f) => f.visible && (f.name === 'front' || f.name === 'right'));
  if (front) {
    const n = Math.max(2, Math.round(h * 1.4));
    for (let i = 0; i < n; i++) {
      const v = 0.08 + (i + 0.5) * (0.84 / n);
      p.line([quadLerp(front.quad, 0.2, v), quadLerp(front.quad, 0.8, v)], {
        color: 'rgba(6,9,7,0.92)', width: 1.4, alpha: 0.95, jitter: 0.12,
        seed: seed + i * 7, double: false,
      });
    }
  }
  const c = camera.project(v3(at.x + w * 0.4, at.y, at.z + d * 0.4));
  if (c) glow(p, c.x, c.y, c.scale * h * 0.9, RGB[tint] || RGB.bone, 0.16);
  return faces;
}

/** Draw one lot. `seed` keeps the hand-drawn jitter deterministic. */
export function drawLot(p, camera, b, detail, seed = 1) {
  const fr = frameOf(b);
  // How tall the lot actually is on screen. Every detail below is gated on it:
  // a block that is forty pixels tall cannot carry a window sill, and drawing
  // one anyway is what makes a city of tiles read as a wireframe.
  const probe = camera.project(v3(b.x, b.h, b.z));
  const px = probe && Number.isFinite(probe.scale) ? b.h * probe.scale : 0;
  // `edges: false`: only the faces facing the camera get an outline. Drawing
  // the hidden edges makes every block read as a glass box.
  const faces = p.box(camera, [b.x, b.h / 2, b.z], [b.w, b.h, b.d], {
    fill: dimmed(SHADE.building, 1 - (detail.near == null ? 1 : detail.near)),
    stroke: BONE(0.42),
    width: 1.0, alpha: 1, seed, jitter: 0.2, edgeAlpha: 0.72, edges: false,
  });
  const visible = faces.filter((f) => f.visible && f.name !== 'top' && f.name !== 'bottom')
    .sort((a, b2) => a.depth - b2.depth);

  for (const f of visible) {
    p.poly(f.quad, {
      fill: f.name === fr.box ? 'rgba(32,32,38,0.55)' : 'rgba(13,13,17,0.45)',
      stroke: null, jitter: 0.6, seed: seed + (f.name === fr.box ? 1 : 2),
    });
  }

  // Windows on the facade, and a sparser grid on the neighbouring visible face
  // so a corner building is not one blank wall.
  // The facade must be a face the camera can actually see: painting windows on
  // the far wall makes the whole block read as glass.
  const named = faces.find((f) => f.name === fr.box);
  const facade = named && named.visible ? named : visible[0];
  const lit = !!facade;
  const order = [facade, ...visible.filter((f) => f !== facade)].filter(Boolean);
  for (let fi = 0; fi < Math.min(2, order.length); fi++) {
    const f = order[fi];
    const small = px < 34;
    const useDetail = small
      ? { ...detail, windows: (detail.windows || 1) * 0.55, props: 0 }
      : detail;
    const sideDetail = fi === 0 ? useDetail : {
      ...detail,
      windows: (detail.windows || 1) * 0.5,
      windowLight: (detail.windowLight || 1) * 0.6,
      props: 0,
    };
    if (!small || fi === 0) drawWindows(p, b, f, sideDetail, seed + fi * 31);
  }

  if (facade && px > 26) {
    const floors = Math.max(2, b.rows);
    for (let r = 1; r < floors; r++) {
      const v = r / floors;
      p.line([quadLerp(facade.quad, 0.02, v), quadLerp(facade.quad, 0.98, v)], {
        color: BONE(0.10), width: 0.55, alpha: 0.85, jitter: 0.18, seed: seed + 600 + r, double: false,
      });
    }
    if (b.rows >= 3 && px > 46) {
      const bays = Math.max(2, Math.round(b.cols * (detail.windows || 1)));
      for (let c = 1; c < bays; c++) {
        const u = c / bays;
        p.line([quadLerp(facade.quad, u, 0.06), quadLerp(facade.quad, u, 0.60)], {
          color: BONE(0.07), width: 0.5, alpha: 0.75, jitter: 0.14, seed: seed + 620 + c, double: false,
        });
      }
    }
  }

  // Cornice: a lip of volume at the roof line, just proud of the facade.
  if (px > 34) p.box(camera, [
    b.x + fr.n.x * (fr.halfN * 0.92),
    b.h - 0.16,
    b.z + fr.n.z * (fr.halfN * 0.92),
  ], fr.alongX
    ? [0.42, 0.34, b.d + 0.24]
    : [b.w + 0.24, 0.34, 0.42], {
    fill: '#111116', stroke: BONE(0.5), width: 0.8, alpha: 0.98,
    seed: seed + 560, jitter: 0.14, edgeAlpha: 0.75, edges: false,
  });

  drawShopfront(p, camera, b, facade, detail, seed + 100);

  const P = (a, yy, out) => v3(
    b.x + fr.n.x * (fr.halfN + out) + fr.t.x * a,
    yy,
    b.z + fr.n.z * (fr.halfN + out) + fr.t.z * a,
  );

  // Entrance canopy, door and address plate on the taller, non-shop blocks.
  if (!b.shop && facade && px > 40) {
    const gy1 = 1 - 0.2 / b.h;
    const gy0 = 1 - 2.6 / b.h;
    p.poly([
      quadLerp(facade.quad, 0.34, gy0), quadLerp(facade.quad, 0.52, gy0),
      quadLerp(facade.quad, 0.52, gy1), quadLerp(facade.quad, 0.34, gy1),
    ], { fill: 'rgba(5,7,6,0.9)', stroke: BONE(0.46), width: 0.7, jitter: 0.2, seed: seed + 570 });
    p.projectPoly(camera, [
      P(-fr.halfT * 0.18, 2.55, 0.02), P(fr.halfT * 0.02, 2.55, 0.02),
      P(fr.halfT * 0.02, 2.4, 1.0), P(-fr.halfT * 0.18, 2.4, 1.0),
    ], { fill: 'rgba(30,30,36,0.9)', stroke: BONE(0.42), width: 0.65, alpha: 0.95, jitter: 0.2, seed: seed + 571 });
    p.projectPoly(camera, [
      P(-fr.halfT * 0.2, 2.4, 0.03), P(0, 2.4, 0.03), P(0, 0.2, 0.03), P(-fr.halfT * 0.2, 0.2, 0.03),
    ], { fill: 'rgba(216,190,150,0.20)', stroke: BONE(0.5), width: 0.7, jitter: 0.2, seed: seed + 572 });
    glowAt(p, camera, P(-fr.halfT * 0.1, 1.2, 0.3), 0.9, 'ember', 0.22);
  }

  // Air conditioning units / balconies on the facade.
  if (detail.props > 0.5 && facade && b.rows >= 3) {
    for (let k = 0; k < 2; k++) {
      const u = 0.18 + k * 0.34;
      const v = 0.18 + (k % 2) * 0.16;
      p.poly([
        quadLerp(facade.quad, u, v), quadLerp(facade.quad, u + 0.09, v),
        quadLerp(facade.quad, u + 0.09, v + 0.08), quadLerp(facade.quad, u, v + 0.08),
      ], {
        fill: 'rgba(52,52,58,0.85)', stroke: BONE(0.34), width: 0.45,
        alpha: 0.9, jitter: 0.16, seed: seed + 580 + k,
      });
    }
  }

  // Vertical blade sign near the left front corner.
  if (b.verticalSign && b.accent && px > 30) {
    const at = P(-fr.halfT * 0.86, 3.0, 0.44);
    drawSignBox(p, camera, at, 0.58, 3.1, 0.58, b.accent, seed + 200);
  }

  // Horizontal fascia sign above the awning.
  if (b.shop && px > 22) {
    const c = P(0, Math.min(3.95, b.h * 0.92), 0.10);
    const u = v3(fr.t.x * fr.halfT * 1.32, 0, fr.t.z * fr.halfT * 1.32);
    p.sign3D(camera, c, u, v3(0, b.h > 4 ? 0.78 : 0.5, 0), {
      fill: 'rgba(7,10,8,0.96)',
      stroke: BONE(0.66), bar: b.accent === 'red' ? RED(0.9) : TEAL(0.9),
      glyphs: 3, glyphColor: BONE(0.9), seed: seed + 300, width: 0.9, alpha: 0.95,
    });
    glowAt(p, camera, c, 0.8, b.accent === 'red' ? 'red' : 'teal', 0.10);
  }

  drawAwning(p, camera, b, fr, seed + 400);

  // Downpipe on the left edge, accent stripe on the leading corner.
  if (px > 30) p.projectLine(camera, [P(-fr.halfT * 0.94, 0.2, 0.03), P(-fr.halfT * 0.94, b.h - 0.2, 0.03)], {
    color: BONE(0.26), width: 0.8, alpha: 0.85, jitter: 0.14, seed: seed + 310, double: false,
  });
  if (b.accent && px > 30) {
    p.projectLine(camera, [P(-fr.halfT, 0.3, 0.04), P(-fr.halfT, b.h * 0.94, 0.04)], {
      color: b.accent === 'red' ? RED(0.5) : TEAL(0.5), width: 1.4, alpha: 0.7,
      jitter: 0.15, seed: seed + 320, double: false,
    });
  }

  if (detail.props > 0.3) drawRoof(p, camera, b, fr, detail, seed + 400);

  // Rim lights: the top edge of the facade and its leading vertical.
  p.projectLine(camera, [
    P(-fr.halfT, b.h, 0.02), P(fr.halfT, b.h, 0.02), P(fr.halfT, 0, 0.02),
  ], { color: BONE(0.60), width: 1.25, alpha: 0.9, jitter: 0.16, seed: seed + 500, double: false });
}

export { glow, glowAt, RGB, FACES };
