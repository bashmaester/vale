// Procedural Train Module — detailed red train with carved smoke
import * as THREE from 'three';
import { createLinocutMaterial } from '../shaders/linocut.js';

export function createTrainModule(params = {}) {
  const group = new THREE.Group();
  const numCars = params.numCars || 5;
  const carLength = params.carLength || 3.5;
  const carWidth = params.carWidth || 1.1;
  const carHeight = params.carHeight || 1.2;

  const redColor = new THREE.Color(0xc44030);
  const darkColor = new THREE.Color(0x1a0a08);
  const overprintRed = new THREE.Color(0x8a2018);

  // Engine car
  const engine = createEngine(carLength, carWidth, carHeight, redColor, darkColor, overprintRed);
  engine.position.x = numCars * (carLength + 0.4) * 0.5;
  group.add(engine);

  // Passenger cars
  for (let i = 0; i < numCars - 1; i++) {
    const car = createPassengerCar(i, carLength, carWidth, carHeight, redColor, darkColor, overprintRed);
    car.position.x = (numCars * (carLength + 0.4) * 0.5) - (i + 1) * (carLength + 0.4);
    group.add(car);
  }

  // Wheels for all cars
  for (let i = 0; i < numCars; i++) {
    const xPos = (numCars * (carLength + 0.4) * 0.5) - i * (carLength + 0.4);
    for (let w = -1; w <= 1; w += 2) {
      const wheel = createWheel(darkColor);
      wheel.position.set(xPos + w * (carLength * 0.35), -carHeight * 0.45, carWidth * 0.55);
      group.add(wheel);
      const wheel2 = createWheel(darkColor);
      wheel2.position.set(xPos + w * (carLength * 0.35), -carHeight * 0.45, -carWidth * 0.55);
      group.add(wheel2);
    }
  }

  // Connecting rods between wheels
  const rodGeom = new THREE.CylinderGeometry(0.03, 0.03, carLength * 0.7, 4);
  rodGeom.rotateZ(Math.PI / 2);
  const rodMat = createLinocutMaterial({
    color: darkColor,
    carveColor: new THREE.Color(0x050508),
    carveDepth: 0.9,
  });
  for (let i = 0; i < numCars; i++) {
    const xPos = (numCars * (carLength + 0.4) * 0.5) - i * (carLength + 0.4);
    const rod = new THREE.Mesh(rodGeom, rodMat);
    rod.position.set(xPos, -carHeight * 0.45, carWidth * 0.55);
    group.add(rod);
  }

  // Carved smoke clouds
  const smoke = createCarvedSmoke();
  smoke.position.set(numCars * (carLength + 0.4) * 0.5 + 1, carHeight * 0.8, 0);
  group.add(smoke);

  // Snow spray particles
  const spray = createSnowSpray(numCars, carLength);
  group.add(spray);

  group.userData = {
    type: 'train',
    params,
    update: (time, dt) => {
      updateSmoke(smoke, time, dt);
      updateSpray(spray, time, dt, group);
    }
  };

  return group;
}

function createEngine(length, width, height, red, dark, overprint) {
  const car = new THREE.Group();

  // Main boiler body (cylindrical)
  const boilerGeom = new THREE.CylinderGeometry(0.5, 0.5, length * 0.6, 12);
  boilerGeom.rotateZ(Math.PI / 2);
  const boilerMat = createLinocutMaterial({
    color: dark,
    carveColor: new THREE.Color(0x050508),
    carveDepth: 0.85,
    carveScale: 4.0,
    gougeAmount: 0.5,
  });
  const boiler = new THREE.Mesh(boilerGeom, boilerMat);
  boiler.position.x = length * 0.3;
  car.add(boiler);

  // Cab (red box)
  const cabGeom = new THREE.BoxGeometry(length * 0.5, height, width);
  const cabMat = createLinocutMaterial({
    color: red,
    carveColor: dark,
    carveDepth: 0.75,
    carveScale: 3.5,
    gougeAmount: 0.4,
    overprintColor: overprint,
    overprintAmount: 0.15,
  });
  const cab = new THREE.Mesh(cabGeom, cabMat);
  cab.position.x = -length * 0.15;
  car.add(cab);

  // Cab roof
  const roofGeom = new THREE.BoxGeometry(length * 0.55, 0.08, width + 0.15);
  const roofMat = createLinocutMaterial({
    color: dark,
    carveColor: new THREE.Color(0x050508),
    carveDepth: 0.9,
    carveScale: 5.0,
  });
  const roof = new THREE.Mesh(roofGeom, roofMat);
  roof.position.set(-length * 0.15, height * 0.54, 0);
  car.add(roof);

  // Smokestack
  const stackGeom = new THREE.CylinderGeometry(0.1, 0.15, 0.7, 8);
  const stackMat = createLinocutMaterial({
    color: dark,
    carveColor: new THREE.Color(0x050508),
    carveDepth: 0.9,
    carveScale: 6.0,
  });
  const stack = new THREE.Mesh(stackGeom, stackMat);
  stack.position.set(length * 0.3, height * 0.5 + 0.35, 0);
  car.add(stack);

  // Cow catcher
  const cowGeom = new THREE.BoxGeometry(0.3, 0.4, width + 0.3);
  const cowMat = createLinocutMaterial({
    color: dark,
    carveColor: new THREE.Color(0x050508),
    carveDepth: 0.9,
  });
  const cow = new THREE.Mesh(cowGeom, cowMat);
  cow.position.set(length * 0.65, -height * 0.3, 0);
  car.add(cow);

  // Headlight
  const lightGeom = new THREE.SphereGeometry(0.1, 8, 8);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xf0d080 });
  const light = new THREE.Mesh(lightGeom, lightMat);
  light.position.set(length * 0.65, 0.1, width * 0.52);
  car.add(light);
  const light2 = light.clone();
  light2.position.z = -width * 0.52;
  car.add(light2);

  // Warm cab windows
  for (let w = 0; w < 2; w++) {
    const winGeom = new THREE.PlaneGeometry(0.35, 0.4);
    const winMat = new THREE.MeshBasicMaterial({ color: 0xf0d080 });
    const win = new THREE.Mesh(winGeom, winMat);
    win.position.set(-length * 0.15, 0.1, width * 0.51 + w * 0.01);
    car.add(win);
  }

  return car;
}

function createPassengerCar(index, length, width, height, red, dark, overprint) {
  const car = new THREE.Group();

  // Main body
  const bodyGeom = new THREE.BoxGeometry(length, height, width);
  const bodyMat = createLinocutMaterial({
    color: red,
    carveColor: dark,
    carveDepth: 0.75,
    carveScale: 3.5,
    gougeAmount: 0.4,
    overprintColor: overprint,
    overprintAmount: 0.12,
  });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  car.add(body);

  // Roof
  const roofGeom = new THREE.BoxGeometry(length + 0.1, 0.08, width + 0.12);
  const roofMat = createLinocutMaterial({
    color: dark,
    carveColor: new THREE.Color(0x050508),
    carveDepth: 0.9,
    carveScale: 5.0,
  });
  const roof = new THREE.Mesh(roofGeom, roofMat);
  roof.position.y = height * 0.54;
  car.add(roof);

  // Underbody
  const underGeom = new THREE.BoxGeometry(length - 0.2, 0.15, width - 0.1);
  const underMat = createLinocutMaterial({
    color: new THREE.Color(0x0a0a10),
    carveColor: new THREE.Color(0x050508),
    carveDepth: 0.9,
  });
  const under = new THREE.Mesh(underGeom, underMat);
  under.position.y = -height * 0.45;
  car.add(under);

  // Windows — warm glowing
  const numWindows = Math.floor(length / 0.9);
  for (let w = 0; w < numWindows; w++) {
    // Window frame
    const frameGeom = new THREE.BoxGeometry(0.42, 0.48, 0.06);
    const frameMat = createLinocutMaterial({
      color: dark,
      carveColor: new THREE.Color(0x050508),
      carveDepth: 0.9,
      carveScale: 6.0,
    });
    const frame = new THREE.Mesh(frameGeom, frameMat);

    // Window glass (warm light)
    const winGeom = new THREE.PlaneGeometry(0.32, 0.38);
    const brightness = 0.7 + Math.random() * 0.3;
    const winMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xf0d080).multiplyScalar(brightness),
    });
    const win = new THREE.Mesh(winGeom, winMat);

    const xPos = -length * 0.4 + 0.5 + w * (length * 0.8 / numWindows);
    for (const z of [width * 0.51, -width * 0.51]) {
      const f = frame.clone();
      f.position.set(xPos, 0.05, z);
      car.add(f);
      const w2 = win.clone();
      w2.position.set(xPos, 0.05, z + (z > 0 ? 0.04 : -0.04));
      car.add(w2);
    }
  }

  // "MAIL" text area on one car
  if (index === 1) {
    const signGeom = new THREE.PlaneGeometry(1.2, 0.3);
    const signMat = new THREE.MeshBasicMaterial({
      color: 0xfaf8f5,
      transparent: true,
      opacity: 0.8,
    });
    const sign = new THREE.Mesh(signGeom, signMat);
    sign.position.set(0, 0, width * 0.52);
    car.add(sign);
  }

  return car;
}

function createWheel(color) {
  const geom = new THREE.CylinderGeometry(0.18, 0.18, 0.12, 10);
  geom.rotateX(Math.PI / 2);
  const mat = createLinocutMaterial({
    color,
    carveColor: new THREE.Color(0x050508),
    carveDepth: 0.9,
    carveScale: 8.0,
    gougeAmount: 0.3,
  });
  return new THREE.Mesh(geom, mat);
}

function createCarvedSmoke() {
  // Big carved cloud puffs using merged spheres
  const group = new THREE.Group();
  const cloudMat = createLinocutMaterial({
    color: new THREE.Color(0xe8e4e0),
    carveColor: new THREE.Color(0x2a2a30),
    carveDepth: 0.6,
    carveScale: 1.5,
    gougeAmount: 0.2,
    grainIntensity: 0.05,
    transparent: true,
    opacity: 0.85,
  });

  // Create multiple cloud puffs at different positions
  const puffs = [];
  for (let i = 0; i < 8; i++) {
    const radius = 0.3 + Math.random() * 0.5;
    const geom = new THREE.SphereGeometry(radius, 8, 6);
    const puff = new THREE.Mesh(geom, cloudMat);
    puff.position.set(
      i * 0.8 + Math.random() * 0.5,
      Math.random() * 0.8,
      (Math.random() - 0.5) * 0.8
    );
    puff.userData.basePos = puff.position.clone();
    puff.userData.phase = Math.random() * Math.PI * 2;
    puff.userData.speed = 0.3 + Math.random() * 0.3;
    puffs.push(puff);
    group.add(puff);
  }

  group.userData.puffs = puffs;
  return group;
}

function updateSmoke(smoke, time, dt) {
  const puffs = smoke.userData.puffs;
  if (!puffs) return;

  for (const puff of puffs) {
    const bp = puff.userData.basePos;
    const phase = puff.userData.phase;
    const speed = puff.userData.speed;

    // Drift right and up, then loop
    const t = ((time * speed + phase) % 4) / 4;
    puff.position.x = bp.x + t * 3;
    puff.position.y = bp.y + Math.sin(t * Math.PI) * 1.5;
    puff.position.z = bp.z + Math.sin(t * Math.PI * 2 + phase) * 0.3;

    // Scale based on life
    const s = 1 + t * 1.5;
    puff.scale.set(s, s, s);

    // Fade
    const mat = puff.material;
    if (mat.uniforms) {
      mat.uniforms.uOpacity.value = (1 - t) * 0.7;
    }
  }
}

function createSnowSpray(numCars, carLength) {
  const count = 60;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xfaf8f5) },
    },
    vertexShader: `
      attribute float size;
      varying float vAlpha;
      void main() {
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        float dist = length(mvPos.xyz);
        vAlpha = smoothstep(40.0, 5.0, dist);
        gl_PointSize = size * (150.0 / -mvPos.z);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float a = (1.0 - d * d) * vAlpha * 0.6;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

  const points = new THREE.Points(geom, mat);
  points.userData.particles = { positions, sizes, velocities: [] };

  for (let i = 0; i < count; i++) {
    positions[i * 3] = 0;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = 0;
    sizes[i] = 0.2 + Math.random() * 0.4;
    points.userData.particles.velocities.push({
      x: -1 - Math.random() * 2,
      y: 0.5 + Math.random() * 1.5,
      z: (Math.random() - 0.5) * 1.5,
      life: Math.random(),
    });
  }

  return points;
}

function updateSpray(spray, time, dt, parent) {
  const p = spray.userData.particles;
  if (!p) return;

  for (let i = 0; i < p.positions.length / 3; i++) {
    const v = p.velocities[i];
    v.life += dt * 0.5;
    if (v.life > 1) {
      v.life = 0;
      // Emit from behind train wheels
      const trainLen = parent.userData.params?.numCars || 5;
      const carLen = parent.userData.params?.carLength || 3.5;
      p.positions[i * 3] = -(trainLen * (carLen + 0.4) * 0.3) + (Math.random() - 0.5) * 2;
      p.positions[i * 3 + 1] = 0.1;
      p.positions[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
    }
    p.positions[i * 3] += v.x * dt;
    p.positions[i * 3 + 1] += v.y * dt;
    p.positions[i * 3 + 2] += v.z * dt;
    p.sizes[i] = 0.2 + v.life * 0.5;
  }

  spray.geometry.attributes.position.needsUpdate = true;
  spray.geometry.attributes.size.needsUpdate = true;
}

export default createTrainModule;
