// Procedural Mountain Module — rich carved terrain
import * as THREE from 'three';
import { createLinocutMaterial } from '../shaders/linocut.js';
import SimplexNoise from '../procedural/noise.js';

export function createMountainModule(params = {}) {
  const group = new THREE.Group();
  const noise = new SimplexNoise(params.seed || 42);
  const width = params.width || 80;
  const depth = params.depth || 40;
  const height = params.height || 22;

  // Background mountains (distant, darker, less detail)
  const bgMountains = createMountainLayer(noise, width * 1.5, depth * 0.8, height * 0.8, {
    ...params,
    distance: 1.0,
    offset: { x: 0, z: -15 },
    color: 0xe8e4e0,
    carveColor: 0x2a2a30,
    segments: 40,
  });
  group.add(bgMountains);

  // Main mountains (mid-distance)
  const mainMountains = createMountainLayer(noise, width, depth, height, {
    ...params,
    distance: 0.5,
    offset: { x: 0, z: -5 },
    color: 0xfaf8f5,
    carveColor: 0x1a1a20,
    segments: 80,
    hasTunnel: true,
  });
  group.add(mainMountains);

  // Foreground hills
  const fgHills = createMountainLayer(noise, width * 0.8, depth * 0.4, height * 0.25, {
    ...params,
    distance: 0.1,
    offset: { x: 5, z: 8 },
    color: 0xf5f2ee,
    carveColor: 0x2a2a30,
    segments: 30,
    hasTunnel: false,
  });
  group.add(fgHills);

  // Pine forest
  if (params.trees !== false) {
    const forest = createForest(noise, width, depth, height, params);
    group.add(forest);
  }

  // Foreground sparse grass/plants
  const grass = createForegroundGrass(noise, width, depth, params);
  group.add(grass);

  // Snow ground
  const ground = createSnowGround(width, depth);
  ground.position.y = -0.1;
  group.add(ground);

  group.userData = { type: 'mountain', params };
  return group;
}

function createMountainLayer(noise, width, depth, height, opts) {
  const segments = opts.segments || 60;
  const geom = new THREE.PlaneGeometry(width, depth, segments, segments);
  const pos = geom.attributes.position;

  const dist = opts.distance || 0.5;
  const ox = opts.offset?.x || 0;
  const oz = opts.offset?.z || 0;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);

    // Ridged noise for sharp peaks
    let h = 0;

    // Primary sharp ridge
    const ridgeX = (x + ox) * 0.04;
    const ridgeY = (y + oz) * 0.04;
    h += noise.ridged(ridgeX, ridgeY, 5) * height * 0.6;

    // Secondary broad shape
    h += Math.pow(Math.max(0, 1 - Math.abs(x + ox) / (width * 0.35)), 2) * height * 0.5;

    // Peak clusters
    const peak1 = Math.pow(Math.max(0, 1 - Math.hypot(x + ox + 12, y + oz) / 12), 2.5);
    const peak2 = Math.pow(Math.max(0, 1 - Math.hypot(x + ox - 15, y + oz + 3) / 10), 2.5);
    const peak3 = Math.pow(Math.max(0, 1 - Math.hypot(x + ox - 5, y + oz - 5) / 14), 2);
    h += (peak1 * 0.7 + peak2 * 0.5 + peak3 * 0.4) * height * 0.4;

    // FBM detail
    h += noise.fbm((x + ox) * 0.06, (y + oz) * 0.06, 4, 2.2, 0.5) * height * 0.15;

    // Tunnel carve
    if (opts.hasTunnel) {
      const tx = 8 - ox;
      const tz = -oz;
      const tr = 2.8;
      const d = Math.hypot(x - tx, y - tz);
      if (d < tr + 0.5) {
        h = Math.max(0, h * Math.max(0, (d - tr) / 0.5));
        if (d < tr - 0.2) h = 0;
      }
    }

    pos.setZ(i, h * dist);
  }

  geom.computeVertexNormals();

  const mat = createLinocutMaterial({
    color: new THREE.Color(opts.color || 0xfaf8f5),
    carveColor: new THREE.Color(opts.carveColor || 0x1a1a20),
    carveDepth: 0.75,
    carveScale: 2.0 / Math.max(dist, 0.3),
    gougeAmount: 0.45,
    grainIntensity: 0.06,
    edgeDarken: 0.5,
    overprintAmount: 0.05,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0;
  return mesh;
}

function createForest(noise, width, depth, height, params) {
  const group = new THREE.Group();
  const count = params.treeCount || 80;

  // Tree silhouettes — carved dark shapes
  const trunkGeom = new THREE.CylinderGeometry(0.04, 0.06, 0.6, 4);
  const canopyShapes = [];
  for (let layer = 0; layer < 3; layer++) {
    const shape = new THREE.Shape();
    const w = 0.35 - layer * 0.08;
    const h = 0.5;
    shape.moveTo(0, 0);
    shape.lineTo(-w, 0);
    shape.lineTo(-w * 0.6, h * 0.3);
    shape.lineTo(-w * 0.8, h * 0.3);
    shape.lineTo(-w * 0.3, h * 0.7);
    shape.lineTo(-w * 0.5, h * 0.7);
    shape.lineTo(0, h);
    shape.lineTo(w * 0.5, h * 0.7);
    shape.lineTo(w * 0.3, h * 0.7);
    shape.lineTo(w * 0.8, h * 0.3);
    shape.lineTo(w * 0.6, h * 0.3);
    shape.lineTo(w, 0);
    shape.lineTo(0, 0);
    const extrudeSettings = { depth: 0.06, bevelEnabled: false };
    canopyShapes.push(new THREE.ExtrudeGeometry(shape, extrudeSettings));
  }

  const treeMat = createLinocutMaterial({
    color: new THREE.Color(0x1a1a20),
    carveColor: new THREE.Color(0x08080c),
    carveDepth: 0.85,
    carveScale: 6.0,
    gougeAmount: 0.3,
  });

  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * width * 0.7;
    const z = (Math.random() - 0.5) * depth * 0.5;

    const tree = new THREE.Group();

    // Trunk
    const trunk = new THREE.Mesh(trunkGeom, treeMat);
    trunk.position.y = 0.3;
    tree.add(trunk);

    // Canopy layers
    for (let layer = 0; layer < 3; layer++) {
      const canopy = new THREE.Mesh(canopyShapes[layer], treeMat);
      canopy.position.y = 0.5 + layer * 0.35;
      canopy.position.z = -0.03;
      const s = 0.8 + Math.random() * 0.4;
      canopy.scale.set(s, s, s);
      tree.add(canopy);
    }

    // Position on terrain
    const nx = x * 0.04;
    const ny = z * 0.04;
    let terrainH = 0;
    terrainH += noise.ridged(nx, ny, 5) * height * 0.6;
    terrainH += Math.pow(Math.max(0, 1 - Math.abs(x) / (width * 0.35)), 2) * height * 0.5;
    const peak1 = Math.pow(Math.max(0, 1 - Math.hypot(x + 12, z) / 12), 2.5);
    terrainH += (peak1 * 0.7 + 0.2) * height * 0.4 * 0.5;

    // Place on slopes, avoid tunnel
    const slope = Math.abs(noise.noise2D(nx + 0.1, ny) - noise.noise2D(nx, ny));
    const tunnelDist = Math.hypot(x - 8, z);
    if (slope > 0.01 && slope < 0.08 && terrainH > 1 && tunnelDist > 4) {
      tree.position.set(x, terrainH * 0.5, z);
      const s = 0.6 + Math.random() * 0.6;
      tree.scale.set(s, s * (0.9 + Math.random() * 0.3), s);
      tree.rotation.y = Math.random() * Math.PI * 2;
      group.add(tree);
    }
  }

  return group;
}

function createForegroundGrass(noise, width, depth, params) {
  const group = new THREE.Group();
  const count = params.grassCount || 30;

  const grassMat = createLinocutMaterial({
    color: new THREE.Color(0x1a1a20),
    carveColor: new THREE.Color(0x08080c),
    carveDepth: 0.9,
    carveScale: 8.0,
    gougeAmount: 0.2,
  });

  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * width * 0.6;
    const z = 5 + Math.random() * depth * 0.3;

    // Grass tuft — simple V-shape
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(-0.08, 0.4 + Math.random() * 0.3);
    shape.lineTo(-0.02, 0.1);
    shape.lineTo(0.02, 0.5 + Math.random() * 0.2);
    shape.lineTo(0.05, 0.15);
    shape.lineTo(0.1, 0.3 + Math.random() * 0.2);
    shape.lineTo(0.05, 0);
    shape.lineTo(0, 0);

    const geom = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
    const grass = new THREE.Mesh(geom, grassMat);
    grass.position.set(x, 0, z);
    grass.rotation.y = Math.random() * Math.PI * 2;
    const s = 0.5 + Math.random() * 0.8;
    grass.scale.set(s, s, s);
    group.add(grass);
  }

  return group;
}

function createSnowGround(width, depth) {
  const geom = new THREE.PlaneGeometry(width * 2, depth * 3, 20, 20);
  const mat = createLinocutMaterial({
    color: new THREE.Color(0xfaf8f5),
    carveColor: new THREE.Color(0xd8d4d0),
    carveDepth: 0.25,
    carveScale: 1.2,
    gougeAmount: 0.1,
    grainIntensity: 0.04,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export default createMountainModule;
