// Model → Parameters…: what-if parameters, values readers change with a Parameter control and measures use as
// `[@Name]`. Each has a name, a type (number or text), a default, and a range (numbers) or choices (text).
import type { Parameter } from '../core/types.js';
import { dialog, h, toast } from 'smaltkit/dom';
import type { DocStore } from './store.js';

const NAME = /^[A-Za-z_][\w ]{0,40}$/;

export async function parametersDialog(store: DocStore): Promise<void> {
  const list: Parameter[] = structuredClone(store.report.model.parameters ?? []);
  const rows = h('div.sbd-params');
  const num = (v: number | undefined, on: (n: number | undefined) => void, placeholder: string, cls: string) =>
    h(`input.sbd-input.${cls}`, {
      type: 'number',
      step: 'any',
      value: v ?? '',
      placeholder,
      onchange: (e: Event) => {
        const s = (e.target as HTMLInputElement).value;
        on(s === '' ? undefined : Number(s));
      },
    });
  const render = () => {
    rows.replaceChildren(
      ...(list.length
        ? list.map((p, i) =>
            h(
              'div.sbd-param',
              {},
              h(
                'div.sbd-row',
                {},
                h('input.sbd-input.sbd-param-name', { value: p.name, placeholder: 'Name', onchange: (e: Event) => (p.name = (e.target as HTMLInputElement).value.trim()) }),
                h(
                  'select.sbd-input.sbd-param-type',
                  {
                    onchange: (e: Event) => {
                      p.type = (e.target as HTMLSelectElement).value as Parameter['type'];
                      p.value = p.type === 'number' ? 0 : '';
                      delete p.min, delete p.max, delete p.step, delete p.choices;
                      render();
                    },
                  },
                  h('option', { value: 'number', selected: p.type === 'number' }, 'Number'),
                  h('option', { value: 'text', selected: p.type === 'text' }, 'Text'),
                ),
                h('button.sbd-chip-btn', { title: 'Remove', onclick: () => (list.splice(i, 1), render()) }, '×'),
              ),
              p.type === 'number'
                ? h(
                    'div.sbd-row',
                    {},
                    num(Number(p.value), (n) => (p.value = n ?? 0), 'default', 'sbd-param-value'),
                    num(p.min, (n) => (p.min = n), 'min', 'sbd-param-min'),
                    num(p.max, (n) => (p.max = n), 'max', 'sbd-param-max'),
                    num(p.step, (n) => (p.step = n), 'step', 'sbd-param-step'),
                  )
                : h(
                    'div.sbd-row',
                    {},
                    h('input.sbd-input.sbd-param-value', { value: String(p.value ?? ''), placeholder: 'default', onchange: (e: Event) => (p.value = (e.target as HTMLInputElement).value) }),
                    h('input.sbd-input.sbd-param-choices', {
                      value: (p.choices ?? []).join(', '),
                      placeholder: 'choices, comma-separated (optional)',
                      onchange: (e: Event) => {
                        const c = (e.target as HTMLInputElement).value.split(',').map((x) => x.trim()).filter(Boolean);
                        if (c.length) p.choices = c;
                        else delete p.choices;
                      },
                    }),
                  ),
            ),
          )
        : [h('div.sbd-hint', {}, 'No parameters yet.')]),
    );
  };
  render();
  const body = h(
    'div.sbd-form',
    {},
    h('div.sbd-hint', {}, 'A parameter is a value readers change with a Parameter control. Use it in a measure or calculated column as [@Name], for example SUM(sales.amount) * (1 + [@Growth]). A number with a minimum and maximum shows as a slider.'),
    rows,
    h('button.sbd-btn.sbd-param-add', { onclick: () => (list.push({ name: `Parameter ${list.length + 1}`, type: 'number', value: 0 }), render()) }, '+ Add parameter'),
  );
  const ok = await dialog<boolean>('Parameters', body, [
    { label: 'Cancel' },
    {
      label: 'Apply',
      primary: true,
      value: () => {
        const names = new Set<string>();
        for (const p of list) {
          if (!NAME.test(p.name)) return (toast(`"${p.name}" is not a usable name: letters, digits, spaces and _ (starting with a letter)`, 'error'), undefined);
          if (names.has(p.name.toLowerCase())) return (toast(`Two parameters are named ${p.name}`, 'error'), undefined);
          names.add(p.name.toLowerCase());
          if (p.type === 'number' && p.min !== undefined && p.max !== undefined && p.min > p.max) return (toast(`${p.name}: the minimum is above the maximum`, 'error'), undefined);
        }
        return true;
      },
    },
  ]);
  if (!ok) return;
  store.change('model', (r) => {
    if (list.length) r.model.parameters = list;
    else delete r.model.parameters;
  });
}
