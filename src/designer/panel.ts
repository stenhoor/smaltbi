// The right-hand panel: Build (visual types and field wells), Format, Filters and SQL.
import type { Aggregation, FieldRef, Filter, FilterOp, Page, SqlValue, Visual } from '../core/types.js';
import { conditionalSection } from './conditional.js';
import { aggLabel, refName } from '../core/model.js';
import { quoteIdent } from '../core/sql.js';
import { type OptionDef, type VisualDef, visualDef, visualDefs } from '../visuals/index.js';
import { h, showMenu, toast } from 'smaltkit/dom';
import { FIELD_MIME } from './fields.js';
import type { DocStore } from './store.js';
import type { ReportSession } from '../report/session.js';
import type { ReportView } from '../report/view.js';

export interface PanelContext {
  store: DocStore;
  session: ReportSession;
  view: ReportView;
  selected: string | null;
  page: Page;
  tab: string;
  setTab(t: string): void;
  createVisual(type: string, fields?: Record<string, FieldRef[]>): void;
  changeType(v: Visual, type: string): void;
}

export function panel(ctx: PanelContext): HTMLElement {
  const tabs = ['Build', 'Format', 'Filters', 'SQL'];
  const head = h('div.sbd-tabs', {}, ...tabs.map((t) => h('button.sbd-tab' + (ctx.tab === t ? '.sbd-on' : ''), { onclick: () => ctx.setTab(t) }, t)));
  const found = ctx.selected ? ctx.store.visual(ctx.selected) : undefined;
  const v = found?.visual;
  let body: HTMLElement;
  switch (ctx.tab) {
    case 'Format':
      body = v ? formatTab(ctx, v) : pageTab(ctx);
      break;
    case 'Filters':
      body = filtersTab(ctx, v);
      break;
    case 'SQL':
      body = v ? sqlTab(ctx, v) : hint('Select a visual to see its SQL.');
      break;
    default:
      body = buildTab(ctx, v);
  }
  return h('section.sbd-panel', {}, head, h('div.sbd-panel-body', {}, body));
}

const hint = (t: string) => h('div.sbd-hint', {}, t);

// ------------------------------------------------------------------ Build

function buildTab(ctx: PanelContext, v: Visual | undefined): HTMLElement {
  const defs = visualDefs();
  const gallery = h('div.sbd-gallery');
  for (const group of ['core', 'advanced', 'plugin'] as const) {
    for (const d of defs.filter((x) => x.group === group)) {
      gallery.append(
        h('button.sbd-vtype' + (v?.type === d.type ? '.sbd-on' : ''), {
          title: d.label + (v ? ' (change the selected visual)' : ' (add to the page)'),
          html: d.icon,
          onclick: () => (v ? ctx.changeType(v, d.type) : ctx.createVisual(d.type)),
        }),
      );
    }
  }
  const out = h('div', {}, h('div.sbd-section-title', {}, v ? 'Visual type' : 'Add a visual'), gallery);
  if (!v) {
    out.append(hint('Click a visual type to add it, or drag a field onto the canvas. Click a visual to edit its fields.'));
    out.append(pageTab(ctx));
    return out;
  }
  const def = visualDef(v.type);
  if (!def) return h('div', {}, out, hint(`Unknown visual type ${v.type}`));
  out.append(h('div.sbd-section-title', {}, def.label));
  for (const role of def.roles) out.append(well(ctx, v, def, role.name));
  if (!def.roles.length) out.append(hint('This visual has no data fields. See Format.'));
  if (v.sql) out.append(hint('This visual runs custom SQL (see the SQL tab). Its output columns map to these fields in order.'));
  return out;
}

function well(ctx: PanelContext, v: Visual, def: VisualDef, roleName: string): HTMLElement {
  const role = def.roles.find((r) => r.name === roleName)!;
  const refs = v.fields[roleName] ?? [];
  const model = ctx.session.model;
  const chips = refs.map((r, i) => {
    const ref = refName(r);
    const spec = typeof r === 'string' ? { field: r } : r;
    const kind = model.kindOf(ref);
    let label = spec.label ?? ref.split('.').slice(1).join('.');
    if (role.kind === 'measure' && kind === 'column') label = `${aggLabel(spec.agg ?? (model.column(ref)?.type === 'number' ? 'sum' : 'count'))} of ${label}`;
    const update = (fn: (list: FieldRef[]) => void) =>
      ctx.store.change(
        'visual',
        () => {
          const list = [...(v.fields[roleName] ?? [])];
          fn(list);
          v.fields = { ...v.fields, [roleName]: list };
        },
        v.id,
      );
    const menu = () => {
      const items = [];
      if (role.kind === 'measure' && kind === 'column') {
        for (const agg of ['sum', 'avg', 'min', 'max', 'count', 'countd'] as Aggregation[])
          items.push({ label: (spec.agg === agg ? '✓ ' : '') + aggLabel(agg), action: () => update((l) => (l[i] = { ...spec, agg })) });
        items.push({ label: '', separator: true });
      }
      items.push({
        label: 'Rename for this visual…',
        action: () => {
          const name = prompt('Label', spec.label ?? '');
          if (name !== null) update((l) => (l[i] = name ? { ...spec, label: name } : spec.agg ? { field: spec.field, agg: spec.agg } : spec.field));
        },
      });
      if (i > 0) items.push({ label: 'Move up', action: () => update((l) => l.splice(i - 1, 0, l.splice(i, 1)[0]!)) });
      if (i < refs.length - 1) items.push({ label: 'Move down', action: () => update((l) => l.splice(i + 1, 0, l.splice(i, 1)[0]!)) });
      items.push({ label: 'Remove', action: () => update((l) => l.splice(i, 1)) });
      return items;
    };
    return h(
      'div.sbd-chip' + (kind === 'measure' ? '.sbd-measure' : ''),
      {
        draggable: true,
        ondragstart: (e: Event) => {
          (e as DragEvent).dataTransfer!.setData(FIELD_MIME, ref);
          (e as DragEvent).dataTransfer!.setData('application/x-smaltbi-move', JSON.stringify({ role: roleName, i }));
        },
      },
      h('span.sbd-chip-label', { title: ref }, label),
      h('button.sbd-chip-btn', { title: 'Options', onclick: (e: Event) => showMenu((e as MouseEvent).clientX, (e as MouseEvent).clientY, menu()) }, '▾'),
      h('button.sbd-chip-btn', { title: 'Remove', onclick: () => update((l) => l.splice(i, 1)) }, '×'),
    );
  });
  const zone = h(
    'div.sbd-well',
    { 'data-role': roleName },
    h('div.sbd-well-head', {}, h('span', {}, role.label), role.drill ? h('span.sbd-badge', { title: 'Several fields here form a drill-down path' }, 'drill') : null, role.max ? h('span.sbd-max', {}, `max ${role.max}`) : null),
    ...chips,
    h('div.sbd-drop', {}, refs.length ? '' : 'Drop a field here'),
  );
  zone.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes(FIELD_MIME)) {
      e.preventDefault();
      zone.classList.add('sbd-over');
    }
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('sbd-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('sbd-over');
    const ref = e.dataTransfer!.getData(FIELD_MIME);
    if (!ref) return;
    const move = e.dataTransfer!.getData('application/x-smaltbi-move');
    ctx.store.change(
      'visual',
      () => {
        const fields = { ...v.fields };
        if (move) {
          const m = JSON.parse(move) as { role: string; i: number };
          const from = [...(fields[m.role] ?? [])];
          from.splice(m.i, 1);
          fields[m.role] = from;
        }
        const list = [...(fields[roleName] ?? [])];
        if (role.max && list.length >= role.max) list.splice(role.max - 1);
        list.push(ref);
        fields[roleName] = list;
        v.fields = fields;
      },
      v.id,
    );
  });
  return zone;
}

// ------------------------------------------------------------------ Format

function formatTab(ctx: PanelContext, v: Visual): HTMLElement {
  const def = visualDef(v.type);
  const set = (fn: () => void) => ctx.store.change('visual', fn, v.id);
  const out = h('div.sbd-form');
  out.append(
    field('Title', textInput(v.title ?? '', (val) => set(() => (v.title = val || undefined)))),
    field('Subtitle', textInput(v.subtitle ?? '', (val) => set(() => (v.subtitle = val || undefined)))),
  );
  for (const o of def?.options ?? []) {
    if (o.when && (v.options?.[o.when.key] ?? def?.options?.find((x) => x.key === o.when!.key)?.default) !== o.when.equals) continue;
    out.append(optionInput(o, v.options?.[o.key] ?? o.default, (val) => set(() => (v.options = { ...(v.options ?? {}), [o.key]: val }))));
  }
  if (def && !def.static) {
    out.append(
      h('div.sbd-section-title', {}, 'Data'),
      field(
        'Row limit',
        h('input.sbd-input', {
          type: 'number',
          min: 1,
          value: v.limit ?? def.limit ?? '',
          placeholder: String(def.limit ?? 'none'),
          onchange: (e: Event) => set(() => (v.limit = Number((e.target as HTMLInputElement).value) || undefined)),
        }),
      ),
      checkbox('Filters other visuals', v.interactions?.filterOthers !== false, (on) => set(() => (v.interactions = { ...(v.interactions ?? {}), filterOthers: on }))),
      checkbox('Filtered by other visuals', v.interactions?.filteredByOthers !== false, (on) => set(() => (v.interactions = { ...(v.interactions ?? {}), filteredByOthers: on }))),
    );
  }
  if (def?.conditional) out.append(conditionalSection(ctx, v, def));
  out.append(
    h('div.sbd-section-title', {}, 'Style'),
    field(
      'Background',
      h('input.sbd-input', {
        type: 'color',
        value: String(v.style?.surface ?? '#ffffff'),
        onchange: (e: Event) => set(() => (v.style = { ...(v.style ?? {}), surface: (e.target as HTMLInputElement).value })),
      }),
    ),
    ...(v.style ? [h('button.sbd-link', { onclick: () => set(() => delete v.style) }, 'Reset to theme')] : []),
    h('div.sbd-section-title', {}, 'Position'),
    h(
      'div.sbd-grid4',
      {},
      ...(['x', 'y', 'w', 'h'] as const).map((k) =>
        field(
          k.toUpperCase(),
          h('input.sbd-input', {
            type: 'number',
            min: k === 'w' || k === 'h' ? 1 : 0,
            value: v.layout[k],
            onchange: (e: Event) => ctx.store.change('layout', () => (v.layout = { ...v.layout, [k]: Math.max(k === 'w' || k === 'h' ? 1 : 0, Number((e.target as HTMLInputElement).value) || 0) }), v.id),
          }),
        ),
      ),
    ),
  );
  return out;
}

function pageTab(ctx: PanelContext): HTMLElement {
  const p = ctx.page;
  const set = (fn: () => void) => ctx.store.change('page', fn, p.id);
  const dt = h('div.sbd-well', {}, h('div.sbd-well-head', {}, h('span', {}, 'Drill-through fields')));
  for (const [i, ref] of (p.drillthrough ?? []).entries())
    dt.append(h('div.sbd-chip', {}, h('span.sbd-chip-label', {}, ref), h('button.sbd-chip-btn', { onclick: () => set(() => (p.drillthrough = (p.drillthrough ?? []).filter((_, j) => j !== i))) }, '×')));
  dt.append(h('div.sbd-drop', {}, 'Drop a field to make this page a drill-through target'));
  dt.addEventListener('dragover', (e) => e.dataTransfer?.types.includes(FIELD_MIME) && e.preventDefault());
  dt.addEventListener('drop', (e) => {
    e.preventDefault();
    const ref = e.dataTransfer!.getData(FIELD_MIME);
    if (ref) set(() => (p.drillthrough = [...new Set([...(p.drillthrough ?? []), ref])]));
  });
  return h(
    'div.sbd-form',
    {},
    h('div.sbd-section-title', {}, 'Page'),
    field('Name', textInput(p.name, (val) => ctx.store.change('pages', () => (p.name = val || p.name)))),
    checkbox('Hidden in the viewer', !!p.hidden, (on) => ctx.store.change('pages', () => (p.hidden = on || undefined))),
    dt,
  );
}

function optionInput(o: OptionDef, value: unknown, onChange: (v: unknown) => void): HTMLElement {
  switch (o.type) {
    case 'bool':
      return checkbox(o.label, !!value, onChange);
    case 'select':
      return field(o.label, h('select.sbd-input', { onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value) }, ...(o.choices ?? []).map(([val, label]) => h('option', { value: val, selected: value === val }, label))));
    case 'number':
      return field(o.label, h('input.sbd-input', { type: 'number', value: value ?? '', onchange: (e: Event) => onChange((e.target as HTMLInputElement).value === '' ? undefined : Number((e.target as HTMLInputElement).value)) }));
    case 'color':
      return field(o.label, h('input.sbd-input', { type: 'color', value: String(value ?? '#000000'), onchange: (e: Event) => onChange((e.target as HTMLInputElement).value) }));
    case 'textarea':
      return field(o.label, h('textarea.sbd-input.sbd-code', { rows: 6, onchange: (e: Event) => onChange((e.target as HTMLTextAreaElement).value) }, String(value ?? '')));
    default:
      return field(o.label, textInput(String(value ?? ''), onChange));
  }
}

export function field(label: string, input: HTMLElement): HTMLElement {
  return h('label.sbd-field-row', {}, h('span', {}, label), input);
}

export function textInput(value: string, onChange: (v: string) => void): HTMLElement {
  return h('input.sbd-input', { type: 'text', value, onchange: (e: Event) => onChange((e.target as HTMLInputElement).value) });
}

export function checkbox(label: string, on: boolean, onChange: (on: boolean) => void): HTMLElement {
  return h('label.sbd-check', {}, h('input', { type: 'checkbox', checked: on, onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked) }), h('span', {}, label));
}

// ------------------------------------------------------------------ Filters

const OPS: [FilterOp, string][] = [
  ['in', 'is one of'],
  ['not-in', 'is not one of'],
  ['eq', '='],
  ['ne', '≠'],
  ['gt', '>'],
  ['gte', '≥'],
  ['lt', '<'],
  ['lte', '≤'],
  ['between', 'between'],
  ['contains', 'contains'],
  ['starts-with', 'starts with'],
  ['top', 'top N by'],
  ['is-null', 'is blank'],
  ['not-null', 'is not blank'],
];

function filtersTab(ctx: PanelContext, v: Visual | undefined): HTMLElement {
  const out = h('div');
  const r = ctx.store.report;
  if (v) out.append(filterSection(ctx, 'This visual', v.filters ?? [], (fs) => ctx.store.change('visual', () => (v.filters = fs), v.id)));
  out.append(filterSection(ctx, 'This page', ctx.page.filters ?? [], (fs) => ctx.store.change('page', () => (ctx.page.filters = fs), ctx.page.id)));
  out.append(filterSection(ctx, 'All pages', r.filters ?? [], (fs) => ctx.store.change('report', () => (r.filters = fs))));
  return out;
}

function filterSection(ctx: PanelContext, title: string, filters: Filter[], save: (f: Filter[]) => void): HTMLElement {
  const sec = h('div.sbd-filter-section', {}, h('div.sbd-section-title', {}, title));
  filters.forEach((f, i) => sec.append(filterCard(ctx, f, (nf) => save(filters.map((x, j) => (j === i ? nf : x))), () => save(filters.filter((_, j) => j !== i)))));
  const drop = h('div.sbd-drop.sbd-filter-drop', {}, 'Drop a field to filter');
  drop.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes(FIELD_MIME)) {
      e.preventDefault();
      drop.classList.add('sbd-over');
    }
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('sbd-over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    const ref = e.dataTransfer!.getData(FIELD_MIME);
    if (ref) save([...filters, defaultFilter(ctx, ref)]);
  });
  sec.append(drop);
  return sec;
}

export function defaultFilter(ctx: Pick<PanelContext, 'session'>, ref: string): Filter {
  const kind = ctx.session.model.kindOf(ref);
  if (kind === 'measure') return { field: ref, op: 'gt', values: [0] };
  const t = ctx.session.model.column(ref)?.type;
  if (t === 'number' || t === 'date' || t === 'datetime') return { field: ref, op: 'between', values: [null, null] };
  return { field: ref, op: 'in', values: [] };
}

function filterCard(ctx: PanelContext, f: Filter, save: (f: Filter) => void, remove: () => void): HTMLElement {
  const model = ctx.session.model;
  const label = f.field ? (f.label ?? f.field) : (f.label ?? 'Custom condition');
  const type = f.field ? model.column(f.field)?.type : undefined;
  const conv = (s: string): SqlValue => (s === '' ? null : type === 'number' || model.kindOf(f.field ?? '') === 'measure' ? Number(s) : s);
  const body = h('div.sbd-filter-body');
  const opSel = h(
    'select.sbd-input',
    { onchange: (e: Event) => save({ ...f, op: (e.target as HTMLSelectElement).value as FilterOp, values: [] }) },
    ...OPS.map(([op, l]) => h('option', { value: op, selected: f.op === op }, l)),
    f.op === 'sql' || f.op === 'tuples' ? h('option', { value: f.op, selected: true }, f.op) : null,
  );
  const v = f.values ?? [];
  if (f.op === 'in' || f.op === 'not-in') {
    const box = h('div.sbd-values', {}, 'Loading values…');
    body.append(box);
    void (async () => {
      try {
        const res = model.resolve(f.field!);
        const q = `SELECT DISTINCT ${res.expr} AS v FROM ${quoteIdent(model.chooseRoot(res.tables))} ${model.joins(model.chooseRoot(res.tables), res.tables).join(' ')} ORDER BY 1 LIMIT 500`;
        const frame = await ctx.session.runner.run(q);
        const vals = Array.from(frame.data.v ?? []);
        box.replaceChildren(
          ...vals.map((x) =>
            h(
              'label.sbd-check',
              {},
              h('input', {
                type: 'checkbox',
                checked: v.some((y) => y === x),
                onchange: (e: Event) => {
                  const on = (e.target as HTMLInputElement).checked;
                  save({ ...f, values: on ? [...v, x] : v.filter((y) => y !== x) });
                },
              }),
              h('span', {}, x === null ? '(Blank)' : String(x)),
            ),
          ),
        );
      } catch (e) {
        box.textContent = (e as Error).message;
      }
    })();
  } else if (f.op === 'between') {
    body.append(
      h(
        'div.sbd-row',
        {},
        h('input.sbd-input', { value: v[0] ?? '', placeholder: 'from', onchange: (e: Event) => save({ ...f, values: [conv((e.target as HTMLInputElement).value), v[1] ?? null] }) }),
        h('input.sbd-input', { value: v[1] ?? '', placeholder: 'to', onchange: (e: Event) => save({ ...f, values: [v[0] ?? null, conv((e.target as HTMLInputElement).value)] }) }),
      ),
    );
  } else if (f.op === 'top') {
    const measures = [...model.tables.values()].flatMap((t) => [...t.measures.keys()].map((m) => `${t.name}.${m}`));
    body.append(
      h(
        'div.sbd-row',
        {},
        h('input.sbd-input', { type: 'number', value: v[0] ?? 10, onchange: (e: Event) => save({ ...f, values: [Number((e.target as HTMLInputElement).value) || 10] }) }),
        h('select.sbd-input', { onchange: (e: Event) => save({ ...f, by: (e.target as HTMLSelectElement).value }) }, ...measures.map((m) => h('option', { value: m, selected: f.by === m }, m.split('.').slice(1).join('.')))),
      ),
    );
    if (!f.by && measures[0]) queueMicrotask(() => save({ ...f, by: measures[0] }));
  } else if (f.op === 'sql') {
    body.append(h('textarea.sbd-input.sbd-code', { rows: 3, onchange: (e: Event) => save({ ...f, sql: (e.target as HTMLTextAreaElement).value }) }, f.sql ?? ''));
  } else if (f.op !== 'is-null' && f.op !== 'not-null' && f.op !== 'tuples') {
    body.append(h('input.sbd-input', { value: v[0] ?? '', onchange: (e: Event) => save({ ...f, values: [conv((e.target as HTMLInputElement).value)] }) }));
  }
  return h('div.sbd-filter', {}, h('div.sbd-filter-head', {}, h('b', { title: f.field ?? '' }, label), h('button.sbd-chip-btn', { title: 'Remove filter', onclick: remove }, '×')), opSel, body);
}

// ------------------------------------------------------------------ SQL

function sqlTab(ctx: PanelContext, v: Visual): HTMLElement {
  if (v.sql !== undefined) {
    const ta = h('textarea.sbd-input.sbd-code.sbd-sql-edit', { rows: 16, spellcheck: false }, v.sql) as HTMLTextAreaElement;
    return h(
      'div.sbd-form',
      {},
      hint('Custom SQL. Output columns map to the visual’s fields in order: dimensions first, then values. Filters apply to output columns with matching names.'),
      ta,
      h(
        'div.sbd-row',
        {},
        h('button.sbd-btn.sbd-primary', { onclick: () => ctx.store.change('visual', () => (v.sql = ta.value), v.id) }, 'Apply'),
        h('button.sbd-btn', { onclick: () => ctx.store.change('visual', () => delete v.sql, v.id) }, 'Back to generated SQL'),
      ),
    );
  }
  let sql = '';
  try {
    sql = ctx.view.sqlFor(v);
  } catch (e) {
    sql = '-- ' + (e as Error).message;
  }
  return h(
    'div.sbd-form',
    {},
    hint('The SQL this visual runs now, with every filter applied.'),
    h('pre.sbd-sql', {}, sql),
    h(
      'div.sbd-row',
      {},
      h('button.sbd-btn', { onclick: () => void navigator.clipboard?.writeText(sql).then(() => toast('Copied', 'ok')) }, 'Copy'),
      h(
        'button.sbd-btn',
        {
          onclick: () => {
            try {
              const custom = ctx.view.sqlFor(v, true);
              ctx.store.change('visual', () => (v.sql = custom), v.id);
            } catch (e) {
              toast((e as Error).message, 'error');
            }
          },
        },
        'Edit as custom SQL',
      ),
    ),
  );
}
