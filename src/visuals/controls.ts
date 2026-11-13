// Slicers (list, dropdown, buttons, range, search), text boxes and images: smaltkit's controls and markdown.
import type { Filter, SqlValue } from '../core/types.js';
import { type RenderContext, registerVisual } from './api.js';
import { ICONS } from './icons.js';
import { esc } from 'smaltkit/svg';
import { choiceControl, rangeControl, searchControl } from 'smaltkit/controls';
import { markdown } from 'smaltkit/markdown';
import { formatter } from 'smaltkit/format';

function selectedValues(ctx: RenderContext): SqlValue[] | null {
  const f = ctx.api.filters().find((x) => x.op === 'in');
  return f ? (f.values ?? []) : null;
}

// The slicer: smaltkit's controls, with a selection that becomes this visual's filter on the page.
registerVisual({
  type: 'slicer',
  label: 'Slicer',
  group: 'core',
  icon: ICONS.slicer!,
  roles: [{ name: 'field', label: 'Field', kind: 'dimension', max: 1 }],
  options: [
    { key: 'style', label: 'Style', type: 'select', choices: [['list', 'List'], ['dropdown', 'Dropdown'], ['buttons', 'Buttons'], ['range', 'Range (between)'], ['search', 'Search (contains)']], default: 'list' },
    { key: 'single', label: 'Single selection', type: 'bool', default: false },
    { key: 'sync', label: 'Apply to all pages', type: 'bool', default: false },
  ],
  sort: 'category',
  limit: 2000,
  selfInteractive: true,
  slicer: true,
  plan(ctx) {
    const f = ctx.pick('field');
    if (ctx.visual.options?.style === 'range' && f[0]) return { main: { dims: [], measures: [ctx.aggregate(f[0], 'min'), ctx.aggregate(f[0], 'max')] } };
    if (ctx.visual.options?.style === 'search') return { main: { dims: [], measures: [] } };
    return { main: { dims: f, measures: [] } };
  },
  render(ctx) {
    const style = String(ctx.options.style ?? 'list');
    const fieldCol = ctx.data.role('field')[0];
    const ref = ctx.visual.fields.field?.[0];
    const field = typeof ref === 'string' ? ref : ref?.field;
    if (!field) {
      ctx.el.innerHTML = '<div class="sb-empty">Add a field</div>';
      return;
    }
    if (style === 'search') {
      const value = String(ctx.api.filters().find((x) => x.op === 'contains')?.values?.[0] ?? '');
      searchControl(ctx.el, { value, onChange: (text) => ctx.api.setFilters(text ? [{ field, op: 'contains', values: [text] }] : []) });
      return;
    }
    if (style === 'range') {
      const [mn, mx] = ctx.data.measures;
      const cur = ctx.api.filters().find((x) => x.op === 'between')?.values;
      rangeControl(ctx.el, {
        kind: mn?.field.type === 'number' ? 'number' : 'date',
        min: mn ? mn.values[0]! : null,
        max: mx ? mx.values[0]! : null,
        value: cur ? [cur[0] ?? null, cur[1] ?? null] : null,
        onChange: (range) => ctx.api.setFilters(range ? [{ field, op: 'between', values: range }] : []),
      });
      return;
    }
    const values: SqlValue[] = [];
    if (fieldCol) for (let i = 0; i < ctx.data.rows; i++) values.push(fieldCol.values[i]!);
    choiceControl(ctx.el, style === 'buttons' || style === 'dropdown' ? style : 'list', {
      values,
      selected: selectedValues(ctx),
      format: fieldCol?.fmt,
      single: !!ctx.options.single,
      name: ctx.visual.id,
      onChange: (vals) => ctx.api.setFilters(vals.length ? [{ field, op: 'in', values: vals } as Filter] : []),
    });
  },
});

registerVisual({
  type: 'text',
  label: 'Text box',
  group: 'core',
  icon: ICONS.text!,
  roles: [{ name: 'values', label: 'Values for {0}, {1}, …', kind: 'measure' }],
  options: [
    { key: 'text', label: 'Text (markdown)', type: 'textarea', default: '## Title\nWrite here. Use {0} to show the first value.' },
    { key: 'align', label: 'Align', type: 'select', choices: [['left', 'Left'], ['center', 'Center'], ['right', 'Right']], default: 'left' },
  ],
  static: true,
  render(ctx) {
    const ms = ctx.data.measures;
    // smaltkit/markdown (grown from this text box's own renderer): `#` is an <h2>, under the visual's title.
    let html = markdown(String(ctx.options.text ?? ''), { headingOffset: 1 });
    html = html.replace(/\{(\d+)\}/g, (w, i: string) => {
      const m = ms[Number(i)];
      return m && ctx.data.rows ? `<span class="sb-text-value">${esc(m.fmt(m.values[0]!))}</span>` : w;
    });
    ctx.el.innerHTML = `<div class="sb-text" style="text-align:${esc(ctx.options.align)}">${html}</div>`;
  },
});

registerVisual({
  type: 'image',
  label: 'Image',
  group: 'core',
  icon: ICONS.image!,
  roles: [],
  options: [
    { key: 'url', label: 'Image URL', type: 'text', default: '' },
    { key: 'alt', label: 'Alt text', type: 'text', default: '' },
    { key: 'fit', label: 'Fit', type: 'select', choices: [['contain', 'Contain'], ['cover', 'Cover']], default: 'contain' },
  ],
  static: true,
  render(ctx) {
    const url = String(ctx.options.url ?? '');
    ctx.el.innerHTML = /^(https?:|data:image\/|[\w./-]+$)/.test(url) && url
      ? `<img class="sb-image" src="${esc(url)}" alt="${esc(ctx.options.alt)}" style="object-fit:${esc(ctx.options.fit)}">`
      : '<div class="sb-empty">Set an image URL</div>';
  },
});

// A what-if parameter's control: a slider (a number with a range), a number box, a dropdown (text with choices) or a
// text box. Changing it runs every visual again with the new value.
registerVisual({
  type: 'parameter',
  label: 'Parameter',
  group: 'core',
  icon: ICONS.parameter!,
  roles: [],
  options: [{ key: 'param', label: 'Parameter name', type: 'text', default: '' }],
  static: true,
  selfInteractive: true,
  render(ctx) {
    const all = ctx.api.parameters();
    const wanted = String(ctx.options.param ?? '').trim().toLowerCase();
    const p = wanted ? all.find((x) => x.name.toLowerCase() === wanted) : all.length === 1 ? all[0] : undefined;
    if (!p) {
      ctx.el.innerHTML = `<div class="sb-empty">${all.length ? `Choose a parameter: ${esc(all.map((x) => x.name).join(', '))}` : 'Add a parameter to the model first'}</div>`;
      return;
    }
    const value = ctx.api.param(p.name);
    const show = p.type === 'number' && p.format ? formatter(p.format, 'number') : null;
    const fmt = (v: unknown) => (show ? show(Number(v)) : String(v ?? ''));
    const id = `p-${Math.random().toString(36).slice(2, 8)}`;
    let input: string;
    if (p.type === 'number' && p.min !== undefined && p.max !== undefined) {
      input = `<input class="sb-param-range" id="${id}" type="range" min="${p.min}" max="${p.max}" step="${p.step ?? 'any'}" value="${esc(value)}"><output class="sb-param-value" for="${id}">${esc(fmt(value))}</output>`;
    } else if (p.type === 'number') {
      input = `<input class="sb-param-input" id="${id}" type="number" step="${p.step ?? 'any'}" value="${esc(value)}">`;
    } else if (p.choices?.length) {
      input = `<select class="sb-param-input" id="${id}">${p.choices.map((c) => `<option${c === value ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
    } else {
      input = `<input class="sb-param-input" id="${id}" type="text" value="${esc(value)}">`;
    }
    ctx.el.innerHTML = `<div class="sb-param"><label class="sb-param-label" for="${id}">${esc(p.name)}</label><div class="sb-param-row">${input}</div></div>`;
    const el = ctx.el.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
    const out = ctx.el.querySelector('output');
    const read = () => (p.type === 'number' ? Number(el.value) : el.value);
    // A slider shows its value as it moves and runs the queries when it is let go.
    el.addEventListener('input', () => out && (out.textContent = fmt(el.value)));
    el.addEventListener('change', () => ctx.api.setParam(p.name, read()));
  },
});
