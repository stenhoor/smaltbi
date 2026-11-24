// Testing a measure or a calculated column before it is saved: the query the designer's measure dialog runs, and the
// type a calculated column's first values suggest. The dialog and the agent's model actions test with this same code, so
// neither saves what the other would refuse.
import { compileQuery, type CompiledQuery } from './compile.js';
import { Model, type ResolvedField, type SchemaInfo } from './model.js';
import type { CalcColumn, ColumnType, Measure, ModelSpec } from './types.js';

/**
 * The model with `entry` in it (in place of the first with the table and name of `replacing`), the field it resolves to,
 * and the query that tests it: a measure over all the data, or a calculated column's first five values. Throws the
 * model's or the compiler's error (an unknown reference, a cycle, an ambiguous join).
 */
export function entryTest(
  schema: SchemaInfo,
  spec: ModelSpec,
  notUnique: ReadonlySet<string>,
  kind: 'measure' | 'column',
  entry: Measure | CalcColumn,
  replacing?: { table: string; name: string },
): { model: Model; field: ResolvedField; query: CompiledQuery } {
  const listKey = kind === 'measure' ? 'measures' : 'columns';
  const list = (spec[listKey] ?? []) as (Measure | CalcColumn)[];
  const skip = replacing ? list.findIndex((x) => x.table === replacing.table && x.name === replacing.name) : -1;
  const model = new Model(schema, { ...spec, [listKey]: [...list.filter((_, i) => i !== skip), entry] }, notUnique);
  const field = model.resolve(`${entry.table}.${entry.name}`);
  const query = compileQuery(model, kind === 'measure' ? { dims: [], measures: [field] } : { dims: [field], measures: [], limit: 5 });
  return { model, field, query };
}

/** A calculated column's type from its first values, as the measure dialog guesses it, or `undefined` with none. */
export function columnTypeOf(values: readonly unknown[]): ColumnType | undefined {
  if (!values.length) return undefined;
  if (values.every((v) => typeof v === 'number' || v === null)) return 'number';
  return /^\d{4}-\d{2}(-\d{2})?$/.test(String(values.find((v) => v !== null))) ? 'date' : 'text';
}
