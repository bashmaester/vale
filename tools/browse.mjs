import puppeteer from 'puppeteer';
const url = process.argv[2] || 'http://127.0.0.1:8000/';
const out = process.argv[3] || '.shots/browser.png';
const wait = Number(process.argv[4] || 4000);
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-unsafe-swiftshader',
         '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1440,810'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 810, deviceScaleFactor: 1 });
page.on('console', (m) => console.log('[console:' + m.type() + ']', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('requestfailed', (r) => console.log('[reqfail]', r.url(), r.failure()?.errorText));
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise((r) => setTimeout(r, wait));
const info = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
  return {
    canvas: c ? { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight } : null,
    gl: !!gl,
    vale: typeof window.VALE,
    err: window.__valeError || null,
  };
});
console.log('info', JSON.stringify(info));
await page.screenshot({ path: out });
await browser.close();
