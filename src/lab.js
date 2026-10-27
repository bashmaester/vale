import { PRESETS } from './graph.js';
import { SCENE_PARAM_DEFS } from './scene.js';
import { PHASES, DURATION } from './timeline.js';

const STORE_KEY = 'vale.look.v1';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

function makeSlider(parent, label, def, value, onInput) {
  const row = el('div', 'lab-row');
  const l = el('label', null, label);
  const input = el('input');
  input.type = 'range';
  input.min = def.min; input.max = def.max; input.step = def.step; input.value = value;
  const val = el('span', 'lab-val', Number(value).toFixed(def.step < 0.01 ? 3 : 2));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    val.textContent = v.toFixed(def.step < 0.01 ? 3 : 2);
    onInput(v);
  });
  row.append(l, input, val);
  parent.appendChild(row);
  return { input, val, row };
}

export class Lab {
  constructor({ graph, scene, renderer, state }) {
    this.graph = graph;
    this.scene = scene;
    this.renderer = renderer;
    this.state = state;
    this.camera = scene.cameraController;
    this.root = document.getElementById('lab');
    this.isOpen = false;
    this.built = false;
    this.selected = 'carve';
    this.sceneInputs = {};
    this.nodeInputs = {};
    this.scrubbing = false;
    this.drag = null;
    this._bindKeys();
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      if (e.key === 'l' || e.key === 'L') { this.toggle(); e.preventDefault(); }
      else if (e.key === ' ') { this.state.paused = !this.state.paused; e.preventDefault(); }
      else if (e.key === 's' || e.key === 'S') { this.saveFrame(); e.preventDefault(); }
      else if (e.key === 'r' || e.key === 'R') { this.resetAll(); e.preventDefault(); }
    });
  }

  build() {
    if (this.built) return;
    this.built = true;
    this.root.innerHTML = `
      <div class="lab-head">
        <div>
          <div class="lab-title">VALE / LOOK LAB</div>
          <div class="lab-sub">3D scene → 2D plate → node shader</div>
        </div>
        <button class="lab-close" title="Close (L)">×</button>
      </div>
      <div class="lab-tabs">
        <button class="lab-tab active" data-tab="look">LOOK</button>
        <button class="lab-tab" data-tab="scene">SCENE</button>
        <button class="lab-tab" data-tab="cam">CAM</button>
        <button class="lab-tab" data-tab="time">TIME</button>
        <button class="lab-tab" data-tab="io">I/O</button>
      </div>
      <div class="lab-body">
        <section class="lab-section active" data-section="look">
          <canvas class="lab-graph" width="380" height="340"></canvas>
          <div class="lab-node-title" id="nodeTitle"></div>
          <div id="nodeParams"></div>
          <div class="lab-note">Drag nodes to rearrange the patch. Double-click a node to bypass it. All changes are live uniforms — no rebuild required.</div>
        </section>
        <section class="lab-section" data-section="scene">
          <div class="lab-note">Parametric scene modules. The crowd, rain, reflections, train and traffic all read from the 20-second signal cycle.</div>
          <div id="sceneParams"></div>
          <div class="lab-node-title">Look presets</div>
          <div class="lab-btns" id="presetBtns"></div>
        </section>
        <section class="lab-section" data-section="cam">
          <div class="lab-note">Take over the 3D camera. The figures, vehicles and umbrellas are procedural 3D geometry projected to outlines, so flying changes their perspective.</div>
          <div class="lab-node-title" id="camStatus">CINEMATIC</div>
          <div class="lab-btns">
            <button class="lab-btn primary" id="camAutoBtn">Cinematic</button>
            <button class="lab-btn" id="camFpsBtn">First person</button>
            <button class="lab-btn" id="camThirdBtn">Third person</button>
            <button class="lab-btn" id="camFlyBtn">Drone</button>
            <button class="lab-btn" id="camResetBtn">Reset view</button>
          </div>
          <div id="camParams"></div>
          <div class="lab-note"><b>C</b> cycles modes · <b>1–4</b> jump to one · <b>V</b> back to cinematic · <b>[ ]</b> change steady shot. <b>Drag</b> look · <b>wheel</b> dolly · <b>WASD</b> move · <b>Shift</b> run/boost. Right-drag does nothing on purpose. Speeds live in the SCENE tab and the Tab sidebar.</div>
        </section>
        <section class="lab-section" data-section="time">
          <div class="lab-phasebar" id="phasebar"></div>
          <input type="range" id="scrub" min="0" max="20" step="0.01" value="0" style="width:100%;accent-color:#56c7b7">
          <div class="lab-time"><span id="timeLabel">0.00 / 20.00</span><span id="phaseLabel">WAIT</span></div>
          <div class="lab-btns">
            <button class="lab-btn primary" id="playBtn">Pause</button>
            <button class="lab-btn" id="resetTimeBtn">Rewind</button>
          </div>
          <div class="lab-note">Scrub to inspect the contrast between waiting, crossing, drain and the briefly empty street. Space toggles playback.</div>
        </section>
        <section class="lab-section" data-section="io">
          <div class="lab-btns">
            <button class="lab-btn primary" id="savePngBtn">Save PNG</button>
            <button class="lab-btn" id="copyJsonBtn">Copy JSON</button>
            <button class="lab-btn" id="saveLocalBtn">Save local</button>
            <button class="lab-btn" id="loadLocalBtn">Load local</button>
            <button class="lab-btn danger" id="resetAllBtn">Reset all</button>
          </div>
          <textarea class="lab-textarea" id="jsonBox" spellcheck="false"></textarea>
          <div class="lab-note">The normal film at <b>index.html</b> is UI-free. Append <b>?lab=1</b> to open this patch bay. No external assets, no audio.</div>
        </section>
      </div>
      <div class="lab-foot"><span class="lab-kbd">L</span> lab · <span class="lab-kbd">Space</span> play · <span class="lab-kbd">S</span> frame · <span class="lab-kbd">R</span> reset · <span class="lab-kbd">C/F/V</span> camera</div>
    `;

    this.tabs = [...this.root.querySelectorAll('.lab-tab')];
    this.sections = [...this.root.querySelectorAll('.lab-section')];
    for (const t of this.tabs) {
      t.addEventListener('click', () => {
        this.tabs.forEach((x) => x.classList.toggle('active', x === t));
        this.sections.forEach((s) => s.classList.toggle('active', s.dataset.section === t.dataset.tab));
      });
    }
    this.root.querySelector('.lab-close').addEventListener('click', () => this.close());

    this.graphCanvas = this.root.querySelector('.lab-graph');
    this.gctx = this.graphCanvas.getContext('2d');
    this.nodeTitle = this.root.querySelector('#nodeTitle');
    this.nodeParams = this.root.querySelector('#nodeParams');
    this.sceneParams = this.root.querySelector('#sceneParams');
    this.presetBtns = this.root.querySelector('#presetBtns');
    this.camStatus = this.root.querySelector('#camStatus');
    this.camParams = this.root.querySelector('#camParams');
    this.phasebar = this.root.querySelector('#phasebar');
    this.scrub = this.root.querySelector('#scrub');
    this.timeLabel = this.root.querySelector('#timeLabel');
    this.phaseLabel = this.root.querySelector('#phaseLabel');
    this.playBtn = this.root.querySelector('#playBtn');
    this.jsonBox = this.root.querySelector('#jsonBox');

    this._buildPhasebar();
    this._buildPresets();
    this._buildSceneParams();
    this._buildCameraControls();
    this._buildNodeParams();
    this._bindGraph();
    this._bindActions();
    this.refreshAll();
  }

  _buildPhasebar() {
    for (const p of PHASES) {
      const d = el('div', 'lab-phase', p.id);
      d.style.left = `${p.a * 100}%`;
      d.style.width = `${(p.b - p.a) * 100}%`;
      d.style.background = p.color;
      this.phasebar.appendChild(d);
    }
    this.cursor = el('div', 'lab-cursor');
    this.phasebar.appendChild(this.cursor);
  }

  _buildPresets() {
    for (const [id, p] of Object.entries(PRESETS)) {
      const b = el('button', 'lab-btn', p.label);
      b.addEventListener('click', () => this.applyPreset(id));
      this.presetBtns.appendChild(b);
    }
  }

  _buildSceneParams() {
    this.sceneParams.innerHTML = '';
    const params = this.scene.getParams();
    for (const [key, def] of Object.entries(SCENE_PARAM_DEFS)) {
      this.sceneInputs[key] = makeSlider(this.sceneParams, def.label, def, params[key], (v) => {
        this.scene.setParam(key, v);
        if (this.camInputs && this.camInputs[key]) {
          this.camInputs[key].input.value = v;
          this.camInputs[key].val.textContent = Number(v).toFixed(def.step < 0.01 ? 3 : 2);
        }
      });
    }
  }

  _buildCameraControls() {
    this.camInputs = {};
    this.camParams.innerHTML = '';
    for (const key of ['flySpeed', 'cameraEase']) {
      const def = SCENE_PARAM_DEFS[key];
      this.camInputs[key] = makeSlider(this.camParams, def.label, def, this.scene.getParams()[key], (v) => {
        this.scene.setParam(key, v);
        if (this.sceneInputs[key]) {
          this.sceneInputs[key].input.value = v;
          this.sceneInputs[key].val.textContent = Number(v).toFixed(def.step < 0.01 ? 3 : 2);
        }
      });
    }
    this.root.querySelector('#camAutoBtn').addEventListener('click', () => this.camera.setMode('cinematic'));
    this.root.querySelector('#camFpsBtn').addEventListener('click', () => this.camera.setMode('fps'));
    this.root.querySelector('#camThirdBtn').addEventListener('click', () => this.camera.setMode('third'));
    this.root.querySelector('#camFlyBtn').addEventListener('click', () => this.camera.setMode('drone'));
    this.root.querySelector('#camResetBtn').addEventListener('click', () => this.camera.forceCinematic());
  }

  _buildNodeParams() {
    const n = this.graph.getNode(this.selected) || this.graph.nodes[0];
    this.selected = n.id;
    this.nodeTitle.textContent = n.name;
    this.nodeParams.innerHTML = '';
    this.nodeInputs = {};

    const check = el('label', 'lab-check');
    const cb = el('input');
    cb.type = 'checkbox'; cb.checked = n.enabled;
    cb.addEventListener('change', () => { this.graph.setEnabled(n.id, cb.checked); this.drawGraph(); });
    check.append(cb, document.createTextNode(' enabled'));
    this.nodeParams.appendChild(check);

    for (const [key, def] of Object.entries(n.params)) {
      this.nodeInputs[key] = makeSlider(this.nodeParams, def.label, def, def.value, (v) => {
        this.graph.setParam(n.id, key, v);
      });
    }
  }

  _bindGraph() {
    const c = this.graphCanvas;
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      return [(e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height)];
    };
    const hit = (x, y) => {
      for (let i = this.graph.nodes.length - 1; i >= 0; i--) {
        const n = this.graph.nodes[i];
        if (x >= n.ui.x && x <= n.ui.x + n.ui.w && y >= n.ui.y && y <= n.ui.y + n.ui.h) return n;
      }
      return null;
    };
    c.addEventListener('pointerdown', (e) => {
      const [x, y] = pos(e);
      const n = hit(x, y);
      if (!n) return;
      this.selected = n.id;
      this._buildNodeParams();
      this.drag = { id: n.id, dx: x - n.ui.x, dy: y - n.ui.y };
      c.setPointerCapture(e.pointerId);
      this.drawGraph();
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const [x, y] = pos(e);
      const n = this.graph.getNode(this.drag.id);
      const nx = Math.max(4, Math.min(c.width - n.ui.w - 4, x - this.drag.dx));
      const ny = Math.max(4, Math.min(c.height - n.ui.h - 4, y - this.drag.dy));
      this.graph.setNodePos(n.id, nx, ny);
      this.drawGraph();
    });
    const end = () => { this.drag = null; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('dblclick', (e) => {
      const [x, y] = pos(e);
      const n = hit(x, y);
      if (!n) return;
      this.graph.setEnabled(n.id, !n.enabled);
      this.selected = n.id;
      this._buildNodeParams();
      this.drawGraph();
    });
  }

  _bindActions() {
    this.scrub.addEventListener('pointerdown', () => { this.scrubbing = true; this.state.paused = true; });
    window.addEventListener('pointerup', () => { this.scrubbing = false; });
    this.scrub.addEventListener('input', () => {
      this.state.time = Number(this.scrub.value);
      this.state.paused = true;
    });
    this.playBtn.addEventListener('click', () => { this.state.paused = !this.state.paused; });
    this.root.querySelector('#resetTimeBtn').addEventListener('click', () => { this.state.time = 0; this.state.paused = false; });
    this.root.querySelector('#savePngBtn').addEventListener('click', () => this.saveFrame());
    this.root.querySelector('#copyJsonBtn').addEventListener('click', () => this.copyJSON());
    this.root.querySelector('#saveLocalBtn').addEventListener('click', () => this.saveLocal());
    this.root.querySelector('#loadLocalBtn').addEventListener('click', () => this.loadLocal());
    this.root.querySelector('#resetAllBtn').addEventListener('click', () => this.resetAll());
  }

  drawGraph() {
    if (!this.built) return;
    const ctx = this.gctx;
    const W = this.graphCanvas.width, H = this.graphCanvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#070a08';
    ctx.fillRect(0, 0, W, H);
    // faint grid
    ctx.strokeStyle = 'rgba(86,199,183,0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    const byId = new Map(this.graph.nodes.map((n) => [n.id, n]));
    for (const n of this.graph.nodes) {
      for (const dep of n.inputs) {
        const p = byId.get(dep);
        if (!p) continue;
        const x0 = p.ui.x + p.ui.w, y0 = p.ui.y + p.ui.h / 2;
        const x1 = n.ui.x, y1 = n.ui.y + n.ui.h / 2;
        ctx.strokeStyle = n.enabled ? 'rgba(86,199,183,0.55)' : 'rgba(93,105,97,0.35)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.bezierCurveTo(x0 + 30, y0, x1 - 30, y1, x1, y1);
        ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath(); ctx.arc(x1, y1, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const n of this.graph.nodes) {
      const sel = n.id === this.selected;
      roundRect(ctx, n.ui.x, n.ui.y, n.ui.w, n.ui.h, 6);
      ctx.fillStyle = n.enabled ? (sel ? '#16251f' : '#0d1410') : '#14100f';
      ctx.fill();
      ctx.strokeStyle = sel ? '#56c7b7' : (n.enabled ? '#3a4b41' : '#7e3b34');
      ctx.lineWidth = sel ? 1.8 : 1;
      ctx.stroke();
      ctx.fillStyle = n.enabled ? '#eef3e8' : '#8a6a63';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(n.name, n.ui.x + 9, n.ui.y + 20);
      ctx.fillStyle = '#6f8377';
      ctx.font = '9px ui-monospace, monospace';
      const count = Object.keys(n.params).length;
      ctx.fillText(`${count} params · ${n.enabled ? 'on' : 'bypass'}`, n.ui.x + 9, n.ui.y + 38);
      if (!n.enabled) {
        ctx.strokeStyle = '#d43b30'; ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(n.ui.x + n.ui.w - 18, n.ui.y + 10);
        ctx.lineTo(n.ui.x + n.ui.w - 8, n.ui.y + 20);
        ctx.moveTo(n.ui.x + n.ui.w - 8, n.ui.y + 10);
        ctx.lineTo(n.ui.x + n.ui.w - 18, n.ui.y + 20);
        ctx.stroke();
      }
    }
  }

  applyPreset(name) {
    const p = this.graph.applyPreset(name);
    if (p && p.scene) this.scene.setParams(p.scene);
    this.refreshAll();
  }

  refreshAll() {
    if (!this.built) return;
    this._buildNodeParams();
    const params = this.scene.getParams();
    for (const [key, s] of Object.entries(this.sceneInputs)) {
      if (params[key] == null) continue;
      s.input.value = params[key];
      s.val.textContent = Number(params[key]).toFixed(s.input.step < 0.01 ? 3 : 2);
    }
    if (this.camInputs) {
      for (const [key, s] of Object.entries(this.camInputs)) {
        if (params[key] == null) continue;
        s.input.value = params[key];
        s.val.textContent = Number(params[key]).toFixed(s.input.step < 0.01 ? 3 : 2);
      }
    }
    this.drawGraph();
    this.updateJSON();
  }

  updateJSON() {
    if (!this.built) return;
    this.jsonBox.value = JSON.stringify({ graph: this.graph.toJSON(), scene: this.scene.getParams(), preset: 'custom' }, null, 2);
  }

  currentData() {
    return { graph: this.graph.toJSON(), scene: this.scene.getParams(), preset: 'custom' };
  }

  copyJSON() {
    const s = JSON.stringify(this.currentData(), null, 2);
    this.jsonBox.value = s;
    if (navigator.clipboard) navigator.clipboard.writeText(s).catch(() => {});
    else this.jsonBox.select();
  }

  saveLocal() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.currentData())); } catch (e) { /* file:// may block */ }
  }

  loadLocal() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.graph) this.graph.fromJSON(data.graph);
      if (data.scene) this.scene.setParams(data.scene);
      this.refreshAll();
    } catch (e) { /* ignore */ }
  }

  resetAll() {
    this.graph.reset();
    this.graph.applyPreset('linocut');
    this.scene.resetParams();
    this.scene.setParams(PRESETS.linocut.scene || {});
    this.refreshAll();
  }

  saveFrame() {
    try {
      const canvas = this.renderer.canvas;
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `vale-frame-${(this.state.time % DURATION).toFixed(2)}.png`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { console.warn('Could not save frame', e); }
  }

  open() {
    this.build();
    this.isOpen = true;
    this.root.hidden = false;
    this.refreshAll();
  }
  close() { this.isOpen = false; this.root.hidden = true; }
  toggle() { this.isOpen ? this.close() : this.open(); }

  render(t, timeline) {
    if (!this.isOpen || !this.built) return;
    const u = ((t / DURATION) % 1 + 1) % 1;
    if (!this.scrubbing) this.scrub.value = (u * DURATION).toFixed(2);
    this.cursor.style.left = `${u * 100}%`;
    this.timeLabel.textContent = `${(u * DURATION).toFixed(2)} / ${DURATION.toFixed(2)}`;
    this.phaseLabel.textContent = timeline.label();
    this.playBtn.textContent = this.state.paused ? 'Play' : 'Pause';
    if (this.camStatus) this.camStatus.textContent = this.camera.status();
    this.drawGraph();
  }
}
