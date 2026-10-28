// Guarantees the scene is a perfect loop.
//
// The whole film is a pure function of loop time: every drop, every person and
// every vehicle at t = 20 must be exactly where it was at t = 0. This script
// renders the plate at t and t + DURATION (both from a cold scene and after a
// full playback) and compares the PNG bytes. Any tiny drift — an integrated
// particle, a random respawn, a non-integer oscillator frequency — shows up
// immediately.
import './canvas-env.mjs';
import { createHash } from 'node:crypto';
import { Scene } from '../src/scene.js';
import { DURATION } from '../src/timeline.js';

const W = 480, H = 270;
const hash = (buf) => createHash('sha1').update(buf).digest('hex').slice(0, 12);

function frameAt(t) {
  const s = new Scene(W, H);
  s.cameraController.hudEnabled = false;
  return hash(s.render(t, 1 / 60).plate.toBuffer('image/png'));
}

function playedTo(t) {
  const s = new Scene(W, H);
  s.cameraController.hudEnabled = false;
  const step = 1 / 60;
  const n = Math.round(t / step);
  for (let i = 0; i < n; i++) s.render(i * step, step);
  return hash(s.render(t, step).plate.toBuffer('image/png'));
}

const times = [0, 4.5, 11];
let failed = 0;
for (const t of times) {
  const a = frameAt(t);
  const b = frameAt(t + DURATION);
  const c = playedTo(t);
  const d = playedTo(t + DURATION);
  const ok = a === b && c === d;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} t=${t} ${a} vs t=${t + DURATION} ${b}   played ${c} / ${d}`);
}
if (failed) {
  console.error(`determinism check failed: ${failed} of ${times.length} loop points differ`);
  process.exit(1);
}
console.log(`determinism check ok: looping every ${DURATION}s, bit-exact`);
