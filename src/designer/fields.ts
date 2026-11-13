// The Fields pane: every table of the model with its measures, hierarchies and columns.
// Fields are dragged onto the canvas or the field wells, or clicked to add to the selected visual. Ctrl/Cmd-click and
// Shift-click select several (dragged or added together); the search box and the list work from the keyboard.
import type { Model } from '../core/model.js';
import { h, showMenu, type MenuItem } from 'smaltkit/dom';
import { typeIcon } from '../visuals/icons.js';

export const FIELD_MIME = 'application/x-smaltbi-field';
/** Several fields dragged at once: a JSON array of refs (FIELD_MIME holds the first, for drop targets that take one). */
export const FIELDS_MIME = 'application/x-smaltbi-fields';

/** The fields a drag carries: several (multi-select) or one. */
export function draggedRefs(dt: DataTransfer | null): string[] {
  if (!dt) return [];
  const many = dt.getData(FIELDS_MIME);
  if (many) {
    try {
      const refs = JSON.parse(many) as unknown;
      if (Array.isArray(refs) && refs.every((r) => typeof r === 'string') && refs.length) return refs as string[];
    } catch {}
  }
  const one = dt.getData(FIELD_MIME);
  return one ? [one] : [];
}

export interface FieldsPaneHandlers {
  add(ref: string): void;
  /** Several selected fields: added to the selected visual (or a new one) together. */
  addAll(refs: string[]): void;
  newMeasure(table: string): void;
  newColumn(table: string): void;
  editMeasure(table: string, name: string): void;
  /** A time-intelligence quick measure: a new one over `of`, or edit `name`. */
  quickMeasure(table: string, name?: string, of?: string): void;
  editColumn(table: string, name: string): void;
  filter(ref: string): void;
}


export function fieldsPane(model: Model, handlers: FieldsPaneHandlers, collapsed: Set<string>, selection: Set<string> = new Set(), query = { value: '' }): HTMLElement {
  const search = h('input.sbd-search', { type: 'search', placeholder: 'Search fields  ( / )', 'aria-label': 'Search fields', value: query.value }) as HTMLInputElement;
  const list = h('div.sbd-fields-list', { role: 'listbox', 'aria-multiselectable': 'true', 'aria-label': 'Fields' });
  const status = h('div.sbd-field-sel');
  /** The anchor of a Shift-click range. */
  let anchor: string | null = null;
  const visible = () => [...list.querySelectorAll<HTMLElement>('.sbd-field')];
  const refOf = (el: Element) => (el as HTMLElement).dataset.ref!;
  const paintSelection = () => {
    for (const el of visible()) {
      const on = selection.has(refOf(el));
      el.classList.toggle('sbd-selected', on);
      el.setAttribute('aria-selected', String(on));
    }
    status.replaceChildren();
    if (selection.size > 1)
      status.append(
        h('span', {}, `${selection.size} fields selected`),
        h('button.sbd-link', { onclick: () => handlers.addAll([...selection]) }, 'Add'),
        h('button.sbd-link', { onclick: () => (selection.clear(), paintSelection()) }, 'Clear'),
      );
  };
  /** Fields to act on from `ref`: the whole selection when ref is part of it, else just ref. */
  const acting = (ref: string) => (selection.has(ref) && selection.size > 1 ? [...visible().map(refOf).filter((r) => selection.has(r))] : [ref]);
  const addRefs = (refs: string[]) => (refs.length > 1 ? handlers.addAll(refs) : handlers.add(refs[0]!));
  const focusField = (el: HTMLElement | undefined) => {
    if (!el) return;
    for (const f of visible()) f.tabIndex = -1;
    el.tabIndex = 0;
    el.focus();
    el.scrollIntoView({ block: 'nearest' });
  };
  const render = () => {
    query.value = search.value;
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
            role: 'option',
            tabIndex: -1,
            'data-ref': ref,
            title: title ?? ref,
            ondragstart: (e: Event) => {
              const de = e as DragEvent;
              const refs = acting(ref);
              de.dataTransfer!.setData(FIELD_MIME, refs[0]!);
              if (refs.length > 1) de.dataTransfer!.setData(FIELDS_MIME, JSON.stringify(refs));
              de.dataTransfer!.setData('text/plain', refs.join('\n'));
              de.dataTransfer!.effectAllowed = 'copy';
            },
            onclick: (e: Event) => {
              const me = e as MouseEvent;
              if (me.ctrlKey || me.metaKey) {
                if (selection.has(ref)) selection.delete(ref);
                else selection.add(ref);
                anchor = ref;
                paintSelection();
              } else if (me.shiftKey && anchor) {
                const refs = visible().map(refOf);
                const [a, b] = [refs.indexOf(anchor), refs.indexOf(ref)].sort((x, y) => x - y);
                if (a! >= 0) for (const r of refs.slice(a, b! + 1)) selection.add(r);
                paintSelection();
              } else {
                selection.clear();
                anchor = ref;
                paintSelection();
                handlers.add(ref);
              }
            },
            onkeydown: (e: Event) => {
              const ke = e as KeyboardEvent;
              const all = visible();
              const i = all.indexOf(el);
              if (ke.key === 'ArrowDown' || ke.key === 'ArrowUp') {
                ke.preventDefault();
                const next = all[i + (ke.key === 'ArrowDown' ? 1 : -1)];
                if (next && ke.shiftKey) {
                  selection.add(ref);
                  selection.add(refOf(next));
                  paintSelection();
                }
                if (next) focusField(next);
                else if (ke.key === 'ArrowUp') search.focus();
              } else if (ke.key === 'Enter') {
                ke.preventDefault();
                addRefs(acting(ref));
              } else if (ke.key === ' ') {
                ke.preventDefault();
                if (selection.has(ref)) selection.delete(ref);
                else selection.add(ref);
                anchor = ref;
                paintSelection();
              } else if (ke.key === 'Escape') {
                ke.preventDefault();
                ke.stopPropagation();
                if (selection.size) (selection.clear(), paintSelection());
                else search.focus();
              }
            },
            oncontextmenu: (e: Event) => {
              const me = e as MouseEvent;
              me.preventDefault();
              const refs = acting(ref);
              if (refs.length > 1) return showMenu(me.clientX, me.clientY, [{ label: `Add ${refs.length} fields to visual`, action: () => handlers.addAll(refs) }, { label: 'Clear selection', action: () => (selection.clear(), paintSelection()) }]);
              showMenu(me.clientX, me.clientY, [{ label: 'Add to visual', action: () => handlers.add(ref) }, { label: 'Add as filter', action: () => handlers.filter(ref) }, ...menu]);
            },
          },
          h('span.sbd-ficon', { html: icon }),
          h('span.sbd-flabel', {}, label),
        );
        items.push(el);
      };
      for (const m of t.measures.values())
        item(
          `${t.name}.${m.name}`,
          m.name,
          'ƒx',
          '.sbd-measure' + (m.time ? '.sbd-time' : ''),
          m.time
            ? [{ label: 'Edit quick measure…', action: () => handlers.quickMeasure(t.name, m.name) }]
            : [
                { label: 'Edit measure…', action: () => handlers.editMeasure(t.name, m.name) },
                { label: 'Quick measure…', action: () => handlers.quickMeasure(t.name, undefined, `${t.name}.${m.name}`) },
              ],
          m.description ?? m.sql,
        );
      for (const hi of t.hierarchies.values()) item(`${t.name}.${hi.name}`, hi.name, '⋮', '.sbd-hier', [], hi.levels.join(' › '));
      for (const c of t.columns.values()) {
        if (c.hidden && !q) continue;
        item(`${t.name}.${c.name}`, c.label, typeIcon(c.type), c.calc ? '.sbd-calc' : '', c.calc ? [{ label: 'Edit column…', action: () => handlers.editColumn(t.name, c.name) }] : [], c.calc ? c.sql : `${c.name} (${c.type})`);
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
        h('span.sbd-kind', { title: t.source ? `${t.source} again, through its own relationship` : '' }, t.source ? `${t.source} role` : t.kind === 'BASE TABLE' ? '' : t.kind.toLowerCase()),
        t.source ? null : h(
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
    else if (q && !list.childElementCount) list.append(h('div.sbd-hint', {}, `No field matches “${search.value.trim()}”`));
    // Drop selected fields that are gone (renamed, deleted); keep the rest selected across searches.
    for (const r of [...selection]) if (!model.kindOf(r)) selection.delete(r);
    const first = visible()[0];
    if (first) first.tabIndex = 0;
    paintSelection();
  };
  search.addEventListener('input', render);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusField(visible()[0]);
    } else if (e.key === 'Enter') {
      // Enter in the search adds the first match (or the selection).
      e.preventDefault();
      const first = visible()[0];
      if (first) addRefs(acting(refOf(first)));
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      if (search.value) {
        e.preventDefault();
        search.value = '';
        render();
      } else search.blur();
    }
  });
  render();
  return h('section.sbd-fields', {}, h('div.sbd-pane-title', {}, 'Fields'), search, status, list);
}
