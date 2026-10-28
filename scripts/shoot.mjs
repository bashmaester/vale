// Headless screenshot harness for the film.
//
// Art direction in this repo is only trustworthy if it is checked against a
// real render. This script boots the bundled self-contained film in headless
// Chromium, pauses it at one or more timeline points and writes PNGs.
//
// This sandbox has no system Chromium and cannot reach the Playwright/Puppeteer
// download CDNs (only the npm registry is allowlisted), so the browser comes
// from the `@sparticuz/chromium` npm tarball, plus three tiny stub NSS/NSPR
// libraries. See docs/SCREENSHOTS.md for the one-time setup.
//
// Usage:
//   node scripts/shoot.mjs <out-dir> [times=0,6,12,16] [w=1440] [h=810] [extra-query]
// Example:
//   node scripts/shoot.mjs shots/final 0,6,12,16 1440 810
//   node scripts/shoot.mjs shots/lab 7 1440 810 '&log=1'
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const outDir = process.argv[2] || 'shots';
const times = (process.argv[3] || '0,6,12,16').split(',').map(Number);
const W = Number(process.argv[4] || 1440);
const H = Number(process.argv[5] || 810);
const extra = process.argv[6] || '';
const PORT = process.env.VALE_PORT || 8123;
const ORIGIN = process.env.VALE_ORIGIN || `http://127.0.0.1:${PORT}`;

// The browser packages intentionally live outside this repo (they are large),
// so resolve them from the tools dir when they are not in node_modules.
const TOOLS = process.env.VALE_TOOLS_DIR || '/tmp/vale-tools';

async function load(name) {
  try {
    return await import(name);
  } catch {
    const { createRequire } = await import('node:module');
    const { pathToFileURL } = await import('node:url');
    const req = createRequire(path.join(TOOLS, 'package.json'));
    return await import(pathToFileURL(req.resolve(name)).href);
  }
}

const chromium = (await load('@sparticuz/chromium')).default;
const puppeteer = (await load('puppeteer-core')).default;

await mkdir(outDir, { recursive: true });

const args = [
  ...chromium.args,
  '--no-zygote',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--no-default-browser-check',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--ignore-gpu-blocklist',
];

const browser = await puppeteer.launch({
  args,
  executablePath: await chromium.executablePath(),
  headless: true,
  protocolTimeout: 180000,
  env: { ...process.env, LD_LIBRARY_PATH: process.env.VALE_NSS_DIR || '/tmp/nssstub' },
});

const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 400)));

const results = [];
for (const t of times) {
  const url = `${ORIGIN}/index.html?paused=1&t=${t}&w=${W}&h=${H}${extra}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction('window.VALE && window.VALE.renderer', { timeout: 30000 });
  // Give the shader a few frames to compile and the plate to settle.
  await new Promise((r) => setTimeout(r, 1200));
  const info = await page.evaluate(() => {
    const c = document.getElementById('screen');
    const gl = c.getContext('webgl2');
    return { canvas: [c.width, c.height], webgl2: !!gl, hasFilm: !!window.VALE };
  });
  const slug = `${extra ? extra.replace(/[^a-z0-9]+/gi, '') + '-' : ''}`;
  const file = path.join(outDir, `t${String(t).replace('.', '_')}${slug ? '-' + slug.replace(/-$/, '') : ''}.png`);
  await page.screenshot({ path: file });
  results.push({ t, file, ...info });
  console.log('shot', t, JSON.stringify(info), '->', file);
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
