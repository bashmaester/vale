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
    // preserveDrawingBuffer forces the browser to copy the drawing buffer every
    // frame (~1-2 ms at 1440p) and it is only needed for readback. Screenshot
    // tools ask for it explicitly with ?capture=1.
    const search = typeof location !== 'undefined' ? (location.search || '') : '';
    const capture = /[?&]capture=1/.test(search);
    // Escape hatch: ?renderer=2d composites the plate directly, no GL at all.
    const force2d = /[?&]renderer=2d/.test(search);
    this._force2d = force2d;
    try {
      // No powerPreference: asking for the discrete GPU has produced black
      // canvases inside embeds, and the default choice is fine for a quad.
      this.gl = force2d ? null : canvas.getContext('webgl2', {
        alpha: false, antialias: false, depth: false, stencil: false,
        preserveDrawingBuffer: capture, failIfMajorPerformanceCaveat: false,
      });
    } catch (e) { this.gl = null; }
    if (!this.gl) { this._fallback(); return; }
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.initGL(); });
    this.initGL();
  }

  _fallback(reason) {
    if (this.fallback) return;
    this._force2d = this._force2d || false;
    this.fallback = true;
    this.fallbackReason = reason || 'no webgl2';
    if (reason && typeof console !== 'undefined') console.warn(`VALE: ${reason} — compositing on the 2D canvas instead.`);
    // Never let the escape hatch throw: if any DOM call here failed, the page
    // would stay black with no way back.
    if (this._force2d && this.canvas.getContext) {
      this.ctx2d = this.canvas.getContext('2d');
      this.resize(this.W, this.H);
      return;
    }
    try {
      const c = document.createElement('canvas');
      c.className = this.canvas.className || 'screen';
      c.id = `${this.canvas.id || 'screen'}-2d`;
      if (c.setAttribute && this.canvas.getAttribute) {
        c.setAttribute('aria-label', this.canvas.getAttribute('aria-label') || '');
      }
      if (this.canvas.replaceWith) this.canvas.replaceWith(c);
      this.canvas = c;
      this.ctx2d = c.getContext('2d');
    } catch (e) {
      this.ctx2d = this.canvas.getContext ? this.canvas.getContext('2d') : null;
    }
    this.resize(this.W, this.H);
  }

  initGL() {
    const gl = this.gl;
    // Order matters: the program must exist before the quad asks it where
    // `a_pos` lives. Building the quad first threw on a real GL context
    // (getAttribLocation without a program) and blanked the whole page.
    if (!this._buildProgram()) return;
    if (!this._built) {
      this._built = true;
      this._initQuad();
      this._initTextures();
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    }
    this.resize(this.W, this.H);
  }

  // Compile the look graph into a fresh program and cache its uniform
  // locations. Called only when a node crosses the on/off line.
  _buildProgram() {
    const gl = this.gl;
    let program;
    try {
      program = linkProgram(gl, VERTEX_SHADER, this.graph.compile());
    } catch (e) {
      console.error(e);
      // Keep the film visible even if a node produces invalid GLSL.
      this._fallback(`look graph did not compile (${e && e.message ? e.message : e})`);
      return false;
    }
    if (this.program) gl.deleteProgram(this.program);
    this.program = program;
    this._activity = this.graph.activity();
    gl.useProgram(program);
    this.loc = {};
    for (const name of ['uInk', 'uField', 'uRes', 'uTime', ...Object.keys(this.graph.uniformValues())]) {
      this.loc[name] = gl.getUniformLocation(program, name);
    }
    // Attribute locations belong to the program, so re-point the quad every
    // time the program is rebuilt.
    if (this.quad) this._bindQuadAttrib();
    return true;
  }

  _bindQuadAttrib() {
    const gl = this.gl;
    if (!this.program || !this.quad || !gl) return;
    const a = gl.getAttribLocation(this.program, 'a_pos');
    this.attrPos = a;
    if (a < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  }

  _initQuad() {
    const gl = this.gl;
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    this.quad = quad;
    this._bindQuadAttrib();
  }

  _initTextures() {
    const gl = this.gl;
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
    this._inkAlloc = 0;
    this._fieldAlloc = 0;
  }

  // Why did we end up on the 2D path? Kept for the error chip and the console.
  get backend() {
    if (this.bypass) return 'plate';
    if (this.fallback) return this.fallbackReason || '2d';
    return 'webgl2';
  }

  // Allocate the texture store once per size. Per-frame uploads then reuse it
  // with texSubImage2D instead of reallocating two full frames of VRAM every
  // single frame (which is what texImage2D does).
  _allocTextures(W, H) {
    const gl = this.gl;
    // The field texture must match the canvas size: texSubImage2D cannot scale a
    // DOM source, and a copy-through canvas every frame would cost more than it
    // saves.
    const fW = W, fH = H;
    if (this._inkAlloc !== (W * H)) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texInk);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      this._inkAlloc = W * H;
      this._inkW = W; this._inkH = H;
    }
    if (this._fieldAlloc !== (fW * fH)) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.texField);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fW, fH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      this._fieldAlloc = fW * fH;
      this._fieldW = fW; this._fieldH = fH;
    }
  }

  resize(W, H) {
    this.W = W; this.H = H;
    if (this.fallback) {
      this.canvas.width = W; this.canvas.height = H;
      this.ctx2d.imageSmoothingEnabled = true;
      return;
    }
    this.canvas.width = W; this.canvas.height = H;
    if (this.gl) {
      this.gl.viewport(0, 0, W, H);
      this._allocTextures(W, H);
    }
  }

  recompile() {
    if (this.fallback || !this.gl) return;
    try { this._buildProgram(); } catch (e) { console.error(e); }
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
    if (this.lost || !this.program) return;
    const gl = this.gl;

    // The look graph changed shape (a node was switched off or a strength hit
    // zero): rebuild the program before drawing with it.
    if (this.graph.activity() !== this._activity) this._buildProgram();

    gl.useProgram(this.program);
    gl.viewport(0, 0, this.W, this.H);
    this._allocTextures(this.W, this.H);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texInk);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.W, this.H, gl.RGBA, gl.UNSIGNED_BYTE, plate);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texField);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this._fieldW, this._fieldH, gl.RGBA, gl.UNSIGNED_BYTE, field);

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

    this._healthCheck(gl, plate);
  }

  // A GL pass that renders nothing must not look like a broken page: sample the
  // centre pixel on the first few frames and fall back to the 2D composite if
  // the pass came out black while the plate has ink there.
  _healthCheck(gl, plate) {
    if (this._checked || this.fallback) return;
    // Sample twice: one black frame during startup must not trip this.
    this._samples = this._samples || [];
    const px = new Uint8Array(4);
    let black = true;
    try {
      gl.readPixels((this.W / 2) | 0, (this.H / 2) | 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      black = px[0] + px[1] + px[2] === 0;
    } catch (e) { this._checked = true; return; }
    this._samples.push(black);
    if (this._samples.length < 3) return;
    this._checked = true;
    let ink = 0;
    try {
      const c = plate.getContext('2d');
      const d = c.getImageData((this.W / 2) | 0, this.H - 1 - ((this.H / 2) | 0), 1, 1).data;
      ink = d[0] + d[1] + d[2];
    } catch (e) { ink = 255; }   // no readback: assume the plate has ink
    if (this._samples.every(Boolean) && ink > 24) {
      this._fallback(`the WebGL pass rendered nothing (${this._glInfo(gl)})`);
    }
  }

  _glInfo(gl) {
    try {
      const ext = gl.getExtension && gl.getExtension('WEBGL_debug_renderer_info');
      if (!ext) return 'no renderer info';
      return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).slice(0, 90);
    } catch (e) { return 'no renderer info'; }
  }
}
