// Buffer cells: the eight neighbours of the hero tile.
//
// The engine builds a volume out of tiles. Only the centre cell is rendered at
// full fidelity; the neighbours exist so the diorama reads as part of a larger
// city, and they are drawn in a deliberately cheap style — wireframe boxes or a
// point cloud — with an adjustable opacity and per-cell toggles (all off by
// default).
//
// Everything here is generated from the same tile constants as the hero cell,
// so a neighbour is a real, correctly-offset volume, not a decorative backdrop.

import { v3 } from './math.js';
import { TILE, TILE_COLORS as C } from './tile.js';
import { BUILDING_LOTS, ROAD, SIDEWALKS, CROSSWALKS } from './world.js';
import { hash11 } from './math.js';

const BONE = (a) => `rgba(239,233,216,${a})`;

export const CELL_W = TILE.x1 - TILE.x0;   // 30
export const CELL_D = TILE.z1 - TILE.z0;   // 24.5

// dx, dz in cell units, plus a label for the UI.
export const BUFFER_CELLS = [
  { id: 'nw', dx: -1, dz: -1, label: 'NW' },
  { id: 'n', dx: 0, dz: -1, label: 'N' },
  { id: 'ne', dx: 1, dz: -1, label: 'NE' },
  { id: 'w', dx: -1, dz: 0, label: 'W' },
  { id: 'e', dx: 1, dz: 0, label: 'E' },
  { id: 'sw', dx: -1, dz: 1, label: 'SW' },
  { id: 's', dx: 0, dz: 1, label: 'S' },
  { id: 'se', dx: 1, dz: 1, label: 'SE' },
];

function boxWire(p, camera, cx, cy, cz, w, h, d, opts) {
  p.box(camera, [cx, cy, cz], [w, h, d], {
    fill: opts.fill || null,
    stroke: opts.stroke,
    width: opts.width,
    alpha: opts.alpha,
    jitter: opts.jitter == null ? 0.14 : opts.jitter,
    seed: opts.seed,
    edgeAlpha: opts.edgeAlpha == null ? 1 : opts.edgeAlpha,
    double: false,
  });
}

/**
 * Draw one neighbour cell.
 *
 * @param p        painter for the plate
 * @param camera   active camera
 * @param cell     entry from BUFFER_CELLS
 * @param style    'wire' | 'points'
 * @param alpha    0..1 global opacity
 */
export function drawBufferCell(p, camera, cell, style = 'wire', alpha = 0.35) {
  if (alpha <= 0.01) return;
  const ox = cell.dx * CELL_W;
  const oz = cell.dz * CELL_D;
  const seedBase = 9000 + (cell.dx + 1) * 31 + (cell.dz + 1) * 7;

  // Ground outline: the cell footprint, so the extension of the street grid is
  // legible even at very low opacity.
  const y = -0.02;
  p.projectPoly(camera, [
    v3(TILE.x0 + ox, y, TILE.z0 + oz),
    v3(TILE.x1 + ox, y, TILE.z0 + oz),
    v3(TILE.x1 + ox, y, TILE.z1 + oz),
    v3(TILE.x0 + ox, y, TILE.z1 + oz),
  ], { fill: null, stroke: BONE(0.30 * alpha), width: 0.8, jitter: 0.3, seed: seedBase });

  if (style === 'points') {
    // Point cloud: sample the same procedural description (building volumes,
    // street strip, sidewalk rows) and draw it as dots.
    const dot = (x, yy, z, size, a, seed) => {
      const q = camera.project(v3(x, yy, z));
      if (!q) return;
      p.ellipse(q.x, q.y, size * q.scale, size * q.scale, {
        fill: BONE(a * alpha), stroke: null, alpha: 1,
      });
    };
    for (let i = 0; i < BUILDING_LOTS.length; i++) {
      const b = BUILDING_LOTS[i];
      // The same lot, jittered per cell so the neighbours are not clones.
      const jx = (hash11(seedBase + i * 3.1) - 0.5) * 6.0;
      const jz = (hash11(seedBase + i * 7.7) - 0.5) * 3.0;
      const bx = b.x + ox + jx;
      const bz = b.z + oz + jz;
      const n = 60;
      for (let k = 0; k < n; k++) {
        const u = hash11(seedBase + i * 91 + k * 1.7);
        const v = hash11(seedBase + i * 37 + k * 2.9);
        const w = hash11(seedBase + i * 13 + k * 4.3);
        // Fainter, smaller marks high up: a survey cloud, not snow.
        dot(bx + (u - 0.5) * b.w, w * b.h, bz + (v - 0.5) * b.d,
          0.006 + w * 0.004, 0.28 + w * 0.22, k);
      }
    }
    for (let k = 0; k < 90; k++) {
      const u = hash11(seedBase + k * 5.3);
      const v = hash11(seedBase + k * 8.1);
      dot(TILE.x0 + ox + u * CELL_W, 0.02, TILE.z0 + oz + v * CELL_D,
        0.005 + u * 0.003, 0.15 + v * 0.12, k);
    }
    return;
  }

  // Wireframe: building volumes as open boxes, plus the road and crossing.
  for (let i = 0; i < BUILDING_LOTS.length; i++) {
    const b = BUILDING_LOTS[i];
    const jx = (hash11(seedBase + i * 3.1) - 0.5) * 6.0;
    const jz = (hash11(seedBase + i * 7.7) - 0.5) * 3.0;
    const jh = (hash11(seedBase + i * 5.9) - 0.5) * 3.0;
    boxWire(p, camera, b.x + ox + jx, (b.h + jh) / 2, b.z + oz + jz, b.w, b.h + jh, b.d, {
      stroke: BONE(0.55 * alpha), width: 0.7, alpha: 1, seed: seedBase + i,
    });
  }
  const roadY = 0.01;
  p.projectPoly(camera, [
    v3(TILE.x0 + ox, roadY, ROAD.z0 + oz),
    v3(TILE.x1 + ox, roadY, ROAD.z0 + oz),
    v3(TILE.x1 + ox, roadY, ROAD.z1 + oz),
    v3(TILE.x0 + ox, roadY, ROAD.z1 + oz),
  ], { fill: null, stroke: BONE(0.18 * alpha), width: 0.6, jitter: 0.2, seed: seedBase + 50 });
  const cw = CROSSWALKS.main;
  p.projectPoly(camera, [
    v3(cw.x0 + ox, roadY, cw.z0 + oz),
    v3(cw.x1 + ox, roadY, cw.z0 + oz),
    v3(cw.x1 + ox, roadY, cw.z1 + oz),
    v3(cw.x0 + ox, roadY, cw.z1 + oz),
  ], { fill: null, stroke: BONE(0.12 * alpha), width: 0.5, jitter: 0.25, seed: seedBase + 51 });
}

/** Draw every enabled buffer cell. `mask` is a Set of cell ids. */
export function drawBufferCells(p, camera, mask, style, alpha) {
  if (!mask || mask.size === 0) return;
  for (const cell of BUFFER_CELLS) {
    if (!mask.has(cell.id)) continue;
    drawBufferCell(p, camera, cell, style, alpha);
  }
}
