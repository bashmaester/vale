// Procedural Sky Module — dramatic night sky with carved clouds
import * as THREE from 'three';

export function createSkyModule(params = {}) {
  const group = new THREE.Group();
  const radius = params.radius || 150;

  const skyGeom = new THREE.SphereGeometry(radius, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uTopColor: { value: new THREE.Color(0x06060e) },
      uHorizonColor: { value: new THREE.Color(0x12121e) },
      uStarDensity: { value: params.starDensity ?? 5000 },
      uSeed: { value: params.seed ?? 1.0 },
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
      uniform float uSeed;
      varying vec3 vWorldPos;
      varying vec2 vUv;

      float hash(vec3 p) {
        p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
                 dot(p, vec3(269.5, 183.3, 246.1)),
                 dot(p, vec3(113.5, 271.9, 124.6)));
        return fract(sin(p.x) * 43758.5453123 + sin(p.y) * 12345.6789 + sin(p.z) * 98765.4321);
      }

      float hash2(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
        vec3 dir = normalize(vWorldPos);
        float y = dir.y;

        // Deep gradient
        vec3 skyColor = mix(uHorizonColor, uTopColor, pow(max(y, 0.0), 0.4));

        // Stars — multiple layers
        for (float layer = 1.0; layer <= 3.0; layer += 1.0) {
          vec3 starDir = dir * uStarDensity * layer * 0.3;
          vec3 starPos = floor(starDir);
          float h = hash(starPos);

          // Only some cells have stars
          if (h > 0.97 - layer * 0.005) {
            vec3 local = fract(starDir) - 0.5;
            float dist = length(local);
            float brightness = smoothstep(0.15 * layer, 0.0, dist);

            // Twinkle
            float twinkle = sin(uTime * (1.0 + h * 3.0) + h * 100.0) * 0.3 + 0.7;
            float starColor_mix = h * 0.3;
            vec3 starCol = vec3(1.0, 0.95, 0.9) + vec3(starColor_mix, 0.0, starColor_mix * 0.5);

            skyColor += starCol * brightness * twinkle * (1.0 - y * 0.5) * (1.0 / layer);
          }
        }

        // Carved cloud wisps — horizontal streaks
        float cloud = 0.0;
        vec2 cp = vWorldPos.xz * 0.008;
        for (float i = 0.0; i < 5.0; i++) {
          vec2 grid = floor(cp * 2.0);
          vec2 local = fract(cp * 2.0) - 0.5;
          float h = hash2(grid + i * 17.3 + uSeed);

          if (h > 0.4) {
            float angle = h * 3.14 * 0.3; // Mostly horizontal
            vec2 dir2 = vec2(cos(angle), sin(angle) * 0.3);
            float perp = dot(local, vec2(-dir2.y, dir2.x));
            float line = smoothstep(0.12 + h * 0.08, 0.0, abs(perp));
            float len = smoothstep(0.5, 0.0, abs(dot(local, dir2)));
            cloud += line * len * h * 0.4;
          }
          cp = cp * 1.6 + vec2(hash2(grid) * 50.0);
        }
        // Only visible in upper sky
        skyColor += vec3(0.15, 0.13, 0.18) * cloud * smoothstep(0.1, 0.4, y);

        // Horizon glow (subtle)
        float horizonGlow = exp(-y * 5.0) * 0.08;
        skyColor += vec3(0.15, 0.1, 0.08) * horizonGlow;

        gl_FragColor = vec4(skyColor, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
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
