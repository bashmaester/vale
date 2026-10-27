// Procedural Tokyo Crossing Module — rainy night intersection v2
import * as THREE from 'three';
import { createLinocutMaterial } from '../shaders/linocut.js';

export function createCrossingModule(params = {}) {
  const group = new THREE.Group();

  // Wet road with reflections
  const road = createWetRoad(params);
  group.add(road);

  // Crosswalk
  const crosswalk = createCrosswalk(params);
  group.add(crosswalk);

  // Traffic signals
  const signals = createSignals(params);
  group.add(signals);

  // Crowd of umbrella figures (more detailed)
  const crowd = createUmbrellaCrowd(params);
  group.add(crowd);

  // Rain streaks
  const rain = createRainStreaks(params);
  group.add(rain);

  // Rain splash particles on ground
  const splashes = createRainSplashes(params);
  group.add(splashes);

  // Overhead train and track
  const overhead = createOverheadTrain(params);
  group.add(overhead);

  // Buildings backdrop
  const buildings = createBuildings(params);
  group.add(buildings);

  // Street details
  const street = createStreetDetails(params);
  group.add(street);

  // Atmospheric fog plane
  const fog = createAtmosphericFog(params);
  group.add(fog);

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

  const geom = new THREE.PlaneGeometry(width, depth, 80, 80);
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

      float hash3(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
      }

      void main() {
        vec2 uv = vUv - 0.5;

        vec3 color = uRoadColor;

        // Wet ripple distortion
        float ripple = sin(uv.x * 50.0 + uTime * 2.0) * sin(uv.y * 40.0 + uTime * 1.5) * 0.008;
        vec2 rUv = uv + vec2(ripple, ripple * 0.7);

        // Red signal reflection pool (stretched vertically for wet mirror)
        float redDist = length(uv);
        float redY = abs(uv.y);
        float redReflect = smoothstep(0.4, 0.0, redDist) * 0.3;
        redReflect *= (1.0 - smoothstep(0.0, 0.15, redY));
        color += vec3(0.8, 0.15, 0.1) * redReflect;

        // Teal train reflection
        float tealDist = length(uv - vec2(0.2, -0.15));
        float tealReflect = smoothstep(0.35, 0.0, tealDist) * 0.2;
        tealReflect *= smoothstep(0.0, 0.1, abs(uv.y + 0.15));
        color += vec3(0.1, 0.55, 0.6) * tealReflect;

        // Crosswalk stripe reflections
        float stripeX = fract(uv.x * 8.0);
        float stripeY = abs(uv.y);
        float stripeReflect = smoothstep(0.15, 0.0, abs(stripeX - 0.5)) * smoothstep(0.4, 0.0, stripeY) * 0.25;
        color += vec3(0.85, 0.82, 0.78) * stripeReflect;

        // Building window reflections (scattered warm dots)
        for (float i = 0.0; i < 8.0; i++) {
          vec2 winPos = vec2(
            hash(vec2(i, 0.0)) * 0.8 - 0.4,
            hash(vec2(0.0, i)) * 0.8 - 0.4
          );
          float winDist = length(uv - winPos);
          if (hash(vec2(i, i)) > 0.5) {
            float winRef = smoothstep(0.04, 0.0, winDist) * 0.08;
            vec3 winCol = mix(vec3(1.0, 0.85, 0.5), vec3(0.2, 0.6, 0.6), hash(vec2(i, 7.0)));
            color += winCol * winRef;
          }
        }

        // Carved wet lines — horizontal gouges
        float line = abs(sin(uv.y * 120.0 + uv.x * 5.0));
        float wetLine = smoothstep(0.97, 1.0, line) * 0.15;
        color += vec3(0.2, 0.25, 0.3) * wetLine;

        // Puddles
        float puddle = hash(floor(uv * 8.0));
        if (puddle > 0.90) {
          float pSize = (puddle - 0.90) * 10.0;
          vec2 pCenter = fract(uv * 8.0) - 0.5;
          float pDist = length(pCenter);
          float puddleHighlight = smoothstep(0.1 * pSize, 0.0, pDist) * 0.15;
          color += vec3(0.3, 0.35, 0.4) * puddleHighlight;
          // Puddle ripple
          float pRipple = sin(pDist * 30.0 - uTime * 3.0) * 0.02 * smoothstep(0.08 * pSize, 0.0, pDist);
          color += vec3(pRipple, pRipple, pRipple + 0.01);
        }

        // Grain
        float grain = hash(floor(uv * 600.0)) * 0.025;
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

    // Hoods
    const hoodGeom = new THREE.BoxGeometry(0.38, 0.08, 0.3);
    const hoodMat = createLinocutMaterial({ color: new THREE.Color(0x151518) });
    const hood1 = new THREE.Mesh(hoodGeom, hoodMat);
    hood1.position.set(0, 3.45, 0.05);
    pole.add(hood1);
    const hood2 = hood1.clone();
    hood2.position.y = 3.1;
    pole.add(hood2);

    // Signal pole base
    const baseGeom = new THREE.CylinderGeometry(0.12, 0.15, 0.3, 6);
    const base = new THREE.Mesh(baseGeom, poleMat);
    base.position.y = 0.15;
    pole.add(base);

    pole.position.set(...pos);
    group.add(pole);
  });

  return group;
}

function createUmbrellaCrowd(params) {
  const group = new THREE.Group();
  const count = params.crowdCount || 55;

  for (let i = 0; i < count; i++) {
    const umbrella = createUmbrellaFigure();
    const x = (Math.random() - 0.5) * 14;
    const z = (Math.random() - 0.5) * 14;
    umbrella.position.set(x, 0, z);
    umbrella.userData.speed = 0.3 + Math.random() * 1.2;
    umbrella.userData.dir = Math.random() * Math.PI * 2;
    umbrella.userData.phase = Math.random() * Math.PI * 2;
    umbrella.userData.height = 0.8 + Math.random() * 0.4;
    umbrella.userData.scale = 0.85 + Math.random() * 0.3;
    umbrella.waitPos = new THREE.Vector3(x, 0, z);
    umbrella.crossTarget = new THREE.Vector3(
      x + Math.cos(umbrella.userData.dir) * 10,
      0,
      z + Math.sin(umbrella.userData.dir) * 10
    );
    umbrella.drainTarget = new THREE.Vector3(
      (Math.random() - 0.5) * 22,
      0,
      (Math.random() - 0.5) * 22
    );
    group.add(umbrella);
  }

  return group;
}

function createUmbrellaFigure() {
  const figure = new THREE.Group();

  // Umbrella canopy — more detailed shape
  const canopyGeom = new THREE.SphereGeometry(0.38, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const colors = [0xc44030, 0x1a6a5a, 0xf0ece8, 0x0a0a12, 0x2a8a7a, 0xc44030, 0x1a6a5a, 0xf0ece8];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const canopyMat = createLinocutMaterial({
    color: new THREE.Color(color),
    carveColor: new THREE.Color(color).multiplyScalar(0.25),
    carveDepth: 0.65,
    carveScale: 3.5,
    gougeAmount: 0.3,
    roughness: 0.35,
  });
  const canopy = new THREE.Mesh(canopyGeom, canopyMat);
  canopy.position.y = 1.35;
  figure.add(canopy);

  // Canopy ribs
  for (let r = 0; r < 8; r++) {
    const angle = (r / 8) * Math.PI * 2;
    const ribGeom = new THREE.CylinderGeometry(0.006, 0.006, 0.38, 3);
    ribGeom.rotateZ(Math.PI / 2);
    const ribMat = createLinocutMaterial({ color: new THREE.Color(0x0a0a10), carveDepth: 0.9 });
    const rib = new THREE.Mesh(ribGeom, ribMat);
    rib.position.y = 1.35;
    rib.rotation.y = angle;
    rib.position.x = Math.cos(angle) * 0.17;
    rib.position.z = Math.sin(angle) * 0.17;
    figure.add(rib);
  }

  // Umbrella tip
  const tipGeom = new THREE.SphereGeometry(0.025, 4, 4);
  const tip = new THREE.Mesh(tipGeom, canopyMat);
  tip.position.y = 1.72;
  figure.add(tip);

  // Stick
  const stickGeom = new THREE.CylinderGeometry(0.012, 0.012, 0.8, 4);
  const stickMat = createLinocutMaterial({ color: new THREE.Color(0x0a0a10) });
  const stick = new THREE.Mesh(stickGeom, stickMat);
  stick.position.y = 0.95;
  figure.add(stick);

  // Hook handle
  const hookGeom = new THREE.TorusGeometry(0.04, 0.01, 4, 6, Math.PI);
  const hook = new THREE.Mesh(hookGeom, stickMat);
  hook.position.y = 0.55;
  hook.rotation.x = Math.PI;
  figure.add(hook);

  // Body — coat/jacket
  const bodyGeom = new THREE.CylinderGeometry(0.09, 0.14, 0.7, 6);
  const bodyMat = createLinocutMaterial({
    color: new THREE.Color(0x0a0a12),
    carveColor: new THREE.Color(0x050508),
    carveDepth: 0.9,
    roughness: 0.4,
  });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.position.y = 0.38;
  figure.add(body);

  // Head
  const headGeom = new THREE.SphereGeometry(0.07, 6, 6);
  const head = new THREE.Mesh(headGeom, bodyMat);
  head.position.y = 0.8;
  figure.add(head);

  // Legs
  for (let l = -1; l <= 1; l += 2) {
    const legGeom = new THREE.CylinderGeometry(0.03, 0.035, 0.38, 4);
    const leg = new THREE.Mesh(legGeom, bodyMat);
    leg.position.set(l * 0.05, 0.19, 0);
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
        float d = length(gl_PointCoord - vec2(0.5, 0.15)) * 3.0;
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

// Rain splash particles on ground
function createRainSplashes(params) {
  const count = 200;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const alphas = new Float32Array(count);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geom.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xaaccdd) },
    },
    vertexShader: `
      attribute float size;
      attribute float alpha;
      varying float vAlpha;
      void main() {
        vAlpha = alpha;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (100.0 / -mvPos.z);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float a = (1.0 - d * d) * vAlpha * 0.5;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

  const points = new THREE.Points(geom, mat);
  points.userData.splashes = { positions, sizes, alphas, velocities: [] };

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 20;
    positions[i * 3 + 1] = 0.02;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
    sizes[i] = 0;
    alphas[i] = 0;
    points.userData.splashes.velocities.push({
      life: Math.random(),
      x: positions[i * 3],
      z: positions[i * 3 + 2],
    });
  }

  return points;
}

function createOverheadTrain(params) {
  const group = new THREE.Group();
  const trackZ = -12;

  // Track
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

  // Rails
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

    if (i < 6) {
      const braceGeom = new THREE.BoxGeometry(4, 0.15, 0.15);
      const brace = new THREE.Mesh(braceGeom, trackMat);
      brace.position.set(i * 4 + 2, 6, trackZ);
      group.add(brace);
    }
  }

  // Teal train body
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

  // Roof
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

  // Windows
  for (let w = 0; w < 10; w++) {
    for (const zOff of [-1.01, 1.01]) {
      const winGeom = new THREE.PlaneGeometry(0.7, 0.5);
      const winMat = new THREE.MeshBasicMaterial({ color: 0xdde8f0 });
      const win = new THREE.Mesh(winGeom, winMat);
      win.position.set(-6 + w * 1.3, 10.2, trackZ + zOff);
      win.userData.isOverheadTrain = true;
      if (zOff > 0) win.rotation.y = Math.PI;
      group.add(win);
    }
  }

  // White stripe
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

    // Windows
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

  // Lamp posts
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

    // Lamp arm
    const armGeom = new THREE.BoxGeometry(0.6, 0.04, 0.04);
    const arm = new THREE.Mesh(armGeom, lampMat);
    arm.position.set(pos[0] + 0.3, 3.9, pos[2]);
    group.add(arm);

    // Lamp head
    const lampGeom = new THREE.SphereGeometry(0.15, 8, 8);
    const lampM = new THREE.MeshBasicMaterial({ color: 0xf0d080 });
    const lamp = new THREE.Mesh(lampGeom, lampM);
    lamp.position.set(pos[0] + 0.6, 3.85, pos[2]);
    group.add(lamp);

    // Glow
    const glowGeom = new THREE.SphereGeometry(0.5, 10, 10);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xf0d080,
      transparent: true,
      opacity: 0.12,
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    glow.position.copy(lamp.position);
    group.add(glow);

    // Light pool on ground
    const poolGeom = new THREE.CircleGeometry(1.2, 12);
    const poolMat = new THREE.MeshBasicMaterial({
      color: 0xf0d080,
      transparent: true,
      opacity: 0.06,
    });
    const pool = new THREE.Mesh(poolGeom, poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(pos[0] + 0.6, 0.02, pos[2]);
    group.add(pool);
  }

  // Pedestrian signals
  const sigMat = createLinocutMaterial({
    color: new THREE.Color(0x151518),
    carveColor: new THREE.Color(0x050508),
  });

  for (const pos of [[-6, 0, 0], [6, 0, 0]]) {
    const boxGeom = new THREE.BoxGeometry(0.2, 0.5, 0.15);
    const box = new THREE.Mesh(boxGeom, sigMat);
    box.position.set(pos[0], 2.5, pos[2]);
    group.add(box);

    const figGeom = new THREE.PlaneGeometry(0.12, 0.2);
    const figMat = new THREE.MeshBasicMaterial({ color: 0xf0ece8 });
    const fig = new THREE.Mesh(figGeom, figMat);
    fig.position.set(pos[0] + (pos[0] > 0 ? -0.11 : 0.11), 2.5, pos[2]);
    fig.rotation.y = pos[0] > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(fig);
  }

  return group;
}

// Atmospheric fog — semi-transparent depth haze
function createAtmosphericFog(params) {
  const group = new THREE.Group();

  // Ground fog layer
  const fogGeom = new THREE.PlaneGeometry(60, 60);
  const fogMat = new THREE.MeshBasicMaterial({
    color: 0x0a0a14,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const fog = new THREE.Mesh(fogGeom, fogMat);
  fog.rotation.x = -Math.PI / 2;
  fog.position.y = 3;
  group.add(fog);

  // Mid-level haze
  const hazeGeom = new THREE.PlaneGeometry(70, 70);
  const hazeMat = new THREE.MeshBasicMaterial({
    color: 0x080810,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
  });
  const haze = new THREE.Mesh(hazeGeom, hazeMat);
  haze.rotation.x = -Math.PI / 2;
  haze.position.y = 6;
  group.add(haze);

  group.userData = { fog, haze };
  return group;
}

// Signal cycle
function updateCrossing(group, time, dt) {
  const ud = group.userData;
  ud.cycleTime += dt;
  const cycleTime = 10;
  const phase = (ud.cycleTime % cycleTime) / cycleTime;

  // Update road shader
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

  // Rain splashes
  group.traverse(child => {
    if (child.userData.splashes) {
      const s = child.userData.splashes;
      for (let i = 0; i < s.positions.length / 3; i++) {
        s.velocities[i].life += dt * (3 + Math.random() * 2);
        if (s.velocities[i].life > 1) {
          s.velocities[i].life = 0;
          s.velocities[i].x = (Math.random() - 0.5) * 20;
          s.velocities[i].z = (Math.random() - 0.5) * 20;
        }
        const life = s.velocities[i].life;
        s.positions[i * 3] = s.velocities[i].x;
        s.positions[i * 3 + 1] = 0.02 + Math.sin(life * Math.PI) * 0.08;
        s.positions[i * 3 + 2] = s.velocities[i].z;
        s.sizes[i] = life < 0.2 ? life * 5 * 0.3 : (1 - life) * 0.2;
        s.alphas[i] = life < 0.2 ? life * 5 * 0.5 : (1 - life) * 0.3;
      }
      child.geometry.attributes.position.needsUpdate = true;
      child.geometry.attributes.size.needsUpdate = true;
      child.geometry.attributes.alpha.needsUpdate = true;
    }
  });

  // Signal lights
  const signalOn = phase < 0.25 || phase > 0.6;
  group.traverse(child => {
    if (child.userData.isLight) {
      if (child.userData.color === 'red') {
        child.material.color.setHex(signalOn ? 0xcc2020 : 0x220808);
      } else if (child.userData.color === 'teal') {
        child.material.color.setHex(!signalOn ? 0x20ccaa : 0x082020);
      }
    }
  });

  // Crowd animation
  group.traverse(child => {
    if (child.userData?.waitPos && child.userData?.crossTarget) {
      const ud2 = child.userData;
      if (phase < 0.25) {
        child.position.y = Math.sin(time * 3 + ud2.phase) * 0.02;
        child.position.x += Math.sin(time + ud2.phase) * 0.001;
      } else if (phase < 0.6) {
        const t = (phase - 0.25) / 0.35;
        const eased = t * t * (3 - 2 * t);
        child.position.x = ud2.waitPos.x + (ud2.crossTarget.x - ud2.waitPos.x) * eased;
        child.position.z = ud2.waitPos.z + (ud2.crossTarget.z - ud2.waitPos.z) * eased;
        child.position.y = Math.abs(Math.sin(time * 6 + ud2.phase)) * 0.05;
      } else {
        const t = (phase - 0.6) / 0.4;
        child.position.x = ud2.crossTarget.x + (ud2.drainTarget.x - ud2.crossTarget.x) * t;
        child.position.z = ud2.crossTarget.z + (ud2.drainTarget.z - ud2.crossTarget.z) * t;
        child.position.y = Math.max(0, 0.05 * (1 - t));
      }
    }
  });

  // Overhead train
  group.traverse(child => {
    if (child.userData.isOverheadTrain) {
      child.position.x = Math.sin(time * 0.25) * 18;
    }
  });

  // Fog pulse
  group.traverse(child => {
    if (child.userData.fog) {
      child.userData.fog.material.opacity = 0.2 + Math.sin(time * 0.3) * 0.05;
    }
  });
}

export default createCrossingModule;
