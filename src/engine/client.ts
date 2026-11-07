// smaltbi's engine client (bundled into vendor/smaltdb/smaltdb.js by scripts/vendor-smaltdb.mjs and loaded at run
// time by src/kit/engine.ts). `open()` is smaltql's: a smaltdb database whose worker reads SQL. The worker is
// smaltbi's own (src/engine/worker.ts), with the plugins; their client helpers are attached to the database, so the
// app calls db.importCSV(...) as it did when they were part of smaltdb.
import { open as openSql, type OpenOptions } from 'smaltql';
import { exportCSV, importCSV, importJSON } from '@smaltdb/io/client';
import { registerFile } from '@smaltdb/external/client';

export async function open(name: string, options: OpenOptions = {}) {
  const db = await openSql(name, options);
  return Object.assign(db, {
    importCSV: (table: string, source: Parameters<typeof importCSV>[2], opts?: Parameters<typeof importCSV>[3]) => importCSV(db, table, source, opts),
    importJSON: (table: string, source: Parameters<typeof importJSON>[2], opts?: Parameters<typeof importJSON>[3]) => importJSON(db, table, source, opts),
    exportCSV: (query: string, params?: Parameters<typeof exportCSV>[2], opts?: Parameters<typeof exportCSV>[3]) => exportCSV(db, query, params, opts),
    registerFile: (fileName: string, file: Parameters<typeof registerFile>[2]) => registerFile(db, fileName, file),
  });
}

export type Database = Awaited<ReturnType<typeof open>>;
