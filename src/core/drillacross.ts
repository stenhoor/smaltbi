// Several facts in one visual (ADR 0009, shape B: drill-across). When no table reaches everything a visual needs,
// each fact's measures are computed in an ordinary query of their own (compileQuery), grouped by the same dimensions,
// and the results are lined up on those dimensions:
//
//   WITH f0 AS (the sales query: d0…, m0…), f1 AS (the budget query: d0…, m0…),
//        k  AS (SELECT d0… FROM f0 UNION SELECT d0… FROM f1)
//   SELECT k.d0…, <each measure from f0/f1 columns> FROM k LEFT JOIN f0 ON … LEFT JOIN f1 ON …
//
// A measure that combines facts, `[Revenue] / [Target]`, is split at its references: each part goes to its fact's
// query and the division happens after the line-up. Every number is still computed at its own table's grain.
import type { Filter } from './types.js';
import { type Model, ModelError, type ResolvedField } from './model.js';
import { quoteIdent } from './sql.js';
import { type CompiledQuery, type OutputColumn, type QuerySpec, compileFilter, compileQuery, orderClause } from './compile.js';

/** A measure as computed across facts: its parts (each within one fact) and the expression that combines them. */
interface Split {
  parts: ResolvedField[];
  /** SQL over the parts' placeholders `__sbpart<i>__` (an index into `parts`). */
  outer: string;
}

const PART = (i: number) => `__sbpart${i}__`;

/**
 * The query, if it needs facts lined up: some measure (or part of one) can't reach the visual's dimensions from the
 * same table as the others. Null when one table reaches everything (the ordinary query).
 */
export function needsDrillAcross(model: Model, q: QuerySpec): boolean {
  if (!q.measures.length) return false;
  const needed = new Set<string>();
  for (const f of [...q.dims, ...q.measures]) for (const t of f.tables) needed.add(t);
  try {
    model.chooseRoot(needed, q.measures.flatMap((m) => [...m.tables]));
    return false;
  } catch {
    return true;
  }
}

export function compileDrillAcross(model: Model, q: QuerySpec): CompiledQuery {
  const { dims, measures } = q;
  if (measures.some((m) => m.time)) throw new ModelError('time-intelligence measures can’t be shown beside another table’s measures yet: use them in a visual of their own');
  const dimTables = new Set(dims.flatMap((d) => [...d.tables]));
  // The fact a set of tables is computed from: a table that reaches them and the dimensions, or null.
  const factOf = (tables: Set<string>): string | null => {
    try {
      return model.chooseRoot(new Set([...tables, ...dimTables]), [...tables]);
    } catch {
      return null;
    }
  };
  const splits = measures.map((m) => split(model, m, factOf, dims));

  // Group the parts by fact; each fact's query computes its parts as m0, m1, …
  const facts: { root: string; parts: ResolvedField[] }[] = [];
  const placed = splits.map((s) =>
    s.parts.map((p) => {
      const root = factOf(p.tables)!;
      let f = facts.findIndex((x) => x.root === root);
      if (f < 0) f = facts.push({ root, parts: [] }) - 1;
      const k = facts[f]!.parts.push(p) - 1;
      return `f${f}.${quoteIdent('m' + k)}`;
    }),
  );

  // Measure filters (HAVING) apply to the lined-up values; the rest go to every fact they reach.
  const isMeasureFilter = (f: Filter) => !!f.field && model.kindOf(f.field) === 'measure';
  const rowFilters = (q.filters ?? []).filter((f) => !isMeasureFilter(f));
  const ignored: Filter[] = [];
  const ctes: string[] = [];
  facts.forEach((f, i) => {
    const sub = compileQuery(model, { dims, measures: f.parts, filters: rowFilters, inner: true });
    for (const x of sub.ignored) if (!ignored.includes(x)) ignored.push(x);
    ctes.push(`f${i} AS (\n${sub.sql}\n)`);
  });

  const d = dims.map((_, i) => quoteIdent('d' + i));
  const names = new Map<string, string>();
  const used = new Set<string>();
  const alias = (key: string, f: ResolvedField) => {
    if (!q.labelAliases) return key;
    let a = f.label;
    for (let n = 2; used.has(a.toLowerCase()); n++) a = `${f.label} ${n}`;
    used.add(a.toLowerCase());
    return a;
  };
  dims.forEach((x, i) => names.set('d' + i, alias('d' + i, x)));
  measures.forEach((x, i) => names.set('m' + i, alias('m' + i, x)));
  const select: string[] = [];
  const columns: OutputColumn[] = [];
  let from: string;
  if (dims.length) {
    ctes.push(`k AS (\n${facts.map((_, i) => `SELECT ${d.join(', ')} FROM f${i}`).join('\nUNION\n')}\n)`);
    dims.forEach((x, i) => {
      select.push(`k.${d[i]} AS ${quoteIdent(names.get('d' + i)!)}`);
      columns.push({ key: 'd' + i, field: x });
    });
    dims.forEach((x, i) => {
      if (x.sortExpr) select.push(`COALESCE(${facts.map((_, j) => `f${j}.${quoteIdent('s' + i)}`).join(', ')}) AS ${quoteIdent('s' + i)}`);
    });
    // IS: null-safe, so a blank dimension value lines up with the other facts' blank.
    from = ['k', ...facts.map((_, j) => `LEFT JOIN f${j} ON ${d.map((c) => `f${j}.${c} IS k.${c}`).join(' AND ')}`)].join('\n');
  } else {
    from = facts.map((_, j) => `f${j}`).join(', ');
  }
  const values = splits.map((s, i) => s.outer.replace(/__sbpart(\d+)__/g, (_, n: string) => placed[i]![Number(n)]!));
  measures.forEach((m, i) => {
    select.push(`${values[i]} AS ${quoteIdent(names.get('m' + i)!)}`);
    columns.push({ key: 'm' + i, field: m });
  });

  // Measure filters: on a measure of this visual, tested on its lined-up value; on another measure, not applied.
  const where: string[] = [];
  for (const f of (q.filters ?? []).filter(isMeasureFilter)) {
    const i = measures.findIndex((m) => m.ref === f.field);
    // No root: the test is written against the measure itself, whatever fact it comes from.
    const c = i >= 0 ? compileFilter(model, f, '', []) : null;
    if (i < 0 || !c) {
      ignored.push(f);
      continue;
    }
    // compileFilter wrote the test against the measure's own SQL: test the lined-up value instead.
    where.push(c.sql.split(measures[i]!.expr).join(`(${values[i]})`));
  }
  const order = q.inner ? '' : orderClause(q, dims, measures, names);
  const sql = [
    `WITH ${ctes.join(',\n')}`,
    `SELECT ${select.join(', ')}`,
    `FROM ${from}`,
    where.length ? `WHERE ${where.join('\n  AND ')}` : '',
    order ? `ORDER BY ${order}` : '',
    q.limit && !q.inner ? `LIMIT ${Math.max(0, Math.floor(q.limit))}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return { sql, columns, root: facts[0]!.root, ignored };
}

/**
 * A measure as parts within one fact each. A measure that one fact can compute is one part. One that can't is split
 * at its `[references]` to other measures (recursively); what is left between them must not read any table, or the
 * facts would be mixed inside one aggregate. A measure no fact can compute by these dimensions is refused (ADR 0009,
 * decision 2): naming the dimension it doesn't share.
 */
function split(model: Model, m: ResolvedField, factOf: (t: Set<string>) => string | null, dims: ResolvedField[], seen = new Set<string>()): Split {
  if (factOf(m.tables)) return { parts: [m], outer: PART(0) };
  const spec = m.kind === 'measure' && m.table && m.name ? model.tables.get(m.table)?.measures.get(m.name) : undefined;
  const unshared = () => {
    // The dimensions this measure's table can't reach (each tried alone).
    const reaches = (d: ResolvedField) => {
      try {
        model.chooseRoot(new Set([...m.tables, ...d.tables]), [...m.tables]);
        return true;
      } catch {
        return false;
      }
    };
    const missing = dims.filter((d) => !reaches(d));
    const which = (missing.length ? missing : dims).map((x) => x.label).join(', ');
    return new ModelError(`${m.label} has no relationship to ${which}: use a field both share, or show ${m.label} in a visual of its own`);
  };
  if (!spec || seen.has(spec.name.toLowerCase())) throw unshared();
  // Its own tables have no common fact (SUM(sales.x) / SUM(budget.y)): the facts are mixed inside the aggregates.
  const mixed = () => new ModelError(`${m.label} mixes tables that are computed separately: write it from measures of each table, for example [Revenue] / [Target]`);
  const ownFact = (() => {
    try {
      return model.chooseRoot(new Set(m.tables), [...m.tables]);
    } catch {
      return null;
    }
  })();
  const parts: ResolvedField[] = [];
  let refs = 0;
  const outer = spec.sql.replace(/\[([^\[\]]+)\]/g, (whole, inner: string) => {
    const name = inner.trim();
    if (name.startsWith('@')) return whole; // a parameter: expanded below
    // As expandRefs finds them: table.Name, or a measure of the same table, or a measure of that name anywhere.
    const [rt, rn] = name.includes('.') && model.tables.has(name.split('.')[0]!) ? [name.split('.')[0]!, name.slice(name.indexOf('.') + 1)] : [spec.table, name];
    const target = model.tables.get(rt)?.measures.get(rn) ?? (name.includes('.') ? undefined : (model.spec.measures ?? []).find((x) => x.name.toLowerCase() === name.toLowerCase()));
    if (!target) return whole; // a column or a quoted identifier: inlined below
    const r = model.resolve(`${target.table}.${target.name}`, 'measure');
    refs++;
    const s = split(model, r, factOf, dims, new Set([...seen, spec.name.toLowerCase()]));
    const base = parts.length;
    parts.push(...s.parts);
    return `(${s.outer.replace(/__sbpart(\d+)__/g, (_, n: string) => PART(base + Number(n)))})`;
  });
  const rest = model.expandRefs(outer.replace(/__sbpart\d+__/g, '0'), '', new Set([spec.name.toLowerCase()]));
  if (!refs) throw ownFact ? unshared() : mixed();
  if (model.tablesIn(rest, '').size) throw mixed();
  return { parts, outer: model.expandRefs(outer, '', new Set([spec.name.toLowerCase()])) };
}
