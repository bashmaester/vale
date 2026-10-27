// A stats.js-style overlay, self-contained (no external assets, no CDN).
//
// It answers the two questions that matter when the frame budget is tight:
//   * how long is a frame taking, and which stage is eating it;
//   * which subsystems are currently doing work.
//
// The graph is deliberately crude: one column per sample, taller = slower.
// `update()` is called once per frame from main.js with the measured frame time
// and the scene's per-stage profile.

const HIST = 120;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export class StatsPanel {
  constructor({ scene, renderer, state }) {
    this.scene = scene;
    this.renderer = renderer;
    this.state = state;
    this.open = false;
    this.root = null;
    this.samples = new Float32Array(HIST);
    this.head = 0;
    this.fps = 0;
    this.ms = 0;
    this.acc = 0;
    this.frames = 0;
    this.visible = false;
  }

  mount() {
    const root = el('aside', 'stats');
    root.id = 'stats';
    root.hidden = true;

    const top = el('div', 'stats-top');
    this.fpsEl = el('span', 'stats-fps', '--');
    this.msEl = el('span', 'stats-ms', '--');
    const gpu = el('span', 'stats-gpu', '');
    this.gpuEl = gpu;
    top.appendChild(this.fpsEl);
    top.appendChild(this.msEl);
    top.appendChild(gpu);
    root.appendChild(top);

    const canvas = document.createElement('canvas');
    canvas.className = 'stats-graph';
    canvas.width = HIST * 2;
    canvas.height = 60;
    this.graph = canvas;
    this.gctx = canvas.getContext('2d');
    root.appendChild(canvas);

    this.rowsEl = el('div', 'stats-rows');
    root.appendChild(this.rowsEl);

    document.body.appendChild(root);
    this.root = root;
    return this;
  }

  setBackend(name) {
    this.backend = name;
    if (this.gpuEl) this.gpuEl.textContent = name;
  }

  toggle(force) {
    const want = force == null ? !this.open : !!force;
    this.open = want;
    if (this.root) this.root.hidden = !want;
    if (this.visible !== want) this.visible = want;
  }

  /** Rebuild the per-stage rows once a second (they are text, not per frame). */
  _rows(frameMs) {
    const T = this.scene.profile || {};
    const parts = Object.entries(T)
      .map(([k, v]) => [k, v])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    const rows = parts.map(([k, v]) => {
      const pct = frameMs > 0 ? Math.min(100, (v / frameMs) * 100) : 0;
      return `<div class="stats-row"><span>${k}</span><i style="width:${pct.toFixed(0)}%"></i><b>${v.toFixed(1)}</b></div>`;
    }).join('');
    const params = this.scene.params || {};
    const flags = [
      ['crowd', params.featCrowd], ['vehicles', params.featTraffic], ['rain', params.featRain],
      ['puddles', params.featPuddles], ['reflections', params.featReflections],
      ['signals', params.featSignals], ['flicker', params.featFlicker],
    ].map(([name, on]) => `<span class="stats-flag ${on ? 'on' : 'off'}">${name}</span>`).join('');
    this.rowsEl.innerHTML = rows + `<div class="stats-flags">${flags}</div>`;
  }

  update(frameMs) {
    if (!this.open) return;
    this.acc += frameMs;
    this.frames++;
    this.samples[this.head] = frameMs;
    this.head = (this.head + 1) % HIST;
    if (this.acc >= 500) {
      this.ms = this.acc / this.frames;
      this.fps = 1000 / Math.max(0.01, this.ms);
      this.acc = 0;
      this.frames = 0;
      this.fpsEl.textContent = `${this.fps.toFixed(0)} fps`;
      this.msEl.textContent = `${this.ms.toFixed(1)} ms`;
      this._rows(this.ms);
    }
    this._graph();
  }

  _graph() {
    const c = this.gctx;
    if (!c) return;
    const W = this.graph.width, H = this.graph.height;
    c.clearRect(0, 0, W, H);
    // 16.7 ms and 33.3 ms reference lines.
    const yFor = (ms) => H - Math.min(1, ms / 50) * H;
    c.strokeStyle = 'rgba(86,199,183,0.25)';
    c.lineWidth = 1;
    for (const ms of [16.7, 33.3]) {
      const y = yFor(ms);
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }
    const step = W / HIST;
    for (let i = 0; i < HIST; i++) {
      const v = this.samples[(this.head + i) % HIST];
      if (!v) continue;
      const h = Math.min(1, v / 50) * H;
      c.fillStyle = v > 33 ? '#d43b30' : v > 17 ? '#d8a03a' : '#56c7b7';
      c.fillRect(i * step, H - h, Math.max(1, step - 0.5), h);
    }
  }
}
