// Copies smaltbi's brand assets from a checkout of stenhoor/smalt-brand into brand/.
//   git clone --depth 1 https://github.com/stenhoor/smalt-brand ../smalt-brand
//   node scripts/sync-brand.mjs ../smalt-brand
// smalt-brand is the source of truth (CLAUDE.md, "Cross-repo impact"): never edit brand/ by hand.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(process.argv[2] ?? '../smalt-brand');
const out = join(root, 'brand');
const files = {
  'logos/smaltbi/lockup.svg': 'lockup.svg',
  'logos/smaltbi/lockup-on-dark.svg': 'lockup-on-dark.svg',
  'logos/smaltbi/wordmark.svg': 'wordmark.svg',
  'logos/smaltbi/wordmark-on-dark.svg': 'wordmark-on-dark.svg',
  'logos/smaltbi/scatter-mark.svg': 'scatter-mark.svg',
  'logos/smaltbi/scatter-mark-on-dark.svg': 'scatter-mark-on-dark.svg',
  'logos/smaltbi/app-icon.svg': 'app-icon.svg',
  'logos/smaltbi/favicon-16.svg': 'favicon-16.svg',
  'logos/smaltbi/favicon-32.svg': 'favicon-32.svg',
  'badges/powered-by-smaltbi.svg': 'powered-by-smaltbi.svg',
  'badges/powered-by-smaltbi-on-dark.svg': 'powered-by-smaltbi-on-dark.svg',
  'badges/powered-by-smaltdb.svg': 'powered-by-smaltdb.svg',
  'badges/powered-by-smaltdb-on-dark.svg': 'powered-by-smaltdb-on-dark.svg',
  'tokens/tokens.json': 'tokens.json',
};
mkdirSync(out, { recursive: true });
for (const [from, to] of Object.entries(files)) copyFileSync(join(src, from), join(out, to));
let commit = null;
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
} catch {}
writeFileSync(join(out, 'SOURCE.json'), JSON.stringify({ repo: 'stenhoor/smalt-brand', commit, files }, null, 2) + '\n');
console.log(`brand/: ${Object.keys(files).length} files from ${src}${commit ? ' @ ' + commit.slice(0, 7) : ''}`);
console.log('Now update themes/smalt.theme.json and styles/app.css if tokens.json changed.');
