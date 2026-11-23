// Writes the visual types' reference pages (docs/reference/visuals/) from the visual registry (src/docs/visuals.ts).
// Run after changing a visual's roles or options; test/docs.test.ts fails while the pages are out of date.
//   npm run docs:visuals
import { build } from 'esbuild';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = join(root, '.cache', 'docs-visuals.mjs');
mkdirSync(dirname(tmp), { recursive: true });
await build({ entryPoints: [join(root, 'src/docs/visuals.ts')], outfile: tmp, bundle: true, platform: 'node', format: 'esm', logLevel: 'warning' });
const { visualDocs } = await import(pathToFileURL(tmp).href);
const out = join(root, 'docs/reference/visuals');
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (f.endsWith('.md')) rmSync(join(out, f));
const files = visualDocs();
for (const [name, text] of files) writeFileSync(join(out, name), text);
console.log(`docs/reference/visuals: ${files.size} pages`);
