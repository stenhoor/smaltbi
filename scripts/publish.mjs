// Publish a report as a static site from the command line (for git-based workflows and CI).
//   node scripts/publish.mjs <report.json> <out-dir>
// Copies the viewer (dist/), the smaltdb engine (vendor/smaltdb/), the report and every file its
// data steps read. Run `npm run build` first. Local (`local:`) files exist only in a browser:
// publish those reports from the designer instead.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [reportPath, outDir] = process.argv.slice(2);
if (!reportPath || !outDir) {
  console.error('usage: node scripts/publish.mjs <report.json> <out-dir>');
  process.exit(1);
}
const src = resolve(reportPath);
const out = resolve(outDir);
const report = JSON.parse(readFileSync(src, 'utf8'));
if (report.smaltbi !== 1) throw new Error(`${reportPath} is not a smaltbi report`);
for (const f of ['dist/viewer.js', 'dist/report.css', 'vendor/smaltdb/smaltdb.js']) {
  if (!existsSync(join(root, f))) throw new Error(`${f} is missing: run npm install && npm run build`);
}
mkdirSync(out, { recursive: true });
cpSync(join(root, 'dist/viewer.js'), join(out, 'viewer.js'));
cpSync(join(root, 'dist/report.css'), join(out, 'report.css'));
cpSync(join(root, 'vendor/smaltdb'), join(out, 'vendor/smaltdb'), { recursive: true, filter: (p) => !p.endsWith('.map') });
mkdirSync(join(out, 'brand'), { recursive: true });
for (const f of ['favicon-32.svg', 'favicon-16.svg', 'powered-by-smaltbi.svg', 'powered-by-smaltbi-on-dark.svg']) cpSync(join(root, 'brand', f), join(out, 'brand', f));

const used = new Set();
for (const step of report.data?.steps ?? []) {
  for (const key of ['import', 'link', 'sqlFile']) {
    const p = step[key];
    if (typeof p !== 'string' || /^[a-z][a-z0-9+.-]*:/i.test(p)) {
      if (typeof p === 'string' && p.startsWith('local:')) throw new Error(`${p}: local browser files cannot be published from the command line`);
      continue;
    }
    const from = resolve(dirname(src), p);
    let to = relative(dirname(src), from).replace(/\\/g, '/');
    if (to.startsWith('..')) to = 'data/' + basename(from);
    while (used.has(to)) to = to.replace(/(\.\w+)?$/, '-2$1');
    used.add(to);
    mkdirSync(dirname(join(out, to)), { recursive: true });
    cpSync(from, join(out, to));
    step[key] = to;
  }
}
// A theme given as a relative file is inlined.
if (typeof report.theme === 'string' && /\.json$/i.test(report.theme)) report.theme = JSON.parse(readFileSync(resolve(dirname(src), report.theme), 'utf8'));

const esc = (s) => String(s).replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'));
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(
  join(out, 'index.html'),
  `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${esc(report.name)}</title>\n  <link rel="icon" type="image/svg+xml" href="brand/favicon-32.svg">\n  <link rel="stylesheet" href="report.css">\n  <script type="module" src="viewer.js"></script>\n</head>\n<body class="sbv-body">\n  <div id="app"></div>\n  <noscript>This report needs JavaScript.</noscript>\n</body>\n</html>\n`,
);
writeFileSync(join(out, '_headers'), '/*\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: credentialless\n');
console.log(`published ${report.name} → ${out}`);
