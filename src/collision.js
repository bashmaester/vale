// Lightweight 2D world-space separation + blue-noise sampling.
// Used for pedestrian scattering, vehicle spacing and crowd/vehicle avoidance.
import { clamp } from './math.js';

export function separate(items, opts = {}) {
  const {
    iterations = 2,
    padding = 0,
    strength = 0.62,
    bounds = null,
    onlyDifferentGroups = false,
    getRadius = (it) => (it.radius == null ? 0.5 : it.radius),
    getAlpha = (it) => (it.alpha == null ? 1 : it.alpha),
    getGroup = (it) => (it.group == null ? 0 : it.group),
  } = opts;
  const active = items.filter((it) => it.world && getAlpha(it) > 0.05);
  if (active.length < 2) return;
  let maxR = 0.5;
  for (const it of active) maxR = Math.max(maxR, getRadius(it));
  const cell = Math.max(0.6, (maxR * 2 + padding) * 1.25);
  for (let iter = 0; iter < iterations; iter++) {
    const grid = new Map();
    for (let i = 0; i < active.length; i++) {
      const it = active[i];
      const cx = Math.floor(it.world.x / cell);
      const cz = Math.floor(it.world.z / cell);
      const key = `${cx},${cz}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    }
    for (let i = 0; i < active.length; i++) {
      const a = active[i];
      const cx = Math.floor(a.world.x / cell);
      const cz = Math.floor(a.world.z / cell);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          const bucket = grid.get(`${cx + ox},${cz + oz}`);
          if (!bucket) continue;
          for (const j of bucket) {
            if (j <= i) continue;
            const b = active[j];
            if (onlyDifferentGroups && getGroup(a) === getGroup(b)) continue;
            let dx = b.world.x - a.world.x;
            let dz = b.world.z - a.world.z;
            let d = Math.hypot(dx, dz);
            const minD = getRadius(a) + getRadius(b) + padding;
            if (d >= minD) continue;
            if (d < 0.0001) {
              dx = 0.001; dz = 0.001; d = 0.001414;
            }
            const nx = dx / d, nz = dz / d;
            const total = (minD - d) * strength;
            const wa = a.fixed ? 0 : Math.max(0.05, getAlpha(a));
            const wb = b.fixed ? 0 : Math.max(0.05, getAlpha(b));
            const sum = wa + wb;
            if (sum <= 0) continue;
            if (!a.fixed) {
              a.world.x -= nx * total * (wa / sum);
              a.world.z -= nz * total * (wa / sum);
            }
            if (!b.fixed) {
              b.world.x += nx * total * (wb / sum);
              b.world.z += nz * total * (wb / sum);
            }
          }
        }
      }
    }
    if (bounds) {
      for (const it of active) {
        if (it.fixed) continue;
        it.world.x = clamp(it.world.x, bounds.x0, bounds.x1);
        it.world.z = clamp(it.world.z, bounds.z0, bounds.z1);
      }
    }
  }
}

// A relaxation pass that treats every body's position as a base point plus an
// offset, and solves the offsets together. Because it starts from zero each
// frame and always runs the same number of iterations, the result is a pure
// function of the base points: the crowd does not remember the last frame, so
// there is nothing to pop when two people meet.
//
// The `lateral` bias is what makes it read as steering instead of shoving: a
// body that is being pushed backwards along its own heading is instead slid
// sideways, and only lightly slowed.
export function relax(items, opts = {}) {
  const {
    iterations = 5,
    padding = 0.06,
    strength = 0.85,
    lateral = 0,
    damp = 0.5,
    maxOffset = 0.8,
    bounds = null,
    getGroup = (it) => (it.group == null ? 0 : it.group),
    onlyDifferentGroups = false,
  } = opts;
  // Bodies are kept in the solve at any opacity and weighted by it, so a
  // person fading in or out does not switch their influence on and off and
  // shove their neighbours sideways as they go.
  const list = items.filter((it) => it.world);
  if (!list.length) return;
  const N = list.length;
  const ox = new Float64Array(N);
  const oz = new Float64Array(N);
  const dx = new Float64Array(N);
  const dz = new Float64Array(N);
  const px = new Float64Array(N);
  const pz = new Float64Array(N);
  let maxR = 0.5;
  for (const it of list) maxR = Math.max(maxR, it.radius == null ? 0.5 : it.radius);
  const cell = Math.max(0.6, (maxR * 2 + padding) * 1.3);

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < N; i++) {
      px[i] = list[i].world.x + ox[i];
      pz[i] = list[i].world.z + oz[i];
      dx[i] = 0; dz[i] = 0;
    }
    const grid = new Map();
    for (let i = 0; i < N; i++) {
      const key = `${Math.floor(px[i] / cell)},${Math.floor(pz[i] / cell)}`;
      const b = grid.get(key);
      if (b) b.push(i); else grid.set(key, [i]);
    }
    for (let i = 0; i < N; i++) {
      const a = list[i];
      const ca = Math.floor(px[i] / cell), cb = Math.floor(pz[i] / cell);
      for (let gx = -1; gx <= 1; gx++) {
        for (let gz = -1; gz <= 1; gz++) {
          const bucket = grid.get(`${ca + gx},${cb + gz}`);
          if (!bucket) continue;
          for (const j of bucket) {
            if (j <= i) continue;
            const b = list[j];
            if (onlyDifferentGroups && getGroup(a) === getGroup(b)) continue;
            let ax = px[j] - px[i];
            let az = pz[j] - pz[i];
            let d = Math.hypot(ax, az);
            const minD = (a.radius == null ? 0.5 : a.radius)
              + (b.radius == null ? 0.5 : b.radius) + padding;
            if (d >= minD) continue;
            if (d < 1e-4) { ax = 0.001; az = 0.001; d = 0.0014; }
            const nx = ax / d, nz = az / d;
            const overlap = minD - d;
            const wa = a.fixed ? 0 : clamp(a.alpha == null ? 1 : a.alpha, 0, 1);
            const wb = b.fixed ? 0 : clamp(b.alpha == null ? 1 : b.alpha, 0, 1);
            const sum = wa + wb;
            if (sum < 1e-3) continue;
            if (!a.fixed) {
              let cx = -nx * overlap * (wa / sum), cz = -nz * overlap * (wa / sum);
              if (lateral > 0 && a.dir) {
                const along = cx * a.dir.x + cz * a.dir.z;
                const rx = cx - along * a.dir.x, rz = cz - along * a.dir.z;
                cx = rx * (1 + lateral) + a.dir.x * along * (1 - lateral);
                cz = rz * (1 + lateral) + a.dir.z * along * (1 - lateral);
              }
              dx[i] += cx; dz[i] += cz;
            }
            if (!b.fixed) {
              let cx = nx * overlap * (wb / sum), cz = nz * overlap * (wb / sum);
              if (lateral > 0 && b.dir) {
                const along = cx * b.dir.x + cz * b.dir.z;
                const rx = cx - along * b.dir.x, rz = cz - along * b.dir.z;
                cx = rx * (1 + lateral) + b.dir.x * along * (1 - lateral);
                cz = rz * (1 + lateral) + b.dir.z * along * (1 - lateral);
              }
              dx[j] += cx; dz[j] += cz;
            }
          }
        }
      }
    }
    // Gauss–Seidel: the pushes are applied in place, one body after another,
    // so a body that has already been moved is seen by the next pair. That
    // settles instead of oscillating, which is what keeps a person from being
    // flicked left in one frame and right in the next.
    for (let i = 0; i < N; i++) {
      if (list[i].fixed) continue;
      ox[i] += dx[i] * damp;
      oz[i] += dz[i] * damp;
      // Soft saturation, not a hard clamp: a body whose push grows past the
      // limit is eased towards it, so the correction never jumps when the
      // direction of the push rotates.
      const m = Math.hypot(ox[i], oz[i]);
      if (m > 1e-6) {
        const k = (maxOffset * Math.tanh(m / maxOffset)) / m;
        ox[i] *= k; oz[i] *= k;
      }
    }
  }
  for (let i = 0; i < N; i++) {
    list[i].world.x += ox[i];
    list[i].world.z += oz[i];
    if (bounds) {
      list[i].world.x = clamp(list[i].world.x, bounds.x0, bounds.x1);
      list[i].world.z = clamp(list[i].world.z, bounds.z0, bounds.z1);
    }
  }
}

export function separateGroups(a, b, opts = {}) {
  const items = [];
  for (const it of a) {
    if (!it.world) continue;
    items.push({ world: it.world, radius: it.radius, alpha: it.alpha, fixed: it.fixed, group: 'a' });
  }
  for (const it of b) {
    if (!it.world) continue;
    items.push({ world: it.world, radius: it.radius, alpha: it.alpha, fixed: it.fixed, group: 'b' });
  }
  separate(items, { ...opts, onlyDifferentGroups: true });
}

// Grid-accelerated dart throwing. Falls back to relaxed random fill if a
// region is too dense, so callers always get the requested count.
export function poissonDisk(count, bounds, minDist, rng, isValid = () => true) {
  const pts = [];
  const cell = Math.max(0.1, minDist / Math.SQRT2);
  const cols = Math.ceil((bounds.x1 - bounds.x0) / cell) + 1;
  const rows = Math.ceil((bounds.z1 - bounds.z0) / cell) + 1;
  const grid = new Map();
  const key = (cx, cz) => `${cx},${cz}`;
  const near = (x, z) => {
    const cx = Math.floor((x - bounds.x0) / cell);
    const cz = Math.floor((z - bounds.z0) / cell);
    for (let ox = -2; ox <= 2; ox++) {
      for (let oz = -2; oz <= 2; oz++) {
        const arr = grid.get(key(cx + ox, cz + oz));
        if (!arr) continue;
        for (const p of arr) {
          const dx = p.x - x, dz = p.z - z;
          if (dx * dx + dz * dz < minDist * minDist) return true;
        }
      }
    }
    return false;
  };
  const attempts = Math.max(200, count * 90);
  for (let n = 0; n < attempts && pts.length < count; n++) {
    const x = rng.range(bounds.x0, bounds.x1);
    const z = rng.range(bounds.z0, bounds.z1);
    if (!isValid(x, z) || near(x, z)) continue;
    const p = { x, z };
    pts.push(p);
    const k = key(Math.floor((x - bounds.x0) / cell), Math.floor((z - bounds.z0) / cell));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  }
  let guard = 0;
  while (pts.length < count && guard++ < count * 200) {
    const x = rng.range(bounds.x0, bounds.x1);
    const z = rng.range(bounds.z0, bounds.z1);
    if (isValid(x, z)) pts.push({ x, z });
  }
  return pts.slice(0, count);
}
