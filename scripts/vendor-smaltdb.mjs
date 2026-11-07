// Builds the engine the page loads by default into vendor/smaltdb/ (same-origin, so it works offline and under
// cross-origin isolation): smaltdb with SQL (smaltql) and the plugins the data steps use, from src/engine/.
//   vendor/smaltdb/smaltdb.js          the client: smaltql's open(), plus the plugins' client helpers
//   vendor/smaltdb/smaltdb-worker.js   the engine worker, with smaltql and the plugins registered (chunks/ beside it)
//
//   node scripts/vendor-smaltdb.mjs     runs on `npm install`, after scripts/fetch-packed.mjs
//
// The packages come from packed.json (pinned commits, until smaltdb 0.9, smaltql and the plugins are on npm):
// to move to newer ones, change the pins there and run `npm install`. `node scripts/fetch-packed.mjs --local
// smaltql=../smaltql` builds one from a local checkout instead.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'vendor', 'smaltdb');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const common = { bundle: true, format: 'esm', target: 'es2022', platform: 'browser', minify: true, legalComments: 'none', logLevel: 'warning', sourcemap: true };
await Promise.all([
  build({ ...common, entryPoints: [join(root, 'src/engine/client.ts')], outfile: join(out, 'smaltdb.js') }),
  build({ ...common, entryPoints: { 'smaltdb-worker': join(root, 'src/engine/worker.ts') }, outdir: out, splitting: true, chunkNames: 'chunks/[name]-[hash]' }),
]);

const pins = JSON.parse(readFileSync(join(root, 'packed.json'), 'utf8'));
const versions = {};
for (const name of Object.keys(pins)) {
  const pkg = JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8'));
  versions[name] = { version: pkg.version, commit: pins[name].ref };
}
writeFileSync(join(out, 'VERSION.json'), JSON.stringify({ source: 'packed', packages: versions }, null, 2) + '\n');
console.log(`vendor/smaltdb: ${Object.entries(versions).map(([n, v]) => `${n}@${v.version} (${v.commit.slice(0, 7)})`).join(', ')}`);
