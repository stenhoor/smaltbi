// Publish a report as a static site: viewer + engine + report.json + data files, as one ZIP.
// Unzip it onto any static host (GitHub Pages, Netlify, S3, a file share behind a web server)
// and the report runs entirely in each visitor's browser.
import type { DataStep, Report } from '../core/types.js';
import { quoteIdent } from '../core/sql.js';
import { BUILTIN_THEMES } from '../theme/theme.js';
import { checkIntegrity } from '../plugins/loader.js';
import { referencedFiles, type FileStore } from 'smaltkit/manifest';
import { zip, type ZipEntry } from '../kit/zip.js';
import type { ReportSession } from '../report/session.js';

export interface PublishOptions {
  /** Where the smaltbi app (dist/, vendor/) is served from. */
  appBase: string;
  /** Copy the current tables into the bundle as CSV instead of the report's own data steps. */
  snapshot?: boolean;
  files?: FileStore;
  log?: (text: string) => void;
}

export const VIEWER_HTML = (title: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</title>
  <link rel="icon" type="image/svg+xml" href="brand/favicon-32.svg">
  <link rel="stylesheet" href="report.css">
  <script type="module" src="viewer.js"></script>
</head>
<body class="sbv-body">
  <div id="app"></div>
  <noscript>This report needs JavaScript.</noscript>
</body>
</html>
`;

export const HEADERS_FILE = `# Netlify / Cloudflare Pages: cross-origin isolation lets smaltdb use parallel readers.
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: credentialless
`;

export const README = (name: string) => `${name}
${'='.repeat(name.length)}

A smaltbi report, published as a static site. Serve this folder from any static web host
(GitHub Pages, Netlify, Cloudflare Pages, S3, nginx, …) and open index.html.

Opening index.html straight from disk (file://) does not work: browsers block module workers and
data fetches there. For a quick local look:  npx serve .   or   python3 -m http.server

Files:
  index.html, viewer.js, report.css   the viewer
  vendor/smaltdb/                     the smaltdb engine (runs in a Web Worker)
  report.json                         the report: data steps, model, pages, theme
  brand/                              favicon, the smaltbi mark and the "Powered by smaltbi" badge
  data/                               the data files the report loads
  plugins/                            the report's plugins, if it has any
`;

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`cannot fetch ${url}: HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

/** Build the published file set. */
export async function publishEntries(session: ReportSession, opts: PublishOptions): Promise<ZipEntry[]> {
  const log = opts.log ?? (() => {});
  const report = structuredClone(session.report) as Report;
  const entries: ZipEntry[] = [];
  const manifest = (await (await fetch(new URL('dist/publish-manifest.json', opts.appBase))).json()) as { viewer: string[]; engine: string[]; brand?: string[] };
  log('viewer');
  for (const f of manifest.viewer) entries.push({ path: f.replace(/^dist\//, ''), data: await fetchBytes(new URL(f, opts.appBase).href) });
  for (const f of manifest.brand ?? []) entries.push({ path: f, data: await fetchBytes(new URL(f, opts.appBase).href) });
  log('engine');
  for (const f of manifest.engine) entries.push({ path: f, data: await fetchBytes(new URL(f, opts.appBase).href) });

  // Theme: built-in names stay names (the viewer bundles them); anything else is inlined.
  if (typeof report.theme === 'string' && !BUILTIN_THEMES[report.theme.toLowerCase()]) report.theme = session.theme;

  const snapshot = opts.snapshot ?? (!(report.data.steps ?? []).length || report.data.init === 'none');
  if (snapshot) {
    log('snapshot of the data');
    const tables = (await session.db.query("SELECT table_name AS name FROM information_schema.tables WHERE table_type IN ('BASE TABLE', 'MATERIALIZED VIEW', 'EXTERNAL') AND table_name NOT LIKE 'sqlite_%'")) as { name: string }[];
    const steps: DataStep[] = [];
    for (const t of tables) {
      const csv = await session.engine.client.exportCSV(session.db, `SELECT * FROM ${quoteIdent(t.name)}`);
      const path = `data/${t.name.replace(/[^\w.-]+/g, '_')}.csv`;
      entries.push({ path, data: csv });
      steps.push({ import: path, table: t.name, format: 'csv' });
    }
    report.data = { database: { name: report.data.database?.name ?? 'report', storage: 'memory' }, steps };
  } else {
    // Copy every file the steps read; rewrite paths that leave the folder or point at local files.
    const steps: DataStep[] = [];
    const used = new Set<string>();
    const target = (p: string) => {
      let name = `data/${p.split(/[\\/]/).pop()!.replace(/[^\w.-]+/g, '_')}`;
      for (let i = 2; used.has(name); i++) name = name.replace(/(\.\w+)?$/, `-${i}$1`);
      used.add(name);
      return name;
    };
    const local = new Set(referencedFiles(report.data.steps ?? []));
    for (const step of report.data.steps ?? []) {
      const s = { ...step } as Record<string, unknown>;
      for (const key of ['import', 'link', 'sqlFile']) {
        const p = s[key];
        if (typeof p !== 'string') continue;
        if (p.startsWith('local:')) {
          const blob = await opts.files?.get(p.slice(6));
          if (!blob) throw new Error(`the local file ${p.slice(6)} is not available: import it again before publishing`);
          const path = target(p.slice(6));
          entries.push({ path, data: new Uint8Array(await blob.arrayBuffer()) });
          s[key] = path;
        } else if (local.has(p)) {
          log(p);
          const path = /^(\.\.|\/)/.test(p) ? target(p) : p.replace(/^\.\//, '');
          if (!used.has(path)) used.add(path);
          entries.push({ path, data: await fetchBytes(new URL(p, session.base).href) });
          s[key] = path;
        }
      }
      steps.push(s as DataStep);
    }
    report.data = { ...report.data, steps, database: { name: report.data.database?.name ?? 'report', storage: report.data.database?.storage ?? 'memory' } };
  }
  // Plugins are copied into the site (ADR 0008): the published report then loads them from its own site, so readers
  // are not asked, and it keeps working if the plugin's host goes away. The hash is checked on the way.
  if (report.plugins?.length) {
    const names = new Set<string>();
    report.plugins = await Promise.all(
      report.plugins.map(async (ref) => {
        const url = new URL(ref.url, session.base).href;
        log(url);
        const bytes = await fetchBytes(url);
        if (!(await checkIntegrity(bytes.slice().buffer, ref.integrity))) throw new Error(`the plugin ${url} no longer matches its integrity hash: add it again (File → Plugins…)`);
        let name = `plugins/${(new URL(url).pathname.split('/').pop() || 'plugin.js').replace(/[^\w.-]+/g, '_')}`;
        for (let i = 2; names.has(name); i++) name = name.replace(/(\.\w+)?$/, `-${i}$1`);
        names.add(name);
        entries.push({ path: name, data: bytes });
        return { ...ref, url: name };
      }),
    );
  }
  entries.push({ path: 'report.json', data: JSON.stringify(report, null, 2) + '\n' });
  entries.push({ path: 'index.html', data: VIEWER_HTML(report.name) });
  entries.push({ path: '_headers', data: HEADERS_FILE });
  entries.push({ path: 'README.txt', data: README(report.name) });
  // De-duplicate (later entries win).
  const byPath = new Map(entries.map((e) => [e.path, e]));
  return [...byPath.values()];
}

export async function publishZip(session: ReportSession, opts: PublishOptions): Promise<Blob> {
  return zip(await publishEntries(session, opts));
}
