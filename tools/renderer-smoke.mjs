// Strict WebGL2 stand-in: enough of the API to boot the renderer, and strict
// enough about arguments to catch the class of bug that blanked the page after
// the Turn 11 refactor — the quad asking an undefined program where `a_pos`
// lives. A permissive stub would have said "fine"; this one throws, like a real
// context does.
//
//   node tools/renderer-smoke.mjs
//
// Exits non-zero if the renderer throws, if it fails to reach the GPU path, or
// if a black pass does not fall back to the 2D composite.

import './canvas-env.mjs';

const { Renderer } = await import('../src/renderer.js');
const { ShaderGraph } = await import('../src/graph.js');
const { createCanvas } = await import('./canvas-env.mjs');

import { makeGL, fakeCanvas } from './strict-gl.mjs';

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
};

const W = 960, H = 540;
const plate = createCanvas(W, H);
const pctx = plate.getContext('2d');
pctx.fillStyle = '#efe9d8';
pctx.fillRect(0, 0, W, H);           // the health check needs ink in the plate
const field = createCanvas(W, H);

// --- healthy pass ----------------------------------------------------------
{
  const graph = new ShaderGraph();
  graph.applyPreset('linocut');
  const gl = makeGL();
  let r;
  try {
    r = new Renderer(fakeCanvas(gl), graph, W, H);
    for (let i = 0; i < 5; i++) r.render(plate, field, i * 0.1);
  } catch (e) {
    check('renderer boots and draws', false, e.message);
  }
  if (r) {
    check('renderer boots and draws', true);
    check('stays on the GPU path', r.backend === 'webgl2', r.backend);
    check('uploads both textures', gl.state.uploads >= 4, `${gl.state.uploads} uploads`);
    check('draws the quad', gl.state.draws >= 3, `${gl.state.draws} draws`);
    // Regression guard: the quad must be bound to a real program's attribute
    // slot. Building it before the program exists threw on real GL and blanked
    // the page.
    check('binds a_pos to the program', r.attrPos === 0, String(r.attrPos));

    // Switching a node to 0 must rebuild the program, not throw.
    graph.setParam('hatch', 'strength', 0);
    try {
      for (let i = 0; i < 3; i++) r.render(plate, field, i * 0.1);
      check('rebuilds after a node is stripped', r.backend === 'webgl2');
    } catch (e) {
      check('rebuilds after a node is stripped', false, e.message);
    }

    // Every node off: the shader must still compile and draw.
    graph.applyPreset('plate');
    try {
      for (let i = 0; i < 3; i++) r.render(plate, field, i * 0.1);
      check('renders with every node stripped', r.backend === 'webgl2');
    } catch (e) {
      check('renders with every node stripped', false, e.message);
    }
  }
}

// --- dead pass falls back --------------------------------------------------
{
  const graph = new ShaderGraph();
  graph.applyPreset('linocut');
  const gl = makeGL({ black: true });
  let r;
  try {
    r = new Renderer(fakeCanvas(gl), graph, W, H);
    for (let i = 0; i < 5; i++) r.render(plate, field, i * 0.1);
  } catch (e) {
    check('dead GPU pass does not throw', false, e.message);
  }
  if (r) {
    check('dead GPU pass does not throw', true);
    check('falls back to the 2D composite', r.fallback === true, r.backend);
  }
}

console.log(failures ? `renderer smoke: ${failures} failure(s)` : 'renderer smoke ok');
process.exit(failures ? 1 : 0);
