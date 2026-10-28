// LoD contact sheet: renders the same tile at the three budget levels side by
// side so the procedural degradation can be inspected in one image.
//   node tools/lod.mjs [time] [width]
import './canvas-env.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const { Scene } = await import('../src/scene.js');
const { createCanvas } = await import('@napi-rs/canvas');

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(root, '.shots');
mkdirSync(out, { recursive: true });

const t = Number(process.argv[2] || 9);
const W = Number(process.argv[3] || 720);
const H = Math.round((W * 9) / 16);

const s = new Scene(W, H);
s.cameraController.hudEnabled = false;
const sheet = createCanvas(W * 3, H + 34);
const ox = sheet.getContext('2d');
ox.fillStyle = '#08080a';
ox.fillRect(0, 0, sheet.width, sheet.height);

for (const lod of [0, 1, 2]) {
  s.setParam('lod', lod);
  const { plate } = s.render(t, 1 / 60);
  ox.drawImage(plate, lod * W, 34);
  ox.fillStyle = '#efe9d8';
  ox.font = 'bold 18px sans-serif';
  ox.fillText(`LoD ${lod} (${s.detail.id}) · tile ${Math.round(s.lod.px)} px`, lod * W + 14, 24);
}
const file = resolve(out, 'lod.png');
writeFileSync(file, sheet.toBuffer('image/png'));
console.log(file);
