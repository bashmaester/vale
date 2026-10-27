// Render one or more stills of the 2D ink plate without a browser.
//
//   node tools/shot.mjs --t 3,7,11 --out .shots
//
// This is the visual-validation loop that was missing from earlier sessions.
// It renders the actual scene modules into a real Canvas2D implementation and
// writes PNGs, so composition / density / line weight can be judged directly.
import './canvas-env.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const flag = (name) => args.includes(`--${name}`);

const W = parseInt(arg('w', '1440'), 10);
const H = parseInt(arg('h', '810'), 10);
const times = String(arg('t', '3,7,11,15,19')).split(',').map(Number);
const outDir = resolve(arg('out', '.shots'));
const prefix = arg('prefix', 'plate');

const { setPalette } = await import('../src/palette.js');
const pal = arg('palette', null);
if (pal) setPalette(pal);
const { Scene } = await import('../src/scene.js');
const { Timeline } = await import('../src/timeline.js');
const { createCanvas } = await import('./canvas-env.mjs');

mkdirSync(outDir, { recursive: true });

const scene = new Scene(W, H);
scene.cameraController.hudEnabled = false;

// --set caseFrame=1,walls=3 — apply scene params before rendering.
const setArg = arg('set', null);
if (setArg) {
  for (const kv of String(setArg).split(',')) {
    const [k, v] = kv.split('=');
    if (k) scene.setParam(k.trim(), Number(v));
  }
}

// --layout row|corner|block|yard — apply a neighbour layout preset.
const layoutArg = arg('layout', null);
if (layoutArg) {
  const i = Scene.LAYOUTS.findIndex((l) => l.id === layoutArg);
  if (i >= 0) scene.applyLayout(i);
}

// Optional camera override for framing experiments:
//   --eye 9,13,46 --target -4,3,-1 --fov 36
const eyeArg = arg('eye', null);
if (eyeArg) {
  const [ex, ey, ez] = eyeArg.split(',').map(Number);
  const [tx, ty, tz] = String(arg('target', '-4,3,-1')).split(',').map(Number);
  const fov = Number(arg('fov', '36'));
  scene.cameraRig.update = () => {
    scene.cameraRig.camera.set({ x: ex, y: ey, z: ez }, { x: tx, y: ty, z: tz }, fov, 0);
    return scene.cameraRig.camera;
  };
  scene.cameraController.setMode = () => {};
}

// A tiny canvas stand-in for the WebGL finish: the ink plate is what we are
// judging. A separate preview page shows the shader finish in a browser.
const out = createCanvas(W, H);
const octx = out.getContext('2d');

for (const t of times) {
  const { plate } = scene.render(t, 1 / 60);
  octx.drawImage(plate, 0, 0);
  const file = resolve(outDir, `${prefix}-${String(t).replace('.', '_')}.png`);
  writeFileSync(file, out.toBuffer('image/png'));
  console.log(file);
}
