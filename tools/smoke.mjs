// Luminance sweep: renders the loop at three viewport sizes and reports how
// much of each frame is dark / mid / bright, plus the LoD tier and tile size.
// The historical failure mode was a 94 % dark film, so this is the guard rail.
//   node tools/smoke.mjs
import './canvas-env.mjs';
const { Scene } = await import('../src/scene.js');

for (const [W, H] of [[1440, 810], [900, 506], [640, 360]]) {
  const s = new Scene(W, H);
  s.cameraController.hudEnabled = false;
  let worst = null;
  for (let t = 0; t < 20; t += 0.5) {
    const { plate } = s.render(t, 1 / 60);
    const d = plate.getContext('2d').getImageData(0, 0, plate.width, plate.height).data;
    let dark = 0, mid = 0, bright = 0;
    for (let i = 0; i < d.length; i += 16) {
      const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (l < 20) dark += 1; else if (l < 80) mid += 1; else bright += 1;
    }
    const n = d.length / 16;
    const stat = {
      t, dark: +((dark / n) * 100).toFixed(1), mid: +((mid / n) * 100).toFixed(1),
      bright: +((bright / n) * 100).toFixed(1), lod: s.lod.level, px: Math.round(s.lod.px),
    };
    if (!worst || stat.dark > worst.dark) worst = stat;
    if (t % 5 === 0) console.log(`${W}x${H}`, JSON.stringify(stat));
  }
  console.log(`${W}x${H}`, 'worst-dark', JSON.stringify(worst));
}
