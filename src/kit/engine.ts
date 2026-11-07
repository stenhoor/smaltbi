// Loads the smaltdb client at run time and points it at its engine worker.
// Ported from smaltui (app/engine.js); part of the shared smalt kit (docs/adr/0003-shared-kit.md).
//
// ?engine=vendor (default)  vendor/smaltdb/ next to the page (built by `npm install`: smaltdb with smaltql and the
//                           plugins, from src/engine/)
// ?engine=https://…/        any folder serving a smaltdb.js and smaltdb-worker.js built the same way
//
// The client is imported dynamically (not bundled), so a published report can swap engines
// without a rebuild, and the smaltbi bundle stays small. (The npm option is gone: smaltdb 0.9 has no SQL of its own,
// and smaltql and the plugins are not on npm yet.)
import type { OpenOptions } from 'smaltdb';
import type { Database } from '../engine/client.js';

export type { Database };

export interface Engine {
  spec: string;
  label: string;
  workerUrl: string;
  open(name: string, options?: Omit<OpenOptions, 'worker'>): Promise<Database>;
}

function baseFor(spec: string, pageBase: string): { base: string; label: string } {
  if (!spec || spec === 'vendor') return { base: new URL('vendor/smaltdb/', pageBase).href, label: 'smaltdb · smaltql' };
  return { base: new URL(spec.endsWith('/') ? spec : spec + '/', pageBase).href, label: spec };
}

export async function loadEngine(spec = new URLSearchParams(location.search).get('engine') ?? 'vendor', pageBase = document.baseURI): Promise<Engine> {
  const { base, label } = baseFor(spec, pageBase);
  let mod: { open: (name: string, o?: OpenOptions) => Promise<Database> };
  try {
    mod = await import(/* @vite-ignore */ base + 'smaltdb.js');
  } catch (e) {
    throw new Error(`cannot load the engine from ${base}${spec === 'vendor' ? ' (run `npm install`)' : ''}: ${(e as Error).message}`);
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
