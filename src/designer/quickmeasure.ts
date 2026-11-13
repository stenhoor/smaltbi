// The "Quick measure" dialog: a time-intelligence measure (year to date, same period last year, rolling months, …)
// over a measure of the model, worked out from the date table (core/timeintel.ts). No SQL to write.
import type { Measure, TimeCalcKind } from '../core/types.js';
import { TIME_CALCS } from '../core/timeintel.js';
import { dialog, h, toast } from 'smaltkit/dom';
import { field } from './panel.js';
import { dateTableDialog } from './datetable.js';
import type { DialogContext } from './dialogs.js';

/**
 * The name a quick measure gets unless the user types one: "Revenue YTD", "Revenue rolling 3 months". When a measure
 * has that name already (`taken`, any case), the first free "Revenue YTD 2", "Revenue YTD 3", …
 */
export function quickMeasureName(base: string, calc: TimeCalcKind, months: number, taken: Iterable<string> = []): string {
  const name = calc === 'rolling' ? `${base} rolling ${months} months` : `${base} ${TIME_CALCS[calc].suffix}`;
  const used = new Set([...taken].map((t) => t.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  let n = 2;
  while (used.has(`${name} ${n}`.toLowerCase())) n++;
  return `${name} ${n}`;
}

/**
 * Add a quick measure (`of`: the base measure, preselected) or edit one (`name`: an existing quick measure of
 * `table`). Without a date table, offers to add one first.
 */
export async function quickMeasureDialog(ctx: DialogContext, table: string, name?: string, of?: string): Promise<void> {
  const model = ctx.store.report.model;
  if (!model.dateTable) {
    const add = await dialog<boolean>(
      'Quick measure',
      h('div.sbd-form', {}, h('div.sbd-hint', {}, 'Time-intelligence measures (year to date, last year, rolling months) work from a date table: a calendar related to your dates. Add one first; it takes a moment.')),
      [{ label: 'Cancel' }, { label: 'Add date table…', primary: true, value: () => true }],
    );
    if (add) await dateTableDialog(ctx.store, ctx.session.model);
    return;
  }
  const list = (model.measures ??= []);
  const existing = name ? list.find((m) => m.table === table && m.name === name && m.time) : undefined;
  const bases = list.filter((m) => !m.time);
  if (!bases.length) {
    toast('Add a measure first (for example SUM of an amount): a quick measure works on one', 'error');
    return;
  }
  const baseKey = (m: Measure) => `${m.table}.${m.name}`;
  const startOf = existing?.time?.of ?? of;
  const start = bases.find((m) => baseKey(m) === startOf || (m.name === startOf && m.table === table)) ?? bases.find((m) => m.table === table) ?? bases[0]!;
  const baseSel = h('select.sbd-input', {}, ...bases.map((m) => h('option', { value: baseKey(m), selected: m === start }, `${m.name} (${m.table})`))) as HTMLSelectElement;
  const calcSel = h('select.sbd-input', {}, ...(Object.keys(TIME_CALCS) as TimeCalcKind[]).map((k) => h('option', { value: k, selected: k === (existing?.time?.calc ?? 'ytd') }, TIME_CALCS[k].label))) as HTMLSelectElement;
  const months = h('input.sbd-input', { type: 'number', min: 1, max: 60, value: String(existing?.time?.months ?? 3) }) as HTMLInputElement;
  const monthsRow = field('Months', months);
  const about = h('div.sbd-hint');
  const nameIn = h('input.sbd-input', { spellcheck: false }) as HTMLInputElement;
  let named = !!existing; // the user typed a name (or kept an existing one): stop suggesting
  nameIn.value = existing?.name ?? '';
  nameIn.addEventListener('input', () => (named = true));
  const current = () => ({ base: bases.find((m) => baseKey(m) === baseSel.value)!, calc: calcSel.value as TimeCalcKind, n: Math.max(1, Math.min(60, Math.round(Number(months.value) || 3))) });
  const refresh = () => {
    const { base, calc, n } = current();
    monthsRow.style.display = calc === 'rolling' ? '' : 'none';
    const dt = model.dateTable!;
    const fiscal = dt.fiscalStart !== 1 && (calc === 'ytd' || calc === 'qtd') ? ` Years and quarters are fiscal, from ${new Date(2000, dt.fiscalStart - 1, 1).toLocaleString('en', { month: 'long' })}.` : '';
    about.textContent = `${TIME_CALCS[calc].description}${fiscal} Uses the date table ${dt.table} (${dt.source}): put one of its fields on the axis, or filter by it.`;
    // A free name: the dialog refuses one a measure already has.
    if (!named) nameIn.value = quickMeasureName(base.name, calc, n, list.filter((m) => m !== existing).map((m) => m.name));
  };
  for (const el of [baseSel, calcSel, months]) el.addEventListener('input', refresh);
  refresh();
  const body = h(
    'div.sbd-form.sbd-quick',
    {},
    h('div.sbd-row', {}, field('Measure', baseSel), field('Calculation', calcSel)),
    monthsRow,
    about,
    field('Name', nameIn),
  );
  const ok = await dialog<boolean>(existing ? 'Edit quick measure' : 'Quick measure', body, [
    ...(existing ? [{ label: 'Delete', value: () => (ctx.store.change('model', (r) => (r.model.measures = (r.model.measures ?? []).filter((m) => !(m.table === table && m.name === name)))), false) }] : []),
    { label: 'Cancel' },
    {
      label: existing ? 'Save' : 'Add measure',
      primary: true,
      value: () => {
        const { base, calc, n } = current();
        const newName = nameIn.value.trim();
        if (!newName) return (toast('Give the measure a name', 'error'), undefined);
        if (list.some((m) => m !== existing && m.name.toLowerCase() === newName.toLowerCase())) return (toast(`There is already a measure named ${newName}`, 'error'), undefined);
        const m: Measure = {
          table: base.table,
          name: newName,
          sql: '',
          time: { of: baseKey(base), calc, ...(calc === 'rolling' ? { months: n } : {}) },
          description: `${TIME_CALCS[calc].label}${calc === 'rolling' ? ` (${n})` : ''} of ${base.name}`,
          ...(calc === 'yoy%' ? { format: 'percent' } : base.format ? { format: base.format } : {}),
        };
        ctx.store.change('model', (r) => {
          const ms = (r.model.measures ??= []);
          const i = existing ? ms.findIndex((x) => x.table === table && x.name === name) : -1;
          if (i >= 0) ms[i] = m;
          else ms.push(m);
        });
        return true;
      },
    },
  ]);
  if (ok) toast(`${nameIn.value.trim()} ${existing ? 'saved' : 'added'}: drag it onto a visual with a date-table field`, 'ok');
}
