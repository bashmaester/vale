// Numeric sanity gate.
//
// A NaN reaching a Canvas2D call does not throw in @napi-rs/canvas (it coerces
// to 0), but a browser throws `TypeError: ... non-finite` and the frame dies —
// which is exactly how a single bad argument can blank the whole page while
// every headless still still looks fine. This tool wraps the 2D contexts and
// fails on the first non-finite numeric argument anywhere in the loop.
//
//   node tools/finite.mjs
import './canvas-env.mjs';
const { Scene } = await import('../src/scene.js');

import { guardContext } from './ctx-guard.mjs';

let bad = 0;
for (const [W, H] of [[1440, 810], [900, 506], [640, 360]]) {
  const scene = new Scene(W, H);
  scene.cameraController.hudEnabled = false;
  const failures = [];
  guardContext(scene.pp.ctx, `${W}x${H} plate`, failures);
  guardContext(scene.fp.ctx, `${W}x${H} field`, failures);
  for (let t = 0; t < 20; t += 0.5) {
    try {
      scene.render(t, 1 / 60);
    } catch (err) {
      console.error(`t=${t} ${W}x${H}: ${err.message}`);
      bad += 1;
      break;
    }
  }
}
if (bad) {
  console.error(`finite check failed (${bad} viewport(s))`);
  process.exit(1);
}
console.log('finite check ok: no non-finite geometry across the loop');
