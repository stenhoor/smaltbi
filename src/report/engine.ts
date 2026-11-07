// smaltbi's engine settings for smaltkit's loader (smaltkit/engine).
//
// ?engine=vendor (default)  vendor/smaltdb/ next to the page: smaltdb with smaltql and the io, external and Parquet
//                           plugins, built from src/engine/ on `npm install` (the packages are pinned in packed.json)
// ?engine=https://…/        any folder with a smaltdb.js and smaltdb-worker.js built the same way
//
// npm engines are off (`npm: false`): npm has only smaltdb 0.8.3, which has SQL built in and the older client API.
// The client is imported at run time (not bundled), so a published report can swap engines without a rebuild.
import * as kit from 'smaltkit/engine';
import type * as ClientModule from '../engine/client.js';

export type Database = kit.Database;
/** vendor/smaltdb/smaltdb.js: smaltql's open() and the plugins' client helpers (src/engine/client.ts). */
export type Client = typeof ClientModule;

export interface Engine extends kit.Engine {
  client: Client;
}

export async function loadEngine(spec: string = kit.engineSpec()): Promise<Engine> {
  const engine = await kit.loadEngine(spec, { vendorUrl: 'vendor/smaltdb/', appName: 'smaltbi', npm: false });
  return { ...engine, label: engine.spec === 'vendor' ? 'smaltdb · smaltql' : engine.label, client: engine.module as unknown as Client };
}

/** Names of the OPFS databases smaltdb keeps in this origin. */
export async function listOpfsDatabases(): Promise<string[]> {
  return (await kit.listOpfsDatabases()).map((d) => d.name).sort();
}
