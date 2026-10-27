import { ShaderGraph, PRESETS } from './graph.js';
import { Renderer } from './renderer.js';
import { Scene } from './scene.js';
import { Lab } from './lab.js';
import { Sidebar } from './sidebar.js';
import { StatsPanel } from './stats.js';
import { DURATION } from './timeline.js';
import { clamp } from './math.js';

const q = new URLSearchParams(location.search);

// Internal render size. Rendering a fixed 1440×810 no matter how big the window
// is wasted most of the work on a laptop; the plate now follows the viewport
// (at most 1.25× DPR) and can be scaled down further with ?scale=.
function viewportSize() {
  if (q.has('w') || q.has('h')) {
    return {
      W: clamp(parseInt(q.get('w') || '1440', 10) || 1440, 640, 2560),
      H: clamp(parseInt(q.get('h') || '810', 10) || 810, 360, 1440),
      fixed: true,
    };
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
  const bw = Math.max(320, window.innerWidth || 1440);
  const bh = Math.max(180, window.innerHeight || 810);
  const W = clamp(Math.round(bw * dpr), 640, 1440);
  return { W, H: Math.round(W * bh / bw), fixed: false };
}
const size0 = viewportSize();
let W = size0.W, H = size0.H;
let quality = clamp(Number(q.get('scale') || '1') || 1, 0.4, 1);
let RW = Math.max(320, Math.round(W * quality));
let RH = Math.max(180, Math.round(H * quality));
const initialTime = Number(q.get('t') || '0') || 0;
const initialSpeed = clamp(Number(q.get('speed') || '1') || 1, 0.1, 4);
const presetName = q.get('preset') && PRESETS[q.get('preset')] ? q.get('preset') : 'linocut';

const state = {
  time: initialTime,
  paused: q.has('paused'),
  speed: initialSpeed,
};

const graph = new ShaderGraph();
graph.applyPreset(presetName);

const scene = new Scene(RW, RH);
scene.setParams(PRESETS[presetName].scene || {});

const canvas = document.getElementById('screen');
const renderer = new Renderer(canvas, graph, RW, RH);

// ?finish=raw shows the ink plate with no print graph, for judging the drawing.
if (q.get('finish') === 'raw' || q.get('raw') === '1') renderer.bypass = true;

// Drone is the default eye: it reads the volume best and needs no input.
const camMode = q.get('cam') || 'drone';
scene.cameraController.hudEnabled = q.get('hud') !== '0';
scene.cameraController.setMode(camMode === 'user' ? 'third' : camMode);
const shotParam = q.get('shot');
if (shotParam) scene.cameraController.setShot(shotParam);

const lab = new Lab({ graph, scene, renderer, state });
const stats = new StatsPanel({ scene, renderer, state }).mount();

// --- adaptive resolution ---------------------------------------------------
// The plate is painted on the CPU, so the only lever that scales every stage at
// once is the number of pixels. Instead of guessing a fixed quality, watch the
// frame time and move the render scale until the film holds ~60 fps.
const perf = {
  auto: !q.has('scale'),
  quality() { return quality; },
  setQuality(v) { setQuality(v); },
  setAuto(v) { perf.auto = !!v; },
};
function setQuality(v) {
  const next = clamp(Number(v) || 1, 0.4, 1);
  if (Math.abs(next - quality) < 0.001) return quality;
  quality = next;
  applySize(W, H);
  return quality;
}

const sidebar = new Sidebar({ graph, scene, renderer, state, director: scene.cameraController, stats, perf });
sidebar.mount();
// Handles go out only after every construction has finished: referencing `lab`
// before this line threw a TDZ ReferenceError and blanked the whole page.
// Resize / quality plumbing: both the plate and the shader viewport change.
function applySize(nextW, nextH) {
  W = Math.round(nextW); H = Math.round(nextH);
  RW = Math.max(320, Math.round(W * quality));
  RH = Math.max(180, Math.round(H * quality));
  scene.setViewport(RW, RH);
  renderer.resize(RW, RH);
  scene.cameraRig.setViewport(RW, RH);
  window.VALE.W = RW; window.VALE.H = RH;
  scene._staticKey = '';
}
window.VALE = {
  graph, scene, renderer, lab, sidebar, state, get W() { return RW; }, get H() { return RH; },
  DURATION, applySize,
  stats, perf,
  get quality() { return quality; },
  setQuality,
  get scale() { return { W: RW, H: RH, quality, auto: perf.auto }; },
};

if (!size0.fixed) {
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { const n = viewportSize(); applySize(n.W, n.H); }, 180);
  });
}

// The UI is hidden on load: this is a film, not a dashboard. `\` reveals it.
const ui = { shown: false };
function setUI(show) {
  ui.shown = !!show;
  document.body.classList.toggle('ui-hidden', !ui.shown);
  if (!ui.shown) {
    sidebar.toggle(false);
    if (lab.close) lab.close();
    stats.toggle(false);
  } else {
    sidebar.toggle(true);
  }
}
document.body.classList.add('ui-hidden');
window.addEventListener('keydown', (e) => {
  // Only text entry swallows the shortcut: a focused slider or checkbox must
  // not stop `\\` from hiding the UI.
  const t = e.target || {};
  const tag = (t.tagName || '').toLowerCase();
  const typing = tag === 'textarea' || (tag === 'input' && !['range', 'checkbox', 'radio', 'button'].includes((t.type || '').toLowerCase()));
  if (typing) return;
  if (e.key === '\\') { e.preventDefault(); setUI(!ui.shown); }
});
window.VALE.setUI = setUI;
window.VALE.ui = ui;

if (q.has('lab')) { setUI(true); lab.open(); }
if (q.get('stats') === '1') stats.toggle(true);
if (q.has('ui') || q.has('panel')) setUI(true);

// --- quality governor ------------------------------------------------------
// One adjustment every ~1.5 s, in 5 % steps, with a dead band between 13.5 and
// 20 ms so it cannot oscillate. ?scale= or a manual pick pins the scale.
let frameEma = 16.7;
let adjustIn = 90;
function govern(frameMs) {
  if (!perf.auto || state.paused) return;
  if (!(frameMs > 0) || frameMs > 200) return;   // tab switch / resize spike
  frameEma = frameEma * 0.9 + frameMs * 0.1;
  if (--adjustIn > 0) return;
  adjustIn = 90;
  if (frameEma > 20 && quality > 0.45) setQuality(quality - 0.05);
  else if (frameEma < 13.5 && quality < 1) setQuality(quality + 0.05);
}

// --- visible diagnostics ---------------------------------------------------
// A frame that throws used to leave a black canvas and a console message nobody
// reads. Failures now show up on screen (and `window.__valeError` stays set for
// tooling).
function showError(msg) {
  let box = document.getElementById('vale-err');
  if (!box) {
    box = document.createElement('div');
    box.id = 'vale-err';
    box.className = 'vale-err';
    const t = document.createElement('b');
    t.textContent = 'VALE: ';
    box.appendChild(t);
    const body = document.createElement('span');
    body.id = 'vale-err-msg';
    box.appendChild(body);
    document.body.appendChild(box);
  }
  const body = document.getElementById('vale-err-msg');
  if (body) body.textContent = String(msg || 'unknown error').slice(0, 320);
  box.hidden = false;
}
window.addEventListener('error', (e) => showError((e && e.message) || 'script error'));
window.addEventListener('unhandledrejection', (e) => showError((e && e.reason && e.reason.message) || 'promise rejection'));
window.VALE.showError = showError;

let last = performance.now();
let lastError = '';
function frame(now) {
  const frameMs = now - last;
  const dt = Math.min(frameMs / 1000, 0.05);
  last = now;
  if (!state.paused) state.time += dt * state.speed;
  const t = state.time;
  try {
    const { plate, field } = scene.render(t, dt);
    // Secondary shader noise uses the same calmer clock as rain and grain boil.
    // Same clock as the scene, wrapped at the loop point: the grain pattern is
    // identical at t=0 and t=20 instead of drifting.
    const shaderTime = scene.timeline.t;
    renderer.render(plate, field, shaderTime);
    lab.render(t, scene.timeline);
  } catch (err) {
    // One bad frame must not stop the loop (or the page would stay black and
    // look like a build failure). Report once, keep the clock running.
    const msg = err && err.message ? err.message : String(err);
    if (msg !== lastError) {
      lastError = msg;
      window.__valeError = msg;
      console.error('VALE frame error:', err);
      showError(`frame error — ${msg}`);
    }
  } finally {
    stats.update(frameMs);
    govern(frameMs);
    if (stats.open) stats.setBackend && stats.setBackend(renderer.backend);
    requestAnimationFrame(frame);
  }
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => { last = performance.now(); });

console.log(
  '%cVALE%c — Tab opens scene controls. C cycles camera: cinematic → first person → third person → drone. ?lab=1 opens the patch bay.',
  'color:#56c7b7;font-weight:bold', 'color:#9fb2a5'
);
