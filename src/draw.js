import {
  clamp, lerp, hash11, hash21, valueNoise2, fbm2,
  v3, add3, sub3, scale3, dot3, norm3, cross3, quadLerp,
} from './math.js';

export const PALETTE = {
  bg: '#070807',
  ink: '#efe9d8',
  dim: '#5d6961',
  red: '#d43b30',
  teal: '#2bb8ae',
  black: '#050605',
};

const asArr = (p) => (Array.isArray(p) ? p : [p.x, p.y]);

export class Painter {
  constructor(ctx, W, H) {
    this.ctx = ctx;
    this.W = W;
    this.H = H;
    this.boil = 0;
  }
  setBoil(frame) { this.boil = frame; }

  _pre(opts = {}) {
    const c = this.ctx;
    c.save();
    c.globalAlpha = opts.alpha == null ? 1 : opts.alpha;
    c.globalCompositeOperation = opts.composite || 'source-over';
    c.lineJoin = 'round';
    c.lineCap = 'round';
    if (opts.dash) c.setLineDash(opts.dash);
    return c;
  }
  _post() { this.ctx.restore(); }

  // A hand-carved polyline. Points are in the current transform space.
  line(points, opts = {}) {
    const pts = points.map(asArr).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length < 2) return;
    const c = this._pre(opts);
    const color = opts.color || opts.stroke || PALETTE.ink;
    const width = opts.width == null ? 1.2 : opts.width;
    const jitter = opts.jitter == null ? 0.45 : opts.jitter;
    const seed = opts.seed == null ? 1 : opts.seed;
    const gap = opts.gap || 0;
    const boil = (opts.boil == null ? this.boil : opts.boil) * (opts.boilAmp == null ? 0.35 : opts.boilAmp);
    const rough = opts.rough !== false;

    const drawPass = (pass, alphaMul, offset) => {
      c.globalAlpha = (opts.alpha == null ? 1 : opts.alpha) * alphaMul;
      c.strokeStyle = color;
      c.lineWidth = Math.max(0.35, width * (1 - pass * 0.22));
      c.beginPath();
      let started = false;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const prev = pts[Math.max(0, i - 1)];
        const next = pts[Math.min(pts.length - 1, i + 1)];
        const dx = next[0] - prev[0], dy = next[1] - prev[1];
        const l = Math.hypot(dx, dy) || 1;
        const nx = -dy / l, ny = dx / l;
        const h1 = hash11(i * 3.17 + seed * 7.1 + pass * 13.7 + boil * 5.3) - 0.5;
        const h2 = hash11(i * 9.73 + seed * 19.3 + pass * 31.1 + boil * 2.1) - 0.5;
        const j = rough ? jitter : 0;
        const x = p[0] + nx * (h1 * j + offset) + h2 * j * 0.35;
        const y = p[1] + ny * (h1 * j + offset) + h1 * j * 0.35;
        if (gap > 0 && i > 0 && hash11(i * 5.7 + seed + pass * 3.1) < gap) {
          started = false;
          continue;
        }
        if (!started) { c.moveTo(x, y); started = true; }
        else c.lineTo(x, y);
      }
      c.stroke();
    };

    drawPass(0, 1, 0);
    if (opts.double !== false && width > 0.8) drawPass(1, 0.22, width * 0.32);
    this._post();
  }

  // Many plain segments in one path (fast details such as windows).
  batch(segments, opts = {}) {
    const c = this._pre(opts);
    c.strokeStyle = opts.color || opts.stroke || PALETTE.ink;
    c.lineWidth = opts.width == null ? 1 : opts.width;
    c.beginPath();
    for (const s of segments) {
      if (s.length < 2) continue;
      c.moveTo(s[0][0], s[0][1]);
      for (let i = 1; i < s.length; i++) c.lineTo(s[i][0], s[i][1]);
    }
    c.stroke();
    this._post();
  }

  poly(points, opts = {}) {
    const pts = points.map(asArr).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length < 3) return;
    const c = this._pre(opts);
    const jitter = opts.jitter == null ? 0.35 : opts.jitter;
    const seed = opts.seed == null ? 1 : opts.seed;
    const jpts = pts.map((p, i) => {
      if (!jitter) return p;
      const a = hash11(i * 4.7 + seed * 3.3) - 0.5;
      const b = hash11(i * 8.9 + seed * 11.1) - 0.5;
      return [p[0] + a * jitter, p[1] + b * jitter];
    });
    c.beginPath();
    c.moveTo(jpts[0][0], jpts[0][1]);
    for (let i = 1; i < jpts.length; i++) c.lineTo(jpts[i][0], jpts[i][1]);
    c.closePath();
    if (opts.fill) { c.fillStyle = opts.fill; c.fill(); }
    if (opts.stroke !== null && (opts.stroke || opts.fill == null)) {
      c.strokeStyle = opts.stroke || PALETTE.ink;
      c.lineWidth = opts.width == null ? 1.1 : opts.width;
      c.stroke();
    }
    this._post();
  }

  polys(polys, opts = {}) {
    const c = this._pre(opts);
    c.beginPath();
    for (const raw of polys) {
      const pts = raw.map(asArr).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
      if (pts.length < 3) continue;
      c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
      c.closePath();
    }
    if (opts.fill) { c.fillStyle = opts.fill; c.fill(); }
    if (opts.stroke) { c.strokeStyle = opts.stroke; c.lineWidth = opts.width == null ? 0.7 : opts.width; c.stroke(); }
    this._post();
  }

  ellipse(x, y, rx, ry, opts = {}) {
    const c = this._pre(opts);
    c.beginPath();
    c.ellipse(x, y, Math.max(0.2, rx), Math.max(0.2, ry), opts.rot || 0, 0, Math.PI * 2);
    if (opts.fill) { c.fillStyle = opts.fill; c.fill(); }
    c.strokeStyle = opts.stroke || opts.color || PALETTE.ink;
    c.lineWidth = opts.width == null ? 1 : opts.width;
    if (opts.stroke !== false) c.stroke();
    this._post();
  }

  rect(x, y, w, h, opts = {}) {
    this.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], opts);
  }

  // Project a 3D polyline and draw it.
  projectLine(camera, points3, opts = {}) {
    const pts = [];
    for (const p of points3) {
      const q = camera.project(p);
      if (q) pts.push([q.x, q.y]);
    }
    if (pts.length > 1) this.line(pts, opts);
  }

  projectPoly(camera, points3, opts = {}) {
    const pts = [];
    for (const p of points3) {
      const q = camera.project(p);
      if (!q) return null;
      pts.push([q.x, q.y]);
    }
    this.poly(pts, opts);
    return pts;
  }

  groundQuad(camera, x0, z0, x1, z1, opts = {}) {
    const y = opts.y == null ? 0.012 : opts.y;
    return this.projectPoly(camera, [
      v3(x0, y, z0), v3(x1, y, z0), v3(x1, y, z1), v3(x0, y, z1),
    ], opts);
  }

  // Returns projected faces; also draws the box when opts.draw is not false.
  box(camera, center, size, opts = {}) {
    const [cx, cy, cz] = center;
    const [w, h, d] = size;
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const P = [
      v3(cx - hw, cy - hh, cz - hd), // 0 BL back
      v3(cx + hw, cy - hh, cz - hd), // 1 BR back
      v3(cx + hw, cy + hh, cz - hd), // 2 TR back
      v3(cx - hw, cy + hh, cz - hd), // 3 TL back
      v3(cx - hw, cy - hh, cz + hd), // 4 BL front
      v3(cx + hw, cy - hh, cz + hd), // 5 BR front
      v3(cx + hw, cy + hh, cz + hd), // 6 TR front
      v3(cx - hw, cy + hh, cz + hd), // 7 TL front
    ];
    const faces = [
      { idx: [7, 6, 5, 4], n: v3(0, 0, 1), name: 'front' },
      { idx: [3, 2, 1, 0], n: v3(0, 0, -1), name: 'back' },
      { idx: [3, 7, 4, 0], n: v3(-1, 0, 0), name: 'left' },
      { idx: [2, 6, 5, 1], n: v3(1, 0, 0), name: 'right' },
      { idx: [3, 2, 6, 7], n: v3(0, 1, 0), name: 'top' },
      { idx: [0, 4, 5, 1], n: v3(0, -1, 0), name: 'bottom' },
    ];
    const out = [];
    for (const f of faces) {
      const pts3 = f.idx.map((i) => P[i]);
      const center3 = pts3.reduce((acc, p) => add3(acc, p), v3()).valueOf();
      center3.x /= 4; center3.y /= 4; center3.z /= 4;
      const toEye = sub3(camera.eye, center3);
      const visible = dot3(f.n, toEye) > 0;
      const proj = pts3.map((p) => camera.project(p));
      if (proj.some((p) => !p)) continue;
      const quad = proj.map((p) => [p.x, p.y]);
      const depth = proj.reduce((a, p) => a + p.depth, 0) / 4;
      out.push({ ...f, pts3, quad, depth, visible });
    }
    if (opts.draw !== false) {
      const fill = opts.fill || PALETTE.black;
      const stroke = opts.stroke == null ? PALETTE.ink : opts.stroke;
      const visible = out.filter((f) => f.visible).sort((a, b) => b.depth - a.depth);
      for (const f of visible) {
        this.poly(f.quad, {
          fill,
          stroke: opts.faces === false ? null : stroke,
          width: opts.width == null ? 1.1 : opts.width,
          alpha: opts.alpha == null ? 1 : opts.alpha,
          jitter: opts.jitter == null ? 0.22 : opts.jitter,
          seed: (opts.seed || 1) + f.idx[0] * 0.7,
          composite: opts.composite,
        });
      }
      if (opts.edges !== false) {
        const edges = [
          [0, 1], [1, 2], [2, 3], [3, 0],
          [4, 5], [5, 6], [6, 7], [7, 4],
          [0, 4], [1, 5], [2, 6], [3, 7],
        ];
        for (let i = 0; i < edges.length; i++) {
          const [a, b] = edges[i];
          this.projectLine(camera, [P[a], P[b]], {
            color: stroke,
            width: (opts.width == null ? 1.1 : opts.width) * 0.9,
            alpha: (opts.alpha == null ? 1 : opts.alpha) * (opts.edgeAlpha == null ? 0.85 : opts.edgeAlpha),
            seed: (opts.seed || 1) + i * 1.7,
            jitter: opts.jitter == null ? 0.3 : opts.jitter,
            double: false,
            composite: opts.composite,
          });
        }
      }
    }
    return out;
  }

  gridOnQuad(quad, cols, rows, opts = {}) {
    const margin = opts.margin == null ? 0.16 : opts.margin;
    const polys = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (opts.skip && opts.skip(x, y)) continue;
        const u0 = (x + margin) / cols, u1 = (x + 1 - margin) / cols;
        const v0 = (y + margin) / rows, v1 = (y + 1 - margin) / rows;
        polys.push([
          quadLerp(quad, u0, v0), quadLerp(quad, u1, v0),
          quadLerp(quad, u1, v1), quadLerp(quad, u0, v1),
        ]);
      }
    }
    this.polys(polys, opts);
    return polys;
  }

  // Abstract kanji-like glyph, built only from strokes.
  glyph(x, y, size, seed, opts = {}) {
    const s = size;
    const templates = [
      [[0.12, 0.18], [0.88, 0.18]],
      [[0.12, 0.5], [0.88, 0.5]],
      [[0.12, 0.82], [0.88, 0.82]],
      [[0.5, 0.1], [0.5, 0.9]],
      [[0.2, 0.25], [0.8, 0.75]],
      [[0.2, 0.75], [0.8, 0.25]],
      [[0.2, 0.2], [0.2, 0.8], [0.8, 0.8]],
      [[0.18, 0.35], [0.82, 0.35], [0.5, 0.35], [0.5, 0.85]],
      [[0.22, 0.22], [0.78, 0.22], [0.5, 0.5], [0.5, 0.85]],
    ];
    const count = 3 + Math.floor(hash11(seed * 3.3) * 3);
    const color = opts.color || opts.stroke || PALETTE.ink;
    for (let i = 0; i < count; i++) {
      const t = templates[Math.floor(hash11(seed * 7.1 + i * 13.7) * templates.length)];
      const pts = t.map((p, j) => [
        x + p[0] * s + (hash11(seed + i * 9 + j) - 0.5) * s * 0.06,
        y + p[1] * s + (hash11(seed + i * 17 + j) - 0.5) * s * 0.06,
      ]);
      this.line(pts, {
        color,
        width: (opts.width || 1.4) * (0.7 + hash11(seed + i) * 0.7),
        alpha: opts.alpha == null ? 1 : opts.alpha,
        seed: seed + i * 5,
        jitter: s * 0.025,
        double: false,
      });
    }
  }

  // Billboard sign in screen space, sized by perspective.
  sign(camera, center, w, h, opts = {}) {
    const q = camera.project(center);
    if (!q) return null;
    const pw = w * q.scale;
    const ph = h * q.scale;
    if (pw < 2 || ph < 2) return null;
    const x = q.x - pw / 2, y = q.y - ph / 2;
    const rot = (opts.rot || 0) + camera.roll * 0.25;
    const c = this.ctx;
    c.save();
    c.translate(q.x, q.y);
    c.rotate(rot);
    c.translate(-q.x, -q.y);
    this.rect(x, y, pw, ph, {
      fill: opts.fill || PALETTE.black,
      stroke: opts.stroke || PALETTE.ink,
      width: Math.max(0.8, opts.width || 1.4) * clamp(q.scale / 18, 0.5, 1.6),
      alpha: opts.alpha == null ? 1 : opts.alpha,
      seed: opts.seed || 1,
      jitter: 0.6,
    });
    if (opts.bar) {
      const bh = Math.max(2, ph * 0.14);
      this.rect(x + pw * 0.06, y + ph - bh * 1.6, pw * 0.88, bh, {
        fill: opts.bar, stroke: null, alpha: (opts.alpha == null ? 1 : opts.alpha) * 0.9,
      });
    }
    const n = opts.glyphs || 3;
    for (let i = 0; i < n; i++) {
      const gs = Math.min(pw / (n + 0.4), ph * 0.62);
      this.glyph(x + pw * 0.06 + i * (pw * 0.88 / n), y + ph * 0.12, gs, (opts.seed || 1) + i * 3.7, {
        color: opts.glyphColor || PALETTE.ink,
        width: Math.max(0.8, gs * 0.09),
        alpha: opts.alpha == null ? 1 : opts.alpha,
      });
    }
    c.restore();
    return { x, y, w: pw, h: ph, scale: q.scale };
  }

  // World-space oriented sign. u is the sign's full horizontal axis, v its
  // full vertical axis. The face is projected like any other 3D quad, so it
  // foreshortens and turns away instead of billboarding toward the camera.
  sign3D(camera, center, u, v, opts = {}) {
    const hu = scale3(u, 0.5), hv = scale3(v, 0.5);
    // Explicit TL, TR, BR, BL order for quadLerp().
    const TL = add3(sub3(center, hu), hv);
    const TR = add3(add3(center, hu), hv);
    const BR = sub3(add3(center, hu), hv);
    const BL = sub3(sub3(center, hu), hv);
    const pts3 = [TL, TR, BR, BL];
    const proj = pts3.map((p) => camera.project(p));
    if (proj.some((p) => !p)) return null;
    const quad = proj.map((p) => [p.x, p.y]);
    const normal = norm3(cross3(u, v));
    const toEye = sub3(camera.eye, center);
    const back = dot3(normal, toEye) < 0;
    const alpha = (opts.alpha == null ? 1 : opts.alpha) * (back ? 0.42 : 1);
    const seed = opts.seed || 1;
    const width = Math.max(0.6, (opts.width || 1.2) * clamp(proj[0].scale / 20, 0.45, 1.6));
    this.poly(quad, {
      fill: opts.fill || PALETTE.black,
      stroke: opts.stroke || PALETTE.ink,
      width, alpha, seed, jitter: 0.55,
    });
    if (opts.bar) {
      const bar = [
        quadLerp(quad, 0.06, 0.78), quadLerp(quad, 0.94, 0.78),
        quadLerp(quad, 0.94, 0.92), quadLerp(quad, 0.06, 0.92),
      ];
      this.poly(bar, { fill: opts.bar, stroke: null, alpha: alpha * 0.9 });
    }
    const templates = [
      [[0.12, 0.16], [0.88, 0.16]],
      [[0.12, 0.5], [0.88, 0.5]],
      [[0.12, 0.84], [0.88, 0.84]],
      [[0.5, 0.08], [0.5, 0.92]],
      [[0.2, 0.22], [0.8, 0.78]],
      [[0.2, 0.78], [0.8, 0.22]],
      [[0.2, 0.2], [0.2, 0.8], [0.8, 0.8]],
      [[0.18, 0.34], [0.82, 0.34], [0.5, 0.34], [0.5, 0.86]],
    ];
    const n = opts.glyphs || 3;
    for (let i = 0; i < n; i++) {
      const u0 = 0.06 + i * (0.88 / n);
      const u1 = u0 + (0.88 / n) * 0.82;
      const v0 = 0.10, v1 = 0.72;
      const count = 2 + Math.floor(hash11(seed * 3.1 + i * 7.7) * 2);
      for (let j = 0; j < count; j++) {
        const t = templates[Math.floor(hash11(seed * 9.3 + i * 17.1 + j * 31.7) * templates.length)];
        const pts = t.map((p, k) => quadLerp(
          quad,
          u0 + (u1 - u0) * (p[0] + (hash11(seed + j * 5 + k) - 0.5) * 0.05),
          v0 + (v1 - v0) * p[1],
        ));
        this.line(pts, {
          color: opts.glyphColor || PALETTE.ink,
          width: Math.max(0.55, width * 0.72),
          alpha: alpha * 0.92,
          seed: seed + i * 13 + j * 5,
          jitter: 0.35,
          double: false,
        });
      }
    }
    // Small mounting bracket back toward the wall.
    if (opts.bracket) {
      const nrm = scale3(normal, -opts.bracket);
      const a = add3(center, nrm);
      const b = add3(add3(center, scale3(u, 0.3)), nrm);
      this.projectLine(camera, [center, a, b], {
        color: opts.stroke || PALETTE.ink, width: 0.8, alpha: alpha * 0.7,
        jitter: 0.2, seed: seed + 91, double: false,
      });
    }
    return { quad, alpha, back, scale: proj[0].scale };
  }

  splash(x, y, r, opts = {}) {
    const c = this._pre(opts);
    c.strokeStyle = opts.color || PALETTE.ink;
    c.lineWidth = opts.width || 0.8;
    c.beginPath();
    c.ellipse(x, y, r, r * 0.32, opts.rot || 0, Math.PI * 0.05, Math.PI * 0.95);
    c.stroke();
    c.beginPath();
    c.moveTo(x - r * 0.15, y); c.lineTo(x - r * 0.3, y - r * 0.7);
    c.moveTo(x + r * 0.15, y); c.lineTo(x + r * 0.3, y - r * 0.7);
    c.stroke();
    this._post();
  }
}
