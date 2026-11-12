// The Format tab's "Conditional formatting" section: rules that colour measure values and add icons (tables,
// matrices, KPI cards). Rules are evaluated in report/conditional.ts and drawn by smaltkit.
import type { ConditionalRule, Visual } from '../core/types.js';
import type { VisualDef } from '../visuals/api.js';
import { h } from 'smaltkit/dom';
import { checkbox } from './panel.js';
import type { PanelContext } from './panel.js';

const OPS: [ConditionalRule['op'], string][] = [
  ['lt', 'is less than'],
  ['lte', 'is at most'],
  ['gt', 'is greater than'],
  ['gte', 'is at least'],
  ['eq', 'equals'],
  ['ne', 'is not'],
  ['between', 'is between'],
  ['positive', 'is positive'],
  ['negative', 'is negative'],
  ['blank', 'is blank'],
];
const TONES: [string, string][] = [
  ['', 'No colour'],
  ['good', 'Good (green)'],
  ['bad', 'Bad (red)'],
  ['warn', 'Warning (amber)'],
  ['accent', 'Accent'],
];
const ICONS: [string, string][] = [
  ['', 'No icon'],
  ['up', '▲ Up'],
  ['down', '▼ Down'],
  ['flat', '▶ Flat'],
  ['check', '✓ Check'],
  ['cross', '✕ Cross'],
  ['warn', '! Warning'],
  ['dot', '■ Dot'],
];

const refOf = (f: string | { field: string }) => (typeof f === 'string' ? f : f.field);

/** The visual's measure fields, as `[ref, label]`. */
function visualMeasures(ctx: PanelContext, v: Visual, def: VisualDef): [string, string][] {
  const out: [string, string][] = [];
  for (const role of def.roles.filter((r) => r.kind === 'measure')) {
    for (const f of v.fields[role.name] ?? []) {
      const ref = refOf(f);
      let label = ref;
      try {
        label = ctx.session.model.resolve(f, 'measure').label;
      } catch {}
      if (!out.some(([r]) => r === ref)) out.push([ref, label]);
    }
  }
  return out;
}

/** Every measure of the model, as `[ref, name]` (for "compared with"). */
function modelMeasures(ctx: PanelContext): [string, string][] {
  return [...ctx.session.model.tables.values()].flatMap((t) => [...t.measures.keys()].map((m) => [`${t.name}.${m}`, m] as [string, string]));
}

const select = (options: [string, string][], value: string, onChange: (v: string) => void) =>
  h('select.sbd-input', { onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value) }, ...options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));

function ruleCard(ctx: PanelContext, v: Visual, def: VisualDef, r: ConditionalRule, save: (r: ConditionalRule) => void, remove: () => void): HTMLElement {
  const shown = visualMeasures(ctx, v, def);
  const all = modelMeasures(ctx);
  const numIn = (value: number | undefined, onChange: (n: number | undefined) => void, placeholder: string) =>
    h('input.sbd-input', { type: 'number', step: 'any', value: value ?? '', placeholder, onchange: (e: Event) => onChange((e.target as HTMLInputElement).value === '' ? undefined : Number((e.target as HTMLInputElement).value)) });
  const needsValue = !['positive', 'negative', 'blank'].includes(r.op);
  const against = r.compare ?? '';
  const comparison = needsValue
    ? h(
        'div.sbd-row',
        {},
        select([['', 'a number'], ...all.map(([ref, n]) => [ref, n] as [string, string])], against, (x) => save({ ...r, compare: x || undefined, ...(x ? { value: undefined, value2: undefined } : {}) })),
        ...(against ? [] : [numIn(r.value, (n) => save({ ...r, value: n }), r.op === 'between' ? 'from' : 'value'), ...(r.op === 'between' ? [numIn(r.value2, (n) => save({ ...r, value2: n }), 'to')] : [])]),
      )
    : null;
  return h(
    'div.sbd-filter.sbd-rule',
    {},
    h(
      'div.sbd-filter-head',
      {},
      h('b', {}, 'Format'),
      h('button.sbd-chip-btn', { title: 'Remove rule', onclick: remove }, '×'),
    ),
    select([['*', 'All values'], ...shown], r.apply, (x) => save({ ...r, apply: x })),
    h('div.sbd-rule-label', {}, 'when'),
    select([['', 'the value'], ...all.filter(([ref]) => ref !== r.apply)], r.test ?? '', (x) => save({ ...r, test: x || undefined })),
    select(OPS, r.op, (x) => save({ ...r, op: x as ConditionalRule['op'] })),
    comparison,
    h('div.sbd-rule-label', {}, 'show'),
    h('div.sbd-row', {}, select(TONES, r.tone ?? '', (x) => save({ ...r, tone: (x || undefined) as ConditionalRule['tone'] })), select(ICONS, r.icon ?? '', (x) => save({ ...r, icon: (x || undefined) as ConditionalRule['icon'] }))),
    checkbox('Colour the background', !!r.fill, (on) => save({ ...r, fill: on || undefined })),
  );
}

/** The section: the visual's rules, first match wins, and a button to add one. */
export function conditionalSection(ctx: PanelContext, v: Visual, def: VisualDef): HTMLElement {
  const set = (rules: ConditionalRule[]) => ctx.store.change('visual', () => (v.conditional = rules.length ? rules : undefined), v.id);
  const rules = v.conditional ?? [];
  const first = visualMeasures(ctx, v, def)[0]?.[0] ?? '*';
  return h(
    'div.sbd-conditional',
    {},
    h('div.sbd-section-title', {}, 'Conditional formatting'),
    rules.length ? h('div.sbd-hint', {}, 'The first rule that matches a value sets its colour and icon.') : h('div.sbd-hint', {}, 'Colour values and add icons by rules: below a target, above last year, negative, …'),
    ...rules.map((r, i) =>
      ruleCard(
        ctx,
        v,
        def,
        r,
        (next) => set(rules.map((x, j) => (j === i ? next : x))),
        () => set(rules.filter((_, j) => j !== i)),
      ),
    ),
    h('button.sbd-btn.sbd-add-rule', { onclick: () => set([...rules, { apply: first, op: 'lt', value: 0, tone: 'bad', icon: 'down' }]) }, '+ Add rule'),
  );
}
