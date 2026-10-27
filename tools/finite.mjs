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

const METHODS = [
  'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo',
  'ellipse', 'rect', 'fillRect', 'strokeRect', 'clearRect', 'translate',
  'scale', 'rotate', 'setTransform', 'createLinearGradient',
  'createRadialGradient', 'createPattern', 'drawImage', 'putImageData', 'setLineDash',
];

// Radii must also be non-negative: the browser throws IndexSizeError for a
// negative radius even when the value is finite.
const RADIUS_ARGS = {
  arc: [2], arcTo: [4], ellipse: [2, 3],
  createRadialGradient: [2, 5],
};

function guard(ctx, label, failures) {
  for (const name of METHODS) {
    const orig = ctx[name];
    if (typeof orig !== 'function') continue;
    ctx[name] = function (...args) {
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (typeof a === 'number' && !Number.isFinite(a)) {
          const stack = new Error().stack.split('\n').slice(2, 5).join('\n');
          failures.push(`${label}.${name} arg[${i}] = ${a}\n${stack}`);
          throw new Error(`non-finite argument\n${failures[failures.length - 1]}`);
        }
      }
      const radiusIdx = RADIUS_ARGS[name] || [];
      for (const i of radiusIdx) {
        if (typeof args[i] === 'number' && args[i] < 0) {
          const stack = new Error().stack.split('\n').slice(2, 5).join('\n');
          failures.push(`${label}.${name} arg[${i}] radius < 0 (${args[i]})\n${stack}`);
          throw new Error(`negative radius\n${failures[failures.length - 1]}`);
        }
      }
      return orig.apply(ctx, args);
    };
  }
}

let bad = 0;
for (const [W, H] of [[1440, 810], [900, 506], [640, 360]]) {
  const scene = new Scene(W, H);
  scene.cameraController.hudEnabled = false;
  const failures = [];
  guard(scene.pp.ctx, `${W}x${H} plate`, failures);
  guard(scene.fp.ctx, `${W}x${H} field`, failures);
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
