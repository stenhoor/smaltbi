// The resolved semantic model: the database schema (from introspection) overlaid with the report's
// model spec (relationships, measures, calculated columns, hierarchies, display settings).
import type { Aggregation, ColumnType, FieldRef, Format, Hierarchy, Measure, ModelSpec, Relationship } from './types.js';
import { quoteIdent, splitRef } from './sql.js';

/** What introspection of the database returns. */
export interface SchemaInfo {
  tables: { name: string; kind: string; columns: { name: string; type: ColumnType; pk?: boolean }[] }[];
  foreignKeys?: Relationship[];
}

export interface ColumnInfo {
  table: string;
  name: string;
  label: string;
  type: ColumnType;
  /** SQL expression for a calculated column (already expanded). */
  sql?: string;
  calc: boolean;
  pk?: boolean;
  format?: Format;
  sortBy?: string;
  hidden?: boolean;
  description?: string;
}

export interface TableInfo {
  name: string;
  label: string;
  kind: string;
  hidden?: boolean;
  description?: string;
  columns: Map<string, ColumnInfo>;
  measures: Map<string, Measure>;
  hierarchies: Map<string, Hierarchy>;
}

export interface Edge {
  /** many side */
  from: { table: string; column: string };
  /** one side */
  to: { table: string; column: string };
}

/** A field reference resolved against the model, ready to be compiled. */
export interface ResolvedField {
  ref: string;
  kind: 'column' | 'measure';
  table: string;
  name: string;
  label: string;
  /** SQL expression (an aggregate for measures). */
  expr: string;
  type: ColumnType;
  format?: Format;
  /** Expression to sort a dimension by (sortBy column). */
  sortExpr?: string;
  agg?: Aggregation;
  /** Tables the expression reads. */
  tables: Set<string>;
}

export class ModelError extends Error {}

export class Model {
  readonly tables = new Map<string, TableInfo>();
  readonly edges: Edge[] = [];
  /** Measure names, globally (for `[Name]` references). */
  private measureIndex = new Map<string, Measure>();

  constructor(schema: SchemaInfo, readonly spec: ModelSpec = {}) {
    for (const t of schema.tables) {
      const settings = spec.tables?.[t.name];
      const info: TableInfo = {
        name: t.name,
        label: settings?.label ?? t.name,
        kind: t.kind,
        hidden: settings?.hidden,
        description: settings?.description,
        columns: new Map(),
        measures: new Map(),
        hierarchies: new Map(),
      };
      for (const c of t.columns) {
        const cs = settings?.columns?.[c.name];
        info.columns.set(c.name, {
          table: t.name,
          name: c.name,
          label: cs?.label ?? c.name,
          type: cs?.type ?? c.type,
          calc: false,
          pk: c.pk,
          format: cs?.format,
          sortBy: cs?.sortBy,
          hidden: cs?.hidden,
        });
      }
      this.tables.set(t.name, info);
    }
    for (const m of spec.measures ?? []) {
      const t = this.tables.get(m.table);
      if (!t) continue; // a measure on a missing table is ignored (reported by validate())
      t.measures.set(m.name, m);
      this.measureIndex.set(m.name.toLowerCase(), m);
    }
    for (const c of spec.columns ?? []) {
      const t = this.tables.get(c.table);
      if (!t) continue;
      const cs = spec.tables?.[c.table]?.columns?.[c.name];
      t.columns.set(c.name, {
        table: c.table,
        name: c.name,
        label: cs?.label ?? c.name,
        type: c.type ?? 'any',
        sql: c.sql,
        calc: true,
        format: c.format ?? cs?.format,
        sortBy: c.sortBy ?? cs?.sortBy,
        hidden: cs?.hidden,
        description: c.description,
      });
    }
    for (const h of spec.hierarchies ?? []) this.tables.get(h.table)?.hierarchies.set(h.name, h);
    const rels = spec.relationships ?? schema.foreignKeys ?? [];
    for (const r of rels) {
      if (r.active === false) continue;
      const [ft, fc] = splitRef(r.from);
      const [tt, tc] = splitRef(r.to);
      if (this.tables.has(ft) && this.tables.has(tt)) this.edges.push({ from: { table: ft, column: fc }, to: { table: tt, column: tc } });
    }
  }

  /** Problems with the spec, for the designer's model view. */
  validate(): string[] {
    const out: string[] = [];
    for (const m of this.spec.measures ?? []) if (!this.tables.has(m.table)) out.push(`measure ${m.name}: unknown table ${m.table}`);
    for (const c of this.spec.columns ?? []) if (!this.tables.has(c.table)) out.push(`column ${c.name}: unknown table ${c.table}`);
    for (const r of this.spec.relationships ?? []) {
      const [ft, fc] = splitRef(r.from);
      const [tt, tc] = splitRef(r.to);
      if (!this.tables.get(ft)?.columns.has(fc)) out.push(`relationship ${r.from} → ${r.to}: unknown column ${r.from}`);
      if (!this.tables.get(tt)?.columns.has(tc)) out.push(`relationship ${r.from} → ${r.to}: unknown column ${r.to}`);
    }
    return out;
  }

  // ---------------------------------------------------------------- lookup

  /** Is `ref` a hierarchy? Returns its level refs. */
  hierarchyLevels(ref: string): string[] | null {
    const [t, n] = splitRef(ref);
    const h = this.tables.get(t)?.hierarchies.get(n);
    return h ? h.levels.map((l) => `${t}.${l}`) : null;
  }

  /** Expand hierarchies in a list of refs into their levels. */
  expand(refs: FieldRef[]): FieldRef[] {
    const out: FieldRef[] = [];
    for (const r of refs) {
      const name = typeof r === 'string' ? r : r.field;
      const levels = this.hierarchyLevels(name);
      if (levels) out.push(...levels);
      else out.push(r);
    }
    return out;
  }

  kindOf(ref: string): 'column' | 'measure' | 'hierarchy' | null {
    const [t, n] = splitRef(ref);
    const tab = this.tables.get(t);
    if (!tab) return null;
    if (tab.measures.has(n)) return 'measure';
    if (tab.columns.has(n)) return 'column';
    if (tab.hierarchies.has(n)) return 'hierarchy';
    return null;
  }

  column(ref: string): ColumnInfo | undefined {
    const [t, n] = splitRef(ref);
    return this.tables.get(t)?.columns.get(n);
  }

  /**
   * Resolve a field reference. `as` says how the field is used: as a dimension (grouped by) or a
   * measure (aggregated). A column used as a measure gets an implicit aggregation.
   */
  resolve(r: FieldRef, as: 'dimension' | 'measure' = 'dimension'): ResolvedField {
    const spec = typeof r === 'string' ? { field: r } : r;
    const [t, n] = splitRef(spec.field);
    const tab = this.tables.get(t);
    if (!tab) throw new ModelError(`unknown table "${t}" in ${spec.field}`);
    const m = tab.measures.get(n);
    if (m) {
      const expr = this.expandRefs(m.sql, t, new Set([m.name.toLowerCase()]));
      return { ref: spec.field, kind: 'measure', table: t, name: n, label: spec.label ?? n, expr: `(${expr})`, type: 'number', format: spec.format ?? m.format, tables: this.tablesIn(expr, t) };
    }
    const c = tab.columns.get(n);
    if (!c) throw new ModelError(`unknown field ${spec.field}`);
    const colExpr = this.columnExpr(c);
    const agg = spec.agg ?? (as === 'measure' ? (c.type === 'number' ? 'sum' : 'count') : 'none');
    if (agg !== 'none') {
      const expr = aggregate(agg, colExpr);
      const label = spec.label ?? `${aggLabel(agg)} of ${c.label}`;
      const format = spec.format ?? (agg === 'count' || agg === 'countd' ? 'integer' : c.format);
      return { ref: spec.field, kind: 'measure', table: t, name: n, label, expr, type: 'number', format, agg, tables: this.tablesIn(colExpr, t) };
    }
    const sortCol = c.sortBy ? tab.columns.get(c.sortBy) : undefined;
    return {
      ref: spec.field,
      kind: 'column',
      table: t,
      name: n,
      label: spec.label ?? c.label,
      expr: colExpr,
      type: c.type,
      format: spec.format ?? c.format,
      sortExpr: sortCol ? this.columnExpr(sortCol) : undefined,
      tables: this.tablesIn(colExpr, t),
    };
  }

  columnExpr(c: ColumnInfo): string {
    if (!c.calc) return `${quoteIdent(c.table)}.${quoteIdent(c.name)}`;
    return `(${this.expandRefs(c.sql ?? 'NULL', c.table, new Set([`${c.table}.${c.name}`.toLowerCase()]))})`;
  }

  /**
   * Inline `[Name]` and `[table.Name]` references to measures and calculated columns. Brackets
   * that do not name one are left alone (SQLite allows `[ident]` quoting).
   */
  expandRefs(sql: string, home: string, seen: Set<string>): string {
    return sql.replace(/\[([^\[\]]+)\]/g, (whole, inner: string) => {
      const name = inner.trim();
      let table = home;
      let field = name;
      if (name.includes('.') && this.tables.has(splitRef(name)[0])) [table, field] = splitRef(name);
      const tab = this.tables.get(table);
      const m = tab?.measures.get(field) ?? (name.includes('.') ? undefined : this.measureIndex.get(name.toLowerCase()));
      if (m) {
        const key = m.name.toLowerCase();
        if (seen.has(key)) throw new ModelError(`measure ${m.name} refers to itself`);
        return `(${this.expandRefs(m.sql, m.table, new Set([...seen, key]))})`;
      }
      const c = tab?.columns.get(field);
      if (c) {
        const key = `${c.table}.${c.name}`.toLowerCase();
        if (seen.has(key)) throw new ModelError(`column ${c.name} refers to itself`);
        if (!c.calc) return `${quoteIdent(c.table)}.${quoteIdent(c.name)}`;
        return `(${this.expandRefs(c.sql ?? 'NULL', c.table, new Set([...seen, key]))})`;
      }
      return whole;
    });
  }

  /** Tables an SQL expression refers to (`table.` or `"table".`). */
  tablesIn(sql: string, home?: string): Set<string> {
    const out = new Set<string>();
    for (const name of this.tables.keys()) {
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(^|[^\\w"])("${esc}"|${esc})\\s*\\.`, 'i');
      if (re.test(sql)) out.add(name);
    }
    if (out.size === 0 && home) out.add(home);
    return out;
  }

  // ---------------------------------------------------------------- joins

  /** BFS along many→one edges. Returns, for each reachable table, the edge used to reach it. */
  private reach(root: string): Map<string, Edge | null> {
    const seen = new Map<string, Edge | null>([[root, null]]);
    const queue = [root];
    while (queue.length) {
      const t = queue.shift()!;
      for (const e of this.edges) {
        if (e.from.table === t && !seen.has(e.to.table)) {
          seen.set(e.to.table, e);
          queue.push(e.to.table);
        }
      }
    }
    return seen;
  }

  canReach(root: string, table: string): boolean {
    return this.reach(root).has(table);
  }

  /**
   * Pick the table to start the FROM clause with: the first of `preferred`, then of `needed`, then
   * of every table, from which all `needed` tables can be reached along many→one relationships.
   */
  chooseRoot(needed: Set<string>, preferred: string[] = []): string {
    const candidates = [...preferred, ...needed, ...this.tables.keys()];
    for (const c of candidates) {
      const r = this.reach(c);
      if ([...needed].every((t) => r.has(t))) return c;
    }
    const first = preferred[0] ?? [...needed][0];
    if (!first) throw new ModelError('no table to query');
    const missing = [...needed].filter((t) => !this.reach(first).has(t));
    throw new ModelError(`no relationship path from ${first} to ${missing.join(', ')}; add a relationship in the model`);
  }

  /** Number of distinct active relationship paths from `root` to each table it reaches. */
  pathCounts(root: string): Map<string, number> {
    const count = new Map<string, number>();
    const walk = (t: string, seen: Set<string>) => {
      for (const e of this.edges) {
        if (e.from.table !== t || seen.has(e.to.table)) continue;
        count.set(e.to.table, (count.get(e.to.table) ?? 0) + 1);
        walk(e.to.table, new Set([...seen, e.to.table]));
      }
    };
    walk(root, new Set([root]));
    return count;
  }

  /**
   * Refuse to guess (ADR 0004, decision 9): if a table a query needs can be reached from its root
   * by more than one active path, the join is ambiguous and the result would depend on which path
   * was picked. The fix is to mark one of the relationships inactive.
   */
  assertUnambiguous(root: string, needed: Iterable<string>): void {
    const counts = this.pathCounts(root);
    const amb = [...new Set(needed)].filter((t) => t !== root && (counts.get(t) ?? 0) > 1);
    if (!amb.length) return;
    const list = amb.map((t) => `${root} → ${t}`).join(', ');
    throw new ModelError(`There is more than one relationship path for ${list}. Mark one of the relationships inactive in the model view.`);
  }

  /** Pairs of tables connected by more than one active path (an ambiguous model). */
  ambiguousPaths(): [string, string][] {
    const out: [string, string][] = [];
    const sources = new Set(this.edges.map((e) => e.from.table));
    for (const start of sources) for (const [t, n] of this.pathCounts(start)) if (n > 1) out.push([start, t]);
    return out;
  }

  /** The LEFT JOIN clauses that bring `needed` tables in, starting from `root`. */
  joins(root: string, needed: Iterable<string>): string[] {
    const r = this.reach(root);
    const used: Edge[] = [];
    const added = new Set([root]);
    const add = (t: string) => {
      if (added.has(t)) return;
      const e = r.get(t);
      if (!e) throw new ModelError(`${t} cannot be reached from ${root}`);
      add(e.from.table);
      added.add(t);
      used.push(e);
    };
    for (const t of needed) add(t);
    return used.map(
      (e) =>
        `LEFT JOIN ${quoteIdent(e.to.table)} ON ${quoteIdent(e.from.table)}.${quoteIdent(e.from.column)} = ${quoteIdent(e.to.table)}.${quoteIdent(e.to.column)}`,
    );
  }

  /**
   * Suggest relationships by naming convention: a column `x_id` (or `xid`) whose table `x`, `xs`
   * or `xes` has a primary key `id`. Existing relationships are skipped.
   */
  suggestRelationships(): Relationship[] {
    const existing = new Set(this.edges.map((e) => `${e.from.table}.${e.from.column}`));
    const out: Relationship[] = [];
    for (const t of this.tables.values()) {
      for (const c of t.columns.values()) {
        if (c.calc) continue;
        const m = /^(.+?)_?id$/i.exec(c.name);
        if (!m || c.pk || existing.has(`${t.name}.${c.name}`)) continue;
        const base = m[1]!.toLowerCase();
        for (const target of [base, base + 's', base + 'es', base.replace(/y$/, 'ies')]) {
          const tt = [...this.tables.values()].find((x) => x.name.toLowerCase() === target);
          if (!tt || tt.name === t.name) continue;
          const key = [...tt.columns.values()].find((x) => x.pk) ?? tt.columns.get('id');
          if (key) {
            out.push({ from: `${t.name}.${c.name}`, to: `${tt.name}.${key.name}` });
            break;
          }
        }
      }
    }
    return out;
  }
}

export function aggregate(agg: Aggregation, expr: string): string {
  switch (agg) {
    case 'sum':
      return `SUM(${expr})`;
    case 'avg':
      return `AVG(${expr})`;
    case 'min':
      return `MIN(${expr})`;
    case 'max':
      return `MAX(${expr})`;
    case 'count':
      return `COUNT(${expr})`;
    case 'countd':
      return `COUNT(DISTINCT ${expr})`;
    default:
      return expr;
  }
}

export function aggLabel(agg: Aggregation): string {
  return { sum: 'Sum', avg: 'Average', min: 'Min', max: 'Max', count: 'Count', countd: 'Distinct count', none: '' }[agg];
}

export function refName(r: FieldRef): string {
  return typeof r === 'string' ? r : r.field;
}
