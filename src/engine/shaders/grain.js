// Post-processing: film grain + color grading for print aesthetic
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

  void main() {
    vec4 color = texture2D(tDiffuse, vUv);

    // Film grain
    float grain = hash(vUv * 1000.0 + uTime * 100.0) * 2.0 - 1.0;
    color.rgb += grain * uGrain;

    // Contrast
    color.rgb = (color.rgb - 0.5) * uContrast + 0.5;

    // Tint
    color.rgb = mix(color.rgb, color.rgb * uTint, 0.15);

    // Vignette
    vec2 center = vUv - 0.5;
    float vig = 1.0 - dot(center, center) * uVignette;
    color.rgb *= vig;

    // Subtle scanlines for print feel
    float scan = sin(vUv.y * 800.0) * 0.02 * uScanline;
    color.rgb += scan;

    gl_FragColor = vec4(color.rgb, 1.0);
  }
`;

// Simple quad for post-processing
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
