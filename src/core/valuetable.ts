// "Make a table" (ADR 0009, decision 3a): the fix for a relationship to a column that isn't unique, such as a budget by
// category related to products.category. A data step builds a table with one row per value, from both sides, and
// both columns are related to it: budget.category → category.category and products.category → category.category.
// After that the budget and the sales are two facts sharing a dimension, which drill-across lines up.
import type { Relationship, Report } from './types.js';
import type { SchemaInfo } from './model.js';
import { quoteIdent, splitRef } from './sql.js';

export interface ValueTablePlan {
  /** The new table and its one column. */
  table: string;
  column: string;
  /** The data step that builds it (appended after the steps it reads). */
  step: { sql: string };
  /** The report's relationships afterwards: the flagged one pointed at the new table, and the original column's. */
  relationships: Relationship[];
}

/** Plan the table for relationship `index` of the report (its `to` column has repeated values). */
export function planValueTable(report: Report, index: number, schema: SchemaInfo): ValueTablePlan {
  const rels = report.model.relationships ?? [];
  const r = rels[index];
  if (!r) throw new Error(`no relationship ${index}`);
  const [ft, fc] = splitRef(r.from);
  const [tt, tc] = splitRef(r.to);
  const taken = new Set(schema.tables.map((t) => t.name.toLowerCase()));
  let table = tc;
  for (let n = 2; taken.has(table.toLowerCase()); n++) table = n === 2 ? `${tc}_values` : `${tc}_values_${n - 1}`;
  const col = schema.tables.find((t) => t.name === tt)?.columns.find((c) => c.name === tc);
  const type = col?.type === 'number' ? 'REAL' : 'TEXT';
  const T = quoteIdent(table);
  const C = quoteIdent(tc);
  const sql = [
    `-- One row per ${tc}, from ${r.to} and ${r.from} (added by "Make a ${tc} table": ${r.to} repeats values).`,
    `DROP TABLE IF EXISTS ${T};`,
    `CREATE TABLE ${T} (${C} ${type} PRIMARY KEY);`,
    `INSERT INTO ${T} (${C})`,
    // Both sides as the column's type: a year read as a number on one side and as text on the other is one value.
    `SELECT CAST(${quoteIdent(tc)} AS ${type}) FROM ${quoteIdent(tt)} WHERE ${quoteIdent(tc)} IS NOT NULL`,
    `UNION SELECT CAST(${quoteIdent(fc)} AS ${type}) FROM ${quoteIdent(ft)} WHERE ${quoteIdent(fc)} IS NOT NULL;`,
  ].join('\n');
  const target = `${table}.${tc}`;
  const relationships = rels.map((x, i) => (i === index ? { ...x, to: target } : x));
  if (!relationships.some((x) => x.from === r.to && x.to === target)) relationships.push({ from: r.to, to: target });
  return { table, column: tc, step: { sql }, relationships };
}

/** Make the table: add its data step (last, after the tables it reads) and the relationships. */
export function applyValueTable(report: Report, index: number, schema: SchemaInfo): ValueTablePlan {
  const plan = planValueTable(report, index, schema);
  (report.data.steps ??= []).push(plan.step);
  report.model.relationships = plan.relationships;
  return plan;
}
