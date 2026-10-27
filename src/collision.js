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
