// Sidebar: the authoring panel for the running scene.
//
// Hidden by default so the film is clean. Tab (or the handle on the right edge)
// opens it. Everything is bound two ways: moving a control mutates the scene or
// the look graph immediately, and the panel re-reads values when something else
// changes them (preset switch, camera mode, lab).
//
// Sections: Camera · Scene · Texture · Palette · Case · Playback.
import { PRESETS } from './graph.js';
import { SCENE_PARAM_DEFS } from './scene.js';

const el = (tag, className, text) => {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
};

function section(title, subtitle) {
  const s = el('section', 'sb-section');
  const h = el('h3', 'sb-title', title);
  s.appendChild(h);
  if (subtitle) s.appendChild(el('p', 'sb-sub', subtitle));
  return s;
}

export class Sidebar {
  constructor({ scene, graph, renderer, state, director }) {
    this.scene = scene;
    this.graph = graph;
    this.renderer = renderer;
    this.state = state;
    this.director = director;
    this.root = null;
    this.open = false;
    this.rows = [];
    this.built = false;
    this.texture = 1;
    this.smudgeOn = true;
    this.texBase = null;
    this.preset = 'linocut';
    this._onKey = this._onKey.bind(this);
  }

  mount() {
    this.handle = el('button', 'sb-handle', '☰');
    this.handle.type = 'button';
    this.handle.title = 'Scene controls (Tab)';
    this.handle.addEventListener('click', () => this.toggle());
    document.body.appendChild(this.handle);

    this.root = el('aside', 'sb');
    this.root.id = 'sidebar';
    this.root.hidden = true;
    document.body.appendChild(this.root);
    this.texBase = this.readTexBase();
    this.build();
    window.addEventListener('keydown', this._onKey);
  }

  _onKey(e) {
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.key === 'Tab') { e.preventDefault(); this.toggle(); }
  }

  toggle(force) {
    const want = force == null ? !this.open : !!force;
    this.open = want;
    if (this.root) this.root.hidden = !want;
    if (this.handle) this.handle.textContent = want ? '×' : '☰';
    if (want) this.refresh();
  }

  // --- texture master -----------------------------------------------------

  // The strengths the current preset ships with. The master fader scales
  // relative to these, so 1.0 is the authored look and 0 is clean paper.
  readTexBase() {
    const val = (id, key) => {
      const n = this.graph.getNode(id);
      return n && n.params[key] ? n.params[key].value : 0;
    };
    return {
      hatch: val('hatch', 'strength'),
      micro: val('detail', 'micro'),
      spark: val('detail', 'spark'),
      speckle: val('paper', 'speckle'),
      grain: val('paper', 'grain'),
    };
  }

  applyTexture() {
    const b = this.texBase || (this.texBase = this.readTexBase());
    const v = this.smudgeOn ? this.texture : 0;
    this.graph.setParam('hatch', 'strength', b.hatch * v);
    this.graph.setParam('detail', 'micro', b.micro * v);
    this.graph.setParam('detail', 'spark', b.spark * v);
    this.graph.setParam('paper', 'speckle', b.speckle * v);
    this.graph.setParam('paper', 'grain', b.grain * (0.55 + 0.45 * v));
  }

  // --- small widgets ------------------------------------------------------

  slider({ label, min, max, step, value, format, onInput, get }) {
    const wrap = el('label', 'sb-row');
    const head = el('span', 'sb-row-head');
    head.appendChild(el('span', 'sb-label', label));
    const val = el('span', 'sb-val', format ? format(value) : String(+Number(value).toFixed(2)));
    head.appendChild(val);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      val.textContent = format ? format(v) : String(+v.toFixed(2));
      onInput(v);
    });
    wrap.appendChild(head);
    wrap.appendChild(input);
    const sync = () => {
      if (!get) return;
      const v = get();
      if (v == null || !Number.isFinite(+v)) return;
      const str = String(v);
      if (input.value !== str) input.value = str;
      val.textContent = format ? format(v) : String(+Number(v).toFixed(2));
    };
    this.rows.push({ kind: 'slider', input, sync });
    return wrap;
  }

  select({ label, options, value, onChange, get }) {
    const wrap = el('label', 'sb-row');
    wrap.appendChild(el('span', 'sb-label', label));
    const sel = document.createElement('select');
    for (const [val, text] of options) {
      const o = el('option', null, text);
      o.value = val;
      sel.appendChild(o);
    }
    sel.value = value;
    sel.addEventListener('change', () => onChange(sel.value));
    wrap.appendChild(sel);
    const sync = () => {
      if (!get) return;
      const v = get();
      if (v == null) return;
      if (sel.value !== String(v)) sel.value = String(v);
    };
    this.rows.push({ kind: 'select', input: sel, sync });
    return wrap;
  }

  toggleRow({ label, value, onChange, get }) {
    const wrap = el('label', 'sb-row sb-row-inline');
    wrap.appendChild(el('span', 'sb-label', label));
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!value;
    box.addEventListener('change', () => onChange(box.checked));
    wrap.appendChild(box);
    const sync = () => {
      if (!get) return;
      const v = !!get();
      if (box.checked !== v) box.checked = v;
    };
    this.rows.push({ kind: 'check', input: box, sync });
    return wrap;
  }

  buttonRow(label, onClick, cls) {
    const b = el('button', `sb-btn ${cls || ''}`.trim(), label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  // --- panel --------------------------------------------------------------

  build() {
    const root = this.root;
    root.appendChild(el('h2', 'sb-heading', 'VALE · scene controls'));
    root.appendChild(el('p', 'sb-note',
      'Tab to hide. C cycles the camera (cinematic → first person → third person → drone).'));

    // Camera ---------------------------------------------------------------
    const cam = section('Camera', 'Steady shots for the film, or take control.');
    cam.appendChild(this.select({
      label: 'mode',
      value: this.director.mode,
      options: [
        ['cinematic', 'Cinematic (steady shots)'],
        ['fps', 'First person'],
        ['third', 'Third person'],
        ['drone', 'Drone'],
      ],
      onChange: (v) => this.director.setMode(v),
      get: () => this.director.mode,
    }));
    cam.appendChild(this.select({
      label: 'shot',
      value: this.director.shot,
      options: this.director.shots.map((s) => [s.id, s.label]),
      onChange: (v) => { this.director.setMode('cinematic'); this.director.setShot(v); },
      get: () => this.director.shot,
    }));
    cam.appendChild(this.toggleRow({
      label: 'show control hint',
      value: this.director.hudEnabled,
      onChange: (v) => { this.director.hudEnabled = v; if (!v) this.director.hideHud(); },
      get: () => this.director.hudEnabled,
    }));
    root.appendChild(cam);

    // Scene ----------------------------------------------------------------
    const sc = section('Scene', 'Live parameters of the procedural tile.');
    const defs = SCENE_PARAM_DEFS;
    const addScene = (key, label) => {
      const d = defs[key];
      if (!d) return;
      sc.appendChild(this.slider({
        label: label || d.label,
        min: d.min, max: d.max, step: d.step,
        value: this.scene.params[key],
        onInput: (v) => this.scene.setParam(key, v),
        get: () => this.scene.params[key],
      }));
    };
    addScene('crowdDensity');
    addScene('walkSpeed');
    addScene('rainAmount');
    addScene('rainSpeed');
    addScene('puddleAmount');
    addScene('wind');
    root.appendChild(sc);

    // Texture --------------------------------------------------------------
    const tex = section('Texture', 'Ink and paper passes. The hatch pass is the "smudge".');
    const node = (id) => this.graph.getNode(id);
    const addNode = (nodeId, key, label, fmt) => {
      const n = node(nodeId);
      if (!n || !n.params[key]) return;
      const p = n.params[key];
      tex.appendChild(this.slider({
        label: label || p.label || key,
        min: p.min, max: p.max, step: p.step || 0.01,
        value: p.value,
        format: fmt,
        onInput: (v) => this.graph.setParam(nodeId, key, v),
        get: () => p.value,
      }));
    };
    tex.appendChild(this.toggleRow({
      label: 'smudge overlay',
      value: this.smudgeOn,
      onChange: (v) => { this.smudgeOn = v; this.applyTexture(); },
      get: () => this.smudgeOn,
    }));
    tex.appendChild(this.slider({
      label: 'plate texture (master)',
      min: 0, max: 1, step: 0.01,
      value: this.texture,
      onInput: (v) => { this.texture = v; this.applyTexture(); },
      get: () => this.texture,
    }));
    addNode('hatch', 'strength', 'hatch smudge');
    addNode('hatch', 'spacing', 'hatch spacing');
    addNode('detail', 'contour', 'contour swirl');
    addNode('paper', 'grain', 'grain');
    addNode('paper', 'fiber', 'fiber');
    addNode('paper', 'vignette', 'vignette');
    const texRow = el('div', 'sb-btns');
    texRow.appendChild(this.buttonRow('No smudge', () => {
      this.smudgeOn = false;
      this.applyTexture();
      this.graph.setParam('detail', 'contour', 0);
      this.graph.setParam('paper', 'fiber', 0);
      this.refresh();
    }, 'ghost'));
    texRow.appendChild(this.buttonRow('Reset', () => {
      this.graph.applyPreset('linocut');
      this.texBase = this.readTexBase();
      this.texture = 1;
      this.smudgeOn = true;
      this.applyTexture();
      this.refresh();
    }, 'ghost'));
    tex.appendChild(texRow);
    root.appendChild(tex);

    // Palette --------------------------------------------------------------
    const pal = section('Palette', 'Print presets and colour separation.');
    pal.appendChild(this.select({
      label: 'preset',
      value: this.preset,
      options: Object.keys(PRESETS).map((k) => [k, k]),
      onChange: (v) => {
        this.preset = v;
        this.graph.applyPreset(v);
        this.texBase = this.readTexBase();
        if (PRESETS[v] && PRESETS[v].scene) this.scene.setParams(PRESETS[v].scene);
        if (this.texture !== 1 || !this.smudgeOn) this.applyTexture();
        this.refresh();
      },
      get: () => this.preset,
    }));
    addNode('palette', 'posterize', 'posterize');
    addNode('palette', 'bleed', 'ink bleed');
    addNode('palette', 'accent', 'accent bloom');
    root.appendChild(pal);

    // Case -----------------------------------------------------------------
    const cs = section('Case', 'The museum case around the tile.');
    cs.appendChild(this.toggleRow({
      label: 'show boundaries',
      value: this.scene.params.caseFrame === 1,
      onChange: (v) => this.scene.setParam('caseFrame', v ? 1 : 0),
      get: () => this.scene.params.caseFrame === 1,
    }));
    cs.appendChild(this.select({
      label: 'LoD',
      value: String(this.scene.params.lod),
      options: [['-1', 'auto'], ['0', '0 · hero'], ['1', '1 · mid'], ['2', '2 · far']],
      onChange: (v) => this.scene.setParam('lod', Number(v)),
      get: () => String(this.scene.params.lod),
    }));
    root.appendChild(cs);

    // Playback -------------------------------------------------------------
    const pb = section('Playback');
    const pbRow = el('div', 'sb-btns');
    this.playBtn = this.buttonRow(this.state.paused ? 'Play' : 'Pause', () => {
      this.state.paused = !this.state.paused;
      this.playBtn.textContent = this.state.paused ? 'Play' : 'Pause';
    }, 'ghost');
    pbRow.appendChild(this.playBtn);
    pbRow.appendChild(this.buttonRow('Restart', () => { this.state.time = 0; }, 'ghost'));
    pb.appendChild(pbRow);
    pb.appendChild(this.slider({
      label: 'speed',
      min: 0.1, max: 2, step: 0.01,
      value: this.state.speed,
      onInput: (v) => { this.state.speed = v; },
      get: () => this.state.speed,
    }));
    root.appendChild(pb);

    this.built = true;
    this.refresh();
  }

  // Re-read values from the live objects (preset switch, lab, keyboard).
  // Every row registers a `sync` that pulls the authoritative value back into
  // its widget, so the panel never drifts from the scene.
  refresh() {
    if (!this.built) return;
    for (const r of this.rows) {
      try { r.sync(); } catch (err) { /* a row lost its source: ignore */ }
    }
    if (this.playBtn) this.playBtn.textContent = this.state.paused ? 'Play' : 'Pause';
  }
}
