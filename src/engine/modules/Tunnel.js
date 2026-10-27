// Tunnel entrance module — stone arch with masonry detail
import * as THREE from 'three';
import { createLinocutMaterial } from '../shaders/linocut.js';

export function createTunnelModule(params = {}) {
  const group = new THREE.Group();

  const archRadius = params.radius || 2.5;
  const depth = params.depth || 4;
  const width = params.width || 6;

  // Stone arch — built from segments
  const stoneColor = new THREE.Color(0xd8d4d0);
  const darkStone = new THREE.Color(0x2a2a30);

  // Create arch shape
  const archShape = new THREE.Shape();
  const segments = 16;
  archShape.moveTo(-width / 2, 0);

  // Left wall
  archShape.lineTo(-width / 2, archRadius * 0.5);

  // Arch curve (semicircle on top of walls)
  for (let i = 0; i <= segments; i++) {
    const angle = Math.PI - (i / segments) * Math.PI;
    const cx = 0;
    const cy = archRadius * 0.5;
    const x = cx + Math.cos(angle) * archRadius;
    const y = cy + Math.sin(angle) * archRadius;
    archShape.lineTo(x, y);
  }

  // Right wall
  archShape.lineTo(width / 2, 0);
  archShape.lineTo(-width / 2, 0);

  // Inner hole
  const hole = new THREE.Path();
  const innerR = archRadius * 0.7;
  const innerW = width * 0.55;
  hole.moveTo(-innerW / 2, 0);
  hole.lineTo(-innerW / 2, innerR * 0.3);

  for (let i = 0; i <= segments; i++) {
    const angle = Math.PI - (i / segments) * Math.PI;
    const x = Math.cos(angle) * innerR;
    const y = innerR * 0.3 + Math.sin(angle) * innerR;
    hole.lineTo(x, y);
  }

  hole.lineTo(innerW / 2, 0);
  hole.lineTo(-innerW / 2, 0);
  archShape.holes.push(hole);

  // Extrude for depth
  const extrudeSettings = { depth, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.1, bevelSegments: 2 };
  const archGeom = new THREE.ExtrudeGeometry(archShape, extrudeSettings);

  const archMat = createLinocutMaterial({
    color: stoneColor,
    carveColor: darkStone,
    carveDepth: 0.8,
    carveScale: 3.0,
    gougeAmount: 0.5,
    grainIntensity: 0.07,
    side: THREE.DoubleSide,
  });

  const arch = new THREE.Mesh(archGeom, archMat);
  arch.position.set(0, 0, -depth / 2);
  group.add(arch);

  // Masonry lines (carved stone blocks)
  const masonryMat = createLinocutMaterial({
    color: darkStone,
    carveColor: new THREE.Color(0x0a0a10),
    carveDepth: 0.9,
    carveScale: 4.0,
  });

  // Horizontal mortar lines
  for (let row = 0; row < 6; row++) {
    const y = row * 0.6;
    const blockGeom = new THREE.BoxGeometry(width + 0.4, 0.04, depth + 0.3);
    const block = new THREE.Mesh(blockGeom, masonryMat);
    block.position.set(0, y + 0.3, 0);
    group.add(block);
  }

  // Keystone at top
  const keystoneGeom = new THREE.BoxGeometry(0.6, 0.8, depth + 0.2);
  const keystone = new THREE.Mesh(keystoneGeom, masonryMat);
  keystone.position.set(0, archRadius + 0.3, 0);
  group.add(keystone);

  // Dark interior (void behind arch)
  const voidGeom = new THREE.PlaneGeometry(innerW * 1.5, archRadius * 2);
  const voidMat = new THREE.MeshBasicMaterial({ color: 0x050508 });
  const void2 = new THREE.Mesh(voidGeom, voidMat);
  void2.position.set(0, archRadius * 0.5, -depth + 0.1);
  group.add(void2);

  // Warm glow from inside tunnel (train light)
  const glowGeom = new THREE.PlaneGeometry(innerW, archRadius);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xf0d080,
    transparent: true,
    opacity: 0.0,
  });
  const glow = new THREE.Mesh(glowGeom, glowMat);
  glow.position.set(0, archRadius * 0.5, -depth + 0.2);
  glow.userData.isTunnelGlow = true;
  group.add(glow);

  group.userData = {
    type: 'tunnel',
    params,
    update: (time) => {
      // Pulsing glow when train is near
      const pulse = Math.sin(time * 2) * 0.1 + 0.15;
      glowMat.opacity = pulse;
    }
  };

  return group;
}

export default createTunnelModule;
