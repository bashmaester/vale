// Procedural Train Module
// Creates a stylized red train with carved linocut aesthetic
import * as THREE from 'three';
import { createLinocutMaterial } from '../shaders/linocut.js';

export function createTrainModule(params = {}) {
  const group = new THREE.Group();
  const numCars = params.numCars || 4;
  const carLength = params.carLength || 4;
  const carWidth = params.carWidth || 1.2;
  const carHeight = params.carHeight || 1.4;

  // Red overprint color for train
  const redColor = new THREE.Color(0xc44030);
  const darkColor = new THREE.Color(0x1a0a08);

  // Create train cars
  for (let i = 0; i < numCars; i++) {
    const car = createTrainCar(i, carLength, carWidth, carHeight, redColor, darkColor, params);
    car.position.x = -i * (carLength + 0.3);
    group.add(car);
  }

  // Wheels
  for (let i = 0; i <= numCars; i++) {
    const wheel = createWheel(darkColor);
    wheel.position.set(-i * (carLength + 0.3) + 0.5, -carHeight / 2 + 0.15, 0);
    group.add(wheel);
    const wheel2 = createWheel(darkColor);
    wheel2.position.set(-i * (carLength + 0.3) - 0.5, -carHeight / 2 + 0.15, 0);
    group.add(wheel2);
  }

  // Steam/smoke
  const smoke = createSmokeSystem();
  group.add(smoke);

  group.userData = {
    type: 'train',
    params,
    update: (time) => {
      // Animate smoke
      updateSmoke(smoke, time);
    }
  };

  return group;
}

function createTrainCar(index, length, width, height, redColor, darkColor, params) {
  const car = new THREE.Group();

  // Main body
  const bodyGeom = new THREE.BoxGeometry(length, height, width);
  const bodyMat = createLinocutMaterial({
    color: redColor.clone(),
    carveColor: darkColor,
    carveDepth: 0.7,
    carveScale: 4.0,
    gougeAmount: 0.4,
    grainIntensity: 0.06,
    overprintColor: new THREE.Color(0x8a2018),
    overprintAmount: 0.15,
  });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  car.add(body);

  // Roof (slightly wider)
  const roofGeom = new THREE.BoxGeometry(length + 0.1, 0.08, width + 0.15);
  const roofMat = createLinocutMaterial({
    color: darkColor,
    carveColor: new THREE.Color(0x050508),
    carveDepth: 0.8,
    carveScale: 5.0,
  });
  const roof = new THREE.Mesh(roofGeom, roofMat);
  roof.position.y = height / 2 + 0.04;
  car.add(roof);

  // Windows (warm light)
  const numWindows = Math.floor(length / 0.8);
  for (let w = 0; w < numWindows; w++) {
    const winGeom = new THREE.PlaneGeometry(0.35, 0.45);
    const winMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xf0d080),
      transparent: true,
      opacity: 0.9,
    });
    const win = new THREE.Mesh(winGeom, winMat);
    win.position.set(
      -length / 2 + 0.5 + w * (length / numWindows),
      0.1,
      width / 2 + 0.01
    );
    car.add(win);

    // Window frame
    const frameGeom = new THREE.BoxGeometry(0.4, 0.5, 0.05);
    const frameMat = createLinocutMaterial({
      color: darkColor,
      carveColor: new THREE.Color(0x050508),
      carveDepth: 0.9,
      carveScale: 6.0,
    });
    const frame = new THREE.Mesh(frameGeom, frameMat);
    frame.position.copy(win.position);
    frame.position.z -= 0.01;
    car.add(frame);
  }

  // Engine front
  if (index === 0) {
    const engineGeom = new THREE.CylinderGeometry(0.4, 0.5, length * 0.4, 8);
    engineGeom.rotateZ(Math.PI / 2);
    const engineMat = createLinocutMaterial({
      color: new THREE.Color(0x1a1a20),
      carveColor: new THREE.Color(0x050508),
      carveDepth: 0.8,
      carveScale: 5.0,
      gougeAmount: 0.5,
    });
    const engine = new THREE.Mesh(engineGeom, engineMat);
    engine.position.x = length / 2 + 0.2;
    car.add(engine);

    // Smokestack
    const stackGeom = new THREE.CylinderGeometry(0.12, 0.18, 0.6, 6);
    const stackMat = createLinocutMaterial({
      color: darkColor,
      carveColor: new THREE.Color(0x050508),
      carveDepth: 0.9,
    });
    const stack = new THREE.Mesh(stackGeom, stackMat);
    stack.position.set(length / 3, height / 2 + 0.3, 0);
    car.add(stack);
  }

  return car;
}

function createWheel(color) {
  const geom = new THREE.CylinderGeometry(0.2, 0.2, 0.15, 8);
  geom.rotateX(Math.PI / 2);
  const mat = createLinocutMaterial({
    color: color,
    carveColor: new THREE.Color(0x050508),
    carveDepth: 0.9,
    carveScale: 8.0,
  });
  return new THREE.Mesh(geom, mat);
}

function createSmokeSystem() {
  const count = 40;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const alphas = new Float32Array(count);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geom.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xf0ece8) },
    },
    vertexShader: `
      attribute float size;
      attribute float alpha;
      varying float vAlpha;
      uniform float uTime;
      void main() {
        vAlpha = alpha;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (200.0 / -mvPos.z);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float a = (1.0 - d * d) * vAlpha;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const points = new THREE.Points(geom, mat);

  // Init particles
  for (let i = 0; i < count; i++) {
    positions[i * 3] = 0;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = 0;
    sizes[i] = Math.random() * 0.5 + 0.3;
    alphas[i] = 0;
  }

  points.userData.particles = { positions, sizes, alphas, velocities: [] };
  for (let i = 0; i < count; i++) {
    points.userData.particles.velocities.push({
      x: (Math.random() - 0.3) * 0.5,
      y: Math.random() * 0.8 + 0.4,
      z: (Math.random() - 0.5) * 0.3,
      life: Math.random(),
    });
  }

  return points;
}

function updateSmoke(smoke, time) {
  const p = smoke.userData.particles;
  const t = time * 2;

  for (let i = 0; i < p.positions.length / 3; i++) {
    const v = p.velocities[i];
    v.life += 0.008;
    if (v.life > 1) {
      v.life = 0;
      p.positions[i * 3] = 0;
      p.positions[i * 3 + 1] = 0.8;
      p.positions[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
    } else {
      p.positions[i * 3] += v.x * 0.02;
      p.positions[i * 3 + 1] += v.y * 0.015;
      p.positions[i * 3 + 2] += v.z * 0.01;
    }
    p.alphas[i] = Math.sin(v.life * Math.PI) * 0.4;
    p.sizes[i] = 0.3 + v.life * 1.5;
  }

  smoke.geometry.attributes.position.needsUpdate = true;
  smoke.geometry.attributes.size.needsUpdate = true;
  smoke.geometry.attributes.alpha.needsUpdate = true;
}

export default createTrainModule;
