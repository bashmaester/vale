// Procedural Tokyo Crossing Module
// Creates a rainy intersection with umbrellas, reflections, and overhead train
import * as THREE from 'three';
import { createLinocutMaterial } from '../shaders/linocut.js';

export function createCrossingModule(params = {}) {
  const group = new THREE.Group();

  // Road surface with wet reflections
  const road = createWetRoad(params);
  group.add(road);

  // Crosswalk stripes
  const crosswalk = createCrosswalk(params);
  group.add(crosswalk);

  // Traffic signals
  const signals = createSignals(params);
  group.add(signals);

  // Crowd of umbrella figures
  const crowd = createUmbrellaCrowd(params);
  group.add(crowd);

  // Rain system
  const rain = createRainSystem(params);
  group.add(rain);

  // Overhead train track and train
  const overhead = createOverheadTrain(params);
  group.add(overhead);

  // Buildings backdrop
  const buildings = createBuildings(params);
  group.add(buildings);

  // Reflections (rendered as inverted semi-transparent copies)
  const reflections = createReflections(group, params);
  group.add(reflections);

  group.userData = {
    type: 'crossing',
    params,
    state: 'waiting', // waiting -> crossing -> draining
    timer: 0,
    update: (time, dt) => updateCrossing(group, time, dt),
  };

  return group;
}

function createWetRoad(params) {
  const width = params.roadWidth || 30;
  const depth = params.roadDepth || 30;
  const geom = new THREE.PlaneGeometry(width, depth, 40, 40);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWaterColor: { value: new THREE.Color(0x0a1520) },
      uReflectColor: { value: new THREE.Color(0x1a3a4a) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        vUv = uv;
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uWaterColor;
      uniform vec3 uReflectColor;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vPos;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
        vec2 uv = vUv - 0.5;
        // Ripple distortion
        float ripple = sin(uv.x * 40.0 + uTime) * sin(uv.y * 30.0 + uTime * 0.7) * 0.02;
        vec2 distUv = vUv + vec2(ripple);

        // Reflection gradient
        float reflect = smoothstep(0.0, 0.3, abs(distUv.y));
        vec3 color = mix(uWaterColor, uReflectColor, reflect * 0.3);

        // Wet highlights (carved lines look)
        float line = abs(sin(distUv.x * 80.0 + distUv.y * 20.0));
        color += vec3(0.1, 0.15, 0.2) * smoothstep(0.95, 1.0, line) * 0.3;

        // Red signal reflection
        float redPool = smoothstep(0.5, 0.0, length(uv - vec2(0.0, 0.0))) * 0.15;
        color += vec3(0.6, 0.15, 0.1) * redPool;

        // Teal reflections
        float tealPool = smoothstep(0.5, 0.0, length(uv - vec2(0.3, -0.2))) * 0.1;
        color += vec3(0.1, 0.5, 0.5) * tealPool;

        gl_FragColor = vec4(color, 0.95);
      }
    `,
    transparent: true,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.01;
  mesh.userData.mat = mat;
  return mesh;
}

function createCrosswalk(params) {
  const group = new THREE.Group();
  const numStripes = params.stripes || 12;
  const stripeWidth = 1.2;
  const stripeGap = 0.6;
  const crossingLength = params.crossingLength || 15;

  for (let i = 0; i < numStripes; i++) {
    const geom = new THREE.PlaneGeometry(stripeWidth, crossingLength);
    const mat = createLinocutMaterial({
      color: new THREE.Color(0xf0ece8),
      carveColor: new THREE.Color(0x2a2a30),
      carveDepth: 0.5,
      carveScale: 3.0,
      gougeAmount: 0.2,
    });
    const stripe = new THREE.Mesh(geom, mat);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(
      -crossingLength / 2 + stripeWidth / 2 + i * (stripeWidth + stripeGap),
      0.02,
      0
    );
    group.add(stripe);
  }

  return group;
}

function createSignals(params) {
  const group = new THREE.Group();
  const signalPositions = [
    [-8, 0, -6], [8, 0, -6], [-8, 0, 6], [8, 0, 6],
  ];

  signalPositions.forEach((pos, i) => {
    const pole = new THREE.Group();

    // Pole
    const poleGeom = new THREE.CylinderGeometry(0.06, 0.06, 3, 6);
    const poleMat = createLinocutMaterial({
      color: new THREE.Color(0x1a1a20),
      carveColor: new THREE.Color(0x0a0a10),
    });
    const poleMesh = new THREE.Mesh(poleGeom, poleMat);
    poleMesh.position.y = 1.5;
    pole.add(poleMesh);

    // Signal head
    const headGeom = new THREE.BoxGeometry(0.4, 0.8, 0.3);
    const headMat = createLinocutMaterial({
      color: new THREE.Color(0x1a1a20),
      carveColor: new THREE.Color(0x050508),
      carveDepth: 0.8,
    });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.y = 2.8;
    pole.add(head);

    // Red light
    const redGeom = new THREE.SphereGeometry(0.12, 8, 8);
    const redMat = new THREE.MeshBasicMaterial({ color: 0xcc2020 });
    const red = new THREE.Mesh(redGeom, redMat);
    red.position.set(0, 3.0, 0.16);
    red.userData.isLight = true;
    red.userData.color = 'red';
    pole.add(red);

    // Green/teal light
    const tealGeom = new THREE.SphereGeometry(0.12, 8, 8);
    const tealMat = new THREE.MeshBasicMaterial({ color: 0x002020 });
    const teal = new THREE.Mesh(tealGeom, tealMat);
    teal.position.set(0, 2.6, 0.16);
    teal.userData.isLight = true;
    teal.userData.color = 'teal';
    pole.add(teal);

    pole.position.set(...pos);
    group.add(pole);
  });

  return group;
}

function createUmbrellaCrowd(params) {
  const group = new THREE.Group();
  const count = params.crowdCount || 40;

  for (let i = 0; i < count; i++) {
    const umbrella = createUmbrellaFigure();
    const x = (Math.random() - 0.5) * 10;
    const z = (Math.random() - 0.5) * 10;
    umbrella.position.set(x, 0, z);
    umbrella.userData.speed = 0.5 + Math.random() * 1.5;
    umbrella.userData.targetX = (Math.random() - 0.5) * 20;
    umbrella.userData.targetZ = (Math.random() - 0.5) * 20;
    group.add(umbrella);
  }

  return group;
}

function createUmbrellaFigure() {
  const figure = new THREE.Group();

  // Umbrella canopy (dome)
  const canopyGeom = new THREE.SphereGeometry(0.4, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  const colors = [0xc44030, 0x1a5a50, 0xf0ece8, 0x0a0a10, 0xc44030];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const canopyMat = createLinocutMaterial({
    color: new THREE.Color(color),
    carveColor: new THREE.Color(color).multiplyScalar(0.3),
    carveDepth: 0.6,
    carveScale: 4.0,
  });
  const canopy = new THREE.Mesh(canopyGeom, canopyMat);
  canopy.position.y = 1.4;
  figure.add(canopy);

  // Stick
  const stickGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 4);
  const stickMat = createLinocutMaterial({ color: new THREE.Color(0x1a1a20) });
  const stick = new THREE.Mesh(stickGeom, stickMat);
  stick.position.y = 1.0;
  figure.add(stick);

  // Body (simple figure)
  const bodyGeom = new THREE.CylinderGeometry(0.1, 0.15, 0.8, 6);
  const bodyMat = createLinocutMaterial({
    color: new THREE.Color(0x0a0a10),
    carveColor: new THREE.Color(0x050508),
  });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.position.y = 0.4;
  figure.add(body);

  return figure;
}

function createRainSystem(params) {
  const count = params.rainCount || 2000;
  const height = params.rainHeight || 15;
  const spread = params.rainSpread || 20;

  const positions = new Float32Array(count * 3);
  const velocities = [];

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * spread;
    positions[i * 3 + 1] = Math.random() * height;
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
    velocities.push({
      speed: 8 + Math.random() * 5,
      wobble: Math.random() * 2,
    });
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xaaccdd) },
      uOpacity: { value: 0.4 },
    },
    vertexShader: `
      varying float vAlpha;
      void main() {
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        float dist = length(mvPos.xyz);
        vAlpha = smoothstep(30.0, 5.0, dist);
        gl_Position = projectionMatrix * mvPos;
        gl_PointSize = 1.5;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        gl_FragColor = vec4(uColor, uOpacity * vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geom, mat);
  points.userData.velocities = velocities;
  points.userData.height = height;
  points.userData.spread = spread;

  return points;
}

function createOverheadTrain(params) {
  const group = new THREE.Group();

  // Elevated track
  const trackGeom = new THREE.BoxGeometry(40, 0.3, 2);
  const trackMat = createLinocutMaterial({
    color: new THREE.Color(0x1a1a20),
    carveColor: new THREE.Color(0x0a0a10),
    carveDepth: 0.7,
    carveScale: 4.0,
  });
  const track = new THREE.Mesh(trackGeom, trackMat);
  track.position.y = 8;
  track.position.z = -10;
  group.add(track);

  // Support pillars
  for (let i = -5; i <= 5; i++) {
    const pillarGeom = new THREE.BoxGeometry(0.3, 8, 0.3);
    const pillar = new THREE.Mesh(pillarGeom, trackMat);
    pillar.position.set(i * 4, 4, -10);
    group.add(pillar);
  }

  // Train on track
  const trainGeom = new THREE.BoxGeometry(12, 1.5, 1.8);
  const trainMat = createLinocutMaterial({
    color: new THREE.Color(0x2a8a7a),
    carveColor: new THREE.Color(0x0a2a25),
    carveDepth: 0.7,
    carveScale: 3.0,
    overprintColor: new THREE.Color(0xc44030),
    overprintAmount: 0.1,
  });
  const train = new THREE.Mesh(trainGeom, trainMat);
  train.position.y = 9;
  train.position.z = -10;
  train.userData.isOverheadTrain = true;
  group.add(train);

  // Windows on train
  for (let w = 0; w < 8; w++) {
    const winGeom = new THREE.PlaneGeometry(0.6, 0.5);
    const winMat = new THREE.MeshBasicMaterial({ color: 0xdde8f0 });
    const win = new THREE.Mesh(winGeom, winMat);
    win.position.set(-5 + w * 1.4, 9.1, -9.09);
    group.add(win);
  }

  return group;
}

function createBuildings(params) {
  const group = new THREE.Group();
  const count = 8;

  for (let i = 0; i < count; i++) {
    const h = 5 + Math.random() * 15;
    const w = 2 + Math.random() * 4;
    const d = 2 + Math.random() * 3;
    const geom = new THREE.BoxGeometry(w, h, d);
    const mat = createLinocutMaterial({
      color: new THREE.Color(0x12121a),
      carveColor: new THREE.Color(0x08080c),
      carveDepth: 0.6,
      carveScale: 2.0 + Math.random(),
      gougeAmount: 0.2,
    });
    const building = new THREE.Mesh(geom, mat);
    const side = i < count / 2 ? -1 : 1;
    building.position.set(
      side * (15 + Math.random() * 10),
      h / 2,
      -8 + (i % 4) * 5
    );
    group.add(building);

    // Lit windows
    for (let wy = 0; wy < Math.floor(h / 1.5); wy++) {
      for (let wx = 0; wx < Math.floor(w / 1.2); wx++) {
        if (Math.random() > 0.4) {
          const winGeom = new THREE.PlaneGeometry(0.4, 0.5);
          const colors = [0xf0d080, 0xe8e4e0, 0xc44030, 0x2a9a8a];
          const winColor = colors[Math.floor(Math.random() * colors.length)];
          const winMat = new THREE.MeshBasicMaterial({
            color: winColor,
            transparent: true,
            opacity: 0.7 + Math.random() * 0.3,
          });
          const win = new THREE.Mesh(winGeom, winMat);
          win.position.set(
            building.position.x - w / 2 + 0.5 + wx * 1.2 + (side > 0 ? w : 0),
            1 + wy * 1.5,
            building.position.z
          );
          win.rotation.y = side > 0 ? 0 : Math.PI;
          group.add(win);
        }
      }
    }
  }

  return group;
}

function createReflections(parent, params) {
  // Simplified reflections via a mirrored semi-transparent plane
  const geom = new THREE.PlaneGeometry(30, 30);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x0a1520,
    transparent: true,
    opacity: 0.15,
  });
  const ref = new THREE.Mesh(geom, mat);
  ref.rotation.x = -Math.PI / 2;
  ref.position.y = 0.005;
  return ref;
}

// Signal cycle: waiting -> crossing -> draining
function updateCrossing(group, time, dt) {
  const ud = group.userData;
  if (!ud) return;

  ud.timer += dt;
  const cycleTime = 8; // seconds per full cycle
  const phase = (ud.timer % cycleTime) / cycleTime;

  // Update road shader
  group.traverse(child => {
    if (child.userData.mat && child.userData.mat.uniforms) {
      child.userData.mat.uniforms.uTime.value = time;
    }
  });

  // Update rain
  group.traverse(child => {
    if (child.userData.velocities) {
      const pos = child.geometry.attributes.position;
      const vels = child.userData.velocities;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i);
        y -= vels[i].speed * dt;
        if (y < 0) {
          y = child.userData.height;
          pos.setX(i, (Math.random() - 0.5) * child.userData.spread);
          pos.setZ(i, (Math.random() - 0.5) * child.userData.spread);
        }
        // Wind drift
        pos.setX(i, pos.getX(i) + Math.sin(time + i) * 0.001);
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }
  });

  // Signal light cycling
  const signalPhase = phase * 4;
  group.traverse(child => {
    if (child.userData.isLight) {
      const isRedOn = signalPhase < 2;
      if (child.userData.color === 'red') {
        child.material.color.setHex(isRedOn ? 0xcc2020 : 0x330808);
      } else if (child.userData.color === 'teal') {
        child.material.color.setHex(!isRedOn ? 0x20ccaa : 0x083328);
      }
    }
  });

  // Umbrella movement based on phase
  const crowd = group.children.find(c => c.children?.length > 20);
  if (crowd) {
    const crossing = phase > 0.25 && phase < 0.6;
    crowd.children.forEach((umbrella, i) => {
      if (crossing) {
        // Surge diagonally
        const t = (phase - 0.25) / 0.35;
        umbrella.position.x += Math.cos(i * 0.7) * 0.02;
        umbrella.position.z += Math.sin(i * 0.5) * 0.02;
      } else if (phase > 0.6) {
        // Drain away
        umbrella.position.x += (umbrella.userData.targetX - umbrella.position.x) * 0.01;
        umbrella.position.z += (umbrella.userData.targetZ - umbrella.position.z) * 0.01;
      }
    });
  }

  // Overhead train movement
  group.traverse(child => {
    if (child.userData.isOverheadTrain) {
      child.position.x = Math.sin(time * 0.3) * 15;
    }
  });
}

export default createCrossingModule;
