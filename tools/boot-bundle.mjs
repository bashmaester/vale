// Boot the *built* bundle in Node with a DOM shim, exactly as the browser would
// run it: extract the inline script from index.html, evaluate it, then drive a
// few frames of the animation loop.
//
// This exists because the blank-page bug of Turn 11 lived in the part of the
// renderer that only runs with a real canvas: module evaluation never finished,
// yet every existing test passed. `node tools/boot-smoke.mjs` now fails loudly in
// that situation.
//
//   node tools/boot-smoke.mjs            # uses ./index.html
//   node tools/boot-smoke.mjs --keep     # leaves the extracted script behind

import './canvas-env.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createCanvas } from './canvas-env.mjs';
import { makeGL } from './strict-gl.mjs';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');

const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (scripts.length === 0) {
  console.error('BOOT FAILED: index.html has no inline script');
  process.exit(1);
}
const bundle = scripts.join('\n;\n');

// --- DOM shim --------------------------------------------------------------
const frames = [];
const errors = [];
const logs = [];

function fakeCanvasEl(w = 640, h = 360) {
  const c = createCanvas(w, h);
  c.id = 'screen';
  c.className = 'screen';
  c.style = {};
  c.setAttribute = () => {};
  c.getAttribute = () => '';
  c.replaceWith = () => {};
  c.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  c.addEventListener = () => {};
  c.removeEventListener = () => {};
  return c;
}

if (!globalThis.location) globalThis.location = { search: '', href: 'http://localhost/' };
globalThis.location.search = process.argv.includes('--query')
  ? process.argv[process.argv.indexOf('--query') + 1]
  : '';

const body = {
  className: '',
  classList: {
    add() {}, remove() {}, toggle() {}, contains: () => false,
  },
  appendChild() {}, removeChild() {}, addEventListener() {}, setAttribute() {},
};

const document = globalThis.document;
document.body = body;
document.documentElement = { style: {}, classList: body.classList };
// --gl runs the boot through the real WebGL path against the strict stand-in,
// which is what catches "it works headless but the page is black".
const useGL = process.argv.includes('--gl');
if (useGL) {
  for (const el of [document.createElement('canvas'), document.createElement('canvas')]) {
    void el;
  }
}
const screen = fakeCanvasEl();
if (useGL) {
  const gl = makeGL();
  const realGet = screen.getContext ? screen.getContext.bind(screen) : null;
  screen.getContext = (type) => (type === 'webgl2' ? gl : (realGet ? realGet(type) : null));
  globalThis.__strictGL = gl;
}
document.getElementById = (id) => (id === 'screen' ? screen : null);
document.querySelector = () => null;

globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = () => true;
if (!globalThis.ErrorEvent) {
  globalThis.ErrorEvent = class ErrorEvent extends Error {
    constructor(type, init = {}) { super(init.message || ''); this.type = type; }
  };
}
globalThis.window = globalThis.window || globalThis;
globalThis.window.addEventListener = () => {};

let raf = null;
globalThis.requestAnimationFrame = (fn) => { raf = fn; return 1; };
globalThis.cancelAnimationFrame = () => {};
globalThis.performance = globalThis.performance || { now: () => Date.now() };
if (!globalThis.window) globalThis.window = globalThis;
globalThis.window.addEventListener = () => {};
globalThis.window.removeEventListener = () => {};
globalThis.window.devicePixelRatio = 1;
globalThis.window.innerWidth = 1440;
globalThis.window.innerHeight = 810;

const realError = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ')); };

// --- run -------------------------------------------------------------------
const file = resolve(root, '.boot-smoke.cjs');
writeFileSync(file, bundle);
try {
  await import(`file://${file}?t=${Date.now()}`);
} catch (e) {
  console.error = realError;
  console.error('BOOT FAILED:', e && e.message);
  console.error(e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : '');
  process.exit(1);
}

// Drive the loop. A blank page in the browser is usually "the module died", but
// a frame that throws every time looks identical, so run a handful.
try {
  let t = 0;
  for (let i = 0; i < 6 && raf; i++) {
    const fn = raf;
    raf = null;
    t += 16.7;
    fn(t);
  }
} catch (e) {
  console.error = realError;
  console.error('BOOT FAILED (frame):', e && e.message);
  process.exit(1);
}
console.error = realError;

const V = globalThis.VALE || (globalThis.window && globalThis.window.VALE);
const problems = [];
if (!V) problems.push('window.VALE was never set (module did not finish)');
if (errors.length) problems.push(...errors.slice(0, 3));
if (globalThis.__valeError) problems.push(`frame: ${globalThis.__valeError}`);

if (problems.length) {
  console.error('BOOT FAILED:');
  for (const p of problems) console.error('  -', p);
  process.exit(1);
}

const scale = V.scale || {};
console.log(
  `boot ok: ${V.W}x${V.H} @${Math.round((scale.quality || 1) * 100)}% ` +
  `camera=${V.scene.cameraController.mode} backend=${V.renderer.backend}` +
  (useGL ? ` gl draws=${globalThis.__strictGL.state.draws}` : '')
);
if (useGL) {
  const gl = globalThis.__strictGL;
  if (V.renderer.backend !== 'webgl2') { console.error('BOOT FAILED: the GPU path did not survive boot'); process.exit(1); }
  if (gl.state.draws < 1) { console.error('BOOT FAILED: nothing was drawn'); process.exit(1); }
}
