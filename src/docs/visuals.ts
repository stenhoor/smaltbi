// The visual types' reference pages (docs/reference/visuals/), generated from the visual registry so they can't drift
// from the code: each visual's fields (roles) and Format options, as report.json writes them. BRAND.md, Documentation,
// rule 3 (one entry per page, one shape). `npm run docs:visuals` writes them; test/docs.test.ts fails when they are
// out of date.
import { type VisualDef, visualDefs } from '../visuals/index.js';

const GROUPS: [VisualDef['group'], string][] = [
  ['core', 'Charts and tables'],
  ['advanced', 'More visuals'],
];

/** What each visual is for, in a line: the reference page's summary. Every built-in visual has one (the test checks). */
export const SUMMARIES: Record<string, string> = {
  bar: 'Horizontal bars: compare a measure across the values of a field.',
  column: 'Vertical columns: compare a measure across the values of a field, or over time.',
  line: 'Lines: a measure over time or another ordered field.',
  area: 'Filled lines: a measure over time, with series stacked or overlapping.',
  combo: 'Columns and lines on one axis: two kinds of measure over the same field.',
  pie: 'A circle in slices: each value of a field as a share of the whole.',
  donut: 'A ring in slices, with the total in its centre: each value of a field as a share of the whole.',
  funnel: 'Stages narrowing from top to bottom: a measure across ordered steps.',
  treemap: 'Nested rectangles sized by a measure: parts of a whole, by one or more levels.',
  waterfall: 'Steps up and down to a total: how changes add up.',
  gauge: 'A dial: one measure against a target or range.',
  card: 'One number, large: a measure, with a comparison, a trend or a target.',
  scatter: 'Points by two measures: how they relate, for each value of a field.',
  heatmap: 'A grid of coloured cells: a measure by two fields.',
  table: 'Rows and columns: fields and measures, with totals, paging and conditional formatting.',
  matrix: 'A pivot table: a measure by row and column fields, with subtotals and drill-down.',
  slicer: 'A filter readers click: a list, dropdown, buttons, a range or a search box.',
  text: 'Formatted text (Markdown), with measures inside it.',
  image: 'An image from a URL.',
  map: 'Regions coloured by a measure, or points by latitude and longitude.',
  parameter: 'A control for a what-if parameter: a slider or a dropdown that every measure using it follows.',
};

const md = (s: string) => s.replace(/\|/g, '\\|');

function defaultText(v: unknown): string {
  if (v === undefined || v === '') return '';
  if (typeof v === 'string' && v.includes('\n')) return '(text)';
  return '`' + md(JSON.stringify(v)) + '`';
}

/** One visual's reference page. */
export function visualPage(def: VisualDef): string {
  const lines: string[] = [];
  const summary = SUMMARIES[def.type] ?? `The ${def.label} visual.`;
  lines.push('---', `description: ${JSON.stringify(summary)}`, '---', '', `# ${def.label}`, '', summary, '');
  lines.push(`In \`report.json\`: \`"type": "${def.type}"\`.${def.group === 'plugin' ? ' From a plugin.' : ''}`, '');
  lines.push('## Fields', '');
  if (!def.roles.length) lines.push(def.static ? 'None: it shows what its options say.' : 'None.', '');
  else {
    lines.push('Wells in the designer\'s Build tab; `fields` in `report.json`, by role.', '', '| Role | Well | Takes | At most |', '|---|---|---|---|');
    for (const r of def.roles) lines.push(`| \`${r.name}\` | ${md(r.label)} | ${r.kind === 'measure' ? 'measures (a column is aggregated)' : 'fields to group by'}${r.drill ? ', a drill path' : ''} | ${r.max ?? 'any'} |`);
    lines.push('');
  }
  lines.push('## Options', '');
  const opts = def.options ?? [];
  if (!opts.length) lines.push('None.', '');
  else {
    lines.push('In the Format tab; `options` in `report.json`.', '', '| Option | Label | Values | Default |', '|---|---|---|---|');
    for (const o of opts) {
      const values = o.type === 'select' ? (o.choices ?? []).map(([v, l]) => `\`${md(JSON.stringify(v))}\` (${md(l)})`).join(', ') : { bool: '`true`, `false`', number: 'a number', text: 'text', textarea: 'text (several lines)', color: 'a colour' }[o.type];
      const when = o.when ? ` Shown when \`${o.when.key}\` is \`${md(JSON.stringify(o.when.equals))}\`.` : '';
      lines.push(`| \`${o.key}\` | ${md(o.label)}${when} | ${values} | ${defaultText(o.default)} |`);
    }
    lines.push('');
  }
  const also: string[] = [];
  if (def.conditional) also.push('[conditional formatting](/reference/format/conditional)');
  if (def.refLines) also.push('[reference lines](/reference/format/axes)');
  if (def.slicer) also.push('[filters](/reference/format/filters)');
  lines.push('## See also', '', `- [Visuals](/guide/visuals)${also.length ? ', ' + also.join(', ') : ''}`, '- [All visual types](./)', '');
  return lines.join('\n');
}

/** The index of the visual types, by group. */
export function visualsIndex(defs: VisualDef[]): string {
  const lines = ['---', 'description: "Every built-in visual type: its fields and options, as report.json writes them."', '---', '', '# Visual types', ''];
  lines.push('Every built-in visual, with the fields it takes (its roles) and its Format options. A visual in `report.json`:', '');
  lines.push('```jsonc', '{ "id": "v1", "type": "column", "layout": { "x": 0, "y": 0, "w": 6, "h": 4 },', '  "fields": { "category": ["products.category"], "values": ["sales.Revenue"] },', '  "options": { "labels": true } }', '```', '');
  for (const [group, title] of GROUPS) {
    const ds = defs.filter((d) => d.group === group);
    if (!ds.length) continue;
    lines.push(`## ${title}`, '', '| Type | Visual | What it shows |', '|---|---|---|');
    for (const d of ds) lines.push(`| [\`${d.type}\`](./${d.type}) | ${md(d.label)} | ${md(SUMMARIES[d.type] ?? '')} |`);
    lines.push('');
  }
  lines.push('Plugins add visual types of their own: see [Plugins](/PLUGINS).', '');
  return lines.join('\n');
}

/** Every generated file, by path under docs/reference/visuals/. */
export function visualDocs(): Map<string, string> {
  const defs = visualDefs().filter((d) => d.group !== 'plugin');
  const out = new Map<string, string>([['index.md', visualsIndex(defs)]]);
  for (const d of defs) out.set(`${d.type}.md`, visualPage(d));
  return out;
}

/** The sidebar's items for the visual types, in the index's order. */
export function visualSidebar(): { text: string; link: string }[] {
  const defs = visualDefs().filter((d) => d.group !== 'plugin');
  return GROUPS.flatMap(([g]) => defs.filter((d) => d.group === g)).map((d) => ({ text: d.label, link: `/reference/visuals/${d.type}` }));
}
