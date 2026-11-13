// The right-hand panel in model view: the model overview, the selected table (label, visibility,
// measures, calculated columns, hierarchies) or the selected relationship (columns, active, delete).
import type { Hierarchy } from '../core/types.js';
import { splitRef } from '../core/sql.js';
import { h, toast } from 'smaltkit/dom';
import { checkbox, field, textInput } from './panel.js';
import { notUniqueMessage } from '../core/model.js';
import { ambiguousPaths, type ModelSelection, type ModelView } from './modelview.js';
import type { DocStore } from './store.js';
import type { ReportSession } from '../report/session.js';

export interface ModelPanelContext {
  store: DocStore;
  session: ReportSession;
  selection: ModelSelection;
  select(s: ModelSelection): void;
  diagram: ModelView;
  editMeasure(table: string, name?: string): void;
  editColumn(table: string, name?: string): void;
}

const hint = (t: string) => h('div.sbd-hint', {}, t);

export function modelPanel(ctx: ModelPanelContext): HTMLElement {
  const sel = ctx.selection;
  const body = sel?.kind === 'table' ? tablePanel(ctx, sel.table) : sel?.kind === 'rel' ? relPanel(ctx, sel.index) : overview(ctx);
  return h('section.sbd-panel', {}, h('div.sbd-tabs', {}, h('button.sbd-tab.sbd-on', {}, 'Model')), h('div.sbd-panel-body', {}, body));
}

function overview(ctx: ModelPanelContext): HTMLElement {
  const m = ctx.session.model;
  const spec = ctx.store.report.model;
  const amb = ambiguousPaths(m);
  const isolated = [...m.tables.keys()].filter((t) => !m.edges.some((e) => e.from.table === t || e.to.table === t));
  const problems = m.validate();
  return h(
    'div.sbd-form',
    {},
    h('div.sbd-section-title', {}, 'Model'),
    h(
      'div.sbd-mv-stats',
      {},
      stat(m.tables.size, 'tables'),
      stat((spec.relationships ?? []).length, 'relationships'),
      stat((spec.measures ?? []).length, 'measures'),
      stat((spec.hierarchies ?? []).length, 'hierarchies'),
    ),
    problems.length ? h('div.sbd-test.sbd-bad', {}, problems.join('\n')) : null,
    amb.length ? h('div.sbd-test.sbd-bad', {}, 'More than one active path between:\n' + amb.map(([a, b]) => `  ${a} → ${b}`).join('\n') + '\nMark one of the relationships inactive.') : null,
    isolated.length && m.tables.size > 1 ? hint(`Not related to anything yet: ${isolated.join(', ')}. Visuals can combine their fields only with fields of the same table.`) : null,
    h('div.sbd-row', {}, h('button.sbd-btn', { onclick: () => ctx.diagram.detect() }, 'Detect relationships'), h('button.sbd-btn', { onclick: () => ctx.diagram.autoArrange() }, 'Auto layout')),
    h('div.sbd-section-title', {}, 'How to'),
    hint('Relate tables: drag a column (usually a foreign key such as customer_id) onto the matching key column of another table.'),
    hint('Edit a relationship: click its line. Inactive relationships are dashed and ignored by queries.'),
    hint('Click a table’s title for its measures, calculated columns and hierarchies. Drag titles to arrange the diagram.'),
  );
}

function stat(n: number, label: string): HTMLElement {
  return h('div.sbd-mv-stat', {}, h('b', {}, String(n)), h('span', {}, label));
}

function tablePanel(ctx: ModelPanelContext, table: string): HTMLElement {
  const t = ctx.session.model.tables.get(table);
  if (!t) return overview(ctx);
  const settings = () => ctx.store.report.model.tables?.[table] ?? {};
  const setSettings = (patch: Record<string, unknown>) =>
    ctx.store.change('model', (r) => {
      const tables = { ...(r.model.tables ?? {}) };
      tables[table] = { ...(tables[table] ?? {}), ...patch };
      r.model.tables = tables;
    });
  const hiers = ctx.store.report.model.hierarchies ?? [];
  const levelsIn = textInput('', () => {}) as HTMLInputElement;
  levelsIn.placeholder = 'Year, Quarter, Month';
  const nameIn = textInput('', () => {}) as HTMLInputElement;
  nameIn.placeholder = 'Name';
  const rels = (ctx.store.report.model.relationships ?? []).map((r, i) => ({ r, i })).filter(({ r }) => splitRef(r.from)[0] === table || splitRef(r.to)[0] === table);
  return h(
    'div.sbd-form',
    {},
    h('div.sbd-section-title', {}, 'Table'),
    h('div.sbd-mv-tname', {}, table),
    field('Display name', textInput(settings().label ?? '', (v) => setSettings({ label: v || undefined }))),
    checkbox('Hidden in the fields list', !!settings().hidden, (on) => setSettings({ hidden: on || undefined })),
    h('div.sbd-section-title', {}, `Relationships (${rels.length})`),
    ...rels.map(({ r, i }) => h('button.sbd-mv-link', { onclick: () => ctx.select({ kind: 'rel', index: i }) }, `${r.from} → ${r.to}`, r.active === false ? ' (inactive)' : '')),
    rels.length ? null : hint('None. Drag a column onto another table’s column to relate them.'),
    h('div.sbd-section-title', {}, `Measures (${t.measures.size})`),
    ...[...t.measures.values()].map((m) => h('button.sbd-mv-link', { title: m.sql, onclick: () => ctx.editMeasure(table, m.name) }, 'ƒx ', m.name)),
    h('button.sbd-btn', { onclick: () => ctx.editMeasure(table) }, '+ New measure'),
    h('div.sbd-section-title', {}, 'Calculated columns'),
    ...[...t.columns.values()].filter((c) => c.calc).map((c) => h('button.sbd-mv-link', { title: c.sql, onclick: () => ctx.editColumn(table, c.name) }, c.name)),
    h('button.sbd-btn', { onclick: () => ctx.editColumn(table) }, '+ New column'),
    h('div.sbd-section-title', {}, 'Hierarchies (drill paths)'),
    ...hiers
      .filter((x) => x.table === table)
      .map((x) =>
        h(
          'div.sbd-step',
          {},
          h('span', {}, h('b', {}, x.name), ': ', x.levels.join(' › ')),
          h('button.sbd-chip-btn', { title: 'Remove', onclick: () => ctx.store.change('model', (r) => (r.model.hierarchies = (r.model.hierarchies ?? []).filter((y) => !(y.table === x.table && y.name === x.name)))) }, '×'),
        ),
      ),
    h('div.sbd-row', {}, nameIn, levelsIn),
    h(
      'button.sbd-btn',
      {
        onclick: () => {
          const levels = levelsIn.value.split(',').map((s) => s.trim()).filter(Boolean);
          const missing = levels.filter((l) => !t.columns.has(l));
          if (!nameIn.value.trim() || levels.length < 2) return toast('A hierarchy needs a name and at least two levels', 'error');
          if (missing.length) return toast(`Not columns of ${table}: ${missing.join(', ')}`, 'error');
          ctx.store.change('model', (r) => (r.model.hierarchies = [...(r.model.hierarchies ?? []), { table, name: nameIn.value.trim(), levels } as Hierarchy]));
        },
      },
      '+ Add hierarchy',
    ),
    hint(`Columns: ${[...t.columns.keys()].join(', ')}`),
  );
}

function relPanel(ctx: ModelPanelContext, index: number): HTMLElement {
  const rels = ctx.store.report.model.relationships ?? [];
  const r = rels[index];
  if (!r) return overview(ctx);
  const m = ctx.session.model;
  const cols = [...m.tables.values()].flatMap((t) => [...t.columns.values()].filter((c) => !c.calc).map((c) => `${t.name}.${c.name}`));
  const update = (patch: Partial<typeof r>) => ctx.store.change('model', (rep) => (rep.model.relationships = (rep.model.relationships ?? []).map((x, i) => (i === index ? { ...x, ...patch } : x))));
  const colSelect = (value: string, key: 'from' | 'to') =>
    h('select.sbd-input', { onchange: (e: Event) => update({ [key]: (e.target as HTMLSelectElement).value }) }, ...cols.map((c) => h('option', { value: c, selected: c === value }, c)));
  const [ft] = splitRef(r.from);
  const [tt] = splitRef(r.to);
  return h(
    'div.sbd-form',
    {},
    h('div.sbd-section-title', {}, 'Relationship'),
    h('div.sbd-mv-relcard', {}, h('div', {}, h('b', {}, '*'), ' many: ', h('code', {}, r.from)), h('div', {}, h('b', {}, '1'), ' one: ', h('code', {}, r.to))),
    // ADR 0009: a "one" side with repeated values would count the many side more than once; then the usual
    // "each row matches many" explanation isn't true, so the problem is shown instead.
    r.active !== false && m.notUnique.has(r.to)
      ? h('div.sbd-test.sbd-bad.sbd-rel-notunique', {}, notUniqueMessage(r.from, r.to))
      : hint(`Each ${tt} row matches many ${ft} rows. Filters on ${tt} flow to ${ft}; measures on ${ft} can be grouped by ${tt}'s columns.`),
    field('Many side (foreign key)', colSelect(r.from, 'from')),
    field('One side (key)', colSelect(r.to, 'to')),
    checkbox('Active (used by queries)', r.active !== false, (on) => update({ active: on ? undefined : false })),
    field(
      'Role (optional)',
      h('input.sbd-input.sbd-rel-role', {
        value: r.role ?? '',
        placeholder: `e.g. Ship date: ${tt} a second time`,
        onchange: (e: Event) => {
          const v = (e.target as HTMLInputElement).value.trim();
          update({ role: v || undefined });
        },
      }),
    ),
    hint(
      r.role
        ? `${tt} appears again as “${r.role}” in the fields, joined through this relationship: group by ${r.role}'s columns to use ${r.from} instead of the other relationship to ${tt}.`
        : `To relate ${ft} to ${tt} a second way (an order date and a ship date to one calendar), name a role: ${tt} then appears a second time under that name.`,
    ),
    h(
      'div.sbd-row',
      {},
      h('button.sbd-btn', { onclick: () => update({ from: r.to, to: r.from }) }, '⇄ Swap direction'),
      h(
        'button.sbd-btn.sbd-danger',
        {
          onclick: () => {
            ctx.select(null);
            ctx.store.change('model', (rep) => (rep.model.relationships = (rep.model.relationships ?? []).filter((_, i) => i !== index)));
          },
        },
        'Delete',
      ),
    ),
    h('button.sbd-link', { onclick: () => ctx.select(null) }, '← Model overview'),
  );
}
