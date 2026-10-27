// Linocut / Woodcut shader material
// Creates the carved, gouged print aesthetic with paper grain and overprint

export const linocutVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;
  varying float vFresnel;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vPosition = mvPos.xyz;
    vec3 viewDir = normalize(-mvPos.xyz);
    vFresnel = 1.0 - abs(dot(viewDir, vNormal));
    gl_Position = projectionMatrix * mvPos;
  }
`;

export const linocutFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uCarveColor;
  uniform float uCarveDepth;
  uniform float uCarveScale;
  uniform float uGrainIntensity;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uGougeAmount;
  uniform float uEdgeDarken;
  uniform vec3 uOverprintColor;
  uniform float uOverprintAmount;

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;
  varying float vFresnel;

  // Pseudo-random hash
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }

  // Noise for grain
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // Carve/gouge pattern
  float carve(vec2 uv, float scale) {
    float n = 0.0;
    vec2 p = uv * scale;
    for (float i = 0.0; i < 4.0; i++) {
      vec2 grid = floor(p);
      vec2 local = fract(p) - 0.5;
      float h = hash(grid + i * 17.0);
      float angle = h * 6.283;
      vec2 dir = vec2(cos(angle), sin(angle));
      float line = abs(dot(local, vec2(-dir.y, dir.x)));
      float carveLine = smoothstep(0.02 + h * 0.03, 0.0, line);
      n += carveLine * (0.5 + 0.5 * h);
      p = p * 1.7 + vec2(hash(grid + i) * 100.0);
    }
    return n / 4.0;
  }

  // Fine grain texture like print paper
  float paperGrain(vec2 uv) {
    float grain = 0.0;
    float scale = 3.0;
    for (float i = 0.0; i < 3.0; i++) {
      vec2 p = uv * scale * (100.0 + i * 50.0);
      grain += noise(p) * 0.3;
      scale *= 0.5;
    }
    return grain;
  }

  // Gouge marks - deeper cuts
  float gouge(vec2 uv, float amount) {
    float g = 0.0;
    vec2 p = uv * 8.0;
    for (float i = 0.0; i < 6.0; i++) {
      vec2 grid = floor(p);
      vec2 local = fract(p) - 0.5;
      float h = hash(grid + i * 31.0);
      float angle = hash(grid + i * 7.0) * 3.14;
      vec2 dir = vec2(cos(angle), sin(angle));
      float line = dot(local, vec2(-dir.y, dir.x));
      float mark = smoothstep(0.05 * h, 0.0, abs(line)) * step(0.3, h);
      g += mark * 0.5;
      p = p * 2.1 + vec2(hash(grid) * 200.0, hash(grid + 1.0) * 200.0);
    }
    return g * amount;
  }

  void main() {
    // Lighting - simple directional
    vec3 lightDir = normalize(vec3(0.5, 0.8, 0.6));
    float diffuse = max(dot(vNormal, lightDir), 0.0);
    float ambient = 0.3;

    // Carve pattern
    float c = carve(vUv, uCarveScale);
    float carveMask = smoothstep(0.0, 0.5, c) * uCarveDepth;

    // Gouge
    float g = gouge(vUv, uGougeAmount);

    // Paper grain
    float grain = paperGrain(vUv + vPosition.xy * 0.1);

    // Edge darkening (fresnel)
    float edge = pow(vFresnel, 2.0) * uEdgeDarken;

    // Combine colors
    vec3 base = mix(uColor, uCarveColor, carveMask);
    base = mix(base, vec3(0.0), g * 0.5); // Gouge darkens

    // Overprint effect (slight color offset)
    if (uOverprintAmount > 0.0) {
      vec3 shifted = mix(uOverprintColor, uCarveColor, carveMask);
      base = mix(base, shifted, uOverprintAmount * (0.5 + 0.5 * grain));
    }

    // Apply lighting
    vec3 color = base * (ambient + diffuse * 0.7);

    // Add grain
    color += vec3(grain - 0.5) * uGrainIntensity;

    // Edge darken
    color *= (1.0 - edge);

    // Slight imperfection - color variation
    float variation = hash(vPosition.xy * 10.0) * 0.04 - 0.02;
    color += variation;

    gl_FragColor = vec4(color, uOpacity);
  }
`;

export function createLinocutMaterial(options = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: options.color || new THREE.Color(0xf0ece8) },
      uCarveColor: { value: options.carveColor || new THREE.Color(0x0a0a0f) },
      uCarveDepth: { value: options.carveDepth ?? 0.6 },
      uCarveScale: { value: options.carveScale ?? 3.0 },
      uGrainIntensity: { value: options.grainIntensity ?? 0.08 },
      uTime: { value: 0 },
      uOpacity: { value: options.opacity ?? 1.0 },
      uGougeAmount: { value: options.gougeAmount ?? 0.3 },
      uEdgeDarken: { value: options.edgeDarken ?? 0.4 },
      uOverprintColor: { value: options.overprintColor || new THREE.Color(0xc44030) },
      uOverprintAmount: { value: options.overprintAmount ?? 0.0 },
    },
    vertexShader: linocutVertexShader,
    fragmentShader: linocutFragmentShader,
    transparent: options.transparent || false,
    side: options.side || THREE.FrontSide,
  });
}
