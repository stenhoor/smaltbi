// Slicers (list, dropdown, buttons, range, search), text boxes and images.
import type { Filter, SqlValue } from '../core/types.js';
import { type RenderContext, registerVisual } from './api.js';
import { ICONS } from './icons.js';
import { esc } from 'smaltkit/svg';
import { choiceControl, rangeControl, searchControl } from 'smaltkit/controls';

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

/** Minimal, safe markdown: headings, bold, italic, code, links, lists, paragraphs. */
export function miniMarkdown(src: string): string {
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\[(.+?)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(`<ul>${list.map((l) => `<li>${l}</li>`).join('')}</ul>`);
    list = [];
  };
  for (const line of src.split(/\n/)) {
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (li) {
      list.push(inline(li[1]!));
      continue;
    }
    flush();
    if (h) out.push(`<h${h[1]!.length + 1}>${inline(h[2]!)}</h${h[1]!.length + 1}>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return out.join('');
}

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
    let html = miniMarkdown(String(ctx.options.text ?? ''));
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
