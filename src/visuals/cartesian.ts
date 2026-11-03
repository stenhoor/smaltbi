// Bar, column, line, area and combo charts: categories on one axis, values on the other.
// The definitions (roles, options, queries) live here; drawing is done by smaltkit.
import * as kit from 'smaltkit';
import { LABELS_OPTION, LEGEND_OPTION, type VisualDef, chartContext, registerVisual } from './api.js';
import { ICONS } from './icons.js';

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


const bar: VisualDef = {
  type: 'bar',
  label: 'Bar chart',
  group: 'core',
  icon: ICONS.bar!,
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
  icon: ICONS.column!,
  sort: 'category',
  render: (ctx) => kit.columnChart(chartContext(ctx)),
};

const line: VisualDef = {
  type: 'line',
  label: 'Line chart',
  group: 'core',
  icon: ICONS.line!,
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
  icon: ICONS.area!,
  options: [{ ...STACK_OPTION, choices: [['none', 'Overlapping'], ['stacked', 'Stacked'], ['percent', '100% stacked']] }, ...(line.options ?? [])],
  render: (ctx) => kit.areaChart(chartContext(ctx)),
};

const combo: VisualDef = {
  type: 'combo',
  label: 'Line and column',
  group: 'advanced',
  icon: ICONS.combo!,
  roles: [CATEGORY, { name: 'columns', label: 'Column values', kind: 'measure' }, { name: 'lines', label: 'Line values', kind: 'measure' }],
  options: [{ key: 'secondaryAxis', label: 'Secondary axis for lines', type: 'bool', default: true }, STACK_OPTION, LABELS_OPTION, LEGEND_OPTION],
  sort: 'category',
  render: (ctx) => kit.comboChart(chartContext(ctx)),
};

for (const d of [bar, column, line, area, combo]) registerVisual(d);
