// Builds the designer and the viewer into dist/ (esbuild; the smaltdb engine is loaded at run
// time from vendor/smaltdb/, not bundled).
//   node scripts/build.mjs            production build
//   node scripts/build.mjs --watch    rebuild on change
//   node scripts/build.mjs --tests    bundle test/*.test.ts for node --test into dist-test/
import { build, context } from 'esbuild';
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

if (args.includes('--tests')) {
  const out = join(root, 'dist-test');
  rmSync(out, { recursive: true, force: true });
  const entries = readdirSync(join(root, 'test')).filter((f) => f.endsWith('.test.ts')).map((f) => join(root, 'test', f));
  await build({ entryPoints: entries, outdir: out, bundle: true, platform: 'node', format: 'esm', target: 'node20', external: ['smaltdb', 'smaltdb/*'], outExtension: { '.js': '.mjs' }, logLevel: 'warning' });
  process.exit(0);
}

const opts = {
  entryPoints: { designer: join(root, 'src/designer/main.ts'), viewer: join(root, 'src/viewer/main.ts') },
  outdir: join(root, 'dist'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  minify: !args.includes('--watch'),
  sourcemap: true,
  legalComments: 'none',
  external: ['smaltdb'],
  logLevel: 'info',
};

function copyStatic() {
  mkdirSync(join(root, 'dist'), { recursive: true });
  for (const f of ['report.css', 'app.css']) cpSync(join(root, 'styles', f), join(root, 'dist', f));
  // What a published report needs, for the in-browser publisher.
  const vendor = join(root, 'vendor/smaltdb');
  const files = [];
  const walk = (d, rel) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p, rel + f + '/');
      else if (!f.endsWith('.map')) files.push(rel + f);
    }
  };
  try {
    walk(vendor, 'vendor/smaltdb/');
  } catch {
    console.warn('vendor/smaltdb missing: run npm install');
  }
  writeFileSync(join(root, 'dist/publish-manifest.json'), JSON.stringify({ viewer: ['dist/viewer.js', 'dist/report.css'], engine: files }, null, 2) + '\n');
}

if (args.includes('--watch')) {
  copyStatic();
  const ctx = await context(opts);
  await ctx.watch();
  console.log('watching…');
} else {
  rmSync(join(root, 'dist'), { recursive: true, force: true });
  await build(opts);
  copyStatic();
}
