// Loads the smaltdb client at run time and points it at its engine worker.
// Ported from smaltui (app/engine.js); part of the shared smalt kit (docs/adr/0003-shared-kit.md).
//
// ?engine=vendor (default)  vendor/smaltdb/ next to the page (copied by `npm install`)
// ?engine=npm | npm@0.8.3   smaltdb from jsDelivr
// ?engine=https://…/dist/   any folder serving smaltdb.js and smaltdb-worker.js
//
// The client is imported dynamically (not bundled), so a published report can swap engines
// without a rebuild, and the smaltbi bundle stays small.
import type { Database, OpenOptions } from 'smaltdb';

export type { Database };

export interface Engine {
  spec: string;
  label: string;
  workerUrl: string;
  open(name: string, options?: Omit<OpenOptions, 'worker'>): Promise<Database>;
}

function baseFor(spec: string, pageBase: string): { base: string; label: string } {
  if (!spec || spec === 'vendor') return { base: new URL('vendor/smaltdb/', pageBase).href, label: 'bundled smaltdb' };
  if (spec === 'npm' || spec.startsWith('npm@')) {
    const version = spec === 'npm' ? 'latest' : spec.slice(4);
    return { base: `https://cdn.jsdelivr.net/npm/smaltdb@${version}/dist/`, label: `smaltdb@${version} (npm)` };
  }
  return { base: new URL(spec.endsWith('/') ? spec : spec + '/', pageBase).href, label: spec };
}

export async function loadEngine(spec = new URLSearchParams(location.search).get('engine') ?? 'vendor', pageBase = document.baseURI): Promise<Engine> {
  let { base, label } = baseFor(spec, pageBase);
  let mod: { open: (name: string, o?: OpenOptions) => Promise<Database> };
  try {
    mod = await import(/* @vite-ignore */ base + 'smaltdb.js');
  } catch (e) {
    if (spec !== 'vendor') throw e;
    console.warn('smaltbi: vendor/smaltdb is missing (run `npm install`); loading smaltdb from jsDelivr.', e);
    spec = 'npm';
    ({ base, label } = baseFor(spec, pageBase));
    mod = await import(/* @vite-ignore */ base + 'smaltdb.js');
  }
  let workerUrl = base + 'smaltdb-worker.js';
  if (new URL(workerUrl).origin !== location.origin) {
    // A worker script must be same-origin: start a cross-origin engine through a blob module.
    workerUrl = URL.createObjectURL(new Blob([`import ${JSON.stringify(workerUrl)};`], { type: 'text/javascript' }));
  }
  return { spec, label, workerUrl, open: (name, options = {}) => mod.open(name, { ...options, worker: workerUrl }) };
}

/** OPFS databases created by smaltdb in this origin. */
export async function listOpfsDatabases(): Promise<string[]> {
  if (!navigator.storage?.getDirectory || !isSecureContext) return [];
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('smaltdb');
    const out: string[] = [];
    for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) if (name.endsWith('.db')) out.push(name.slice(0, -3));
    return out.sort();
  } catch {
    return [];
  }
}
