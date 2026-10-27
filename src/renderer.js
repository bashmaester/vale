import { VERTEX_SHADER } from './shaders.js';

function compileShader(gl, type, source) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return sh;
}

function linkProgram(gl, vsSrc, fsSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const p = gl.createProgram();
  gl.attachShader(p, vs); gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(`Program link failed: ${log}`);
  }
  return p;
}

export class Renderer {
  constructor(canvas, graph, W, H) {
    this.graph = graph;
    this.W = W; this.H = H;
    this.fallback = false;
    this.lost = false;
    this.canvas = canvas;
    try {
      this.gl = canvas.getContext('webgl2', {
        alpha: false, antialias: false, depth: false, stencil: false,
        preserveDrawingBuffer: true, powerPreference: 'high-performance',
      });
    } catch (e) { this.gl = null; }
    if (!this.gl) { this._fallback(); return; }
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.initGL(); });
    this.initGL();
  }

  _fallback() {
    this.fallback = true;
    const c = document.createElement('canvas');
    c.className = this.canvas.className || 'screen';
    c.id = `${this.canvas.id || 'screen'}-2d`;
    c.setAttribute('aria-label', this.canvas.getAttribute('aria-label') || '');
    this.canvas.replaceWith(c);
    this.canvas = c;
    this.ctx2d = c.getContext('2d');
    this.resize(this.W, this.H);
  }

  initGL() {
    const gl = this.gl;
    try {
      this.program = linkProgram(gl, VERTEX_SHADER, this.graph.compile());
    } catch (e) {
      console.error(e);
      // Keep the film visible even if a node produces invalid GLSL.
      this._fallback();
      return;
    }
    gl.useProgram(this.program);
    this.loc = {};
    for (const name of ['uInk', 'uField', 'uRes', 'uTime', ...Object.keys(this.graph.uniformValues())]) {
      this.loc[name] = gl.getUniformLocation(this.program, name);
    }
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(this.program, 'a_pos');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    this.quad = quad;

    const makeTex = (unit) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.texInk = makeTex(0);
    this.texField = makeTex(1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    this.resize(this.W, this.H);
  }

  resize(W, H) {
    this.W = W; this.H = H;
    if (this.fallback) {
      this.canvas.width = W; this.canvas.height = H;
      this.ctx2d.imageSmoothingEnabled = true;
      return;
    }
    this.canvas.width = W; this.canvas.height = H;
    if (this.gl) this.gl.viewport(0, 0, W, H);
  }

  recompile() {
    if (this.fallback) return;
    try {
      if (this.program) this.gl.deleteProgram(this.program);
      this.initGL();
    } catch (e) { console.error(e); }
  }

  render(plate, field, time) {
    if (this.bypass) {
      // Raw plate view: judge the drawing before the print finish.
      if (!this.ctx2d) {
        const c = document.createElement('canvas');
        c.className = this.canvas.className || 'screen';
        c.id = `${this.canvas.id || 'screen'}-raw`;
        this.canvas.replaceWith(c);
        this.canvas = c;
        this.ctx2d = c.getContext('2d');
        this.canvas.width = this.W; this.canvas.height = this.H;
      }
      this.ctx2d.clearRect(0, 0, this.W, this.H);
      this.ctx2d.drawImage(plate, 0, 0, this.W, this.H);
      return;
    }
    if (this.fallback) {
      this.ctx2d.clearRect(0, 0, this.W, this.H);
      this.ctx2d.drawImage(plate, 0, 0);
      return;
    }
    if (this.lost) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.viewport(0, 0, this.W, this.H);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texInk);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, plate);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texField);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, field);

    gl.uniform1i(this.loc.uInk, 0);
    gl.uniform1i(this.loc.uField, 1);
    gl.uniform2f(this.loc.uRes, this.W, this.H);
    gl.uniform1f(this.loc.uTime, time);
    for (const [name, value] of Object.entries(this.graph.uniformValues())) {
      if (this.loc[name] != null) gl.uniform1f(this.loc[name], value);
    }
    gl.clearColor(0.02, 0.024, 0.02, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
