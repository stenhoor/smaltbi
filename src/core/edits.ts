// Changes to a report: the designer's edits as functions of the report document, so that a person in the designer and
// the agent's actions change a report through the same code (smaltworks DECISIONS.md, "smaltbi's actions for the
// agent", 2026-11-23; smaltworks ADR 0025 §4). Each function takes the report and what it changes, by id, and changes
// the report in place. The designer calls them inside `DocStore.change`, which records the undo step and refreshes what
// depends on the kind of change. They use neither the DOM nor the engine.
//
// A function whose target isn't in the report (a page, a visual, a relationship, a measure…) throws an `EditError`
// and changes nothing (the owner, 2026-11-24); `DocStore.change` then records no undo step. Tables aren't listed in the
// report (they come from the data), so a function that names a table doesn't check it. The designer gives a new page or
// visual an id no other page or visual of the report has (`newId`), and finds a visual by the first with its id
// (`DocStore.visual`); these functions find one the same way.
import type { SchemaInfo } from './model.js';
import type { Aggregation, CalcColumn, ConditionalRule, DataSpec, FieldRef, Filter, Hierarchy, Measure, Page, PageSize, Parameter, PluginRef, Relationship, Report, TableSettings, Theme, Visual } from './types.js';

// ---------------------------------------------------------------- ids, places and lookups

/**
 * A change the report can't take: its target isn't in the report (`no page "page7"`), or the name it gives a measure or
 * a calculated column is taken.
 */
export class EditError extends Error {}

const missing = (what: string): never => {
  throw new EditError(`no ${what}`);
};

/** The first `prefix` followed by a number that isn't in `taken`. */
export function newId(prefix: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  for (let i = 1; ; i++) if (!set.has(`${prefix}${i}`)) return `${prefix}${i}`;
}

/** First free spot of size w×h on a 12-column page. */
export function freeSpot(page: Page, w: number, h: number, cols = 12): { x: number; y: number } {
  const taken = (x: number, y: number) => page.visuals.some((v) => x < v.layout.x + v.layout.w && x + w > v.layout.x && y < v.layout.y + v.layout.h && y + h > v.layout.y);
  for (let y = 0; y < 200; y++) for (let x = 0; x + w <= cols; x++) if (!taken(x, y)) return { x, y };
  return { x: 0, y: Math.max(0, ...page.visuals.map((v) => v.layout.y + v.layout.h)) };
}

/** The page with this id. */
export function findPage(report: Report, id: string): Page | undefined {
  return report.pages.find((p) => p.id === id);
}

/** The first visual with this id, and its page. */
export function findVisual(report: Report, id: string): { page: Page; visual: Visual } | undefined {
  for (const page of report.pages) {
    const visual = page.visuals.find((v) => v.id === id);
    if (visual) return { page, visual };
  }
  return undefined;
}

/** Every visual's id, page by page. */
export function visualIds(report: Report): string[] {
  return report.pages.flatMap((p) => p.visuals.map((v) => v.id));
}

const pageOf = (report: Report, id: string): Page => findPage(report, id) ?? missing(`page "${id}"`);
const visualOf = (report: Report, id: string): Visual => findVisual(report, id)?.visual ?? missing(`visual "${id}"`);
const visualOn = (page: Page, id: string): Visual => page.visuals.find((v) => v.id === id) ?? missing(`visual "${id}" on page "${page.id}"`);
const itemAt = <T>(list: readonly T[] | undefined, index: number, what: string): T => (Number.isInteger(index) && index >= 0 && index < (list?.length ?? 0) ? list![index]! : missing(what));

// ---------------------------------------------------------------- the report

/** Names the report; an empty name is "Untitled report". */
export function renameReport(report: Report, name: string): void {
  report.name = name || 'Untitled report';
}

/** The report's data: its database and data steps. */
export function setData(report: Report, data: DataSpec): void {
  report.data = data;
}

/** The report's theme: a built-in theme's name, or a theme. */
export function setTheme(report: Report, theme: Theme | string): void {
  report.theme = theme;
}

/** Shows or hides the "Powered by smaltbi" badge in the viewer. Shown is the default, so only hiding it is written. */
export function setPoweredBy(report: Report, shown: boolean): void {
  const branding = { ...(report.branding ?? {}), poweredBy: shown };
  if (branding.poweredBy) delete (branding as { poweredBy?: boolean }).poweredBy;
  report.branding = Object.keys(branding).length ? branding : undefined;
  if (!report.branding) delete report.branding;
}

/** Adds a plugin to the report. */
export function addPlugin(report: Report, ref: PluginRef): void {
  report.plugins = [...(report.plugins ?? []), ref];
}

/** Removes the plugin at `index` of the report's plugins. */
export function removePlugin(report: Report, index: number): void {
  itemAt(report.plugins, index, `plugin at ${index}`);
  report.plugins = (report.plugins ?? []).filter((_, j) => j !== index);
  if (!report.plugins.length) delete report.plugins;
}

// ---------------------------------------------------------------- filters

/** Where a filter applies: every page (`'report'`), one page, or one visual. */
export type FilterScope = 'report' | { page: string } | { visual: string };

function filtersAt(report: Report, scope: FilterScope): { filters?: Filter[] } {
  if (scope === 'report') return report;
  return 'page' in scope ? pageOf(report, scope.page) : visualOf(report, scope.visual);
}

/** Replaces the filters of the report, a page or a visual. */
export function setFilters(report: Report, scope: FilterScope, filters: Filter[]): void {
  filtersAt(report, scope).filters = filters;
}

/** Adds a filter after the others of the report, a page or a visual. */
export function addFilter(report: Report, scope: FilterScope, filter: Filter): void {
  const holder = filtersAt(report, scope);
  holder.filters = [...(holder.filters ?? []), filter];
}

// ---------------------------------------------------------------- pages

/** Adds an empty page at the end, named "Page" and its number. Returns its id. */
export function addPage(report: Report): string {
  const id = newId('page', report.pages.map((p) => p.id));
  report.pages.push({ id, name: `Page ${report.pages.length + 1}`, visuals: [] });
  return id;
}

/** Renames a page; an empty name keeps the page's name. */
export function renamePage(report: Report, id: string, name: string): void {
  const p = pageOf(report, id);
  p.name = name || p.name;
}

/** Hides a page in the viewer, or shows it again. */
export function setPageHidden(report: Report, id: string, hidden: boolean): void {
  pageOf(report, id).hidden = hidden || undefined;
}

/** Copies a page after it, named with " (copy)", its visuals with new ids. Returns the copy's id. */
export function duplicatePage(report: Report, id: string): string {
  const p = pageOf(report, id);
  const copy = structuredClone(p);
  copy.id = newId('page', report.pages.map((x) => x.id));
  copy.name = p.name + ' (copy)';
  const taken = visualIds(report);
  for (const v of copy.visuals) {
    v.id = newId('v', taken);
    taken.push(v.id);
  }
  report.pages.splice(report.pages.indexOf(p) + 1, 0, copy);
  return copy.id;
}

/** Moves a page `by` places (negative: to the left), stopping at either end. */
export function movePage(report: Report, id: string, by: number): void {
  const i = report.pages.findIndex((p) => p.id === id);
  if (i < 0) missing(`page "${id}"`);
  const [p] = report.pages.splice(i, 1);
  report.pages.splice(Math.max(0, Math.min(report.pages.length, i + by)), 0, p!);
}

/** Removes a page. A report keeps at least one page (the designer offers no Delete on the last). */
export function removePage(report: Report, id: string): void {
  pageOf(report, id);
  if (report.pages.length < 2) throw new EditError('a report keeps at least one page');
  report.pages = report.pages.filter((p) => p.id !== id);
}

/** Adds a drill-through field to a page (a field already there isn't added twice). */
export function addDrillthrough(report: Report, pageId: string, field: string): void {
  const p = pageOf(report, pageId);
  p.drillthrough = [...new Set([...(p.drillthrough ?? []), field])];
}

/** Removes the drill-through field at `index` of a page's. */
export function removeDrillthrough(report: Report, pageId: string, index: number): void {
  const p = pageOf(report, pageId);
  itemAt(p.drillthrough, index, `drill-through field at ${index} on page "${pageId}"`);
  p.drillthrough = (p.drillthrough ?? []).filter((_, j) => j !== index);
}

/** A page's fixed size, or none: responsive. */
export function setPageSize(report: Report, pageId: string, size: PageSize | undefined): void {
  const p = pageOf(report, pageId);
  if (size) p.size = size;
  else delete p.size;
}

/** The rows of a page with a fixed size. */
export function setPageRows(report: Report, pageId: string, rows: number): void {
  const p = pageOf(report, pageId);
  p.layout = { ...(p.layout ?? {}), rows };
}

/** The order of a page's visuals on phones (ids), or none: reading order. */
export function setPhoneOrder(report: Report, pageId: string, order: string[] | undefined): void {
  const p = pageOf(report, pageId);
  if (order) p.phoneOrder = order;
  else delete p.phoneOrder;
}

// ---------------------------------------------------------------- visuals on a page

/** The size a new visual of a type starts at, in grid cells. */
export function newVisualSize(type: string): { w: number; h: number } {
  return type === 'card' ? { w: 3, h: 2 } : type === 'slicer' ? { w: 3, h: 3 } : type === 'text' ? { w: 6, h: 1 } : { w: 5, h: 5 };
}

/**
 * Adds a visual of a type to a page, with these fields: at `at`, else at the first free spot of a page of `columns`
 * columns. Returns its id.
 */
export function createVisual(report: Report, pageId: string, type: string, fields: Record<string, FieldRef[]>, place: { at?: { x: number; y: number }; columns: number }): string {
  const page = pageOf(report, pageId);
  const size = newVisualSize(type);
  const spot = place.at ?? freeSpot(page, size.w, size.h, place.columns);
  const v: Visual = { id: newId('v', visualIds(report)), type, layout: { x: Math.min(spot.x, 12 - size.w), y: spot.y, ...size }, fields };
  page.visuals.push(v);
  return v.id;
}

/** Adds visuals, as they are, to a page (pasted ones: `placePasted` gives them ids and places). */
export function addVisuals(report: Report, pageId: string, visuals: Visual[]): void {
  pageOf(report, pageId).visuals.push(...visuals);
}

/** Removes visuals from a page; each must be on it. */
export function removeVisuals(report: Report, pageId: string, ids: Iterable<string>): void {
  const page = pageOf(report, pageId);
  const drop = new Set(ids);
  for (const id of drop) visualOn(page, id);
  page.visuals = page.visuals.filter((v) => !drop.has(v.id));
}

/** Copies a visual of a page onto the page's first free spot of its size. Returns the copy's id. */
export function duplicateVisual(report: Report, pageId: string, id: string): string {
  const page = pageOf(report, pageId);
  const v = visualOn(page, id);
  const copy = structuredClone(v);
  copy.id = newId('v', visualIds(report));
  copy.layout = { ...copy.layout, ...freeSpot(page, v.layout.w, v.layout.h) };
  page.visuals.push(copy);
  return copy.id;
}

/** New places and sizes for visuals of a page, by id (moved, resized, aligned or nudged together); each must be on it. */
export function setLayouts(report: Report, pageId: string, layouts: Iterable<readonly [string, Visual['layout']]>): void {
  const page = pageOf(report, pageId);
  const found = [...layouts].map(([id, layout]) => [visualOn(page, id), layout] as const);
  for (const [v, layout] of found) v.layout = layout;
}

// ---------------------------------------------------------------- one visual

/** A visual's place and size. */
export function setVisualLayout(report: Report, id: string, layout: Visual['layout']): void {
  const v = visualOf(report, id);
  v.layout = layout;
}

/** A visual's title or subtitle; empty takes it off. */
export function setVisualText(report: Report, id: string, which: 'title' | 'subtitle', text: string): void {
  const v = visualOf(report, id);
  v[which] = text || undefined;
}

/** Sets one of a visual's options; `undefined` takes it off, so its default applies (the owner, 2026-11-24). */
export function setVisualOption(report: Report, id: string, key: string, value: unknown): void {
  const v = visualOf(report, id);
  const o = { ...(v.options ?? {}) };
  if (value === undefined) delete o[key];
  else o[key] = value;
  v.options = o;
}

/** The most rows a visual's query returns; 0 or none: the visual type's own limit. */
export function setVisualLimit(report: Report, id: string, limit: number | undefined): void {
  const v = visualOf(report, id);
  v.limit = limit || undefined;
}

/** Whether a visual's selections filter the others, or the others' filter it. */
export function setInteraction(report: Report, id: string, key: 'filterOthers' | 'filteredByOthers', on: boolean): void {
  const v = visualOf(report, id);
  v.interactions = { ...(v.interactions ?? {}), [key]: on };
}

/** Overrides one of the theme's tokens for a visual (`surface`: its background). */
export function setVisualStyle(report: Report, id: string, key: string, value: string | number): void {
  const v = visualOf(report, id);
  v.style = { ...(v.style ?? {}), [key]: value };
}

/** Back to the theme's style for a visual. */
export function resetVisualStyle(report: Report, id: string): void {
  const v = visualOf(report, id);
  delete v.style;
}

/** How a visual shows on phones: hidden there, or its own height in rows. What isn't set is taken off. */
export function setVisualPhone(report: Report, id: string, next: Visual['phone']): void {
  const v = visualOf(report, id);
  const clean = { ...(v.phone ?? {}), ...next };
  if (!clean.hidden) delete clean.hidden;
  if (!clean.h) delete clean.h;
  if (Object.keys(clean).length) v.phone = clean;
  else delete v.phone;
}

/** A visual's custom SQL, or none: the generated query. */
export function setCustomSql(report: Report, id: string, sql: string | undefined): void {
  const v = visualOf(report, id);
  if (sql === undefined) delete v.sql;
  else v.sql = sql;
}

/** Repeats a visual for each value of a field, or stops repeating it. */
export function setRepeat(report: Report, id: string, repeat: Visual['repeat']): void {
  const v = visualOf(report, id);
  if (repeat) v.repeat = repeat;
  else delete v.repeat;
}

/** A visual's conditional formatting rules, in order (the first that matches applies). */
export function setConditional(report: Report, id: string, rules: ConditionalRule[]): void {
  const v = visualOf(report, id);
  v.conditional = rules.length ? rules : undefined;
}

// ---------------------------------------------------------------- a visual's fields

/** What the edits need of a visual type's data role (`RoleDef` in visuals/api.ts). */
export interface RoleShape {
  name: string;
  kind: 'dimension' | 'measure';
  max?: number;
  drill?: boolean;
}

/**
 * Changes a visual's type: its fields move to the new type's roles, dimensions to dimension roles and measures to
 * measure roles, in order and up to each role's maximum; its options are taken off.
 */
export function changeVisualType(report: Report, id: string, type: string, roles: { from: readonly RoleShape[]; to: readonly RoleShape[] }): void {
  const v = visualOf(report, id);
  const dims: FieldRef[] = [];
  const measures: FieldRef[] = [];
  for (const r of roles.from) for (const f of v.fields[r.name] ?? []) (r.kind === 'dimension' ? dims : measures).push(f);
  const fields: Record<string, FieldRef[]> = {};
  const fill = (list: FieldRef[], kind: 'dimension' | 'measure') => {
    for (const role of roles.to.filter((r) => r.kind === kind)) {
      const n = role.max ?? (role.drill || kind === 'measure' ? list.length : list.length);
      const take = list.splice(0, n);
      if (take.length) fields[role.name] = take;
    }
  };
  fill(dims, 'dimension');
  fill(measures, 'measure');
  v.type = type;
  v.fields = fields;
  v.options = undefined;
}

/** Adds a field at the end of one of a visual's roles. */
export function addField(report: Report, id: string, role: string, field: FieldRef): void {
  const v = visualOf(report, id);
  v.fields = { ...v.fields, [role]: [...(v.fields[role] ?? []), field] };
}

function editRole(report: Report, id: string, role: string, index: number, fn: (list: FieldRef[]) => void): void {
  const v = visualOf(report, id);
  itemAt(v.fields[role], index, `field at ${index} in ${role} of visual "${id}"`);
  const list = [...(v.fields[role] ?? [])];
  fn(list);
  v.fields = { ...v.fields, [role]: list };
}

/** Replaces the field at `index` of a visual's role (with another aggregation or label: {@link withAgg}, {@link withLabel}). */
export function setField(report: Report, id: string, role: string, index: number, field: FieldRef): void {
  editRole(report, id, role, index, (l) => (l[index] = field));
}

/** Moves the field at `from` of a visual's role to `to`. */
export function moveField(report: Report, id: string, role: string, from: number, to: number): void {
  editRole(report, id, role, from, (l) => l.splice(to, 0, l.splice(from, 1)[0]!));
}

/** Removes the field at `index` of a visual's role. */
export function removeField(report: Report, id: string, role: string, index: number): void {
  editRole(report, id, role, index, (l) => l.splice(index, 1));
}

/** A field with an aggregation (a column in a measure role). */
export function withAgg(field: FieldRef, agg: Aggregation): FieldRef {
  const spec = typeof field === 'string' ? { field } : field;
  return { ...spec, agg };
}

/** A field with a label for one visual; an empty label takes the label off. */
export function withLabel(field: FieldRef, label: string): FieldRef {
  const spec = typeof field === 'string' ? { field } : field;
  return label ? { ...spec, label } : spec.agg ? { field: spec.field, agg: spec.agg } : spec.field;
}

/** A field dragged from one of a visual's roles: where it was, and its aggregation and label. */
export interface MovedField {
  visual: string;
  role: string;
  i: number;
  spec: FieldRef;
}

/**
 * Fields dropped into one of a visual's roles, before the field at `at` (the end: the role's length). A field moved
 * within the same visual leaves its old place and keeps its label, and its aggregation unless the role is a dimension.
 * A role with a maximum keeps the dropped fields, and as many of the others as fit.
 */
export function dropFields(report: Report, id: string, role: RoleShape, at: number, refs: FieldRef[], move?: MovedField | null): void {
  const v = visualOf(report, id);
  if (move && move.visual === v.id) itemAt(v.fields[move.role], move.i, `field at ${move.i} in ${move.role} of visual "${id}"`);
  const fields = { ...v.fields };
  let incoming: FieldRef[] = refs;
  if (move && move.visual === v.id) {
    // A chip moved within this visual: take it out of its well (keeping its aggregation and label).
    const from = [...(fields[move.role] ?? [])];
    from.splice(move.i, 1);
    fields[move.role] = from;
    if (move.role === role.name && move.i < at) at--;
    const spec = move.spec;
    // A dimension well has no aggregation.
    incoming = [role.kind === 'dimension' && typeof spec !== 'string' && spec.agg ? (spec.label ? { field: spec.field, label: spec.label } : spec.field) : spec];
  }
  const list = [...(fields[role.name] ?? [])];
  list.splice(at, 0, ...incoming);
  // A well with a maximum keeps the dropped fields (and as many of the others as fit).
  if (role.max && list.length > role.max) {
    const keep = new Set(incoming);
    let extra = list.length - role.max;
    for (let j = list.length - 1; j >= 0 && extra > 0; j--) if (!keep.has(list[j]!)) (list.splice(j, 1), extra--);
    list.splice(role.max);
  }
  fields[role.name] = list;
  v.fields = fields;
}

// ---------------------------------------------------------------- the model

/** Changes a table's settings (its display name, whether it is hidden in the fields list). */
export function setTableSettings(report: Report, table: string, patch: Partial<TableSettings>): void {
  const tables = { ...(report.model.tables ?? {}) };
  tables[table] = { ...(tables[table] ?? {}), ...patch };
  report.model.tables = tables;
}

/** Adds a hierarchy (a drill path). */
export function addHierarchy(report: Report, hierarchy: Hierarchy): void {
  report.model.hierarchies = [...(report.model.hierarchies ?? []), hierarchy];
}

/** Removes a table's hierarchies with this name. */
export function removeHierarchy(report: Report, table: string, name: string): void {
  if (!(report.model.hierarchies ?? []).some((y) => y.table === table && y.name === name)) missing(`hierarchy "${name}" on ${table}`);
  report.model.hierarchies = (report.model.hierarchies ?? []).filter((y) => !(y.table === table && y.name === name));
}

/** Adds relationships after the model's others. */
export function addRelationships(report: Report, relationships: Relationship[]): void {
  report.model.relationships = [...(report.model.relationships ?? []), ...relationships];
}

/** Changes the relationship at `index` of the model's. */
export function updateRelationship(report: Report, index: number, patch: Partial<Relationship>): void {
  itemAt(report.model.relationships, index, `relationship at ${index}`);
  report.model.relationships = (report.model.relationships ?? []).map((x, i) => (i === index ? { ...x, ...patch } : x));
}

/** Removes the relationship at `index` of the model's. */
export function removeRelationship(report: Report, index: number): void {
  itemAt(report.model.relationships, index, `relationship at ${index}`);
  report.model.relationships = (report.model.relationships ?? []).filter((_, i) => i !== index);
}

/** Where a table's card sits in the model diagram (pixels). */
export function setTablePosition(report: Report, table: string, at: { x: number; y: number }): void {
  report.model.layout = { ...(report.model.layout ?? {}), [table]: at };
}

/** Back to the model diagram's own arrangement. */
export function resetDiagram(report: Report): void {
  delete report.model.layout;
}

const entryName = (list: 'measures' | 'columns', table: string, name: string) => `${list === 'measures' ? 'measure' : 'calculated column'} ${table}.${name}`;

/** True if the model has a measure or calculated column with this table and name. */
export function hasEntry(report: Report, list: 'measures' | 'columns', table: string, name: string): boolean {
  return ((report.model[list] ?? []) as (Measure | CalcColumn)[]).some((x) => x.table === table && x.name === name);
}

/**
 * True if another measure of the model, in any table, has this name, whatever its case (as `[Name]` refers to it). The
 * measure being edited, `except` (the first with its table and name, the one {@link putEntry} replaces), doesn't count.
 */
export function measureNameTaken(report: Report, name: string, except?: { table: string; name: string }): boolean {
  const measures = report.model.measures ?? [];
  const skip = except ? measures.findIndex((m) => m.table === except.table && m.name === except.name) : -1;
  return measures.some((m, i) => i !== skip && m.name.toLowerCase() === name.toLowerCase());
}

/**
 * True if a calculated column can't have this name on its table: the table already has a field by that name, whatever
 * its case (the owner, 2026-11-24). A table's fields are what `table.Name` finds: its data's columns (from `schema`),
 * its calculated columns, its measures and its hierarchies. The column being edited, `except` (the first with its table
 * and name, the one {@link putEntry} replaces), doesn't count.
 */
export function columnNameTaken(report: Report, schema: SchemaInfo, table: string, name: string, except?: { table: string; name: string }): boolean {
  const calc = report.model.columns ?? [];
  const skip = except ? calc.findIndex((c) => c.table === except.table && c.name === except.name) : -1;
  const names = [
    ...(schema.tables.find((t) => t.name === table)?.columns.map((c) => c.name) ?? []),
    ...calc.filter((c, i) => i !== skip && c.table === table).map((c) => c.name),
    ...(report.model.measures ?? []).filter((m) => m.table === table).map((m) => m.name),
    ...(report.model.hierarchies ?? []).filter((h) => h.table === table).map((h) => h.name),
  ];
  return names.some((n) => n.toLowerCase() === name.toLowerCase());
}

/**
 * Adds a measure or a calculated column, or replaces the first with the table and name of `replacing`
 * (one being edited). A measure whose name another measure has is refused ({@link measureNameTaken}), and so is a
 * calculated column whose name its table already has ({@link columnNameTaken}, which needs the data's `schema`); the
 * owner, 2026-11-24.
 */
export function putEntry(report: Report, list: 'measures' | 'columns', entry: Measure | CalcColumn, replacing?: { table: string; name: string }, schema?: SchemaInfo): void {
  const l = [...((report.model[list] ?? []) as (Measure | CalcColumn)[])];
  const i = replacing ? l.findIndex((x) => x.table === replacing.table && x.name === replacing.name) : -1;
  if (replacing && i < 0) missing(entryName(list, replacing.table, replacing.name));
  if (list === 'measures' && measureNameTaken(report, entry.name, replacing)) throw new EditError(`a measure named ${entry.name} already exists`);
  if (list === 'columns') {
    if (!schema) throw new Error("putEntry needs the data's schema for a calculated column");
    if (columnNameTaken(report, schema, entry.table, entry.name, replacing)) throw new EditError(`${entry.table} already has a field named ${entry.name}`);
  }
  if (i >= 0) l[i] = entry;
  else l.push(entry);
  (report.model[list] as (Measure | CalcColumn)[]) = l;
}

/**
 * Removes a measure or a calculated column by its table and name: the first with them, or with `'all'` every one. (The
 * measure dialog removes the first, the quick-measure dialog every one.)
 */
export function removeEntry(report: Report, list: 'measures' | 'columns', table: string, name: string, which: 'first' | 'all' = 'first'): void {
  const l = (report.model[list] ?? []) as (Measure | CalcColumn)[];
  const matches = (x: Measure | CalcColumn) => x.table === table && x.name === name;
  const first = l.findIndex(matches);
  if (first < 0) missing(entryName(list, table, name));
  (report.model[list] as (Measure | CalcColumn)[]) = which === 'all' ? l.filter((x) => !matches(x)) : l.filter((_, j) => j !== first);
}

/** The model's what-if parameters; none takes them off. */
export function setParameters(report: Report, parameters: Parameter[]): void {
  if (parameters.length) report.model.parameters = parameters;
  else delete report.model.parameters;
}
