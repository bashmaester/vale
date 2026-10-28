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

// Function replacers, not strings: `String.replace` expands `$&`, `` $` ``,
// `$'` and `$$` inside a *string* replacement. Minified bundles contain
// `$&&` (esbuild names variables `$`), so a string replacement silently
// injects the marker back into the script and the page fails to parse —
// which is exactly how a blank screen ships.
const html = template
  .replace('/*__STYLE__*/', () => css)
  .replace('/*__SCRIPT__*/', () => js);

// Guard: the inline script must parse, and no template marker may survive.
if (html.includes('/*__SCRIPT__*/') || html.includes('/*__STYLE__*/')) {
  throw new Error('build: a template marker survived substitution');
}
try {
  // Compiles without executing: a pure syntax check of the emitted bundle.
  // eslint-disable-next-line no-new-func
  new Function(js);
} catch (err) {
  throw new Error(`build: emitted bundle does not parse — ${err.message}`);
}

await writeFile(src('index.html'), html, 'utf8');
console.log(`Built self-contained index.html (${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB)`);
