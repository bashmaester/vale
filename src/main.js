import { ShaderGraph, PRESETS } from './graph.js';
import { Renderer } from './renderer.js';
import { Scene } from './scene.js';
import { Lab } from './lab.js';
import { Sidebar } from './sidebar.js';
import { DURATION } from './timeline.js';
import { clamp } from './math.js';

const q = new URLSearchParams(location.search);
const W = clamp(parseInt(q.get('w') || '1440', 10) || 1440, 640, 2560);
const H = clamp(parseInt(q.get('h') || '810', 10) || 810, 360, 1440);
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

const scene = new Scene(W, H);
scene.setParams(PRESETS[presetName].scene || {});

const canvas = document.getElementById('screen');
const renderer = new Renderer(canvas, graph, W, H);

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
window.VALE = { graph, scene, renderer, lab, sidebar, state, W, H, DURATION };

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
    const shaderTime = scene.timeline.motionT;
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
