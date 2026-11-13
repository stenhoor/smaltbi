// Is a relationship's "one" side really one? A target column with repeated values makes a join count the other
// side's rows more than once (ADR 0009). The session checks each relationship target once per data load.
import type { SchemaInfo } from '../core/model.js';
import { quoteIdent, splitRef } from '../core/sql.js';

interface Queryable {
  query(sql: string): Promise<unknown>;
}

/**
 * True when `ref` ("table.column") repeats a value. Declared primary keys are unique without looking; a table or
 * column that isn't there, or can't be read, counts as unique (the query that uses it reports the problem).
 */
export async function repeatsValues(db: Queryable, schema: SchemaInfo, ref: string): Promise<boolean> {
  const [t, c] = splitRef(ref);
  const col = schema.tables.find((x) => x.name === t)?.columns.find((x) => x.name === c);
  if (!col || col.pk) return false;
  try {
    const rows = (await db.query(`SELECT count(${quoteIdent(c)}) - count(DISTINCT ${quoteIdent(c)}) AS d FROM ${quoteIdent(t)}`)) as { d: number }[];
    return Number(rows[0]?.d ?? 0) > 0;
  } catch {
    return false;
  }
}
