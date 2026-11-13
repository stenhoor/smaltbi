// The resolved semantic model: the database schema (from introspection) overlaid with the report's
// model spec (relationships, measures, calculated columns, hierarchies, display settings).
import type { Aggregation, ColumnType, FieldRef, Format, Hierarchy, Measure, ModelSpec, Parameter, Relationship, TimeCalcKind } from './types.js';
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
  /** A role (an alias of another table, through its own relationship): the table it plays. */
  source?: string;
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
  /** The "one" side's column has repeated values: joining through it would count rows more than once (ADR 0009). */
  notUnique?: boolean;
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
  /** A time-intelligence measure: its calculation and resolved base measure (its `expr` is a placeholder). */
  time?: { calc: TimeCalcKind; months: number; base: ResolvedField };
}

/**
 * How a query reaches a table: along a many → one edge, or through a link table (ADR 0009, shape A): from a table
 * it has reached (`back.to`), back along the link's edge to it, then out along the link's `edge` to the next table.
 */
export interface Step {
  edge: Edge;
  link?: { table: string; back: Edge };
}

export class ModelError extends Error {}

export class Model {
  readonly tables = new Map<string, TableInfo>();
  readonly edges: Edge[] = [];
  /** Measure names, globally (for `[Name]` references). */
  private measureIndex = new Map<string, Measure>();
  /** What-if parameters by lowercased name. */
  readonly parameters = new Map<string, Parameter>();
  /**
   * Link tables (ADR 0009, decision 1: inferred): two or more relationships out, no measures, and no numbers besides
   * keys, like product_tags (product_id → products, tag_id → tags). A query may pass through one from either side,
   * where no plain relationship reaches the table it needs.
   */
  readonly links = new Set<string>();

  /**
   * `notUnique`: relationship target columns ("table.column") found to have repeated values in the data (the session
   * checks them when the data loads). A relationship to one is kept, flagged: queries with measures refuse it.
   */
  constructor(schema: SchemaInfo, readonly spec: ModelSpec = {}, readonly notUnique: ReadonlySet<string> = new Set()) {
    for (const p of spec.parameters ?? []) if (p?.name) this.parameters.set(p.name.toLowerCase(), p);
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
      if (r.active === false || r.role) continue;
      const [ft, fc] = splitRef(r.from);
      const [tt, tc] = splitRef(r.to);
      if (this.tables.has(ft) && this.tables.has(tt)) this.edges.push({ from: { table: ft, column: fc }, to: { table: tt, column: tc }, ...(notUnique.has(`${tt}.${tc}`) ? { notUnique: true } : {}) });
    }
    // Roles: the target table again, under the role's name, joined through the role's own relationship. Only the
    // table itself: tables beyond it stay reached through the original (copying those relationships would make
    // every one of them reachable two ways, an ambiguous model).
    for (const r of rels) {
      const role = r.role?.trim();
      if (!role || r.active === false) continue;
      const [ft, fc] = splitRef(r.from);
      const [tt, tc] = splitRef(r.to);
      const src = this.tables.get(tt);
      if (!src || src.source || !this.tables.has(ft) || this.tables.has(role) || role.includes('.')) continue;
      this.tables.set(role, roleOf(src, role));
      this.edges.push({ from: { table: ft, column: fc }, to: { table: role, column: tc }, ...(notUnique.has(`${tt}.${tc}`) ? { notUnique: true } : {}) });
    }
    for (const t of this.tables.values()) {
      if (t.source || t.measures.size) continue;
      const out = this.edges.filter((e) => e.from.table === t.name);
      if (out.length < 2) continue;
      // A table of keys: no numbers besides its relationship columns and primary key. A fact table has quantities
      // to add up (even before its measures are written), so it never links its dimensions behind the author's back.
      const keys = new Set(out.map((e) => e.from.column));
      if ([...t.columns.values()].some((c) => !c.calc && c.type === 'number' && !c.pk && !keys.has(c.name))) continue;
      this.links.add(t.name);
    }
  }

  /** How a table is named in FROM and JOIN: a role is its source table under the role's name. */
  tableSql(name: string): string {
    const src = this.tables.get(name)?.source;
    return src ? `${quoteIdent(src)} AS ${quoteIdent(name)}` : quoteIdent(name);
  }

  /** Problems with the spec, for the designer's model view. */
  validate(): string[] {
    const out: string[] = [];
    for (const m of this.spec.measures ?? []) if (!this.tables.has(m.table)) out.push(`measure ${m.name}: unknown table ${m.table}`);
    for (const c of this.spec.columns ?? []) if (!this.tables.has(c.table)) out.push(`column ${c.name}: unknown table ${c.table}`);
    for (const r of this.spec.relationships ?? []) {
      const [ft, fc] = splitRef(r.from);
      const [tt, tc] = splitRef(r.to);
      const role = r.role?.trim();
      if (role && (role.includes('.') || (this.tables.get(role) && !this.tables.get(role)!.source))) out.push(`relationship ${r.from} → ${r.to}: the role name ${role} is ${role.includes('.') ? 'not usable (no dots)' : 'already a table'}`);
      if (!this.tables.get(ft)?.columns.has(fc)) out.push(`relationship ${r.from} → ${r.to}: unknown column ${r.from}`);
      if (!this.tables.get(tt)?.columns.has(tc)) out.push(`relationship ${r.from} → ${r.to}: unknown column ${r.to}`);
      else if (this.notUnique.has(`${tt}.${tc}`)) out.push(notUniqueMessage(r.from, r.to));
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
    if (m?.time) {
      const of = m.time.of.includes('.') ? m.time.of : `${t}.${m.time.of}`;
      const baseMeasure = this.tables.get(splitRef(of)[0])?.measures.get(splitRef(of)[1]) ?? this.measureIndex.get(m.time.of.toLowerCase());
      if (!baseMeasure) throw new ModelError(`${n}: its base measure ${m.time.of} does not exist`);
      if (baseMeasure.time) throw new ModelError(`${n}: its base measure ${baseMeasure.name} is a time-intelligence measure too; use a regular measure`);
      const base = this.resolve(`${baseMeasure.table}.${baseMeasure.name}`, 'measure');
      return { ref: spec.field, kind: 'measure', table: t, name: n, label: spec.label ?? n, expr: 'NULL', type: 'number', format: spec.format ?? m.format ?? base.format, tables: base.tables, time: { calc: m.time.calc, months: m.time.months ?? 3, base } };
    }
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
      // [@Name]: a what-if parameter, bound to its value when the query runs (bindParams).
      if (name.startsWith('@')) {
        const p = this.parameters.get(name.slice(1).trim().toLowerCase());
        if (!p) throw new ModelError(`unknown parameter ${name}: add it under Parameters in the model`);
        return paramToken(p.name);
      }
      let table = home;
      let field = name;
      if (name.includes('.') && this.tables.has(splitRef(name)[0])) [table, field] = splitRef(name);
      const tab = this.tables.get(table);
      const m = tab?.measures.get(field) ?? (name.includes('.') ? undefined : this.measureIndex.get(name.toLowerCase()));
      if (m?.time) throw new ModelError(`[${m.name}] is a time-intelligence measure, which works per period and can't be used inside another measure's SQL; use it in a visual directly`);
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

  /**
   * BFS along many → one edges; then, for tables still out of reach, through link tables (and on from there). Returns,
   * for each reachable table, the step used to reach it. A link is used only where no plain path exists, so links never
   * change a query that plain relationships answer.
   */
  private reach(root: string): Map<string, Step | null> {
    const seen = new Map<string, Step | null>([[root, null]]);
    const plain = (queue: string[]) => {
      while (queue.length) {
        const t = queue.shift()!;
        for (const e of this.edges) {
          if (e.from.table === t && !seen.has(e.to.table)) {
            seen.set(e.to.table, { edge: e });
            queue.push(e.to.table);
          }
        }
      }
    };
    plain([root]);
    for (let grew = this.links.size > 0; grew; ) {
      grew = false;
      for (const t of [...seen.keys()]) {
        for (const [back, edge] of this.linkHops(t)) {
          if (seen.has(edge.to.table)) continue;
          seen.set(edge.to.table, { edge, link: { table: back.from.table, back } });
          plain([edge.to.table]);
          grew = true;
        }
      }
    }
    return seen;
  }

  /** From table `t`, the hops through link tables: [the link's edge to t, the link's edge on to another table]. */
  private linkHops(t: string): [Edge, Edge][] {
    const out: [Edge, Edge][] = [];
    for (const back of this.edges) {
      if (back.to.table !== t || !this.links.has(back.from.table)) continue;
      for (const edge of this.edges) if (edge !== back && edge.from.table === back.from.table && edge.to.table !== t) out.push([back, edge]);
    }
    return out;
  }

  /** The table a step comes from. */
  private static prev(s: Step): string {
    return s.link ? s.link.back.to.table : s.edge.from.table;
  }

  /** The first link the path from `root` to `table` passes through (closest to root), or undefined. */
  linkOnPath(root: string, table: string, r = this.reach(root)): Step | undefined {
    let first: Step | undefined;
    const seen = new Set<string>();
    for (let t = table; t !== root && !seen.has(t); ) {
      seen.add(t);
      const s = r.get(t);
      if (!s) break;
      if (s.link) first = s;
      t = Model.prev(s);
    }
    return first;
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

  /**
   * Number of distinct active relationship paths from `root` to each table it reaches. Tables plain relationships
   * reach count those paths only; the others count their paths through link tables (two links between the same tables
   * are ambiguous), as reach() uses links only where no plain path exists.
   */
  pathCounts(root: string): Map<string, number> {
    const walk = (links: boolean) => {
      const count = new Map<string, number>();
      const go = (t: string, seen: Set<string>) => {
        for (const e of this.edges) {
          if (e.from.table !== t || seen.has(e.to.table)) continue;
          count.set(e.to.table, (count.get(e.to.table) ?? 0) + 1);
          go(e.to.table, new Set([...seen, e.to.table]));
        }
        if (!links) return;
        for (const [back, edge] of this.linkHops(t)) {
          if (seen.has(edge.to.table) || seen.has(back.from.table)) continue;
          count.set(edge.to.table, (count.get(edge.to.table) ?? 0) + 1);
          go(edge.to.table, new Set([...seen, back.from.table, edge.to.table]));
        }
      };
      go(root, new Set([root]));
      return count;
    };
    const plain = walk(false);
    if (!this.links.size) return plain;
    for (const [t, n] of walk(true)) if (!plain.has(t)) plain.set(t, n);
    return plain;
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

  /**
   * Refuse a query with measures that joins through a relationship to a non-unique column (ADR 0009): each row on the
   * many side would be counted once per repeated value, so every total would be too large. A query without measures
   * (a slicer's values) only lists distinct values, so it may still use the relationship.
   */
  assertCountable(root: string, needed: Iterable<string>): void {
    const r = this.reach(root);
    const seen = new Set<string>();
    const walk = (t: string): Edge | undefined => {
      if (seen.has(t)) return undefined;
      seen.add(t);
      const s = r.get(t);
      if (!s) return undefined;
      if (s.edge.notUnique) return s.edge;
      if (s.link?.back.notUnique) return s.link.back;
      return walk(Model.prev(s));
    };
    for (const t of needed) {
      const bad = walk(t);
      if (bad) throw new ModelError(notUniqueMessage(`${bad.from.table}.${bad.from.column}`, `${this.tables.get(bad.to.table)?.source ?? bad.to.table}.${bad.to.column}`));
    }
  }

  /**
   * The LEFT JOIN clauses that bring `needed` tables in, starting from `root`. Through a link table, the join goes
   * through the link's distinct pairs: each row of the root counts once in each group it links to, and duplicate
   * pairs in the link can't count it twice.
   */
  joins(root: string, needed: Iterable<string>): string[] {
    return this.joinChain(root, needed, this.reach(root));
  }

  private joinChain(start: string, needed: Iterable<string>, r: Map<string, Step | null>): string[] {
    const out: string[] = [];
    const added = new Set([start]);
    const Q = quoteIdent;
    const add = (t: string) => {
      if (added.has(t)) return;
      const s = r.get(t);
      if (!s) throw new ModelError(`${t} cannot be reached from ${start}`);
      add(Model.prev(s));
      added.add(t);
      const e = s.edge;
      if (s.link) {
        const { back } = s.link;
        const a = Model.linkAlias(s);
        out.push(`LEFT JOIN (SELECT DISTINCT ${Q(back.from.column)}, ${Q(e.from.column)} FROM ${Q(s.link.table)}) AS ${Q(a)} ON ${Q(a)}.${Q(back.from.column)} = ${Q(back.to.table)}.${Q(back.to.column)}`);
        out.push(`LEFT JOIN ${this.tableSql(e.to.table)} ON ${Q(a)}.${Q(e.from.column)} = ${Q(e.to.table)}.${Q(e.to.column)}`);
      } else {
        out.push(`LEFT JOIN ${this.tableSql(e.to.table)} ON ${Q(e.from.table)}.${Q(e.from.column)} = ${Q(e.to.table)}.${Q(e.to.column)}`);
      }
    };
    for (const t of needed) add(t);
    return out;
  }

  private static linkAlias(s: Step): string {
    return `${s.link!.table}:${s.edge.to.table}`;
  }

  /**
   * A filter condition over tables beyond a link table, as a semi-join (ADR 0009): `EXISTS (…)` correlated with the
   * table the link hangs off, so the rows being counted are never multiplied, whatever the visual groups by. Returns
   * the condition and the tables the outer query still needs (those before the link). Unchanged when no table of the
   * filter is beyond a link, or when the query already joins those tables to group by them (`joined`).
   */
  throughLinks(root: string, cond: string, tables: Iterable<string>, joined: ReadonlySet<string> = new Set()): { sql: string; tables: Set<string> } {
    // Already joined to group by (Revenue by tag, filtered to one tag): the condition applies to the joined rows, so
    // the other groups are left out, and each row is still counted once in each group that remains.
    const all = [...tables];
    if (all.every((t) => joined.has(t) || !this.linkOnPath(root, t))) return { sql: cond, tables: new Set(all) };
    const r = this.reach(root);
    const near = new Set<string>();
    const far: string[] = [];
    let hop: Step | undefined;
    for (const t of tables) {
      const s = this.linkOnPath(root, t, r);
      if (!s) {
        near.add(t);
        continue;
      }
      if (hop && Model.linkAlias(hop) !== Model.linkAlias(s)) throw new ModelError(`a filter over ${s.edge.to.table} and ${hop.edge.to.table} goes through two link tables; filter by each on its own`);
      hop = s;
      far.push(t);
    }
    if (!hop) return { sql: cond, tables: near };
    const Q = quoteIdent;
    const { back, table } = hop.link!;
    const a = Model.linkAlias(hop);
    const from = [
      `FROM (SELECT DISTINCT ${Q(back.from.column)}, ${Q(hop.edge.from.column)} FROM ${Q(table)}) AS ${Q(a)}`,
      `JOIN ${this.tableSql(hop.edge.to.table)} ON ${Q(a)}.${Q(hop.edge.from.column)} = ${Q(hop.edge.to.table)}.${Q(hop.edge.to.column)}`,
      ...this.joinChain(hop.edge.to.table, far, r),
    ].join(' ');
    const key = `${Q(back.to.table)}.${Q(back.to.column)}`;
    const mixed = near.size > 0;
    near.add(back.to.table);
    // Only tables beyond the link (a tag slicer, a click on a tag): the keys that link to them, uncorrelated. A
    // condition that also reads this side's tables (a selection of tag and region together) is correlated: EXISTS.
    // (The uncorrelated form is also the one smaltdb gets right when the link's pairs are a derived table: a
    // correlated EXISTS over a derived table joined to another table comes back empty there.)
    if (!mixed) return { sql: `${key} IN (SELECT ${Q(a)}.${Q(back.from.column)} ${from} WHERE ${cond})`, tables: near };
    return { sql: `EXISTS (SELECT 1 ${from} WHERE ${Q(a)}.${Q(back.from.column)} = ${key} AND (${cond}))`, tables: near };
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

// ------------------------------------------------------------------ parameters

/** The placeholder a `[@Name]` reference compiles to; bindParams replaces it with the value. */
export function paramToken(name: string): string {
  return `/*@param*/(@@${encodeURIComponent(name.toLowerCase())}@@)`;
}

/** A parameter's value for a query: the reader's, if valid for its type and range, else its default. */
export function paramValue(p: Parameter, given: unknown): number | string {
  if (p.type === 'number') {
    const n = typeof given === 'number' ? given : typeof given === 'string' && given.trim() !== '' ? Number(given) : NaN;
    let v = Number.isFinite(n) ? n : Number(p.value);
    if (!Number.isFinite(v)) v = 0;
    if (p.min !== undefined && v < p.min) v = p.min;
    if (p.max !== undefined && v > p.max) v = p.max;
    return v;
  }
  const t = typeof given === 'string' || typeof given === 'number' ? String(given) : String(p.value ?? '');
  return p.choices?.length && !p.choices.includes(t) ? String(p.value ?? p.choices[0]) : t;
}

/** Replace parameter placeholders in compiled SQL with SQL literals of their current values. */
export function bindParams(sql: string, model: Model, values: Record<string, unknown> = {}): string {
  if (!sql.includes('/*@param*/')) return sql;
  const byLower = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]));
  return sql.replace(/\/\*@param\*\/\(@@([^@]+)@@\)/g, (_, enc: string) => {
    const key = decodeURIComponent(enc);
    const p = model.parameters.get(key);
    if (!p) return 'NULL';
    const v = paramValue(p, byLower.get(key));
    return typeof v === 'number' ? `(${String(v)})` : `'${v.replace(/'/g, "''")}'`;
  });
}

/** `[@Name]` references in hand-written SQL (a visual's custom SQL) as placeholders, so bindParams can bind them. */
export function paramRefs(sql: string, model: Model): string {
  return sql.replace(/\[@([^\[\]]+)\]/g, (whole, name: string) => (model.parameters.has(name.trim().toLowerCase()) ? paramToken(name.trim()) : whole));
}

/** Placeholders back to `[@Name]`, for SQL shown to people (View SQL, Convert to SQL). */
export function showParams(sql: string, model: Model): string {
  return sql.replace(/\/\*@param\*\/\(@@([^@]+)@@\)/g, (_, enc: string) => `[@${model.parameters.get(decodeURIComponent(enc))?.name ?? decodeURIComponent(enc)}]`);
}

/** A role-playing copy of a table: the same columns (calculated ones pointed at the alias) and drill paths. */
function roleOf(src: TableInfo, role: string): TableInfo {
  const own = new RegExp(`(^|[^\\w".])(?:"${src.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/"/g, '""')}"|${src.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\s*\\.`, 'g');
  const columns = new Map<string, ColumnInfo>();
  for (const [n, c] of src.columns) columns.set(n, { ...c, table: role, ...(c.calc && c.sql ? { sql: c.sql.replace(own, (_m, pre: string) => `${pre}${quoteIdent(role)}.`) } : {}) });
  const hierarchies = new Map([...src.hierarchies].map(([n, h]) => [n, { ...h, table: role }]));
  return { name: role, label: role, kind: 'ROLE', source: src.name, hidden: src.hidden, description: `${src.label} as ${role}`, columns, measures: new Map(), hierarchies };
}

/** Why a relationship to a non-unique column is refused, and what to do (ADR 0009). */
export function notUniqueMessage(from: string, to: string): string {
  const [ft] = splitRef(from);
  return `${to} is not unique: the relationship ${from} → ${to} would count ${ft} rows more than once. Point it at a column with one row per value (a table of ${splitRef(to)[1]} values).`;
}
