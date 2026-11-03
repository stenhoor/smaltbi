// Slicers (list, dropdown, buttons, range, search), text boxes and images.
import type { Filter, SqlValue } from '../core/types.js';
import { type RenderContext, registerVisual } from './api.js';
import { ICONS } from './icons.js';
import { esc } from 'smaltkit/svg';


function selectedValues(ctx: RenderContext): SqlValue[] | null {
  const f = ctx.api.filters().find((x) => x.op === 'in');
  return f ? (f.values ?? []) : null;
}

const same = (a: SqlValue, b: SqlValue) => a === b || (typeof a === 'bigint' || typeof b === 'bigint' ? String(a) === String(b) : false);

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
    const refName = typeof ref === 'string' ? ref : ref?.field;
    if (!refName) {
      ctx.el.innerHTML = '<div class="sb-empty">Add a field</div>';
      return;
    }
    if (style === 'search') {
      const cur = ctx.api.filters().find((x) => x.op === 'contains')?.values?.[0] ?? '';
      ctx.el.innerHTML = `<div class="sb-slicer"><input class="sb-input" type="search" placeholder="Search…" value="${esc(cur)}"></div>`;
      const input = ctx.el.querySelector('input')!;
      let t: ReturnType<typeof setTimeout>;
      input.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => ctx.api.setFilters(input.value ? [{ field: refName, op: 'contains', values: [input.value] }] : []), 250);
      });
      return;
    }
    if (style === 'range') {
      const [mn, mx] = ctx.data.measures;
      const cur = ctx.api.filters().find((x) => x.op === 'between')?.values ?? [];
      const isNum = mn?.field.type === 'number';
      const type = isNum ? 'number' : 'date';
      const lo = mn ? mn.values[0] : null;
      const hi = mx ? mx.values[0] : null;
      const v = (x: SqlValue | undefined) => (x === null || x === undefined ? '' : esc(type === 'date' ? String(x).slice(0, 10) : x));
      ctx.el.innerHTML = `<div class="sb-slicer sb-range"><input class="sb-input" type="${type}" data-i="0" value="${v(cur[0])}" placeholder="${v(lo)}" min="${v(lo)}" max="${v(hi)}"><span>–</span><input class="sb-input" type="${type}" data-i="1" value="${v(cur[1])}" placeholder="${v(hi)}" min="${v(lo)}" max="${v(hi)}"></div>`;
      const inputs = [...ctx.el.querySelectorAll('input')];
      for (const inp of inputs)
        inp.addEventListener('change', () => {
          const vals = inputs.map((i) => (i.value === '' ? null : isNum ? Number(i.value) : i.value));
          ctx.api.setFilters(vals.every((x) => x === null) ? [] : [{ field: refName, op: 'between', values: vals }]);
        });
      return;
    }
    const values: SqlValue[] = [];
    if (fieldCol) for (let i = 0; i < ctx.data.rows; i++) values.push(fieldCol.values[i]!);
    const sel = selectedValues(ctx);
    // Keep selected values visible even when other filters removed them.
    for (const s of sel ?? []) if (!values.some((v) => same(v, s))) values.push(s);
    const fmt = fieldCol?.fmt ?? ((v: SqlValue) => String(v));
    const isOn = (v: SqlValue) => !!sel?.some((s) => same(s, v));
    const single = !!ctx.options.single;
    const set = (vals: SqlValue[]) => ctx.api.setFilters(vals.length ? [{ field: refName, op: 'in', values: vals } as Filter] : []);
    const toggle = (v: SqlValue, additive: boolean) => {
      const cur = sel ?? [];
      if (single || !additive) set(isOn(v) && cur.length === 1 ? [] : [v]);
      else set(isOn(v) ? cur.filter((s) => !same(s, v)) : [...cur, v]);
    };
    let html = '';
    if (style === 'buttons') {
      html = `<div class="sb-slicer sb-chips">${values.map((v, i) => `<button class="sb-chip${isOn(v) ? ' sb-on' : ''}" data-i="${i}">${esc(fmt(v))}</button>`).join('')}</div>`;
    } else if (style === 'dropdown') {
      const label = sel?.length ? (sel.length === 1 ? fmt(sel[0]!) : `${sel.length} selected`) : 'All';
      html = `<details class="sb-slicer sb-dropdown"><summary class="sb-input">${esc(label)}</summary><div class="sb-dropdown-list">${values
        .map((v, i) => `<label><input type="checkbox" data-i="${i}"${isOn(v) ? ' checked' : ''}> ${esc(fmt(v))}</label>`)
        .join('')}</div></details>`;
    } else {
      html = `<div class="sb-slicer sb-list">${values.map((v, i) => `<label><input type="${single ? 'radio' : 'checkbox'}" name="${esc(ctx.visual.id)}" data-i="${i}"${isOn(v) ? ' checked' : ''}> <span>${esc(fmt(v))}</span></label>`).join('')}</div>`;
    }
    if (sel?.length) html += `<button class="sb-clear" title="Clear selection">Clear</button>`;
    const wasOpen = ctx.el.querySelector('details')?.open;
    ctx.el.innerHTML = html;
    if (wasOpen) ctx.el.querySelector('details')!.open = true;
    ctx.el.querySelector('.sb-clear')?.addEventListener('click', () => set([]));
    ctx.el.querySelectorAll<HTMLElement>('[data-i]').forEach((el) => {
      const v = values[Number(el.dataset.i)]!;
      if (el instanceof HTMLInputElement) el.addEventListener('change', () => toggle(v, style !== 'list' || !single ? true : false));
      else el.addEventListener('click', (e) => toggle(v, e.ctrlKey || e.metaKey || !single));
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
