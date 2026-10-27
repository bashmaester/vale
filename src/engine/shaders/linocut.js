// Linocut / Woodcut shader — heavy carve aesthetic
// Deep gouges, rough carved lines, paper grain, overprint bleed

export const linocutVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vViewPos;
  varying vec2 vUv;
  varying float vFresnel;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vec4 vp = viewMatrix * wp;
    vViewPos = vp.xyz;
    vec3 viewDir = normalize(-vp.xyz);
    vFresnel = 1.0 - max(dot(viewDir, vNormal), 0.0);
    gl_Position = projectionMatrix * vp;
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
  uniform float uRoughness;

  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vViewPos;
  varying vec2 vUv;
  varying float vFresnel;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }

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

  // Heavy carved line pattern — the core linocut look
  float carve(vec2 uv, float scale) {
    float n = 0.0;
    vec2 p = uv * scale;
    for (float i = 0.0; i < 6.0; i++) {
      vec2 grid = floor(p);
      vec2 local = fract(p) - 0.5;
      float h = hash(grid + i * 17.3);
      float angle = h * 6.283;
      vec2 dir = vec2(cos(angle), sin(angle));
      float perp = dot(local, vec2(-dir.y, dir.x));
      // Wide gouge with rough edges
      float width = 0.04 + h * 0.04;
      float rough = noise(grid * 3.0 + i) * 0.02;
      float line = smoothstep(width + rough, width * 0.3, abs(perp));
      n += line * (0.6 + 0.4 * h);
      // Secondary parallel scratch
      float scratch = smoothstep(0.02, 0.0, abs(perp - 0.08)) * step(0.6, h);
      n += scratch * 0.3;
      p = p * 1.8 + vec2(hash(grid + i * 3.7) * 100.0);
    }
    return n / 6.0;
  }

  // Deep gouge marks
  float gouge(vec2 uv, float amount) {
    float g = 0.0;
    vec2 p = uv * 6.0;
    for (float i = 0.0; i < 8.0; i++) {
      vec2 grid = floor(p);
      vec2 local = fract(p) - 0.5;
      float h = hash(grid + i * 31.1);
      float angle = hash(grid * 1.3 + i * 7.7) * 3.14;
      vec2 dir = vec2(cos(angle), sin(angle));
      float line = dot(local, vec2(-dir.y, dir.x));
      float mark = smoothstep(0.08 * (0.5 + h * 0.5), 0.0, abs(line)) * step(0.25, h);
      // Depth shadow inside gouge
      float depth = mark * (1.0 - abs(line) * 3.0);
      g += max(mark, depth * 0.5) * 0.5;
      p = p * 2.3 + vec2(hash(grid) * 200.0, hash(grid + 1.7) * 200.0);
    }
    return g * amount;
  }

  // Paper grain — visible fiber texture
  float paperGrain(vec2 uv) {
    float grain = 0.0;
    float scale = 1.0;
    for (float i = 0.0; i < 4.0; i++) {
      vec2 p = uv * scale * 80.0;
      float n = noise(p);
      grain += n * 0.25;
      scale *= 0.5;
    }
    return grain;
  }

  // Print registration error — slight color offset
  float overprint(vec2 uv) {
    vec2 shift = vec2(0.003, -0.002);
    float a = hash(floor(uv * 200.0));
    float b = hash(floor((uv + shift) * 200.0));
    return abs(a - b) * 2.0;
  }

  void main() {
    vec3 lightDir = normalize(vec3(0.4, 0.9, 0.5));
    float diffuse = max(dot(vNormal, lightDir), 0.0);
    float ambient = 0.25;

    // Carve pattern
    float c = carve(vUv, uCarveScale);
    float carveMask = smoothstep(0.05, 0.4, c) * uCarveDepth;

    // Gouge
    float g = gouge(vUv, uGougeAmount);

    // Paper grain
    float grain = paperGrain(vUv + vWorldPos.xy * 0.05);

    // Edge darkening
    float edge = pow(vFresnel, 1.5) * uEdgeDarken;

    // Combine
    vec3 base = mix(uColor, uCarveColor, carveMask);
    // Gouge darkens deeply
    base = mix(base, uCarveColor * 0.5, g * 0.6);

    // Overprint
    if (uOverprintAmount > 0.0) {
      float op = overprint(vUv) * uOverprintAmount;
      vec3 shifted = mix(uOverprintColor, uCarveColor, carveMask);
      base = mix(base, shifted, op * (0.3 + 0.7 * grain));
    }

    // Lighting
    vec3 color = base * (ambient + diffuse * 0.65);

    // Rough edges — noise at boundaries
    float roughEdge = noise(vWorldPos.xy * 20.0 + vNormal.xy * 5.0) * uRoughness;
    color += vec3(roughEdge - 0.5) * 0.05;

    // Grain overlay
    color += vec3(grain - 0.5) * uGrainIntensity;

    // Edge darken
    color *= (1.0 - edge * 0.6);

    // Imperfection
    float variation = hash(vWorldPos.xy * 10.0) * 0.03 - 0.015;
    color += variation;

    gl_FragColor = vec4(color, uOpacity);
  }
`;

export function createLinocutMaterial(options = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: options.color || new THREE.Color(0xf0ece8) },
      uCarveColor: { value: options.carveColor || new THREE.Color(0x0a0a0f) },
      uCarveDepth: { value: options.carveDepth ?? 0.7 },
      uCarveScale: { value: options.carveScale ?? 2.0 },
      uGrainIntensity: { value: options.grainIntensity ?? 0.07 },
      uTime: { value: 0 },
      uOpacity: { value: options.opacity ?? 1.0 },
      uGougeAmount: { value: options.gougeAmount ?? 0.4 },
      uEdgeDarken: { value: options.edgeDarken ?? 0.5 },
      uOverprintColor: { value: options.overprintColor || new THREE.Color(0xc44030) },
      uOverprintAmount: { value: options.overprintAmount ?? 0.08 },
      uRoughness: { value: options.roughness ?? 0.3 },
    },
    vertexShader: linocutVertexShader,
    fragmentShader: linocutFragmentShader,
    transparent: options.transparent || false,
    side: options.side || THREE.FrontSide,
  });
}
