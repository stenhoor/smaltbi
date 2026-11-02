// Data steps: build the report's database from files, URLs, inline rows and SQL.
// The step format is the smaltui environment manifest's, so a smaltui environment can be used as a
// report's data section unchanged (and vice versa). Shared-kit candidate.
import type { DataSpec, DataStep, FileFormat } from '../core/types.js';
import { quoteIdent, quoteLiteral } from '../core/sql.js';
import { normalizeDataUrl } from '../kit/urls.js';
import type { Database } from '../kit/engine.js';

export type Log = (level: 'ok' | 'warn' | 'info', text: string) => void;

/** Local files (dropped or picked by the user), addressed in steps as `local:<name>`. */
export interface FileStore {
  get(name: string): Promise<Blob | null>;
}

export async function applySteps(db: Database, data: DataSpec, base: string, log: Log = () => {}, files?: FileStore): Promise<void> {
  const resolve = (p: string) => normalizeDataUrl(new URL(p, base).href).url;
  const fetchBlob = async (p: string): Promise<Blob> => {
    if (p.startsWith('local:')) {
      const b = await files?.get(p.slice(6));
      if (!b) throw new Error(`the local file ${p.slice(6)} is not available in this browser: import it again`);
      return b;
    }
    const url = resolve(p);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`cannot fetch ${url}: HTTP ${r.status}`);
    return r.blob();
  };
  let n = 0;
  for (const step of data.steps ?? []) {
    n++;
    const s = step as Record<string, unknown>;
    if ('sql' in step || 'sqlFile' in step) {
      const sql = 'sql' in step ? step.sql : await (await fetchBlob(step.sqlFile)).text();
      await db.exec(sql);
      log('ok', `ran ${'sqlFile' in step ? step.sqlFile : 'SQL'}`);
    } else if ('connection' in step) {
      await db.exec(`CREATE CONNECTION IF NOT EXISTS ${quoteIdent(step.connection)} WITH (url = ${quoteLiteral(resolve(step.url))})`);
      log('ok', `connection ${step.connection}`);
    } else if ('import' in step) {
      const blob = await fetchBlob(step.import);
      const format = step.format ?? formatFromName(step.import);
      const opts = { create: true, ...(step.options ?? {}) };
      const res =
        format === 'parquet'
          ? await importParquet(db, step.table, blob)
          : format === 'json' || format === 'ndjson'
            ? await db.importJSON(step.table, blob, opts)
            : await db.importCSV(step.table, blob, format === 'tsv' ? { delimiter: '\t', ...opts } : opts);
      log('ok', `imported ${res.rows} rows into ${step.table}`);
    } else if ('data' in step) {
      const res = await db.importJSON(step.table, JSON.stringify(step.data), { create: true });
      log('ok', `loaded ${res.rows} rows into ${step.table}`);
    } else if ('link' in step) {
      let location = step.link;
      if (location.startsWith('local:')) {
        const name = location.slice(6);
        await db.registerFile(name, await fetchBlob(location));
        location = 'file:' + name;
      } else if (!/^[a-z]+:/i.test(location) || /^https?:/i.test(location)) location = resolve(location);
      await db.exec(externalTableSql(step.table, location, step.format, step.options, step.connectionName));
      log('ok', `linked ${step.table} → ${location}`);
    } else {
      log('warn', `step ${n}: unknown step ${JSON.stringify(s).slice(0, 80)}`);
    }
  }
}

export function formatFromName(name: string): FileFormat {
  const m = /\.(csv|tsv|json|ndjson|jsonl|txt|parquet)(\?|#|$)/i.exec(name);
  const ext = (m?.[1] ?? 'csv').toLowerCase();
  return (ext === 'jsonl' ? 'ndjson' : ext === 'txt' ? 'csv' : ext) as FileFormat;
}

/** Copy a Parquet file into a table through a temporary external table. */
export async function importParquet(db: Database, table: string, blob: Blob): Promise<{ rows: number }> {
  const tmp = `__import_${Date.now().toString(36)}`;
  await db.registerFile(tmp, blob);
  try {
    await db.exec(`CREATE EXTERNAL TABLE ${quoteIdent(tmp)} WITH (location = ${quoteLiteral('file:' + tmp)}, format = 'parquet')`);
    try {
      const cols = (await db.query('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = ? ORDER BY ordinal_position', [tmp])) as { column_name: string; data_type: string }[];
      await db.exec(`CREATE TABLE IF NOT EXISTS ${quoteIdent(table)} (${cols.map((c) => `${quoteIdent(c.column_name)} ${c.data_type || 'ANY'}`).join(', ')})`);
      const names = cols.map((c) => quoteIdent(c.column_name)).join(', ');
      const r = await db.exec(`INSERT INTO ${quoteIdent(table)} (${names}) SELECT ${names} FROM ${quoteIdent(tmp)}`);
      return { rows: r.changes };
    } finally {
      await db.exec(`DROP EXTERNAL TABLE IF EXISTS ${quoteIdent(tmp)}`);
    }
  } finally {
    await db.registerFile(tmp, null).catch(() => {});
  }
}

export function externalTableSql(table: string, location: string, format?: string, options: Record<string, unknown> = {}, connection?: string): string {
  const withs = [`location = ${quoteLiteral(location)}`];
  if (connection) withs.push(`connection = ${quoteLiteral(connection)}`);
  if (format) withs.push(`format = ${quoteLiteral(format)}`);
  for (const [k, v] of Object.entries(options)) {
    if (v === undefined || v === '' || v === null) continue;
    withs.push(`${k} = ${typeof v === 'boolean' ? String(v) : typeof v === 'number' ? v : quoteLiteral(String(v))}`);
  }
  return `CREATE EXTERNAL TABLE IF NOT EXISTS ${quoteIdent(table)} WITH (${withs.join(', ')})`;
}

/** Paths of the files a report's steps read, relative to the report (for publishing). */
export function referencedFiles(data: DataSpec): string[] {
  const out = new Set<string>();
  for (const s of data.steps ?? []) {
    const p = 'sqlFile' in s ? s.sqlFile : 'import' in s ? s.import : 'link' in s ? s.link : null;
    if (p && !/^[a-z][a-z0-9+.-]*:/i.test(p)) out.add(p);
  }
  return [...out];
}

export function localFiles(data: DataSpec): string[] {
  const out = new Set<string>();
  for (const s of data.steps ?? []) {
    const p = 'import' in s ? s.import : 'link' in s ? s.link : null;
    if (p?.startsWith('local:')) out.add(p.slice(6));
  }
  return [...out];
}

export type { DataStep };
