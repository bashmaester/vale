import { ShaderGraph, PRESETS } from './graph.js';
import { Renderer } from './renderer.js';
import { Scene } from './scene.js';
import { Lab } from './lab.js';
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
const lab = new Lab({ graph, scene, renderer, state });

if (q.has('lab')) lab.open();

// Expose a small runtime handle for console experimentation.
window.VALE = { graph, scene, renderer, lab, state, W, H, DURATION };

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (!state.paused) state.time += dt * state.speed;
  const t = state.time;
  const { plate, field } = scene.render(t);
  const shaderTime = ((t % DURATION) + DURATION) % DURATION;
  renderer.render(plate, field, shaderTime);
  lab.render(t, scene.timeline);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => { last = performance.now(); });

console.log(
  '%cVALE%c — silent 20s 3D→2D print film. Append ?lab=1 for the node patch bay.',
  'color:#56c7b7;font-weight:bold', 'color:#9fb2a5'
);
