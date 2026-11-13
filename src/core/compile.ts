// The query compiler: turns "these dimensions, these measures, these filters" into one SQL
// statement over the model's tables, joined along the model's relationships.
//
//   SELECT <dims> AS d0…, <measures> AS m0…  FROM <root> LEFT JOIN …  WHERE <column filters>
//   GROUP BY <dims>  HAVING <measure filters>  ORDER BY …  LIMIT n
//
// Values are inlined as SQL literals (properly quoted), so the SQL shown to the user is exactly
// the SQL that runs, and the result cache can key on the text alone.
import type { Filter, SqlValue } from './types.js';
import { type Model, ModelError, type ResolvedField } from './model.js';
import { quoteIdent, quoteLiteral } from './sql.js';
import { compileTimeQuery } from './timeintel.js';

export interface QuerySpec {
  dims: ResolvedField[];
  measures: ResolvedField[];
  filters?: Filter[];
  /** Keys d0…, m0… with a direction. Default: by the first measure, descending, or the dims ascending. */
  sort?: { key: string; dir: 'asc' | 'desc' }[];
  limit?: number;
  /** Name output columns after the fields' labels instead of d0…/m0… (for SQL shown to people). */
  labelAliases?: boolean;
  /** Internal: no ORDER BY or LIMIT (the query is a CTE inside another; core/timeintel.ts). */
  inner?: boolean;
}

export interface OutputColumn {
  key: string;
  field: ResolvedField;
}

export interface CompiledQuery {
  sql: string;
  columns: OutputColumn[];
  root: string;
  /** Filters that could not be applied (their table is not related to this query's tables). */
  ignored: Filter[];
}

export function compileQuery(model: Model, q: QuerySpec): CompiledQuery {
  const { dims, measures } = q;
  if (!dims.length && !measures.length) throw new ModelError('nothing to query: add a field');
  // Time-intelligence measures work per period of each row: a query of its own shape (core/timeintel.ts).
  if (measures.some((m) => m.time)) return compileTimeQuery(model, q);

  // Tables: measures decide the root (the fact table); dimensions and filters must hang off it.
  const needed = new Set<string>();
  for (const f of [...dims, ...measures]) for (const t of f.tables) needed.add(t);
  const preferred = measures.flatMap((m) => [...m.tables]);
  let root: string;
  if (measures.length) {
    root = model.chooseRoot(needed, preferred);
  } else {
    // Relevant values (ADR 0004, decision 10): a dimension-only query (a slicer, a list of values)
    // starts from a table that also reaches the filtered tables, normally the fact table, so other
    // selections narrow it to values that have data. Without such a table, or without filters on
    // other tables, it lists every value of its own table.
    const withFilters = new Set([...needed, ...(q.filters ?? []).flatMap((f) => [...filterTables(model, f)])]);
    root = model.chooseRoot(needed);
    if (withFilters.size > needed.size) {
      try {
        root = model.chooseRoot(withFilters);
      } catch {
        // no table connects them: keep the dimension's own table; those filters are ignored below
      }
    }
  }

  const where: string[] = [];
  const having: string[] = [];
  const ignored: Filter[] = [];
  for (const f of q.filters ?? []) {
    const c = compileFilter(model, f, root, q.filters ?? []);
    if (!c) {
      ignored.push(f);
      continue;
    }
    for (const t of c.tables) needed.add(t);
    (c.aggregate ? having : where).push(c.sql);
  }

  model.assertUnambiguous(root, needed);
  // Measures add up rows: a join that repeats them would inflate every number (ADR 0009).
  if (measures.length) model.assertCountable(root, needed);

  const select: string[] = [];
  const groupBy: string[] = [];
  const columns: OutputColumn[] = [];
  const used = new Set<string>();
  const alias = (key: string, f: ResolvedField) => {
    if (!q.labelAliases) return key;
    let a = f.label;
    for (let n = 2; used.has(a.toLowerCase()); n++) a = `${f.label} ${n}`;
    used.add(a.toLowerCase());
    return a;
  };
  const names = new Map<string, string>();
  dims.forEach((d, i) => names.set('d' + i, alias('d' + i, d)));
  measures.forEach((m, i) => names.set('m' + i, alias('m' + i, m)));
  dims.forEach((d, i) => {
    select.push(`${d.expr} AS ${quoteIdent(names.get('d' + i)!)}`);
    groupBy.push(d.expr);
    columns.push({ key: 'd' + i, field: d });
  });
  dims.forEach((d, i) => {
    if (!d.sortExpr) return;
    select.push(`MIN(${d.sortExpr}) AS ${quoteIdent('s' + i)}`);
  });
  measures.forEach((m, i) => {
    select.push(`${m.expr} AS ${quoteIdent(names.get('m' + i)!)}`);
    columns.push({ key: 'm' + i, field: m });
  });

  const order = q.inner ? '' : orderClause(q, dims, measures, names);

  const sql = [
    `SELECT ${select.join(', ')}`,
    `FROM ${model.tableSql(root)}`,
    ...model.joins(root, needed),
    where.length ? `WHERE ${where.join('\n  AND ')}` : '',
    groupBy.length ? `GROUP BY ${groupBy.join(', ')}` : '',
    having.length ? `HAVING ${having.join('\n  AND ')}` : '',
    order ? `ORDER BY ${order}` : '',
    q.limit && !q.inner ? `LIMIT ${Math.max(0, Math.floor(q.limit))}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return { sql, columns, root, ignored };
}

/** ORDER BY over the output columns (dimensions with a sortBy column sort by it, as `s<i>`). */
export function orderClause(q: QuerySpec, dims: ResolvedField[], measures: ResolvedField[], names: Map<string, string>): string {
  return (q.sort?.length ? q.sort : defaultSort(dims, measures))
    .map(({ key, dir }) => {
      const i = Number(key.slice(1));
      const d = key[0] === 'd' ? dims[i] : undefined;
      const col = d?.sortExpr ? 's' + i : (names.get(key) ?? key);
      return `${quoteIdent(col)} ${dir === 'desc' ? 'DESC' : 'ASC'} NULLS LAST`;
    })
    .join(', ');
}

function defaultSort(dims: ResolvedField[], _measures: ResolvedField[]): { key: string; dir: 'asc' | 'desc' }[] {
  return dims.map((_, i) => ({ key: 'd' + i, dir: 'asc' as const }));
}

/** Tables a filter reads (empty when its fields do not resolve). */
export function filterTables(model: Model, f: Filter): Set<string> {
  try {
    if (f.op === 'sql') return model.tablesIn(model.expandRefs(f.sql ?? '1', '', new Set()));
    const refs = f.op === 'tuples' ? (f.fields ?? []) : f.field ? [f.field] : [];
    return new Set(refs.flatMap((r) => [...model.resolve(r, model.kindOf(r) === 'measure' ? 'measure' : 'dimension').tables]));
  } catch {
    return new Set();
  }
}

interface CompiledFilter {
  sql: string;
  aggregate: boolean;
  tables: Set<string>;
}

/** Compile one filter, or null when its table cannot be reached from `root`. */
export function compileFilter(model: Model, f: Filter, root: string, all: Filter[] = []): CompiledFilter | null {
  if (f.op === 'sql') {
    const sql = model.expandRefs(f.sql ?? '1', root, new Set());
    const tables = model.tablesIn(sql);
    if ([...tables].some((t) => !model.canReach(root, t))) return null;
    return { sql: `(${sql})`, aggregate: /\b(sum|avg|count|min|max|total|group_concat)\s*\(/i.test(sql), tables };
  }
  if (f.op === 'tuples') {
    const fields = (f.fields ?? []).map((r) => model.resolve(r, 'dimension'));
    const tables = new Set(fields.flatMap((x) => [...x.tables]));
    if ([...tables].some((t) => !model.canReach(root, t))) return null;
    const tuples = f.tuples ?? [];
    if (!tuples.length) return { sql: '0', aggregate: false, tables };
    const parts = tuples.map((tup) => '(' + fields.map((fd, i) => eq(fd.expr, tup[i] ?? null)).join(' AND ') + ')');
    return { sql: parts.length === 1 ? parts[0]! : `(${parts.join(' OR ')})`, aggregate: false, tables };
  }
  if (!f.field) return null;
  const isMeasure = model.kindOf(f.field) === 'measure';
  const field = model.resolve(f.field, isMeasure ? 'measure' : 'dimension');
  // A time-intelligence measure has no single SQL expression to filter on: the filter is reported as not applied.
  if (field.time) return null;
  if ([...field.tables].some((t) => !model.canReach(root, t))) return null;
  const x = field.expr;
  const v = f.values ?? [];
  const lit = (i: number) => quoteLiteral(v[i] ?? null);
  let sql: string;
  switch (f.op) {
    case 'in':
    case 'not-in': {
      const hasNull = v.some((a) => a === null);
      const vals = v.filter((a) => a !== null);
      const inList = vals.length ? `${x} IN (${vals.map((a) => quoteLiteral(a)).join(', ')})` : '';
      if (f.op === 'in') sql = [inList, hasNull ? `${x} IS NULL` : ''].filter(Boolean).join(' OR ') || '0';
      else sql = [inList ? `${x} NOT IN (${vals.map((a) => quoteLiteral(a)).join(', ')})` : '', hasNull ? `${x} IS NOT NULL` : ''].filter(Boolean).join(' AND ') || '1';
      if (f.op === 'not-in' && !hasNull) sql = `(${sql} OR ${x} IS NULL)`;
      sql = `(${sql})`;
      break;
    }
    case 'eq':
      sql = eq(x, v[0] ?? null);
      break;
    case 'ne':
      sql = v[0] === null ? `${x} IS NOT NULL` : `(${x} <> ${lit(0)} OR ${x} IS NULL)`;
      break;
    case 'gt':
      sql = `${x} > ${lit(0)}`;
      break;
    case 'gte':
      sql = `${x} >= ${lit(0)}`;
      break;
    case 'lt':
      sql = `${x} < ${lit(0)}`;
      break;
    case 'lte':
      sql = `${x} <= ${lit(0)}`;
      break;
    case 'between': {
      const parts = [];
      if (v[0] !== null && v[0] !== undefined && v[0] !== '') parts.push(`${x} >= ${lit(0)}`);
      if (v[1] !== null && v[1] !== undefined && v[1] !== '') parts.push(`${x} <= ${lit(1)}`);
      sql = parts.length ? `(${parts.join(' AND ')})` : '1';
      break;
    }
    case 'contains':
      sql = `instr(lower(${x}), lower(${lit(0)})) > 0`;
      break;
    case 'starts-with':
      sql = `substr(lower(${x}), 1, length(${lit(0)})) = lower(${lit(0)})`;
      break;
    case 'is-null':
      sql = `${x} IS NULL`;
      break;
    case 'not-null':
      sql = `${x} IS NOT NULL`;
      break;
    case 'top': {
      // field IN (top n values of field ranked by `by`), under the other filters.
      const n = Math.max(1, Number(v[0] ?? 10));
      const by = model.resolve(f.by ?? f.field, 'measure');
      const others = all.filter((o) => o !== f && o.op !== 'top');
      const sub = compileQuery(model, { dims: [field], measures: [by], filters: others, sort: [{ key: 'm0', dir: v[1] === 'bottom' ? 'asc' : 'desc' }], limit: n });
      // Keep only the d0 column of the subquery.
      sql = `${x} IN (SELECT ${quoteIdent('d0')} FROM (${sub.sql}))`;
      return { sql, aggregate: false, tables: field.tables };
    }
    default:
      throw new ModelError(`unknown filter operator ${(f as Filter).op}`);
  }
  return { sql, aggregate: isMeasure, tables: field.tables };
}

function eq(expr: string, v: SqlValue): string {
  return v === null ? `${expr} IS NULL` : `${expr} = ${quoteLiteral(v)}`;
}

/**
 * Wrap a custom SQL query so that filters still apply: each filter whose field's column name (or
 * label) is an output column of the query becomes a WHERE condition on the wrapped query.
 */
export function wrapCustomSql(sql: string, outputColumns: string[], filters: Filter[], model: Model | null): { sql: string; ignored: Filter[] } {
  const lower = new Map(outputColumns.map((c) => [c.toLowerCase(), c]));
  const conds: string[] = [];
  const ignored: Filter[] = [];
  const colFor = (ref: string): string | undefined => {
    const name = ref.slice(ref.indexOf('.') + 1).toLowerCase();
    const label = model?.column(ref)?.label.toLowerCase();
    return lower.get(name) ?? (label ? lower.get(label) : undefined);
  };
  for (const f of filters) {
    if (f.op === 'tuples') {
      const cols = (f.fields ?? []).map(colFor);
      if (cols.some((c) => !c)) {
        ignored.push(f);
        continue;
      }
      const parts = (f.tuples ?? []).map((t) => '(' + cols.map((c, i) => eq(quoteIdent(c!), t[i] ?? null)).join(' AND ') + ')');
      conds.push(parts.length ? `(${parts.join(' OR ')})` : '0');
      continue;
    }
    const col = f.field ? colFor(f.field) : undefined;
    if (!col || f.op === 'top' || f.op === 'sql') {
      ignored.push(f);
      continue;
    }
    const x = quoteIdent(col);
    const v = f.values ?? [];
    switch (f.op) {
      case 'in':
        conds.push(v.length ? `${x} IN (${v.map((a) => quoteLiteral(a)).join(', ')})` : '0');
        break;
      case 'not-in':
        if (v.length) conds.push(`${x} NOT IN (${v.map((a) => quoteLiteral(a)).join(', ')})`);
        break;
      case 'eq':
        conds.push(eq(x, v[0] ?? null));
        break;
      case 'between':
        if (v[0] != null && v[0] !== '') conds.push(`${x} >= ${quoteLiteral(v[0])}`);
        if (v[1] != null && v[1] !== '') conds.push(`${x} <= ${quoteLiteral(v[1])}`);
        break;
      default: {
        const ops: Record<string, string> = { ne: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
        if (ops[f.op]) conds.push(`${x} ${ops[f.op]} ${quoteLiteral(v[0] ?? null)}`);
        else if (f.op === 'contains') conds.push(`instr(lower(${x}), lower(${quoteLiteral(v[0] ?? '')})) > 0`);
        else if (f.op === 'is-null') conds.push(`${x} IS NULL`);
        else if (f.op === 'not-null') conds.push(`${x} IS NOT NULL`);
        else ignored.push(f);
      }
    }
  }
  const body = sql.trim().replace(/;\s*$/, '');
  return { sql: conds.length ? `SELECT * FROM (\n${body}\n) AS q\nWHERE ${conds.join(' AND ')}` : body, ignored };
}
