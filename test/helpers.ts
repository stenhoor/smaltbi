// Test helpers: an async, client-shaped wrapper around smaltdb's synchronous engine, so the
// browser code paths (introspect, runner, applySteps) run unchanged in Node. SQL is smaltql, registered with the
// engine in this process; CSV / JSON import is the @smaltdb/io plugin, as in the browser worker (src/engine/).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Database as EngineDb } from 'smaltdb/engine';
import 'smaltql/register';
import io from '@smaltdb/io';
import external from '@smaltdb/external';
import parquet from '@smaltdb/parquet';
import { importCSV, importJSON } from '@smaltdb/io/client';
import { registerFile } from '@smaltdb/external/client';
import type { Database } from '../src/report/engine.js';
import type { StepIO } from 'smaltkit/manifest';
import type { Report } from '../src/core/types.js';
import { Model } from '../src/core/model.js';
import { introspect } from '../src/data/introspect.js';
import { QueryRunner } from '../src/data/runner.js';

export const root = process.cwd();

const engines = new WeakMap<object, EngineDb>();
const engineOf = (db: object): EngineDb => engines.get(db)!;
const blobText = async (s: unknown) => (typeof s === 'string' ? s : await (s as Blob).text());

/** The plugin helpers for clientDb() databases, in the shape the browser's engine client exports (src/engine/client.ts). */
export const nodeIo: StepIO<Database> = {
  importCSV: async (db, table, src, o) => importCSV(engineOf(db), table, await blobText(src), o as never),
  importJSON: async (db, table, src, o) => importJSON(engineOf(db), table, await blobText(src), o as never),
  registerFile: (db, name, file) => registerFile(engineOf(db), name, file),
};

export function clientDb(): Database {
  const db = EngineDb.openMemory({ plugins: [io, external, parquet] });
  const api = {
    async exec(sql: string, params?: unknown[]) {
      // The async engine calls: statements over external data (linked files, Parquet) need them.
      return params ? db.runAsync(sql, params as never) : (await db.execAsync(sql), { changes: 0, lastInsertRowid: 0 });
    },
    async query(sql: string, params?: unknown[], opts?: { rowMode?: string }) {
      const r = await db.queryAsync(sql, params as never);
      if (opts?.rowMode === 'columnar') {
        const data: Record<string, unknown[]> = {};
        r.columns.forEach((c: string, i: number) => (data[c] = r.rows.map((row: unknown[]) => row[i])));
        return { columns: r.columns, length: r.rows.length, data };
      }
      if (opts?.rowMode === 'array') return Object.assign(r.rows, { columns: r.columns });
      return r.rows.map((row: unknown[]) => Object.fromEntries(r.columns.map((c: string, i: number) => [c, row[i]])));
    },
    async close() {
      db.close();
    },
  };
  engines.set(api, db);
  return api as unknown as Database;
}

export function loadSampleReport(): Report {
  return JSON.parse(readFileSync(join(root, 'examples/sales/report.json'), 'utf8')) as Report;
}

/** The sample report's database, model and runner. */
export async function sampleSession() {
  const report = loadSampleReport();
  const db = clientDb();
  for (const s of report.data.steps ?? []) {
    if ('import' in s) await nodeIo.importCSV(db, s.table, readFileSync(join(root, 'examples/sales', s.import), 'utf8'), { create: true });
  }
  const schema = await introspect(db);
  const model = new Model(schema, report.model);
  return { report, db, schema, model, runner: new QueryRunner(db) };
}
