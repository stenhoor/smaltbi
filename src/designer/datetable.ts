// The "Add date table" dialog (model view). The table itself is planned in core/datetable.ts.
import { addDateTable, removeDateTable, type DateTableOptions } from '../core/datetable.js';
import type { Model } from '../core/model.js';
import { dialog, h, toast } from 'smaltkit/dom';
import { field } from './panel.js';
import type { DocStore } from './store.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Date and date-time columns of the model, as `table.column`, the first of the largest table first. */
export function dateColumns(model: Model): string[] {
  const out: string[] = [];
  for (const t of model.tables.values()) {
    if (t.source) continue; // a role is another table's columns again
    for (const c of t.columns.values()) if (!c.calc && (c.type === 'date' || c.type === 'datetime')) out.push(`${t.name}.${c.name}`);
  }
  return out;
}

/** Ask for the options and add (or replace, or remove) the report's date table. */
export async function dateTableDialog(store: DocStore, model: Model): Promise<void> {
  const current = store.report.model.dateTable;
  const sources = dateColumns(model).filter((s) => !current || !s.startsWith(current.table + '.'));
  if (!sources.length) {
    toast('No date columns in the model: a date table needs a column of dates to relate to', 'error');
    return;
  }
  const source = h('select.sbd-input', {}, ...sources.map((s) => h('option', { value: s, selected: s === current?.source }, s))) as HTMLSelectElement;
  const name = h('input.sbd-input', { type: 'text', value: current?.table ?? 'calendar', spellcheck: false }) as HTMLInputElement;
  const fiscal = h('select.sbd-input', {}, ...MONTHS.map((m, i) => h('option', { value: String(i + 1), selected: i + 1 === (current?.fiscalStart ?? 1) }, i === 0 ? 'January (calendar year)' : m))) as HTMLSelectElement;
  const week = h('select.sbd-input', {}, h('option', { value: '1', selected: current?.weekStart !== 0 }, 'Monday'), h('option', { value: '0', selected: current?.weekStart === 0 }, 'Sunday')) as HTMLSelectElement;
  const iso = h('input', { type: 'checkbox', checked: !!current?.isoWeeks }) as HTMLInputElement;
  const body = h(
    'div.sbd-form.sbd-datetable',
    {},
    h('div.sbd-hint', {}, 'A calendar table with a row per day, covering whole years around the dates of the column you pick, related to it. It is rebuilt with the data, so new dates are always covered. Use its Year › Quarter › Month › Date hierarchy to drill.'),
    h('div.sbd-row', {}, field('Dates from', source), field('Table name', name)),
    h('div.sbd-row', {}, field('Fiscal year starts in', fiscal), field('Weeks start on', week)),
    h('label.sbd-check', {}, iso, h('span', {}, 'Add ISO 8601 weeks (ISO week-year and week number)')),
  );
  const options = (): DateTableOptions => ({ source: source.value, table: name.value.trim() || 'calendar', fiscalStart: Number(fiscal.value), weekStart: week.value === '0' ? 0 : 1, isoWeeks: iso.checked });
  const buttons: { label: string; primary?: boolean; value?: () => string | undefined }[] = [{ label: 'Cancel' }];
  if (current) buttons.unshift({ label: 'Remove date table', value: () => 'remove' });
  buttons.push({
    label: current ? 'Update date table' : 'Add date table',
    primary: true,
    value: () => {
      if (!/^[A-Za-z_][\w ]*$/.test(name.value.trim() || 'calendar')) {
        toast('Use letters, digits, spaces and _ for the table name', 'error');
        return undefined;
      }
      return 'add';
    },
  });
  const choice = await dialog<string>(current ? 'Date table' : 'Add date table', body, buttons);
  if (choice === 'remove') store.change('data', (r) => removeDateTable(r));
  else if (choice === 'add') {
    const o = options();
    try {
      // Check first (a name clash throws) on a copy, so a refused change leaves no undo step behind.
      addDateTable(structuredClone(store.report), o);
    } catch (e) {
      toast((e as Error).message, 'error');
      return;
    }
    store.change('data', (r) => addDateTable(r, o));
  }
}
