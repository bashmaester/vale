// Procedural Mountain Module
// Creates stylized mountains with carved linocut appearance
import * as THREE from 'three';
import { createLinocutMaterial } from '../shaders/linocut.js';
import SimplexNoise from '../procedural/noise.js';

export function createMountainModule(params = {}) {
  const group = new THREE.Group();
  const noise = new SimplexNoise(params.seed || Math.random() * 10000);
  const numPeaks = params.numPeaks || 3;
  const width = params.width || 60;
  const depth = params.depth || 30;
  const height = params.height || 20;

  // Create terrain mesh
  const terrain = createTerrain(noise, width, depth, height, params);
  group.add(terrain);

  // Add pine trees
  if (params.trees !== false) {
    const trees = createForest(noise, width, depth, height, params);
    group.add(trees);
  }

  // Snow ground plane
  const ground = createSnowGround(width, depth);
  ground.position.y = -0.1;
  group.add(ground);

  group.userData = { type: 'mountain', params };

  return group;
}

function createTerrain(noise, width, depth, height, params) {
  const segments = params.segments || 80;
  const geom = new THREE.PlaneGeometry(width, depth, segments, segments);
  const pos = geom.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);

    // Multi-octave terrain
    let h = 0;
    // Base large mountain shape
    h += Math.pow(Math.max(0, 1 - Math.abs(x) / (width * 0.4)), 1.5) * height * 0.7;
    // Secondary peaks
    h += Math.pow(Math.max(0, 1 - Math.abs(x + 10) / 15), 2) * height * 0.5;
    h += Math.pow(Math.max(0, 1 - Math.abs(x - 15) / 12), 2) * height * 0.4;
    // Noise detail
    h += noise.fbm(x * 0.05, y * 0.05, 4, 2, 0.5) * height * 0.3;
    // Ridged noise for sharp peaks
    h += noise.ridged(x * 0.08, y * 0.08, 3) * height * 0.15;

    // Tunnel opening (for the train scene)
    if (params.hasTunnel) {
      const tunnelX = params.tunnelX || 5;
      const tunnelZ = params.tunnelZ || 0;
      const tunnelR = params.tunnelRadius || 2;
      const dist = Math.sqrt((x - tunnelX) ** 2 + (y - tunnelZ) ** 2);
      if (dist < tunnelR + 1) {
        h = Math.min(h, Math.max(0, (dist - tunnelR) * 2));
        // Carve tunnel arch
        if (dist < tunnelR) {
          h = 0;
        }
      }
    }

    pos.setZ(i, h);
  }

  geom.computeVertexNormals();

  const mat = createLinocutMaterial({
    color: new THREE.Color(0xfaf8f5),
    carveColor: new THREE.Color(0x1a1a20),
    carveDepth: 0.7,
    carveScale: 2.5,
    gougeAmount: 0.35,
    grainIntensity: 0.06,
    edgeDarken: 0.5,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0;
  return mesh;
}

function createForest(noise, width, depth, height, params) {
  const group = new THREE.Group();
  const numTrees = params.treeCount || 60;
  const treeGeom = createPineGeometry();
  const treeMat = createLinocutMaterial({
    color: new THREE.Color(0x1a1a20),
    carveColor: new THREE.Color(0x0a0a10),
    carveDepth: 0.8,
    carveScale: 5.0,
    gougeAmount: 0.3,
  });

  for (let i = 0; i < numTrees; i++) {
    const x = (Math.random() - 0.5) * width * 0.8;
    const z = (Math.random() - 0.5) * depth * 0.6;

    // Check slope - place trees on slopes
    const nx = x * 0.05;
    const ny = z * 0.05;
    const slope = Math.abs(noise.noise2D(nx + 0.1, ny) - noise.noise2D(nx, ny));

    if (slope > 0.02 && slope < 0.1) {
      const tree = new THREE.Mesh(treeGeom, treeMat);
      const h = Math.pow(Math.max(0, 1 - Math.abs(x) / (width * 0.4)), 1.5) * height * 0.7;
      tree.position.set(x, h * 0.5 + 0.5, z);
      const s = 0.5 + Math.random() * 0.8;
      tree.scale.set(s, s * (1 + Math.random() * 0.5), s);
      tree.rotation.y = Math.random() * Math.PI * 2;
      group.add(tree);
    }
  }

  return group;
}

function createPineGeometry() {
  const shape = new THREE.Shape();
  // Simple pine tree silhouette
  shape.moveTo(0, 0);
  shape.lineTo(-0.3, 0);
  shape.lineTo(-0.15, 0.5);
  shape.lineTo(-0.4, 0.5);
  shape.lineTo(-0.1, 1.2);
  shape.lineTo(-0.3, 1.2);
  shape.lineTo(0, 2.0);
  shape.lineTo(0.3, 1.2);
  shape.lineTo(0.1, 1.2);
  shape.lineTo(0.4, 0.5);
  shape.lineTo(0.15, 0.5);
  shape.lineTo(0.3, 0);
  shape.lineTo(0, 0);

  const extrudeSettings = { depth: 0.1, bevelEnabled: false };
  const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geom.translate(0, 0, -0.05);
  return geom;
}

function createSnowGround(width, depth) {
  const geom = new THREE.PlaneGeometry(width * 1.5, depth * 2);
  const mat = createLinocutMaterial({
    color: new THREE.Color(0xfaf8f5),
    carveColor: new THREE.Color(0xd0ccc8),
    carveDepth: 0.3,
    carveScale: 1.5,
    gougeAmount: 0.1,
    grainIntensity: 0.04,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export default createMountainModule;
