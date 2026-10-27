// Procedural Mountain Module — rich carved terrain with tracks and tunnel interior
import * as THREE from 'three';
import { createLinocutMaterial } from '../shaders/linocut.js';
import SimplexNoise from '../procedural/noise.js';

export function createMountainModule(params = {}) {
  const group = new THREE.Group();
  const noise = new SimplexNoise(params.seed || 42);
  const width = params.width || 80;
  const depth = params.depth || 40;
  const height = params.height || 22;

  // Background mountains
  const bgMountains = createMountainLayer(noise, width * 1.5, depth * 0.8, height * 0.8, {
    ...params,
    distance: 1.0,
    offset: { x: 0, z: -15 },
    color: 0xe8e4e0,
    carveColor: 0x2a2a30,
    segments: 40,
  });
  group.add(bgMountains);

  // Main mountains
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

  // Foreground grass
  const grass = createForegroundGrass(noise, width, depth, params);
  group.add(grass);

  // Train tracks on ground
  const tracks = createTrainTracks(width, depth);
  tracks.position.set(5, 0.02, 0);
  group.add(tracks);

  // Snow ground with footprints
  const ground = createSnowGround(width, depth, noise);
  ground.position.y = -0.1;
  group.add(ground);

  // Tunnel interior with approaching lights
  const tunnelInterior = createTunnelInterior();
  tunnelInterior.position.set(8, 0, 0);
  group.add(tunnelInterior);

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

    let h = 0;

    // Ridged peaks
    const ridgeX = (x + ox) * 0.04;
    const ridgeY = (y + oz) * 0.04;
    h += noise.ridged(ridgeX, ridgeY, 5) * height * 0.6;

    // Broad shape
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
  const count = params.treeCount || 70;

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
    canopyShapes.push(new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false }));
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

    const trunk = new THREE.Mesh(trunkGeom, treeMat);
    trunk.position.y = 0.3;
    tree.add(trunk);

    for (let layer = 0; layer < 3; layer++) {
      const canopy = new THREE.Mesh(canopyShapes[layer], treeMat);
      canopy.position.y = 0.5 + layer * 0.35;
      canopy.position.z = -0.03;
      const s = 0.8 + Math.random() * 0.4;
      canopy.scale.set(s, s, s);
      tree.add(canopy);
    }

    const nx = x * 0.04;
    const ny = z * 0.04;
    let terrainH = 0;
    terrainH += noise.ridged(nx, ny, 5) * height * 0.6;
    terrainH += Math.pow(Math.max(0, 1 - Math.abs(x) / (width * 0.35)), 2) * height * 0.5;
    const peak1 = Math.pow(Math.max(0, 1 - Math.hypot(x + 12, z) / 12), 2.5);
    terrainH += (peak1 * 0.7 + 0.2) * height * 0.4 * 0.5;

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
  const count = params.grassCount || 25;

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

// Train tracks — rails and ties
function createTrainTracks(width, depth) {
  const group = new THREE.Group();

  const railMat = createLinocutMaterial({
    color: new THREE.Color(0x2a2a30),
    carveColor: new THREE.Color(0x0a0a10),
    carveDepth: 0.85,
    carveScale: 6.0,
    gougeAmount: 0.3,
  });

  const tieMat = createLinocutMaterial({
    color: new THREE.Color(0x1a1a20),
    carveColor: new THREE.Color(0x08080c),
    carveDepth: 0.9,
  });

  // Two rails
  for (const zOff of [-0.5, 0.5]) {
    const railGeom = new THREE.BoxGeometry(width * 0.5, 0.08, 0.06);
    const rail = new THREE.Mesh(railGeom, railMat);
    rail.position.set(0, 0.04, zOff);
    group.add(rail);
  }

  // Ties (sleepers)
  const numTies = Math.floor(width * 0.5 / 0.8);
  for (let i = 0; i < numTies; i++) {
    const tieGeom = new THREE.BoxGeometry(0.12, 0.06, 1.2);
    const tie = new THREE.Mesh(tieGeom, tieMat);
    tie.position.set(-width * 0.25 + i * 0.8, 0.03, 0);
    group.add(tie);
  }

  return group;
}

// Snow ground with carved footprints and tracks
function createSnowGround(width, depth, noise) {
  const geom = new THREE.PlaneGeometry(width * 2, depth * 3, 30, 30);
  const pos = geom.attributes.position;

  // Add subtle undulation and footprints
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);

    // Gentle undulation
    let h = noise.fbm(x * 0.1, y * 0.1, 3, 2, 0.4) * 0.08;

    // Footprint depressions
    const fp1 = Math.hypot(x - 3, y - 2);
    const fp2 = Math.hypot(x - 3.3, y - 2.5);
    if (fp1 < 0.15) h -= 0.05 * (1 - fp1 / 0.15);
    if (fp2 < 0.15) h -= 0.05 * (1 - fp2 / 0.15);

    pos.setZ(i, h);
  }

  geom.computeVertexNormals();

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

// Tunnel interior with approaching train lights
function createTunnelInterior() {
  const group = new THREE.Group();

  // Dark tunnel walls (extending back)
  const wallMat = createLinocutMaterial({
    color: new THREE.Color(0x0a0a10),
    carveColor: new THREE.Color(0x050508),
    carveDepth: 0.9,
    carveScale: 2.0,
    gougeAmount: 0.5,
  });

  // Left wall
  const leftWallGeom = new THREE.PlaneGeometry(8, 5);
  const leftWall = new THREE.Mesh(leftWallGeom, wallMat);
  leftWall.position.set(0, 2.5, -4);
  leftWall.rotation.y = Math.PI / 2;
  group.add(leftWall);

  // Right wall
  const rightWall = new THREE.Mesh(leftWallGeom, wallMat);
  rightWall.position.set(0, 2.5, 4);
  rightWall.rotation.y = -Math.PI / 2;
  group.add(rightWall);

  // Ceiling
  const ceilGeom = new THREE.PlaneGeometry(8, 8);
  const ceil = new THREE.Mesh(ceilGeom, wallMat);
  ceil.position.set(0, 5, 0);
  ceil.rotation.x = Math.PI / 2;
  group.add(ceil);

  // Floor (tracks inside)
  const floorGeom = new THREE.PlaneGeometry(8, 8);
  const floor = new THREE.Mesh(floorGeom, wallMat);
  floor.position.set(0, 0, 0);
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  // Approaching train lights (pulsing warm glow deep inside)
  const lightGeom = new THREE.SphereGeometry(0.3, 8, 8);
  const lightMat = new THREE.MeshBasicMaterial({
    color: 0xf0d080,
    transparent: true,
    opacity: 0,
  });
  const light = new THREE.Mesh(lightGeom, lightMat);
  light.position.set(0, 1.5, 0);
  light.userData.isTunnelLight = true;
  group.add(light);

  // Second light (headlights)
  const light2 = light.clone();
  light2.position.x = 0.4;
  group.add(light2);

  // Glow halo
  const glowGeom = new THREE.SphereGeometry(0.8, 10, 10);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xf0d080,
    transparent: true,
    opacity: 0,
  });
  const glow = new THREE.Mesh(glowGeom, glowMat);
  glow.position.copy(light.position);
  glow.userData.isTunnelGlow = true;
  group.add(glow);

  group.userData = {
    type: 'tunnel_interior',
    update: (time) => {
      // Pulsing lights — train approaching
      const pulse = (Math.sin(time * 1.5) * 0.5 + 0.5) * 0.6;
      lightMat.opacity = pulse * 0.7;
      light2.material.opacity = pulse * 0.7;
      glowMat.opacity = pulse * 0.2;

      // Slight movement — train getting closer
      const approach = Math.sin(time * 0.3) * 0.2;
      light.position.z = approach;
      light2.position.z = approach;
      glow.position.z = approach;
    }
  };

  return group;
}

export default createMountainModule;
