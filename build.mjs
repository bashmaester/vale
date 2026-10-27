import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = (p) => resolve(here, p);

const result = await build({
  entryPoints: [src('src/main.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
  write: false,
  charset: 'utf8',
});

const js = result.outputFiles[0].text
  .replace(/<\/script/gi, '<\\/script');
const css = (await readFile(src('src/style.css'), 'utf8'))
  .replace(/<\/style/gi, '<\\/style');
const template = await readFile(src('src/template.html'), 'utf8');

const html = template
  .replace('/*__STYLE__*/', css)
  .replace('/*__SCRIPT__*/', js);

await writeFile(src('index.html'), html, 'utf8');
console.log(`Built self-contained index.html (${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB)`);
