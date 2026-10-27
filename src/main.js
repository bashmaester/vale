import { ShaderGraph, PRESETS } from './graph.js';
import { Renderer } from './renderer.js';
import { Scene } from './scene.js';
import { Lab } from './lab.js';
import { Sidebar } from './sidebar.js';
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

const camMode = q.get('cam');
scene.cameraController.hudEnabled = q.get('hud') !== '0';
if (camMode) scene.cameraController.setMode(camMode === 'user' ? 'third' : camMode);
const shotParam = q.get('shot');
if (shotParam) scene.cameraController.setShot(shotParam);

const lab = new Lab({ graph, scene, renderer, state });
const sidebar = new Sidebar({ graph, scene, renderer, state, director: scene.cameraController });
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
  get quality() { return quality; },
  setQuality(v) {
    quality = clamp(Number(v) || 1, 0.4, 1);
    applySize(W, H);
    return quality;
  },
};

if (!size0.fixed) {
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { const n = viewportSize(); applySize(n.W, n.H); }, 180);
  });
}

if (q.has('lab')) lab.open();
if (q.has('ui') || q.has('panel')) sidebar.toggle(true);

let last = performance.now();
let lastError = '';
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
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
    }
  } finally {
    requestAnimationFrame(frame);
  }
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => { last = performance.now(); });

console.log(
  '%cVALE%c — Tab opens scene controls. C cycles camera: cinematic → first person → third person → drone. ?lab=1 opens the patch bay.',
  'color:#56c7b7;font-weight:bold', 'color:#9fb2a5'
);
