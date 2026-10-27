// Procedural Train Module — detailed red train with sculptural smoke
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
  const wheelCount = numCars * 2;
  for (let i = 0; i < numCars; i++) {
    const xPos = (numCars * (carLength + 0.4) * 0.5) - i * (carLength + 0.4);
    for (let w = -1; w <= 1; w += 2) {
      const wheel = createWheel(darkColor);
      wheel.position.set(xPos + w * (carLength * 0.35), -carHeight * 0.45, carWidth * 0.55);
      wheel.userData.isWheel = true;
      group.add(wheel);
      const wheel2 = createWheel(darkColor);
      wheel2.position.set(xPos + w * (carLength * 0.35), -carHeight * 0.45, -carWidth * 0.55);
      wheel2.userData.isWheel = true;
      group.add(wheel2);
    }
  }

  // Connecting rods
  const rodGeom = new THREE.CylinderGeometry(0.03, 0.03, carLength * 0.72, 4);
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
    rod.userData.isWheel = true;
    group.add(rod);
    const rod2 = rod.clone();
    rod2.position.z = -carWidth * 0.55;
    rod2.userData.isWheel = true;
    group.add(rod2);
  }

  // Metaball-style carved smoke
  const smoke = createMetaballSmoke();
  smoke.position.set(numCars * (carLength + 0.4) * 0.5 + 1.5, carHeight * 0.9, 0);
  group.add(smoke);

  // Snow spray
  const spray = createSnowSpray(numCars, carLength, carWidth);
  group.add(spray);

  // Window flicker lights (warm glow inside cars)
  const windowLights = [];
  group.traverse(child => {
    if (child.userData.isWindow) {
      windowLights.push(child);
    }
  });

  group.userData = {
    type: 'train',
    params,
    update: (time, dt) => {
      updateSmoke(smoke, time, dt);
      updateSpray(spray, time, dt, group);
      // Rotate wheels
      const wheelSpeed = 3.0;
      group.traverse(child => {
        if (child.userData.isWheel) {
          child.rotation.x += wheelSpeed * dt;
        }
      });
      // Flicker windows
      for (const win of windowLights) {
        const base = win.userData.baseBrightness || 0.85;
        const flicker = Math.sin(time * 5 + win.position.x * 2) * 0.05 + Math.random() * 0.03;
        win.material.color.setRGB(0.94 + flicker, 0.82 + flicker * 0.5, 0.5 + flicker * 0.2);
      }
    }
  };

  return group;
}

function createEngine(length, width, height, red, dark, overprint) {
  const car = new THREE.Group();

  // Boiler
  const boilerGeom = new THREE.CylinderGeometry(0.5, 0.5, length * 0.6, 14);
  boilerGeom.rotateZ(Math.PI / 2);
  const boilerMat = createLinocutMaterial({
    color: dark,
    carveColor: new THREE.Color(0x050508),
    carveDepth: 0.85,
    carveScale: 4.0,
    gougeAmount: 0.5,
    grainIntensity: 0.06,
  });
  const boiler = new THREE.Mesh(boilerGeom, boilerMat);
  boiler.position.x = length * 0.3;
  car.add(boiler);

  // Boiler bands (horizontal rings)
  for (let b = 0; b < 3; b++) {
    const bandGeom = new THREE.TorusGeometry(0.52, 0.03, 6, 12);
    bandGeom.rotateY(Math.PI / 2);
    const bandMat = createLinocutMaterial({
      color: new THREE.Color(0x2a2a30),
      carveColor: new THREE.Color(0x0a0a10),
      carveDepth: 0.9,
    });
    const band = new THREE.Mesh(bandGeom, bandMat);
    band.position.x = length * 0.1 + b * length * 0.15;
    car.add(band);
  }

  // Cab
  const cabGeom = new THREE.BoxGeometry(length * 0.5, height, width);
  const cabMat = createLinocutMaterial({
    color: red,
    carveColor: dark,
    carveDepth: 0.75,
    carveScale: 3.5,
    gougeAmount: 0.4,
    overprintColor: overprint,
    overprintAmount: 0.15,
    roughness: 0.4,
  });
  const cab = new THREE.Mesh(cabGeom, cabMat);
  cab.position.x = -length * 0.15;
  car.add(cab);

  // Cab roof
  const roofGeom = new THREE.BoxGeometry(length * 0.55, 0.1, width + 0.18);
  const roofMat = createLinocutMaterial({
    color: dark,
    carveColor: new THREE.Color(0x050508),
    carveDepth: 0.9,
    carveScale: 5.0,
  });
  const roof = new THREE.Mesh(roofGeom, roofMat);
  roof.position.set(-length * 0.15, height * 0.55, 0);
  car.add(roof);

  // Smokestack with flared top
  const stackGeom = new THREE.CylinderGeometry(0.12, 0.18, 0.7, 8);
  const stackMat = createLinocutMaterial({
    color: dark,
    carveColor: new THREE.Color(0x050508),
    carveDepth: 0.9,
    carveScale: 6.0,
  });
  const stack = new THREE.Mesh(stackGeom, stackMat);
  stack.position.set(length * 0.3, height * 0.5 + 0.35, 0);
  car.add(stack);

  // Stack flare (trumpet top)
  const flareGeom = new THREE.CylinderGeometry(0.2, 0.12, 0.12, 8);
  const flare = new THREE.Mesh(flareGeom, stackMat);
  flare.position.set(length * 0.3, height * 0.5 + 0.72, 0);
  car.add(flare);

  // Cow catcher (angled slats)
  for (let s = 0; s < 5; s++) {
    const slatGeom = new THREE.BoxGeometry(0.06, 0.35, width + 0.25);
    const slatMat = createLinocutMaterial({
      color: new THREE.Color(0x2a2a30),
      carveColor: new THREE.Color(0x0a0a10),
      carveDepth: 0.9,
    });
    const slat = new THREE.Mesh(slatGeom, slatMat);
    slat.position.set(length * 0.55 + s * 0.08, -height * 0.25, 0);
    slat.rotation.z = -0.3 - s * 0.1;
    car.add(slat);
  }

  // Headlights
  for (const zOff of [width * 0.52, -width * 0.52]) {
    const lightGeom = new THREE.SphereGeometry(0.12, 10, 10);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xf5e0a0 });
    const light = new THREE.Mesh(lightGeom, lightMat);
    light.position.set(length * 0.62, 0.1, zOff);
    car.add(light);

    // Light housing
    const housingGeom = new THREE.CylinderGeometry(0.14, 0.14, 0.08, 8);
    housingGeom.rotateZ(Math.PI / 2);
    const housing = new THREE.Mesh(housingGeom, stackMat);
    housing.position.set(length * 0.58, 0.1, zOff);
    car.add(housing);
  }

  // Warm cab windows with flicker
  for (let w = 0; w < 2; w++) {
    const winGeom = new THREE.PlaneGeometry(0.38, 0.42);
    const winMat = new THREE.MeshBasicMaterial({ color: 0xf0d080 });
    const win = new THREE.Mesh(winGeom, winMat);
    win.position.set(-length * 0.15, 0.1, width * 0.51);
    win.userData.isWindow = true;
    win.userData.baseBrightness = 0.9;
    car.add(win);

    const win2 = win.clone();
    win2.position.z = -width * 0.51;
    win2.rotation.y = Math.PI;
    car.add(win2);

    // Window frame
    const frameGeom = new THREE.BoxGeometry(0.44, 0.48, 0.04);
    const frameMat = createLinocutMaterial({ color: dark, carveDepth: 0.9 });
    const frame = new THREE.Mesh(frameGeom, frameMat);
    frame.position.copy(win.position);
    frame.position.z -= 0.02;
    car.add(frame);
  }

  // Bell
  const bellGeom = new THREE.SphereGeometry(0.08, 8, 6);
  const bellMat = createLinocutMaterial({
    color: new THREE.Color(0xc0a040),
    carveColor: new THREE.Color(0x605020),
  });
  const bell = new THREE.Mesh(bellGeom, bellMat);
  bell.position.set(length * 0.1, height * 0.6, 0);
  car.add(bell);

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
    roughness: 0.35,
  });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  car.add(body);

  // Roof
  const roofGeom = new THREE.BoxGeometry(length + 0.12, 0.1, width + 0.14);
  const roofMat = createLinocutMaterial({
    color: dark,
    carveColor: new THREE.Color(0x050508),
    carveDepth: 0.9,
    carveScale: 5.0,
  });
  const roof = new THREE.Mesh(roofGeom, roofMat);
  roof.position.y = height * 0.55;
  car.add(roof);

  // Roof curve (slight arch)
  const archGeom = new THREE.CylinderGeometry(width * 0.6, width * 0.6, length + 0.1, 8, 1, false, 0, Math.PI);
  archGeom.rotateX(Math.PI / 2);
  archGeom.rotateZ(Math.PI / 2);
  const archMat = createLinocutMaterial({
    color: dark,
    carveColor: new THREE.Color(0x050508),
    carveDepth: 0.85,
  });
  const arch = new THREE.Mesh(archGeom, archMat);
  arch.position.y = height * 0.55;
  car.add(arch);

  // Underbody
  const underGeom = new THREE.BoxGeometry(length - 0.15, 0.18, width - 0.08);
  const underMat = createLinocutMaterial({
    color: new THREE.Color(0x0a0a10),
    carveColor: new THREE.Color(0x050508),
    carveDepth: 0.9,
  });
  const under = new THREE.Mesh(underGeom, underMat);
  under.position.y = -height * 0.48;
  car.add(under);

  // Body trim line
  const trimGeom = new THREE.BoxGeometry(length + 0.02, 0.04, width + 0.02);
  const trimMat = new THREE.MeshBasicMaterial({ color: 0xf0ece8 });
  const trim = new THREE.Mesh(trimGeom, trimMat);
  trim.position.y = -height * 0.15;
  car.add(trim);

  // Windows
  const numWindows = Math.max(3, Math.floor(length / 0.85));
  for (let w = 0; w < numWindows; w++) {
    const xPos = -length * 0.42 + 0.5 + w * ((length - 1.0) / Math.max(1, numWindows - 1));

    for (const zDir of [1, -1]) {
      // Window frame
      const frameGeom = new THREE.BoxGeometry(0.4, 0.46, 0.05);
      const frameMat = createLinocutMaterial({
        color: dark,
        carveColor: new THREE.Color(0x050508),
        carveDepth: 0.9,
        carveScale: 6.0,
      });
      const frame = new THREE.Mesh(frameGeom, frameMat);
      frame.position.set(xPos, 0.08, zDir * width * 0.51);
      car.add(frame);

      // Window glass
      const winGeom = new THREE.PlaneGeometry(0.32, 0.38);
      const brightness = 0.7 + Math.random() * 0.25;
      const winMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.94 * brightness, 0.82 * brightness, 0.5 * brightness),
      });
      const win = new THREE.Mesh(winGeom, winMat);
      win.position.set(xPos, 0.08, zDir * (width * 0.51 + 0.03));
      win.userData.isWindow = true;
      win.userData.baseBrightness = brightness;
      car.add(win);

      // Window divider (cross)
      const divH = new THREE.BoxGeometry(0.34, 0.02, 0.02);
      const divV = new THREE.BoxGeometry(0.02, 0.4, 0.02);
      const divMat = createLinocutMaterial({ color: dark, carveDepth: 0.9 });
      const divHMesh = new THREE.Mesh(divH, divMat);
      divHMesh.position.set(xPos, 0.08, zDir * (width * 0.51 + 0.01));
      car.add(divHMesh);
      const divVMesh = new THREE.Mesh(divV, divMat);
      divVMesh.position.set(xPos, 0.08, zDir * (width * 0.51 + 0.01));
      car.add(divVMesh);
    }
  }

  // "MAIL" sign on car 1
  if (index === 1) {
    for (const zDir of [1, -1]) {
      const signGeom = new THREE.PlaneGeometry(1.2, 0.28);
      const signMat = new THREE.MeshBasicMaterial({
        color: 0xfaf8f5,
        transparent: true,
        opacity: 0.85,
      });
      const sign = new THREE.Mesh(signGeom, signMat);
      sign.position.set(0, 0.25, zDir * (width * 0.51 + 0.02));
      sign.rotation.y = zDir > 0 ? 0 : Math.PI;
      car.add(sign);
    }
  }

  return car;
}

function createWheel(color) {
  const geom = new THREE.CylinderGeometry(0.18, 0.18, 0.12, 12);
  geom.rotateX(Math.PI / 2);

  // Add spokes
  const spokeGroup = new THREE.Group();
  const wheelMesh = new THREE.Mesh(geom, createLinocutMaterial({
    color,
    carveColor: new THREE.Color(0x050508),
    carveDepth: 0.9,
    carveScale: 8.0,
    gougeAmount: 0.3,
  }));
  spokeGroup.add(wheelMesh);

  // Spokes
  for (let s = 0; s < 5; s++) {
    const spokeGeom = new THREE.BoxGeometry(0.32, 0.04, 0.06);
    const spokeMat = createLinocutMaterial({
      color: new THREE.Color(0x1a1a20),
      carveColor: new THREE.Color(0x050508),
      carveDepth: 0.9,
    });
    const spoke = new THREE.Mesh(spokeGeom, spokeMat);
    spoke.rotation.z = (s / 5) * Math.PI * 2;
    spokeGroup.add(spoke);
  }

  // Hub
  const hubGeom = new THREE.CylinderGeometry(0.05, 0.05, 0.14, 8);
  hubGeom.rotateX(Math.PI / 2);
  const hub = new THREE.Mesh(hubGeom, createLinocutMaterial({
    color: new THREE.Color(0x2a2a30),
    carveDepth: 0.9,
  }));
  spokeGroup.add(hub);

  return spokeGroup;
}

// Metaball-style smoke — large sculptural cloud puffs
function createMetaballSmoke() {
  const group = new THREE.Group();
  const smokeMat = createLinocutMaterial({
    color: new THREE.Color(0xe8e4e0),
    carveColor: new THREE.Color(0x2a2a30),
    carveDepth: 0.55,
    carveScale: 1.2,
    gougeAmount: 0.15,
    grainIntensity: 0.04,
    transparent: true,
    opacity: 0.88,
    edgeDarken: 0.3,
  });

  const puffs = [];
  // Create large sculptural cloud masses
  const configs = [
    { r: 0.8, pos: [0.5, 0.3, 0], speed: 0.4 },
    { r: 1.0, pos: [1.5, 0.8, 0.2], speed: 0.35 },
    { r: 1.2, pos: [2.8, 1.2, -0.1], speed: 0.3 },
    { r: 0.9, pos: [4.0, 1.5, 0.15], speed: 0.28 },
    { r: 1.1, pos: [5.2, 1.8, -0.1], speed: 0.25 },
    { r: 0.7, pos: [1.0, 0.6, -0.2], speed: 0.38 },
    { r: 0.85, pos: [3.5, 1.0, 0.25], speed: 0.32 },
    { r: 0.6, pos: [6.0, 2.0, 0], speed: 0.22 },
  ];

  for (const cfg of configs) {
    const geom = new THREE.SphereGeometry(cfg.r, 10, 8);
    const puff = new THREE.Mesh(geom, smokeMat.clone());
    puff.position.set(...cfg.pos);
    puff.userData.basePos = puff.position.clone();
    puff.userData.baseRadius = cfg.r;
    puff.userData.speed = cfg.speed;
    puff.userData.phase = Math.random() * Math.PI * 2;
    puff.userData.rotSpeed = (Math.random() - 0.5) * 0.3;
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
    const baseR = puff.userData.baseRadius;

    // Drift right and up in a looping pattern
    const t = ((time * speed + phase) % 5) / 5;

    // Curved path — up and right with slight wobble
    puff.position.x = bp.x + t * 4 + Math.sin(time * 0.5 + phase) * 0.3;
    puff.position.y = bp.y + Math.sin(t * Math.PI) * 2.0;
    puff.position.z = bp.z + Math.sin(t * Math.PI * 2 + phase) * 0.4;

    // Scale — grows as it rises
    const s = 1 + t * 1.8;
    puff.scale.set(s, s * (1 + t * 0.3), s);

    // Slow rotation
    puff.rotation.y += puff.userData.rotSpeed * dt;
    puff.rotation.z = Math.sin(time * 0.3 + phase) * 0.1;

    // Fade
    const mat = puff.material;
    if (mat.uniforms) {
      mat.uniforms.uOpacity.value = (1 - t * 0.8) * 0.75;
    }
  }
}

function createSnowSpray(numCars, carLength, carWidth) {
  const count = 80;
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
  const velocities = [];
  for (let i = 0; i < count; i++) {
    positions[i * 3] = 0;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = 0;
    sizes[i] = 0.15 + Math.random() * 0.35;
    velocities.push({
      x: -1.5 - Math.random() * 2.5,
      y: 0.3 + Math.random() * 2.0,
      z: (Math.random() - 0.5) * 2.0,
      life: Math.random(),
    });
  }
  points.userData.particles = { positions, sizes, velocities };

  return points;
}

function updateSpray(spray, time, dt, parent) {
  const p = spray.userData.particles;
  if (!p) return;

  const trainLen = parent.userData.params?.numCars || 5;
  const carLen = parent.userData.params?.carLength || 3.5;

  for (let i = 0; i < p.positions.length / 3; i++) {
    const v = p.velocities[i];
    v.life += dt * 0.6;
    if (v.life > 1) {
      v.life = 0;
      // Emit from behind train wheels at ground level
      const emitX = -(trainLen * (carLen + 0.4) * 0.3) + (Math.random() - 0.5) * 3;
      p.positions[i * 3] = emitX;
      p.positions[i * 3 + 1] = 0.05 + Math.random() * 0.1;
      p.positions[i * 3 + 2] = (Math.random() - 0.5) * 1.8;
    }
    // Physics
    p.positions[i * 3] += v.x * dt;
    p.positions[i * 3 + 1] += v.y * dt - 0.5 * dt * dt; // gravity
    p.positions[i * 3 + 2] += v.z * dt;
    if (p.positions[i * 3 + 1] < 0) p.positions[i * 3 + 1] = 0;
    p.sizes[i] = 0.15 + v.life * 0.4;
  }

  spray.geometry.attributes.position.needsUpdate = true;
  spray.geometry.attributes.size.needsUpdate = true;
}

export default createTrainModule;
