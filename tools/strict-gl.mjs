// A strict WebGL2 stand-in for tests: it rejects the wrong kind of argument the
// way a real context does, which is how the blank-page bug of Turn 11 (a quad
// bound before its program existed) becomes a failing test instead of a black
// canvas. Shared by tools/renderer-smoke.mjs and tools/boot-bundle.mjs.

const CONSTANTS = [
  'TEXTURE_2D', 'RGBA', 'UNSIGNED_BYTE', 'TEXTURE0', 'TEXTURE1', 'VERTEX_SHADER',
  'FRAGMENT_SHADER', 'COMPILE_STATUS', 'LINK_STATUS', 'ARRAY_BUFFER', 'STATIC_DRAW',
  'FLOAT', 'TRIANGLE_STRIP', 'COLOR_BUFFER_BIT', 'DEPTH_TEST', 'BLEND', 'LINEAR',
  'CLAMP_TO_EDGE', 'TEXTURE_MIN_FILTER', 'TEXTURE_MAG_FILTER', 'TEXTURE_WRAP_S',
  'TEXTURE_WRAP_T', 'UNPACK_FLIP_Y_WEBGL',
];

export function makeGL({ black = false } = {}) {
  const state = { draws: 0, uploads: 0, programs: 0 };
  const gl = {};
  CONSTANTS.forEach((name, i) => { gl[name] = 1000 + i; });

  const isProgram = (p) => !!(p && p.__kind === 'program');
  const isShader = (s) => !!(s && s.__kind === 'shader');
  const isTex = (t) => !!(t && t.__kind === 'texture');
  const isBuf = (b) => !!(b && b.__kind === 'buffer');
  const need = (ok, what) => {
    if (!ok) throw new TypeError(`strict-gl: ${what} got the wrong kind of argument`);
  };

  gl.createShader = (type) => {
    if (type !== gl.VERTEX_SHADER && type !== gl.FRAGMENT_SHADER) throw new TypeError('strict-gl: createShader(type)');
    return { __kind: 'shader', type, source: '' };
  };
  gl.shaderSource = (s, src) => { need(isShader(s), 'shaderSource'); s.source = src; };
  gl.compileShader = (s) => { need(isShader(s), 'compileShader'); };
  gl.getShaderParameter = (s) => { need(isShader(s), 'getShaderParameter'); return true; };
  gl.getShaderInfoLog = (s) => { need(isShader(s), 'getShaderInfoLog'); return ''; };
  gl.deleteShader = (s) => { need(isShader(s), 'deleteShader'); };

  gl.createProgram = () => { state.programs++; return { __kind: 'program' }; };
  gl.attachShader = (p, s) => { need(isProgram(p), 'attachShader(program)'); need(isShader(s), 'attachShader(shader)'); };
  gl.linkProgram = (p) => { need(isProgram(p), 'linkProgram'); };
  gl.getProgramParameter = (p) => { need(isProgram(p), 'getProgramParameter'); return true; };
  gl.getProgramInfoLog = (p) => { need(isProgram(p), 'getProgramInfoLog'); return ''; };
  gl.deleteProgram = (p) => { need(isProgram(p), 'deleteProgram'); };
  gl.useProgram = (p) => { need(isProgram(p), 'useProgram'); };
  gl.getAttribLocation = (p, name) => {
    need(isProgram(p), 'getAttribLocation');
    return name === 'a_pos' ? 0 : -1;
  };
  gl.getUniformLocation = (p, name) => {
    need(isProgram(p), 'getUniformLocation');
    return { __kind: 'uniform', name };
  };

  gl.createBuffer = () => ({ __kind: 'buffer' });
  gl.bindBuffer = (t, b) => { if (b) need(isBuf(b), 'bindBuffer'); };
  gl.bufferData = () => {};
  gl.enableVertexAttribArray = (i) => {
    if (!(i >= 0)) throw new TypeError('strict-gl: enableVertexAttribArray(index)');
  };
  gl.vertexAttribPointer = (i) => {
    if (!(i >= 0)) throw new TypeError('strict-gl: vertexAttribPointer(index)');
  };

  gl.createTexture = () => ({ __kind: 'texture', w: 0, h: 0 });
  gl.bindTexture = (t, tex) => { state.bound = tex; if (tex) need(isTex(tex), 'bindTexture'); };
  gl.activeTexture = () => {};
  gl.texParameteri = () => {};
  gl.texImage2D = (target, level, internal, w, h) => {
    if (!(w > 0) || !(h > 0)) throw new TypeError('strict-gl: texImage2D with empty extent');
    if (state.bound) { state.bound.w = w; state.bound.h = h; }
  };
  gl.texSubImage2D = (target, level, x, y, w, h, fmt, type, source) => {
    state.uploads++;
    // A DOM source cannot be scaled by texSubImage2D: the extent must match.
    if (source && source.width && (source.width !== w || source.height !== h)) {
      throw new TypeError(`strict-gl: texSubImage2D ${w}x${h} from a ${source.width}x${source.height} canvas`);
    }
    if (state.bound && (state.bound.w !== w || state.bound.h !== h)) {
      throw new TypeError('strict-gl: texSubImage2D into a texture of a different size');
    }
  };

  gl.pixelStorei = () => {};
  gl.viewport = (x, y, w, h) => { if (!(w > 0) || !(h > 0)) throw new TypeError('strict-gl: viewport'); };
  gl.uniform1i = (loc) => { if (loc === undefined) throw new TypeError('strict-gl: uniform1i(undefined)'); };
  gl.uniform1f = (loc) => { if (loc === undefined) throw new TypeError('strict-gl: uniform1f(undefined)'); };
  gl.uniform2f = (loc) => { if (loc === undefined) throw new TypeError('strict-gl: uniform2f(undefined)'); };
  gl.clearColor = () => {};
  gl.clear = () => {};
  gl.disable = () => {};
  gl.enable = () => {};
  gl.getExtension = () => null;
  gl.getParameter = () => 'strict-gl';
  gl.drawArrays = () => { state.draws++; };
  gl.readPixels = (x, y, w, h, fmt, type, out) => {
    // Mimic a healthy pass (or a dead one, for the fallback test).
    out[0] = black ? 0 : 200; out[1] = black ? 0 : 190; out[2] = black ? 0 : 170; out[3] = 255;
  };
  gl.state = state;
  return gl;
}

export function fakeCanvas(gl) {
  return {
    width: 0, height: 0, id: 'screen', className: 'screen', style: {},
    addEventListener() {}, setAttribute() {}, getAttribute() { return ''; }, replaceWith() {},
    getContext(type) { return type === 'webgl2' ? gl : null; },
  };
}

