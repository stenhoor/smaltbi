// Bar, column, line, area and combo charts: categories on one axis, values on the other.
// The definitions (roles, options, queries) live here; drawing is done by smaltkit.
import * as kit from 'smaltkit';
import { LABELS_OPTION, LEGEND_OPTION, type VisualDef, chartContext, registerVisual } from './api.js';

const CATEGORY = { name: 'category', label: 'Axis', kind: 'dimension', drill: true } as const;
const SERIES = { name: 'series', label: 'Legend', kind: 'dimension', max: 1 } as const;
const VALUES = { name: 'values', label: 'Values', kind: 'measure' } as const;

const STACK_OPTION = {
  key: 'stack',
  label: 'Stacking',
  type: 'select' as const,
  choices: [
    ['none', 'Side by side'],
    ['stacked', 'Stacked'],
    ['percent', '100% stacked'],
  ] as [string, string][],
  default: 'none',
};

const ico = (d: string) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;

const bar: VisualDef = {
  type: 'bar',
  label: 'Bar chart',
  group: 'core',
  icon: ico('M3 4h12v4H3zM3 10h17v4H3zM3 16h8v4H3z'),
  roles: [CATEGORY, SERIES, VALUES],
  options: [STACK_OPTION, LABELS_OPTION, LEGEND_OPTION],
  sort: 'value',
  limit: 50,
  render: (ctx) => kit.barChart(chartContext(ctx)),
};

const column: VisualDef = {
  ...bar,
  type: 'column',
  label: 'Column chart',
  icon: ico('M4 9h4v11H4zM10 4h4v16h-4zM16 13h4v7h-4z'),
  sort: 'category',
  render: (ctx) => kit.columnChart(chartContext(ctx)),
};

const line: VisualDef = {
  type: 'line',
  label: 'Line chart',
  group: 'core',
  icon: ico('M3 17l5-6 4 3 6-8 3 2-1.6 1.2-1.6-1L12.4 17 8.4 14 4.6 18.4z'),
  roles: [CATEGORY, SERIES, VALUES],
  options: [
    { key: 'smooth', label: 'Smooth lines', type: 'bool', default: false },
    { key: 'markers', label: 'Markers', type: 'bool', default: false },
    LABELS_OPTION,
    LEGEND_OPTION,
  ],
  sort: 'category',
  render: (ctx) => kit.lineChart(chartContext(ctx)),
};

const area: VisualDef = {
  ...line,
  type: 'area',
  label: 'Area chart',
  icon: ico('M3 20V14l5-5 4 3 6-7 3 3v12z'),
  options: [{ ...STACK_OPTION, choices: [['none', 'Overlapping'], ['stacked', 'Stacked'], ['percent', '100% stacked']] }, ...(line.options ?? [])],
  render: (ctx) => kit.areaChart(chartContext(ctx)),
};

const combo: VisualDef = {
  type: 'combo',
  label: 'Line and column',
  group: 'advanced',
  icon: ico('M4 12h3v8H4zM10 8h3v12h-3zM16 14h3v6h-3zM3 9l6-4 5 3 7-5 .8 1.2-7.7 5.5-5-3-5.3 3.5z'),
  roles: [CATEGORY, { name: 'columns', label: 'Column values', kind: 'measure' }, { name: 'lines', label: 'Line values', kind: 'measure' }],
  options: [{ key: 'secondaryAxis', label: 'Secondary axis for lines', type: 'bool', default: true }, STACK_OPTION, LABELS_OPTION, LEGEND_OPTION],
  sort: 'category',
  render: (ctx) => kit.comboChart(chartContext(ctx)),
};

for (const d of [bar, column, line, area, combo]) registerVisual(d);
