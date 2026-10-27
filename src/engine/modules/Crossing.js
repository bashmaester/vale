// Procedural Tokyo Crossing Module — rainy night intersection
import * as THREE from 'three';
import { createLinocutMaterial } from '../shaders/linocut.js';

export function createCrossingModule(params = {}) {
  const group = new THREE.Group();

  // Wet road surface
  const road = createWetRoad(params);
  group.add(road);

  // Crosswalk
  const crosswalk = createCrosswalk(params);
  group.add(crosswalk);

  // Traffic signals
  const signals = createSignals(params);
  group.add(signals);

  // Crowd of umbrella figures
  const crowd = createUmbrellaCrowd(params);
  group.add(crowd);

  // Rain streaks
  const rain = createRainStreaks(params);
  group.add(rain);

  // Overhead train and track
  const overhead = createOverheadTrain(params);
  group.add(overhead);

  // Buildings backdrop
  const buildings = createBuildings(params);
  group.add(buildings);

  // Street details (poles, signs)
  const street = createStreetDetails(params);
  group.add(street);

  group.userData = {
    type: 'crossing',
    params,
    cycleTime: 0,
    update: (time, dt) => updateCrossing(group, time, dt),
  };

  return group;
}

function createWetRoad(params) {
  const width = params.roadWidth || 35;
  const depth = params.roadDepth || 35;

  const geom = new THREE.PlaneGeometry(width, depth, 60, 60);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRoadColor: { value: new THREE.Color(0x080810) },
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
      uniform float uTime;
      uniform vec3 uRoadColor;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
        vec2 uv = vUv - 0.5;

        // Base dark asphalt
        vec3 color = uRoadColor;

        // Wet surface — mirror reflections
        // Distort UV for ripple effect
        float ripple = sin(uv.x * 50.0 + uTime * 2.0) * sin(uv.y * 40.0 + uTime * 1.5) * 0.008;
        vec2 rUv = uv + vec2(ripple, ripple * 0.7);

        // Reflection of signals (red pool in center)
        float redDist = length(uv);
        float redReflect = smoothstep(0.4, 0.0, redDist) * 0.25;
        // Stretched vertically for wet look
        redReflect *= smoothstep(0.0, 0.1, abs(uv.y) + 0.05);
        color += vec3(0.7, 0.15, 0.1) * redReflect;

        // Teal/cyan reflections from train and signs
        float tealDist = length(uv - vec2(0.2, -0.1));
        float tealReflect = smoothstep(0.3, 0.0, tealDist) * 0.15;
        color += vec3(0.1, 0.5, 0.55) * tealReflect;

        // White reflections from crosswalk
        float stripeX = fract(uv.x * 8.0);
        float stripeY = abs(uv.y);
        float stripeReflect = smoothstep(0.15, 0.0, abs(stripeX - 0.5)) * smoothstep(0.4, 0.0, stripeY) * 0.2;
        color += vec3(0.8, 0.78, 0.75) * stripeReflect;

        // Carved wet lines — horizontal gouges in asphalt
        float line = abs(sin(uv.y * 120.0 + uv.x * 5.0));
        float wetLine = smoothstep(0.97, 1.0, line) * 0.15;
        color += vec3(0.2, 0.25, 0.3) * wetLine;

        // Puddle highlights
        float puddle = hash(floor(uv * 10.0));
        if (puddle > 0.92) {
          float pSize = (puddle - 0.92) * 12.5;
          vec2 pCenter = fract(uv * 10.0) - 0.5;
          float pDist = length(pCenter);
          float puddleHighlight = smoothstep(0.08 * pSize, 0.0, pDist) * 0.12;
          color += vec3(0.3, 0.35, 0.4) * puddleHighlight;
        }

        // Grain
        float grain = hash(floor(uv * 500.0)) * 0.03;
        color += grain;

        gl_FragColor = vec4(color, 0.97);
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
  const numStripes = 10;
  const stripeWidth = 1.0;
  const stripeGap = 0.5;
  const crossingLength = 14;

  const stripeMat = createLinocutMaterial({
    color: new THREE.Color(0xf0ece8),
    carveColor: new THREE.Color(0x3a3a40),
    carveDepth: 0.4,
    carveScale: 2.5,
    gougeAmount: 0.15,
    grainIntensity: 0.04,
  });

  for (let i = 0; i < numStripes; i++) {
    const geom = new THREE.PlaneGeometry(stripeWidth, crossingLength);
    const stripe = new THREE.Mesh(geom, stripeMat);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(
      -crossingLength / 2 + stripeWidth / 2 + i * (stripeWidth + stripeGap),
      0.025,
      0
    );
    group.add(stripe);
  }

  return group;
}

function createSignals(params) {
  const group = new THREE.Group();
  const positions = [
    [-7, 0, -5], [7, 0, -5], [-7, 0, 5], [7, 0, 5],
  ];

  positions.forEach((pos, i) => {
    const pole = new THREE.Group();

    // Pole
    const poleGeom = new THREE.CylinderGeometry(0.05, 0.06, 3.5, 6);
    const poleMat = createLinocutMaterial({
      color: new THREE.Color(0x1a1a20),
      carveColor: new THREE.Color(0x0a0a10),
      carveDepth: 0.8,
    });
    const poleMesh = new THREE.Mesh(poleGeom, poleMat);
    poleMesh.position.y = 1.75;
    pole.add(poleMesh);

    // Signal head box
    const headGeom = new THREE.BoxGeometry(0.35, 0.7, 0.25);
    const headMat = createLinocutMaterial({
      color: new THREE.Color(0x151518),
      carveColor: new THREE.Color(0x050508),
      carveDepth: 0.9,
      carveScale: 5.0,
    });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.y = 3.2;
    pole.add(head);

    // Red light
    const redGeom = new THREE.SphereGeometry(0.1, 8, 8);
    const redMat = new THREE.MeshBasicMaterial({ color: 0x220808 });
    const red = new THREE.Mesh(redGeom, redMat);
    red.position.set(0, 3.35, 0.13);
    red.userData.isLight = true;
    red.userData.color = 'red';
    pole.add(red);

    // Green/teal light
    const greenGeom = new THREE.SphereGeometry(0.1, 8, 8);
    const greenMat = new THREE.MeshBasicMaterial({ color: 0x082020 });
    const green = new THREE.Mesh(greenGeom, greenMat);
    green.position.set(0, 3.0, 0.13);
    green.userData.isLight = true;
    green.userData.color = 'teal';
    pole.add(green);

    // Hood over lights
    const hoodGeom = new THREE.BoxGeometry(0.38, 0.08, 0.3);
    const hoodMat = createLinocutMaterial({ color: new THREE.Color(0x151518) });
    const hood1 = new THREE.Mesh(hoodGeom, hoodMat);
    hood1.position.set(0, 3.45, 0.05);
    pole.add(hood1);
    const hood2 = hood1.clone();
    hood2.position.y = 3.1;
    pole.add(hood2);

    pole.position.set(...pos);
    group.add(pole);
  });

  return group;
}

function createUmbrellaCrowd(params) {
  const group = new THREE.Group();
  const count = params.crowdCount || 50;

  for (let i = 0; i < count; i++) {
    const umbrella = createUmbrellaFigure();
    const x = (Math.random() - 0.5) * 12;
    const z = (Math.random() - 0.5) * 12;
    umbrella.position.set(x, 0, z);
    umbrella.userData.speed = 0.3 + Math.random() * 1.2;
    umbrella.userData.dir = Math.random() * Math.PI * 2;
    umbrella.userData.phase = Math.random() * Math.PI * 2;
    umbrella.userData.waitPos = new THREE.Vector3(x, 0, z);
    umbrella.userData.crossTarget = new THREE.Vector3(
      x + Math.cos(umbrella.userData.dir) * 8,
      0,
      z + Math.sin(umbrella.userData.dir) * 8
    );
    umbrella.userData.drainTarget = new THREE.Vector3(
      (Math.random() - 0.5) * 20,
      0,
      (Math.random() - 0.5) * 20
    );
    group.add(umbrella);
  }

  return group;
}

function createUmbrellaFigure() {
  const figure = new THREE.Group();

  // Umbrella canopy
  const canopyGeom = new THREE.SphereGeometry(0.35, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.6);
  const colors = [0xc44030, 0x1a6a5a, 0xf0ece8, 0x0a0a12, 0x2a8a7a, 0xc44030, 0x1a6a5a];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const canopyMat = createLinocutMaterial({
    color: new THREE.Color(color),
    carveColor: new THREE.Color(color).multiplyScalar(0.25),
    carveDepth: 0.65,
    carveScale: 3.5,
    gougeAmount: 0.3,
  });
  const canopy = new THREE.Mesh(canopyGeom, canopyMat);
  canopy.position.y = 1.3;
  figure.add(canopy);

  // Umbrella ribs (carved lines on canopy)
  for (let r = 0; r < 6; r++) {
    const angle = (r / 6) * Math.PI * 2;
    const ribGeom = new THREE.CylinderGeometry(0.008, 0.008, 0.35, 3);
    ribGeom.rotateZ(Math.PI / 2);
    const ribMat = createLinocutMaterial({ color: new THREE.Color(0x0a0a10) });
    const rib = new THREE.Mesh(ribGeom, ribMat);
    rib.position.y = 1.3;
    rib.rotation.y = angle;
    rib.position.x = Math.cos(angle) * 0.15;
    rib.position.z = Math.sin(angle) * 0.15;
    figure.add(rib);
  }

  // Stick
  const stickGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.75, 4);
  const stickMat = createLinocutMaterial({ color: new THREE.Color(0x0a0a10) });
  const stick = new THREE.Mesh(stickGeom, stickMat);
  stick.position.y = 0.95;
  figure.add(stick);

  // Body
  const bodyGeom = new THREE.CylinderGeometry(0.08, 0.12, 0.65, 6);
  const bodyMat = createLinocutMaterial({
    color: new THREE.Color(0x0a0a10),
    carveColor: new THREE.Color(0x050508),
    carveDepth: 0.9,
  });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.position.y = 0.35;
  figure.add(body);

  // Legs
  for (let l = -1; l <= 1; l += 2) {
    const legGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.35, 4);
    const leg = new THREE.Mesh(legGeom, bodyMat);
    leg.position.set(l * 0.05, 0.17, 0);
    figure.add(leg);
  }

  return figure;
}

function createRainStreaks(params) {
  const count = params.rainCount || 3000;
  const height = params.rainHeight || 18;
  const spread = params.rainSpread || 30;

  const positions = new Float32Array(count * 3);
  const velocities = [];

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * spread;
    positions[i * 3 + 1] = Math.random() * height;
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
    velocities.push({
      speed: 10 + Math.random() * 8,
      windX: 0.5 + Math.random() * 0.5,
      windZ: 0.2 + Math.random() * 0.3,
    });
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // Use Lines instead of Points for streak effect
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x8ab4c8) },
      uOpacity: { value: 0.35 },
    },
    vertexShader: `
      varying float vAlpha;
      void main() {
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        float dist = length(mvPos.xyz);
        vAlpha = smoothstep(35.0, 3.0, dist);
        gl_Position = projectionMatrix * mvPos;
        gl_PointSize = 1.2;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        // Elongated point for streak
        float d = length(gl_PointCoord - vec2(0.5, 0.2)) * 2.5;
        if (d > 1.0) discard;
        float a = (1.0 - d * d) * uOpacity * vAlpha;
        gl_FragColor = vec4(uColor, a);
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
  const trackZ = -12;

  // Elevated track structure
  const trackGeom = new THREE.BoxGeometry(50, 0.25, 2.5);
  const trackMat = createLinocutMaterial({
    color: new THREE.Color(0x1a1a20),
    carveColor: new THREE.Color(0x0a0a10),
    carveDepth: 0.8,
    carveScale: 3.0,
    gougeAmount: 0.3,
  });
  const track = new THREE.Mesh(trackGeom, trackMat);
  track.position.set(0, 9, trackZ);
  group.add(track);

  // Track rails
  for (const zOff of [-0.8, 0.8]) {
    const railGeom = new THREE.BoxGeometry(50, 0.12, 0.08);
    const railMat = createLinocutMaterial({
      color: new THREE.Color(0x2a2a30),
      carveColor: new THREE.Color(0x0a0a10),
    });
    const rail = new THREE.Mesh(railGeom, railMat);
    rail.position.set(0, 9.18, trackZ + zOff);
    group.add(rail);
  }

  // Support pillars
  for (let i = -6; i <= 6; i++) {
    const pillarGeom = new THREE.BoxGeometry(0.25, 9, 0.25);
    const pillar = new THREE.Mesh(pillarGeom, trackMat);
    pillar.position.set(i * 4, 4.5, trackZ);
    group.add(pillar);

    // Cross brace
    if (i < 6) {
      const braceGeom = new THREE.BoxGeometry(4, 0.15, 0.15);
      const brace = new THREE.Mesh(braceGeom, trackMat);
      brace.position.set(i * 4 + 2, 6, trackZ);
      group.add(brace);
    }
  }

  // Teal/cyan train on track
  const trainBodyGeom = new THREE.BoxGeometry(14, 1.4, 2.0);
  const trainMat = createLinocutMaterial({
    color: new THREE.Color(0x2a9a8a),
    carveColor: new THREE.Color(0x0a2a25),
    carveDepth: 0.75,
    carveScale: 3.0,
    gougeAmount: 0.35,
    overprintColor: new THREE.Color(0xc44030),
    overprintAmount: 0.06,
  });
  const train = new THREE.Mesh(trainBodyGeom, trainMat);
  train.position.y = 10;
  train.position.z = trackZ;
  train.userData.isOverheadTrain = true;
  group.add(train);

  // Train roof
  const roofGeom = new THREE.BoxGeometry(14.2, 0.1, 2.1);
  const roofMat = createLinocutMaterial({
    color: new THREE.Color(0x1a4a42),
    carveColor: new THREE.Color(0x0a2020),
    carveDepth: 0.9,
  });
  const roof = new THREE.Mesh(roofGeom, roofMat);
  roof.position.y = 10.75;
  roof.position.z = trackZ;
  roof.userData.isOverheadTrain = true;
  group.add(roof);

  // Windows — bright
  for (let w = 0; w < 10; w++) {
    const winGeom = new THREE.PlaneGeometry(0.7, 0.5);
    const winMat = new THREE.MeshBasicMaterial({
      color: 0xdde8f0,
    });
    const win = new THREE.Mesh(winGeom, winMat);
    win.position.set(-6 + w * 1.3, 10.2, trackZ - 1.01);
    win.userData.isOverheadTrain = true;
    group.add(win);

    const win2 = win.clone();
    win2.position.z = trackZ + 1.01;
    win2.rotation.y = Math.PI;
    group.add(win2);
  }

  // Train stripe
  const stripeGeom = new THREE.BoxGeometry(14.1, 0.08, 2.05);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf0ece8 });
  const stripe = new THREE.Mesh(stripeGeom, stripeMat);
  stripe.position.y = 9.8;
  stripe.position.z = trackZ;
  stripe.userData.isOverheadTrain = true;
  group.add(stripe);

  return group;
}

function createBuildings(params) {
  const group = new THREE.Group();
  const count = 10;

  for (let i = 0; i < count; i++) {
    const h = 6 + Math.random() * 18;
    const w = 2.5 + Math.random() * 5;
    const d = 2 + Math.random() * 4;
    const geom = new THREE.BoxGeometry(w, h, d);
    const mat = createLinocutMaterial({
      color: new THREE.Color(0x101018),
      carveColor: new THREE.Color(0x060608),
      carveDepth: 0.55,
      carveScale: 1.8 + Math.random() * 1.5,
      gougeAmount: 0.2,
    });
    const building = new THREE.Mesh(geom, mat);
    const side = i < count / 2 ? -1 : 1;
    building.position.set(
      side * (16 + Math.random() * 12),
      h / 2,
      -10 + (i % 5) * 6
    );
    group.add(building);

    // Windows — warm lit
    const rows = Math.floor(h / 1.8);
    const cols = Math.floor(w / 1.0);
    for (let wy = 0; wy < rows; wy++) {
      for (let wx = 0; wx < cols; wx++) {
        if (Math.random() > 0.35) {
          const winGeom = new THREE.PlaneGeometry(0.5, 0.6);
          const winColors = [0xf0d080, 0xe8e4e0, 0xc44030, 0x2a9a8a, 0xf0d080];
          const winColor = winColors[Math.floor(Math.random() * winColors.length)];
          const winMat = new THREE.MeshBasicMaterial({
            color: winColor,
            transparent: true,
            opacity: 0.6 + Math.random() * 0.4,
          });
          const win = new THREE.Mesh(winGeom, winMat);
          win.position.set(
            building.position.x + (-w / 2 + 0.5 + wx * 1.0) * side,
            1.2 + wy * 1.8,
            building.position.z + d / 2 * (side > 0 ? 1 : -1) * 0.5
          );
          win.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
          group.add(win);
        }
      }
    }
  }

  return group;
}

function createStreetDetails(params) {
  const group = new THREE.Group();

  // Street lamp posts
  const lampMat = createLinocutMaterial({
    color: new THREE.Color(0x1a1a20),
    carveColor: new THREE.Color(0x0a0a10),
  });

  for (const pos of [[-4, 0, -3], [4, 0, 3], [-3, 0, 4], [5, 0, -4]]) {
    const poleGeom = new THREE.CylinderGeometry(0.04, 0.05, 4, 5);
    const pole = new THREE.Mesh(poleGeom, lampMat);
    pole.position.set(...pos);
    pole.position.y = 2;
    group.add(pole);

    // Lamp head
    const lampGeom = new THREE.SphereGeometry(0.15, 6, 6);
    const lampM = new THREE.MeshBasicMaterial({ color: 0xf0d080 });
    const lamp = new THREE.Mesh(lampGeom, lampM);
    lamp.position.set(pos[0], 4.1, pos[2]);
    group.add(lamp);

    // Light glow
    const glowGeom = new THREE.SphereGeometry(0.4, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xf0d080,
      transparent: true,
      opacity: 0.15,
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    glow.position.copy(lamp.position);
    group.add(glow);
  }

  // Pedestrian signal boxes
  const sigMat = createLinocutMaterial({
    color: new THREE.Color(0x151518),
    carveColor: new THREE.Color(0x050508),
  });

  for (const pos of [[-6, 0, 0], [6, 0, 0]]) {
    const boxGeom = new THREE.BoxGeometry(0.2, 0.5, 0.15);
    const box = new THREE.Mesh(boxGeom, sigMat);
    box.position.set(pos[0], 2.5, pos[2]);
    group.add(box);

    // Walking figure (white)
    const figGeom = new THREE.PlaneGeometry(0.12, 0.2);
    const figMat = new THREE.MeshBasicMaterial({ color: 0xf0ece8 });
    const fig = new THREE.Mesh(figGeom, figMat);
    fig.position.set(pos[0] + (pos[0] > 0 ? -0.11 : 0.11), 2.5, pos[2]);
    fig.rotation.y = pos[0] > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(fig);
  }

  return group;
}

// Signal cycle: waiting (0-25%) → crossing (25-60%) → draining (60-100%)
function updateCrossing(group, time, dt) {
  const ud = group.userData;
  ud.cycleTime += dt;
  const cycleTime = 10;
  const phase = (ud.cycleTime % cycleTime) / cycleTime;

  // Update road shader time
  group.traverse(child => {
    if (child.userData.mat?.uniforms?.uTime) {
      child.userData.mat.uniforms.uTime.value = time;
    }
  });

  // Rain animation
  group.traverse(child => {
    if (child.userData.velocities) {
      const pos = child.geometry.attributes.position;
      const vels = child.userData.velocities;
      const spread = child.userData.spread;
      const height = child.userData.height;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i);
        y -= vels[i].speed * dt;
        let x = pos.getX(i) + vels[i].windX * dt * 2;
        let z = pos.getZ(i) + vels[i].windZ * dt;
        if (y < 0) {
          y = height;
          x = (Math.random() - 0.5) * spread;
          z = (Math.random() - 0.5) * spread;
        }
        pos.setX(i, x);
        pos.setY(i, y);
        pos.setZ(i, z);
      }
      pos.needsUpdate = true;
    }
  });

  // Signal lights
  const signalOn = phase < 0.25 || phase > 0.6; // Red on during wait and drain
  group.traverse(child => {
    if (child.userData.isLight) {
      if (child.userData.color === 'red') {
        child.material.color.setHex(signalOn ? 0xcc2020 : 0x220808);
      } else if (child.userData.color === 'teal') {
        child.material.color.setHex(!signalOn ? 0x20ccaa : 0x082020);
      }
    }
  });

  // Umbrella crowd animation
  group.traverse(child => {
    if (child.userData?.waitPos && child.userData?.crossTarget) {
      const ud2 = child.userData;
      if (phase < 0.25) {
        // Waiting — slight bobbing
        child.position.y = Math.sin(time * 3 + ud2.phase) * 0.02;
        child.position.x += Math.sin(time + ud2.phase) * 0.001;
      } else if (phase < 0.6) {
        // Surging diagonally across
        const t = (phase - 0.25) / 0.35;
        const eased = t * t * (3 - 2 * t); // smoothstep
        child.position.x = ud2.waitPos.x + (ud2.crossTarget.x - ud2.waitPos.x) * eased;
        child.position.z = ud2.waitPos.z + (ud2.crossTarget.z - ud2.waitPos.z) * eased;
        // Bob while walking
        child.position.y = Math.abs(Math.sin(time * 6 + ud2.phase)) * 0.05;
      } else {
        // Draining away
        const t = (phase - 0.6) / 0.4;
        child.position.x = ud2.crossTarget.x + (ud2.drainTarget.x - ud2.crossTarget.x) * t;
        child.position.z = ud2.crossTarget.z + (ud2.drainTarget.z - ud2.crossTarget.z) * t;
        child.position.y = Math.max(0, 0.05 * (1 - t));
      }
    }
  });

  // Overhead train movement
  group.traverse(child => {
    if (child.userData.isOverheadTrain) {
      child.position.x = Math.sin(time * 0.25) * 18;
    }
  });
}

export default createCrossingModule;
