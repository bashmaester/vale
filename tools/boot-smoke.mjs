// Boot smoke test: executes the *built* index.html bundle in Node with a
// minimal DOM so startup errors (TDZ, missing globals, bad constructor order)
// fail here instead of producing a blank page in the browser.
//   node tools/boot-smoke.mjs ["?finish=raw"|"?cam=fly"|...]
import './canvas-env.mjs';
import { guardContext } from './ctx-guard.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const noop = () => {};
const classes = new Set();

// A genuine @napi-rs/canvas Canvas (so drawImage accepts it) with just enough
// DOM surface for the renderer: no WebGL, so the 2D fallback path runs.
function domCanvas(w = 1440, h = 810) {
  const c = createCanvas(w, h);
  c.setAttribute = noop;
  c.getAttribute = () => '';
  c.addEventListener = noop;
  c.removeEventListener = noop;
  c.replaceWith = noop;
  c.appendChild = noop;
  c.classList = { add: noop, remove: noop, toggle: noop, contains: () => false };
  c.style = {};
  c.dataset = {};
  const getContext = c.getContext.bind(c);
  c.getContext = (type, opts) => (type === 'webgl2' ? null : getContext(type, opts));
  return c;
}
function fakeEl(tag = 'div') {
  const el = {
    tag, style: {}, dataset: {}, children: [], textContent: '', innerHTML: '',
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      toggle: noop, contains: (c) => classes.has(c),
    },
    append: noop, appendChild: noop, removeChild: noop, remove: noop, replaceWith: noop,
    setAttribute: noop, getAttribute: () => null,
    addEventListener: noop, removeEventListener: noop,
    querySelector: (sel) => (String(sel).includes('graph') ? domCanvas(600, 380) : fakeEl()),
    querySelectorAll: () => [],
    focus: noop, click: noop,
  };
  if (tag === 'canvas') return domCanvas();
  return el;
}

// In a browser `window` *is* the global object; mirror that so `window.VALE`
// lands where the test looks for it.
globalThis.addEventListener = globalThis.addEventListener || noop;
globalThis.removeEventListener = globalThis.removeEventListener || noop;
globalThis.window = globalThis;

const screen = domCanvas();
const realCreate = globalThis.document.createElement;
globalThis.document.createElement = (tag) => (tag === 'canvas' ? domCanvas() : realCreate(tag));
const query = process.argv[2] || '';
globalThis.location = { search: query, href: `http://localhost/${query}`, pathname: '/' };
globalThis.document.getElementById = (id) => (id === 'screen' ? screen : fakeEl());
globalThis.document.querySelector = () => fakeEl();
globalThis.document.body = fakeEl();
globalThis.window.document = globalThis.document;

let frameCb = null;
globalThis.requestAnimationFrame = (cb) => { frameCb = cb; return 1; };
globalThis.window.requestAnimationFrame = globalThis.requestAnimationFrame;

const html = readFileSync(resolve(root, 'index.html'), 'utf8');
// Take the last inline script: the template puts a tiny watchdog first and the
// app bundle after it. A greedy match across both would inject `</script>`.
const all = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
const m = all.length ? all[all.length - 1] : null;
if (!m) throw new Error('no inline script found in index.html');
const js = m[1];
const tmp = resolve(root, '.boot-smoke.cjs');
writeFileSync(tmp, js);

let error = null;
process.on('uncaughtException', (e) => { error = e; });

try {
  await import(`file://${tmp}?v=${Date.now()}`);
} catch (e) {
  error = e;
}

if (!error) {
  // Drive a handful of frames through the real render loop.
  try {
    for (let i = 0; i < 6; i++) {
      const cb = frameCb;
      frameCb = null;
      if (!cb) break;
      cb(1000 + i * 16.7);
    }
  } catch (e) {
    error = e;
  }
  if (!error && !globalThis.VALE) error = new Error('window.VALE was never published');
}

if (error) {
  console.error('BOOT FAILED:', error && error.stack ? error.stack : error);
  process.exit(1);
}
const v = globalThis.VALE;

// Second pass: render the loop with browser-strict canvas guards, so a NaN that
// only appears mid-film fails here instead of blanking a browser.
{
  const failures = [];
  guardContext(v.scene.pp.ctx, 'boot plate', failures);
  guardContext(v.scene.fp.ctx, 'boot field', failures);
  for (let t = 0; t < 20; t += 0.5) {
    try {
      v.scene.render(t, 1 / 60);
    } catch (e) {
      console.error('BOOT FAILED (guarded render):', e.message);
      process.exit(1);
    }
  }
}

console.log('boot ok:', JSON.stringify({
  W: v.W, H: v.H, duration: v.DURATION,
  renderer: { fallback: v.renderer.fallback, bypass: !!v.renderer.bypass, gl: !!v.renderer.gl },
  sceneTime: +v.scene.timeline.t.toFixed(2),
}));
