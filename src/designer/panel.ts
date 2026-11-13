// The right-hand panel: Build (visual types and field wells), Format, Filters and SQL.
import type { Aggregation, FieldRef, Filter, FilterOp, Page, PageSize, SqlValue, Visual } from '../core/types.js';
import { conditionalSection } from './conditional.js';
import { referenceSection } from './reflines.js';
import { aggLabel, refName } from '../core/model.js';
import { quoteIdent } from '../core/sql.js';
import { type OptionDef, type VisualDef, visualDef, visualDefs } from '../visuals/index.js';
import { h, showMenu, toast } from 'smaltkit/dom';
import { FIELD_MIME, draggedRefs } from './fields.js';
import { PAGE_PRESETS, pageGeometry, pageSize } from '../theme/theme.js';
import { movePhone, phoneSequence } from '../report/phone.js';

/** A chip dragged out of a well: where it came from, and its settings (aggregation, label). */
const MOVE_MIME = 'application/x-smaltbi-move';

/** After the panel re-renders, put the focus back on a well's chip (keyboard reordering). */
function focusChip(role: string, i: number): void {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`.sbd-well[data-role="${CSS.escape(role)}"] > .sbd-chip[data-i="${i}"]`)?.focus());
}
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
  if (def.roles.length && !def.static && !def.slicer && !v.sql) out.append(repeatWell(ctx, v));
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
        tabIndex: 0,
        'data-i': i,
        'aria-label': `${label}: Alt+Up and Alt+Down move it, Delete removes it`,
        ondragstart: (e: Event) => {
          const dt = (e as DragEvent).dataTransfer!;
          dt.setData(FIELD_MIME, ref);
          dt.setData(MOVE_MIME, JSON.stringify({ visual: v.id, role: roleName, i, spec: r }));
          dt.effectAllowed = 'copyMove';
          (e.currentTarget as HTMLElement).classList.add('sbd-moving');
        },
        ondragend: (e: Event) => (e.currentTarget as HTMLElement).classList.remove('sbd-moving'),
        onkeydown: (e: Event) => {
          const ke = e as KeyboardEvent;
          const to = ke.key === 'ArrowUp' ? i - 1 : ke.key === 'ArrowDown' ? i + 1 : -2;
          if (ke.altKey && to >= 0 && to < refs.length) {
            ke.preventDefault();
            ke.stopPropagation();
            update((l) => l.splice(to, 0, l.splice(i, 1)[0]!));
            focusChip(roleName, to);
          } else if (ke.key === 'Delete' || ke.key === 'Backspace') {
            ke.preventDefault();
            ke.stopPropagation();
            update((l) => l.splice(i, 1));
            focusChip(roleName, Math.min(i, refs.length - 2));
          }
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
  /** Where a drop lands: before the chip under the pointer's upper half, else after it; the end otherwise. */
  const dropIndex = (e: DragEvent) => {
    const list = [...zone.querySelectorAll<HTMLElement>(':scope > .sbd-chip')];
    const at = list.findIndex((c) => {
      const r = c.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    return at < 0 ? list.length : at;
  };
  const marker = h('div.sbd-insert');
  const showMarker = (at: number) => {
    const list = [...zone.querySelectorAll<HTMLElement>(':scope > .sbd-chip')];
    const before = list[at] ?? zone.querySelector(':scope > .sbd-drop');
    if (before && marker.nextSibling !== before) zone.insertBefore(marker, before);
  };
  zone.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes(FIELD_MIME)) {
      e.preventDefault();
      if (e.dataTransfer.types.includes(MOVE_MIME)) e.dataTransfer.dropEffect = 'move';
      zone.classList.add('sbd-over');
      showMarker(dropIndex(e));
    }
  });
  zone.addEventListener('dragleave', (e) => {
    if (zone.contains(e.relatedTarget as Node)) return;
    zone.classList.remove('sbd-over');
    marker.remove();
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('sbd-over');
    marker.remove();
    const refsIn = draggedRefs(e.dataTransfer);
    if (!refsIn.length) return;
    let at = dropIndex(e);
    const moveData = e.dataTransfer!.getData(MOVE_MIME);
    const move = moveData ? (JSON.parse(moveData) as { visual: string; role: string; i: number; spec: FieldRef }) : null;
    ctx.store.change(
      'visual',
      () => {
        const fields = { ...v.fields };
        let incoming: FieldRef[] = refsIn;
        if (move && move.visual === v.id) {
          // A chip moved within this visual: take it out of its well (keeping its aggregation and label).
          const from = [...(fields[move.role] ?? [])];
          from.splice(move.i, 1);
          fields[move.role] = from;
          if (move.role === roleName && move.i < at) at--;
          const spec = move.spec;
          // A dimension well has no aggregation.
          incoming = [role.kind === 'dimension' && typeof spec !== 'string' && spec.agg ? (spec.label ? { field: spec.field, label: spec.label } : spec.field) : spec];
        }
        const list = [...(fields[roleName] ?? [])];
        list.splice(at, 0, ...incoming);
        // A well with a maximum keeps the dropped fields (and as many of the others as fit).
        if (role.max && list.length > role.max) {
          const keep = new Set(incoming);
          let extra = list.length - role.max;
          for (let j = list.length - 1; j >= 0 && extra > 0; j--) if (!keep.has(list[j]!)) (list.splice(j, 1), extra--);
          list.splice(role.max);
        }
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
    if (o.section) out.append(h('div.sbd-section-title', {}, o.section));
    if (o.when && (v.options?.[o.when.key] ?? def?.options?.find((x) => x.key === o.when!.key)?.default) !== o.when.equals) continue;
    out.append(optionInput(o, v.options?.[o.key] ?? o.default, (val) => set(() => (v.options = { ...(v.options ?? {}), [o.key]: val }))));
  }
  if (def?.refLines) out.append(referenceSection(ctx, v));
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
    phoneSection(ctx, v),
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
    pageSizeSection(ctx, p),
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
    const refs = draggedRefs(e.dataTransfer);
    if (refs.length) save([...filters, ...refs.map((r) => defaultFilter(ctx, r))]);
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

/** Page size: responsive (the default) or a fixed sheet: a preset, portrait or landscape, or a custom size. */
function pageSizeSection(ctx: PanelContext, p: Page): HTMLElement {
  const set = (size: PageSize | undefined) => ctx.store.change('page', () => (size ? (p.size = size) : delete p.size), p.id);
  const size = p.size;
  const preset = size?.preset ?? '';
  const px = pageSize(p);
  const rows = pageGeometry(ctx.session.theme, p).rows;
  /** Visuals below the sheet's last row: cut off in the viewer. */
  const outside = px ? p.visuals.filter((v) => v.layout.y + v.layout.h > rows) : [];
  const num = (label: string, value: number | undefined, on: (n: number) => void) =>
    field(label, h('input.sbd-input', { type: 'number', min: 100, max: 10000, step: 1, value: value ?? '', onchange: (e: Event) => on(Number((e.target as HTMLInputElement).value)) }));
  return h(
    'div.sbd-page-size',
    {},
    field(
      'Page size',
      h(
        'select.sbd-input',
        {
          onchange: (e: Event) => {
            const v = (e.target as HTMLSelectElement).value as PageSize['preset'] | '';
            if (!v) return set(undefined);
            const cur = pageSize(p) ?? PAGE_PRESETS['16:9'];
            set(v === 'custom' ? { preset: 'custom', width: cur.width, height: cur.height } : { preset: v });
          },
        },
        h('option', { value: '', selected: !preset }, 'Responsive (fits the window)'),
        ...Object.entries(PAGE_PRESETS).map(([k, d]) => h('option', { value: k, selected: preset === k }, d.label)),
        h('option', { value: 'custom', selected: preset === 'custom' }, 'Custom…'),
      ),
    ),
    size && size.preset !== 'custom'
      ? h(
          'div.sbd-seg',
          {},
          ...([false, true] as const).map((land) => {
            const isLand = px ? px.width > px.height : false;
            return h(
              'button.sbd-seg-btn' + (isLand === land ? '.sbd-on' : ''),
              { onclick: () => set({ preset: size.preset, ...(PAGE_PRESETS[size.preset as keyof typeof PAGE_PRESETS].paper ? (land ? { landscape: true } : {}) : land ? {} : { landscape: false }) }) },
              land ? 'Landscape' : 'Portrait',
            );
          }),
        )
      : null,
    size?.preset === 'custom'
      ? h(
          'div.sbd-grid2',
          {},
          num('Width (px)', size.width, (n) => set({ ...size, width: n })),
          num('Height (px)', size.height, (n) => set({ ...size, height: n })),
        )
      : null,
    h('div.sbd-hint', {}, px ? `A ${px.width} × ${px.height} px sheet with ${rows} rows. Readers see it at 100% and scroll, or choose Fit to window.` : 'The page fills the window and grows with its visuals; on narrow screens visuals stack.'),
    outside.length ? h('div.sbd-hint.sbd-warn', {}, `${outside.length === 1 ? '1 visual reaches' : `${outside.length} visuals reach`} below the page (marked): readers won't see ${outside.length === 1 ? 'it' : 'them'}. Move or resize, or add rows.`) : null,
    px
      ? field(
          'Rows',
          h('input.sbd-input', {
            type: 'number',
            min: 1,
            max: 60,
            value: rows,
            onchange: (e: Event) => {
              const n = Math.max(1, Math.min(60, Math.round(Number((e.target as HTMLInputElement).value)) || rows));
              ctx.store.change('page', () => (p.layout = { ...(p.layout ?? {}), rows: n }), p.id);
            },
          }),
        )
      : null,
  );
}

/** On phones the page is one column: show or hide this visual there, its height, and its place in the column. */
function phoneSection(ctx: PanelContext, v: Visual): HTMLElement {
  const p = ctx.page;
  const seq = phoneSequence(p).map((x) => x.id);
  const at = seq.indexOf(v.id);
  const setPhone = (next: Visual['phone']) =>
    ctx.store.change(
      'layout',
      () => {
        const clean = { ...(v.phone ?? {}), ...next };
        if (!clean.hidden) delete clean.hidden;
        if (!clean.h) delete clean.h;
        if (Object.keys(clean).length) v.phone = clean;
        else delete v.phone;
      },
      v.id,
    );
  const move = (by: -1 | 1) => ctx.store.change('layout', () => (p.phoneOrder = movePhone(p, v.id, by)), v.id);
  return h(
    'div.sbd-phone',
    {},
    h('div.sbd-section-title', {}, 'On phones'),
    checkbox('Show on phones', !v.phone?.hidden, (on) => setPhone({ hidden: !on })),
    h(
      'div.sbd-grid2',
      {},
      field(
        'Height (rows)',
        h('input.sbd-input', {
          type: 'number',
          min: 1,
          max: 40,
          value: v.phone?.h ?? '',
          placeholder: String(v.layout.h),
          onchange: (e: Event) => {
            const n = Math.round(Number((e.target as HTMLInputElement).value));
            setPhone({ h: n >= 1 && n <= 40 ? n : undefined });
          },
        }),
      ),
      field(
        `Place: ${at + 1} of ${seq.length}`,
        h(
          'div.sbd-row',
          {},
          h('button.sbd-btn.sbd-phone-up', { title: 'Earlier in the phone column', disabled: at <= 0, onclick: () => move(-1) }, '↑ Up'),
          h('button.sbd-btn.sbd-phone-down', { title: 'Later in the phone column', disabled: at < 0 || at >= seq.length - 1, onclick: () => move(1) }, '↓ Down'),
        ),
      ),
    ),
    p.phoneOrder ? h('button.sbd-link', { onclick: () => ctx.store.change('layout', () => delete p.phoneOrder, v.id) }, 'Back to reading order') : null,
  );
}

/** Repeat for each: a field (a dimension) whose values each get a copy of the visual, and how the copies are laid out. */
function repeatWell(ctx: PanelContext, v: Visual): HTMLElement {
  const set = (repeat: Visual['repeat']) => ctx.store.change('visual', () => (repeat ? (v.repeat = repeat) : delete v.repeat), v.id);
  const r = v.repeat;
  // A whole-number option of the repeat (or of its copy size), empty for none.
  type NumKey = 'minColumns' | 'maxColumns' | 'minRows' | 'maxRows' | 'maxHeight' | 'copyW' | 'copyH';
  const get = (key: NumKey) => (key === 'copyW' ? r?.copy?.w : key === 'copyH' ? r?.copy?.h : r?.[key]);
  const num = (label: string, key: NumKey, min: number, max: number, placeholder: string) =>
    field(
      label,
      h(`input.sbd-input.sbd-repeat-${key}`, {
        type: 'number',
        min,
        max,
        value: get(key) ?? '',
        placeholder,
        onchange: (e: Event) => {
          const n = Math.round(Number((e.target as HTMLInputElement).value));
          const value = n >= min && n <= max ? n : undefined;
          const next: NonNullable<Visual['repeat']> = { ...r!, copy: { ...r!.copy } };
          if (key === 'copyW' || key === 'copyH') next.copy = { ...next.copy, [key === 'copyW' ? 'w' : 'h']: value };
          else next[key] = value;
          for (const k of Object.keys(next) as (keyof typeof next)[]) if (next[k] === undefined && k !== 'field') delete next[k];
          if (next.copy) for (const k of ['w', 'h'] as const) if (next.copy[k] === undefined) delete next.copy[k];
          if (next.copy && !Object.keys(next.copy).length) delete next.copy;
          set(next);
        },
      }),
    );
  let label = r?.field ?? '';
  if (r) {
    try {
      label = ctx.session.model.resolve(r.field).label;
    } catch {}
  }
  const zone = h(
    'div.sbd-well.sbd-repeat',
    { 'data-role': 'repeat' },
    h('div.sbd-well-head', {}, h('span', {}, 'Repeat for each'), h('span.sbd-max', {}, 'max 1')),
    ...(r
      ? [
          h('div.sbd-chip', {}, h('span.sbd-chip-label', { title: r.field }, label), h('button.sbd-chip-btn', { title: 'Stop repeating', onclick: () => set(undefined) }, '×')),
          h(
            'div.sbd-row.sbd-repeat-opts',
            {},
            field(
              'Columns',
              h('input.sbd-input', {
                type: 'number',
                min: 1,
                max: 12,
                value: r.columns ?? '',
                placeholder: 'auto',
                onchange: (e: Event) => {
                  const n = Math.round(Number((e.target as HTMLInputElement).value));
                  set({ ...r, columns: n >= 1 && n <= 12 ? n : undefined });
                },
              }),
            ),
            field(
              'At most',
              h('input.sbd-input', {
                type: 'number',
                min: 1,
                max: 100,
                value: r.max ?? '',
                placeholder: '24',
                onchange: (e: Event) => {
                  const n = Math.round(Number((e.target as HTMLInputElement).value));
                  set({ ...r, max: n >= 1 && n <= 100 ? n : undefined });
                },
              }),
            ),
            field(
              'Order',
              h(
                'select.sbd-input',
                { onchange: (e: Event) => set({ ...r, order: (e.target as HTMLSelectElement).value === 'desc' ? 'desc' : undefined }) },
                h('option', { value: 'asc', selected: r.order !== 'desc' }, 'A → Z'),
                h('option', { value: 'desc', selected: r.order === 'desc' }, 'Z → A'),
              ),
            ),
          ),
          h('div.sbd-hint', {}, 'Each copy at least (page grid cells):'),
          h('div.sbd-row.sbd-repeat-opts', {}, num('Columns wide', 'copyW', 1, 24, 'auto'), num('Rows tall', 'copyH', 1, 40, 'auto')),
          h('div.sbd-hint', {}, 'Copies across and down (the minimums win over the copy size):'),
          h('div.sbd-row.sbd-repeat-opts', {}, num('Min columns', 'minColumns', 1, 12, 'none'), num('Max columns', 'maxColumns', 1, 12, 'none')),
          h('div.sbd-row.sbd-repeat-opts', {}, num('Min rows', 'minRows', 1, 20, 'none'), num('Max rows', 'maxRows', 1, 100, 'none')),
          field(
            'When copies don’t fit',
            h(
              'select.sbd-input.sbd-repeat-overflow',
              { onchange: (e: Event) => set({ ...r, overflow: (e.target as HTMLSelectElement).value === 'expand' ? 'expand' : undefined }) },
              h('option', { value: 'scroll', selected: r.overflow !== 'expand' }, 'Scroll inside the visual'),
              h('option', { value: 'expand', selected: r.overflow === 'expand' }, 'Expand the visual (moves the ones below)'),
            ),
          ),
          ...(r.overflow === 'expand'
            ? [
                num('Grow up to (rows tall)', 'maxHeight', 1, 200, 'no limit'),
                h('div.sbd-hint', {}, 'The visual grows in Preview and the viewer, up to this height, then scrolls; on the canvas, and on fixed-size pages, it scrolls.'),
              ]
            : []),
        ]
      : [h('div.sbd-drop', {}, 'Drop a field: a copy of this visual for each of its values')]),
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
    const ref = draggedRefs(e.dataTransfer)[0];
    if (!ref) return;
    if (ctx.session.model.kindOf(ref) === 'measure') return toast('Repeat for each needs a field to group by (a column), not a measure', 'error');
    set({ ...(v.repeat ?? {}), field: ref });
  });
  return zone;
}
