// The Format tab's "Reference lines" section for cartesian charts: lines across the plot at a fixed value (a target)
// or at a statistic of the first series (average, median, min, max). Stored in options.refLines; drawn by smaltkit.
import type { Visual } from '../core/types.js';
import { h } from 'smaltkit/dom';
import type { RefLine } from 'smaltkit/charts';
import type { PanelContext } from './panel.js';

const KINDS: [string, string][] = [
  ['value', 'A value'],
  ['avg', 'Average'],
  ['median', 'Median'],
  ['min', 'Minimum'],
  ['max', 'Maximum'],
];
const TONES: [string, string][] = [
  ['', 'Grey'],
  ['good', 'Green'],
  ['bad', 'Red'],
  ['warn', 'Amber'],
  ['accent', 'Accent'],
];

const select = (options: [string, string][], value: string, onChange: (v: string) => void) =>
  h('select.sbd-input', { onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value) }, ...options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));

function lineCard(r: RefLine, save: (r: RefLine) => void, remove: () => void): HTMLElement {
  const kind = r.stat ?? 'value';
  return h(
    'div.sbd-filter.sbd-refline',
    {},
    h('div.sbd-filter-head', {}, h('b', {}, 'Line at'), h('button.sbd-chip-btn', { title: 'Remove line', onclick: remove }, '×')),
    h(
      'div.sbd-row',
      {},
      select(KINDS, kind, (k) => save(k === 'value' ? { ...r, stat: undefined, value: r.value ?? 0 } : { ...r, stat: k as RefLine['stat'], value: undefined })),
      ...(kind === 'value'
        ? [
            h('input.sbd-input', {
              type: 'number',
              step: 'any',
              value: r.value ?? '',
              placeholder: 'value',
              onchange: (e: Event) => save({ ...r, value: (e.target as HTMLInputElement).value === '' ? undefined : Number((e.target as HTMLInputElement).value) }),
            }),
          ]
        : []),
    ),
    h(
      'div.sbd-row',
      {},
      h('input.sbd-input', { type: 'text', value: r.label ?? '', placeholder: kind === 'value' ? 'Label (Target, …)' : 'Label', onchange: (e: Event) => save({ ...r, label: (e.target as HTMLInputElement).value.trim() || undefined }) }),
      select(TONES, r.tone ?? '', (t) => save({ ...r, tone: (t || undefined) as RefLine['tone'] })),
    ),
  );
}

/** The section: the chart's reference lines and a button to add one. */
export function referenceSection(ctx: PanelContext, v: Visual): HTMLElement {
  const lines = (Array.isArray(v.options?.refLines) ? v.options!.refLines : []) as RefLine[];
  const set = (next: RefLine[]) =>
    ctx.store.change(
      'visual',
      () => {
        const o = { ...(v.options ?? {}) };
        if (next.length) o.refLines = next;
        else delete o.refLines;
        v.options = o;
      },
      v.id,
    );
  return h(
    'div.sbd-reflines',
    {},
    h('div.sbd-section-title', {}, 'Reference lines'),
    lines.length ? null : h('div.sbd-hint', {}, 'Mark a target, or the average of the values, across the chart.'),
    ...lines.map((r, i) =>
      lineCard(
        r,
        (n) => set(lines.map((x, j) => (j === i ? n : x))),
        () => set(lines.filter((_, j) => j !== i)),
      ),
    ),
    h('button.sbd-btn.sbd-add-refline', { onclick: () => set([...lines, { stat: 'avg' }]) }, '+ Add reference line'),
  );
}
