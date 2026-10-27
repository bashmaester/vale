// Browser-strict Canvas2D guard for headless runs.
//
// @napi-rs/canvas silently coerces NaN and negative radii; every browser throws
// (TypeError for non-finite, IndexSizeError for a negative radius) and the frame
// dies. This wraps a 2D context so those arguments fail loudly in Node instead
// — which is how a blank page gets caught before it ships.
//
//   import { guardContext } from './ctx-guard.mjs';

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

export function guardContext(ctx, label, failures) {
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

