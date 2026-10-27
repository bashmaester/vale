// Headless shim so the scene modules (which expect a browser) can be rendered
// to PNG in Node via @napi-rs/canvas. Import this module before importing
// anything from src/.
import { createCanvas } from '@napi-rs/canvas';

const noop = () => {};
const fakeEl = () => ({
  style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  append: noop, appendChild: noop, removeChild: noop, remove: noop,
  setAttribute: noop, getAttribute: () => null, addEventListener: noop,
  removeEventListener: noop, querySelector: () => fakeEl(), querySelectorAll: () => [],
  getContext: noop, focus: noop, click: noop,
  textContent: '', innerHTML: '', dataset: {}, children: [],
});

if (!globalThis.document) {
  globalThis.document = {
    createElement(tag) {
      if (tag === 'canvas') {
        const c = createCanvas(2, 2);
        return c;
      }
      return fakeEl();
    },
    createTextNode: () => fakeEl(),
    getElementById: () => null,
    querySelector: () => null,
    body: fakeEl(),
    documentElement: fakeEl(),
    addEventListener: noop,
  };
}
if (!globalThis.window) {
  globalThis.window = {
    addEventListener: noop, removeEventListener: noop,
    devicePixelRatio: 1, innerWidth: 1440, innerHeight: 810,
    location: { search: '' },
    requestAnimationFrame: noop,
  };
}
if (!globalThis.performance) globalThis.performance = { now: () => Date.now() };
if (!globalThis.requestAnimationFrame) globalThis.requestAnimationFrame = noop;
if (!globalThis.navigator) globalThis.navigator = { userAgent: 'node' };

export { createCanvas };
