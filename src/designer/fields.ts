// The Fields pane: every table of the model with its measures, hierarchies and columns.
// Fields are dragged onto the canvas or the field wells, or clicked to add to the selected visual.
import type { Model } from '../core/model.js';
import { h, showMenu, type MenuItem } from '../kit/dom.js';

export const FIELD_MIME = 'application/x-smaltbi-field';

export interface FieldsPaneHandlers {
  add(ref: string): void;
  newMeasure(table: string): void;
  newColumn(table: string): void;
  editMeasure(table: string, name: string): void;
  editColumn(table: string, name: string): void;
  filter(ref: string): void;
}

const TYPE_ICON: Record<string, string> = { number: '#', text: 'Aa', date: '◷', datetime: '◷', bool: '◐', any: '·' };

export function fieldsPane(model: Model, handlers: FieldsPaneHandlers, collapsed: Set<string>): HTMLElement {
  const search = h('input.sbd-search', { type: 'search', placeholder: 'Search fields' }) as HTMLInputElement;
  const list = h('div.sbd-fields-list');
  const render = () => {
    const q = search.value.trim().toLowerCase();
    list.replaceChildren();
    for (const t of model.tables.values()) {
      const items: HTMLElement[] = [];
      const item = (ref: string, label: string, icon: string, cls: string, menu: MenuItem[], title?: string) => {
        if (q && !label.toLowerCase().includes(q) && !t.label.toLowerCase().includes(q)) return;
        const el = h(
          'div.sbd-field' + cls,
          {
            draggable: true,
            title: title ?? ref,
            ondragstart: (e: Event) => {
              const de = e as DragEvent;
              de.dataTransfer!.setData(FIELD_MIME, ref);
              de.dataTransfer!.setData('text/plain', ref);
              de.dataTransfer!.effectAllowed = 'copy';
            },
            onclick: () => handlers.add(ref),
            oncontextmenu: (e: Event) => {
              const me = e as MouseEvent;
              me.preventDefault();
              showMenu(me.clientX, me.clientY, [{ label: 'Add to visual', action: () => handlers.add(ref) }, { label: 'Add as filter', action: () => handlers.filter(ref) }, ...menu]);
            },
          },
          h('span.sbd-ficon', {}, icon),
          h('span.sbd-flabel', {}, label),
        );
        items.push(el);
      };
      for (const m of t.measures.values())
        item(`${t.name}.${m.name}`, m.name, 'ƒx', '.sbd-measure', [{ label: 'Edit measure…', action: () => handlers.editMeasure(t.name, m.name) }], m.description ?? m.sql);
      for (const hi of t.hierarchies.values()) item(`${t.name}.${hi.name}`, hi.name, '⋮', '.sbd-hier', [], hi.levels.join(' › '));
      for (const c of t.columns.values()) {
        if (c.hidden && !q) continue;
        item(`${t.name}.${c.name}`, c.label, TYPE_ICON[c.type] ?? '·', c.calc ? '.sbd-calc' : '', c.calc ? [{ label: 'Edit column…', action: () => handlers.editColumn(t.name, c.name) }] : [], c.calc ? c.sql : `${c.name} (${c.type})`);
      }
      if (q && !items.length) continue;
      const open = !collapsed.has(t.name) || !!q;
      const head = h(
        'button.sbd-table',
        {
          'aria-expanded': open,
          onclick: () => {
            if (collapsed.has(t.name)) collapsed.delete(t.name);
            else collapsed.add(t.name);
            render();
          },
          oncontextmenu: (e: Event) => {
            const me = e as MouseEvent;
            me.preventDefault();
            showMenu(me.clientX, me.clientY, [
              { label: 'New measure…', action: () => handlers.newMeasure(t.name) },
              { label: 'New calculated column…', action: () => handlers.newColumn(t.name) },
            ]);
          },
        },
        h('span.sbd-caret', {}, open ? '▾' : '▸'),
        h('span', {}, t.label),
        h('span.sbd-kind', {}, t.kind === 'BASE TABLE' ? '' : t.kind.toLowerCase()),
        h(
          'span.sbd-add',
          {
            title: 'New measure',
            onclick: (e: Event) => {
              e.stopPropagation();
              handlers.newMeasure(t.name);
            },
          },
          '+ƒ',
        ),
      );
      list.append(h('div.sbd-table-group', {}, head, open ? h('div.sbd-table-items', {}, ...items) : null));
    }
    if (!model.tables.size) list.append(h('div.sbd-hint', {}, 'No tables yet. Use Data → Add data to load a CSV, JSON or Parquet file.'));
  };
  search.addEventListener('input', render);
  render();
  return h('section.sbd-fields', {}, h('div.sbd-pane-title', {}, 'Fields'), search, list);
}
