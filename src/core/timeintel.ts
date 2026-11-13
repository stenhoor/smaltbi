// Time-intelligence measures (year to date, same period last year, rolling months, …): the base measure, aggregated
// over a window of dates worked out from each result row's period. Plain SQL from the model's date table; no new
// language (ADR 0004 decision 1, ADR 0006).
//
//   WITH ti_q AS (the visual's own query, plus each time measure's base measure as b<i>),
//        ti_p AS (the date table grouped by the visual's date-table fields, under the date-table filters: lo, hi),
//        ti_w<i> AS (each period's window of days, e.g. the year so far: p × calendar days),
//        ti_a<i> AS (the base measure over the facts on those days, by period and the visual's other fields,
//                 under the other filters)
//   SELECT ti_q's columns, ti_a<i>.v … FROM ti_q LEFT JOIN ti_a<i> ON the same period and fields  ORDER BY …  LIMIT …
//
// The windows go through the date table's days, so the facts join on equal dates (fast), and the base measure is
// aggregated afresh over the window: distinct counts and ratios are right, not sums of sums.
import type { Filter, TimeCalcKind } from './types.js';
import type { CompiledQuery, OutputColumn, QuerySpec } from './compile.js';
import { compileFilter, compileQuery, filterTables, orderClause } from './compile.js';
import { type Model, ModelError, type ResolvedField } from './model.js';
import { quoteIdent, splitRef } from './sql.js';

/** What each calculation is called (quick-measure names and the designer's menu). */
export const TIME_CALCS: Record<TimeCalcKind, { label: string; suffix: string; description: string }> = {
  ytd: { label: 'Year to date', suffix: 'YTD', description: 'From the start of the (fiscal) year to the end of each period.' },
  qtd: { label: 'Quarter to date', suffix: 'QTD', description: 'From the start of the (fiscal) quarter to the end of each period.' },
  mtd: { label: 'Month to date', suffix: 'MTD', description: 'From the start of the month to the end of each period.' },
  py: { label: 'Same period last year', suffix: 'LY', description: 'The same dates one year earlier.' },
  yoy: { label: 'Change vs last year', suffix: 'vs LY', description: 'This period minus the same period last year.' },
  'yoy%': { label: '% change vs last year', suffix: '% vs LY', description: 'The change vs last year, as a share of last year.' },
  pm: { label: 'Previous month', suffix: 'PM', description: 'The period moved back one month (whole months).' },
  pq: { label: 'Previous quarter', suffix: 'PQ', description: 'The period moved back three months (whole months).' },
  rolling: { label: 'Rolling months', suffix: 'rolling', description: 'The last N months up to the end of each period.' },
};

export function compileTimeQuery(model: Model, q: QuerySpec): CompiledQuery {
  const spec = model.spec.dateTable;
  if (!spec) throw new ModelError('time-intelligence measures need a date table: add one in the model view (Add date table)');
  const cal = spec.table;
  if (!model.tables.has(cal)) throw new ModelError(`the date table "${cal}" is not in the database yet: reload the data`);
  const [factTable, factCol] = splitRef(spec.source);
  const fs = spec.fiscalStart;
  const Q = quoteIdent;
  const day = (alias: string) => `${alias}.${Q(spec.column)}`;
  const factDate = `${Q(factTable)}.${Q(factCol)}`;

  const { dims, measures } = q;
  const onlyCal = (f: ResolvedField) => f.tables.size > 0 && [...f.tables].every((t) => t === cal);
  const calDims: number[] = [];
  const otherDims: number[] = [];
  dims.forEach((d, i) => {
    if (onlyCal(d)) calDims.push(i);
    else if (d.tables.has(cal)) throw new ModelError(`${d.label} mixes the date table with other tables; time-intelligence measures need date-table fields on their own`);
    else otherDims.push(i);
  });

  // Filters: those on the date table shape the periods; the others apply to the facts. Filters on time measures can't
  // be applied (there is no single expression to test).
  const ignored: Filter[] = [];
  const qFilters: Filter[] = [];
  const periodWhere: string[] = [];
  const factWhere: string[] = [];
  const factTables = new Set<string>([factTable]);
  for (const f of q.filters ?? []) {
    if (f.field && model.kindOf(f.field) === 'measure' && model.resolve(f.field, 'measure').time) {
      ignored.push(f);
      continue;
    }
    qFilters.push(f);
    const tables = filterTables(model, f);
    if (tables.size && [...tables].every((t) => t === cal)) {
      const c = compileFilter(model, f, cal, q.filters ?? []);
      if (c && !c.aggregate) periodWhere.push(c.sql);
    } else if (!tables.has(cal)) {
      const c = compileFilter(model, f, factTable, q.filters ?? []);
      if (c && !c.aggregate) {
        factWhere.push(c.sql);
        for (const t of c.tables) factTables.add(t);
      }
    }
    // A filter over the date table and other tables at once (a cross-filter tuple) applies to ti_q only.
  }

  // ti_q: the visual's own query, with the plain measures and each time measure's base measure.
  const plain: number[] = [];
  const timed: number[] = [];
  measures.forEach((m, i) => (m.time ? timed : plain).push(i));
  const bases: ResolvedField[] = [];
  const baseKey = new Map<number, string>();
  for (const i of timed) {
    const base = measures[i]!.time!.base;
    let j = bases.findIndex((b) => b.ref === base.ref && b.expr === base.expr);
    if (j < 0) j = bases.push(base) - 1;
    baseKey.set(i, 'm' + (plain.length + j));
  }
  const inner = compileQuery(model, { dims, measures: [...plain.map((i) => measures[i]!), ...bases], filters: qFilters, inner: true });
  ignored.push(...inner.ignored);

  // p: the periods. One row per combination of the visual's date-table fields (one row in all without any).
  const calWhere = periodWhere.length ? `\nWHERE ${periodWhere.join(' AND ')}` : '';
  const keys = calDims.map((di, k) => `${dims[di]!.expr} AS ${Q('k' + k)}`);
  const periods = [
    `SELECT ${[...keys, `MIN(${day(Q(cal))}) AS lo`, `MAX(${day(Q(cal))}) AS hi`].join(', ')}`,
    `FROM ${Q(cal)}${calWhere}`,
    calDims.length ? `GROUP BY ${calDims.map((di) => dims[di]!.expr).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const ctes: string[] = [`ti_q AS (\n${inner.sql}\n)`, `ti_p AS (\n${periods}\n)`];
  const joins: string[] = [];
  const values = new Map<number, string>();
  const pk = calDims.map((_, k) => `ti_p.${Q('k' + k)}`);
  for (const i of timed) {
    const t = measures[i]!.time!;
    const base = t.base;
    if (!base.tables.has(factTable)) throw new ModelError(`${measures[i]!.label}: ${base.label} must be a measure of ${factTable}, the table the date table describes (${spec.source})`);
    if (base.tables.has(cal)) throw new ModelError(`${measures[i]!.label}: ${base.label} reads the date table itself; use a measure over ${factTable}`);
    const [lo, hi] = windowOf(t.calc, t.months, fs);
    const w = `ti_w${i}`;
    const a = `ti_a${i}`;
    ctes.push(`${w} AS (\nSELECT ${[...pk.map((x, k) => `${x} AS ${Q('k' + k)}`), `c.${Q(spec.column)} AS day`].join(', ')}\nFROM ti_p JOIN ${Q(cal)} c ON c.${Q(spec.column)} BETWEEN ${lo} AND ${hi}\n)`);
    const needed = new Set<string>([...factTables, ...base.tables]);
    const others = otherDims.map((di, o) => {
      for (const tb of dims[di]!.tables) needed.add(tb);
      return { expr: dims[di]!.expr, alias: Q('o' + o) };
    });
    needed.delete(cal);
    model.assertUnambiguous(factTable, needed);
    model.assertCountable(factTable, needed);
    const groupBy = [...calDims.map((_, k) => `${w}.${Q('k' + k)}`), ...others.map((o) => o.expr)];
    ctes.push(
      `${a} AS (\n` +
        [
          `SELECT ${[...calDims.map((_, k) => `${w}.${Q('k' + k)}`), ...others.map((o) => `${o.expr} AS ${o.alias}`), `${base.expr} AS v`].join(', ')}`,
          `FROM ${w} JOIN ${Q(factTable)} ON ${factDate} = ${w}.day`,
          ...model.joins(factTable, needed),
          factWhere.length ? `WHERE ${factWhere.join('\n  AND ')}` : '',
          groupBy.length ? `GROUP BY ${groupBy.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join('\n') +
        '\n)',
    );
    const on = [...calDims.map((di, k) => `ti_q.${Q('d' + di)} IS ${a}.${Q('k' + k)}`), ...otherDims.map((di, o) => `ti_q.${Q('d' + di)} IS ${a}.${Q('o' + o)}`)];
    joins.push(`LEFT JOIN ${a} ON ${on.length ? on.join(' AND ') : '1'}`);
    const cur = `ti_q.${Q(baseKey.get(i)!)}`;
    values.set(i, t.calc === 'yoy' ? `${cur} - ${a}.v` : t.calc === 'yoy%' ? `(${cur} - ${a}.v) * 1.0 / NULLIF(${a}.v, 0)` : `${a}.v`);
  }

  // The output: the same columns, names and order as a query without time measures.
  const used = new Set<string>();
  const alias = (key: string, f: ResolvedField) => {
    if (!q.labelAliases) return key;
    let x = f.label;
    for (let n = 2; used.has(x.toLowerCase()); n++) x = `${f.label} ${n}`;
    used.add(x.toLowerCase());
    return x;
  };
  const names = new Map<string, string>();
  const select: string[] = [];
  const columns: OutputColumn[] = [];
  dims.forEach((d, i) => {
    names.set('d' + i, alias('d' + i, d));
    select.push(`ti_q.${Q('d' + i)} AS ${Q(names.get('d' + i)!)}`);
    columns.push({ key: 'd' + i, field: d });
  });
  dims.forEach((d, i) => d.sortExpr && select.push(`ti_q.${Q('s' + i)} AS ${Q('s' + i)}`));
  measures.forEach((m, i) => {
    names.set('m' + i, alias('m' + i, m));
    const value = m.time ? values.get(i)! : `ti_q.${Q('m' + plain.indexOf(i))}`;
    select.push(`${value} AS ${Q(names.get('m' + i)!)}`);
    columns.push({ key: 'm' + i, field: m });
  });
  const order = orderClause(q, dims, measures, names);
  const sql = [
    `WITH ${ctes.join(',\n')}`,
    `SELECT ${select.join(', ')}`,
    'FROM ti_q',
    ...joins,
    order ? `ORDER BY ${order}` : '',
    q.limit ? `LIMIT ${Math.max(0, Math.floor(q.limit))}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return { sql, columns, root: inner.root, ignored };
}

/** The first and last day of a period's window, as SQL over the period's `ti_p.lo` and `ti_p.hi`. */
function windowOf(calc: TimeCalcKind, months: number, fiscalStart: number): [string, string] {
  const m = (x: string) => `CAST(strftime('%m', ${x}) AS INTEGER)`;
  const back = (x: string, step: number) => `date(${x}, 'start of month', '-' || ((${m(x)} - ${fiscalStart} + 12) % ${step}) || ' months')`;
  const n = Math.max(1, Math.round(months));
  switch (calc) {
    case 'ytd':
      return [back('ti_p.hi', 12), 'ti_p.hi'];
    case 'qtd':
      return [back('ti_p.hi', 3), 'ti_p.hi'];
    case 'mtd':
      return [`date(ti_p.hi, 'start of month')`, 'ti_p.hi'];
    case 'rolling':
      return [`date(ti_p.hi, 'start of month', '-${n - 1} months')`, 'ti_p.hi'];
    case 'py':
    case 'yoy':
    case 'yoy%':
      // The day after the end, a year back, less a day: 29 February 2024 → 28 February 2023.
      return [`date(ti_p.lo, '-1 year')`, `date(ti_p.hi, '+1 day', '-1 year', '-1 day')`];
    case 'pm':
    case 'pq': {
      const k = calc === 'pm' ? 1 : 3;
      return [`date(ti_p.lo, 'start of month', '-${k} months')`, `date(ti_p.hi, 'start of month', '-${k - 1} months', '-1 day')`];
    }
  }
}
