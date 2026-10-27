// Procedural Sky Module
// Creates stylized night sky with stars and carved cloud wisps
import * as THREE from 'three';
import { createLinocutMaterial } from '../shaders/linocut.js';

export function createSkyModule(params = {}) {
  const group = new THREE.Group();
  const radius = params.radius || 100;

  // Sky dome
  const skyGeom = new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uTopColor: { value: new THREE.Color(0x0a0a12) },
      uHorizonColor: { value: new THREE.Color(0x1a1a28) },
      uStarDensity: { value: params.starDensity ?? 3000 },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uHorizonColor;
      uniform float uStarDensity;
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec2 vUv;

      float hash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
      }

      void main() {
        // Sky gradient
        float y = normalize(vWorldPos).y;
        vec3 skyColor = mix(uHorizonColor, uTopColor, pow(y, 0.5));

        // Stars
        vec3 dir = normalize(vWorldPos);
        vec3 starPos = floor(dir * uStarDensity);
        float starHash = hash(starPos);
        float star = step(0.998, starHash) * step(0.3, y);
        float twinkle = sin(uTime * 2.0 + starHash * 100.0) * 0.3 + 0.7;
        skyColor += vec3(star * twinkle * 0.8);

        // Carved cloud wisps
        float cloud = 0.0;
        vec2 cp = vWorldPos.xz * 0.01;
        for (float i = 0.0; i < 3.0; i++) {
          float h = hash(floor(cp * 2.0 + i * 10.0));
          vec2 local = fract(cp * 2.0 + i * 10.0) - 0.5;
          float angle = h * 3.14;
          vec2 dir2 = vec2(cos(angle), sin(angle));
          float line = abs(dot(local, vec2(-dir2.y, dir2.x)));
          cloud += smoothstep(0.1, 0.0, line) * step(0.5, h) * 0.3;
          cp = cp * 1.5;
        }
        skyColor += vec3(cloud * 0.1);

        gl_FragColor = vec4(skyColor, 1.0);
      }
    `,
    side: THREE.BackSide,
  });

  const sky = new THREE.Mesh(skyGeom, skyMat);
  sky.userData = {
    type: 'sky',
    update: (time) => { skyMat.uniforms.uTime.value = time; }
  };

  group.add(sky);
  group.userData = { type: 'sky', params };

  return group;
}

export default createSkyModule;
