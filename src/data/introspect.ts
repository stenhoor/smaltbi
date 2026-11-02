// Read the database schema into the shape the model needs: tables, columns with BI types, keys.
import type { ColumnType, Relationship } from '../core/types.js';
import type { SchemaInfo } from '../core/model.js';
import { quoteIdent } from '../core/sql.js';
import type { Database } from '../kit/engine.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/;

export function sqlTypeToColumnType(t: string): ColumnType {
  const u = (t || '').toUpperCase();
  if (/INT|REAL|FLOA|DOUB|NUM|DEC/.test(u)) return 'number';
  if (/BOOL/.test(u)) return 'bool';
  if (/DATETIME|TIMESTAMP/.test(u)) return 'datetime';
  if (/DATE/.test(u)) return 'date';
  if (/CHAR|TEXT|CLOB|STRING/.test(u)) return 'text';
  return 'any';
}

export async function introspect(db: Database): Promise<SchemaInfo> {
  const tables = (await db.query(
    "SELECT table_name AS name, table_type AS kind FROM information_schema.tables WHERE table_name NOT LIKE 'sqlite_%' AND table_name NOT LIKE '__import_%' ORDER BY table_name",
  )) as { name: string; kind: string }[];
  const cols = (await db.query('SELECT table_name AS t, column_name AS c, data_type AS ty FROM information_schema.columns ORDER BY table_name, ordinal_position')) as { t: string; c: string; ty: string }[];
  const byTable = new Map<string, { name: string; type: ColumnType; pk?: boolean }[]>();
  for (const c of cols) {
    if (!byTable.has(c.t)) byTable.set(c.t, []);
    byTable.get(c.t)!.push({ name: c.c, type: sqlTypeToColumnType(c.ty) });
  }
  const foreignKeys: Relationship[] = [];
  const out: SchemaInfo = { tables: [], foreignKeys };
  for (const t of tables) {
    const columns = byTable.get(t.name) ?? [];
    if (t.kind === 'BASE TABLE') {
      try {
        const info = (await db.query(`PRAGMA table_info(${quoteIdent(t.name)})`)) as { name: string; pk: number }[];
        for (const i of info) if (i.pk) columns.find((c) => c.name === i.name)!.pk = true;
        const fks = (await db.query(`PRAGMA foreign_key_list(${quoteIdent(t.name)})`)) as { table: string; from: string; to: string | null }[];
        for (const fk of fks) foreignKeys.push({ from: `${t.name}.${fk.from}`, to: `${fk.table}.${fk.to ?? 'id'}` });
      } catch {
        // pragmas are optional for the model
      }
    }
    // Text columns holding ISO dates are dates. Sample a few rows (cheap; external tables read lazily).
    const probe = columns.filter((c) => c.type === 'text' || c.type === 'any');
    if (probe.length) {
      try {
        const sel = probe.map((c, i) => `max(${quoteIdent(c.name)}) AS ${quoteIdent('p' + i)}`).join(', ');
        const [row] = (await db.query(`SELECT ${sel} FROM (SELECT * FROM ${quoteIdent(t.name)} LIMIT 64)`)) as Record<string, unknown>[];
        probe.forEach((c, i) => {
          const v = row?.['p' + i];
          if (typeof v === 'string') {
            if (DATE_RE.test(v)) c.type = 'date';
            else if (DATETIME_RE.test(v)) c.type = 'datetime';
          } else if (typeof v === 'number' && c.type === 'any') c.type = 'number';
        });
      } catch {
        // unreadable external source: keep declared types
      }
    }
    out.tables.push({ name: t.name, kind: t.kind, columns });
  }
  return out;
}
