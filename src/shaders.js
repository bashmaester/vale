// Node-based look pipeline. Each node owns GLSL plus typed parameters.
// The graph compiler in graph.js turns these into one fragment shader.

export const VERTEX_SHADER = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const FRAGMENT_HEADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D uInk;
uniform sampler2D uField;
uniform vec2 uRes;
uniform float uTime;
`;

export const FRAGMENT_HELPERS = `
#define PI 3.14159265359
const vec3 PAL_BG   = vec3(0.028, 0.033, 0.029);
const vec3 PAL_INK  = vec3(0.945, 0.922, 0.842);
const vec3 PAL_RED  = vec3(0.835, 0.190, 0.135);
const vec3 PAL_TEAL = vec3(0.105, 0.705, 0.660);
const vec3 PAL_DIM  = vec3(0.330, 0.370, 0.335);

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = hash21(i);
  float b = hash21(i+vec2(1.0,0.0));
  float c = hash21(i+vec2(0.0,1.0));
  float d = hash21(i+vec2(1.0,1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<5;i++){ v += a*noise(p); p = p*2.03 + 11.7; a *= 0.5; }
  return v;
}
mat2 rot(float a){ float s=sin(a), c=cos(a); return mat2(c,-s,s,c); }
float luma(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }

vec2 gateWeave(vec2 uv, float t){
  float w = u_source_warp;
  return vec2(
    sin(t*1.7 + uv.y*3.0)*0.00055,
    cos(t*1.31 + uv.x*2.0)*0.00035
  ) * w;
}
`;

const params = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { type: 'float', step: 0.01, ...v }]));

export const NODE_DEFS = [
  {
    id: 'source',
    name: '01 · Plate / misregister',
    inputs: [],
    ui: { x: 24, y: 22, w: 162, h: 60 },
    params: params({
      misreg: { value: 0.85, min: 0, max: 4, label: 'misregister px' },
      warp: { value: 0.45, min: 0, max: 2, label: 'gate weave' },
    }),
    code: (g, n) => `vec4 n_source(vec4 c, vec2 uv, vec4 field){
  if(${g.u(n, 'enabled')} < 0.5) return c;
  vec2 tx = 1.0/uRes;
  vec2 off = vec2(${g.u(n, 'misreg')} * tx.x, 0.0);
  vec4 r = texture(uInk, uv + off);
  vec4 b = texture(uInk, uv - off);
  c.rgb = vec3(r.r, c.g, b.b);
  return c;
}`,
  },
  {
    id: 'carve',
    name: '02 · Carve / gouge',
    inputs: ['source'],
    ui: { x: 212, y: 22, w: 162, h: 60 },
    params: params({
      strength: { value: 0.72, min: 0, max: 1.5, label: 'gouge strength' },
      scale: { value: 13, min: 3, max: 40, label: 'tool size px', step: 0.5 },
      boil: { value: 0.30, min: 0, max: 2, label: 'line boil' },
    }),
    code: (g, n) => `vec4 n_carve(vec4 c, vec2 uv, vec4 field){
  if(${g.u(n, 'enabled')} < 0.5) return c;
  vec2 tx = 1.0/uRes;
  float l = luma(c.rgb);
  float lx = luma(texture(uInk, uv+vec2(tx.x,0.0)).rgb) - luma(texture(uInk, uv-vec2(tx.x,0.0)).rgb);
  float ly = luma(texture(uInk, uv+vec2(0.0,tx.y)).rgb) - luma(texture(uInk, uv-vec2(0.0,tx.y)).rgb);
  float edge = clamp(length(vec2(lx,ly))*2.3, 0.0, 1.0);
  vec2 gp = uv*uRes/max(${g.u(n, 'scale')}, 2.0);
  float n = fbm(gp + vec2(uTime*${g.u(n, 'boil')}*2.7, -uTime*${g.u(n, 'boil')}*1.6));
  float gouge = smoothstep(0.50, 0.79, n + edge*0.36);
  float crowd = 0.35 + field.g*0.65;
  c.rgb = mix(c.rgb, PAL_INK, gouge*${g.u(n, 'strength')}*0.30*crowd);
  c.rgb -= (1.0-gouge)*${g.u(n, 'strength')}*0.085*edge;
  float scratch = step(0.986, hash21(floor(uv*uRes/3.0)+floor(uTime*3.0))) * edge;
  c.rgb += scratch*${g.u(n, 'strength')}*0.55;
  return c;
}`,
  },
  {
    id: 'detail',
    name: '03 · Edge detail',
    inputs: ['carve'],
    ui: { x: 24, y: 106, w: 162, h: 60 },
    params: params({
      contour: { value: 0.58, min: 0, max: 1.5, label: 'contour cuts' },
      scale: { value: 9, min: 3, max: 30, label: 'contour scale px', step: 0.5 },
      warp: { value: 0.7, min: 0, max: 2, label: 'contour warp' },
      micro: { value: 0.42, min: 0, max: 1.5, label: 'micro scratches' },
      spark: { value: 0.3, min: 0, max: 1.5, label: 'edge sparks' },
    }),
    code: (g, n) => `vec4 n_detail(vec4 c, vec2 uv, vec4 field){
  if(${g.u(n, 'enabled')} < 0.5) return c;
  vec2 tx = 1.0/uRes;
  float l = luma(c.rgb);
  float lx = luma(texture(uInk, uv+vec2(tx.x,0.0)).rgb) - luma(texture(uInk, uv-vec2(tx.x,0.0)).rgb);
  float ly = luma(texture(uInk, uv+vec2(0.0,tx.y)).rgb) - luma(texture(uInk, uv-vec2(0.0,tx.y)).rgb);
  vec2 grad = vec2(lx,ly);
  float edge = clamp(length(grad)*2.2, 0.0, 1.0);
  vec2 tang = normalize(vec2(-grad.y, grad.x) + vec2(0.0001));
  vec2 hp = uv*uRes;
  float cc = dot(hp, tang)/max(${g.u(n, 'scale')},2.0) + fbm(hp/55.0 + uTime*0.02)*${g.u(n, 'warp')};
  float contour = 1.0 - smoothstep(0.30, 0.50, abs(fract(cc)-0.5)*2.0);
  c.rgb += PAL_INK * contour * edge * ${g.u(n, 'contour')} * 0.20;
  float micro = step(0.995, hash21(floor(hp/2.0)+floor(uTime*4.0)));
  c.rgb += micro * ${g.u(n, 'micro')} * (0.25 + field.g*0.35) * 0.25;
  float spark = step(0.9985, hash21(floor(hp/3.0)+floor(uTime*2.5))) * edge;
  c.rgb += spark * ${g.u(n, 'spark')} * 0.5;
  return c;
}`,
  },
  {
    id: 'hatch',
    name: '04 · Broken hatch',
    inputs: ['detail'],
    ui: { x: 212, y: 106, w: 162, h: 60 },
    params: params({
      angle: { value: -0.62, min: -3.14, max: 3.14, label: 'hatch angle', step: 0.01 },
      spacing: { value: 7.5, min: 3, max: 22, label: 'spacing px', step: 0.5 },
      strength: { value: 0.34, min: 0, max: 1, label: 'hatch strength' },
      warp: { value: 0.55, min: 0, max: 2, label: 'angle drift' },
      jitter: { value: 0.45, min: 0, max: 2, label: 'line wander' },
      breakup: { value: 0.38, min: 0, max: 1, label: 'broken lines' },
      cross: { value: 0.22, min: 0, max: 1, label: 'cross hatch' },
    }),
    code: (g, n) => `vec4 n_hatch(vec4 c, vec2 uv, vec4 field){
  if(${g.u(n, 'enabled')} < 0.5) return c;
  float l = luma(c.rgb);
  vec2 hp = uv*uRes;
  float n1 = fbm(hp/90.0 + vec2(uTime*0.006,0.0));
  float angle = ${g.u(n, 'angle')} + (n1-0.5)*${g.u(n, 'warp')} + field.g*0.25;
  float spacing = max(${g.u(n, 'spacing')} * (0.72 + 0.55*fbm(hp/140.0+3.7)), 2.0);
  vec2 p = rot(angle)*hp;
  p.x += (fbm(hp/38.0+7.1)-0.5)*${g.u(n, 'jitter')}*10.0;
  float f = abs(fract(p.x/spacing)-0.5)*2.0;
  float line = 1.0 - smoothstep(0.28, 0.50, f);
  float breakN = fbm(vec2(p.x/14.0, p.y/9.0)+uTime*0.02);
  line *= smoothstep(0.18, 0.55, breakN - ${g.u(n, 'breakup')}*0.25);
  float dark = 1.0 - smoothstep(0.07, 0.62, l);
  float dry = 1.0 - field.r*0.75;
  float amt = dark*${g.u(n, 'strength')}*(0.25 + 0.75*dry);
  c.rgb = mix(c.rgb, PAL_INK*0.78, line*amt);
  float angle2 = angle + 1.15;
  vec2 p2 = rot(angle2)*hp;
  p2.x += (fbm(hp/52.0+2.3)-0.5)*${g.u(n, 'jitter')}*8.0;
  float f2 = abs(fract(p2.x/(spacing*1.35))-0.5)*2.0;
  float line2 = 1.0 - smoothstep(0.32, 0.50, f2);
  line2 *= smoothstep(0.25, 0.75, dark) * ${g.u(n, 'cross')};
  c.rgb = mix(c.rgb, PAL_INK*0.62, line2*amt*0.7);
  return c;
}`,
  },
  {
    id: 'rain',
    name: '05 · Puddle mask (plate only)',
    // The procedural wet-glass overlay is gone. Rain and puddles are real
    // particles / ripples drawn into the ink plate by weather.js.
    enabled: false,
    inputs: ['hatch'],
    ui: { x: 24, y: 190, w: 162, h: 60 },
    params: params({
      intensity: { value: 0.0, min: 0, max: 1.5, label: 'disabled overlay' },
      speed: { value: 0.0, min: 0, max: 3, label: 'disabled speed' },
      reflect: { value: 0.0, min: 0, max: 2, label: 'disabled reflection' },
      splash: { value: 0.0, min: 0, max: 1.5, label: 'disabled splash' },
    }),
    code: (g, n) => `vec4 n_rain(vec4 c, vec2 uv, vec4 field){
  if(${g.u(n, 'enabled')} < 0.5) return c;
  // Pass-through: all rain/puddle work happens on the 2D plate.
  return c;
}`,
  },
  {
    id: 'palette',
    name: '06 · Ink separation',
    inputs: ['rain'],
    ui: { x: 212, y: 190, w: 162, h: 60 },
    params: params({
      posterize: { value: 0.88, min: 0, max: 1, label: 'posterize' },
      bleed: { value: 0.18, min: 0, max: 1, label: 'ink bleed' },
      dither: { value: 0.055, min: 0, max: 0.2, label: 'dither', step: 0.005 },
      accent: { value: 0.7, min: 0, max: 2, label: 'accent bloom' },
    }),
    code: (g, n) => `vec4 n_palette(vec4 c, vec2 uv, vec4 field){
  if(${g.u(n, 'enabled')} < 0.5) return c;
  vec2 tx = 1.0/uRes;
  vec3 blur = (
    texture(uInk, uv+vec2(tx.x*2.0,0.0)).rgb +
    texture(uInk, uv-vec2(tx.x*2.0,0.0)).rgb +
    texture(uInk, uv+vec2(0.0,tx.y*2.0)).rgb +
    texture(uInk, uv-vec2(0.0,tx.y*2.0)).rgb
  )*0.25;
  c.rgb = mix(c.rgb, blur, ${g.u(n, 'bleed')});
  c.rgb += (hash21(gl_FragCoord.xy + floor(uTime*3.5))-0.5)*${g.u(n, 'dither')};
  vec3 q = c.rgb;
  float best = distance(q, PAL_BG); vec3 col = PAL_BG;
  float d = distance(q, PAL_INK);  if(d<best){best=d; col=PAL_INK;}
  d = distance(q, PAL_RED);       if(d<best){best=d; col=PAL_RED;}
  d = distance(q, PAL_TEAL);      if(d<best){best=d; col=PAL_TEAL;}
  d = distance(q, PAL_DIM);       if(d<best){best=d; col=PAL_DIM;}
  c.rgb = mix(q, col, ${g.u(n, 'posterize')});
  c.rgb *= 1.0 + field.b*${g.u(n, 'accent')}*0.045;
  return c;
}`,
  },
  {
    id: 'paper',
    name: '07 · Paper / grain',
    inputs: ['palette'],
    ui: { x: 24, y: 274, w: 162, h: 60 },
    params: params({
      grain: { value: 0.085, min: 0, max: 0.3, label: 'grain', step: 0.005 },
      fiber: { value: 0.055, min: 0, max: 0.25, label: 'fiber', step: 0.005 },
      speckle: { value: 0.5, min: 0, max: 1.5, label: 'speckle' },
      vignette: { value: 0.42, min: 0, max: 1, label: 'vignette' },
    }),
    code: (g, n) => `vec4 n_paper(vec4 c, vec2 uv, vec4 field){
  if(${g.u(n, 'enabled')} < 0.5) return c;
  float g = (hash21(gl_FragCoord.xy + vec2(floor(uTime*6.0)))-0.5)*${g.u(n, 'grain')};
  float fib = (fbm(uv*uRes/80.0 + uTime*0.01)-0.5)*${g.u(n, 'fiber')};
  c.rgb += g + fib;
  float speck = step(0.9982, hash21(floor(gl_FragCoord.xy/2.0)+floor(uTime*3.5)));
  c.rgb = mix(c.rgb, PAL_INK, speck*${g.u(n, 'speckle')}*0.7);
  float vig = 1.0 - smoothstep(0.24, 1.06, length((uv-0.5)*vec2(1.0,1.12)));
  c.rgb *= mix(1.0, vig, ${g.u(n, 'vignette')});
  float flick = 0.992 + 0.006*sin(uTime*12.0) + 0.004*sin(uTime*4.0);
  c.rgb *= flick;
  return c;
}`,
  },
  {
    id: 'output',
    name: '08 · Output',
    inputs: ['paper'],
    ui: { x: 212, y: 274, w: 162, h: 60 },
    params: params({
      exposure: { value: 1.02, min: 0.5, max: 1.6, label: 'exposure' },
      contrast: { value: 1.12, min: 0.6, max: 1.8, label: 'contrast' },
    }),
    code: (g, n) => `vec4 n_output(vec4 c, vec2 uv, vec4 field){
  if(${g.u(n, 'enabled')} < 0.5) return c;
  c.rgb = (c.rgb-0.5)*${g.u(n, 'contrast')}+0.5;
  c.rgb *= ${g.u(n, 'exposure')};
  return vec4(clamp(c.rgb,0.0,1.0),1.0);
}`,
  },
];

export const PRESETS = {
  // Tuned for the rebuilt tile: the plate now carries real mid-tones
  // (asphalt, pavement, wet reflections), so the finish must be far gentler
  // than the low-key settings used by the first scaffold. Posterize and
  // vignette are low on purpose: they destroyed the model's gradients.
  linocut: {
    label: 'Linocut',
    graph: {
      source: { misreg: 0.8, warp: 0.4 },
      carve: { strength: 0.55, scale: 15, boil: 0.20 },
      detail: { contour: 0.40, scale: 10, warp: 0.6, micro: 0.30, spark: 0.22 },
      hatch: { angle: -0.62, spacing: 8.5, strength: 0.20, warp: 0.50, jitter: 0.42, breakup: 0.34, cross: 0.14 },
      rain: { enabled: false, intensity: 0, speed: 0, reflect: 0, splash: 0 },
      palette: { posterize: 0.42, bleed: 0.14, dither: 0.045, accent: 0.7 },
      paper: { grain: 0.070, fiber: 0.045, speckle: 0.45, vignette: 0.16 },
      output: { exposure: 1.04, contrast: 1.06 },
    },
    scene: { rainAmount: 1.0, rainSpeed: 1.0, puddleAmount: 1.0 },
  },
  // Raw plate, no print finish: the inspection view.
  plate: {
    label: 'Plate (raw)',
    graph: {
      source: { enabled: false, misreg: 0, warp: 0 },
      carve: { enabled: false },
      detail: { enabled: false },
      hatch: { enabled: false },
      rain: { enabled: false },
      palette: { enabled: false },
      paper: { enabled: false },
      output: { enabled: false },
    },
    scene: { rainAmount: 1.0, rainSpeed: 1.0, puddleAmount: 1.0 },
  },
  riso: {
    label: 'Risograph',
    graph: {
      source: { misreg: 2.0, warp: 0.7 },
      carve: { strength: 0.30, scale: 22, boil: 0.18 },
      detail: { contour: 0.24, scale: 15, warp: 0.9, micro: 0.18, spark: 0.14 },
      hatch: { angle: -0.30, spacing: 12, strength: 0.14, warp: 0.32, jitter: 0.22, breakup: 0.18, cross: 0.06 },
      rain: { enabled: false, intensity: 0, speed: 0, reflect: 0, splash: 0 },
      palette: { posterize: 0.30, bleed: 0.34, dither: 0.075, accent: 1.0 },
      paper: { grain: 0.11, fiber: 0.07, speckle: 0.7, vignette: 0.12 },
      output: { exposure: 1.06, contrast: 1.00 },
    },
    scene: { rainAmount: 0.85, rainSpeed: 0.9, puddleAmount: 1.15 },
  },
  newsprint: {
    label: 'Newsprint',
    graph: {
      source: { misreg: 0.35, warp: 0.2 },
      carve: { strength: 0.42, scale: 10, boil: 0.14 },
      detail: { contour: 0.55, scale: 7, warp: 0.35, micro: 0.45, spark: 0.32 },
      hatch: { angle: 0.6, spacing: 6.0, strength: 0.30, warp: 0.22, jitter: 0.18, breakup: 0.46, cross: 0.24 },
      rain: { enabled: false, intensity: 0, speed: 0, reflect: 0, splash: 0 },
      palette: { posterize: 0.55, bleed: 0.24, dither: 0.10, accent: 0.30 },
      paper: { grain: 0.15, fiber: 0.11, speckle: 0.95, vignette: 0.22 },
      output: { exposure: 1.00, contrast: 1.12 },
    },
    scene: { rainAmount: 0.75, rainSpeed: 0.85, puddleAmount: 0.85 },
  },
  blueprint: {
    label: 'Blueprint',
    graph: {
      source: { misreg: 1.2, warp: 0.5 },
      carve: { strength: 0.45, scale: 18, boil: 0.22 },
      detail: { contour: 0.48, scale: 12, warp: 0.7, micro: 0.36, spark: 0.26 },
      hatch: { angle: 0.15, spacing: 9.5, strength: 0.18, warp: 0.60, jitter: 0.5, breakup: 0.28, cross: 0.18 },
      rain: { enabled: false, intensity: 0, speed: 0, reflect: 0, splash: 0 },
      palette: { posterize: 0.40, bleed: 0.18, dither: 0.05, accent: 1.1 },
      paper: { grain: 0.08, fiber: 0.05, speckle: 0.45, vignette: 0.15 },
      output: { exposure: 1.05, contrast: 1.04 },
    },
    scene: { rainAmount: 1.15, rainSpeed: 1.05, puddleAmount: 1.1 },
  },
};
