// Assembles the GitHub Pages site in _site/: the landing page (index.html), the designer
// (designer.html), the viewer, the engine,
// built-in themes and the sample report, plus the sample published as a standalone site in
// _site/sample/. Run after `npm run build`.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '_site');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'designer.html', 'viewer.html']) cpSync(join(root, f), join(out, f));
for (const d of ['dist', 'vendor', 'themes', 'examples', 'brand']) {
  if (!existsSync(join(root, d))) throw new Error(`${d}/ is missing: run npm install && npm run build`);
  cpSync(join(root, d), join(out, d), { recursive: true, filter: (p) => !p.endsWith('.map') });
}
execFileSync(process.execPath, [join(root, 'scripts/publish.mjs'), join(root, 'examples/sales/report.json'), join(out, 'sample')], { stdio: 'inherit' });
writeFileSync(join(out, '.nojekyll'), '');
console.log(`site → ${out}`);
