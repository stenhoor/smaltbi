// smaltbi's actions for the agent, part A1: reading the report and its tables, and changing the report's pages,
// visuals, filters, name, theme and table settings (smaltworks DECISIONS.md, "smaltbi's actions for the agent").
//
// - Every change goes through core/edits.ts inside DocStore.change, the code the designer uses, so an action does what a
//   person can do and can be undone like a person's change (smaltworks ADR 0025 §4). One action is one undo step.
// - A change is a write that asks first until the user allows it (the owner, 2026-11-24). Reading the report and the
//   names of tables and columns is the "schema" level, granted by default (ADR 0025 §5).
// - Tables and columns the user excluded are never shown to the model, and can't be used by it (ADR 0043 §4).
// - smaltai checks each call's input against its schema before it runs (stenhoor/smaltai#9). What a schema can't say
//   (that a page exists, that a field is in the model) is checked here before anything changes, so an action that makes
//   several edits never stops half way.
import { columnAllowed, tableAllowed, type Action, type DataGrant, type Grants } from '@smaltworks/smaltai';
import * as edit from '../core/edits.js';
import type { Model } from '../core/model.js';
import { splitRef } from '../core/sql.js';
import type { Filter, FieldRef, Page, PageSize, Report, Theme, Visual } from '../core/types.js';
import { BUILTIN_THEMES, pageLayout } from '../theme/theme.js';
import { visualDef, visualDefs, type OptionDef, type VisualDef } from '../visuals/api.js';
import type { ChangeKind, DocStore } from '../designer/store.js';

/** What the actions work on: the designer's document and its current model. */
export interface ReportActionContext {
  store: DocStore;
  /** The model as it is now (the designer's session rebuilds it after a model change). */
  model(): Model;
  /** The report's theme, for the page grid a new visual is placed on. */
  theme(): Theme;
  /** The grants for this endpoint and database: what the model may see. */
  grants(): Promise<Grants>;
  /** The report's database, as the grants name it. */
  database: string;
}

/** What the model is shown in place of a table, column or expression the user excluded. */
export const WITHHELD = '(withheld)';

// ---------------------------------------------------------------- schemas (smaltai's subset of JSON Schema)

const text = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra });
const id = (what: string) => text(`The ${what}'s id, from get_report.`, { minLength: 1 });
const AGGREGATIONS = ['sum', 'avg', 'min', 'max', 'count', 'countd', 'none'];
const FIELD = {
  anyOf: [
    text('A field: "table.column", "table.Measure" or "table.Hierarchy".', { pattern: '^[^.]+\\..+$' }),
    {
      type: 'object',
      properties: {
        field: text('A field: "table.column", "table.Measure" or "table.Hierarchy".', { pattern: '^[^.]+\\..+$' }),
        agg: { enum: AGGREGATIONS, description: 'How a column in a value role is aggregated.' },
        label: text('Its label in this visual.'),
      },
      required: ['field'],
      additionalProperties: false,
    },
  ],
};
const FIELDS = { type: 'object', description: 'Fields by role name (see list_visual_types).', additionalProperties: { type: 'array', items: FIELD } };
const SCOPE = {
  description: 'Where the filter applies: "report" (every page), {"page": id} or {"visual": id}.',
  anyOf: [
    { const: 'report' },
    { type: 'object', properties: { page: id('page') }, required: ['page'], additionalProperties: false },
    { type: 'object', properties: { visual: id('visual') }, required: ['visual'], additionalProperties: false },
  ],
};
/** Every filter operator but `sql` (a raw SQL condition) and `tuples` (the designer's own cross-filter selections). */
const FILTER_OPS = ['in', 'not-in', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'contains', 'starts-with', 'is-null', 'not-null', 'top'];
const VALUE = { type: ['string', 'number', 'null'] };
const FILTER = {
  type: 'object',
  properties: {
    field: text('The field filtered: "table.column" or "table.Measure".', { pattern: '^[^.]+\\..+$' }),
    op: { enum: FILTER_OPS },
    values: { type: 'array', items: VALUE, description: 'in / not-in: the values; between: [from, to]; top: [n]; the others: [value].' },
    by: text('For top: the measure ranked by, "table.Measure".'),
    label: text('A label for the filter pane.'),
    locked: { type: 'boolean', description: 'Shown, but readers cannot change it.' },
  },
  required: ['field', 'op'],
  additionalProperties: false,
};
const LAYOUT = {
  type: 'object',
  description: 'Place and size on the page grid, in cells.',
  properties: { x: { type: 'integer', minimum: 0 }, y: { type: 'integer', minimum: 0 }, w: { type: 'integer', minimum: 1 }, h: { type: 'integer', minimum: 1 } },
  required: ['x', 'y', 'w', 'h'],
  additionalProperties: false,
};
const PAGE_SIZE = {
  type: ['object', 'null'],
  description: 'A fixed page size, or null for responsive (fits the window).',
  properties: {
    preset: { enum: ['16:9', '4:3', 'letter', 'a4', 'custom'] },
    landscape: { type: 'boolean' },
    width: { type: 'integer', minimum: 100, maximum: 10000 },
    height: { type: 'integer', minimum: 100, maximum: 10000 },
  },
  required: ['preset'],
  additionalProperties: false,
};
const CONDITIONAL = {
  type: 'object',
  properties: {
    apply: text('The measure values it formats: a field of the visual, or "*" for every measure.'),
    test: text('Test another measure in the same row instead of the value.'),
    op: { enum: ['gt', 'gte', 'lt', 'lte', 'eq', 'ne', 'between', 'blank', 'positive', 'negative'] },
    value: { type: 'number' },
    value2: { type: 'number' },
    compare: text('Compare with another measure in the same row.'),
    tone: { enum: ['good', 'bad', 'warn', 'accent'] },
    fill: { type: 'boolean' },
    icon: { enum: ['up', 'down', 'flat', 'check', 'cross', 'warn', 'dot'] },
  },
  required: ['apply', 'op'],
  additionalProperties: false,
};
const REPEAT = {
  type: ['object', 'null'],
  description: 'Repeat the visual for each value of a field (a dimension), or null to stop.',
  properties: {
    field: text('The field whose values each get a copy.', { pattern: '^[^.]+\\..+$' }),
    columns: { type: 'integer', minimum: 1, maximum: 12 },
    max: { type: 'integer', minimum: 1, maximum: 100 },
    order: { enum: ['asc', 'desc'] },
    overflow: { enum: ['scroll', 'expand'] },
  },
  required: ['field'],
  additionalProperties: false,
};
const OBJECT = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const DONE = OBJECT({ ok: { const: true }, page: text('A new page id.'), visual: text('A new visual id.') }, ['ok']);

// ---------------------------------------------------------------- the actions

export function reportActions(ctx: ReportActionContext): Action[] {
  const touches = { database: ctx.database, rows: false, document: 'report' };
  const read = (name: string, description: string, inputSchema: Record<string, unknown>, resultSchema: Record<string, unknown>, run: (input: Record<string, unknown>) => Promise<unknown>): Action => ({
    name, description, inputSchema, resultSchema, kind: 'read', touches, undoable: true, reads: 'schema', run: (input) => run(input),
  });
  const write = (name: string, description: string, inputSchema: Record<string, unknown>, run: (input: Record<string, unknown>) => Promise<unknown>): Action => ({
    name, description, inputSchema, resultSchema: DONE, kind: 'write', touches, undoable: true, grantedByDefault: false, run: (input) => run(input),
  });
  /** A write that stores SQL the model wrote, which the report then runs: smaltai asks for it until the user grants it by name. */
  const code = (name: string, description: string, inputSchema: Record<string, unknown>, run: (input: Record<string, unknown>) => Promise<unknown>): Action => ({
    ...write(name, description, inputSchema, run), runsCode: true,
  });
  const report = () => ctx.store.report;
  const grant = async () => (await ctx.grants()).data;
  const change = <T>(kind: ChangeKind, fn: (r: Report) => T, at?: string) => ctx.store.change(kind, fn, at);

  /** A field the model may use: in the model, and not excluded. */
  const checkField = (g: DataGrant, ref: string): void => {
    const [table, name] = splitRef(ref);
    if (!ctx.model().kindOf(ref) || !fieldAllowed(g, table, name)) throw new Error(`no field ${ref} (list_tables gives the fields)`);
  };
  const refName = (f: FieldRef) => (typeof f === 'string' ? f : f.field);
  const pageOf = (pageId: string): Page => edit.findPage(report(), pageId) ?? missing(`page "${pageId}"`);
  const visualOf = (visualId: string): { page: Page; visual: Visual } => edit.findVisual(report(), visualId) ?? missing(`visual "${visualId}"`);
  const defOf = (type: string): VisualDef => visualDef(type) ?? fail(`no visual type ${type} (list_visual_types gives them)`);
  const checkFields = (g: DataGrant, def: VisualDef, fields: Record<string, FieldRef[]>) => {
    for (const [role, refs] of Object.entries(fields)) {
      const r = def.roles.find((x) => x.name === role) ?? fail(`${def.type} has no role ${role}: it has ${def.roles.map((x) => x.name).join(', ')}`);
      if (r.max && refs.length > r.max) fail(`${def.type}'s ${role} takes at most ${r.max} field${r.max > 1 ? 's' : ''}`);
      for (const f of refs) checkField(g, refName(f));
    }
  };
  /** The filter scope a call names, once its page or visual is found. */
  const scopeTarget = (scope: unknown): edit.FilterScope => {
    if (scope === 'report') return 'report';
    const s = scope as { page?: string; visual?: string };
    if (s.page !== undefined) {
      pageOf(s.page);
      return { page: s.page };
    }
    visualOf(s.visual!);
    return { visual: s.visual! };
  };
  const filtersAt = (scope: edit.FilterScope): Filter[] =>
    scope === 'report' ? (report().filters ?? []) : 'page' in scope ? (pageOf(scope.page).filters ?? []) : (visualOf(scope.visual).visual.filters ?? []);
  const filterKind = (scope: edit.FilterScope): [ChangeKind, string | undefined] =>
    scope === 'report' ? ['report', undefined] : 'page' in scope ? ['page', scope.page] : ['visual', scope.visual];
  const checkFilter = (g: DataGrant, f: Filter) => {
    checkField(g, f.field!);
    if (f.by !== undefined) checkField(g, f.by);
  };

  return [
    // ---------------------------------------------------------------- reading
    read('get_report', "The open report's outline: its pages, their visuals (type, fields, place) and filters, and the model's measures, calculated columns, relationships and hierarchies. Ids from here name what the other actions change.", OBJECT({}), { type: 'object' }, async () =>
      outline(report(), await grant()),
    ),
    read('list_tables', "The model's tables: each table's columns (name and type), measures and hierarchies. Fields are named \"table.column\".", OBJECT({}), { type: 'array' }, async () =>
      tables(ctx.model(), await grant()),
    ),
    read('list_visual_types', 'The visual types: each one\'s data roles (dimension or measure, and how many fields each takes) and options.', OBJECT({}), { type: 'array' }, async () =>
      visualDefs().map((d) => ({
        type: d.type,
        label: d.label,
        roles: d.roles.map((r) => ({ name: r.name, kind: r.kind, ...(r.max ? { max: r.max } : {}), ...(r.drill ? { drill: true } : {}) })),
        options: (d.options ?? []).map((o) => ({ key: o.key, type: o.type, ...(o.choices ? { choices: o.choices.map(([v]) => v) } : {}), ...(o.default !== undefined ? { default: o.default } : {}) })),
      })),
    ),

    // ---------------------------------------------------------------- the report
    write('rename_report', "Renames the report.", OBJECT({ name: text('The new name.', { minLength: 1, maxLength: 200 }) }, ['name']), async (i) => {
      change('report', (r) => edit.renameReport(r, i.name as string));
      return { ok: true };
    }),
    write('set_theme', 'Uses one of the built-in themes.', OBJECT({ theme: { enum: Object.keys(BUILTIN_THEMES) } }, ['theme']), async (i) => {
      change('theme', (r) => edit.setTheme(r, i.theme as string));
      return { ok: true };
    }),
    write('edit_table', "Changes how a table shows in the fields list: its display name, or whether it is hidden there.", OBJECT({
      table: text('The table, as list_tables names it.'),
      label: text('Its display name; empty for its own name.', { maxLength: 100 }),
      hidden: { type: 'boolean' },
    }, ['table']), async (i) => {
      const table = i.table as string;
      if (!ctx.model().tables.has(table) || !tableAllowed(await grant(), table)) fail(`no table ${table}`);
      const patch: { label?: string; hidden?: boolean } = {};
      if (i.label !== undefined) patch.label = (i.label as string) || undefined;
      if (i.hidden !== undefined) patch.hidden = (i.hidden as boolean) || undefined;
      change('model', (r) => edit.setTableSettings(r, table, patch));
      return { ok: true };
    }),

    // ---------------------------------------------------------------- pages
    write('add_page', 'Adds an empty page at the end.', OBJECT({ name: text('Its name; "Page N" if none.', { minLength: 1, maxLength: 100 }) }), async (i) => {
      const page = change('pages', (r) => {
        const pageId = edit.addPage(r);
        if (i.name !== undefined) edit.renamePage(r, pageId, i.name as string);
        return pageId;
      });
      return { ok: true, page };
    }),
    write('edit_page', "Changes a page: its name, whether it is hidden in the viewer, a fixed size or responsive, its rows (fixed size only), its drill-through fields.", OBJECT({
      page: id('page'),
      name: text('Its new name.', { minLength: 1, maxLength: 100 }),
      hidden: { type: 'boolean', description: 'Hidden in the viewer.' },
      size: PAGE_SIZE,
      rows: { type: 'integer', minimum: 1, maximum: 60, description: 'Rows of a fixed-size page.' },
      drillthrough: { type: 'array', items: text('A field.'), description: 'The fields that make this a drill-through target; [] for none.' },
    }, ['page']), async (i) => {
      const pageId = i.page as string;
      const page = pageOf(pageId);
      const g = await grant();
      const drill = i.drillthrough as string[] | undefined;
      for (const f of drill ?? []) checkField(g, f);
      change('pages', (r) => {
        if (i.name !== undefined) edit.renamePage(r, pageId, i.name as string);
        if (i.hidden !== undefined) edit.setPageHidden(r, pageId, i.hidden as boolean);
        if (i.size !== undefined) edit.setPageSize(r, pageId, (i.size as PageSize | null) ?? undefined);
        if (i.rows !== undefined) edit.setPageRows(r, pageId, i.rows as number);
        if (drill) {
          for (let k = (page.drillthrough ?? []).length - 1; k >= 0; k--) edit.removeDrillthrough(r, pageId, k);
          for (const f of drill) edit.addDrillthrough(r, pageId, f);
        }
      });
      return { ok: true };
    }),
    write('move_page', 'Moves a page among the pages, by a number of places (negative: earlier).', OBJECT({ page: id('page'), by: { type: 'integer', minimum: -100, maximum: 100 } }, ['page', 'by']), async (i) => {
      change('pages', (r) => edit.movePage(r, i.page as string, i.by as number));
      return { ok: true };
    }),
    write('duplicate_page', 'Copies a page, with its visuals, after it.', OBJECT({ page: id('page') }, ['page']), async (i) => {
      const page = change('pages', (r) => edit.duplicatePage(r, i.page as string));
      return { ok: true, page };
    }),
    write('remove_page', 'Removes a page and its visuals. A report keeps at least one page.', OBJECT({ page: id('page') }, ['page']), async (i) => {
      change('pages', (r) => edit.removePage(r, i.page as string));
      return { ok: true };
    }),

    // ---------------------------------------------------------------- visuals
    write('add_visual', 'Adds a visual of a type to a page, with its fields by role (see list_visual_types), at the first free place or at a given cell.', OBJECT({
      page: id('page'),
      type: text('The visual type, from list_visual_types.'),
      fields: FIELDS,
      at: OBJECT({ x: { type: 'integer', minimum: 0 }, y: { type: 'integer', minimum: 0 } }, ['x', 'y']),
    }, ['page', 'type']), async (i) => {
      const pageId = i.page as string;
      const page = pageOf(pageId);
      const def = defOf(i.type as string);
      const fields = (i.fields ?? {}) as Record<string, FieldRef[]>;
      checkFields(await grant(), def, fields);
      const at = i.at as { x: number; y: number } | undefined;
      const columns = pageLayout(ctx.theme(), page).columns;
      const visual = change('page', (r) => edit.createVisual(r, pageId, def.type, fields, { at, columns }), pageId);
      return { ok: true, visual };
    }),
    write('set_visual_fields', "Sets the fields of one of a visual's roles, in order; [] empties it.", OBJECT({
      visual: id('visual'),
      role: text('The role, from list_visual_types.'),
      fields: { type: 'array', items: FIELD },
    }, ['visual', 'role', 'fields']), async (i) => {
      const visualId = i.visual as string;
      const { visual } = visualOf(visualId);
      const role = i.role as string;
      const fields = i.fields as FieldRef[];
      checkFields(await grant(), defOf(visual.type), { [role]: fields });
      change('visual', (r) => {
        for (let k = (visual.fields[role] ?? []).length - 1; k >= 0; k--) edit.removeField(r, visualId, role, k);
        for (const f of fields) edit.addField(r, visualId, role, f);
      }, visualId);
      return { ok: true };
    }),
    write('change_visual_type', "Changes a visual's type; its fields move to the new type's roles, and its options are reset.", OBJECT({ visual: id('visual'), type: text('The new type, from list_visual_types.') }, ['visual', 'type']), async (i) => {
      const visualId = i.visual as string;
      const from = defOf(visualOf(visualId).visual.type);
      const to = defOf(i.type as string);
      change('visual', (r) => edit.changeVisualType(r, visualId, to.type, { from: from.roles, to: to.roles }), visualId);
      return { ok: true };
    }),
    write('edit_visual', "Changes a visual: title, subtitle, options (see list_visual_types; null takes one off), row limit, interactions, background, place and size, how it shows on phones, conditional formatting, repeat for each value. Custom SQL is set_visual_sql.", OBJECT({
      visual: id('visual'),
      title: text('Empty: no title.', { maxLength: 200 }),
      subtitle: text('Empty: no subtitle.', { maxLength: 200 }),
      options: { type: 'object', description: 'Option values by key; null takes an option off (its default applies).' },
      limit: { type: 'integer', minimum: 0, description: 'The most rows its query returns; 0: the type\'s own limit.' },
      filterOthers: { type: 'boolean', description: 'Its selections filter the other visuals.' },
      filteredByOthers: { type: 'boolean', description: "The other visuals' selections filter it." },
      background: { type: ['string', 'null'], pattern: '^#[0-9a-fA-F]{6}$', description: 'A colour like #f4f4f4, or null for the theme\'s.' },
      layout: LAYOUT,
      phone: OBJECT({ hidden: { type: 'boolean' }, rows: { type: ['integer', 'null'], minimum: 1, maximum: 40 } }),
      conditional: { type: 'array', items: CONDITIONAL, description: 'Its rules, in order; [] for none.' },
      repeat: REPEAT,
    }, ['visual']), async (i) => {
      const visualId = i.visual as string;
      const { page, visual } = visualOf(visualId);
      const def = defOf(visual.type);
      const g = await grant();
      const options = (i.options ?? {}) as Record<string, unknown>;
      for (const [key, value] of Object.entries(options)) checkOption(def, key, value);
      if (i.repeat) checkField(g, (i.repeat as { field: string }).field);
      for (const rule of (i.conditional ?? []) as { apply: string; test?: string; compare?: string }[]) {
        for (const ref of [rule.apply, rule.test, rule.compare]) if (ref !== undefined && ref !== '*') checkField(g, ref);
      }
      const placed = i.layout !== undefined || i.phone !== undefined;
      change(placed ? 'layout' : 'visual', (r) => {
        if (i.title !== undefined) edit.setVisualText(r, visualId, 'title', i.title as string);
        if (i.subtitle !== undefined) edit.setVisualText(r, visualId, 'subtitle', i.subtitle as string);
        for (const [key, value] of Object.entries(options)) edit.setVisualOption(r, visualId, key, value ?? undefined);
        if (i.limit !== undefined) edit.setVisualLimit(r, visualId, i.limit as number);
        if (i.filterOthers !== undefined) edit.setInteraction(r, visualId, 'filterOthers', i.filterOthers as boolean);
        if (i.filteredByOthers !== undefined) edit.setInteraction(r, visualId, 'filteredByOthers', i.filteredByOthers as boolean);
        if (i.background === null) edit.resetVisualStyle(r, visualId);
        else if (i.background !== undefined) edit.setVisualStyle(r, visualId, 'surface', i.background as string);
        if (i.layout !== undefined) edit.setLayouts(r, page.id, [[visualId, i.layout as Visual['layout']]]);
        if (i.phone !== undefined) {
          const p = i.phone as { hidden?: boolean; rows?: number | null };
          edit.setVisualPhone(r, visualId, { ...(p.hidden !== undefined ? { hidden: p.hidden } : {}), ...(p.rows !== undefined ? { h: p.rows ?? undefined } : {}) });
        }
        if (i.conditional !== undefined) edit.setConditional(r, visualId, i.conditional as NonNullable<Visual['conditional']>);
        if (i.repeat !== undefined) edit.setRepeat(r, visualId, (i.repeat as Visual['repeat'] | null) ?? undefined);
      }, visualId);
      return { ok: true };
    }),
    code('set_visual_sql', "Replaces a visual's generated query with SQL, or with null goes back to the generated query. Its output columns map to the visual's fields in order.", OBJECT({
      visual: id('visual'),
      sql: { type: ['string', 'null'], minLength: 1, description: 'A SELECT over the report\'s tables, or null.' },
    }, ['visual', 'sql']), async (i) => {
      const visualId = i.visual as string;
      visualOf(visualId);
      const sql = i.sql as string | null;
      if (sql !== null && namesExcluded(await grant(), sql)) fail('the SQL names a table or column the user excluded');
      change('visual', (r) => edit.setCustomSql(r, visualId, sql ?? undefined), visualId);
      return { ok: true };
    }),
    write('duplicate_visual', 'Copies a visual onto the first free place of its page.', OBJECT({ visual: id('visual') }, ['visual']), async (i) => {
      const visualId = i.visual as string;
      const { page } = visualOf(visualId);
      const visual = change('page', (r) => edit.duplicateVisual(r, page.id, visualId), page.id);
      return { ok: true, visual };
    }),
    write('remove_visual', 'Removes a visual.', OBJECT({ visual: id('visual') }, ['visual']), async (i) => {
      const visualId = i.visual as string;
      const { page } = visualOf(visualId);
      change('page', (r) => edit.removeVisuals(r, page.id, [visualId]), page.id);
      return { ok: true };
    }),

    // ---------------------------------------------------------------- filters
    write('add_filter', 'Adds a filter to the report (every page), a page or a visual.', OBJECT({ scope: SCOPE, filter: FILTER }, ['scope', 'filter']), async (i) => {
      const scope = scopeTarget(i.scope);
      checkFilter(await grant(), i.filter as Filter);
      const [kind, at] = filterKind(scope);
      change(kind, (r) => edit.addFilter(r, scope, i.filter as Filter), at);
      return { ok: true };
    }),
    write('edit_filter', "Replaces a filter of the report, a page or a visual, by its place in get_report's list.", OBJECT({ scope: SCOPE, index: { type: 'integer', minimum: 0 }, filter: FILTER }, ['scope', 'index', 'filter']), async (i) => {
      const scope = scopeTarget(i.scope);
      const index = i.index as number;
      const list = filtersAt(scope);
      if (index >= list.length) fail(`no filter at ${index}`);
      checkFilter(await grant(), i.filter as Filter);
      const [kind, at] = filterKind(scope);
      change(kind, (r) => edit.setFilters(r, scope, list.map((f, k) => (k === index ? (i.filter as Filter) : f))), at);
      return { ok: true };
    }),
    write('remove_filter', "Removes a filter of the report, a page or a visual, by its place in get_report's list.", OBJECT({ scope: SCOPE, index: { type: 'integer', minimum: 0 } }, ['scope', 'index']), async (i) => {
      const scope = scopeTarget(i.scope);
      const index = i.index as number;
      const list = filtersAt(scope);
      if (index >= list.length) fail(`no filter at ${index}`);
      const [kind, at] = filterKind(scope);
      change(kind, (r) => edit.setFilters(r, scope, list.filter((_, k) => k !== index)), at);
      return { ok: true };
    }),
  ];
}

// ---------------------------------------------------------------- checks

function fail(message: string): never {
  throw new Error(message);
}

function missing(what: string): never {
  throw new edit.EditError(`no ${what}`);
}

function fieldAllowed(g: DataGrant, table: string, name: string): boolean {
  return columnAllowed(g, table, name);
}

/** An option the visual type has, with a value of its kind (null takes it off). */
function checkOption(def: VisualDef, key: string, value: unknown): void {
  if (key === 'refLines' && def.refLines) return;
  const o: OptionDef = def.options?.find((x) => x.key === key) ?? fail(`${def.type} has no option ${key} (list_visual_types gives its options)`);
  if (value === null) return;
  const ok =
    o.type === 'bool' ? typeof value === 'boolean'
    : o.type === 'number' ? typeof value === 'number' && Number.isFinite(value)
    : o.type === 'select' ? (o.choices ?? []).some(([v]) => v === value)
    : o.type === 'color' ? typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
    : typeof value === 'string';
  if (!ok) fail(`${def.type}'s option ${key} takes ${o.type === 'select' ? `one of ${(o.choices ?? []).map(([v]) => JSON.stringify(v)).join(', ')}` : o.type === 'bool' ? 'true or false' : o.type === 'color' ? 'a colour like #336699' : `a ${o.type}`}`);
}

// ---------------------------------------------------------------- what the model is shown

/** A field reference as the model may see it: itself, or WITHHELD for an excluded table or column. */
function shownRef(g: DataGrant, ref: string): string {
  const [table, name] = splitRef(ref);
  return fieldAllowed(g, table, name) ? ref : WITHHELD;
}

/** True if a SQL expression names an excluded table or column (its text is withheld then). */
function namesExcluded(g: DataGrant, sql: string): boolean {
  const lower = sql.toLowerCase();
  const has = (word: string) => new RegExp(`(^|[^\\w])"?${word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"?([^\\w]|$)`).test(lower);
  return g.excludeTables.some((t) => has(`${t}.`) || has(t)) || g.excludeColumns.some((c) => has(c) || has(c.split('.').slice(1).join('.')));
}

function shownField(g: DataGrant, f: FieldRef): FieldRef {
  if (typeof f === 'string') return shownRef(g, f);
  return { ...f, field: shownRef(g, f.field) };
}

function shownFilter(g: DataGrant, f: Filter): Filter | { withheld: true } {
  const refs = [f.field, f.by, ...(f.fields ?? [])].filter((x): x is string => x !== undefined);
  if (refs.some((r) => shownRef(g, r) === WITHHELD) || (f.sql !== undefined && namesExcluded(g, f.sql))) return { withheld: true };
  return f;
}

/** The report's outline: what get_report gives, with what the user excluded withheld. */
export function outline(r: Report, g: DataGrant): unknown {
  const sqlOf = (sql: string) => (namesExcluded(g, sql) ? WITHHELD : sql);
  const visual = (v: Visual) => ({
    id: v.id,
    type: v.type,
    ...(v.title ? { title: v.title } : {}),
    ...(v.subtitle ? { subtitle: v.subtitle } : {}),
    layout: v.layout,
    fields: Object.fromEntries(Object.entries(v.fields).map(([role, refs]) => [role, refs.map((f) => shownField(g, f))])),
    ...(v.options && Object.keys(v.options).length ? { options: v.options } : {}),
    ...(v.filters?.length ? { filters: v.filters.map((f) => shownFilter(g, f)) } : {}),
    ...(v.limit ? { limit: v.limit } : {}),
    ...(v.sql !== undefined ? { sql: sqlOf(v.sql) } : {}),
    ...(v.conditional?.length ? { conditional: v.conditional } : {}),
    ...(v.repeat ? { repeat: { ...v.repeat, field: shownRef(g, v.repeat.field) } } : {}),
    ...(v.phone ? { phone: v.phone } : {}),
  });
  const m = r.model;
  return {
    name: r.name,
    theme: typeof r.theme === 'string' ? r.theme : r.theme === undefined ? 'smalt' : 'custom',
    filters: (r.filters ?? []).map((f) => shownFilter(g, f)),
    pages: r.pages.map((p) => ({
      id: p.id,
      name: p.name,
      ...(p.hidden ? { hidden: true } : {}),
      ...(p.size ? { size: p.size } : {}),
      ...(p.layout?.rows ? { rows: p.layout.rows } : {}),
      ...(p.drillthrough?.length ? { drillthrough: p.drillthrough.map((f) => shownRef(g, f)) } : {}),
      filters: (p.filters ?? []).map((f) => shownFilter(g, f)),
      visuals: p.visuals.map(visual),
    })),
    model: {
      measures: (m.measures ?? []).filter((x) => tableAllowed(g, x.table)).map((x) => ({ table: x.table, name: x.name, sql: sqlOf(x.sql), ...(x.time ? { time: x.time } : {}), ...(x.format !== undefined ? { format: x.format } : {}), ...(x.description ? { description: x.description } : {}) })),
      columns: (m.columns ?? []).filter((x) => fieldAllowed(g, x.table, x.name)).map((x) => ({ table: x.table, name: x.name, sql: sqlOf(x.sql), type: x.type })),
      relationships: (m.relationships ?? []).map((x, index) => ({ index, from: shownRef(g, x.from), to: shownRef(g, x.to), ...(x.active === false ? { active: false } : {}), ...(x.role ? { role: x.role } : {}) })),
      hierarchies: (m.hierarchies ?? []).filter((x) => tableAllowed(g, x.table)).map((x) => ({ table: x.table, name: x.name, levels: x.levels.filter((l) => fieldAllowed(g, x.table, l)) })),
      parameters: m.parameters ?? [],
    },
  };
}

/** The model's tables as list_tables gives them, without what the user excluded. */
export function tables(model: Model, g: DataGrant): unknown[] {
  return [...model.tables.values()]
    .filter((t) => tableAllowed(g, t.name))
    .map((t) => ({
      name: t.name,
      ...(t.label !== t.name ? { label: t.label } : {}),
      ...(t.source ? { source: t.source } : {}),
      ...(t.hidden ? { hidden: true } : {}),
      columns: [...t.columns.values()].filter((c) => fieldAllowed(g, t.name, c.name)).map((c) => ({ name: c.name, type: c.type, ...(c.calc ? { calculated: true } : {}) })),
      measures: [...t.measures.keys()],
      hierarchies: [...t.hierarchies.values()].map((h) => ({ name: h.name, levels: h.levels.filter((l) => fieldAllowed(g, t.name, l)) })),
    }));
}
