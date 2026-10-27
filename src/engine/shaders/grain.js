// Post-processing: film grain + print aesthetic
export const grainVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const grainFragmentShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uGrain;
  uniform float uTime;
  uniform float uContrast;
  uniform float uVignette;
  uniform vec3 uTint;
  uniform float uScanline;

  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float hash3(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }

  void main() {
    vec4 color = texture2D(tDiffuse, vUv);

    // Film grain — layered
    float grain = 0.0;
    grain += (hash(vUv * 1000.0 + uTime * 50.0) - 0.5) * 0.6;
    grain += (hash(vUv * 2000.0 - uTime * 30.0) - 0.5) * 0.3;
    grain += (hash(vUv * 500.0 + uTime * 80.0) - 0.5) * 0.1;
    color.rgb += grain * uGrain;

    // Contrast — push blacks darker, whites brighter
    color.rgb = pow(color.rgb, vec3(1.0 / uContrast));

    // Warm tint in shadows, cool in highlights
    float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    vec3 shadowTint = vec3(1.05, 0.97, 0.92);
    vec3 highlightTint = vec3(0.95, 0.97, 1.02);
    vec3 tint = mix(shadowTint, highlightTint, lum);
    color.rgb = mix(color.rgb, color.rgb * tint * uTint, 0.2);

    // Vignette
    vec2 center = vUv - 0.5;
    float vig = 1.0 - dot(center, center) * uVignette;
    color.rgb *= vig;

    // Subtle scanlines for print feel
    float scan = sin(vUv.y * 600.0 + uTime * 0.5) * 0.015 * uScanline;
    color.rgb += scan;

    // Slight color aberration at edges
    float aberration = length(center) * 0.002;
    float r = texture2D(tDiffuse, vUv + vec2(aberration, 0.0)).r;
    float b = texture2D(tDiffuse, vUv - vec2(aberration, 0.0)).b;
    color.r = mix(color.r, r, 0.3);
    color.b = mix(color.b, b, 0.3);

    gl_FragColor = vec4(color.rgb, 1.0);
  }
`;

export function createGrainPass(renderer, scene, camera, options = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      uGrain: { value: options.grain ?? 0.04 },
      uTime: { value: 0 },
      uContrast: { value: options.contrast ?? 1.1 },
      uVignette: { value: options.vignette ?? 1.2 },
      uTint: { value: options.tint || new THREE.Color(1.0, 0.98, 0.95) },
      uScanline: { value: options.scanline ?? 0.3 },
    },
    vertexShader: grainVertexShader,
    fragmentShader: grainFragmentShader,
  });

  return material;
}
