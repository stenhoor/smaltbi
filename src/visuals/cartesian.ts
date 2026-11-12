// Bar, column, line, area and combo charts: categories on one axis, values on the other.
// The definitions (roles, options, queries) live here; drawing is done by smaltkit.
import * as kit from 'smaltkit';
import { LABELS_OPTION, LEGEND_OPTION, type OptionDef, type VisualDef, chartContext, registerVisual } from './api.js';
import { ICONS } from './icons.js';

const CATEGORY = { name: 'category', label: 'Axis', kind: 'dimension', drill: true } as const;
const SERIES = { name: 'series', label: 'Legend', kind: 'dimension', max: 1 } as const;
const VALUES = { name: 'values', label: 'Values', kind: 'measure' } as const;
/** Small multiples: a panel per value of the field, all on one scale. */
const MULTIPLES = { name: 'multiples', label: 'Small multiples', kind: 'dimension', max: 1 } as const;

/** The value axis (and, for vertical charts, the category axis): scale, fixed ends, titles. */
function axisOptions(vertical: boolean, secondary = false): OptionDef[] {
  return [
    ...(vertical
      ? [
          {
            key: 'xAxis',
            label: 'X axis',
            type: 'select',
            choices: [
              ['category', 'Categories'],
              ['continuous', 'Continuous (dates, numbers)'],
            ],
            default: 'category',
            section: 'Axes',
          } as OptionDef,
        ]
      : []),
    {
      key: 'yScale',
      label: vertical ? 'Y axis scale' : 'Value axis scale',
      type: 'select',
      choices: [
        ['linear', 'Linear'],
        ['log', 'Logarithmic'],
      ],
      default: 'linear',
      ...(vertical ? {} : { section: 'Axes' }),
    },
    { key: 'yMin', label: vertical ? 'Y axis minimum' : 'Value axis minimum', type: 'number' },
    { key: 'yMax', label: vertical ? 'Y axis maximum' : 'Value axis maximum', type: 'number' },
    { key: 'xTitle', label: vertical ? 'X axis title' : 'Value axis title', type: 'text' },
    { key: 'yTitle', label: vertical ? 'Y axis title' : 'Category axis title', type: 'text' },
    ...(secondary ? [{ key: 'y2Title', label: 'Secondary axis title', type: 'text', when: { key: 'secondaryAxis', equals: true } } as OptionDef] : []),
  ];
}

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
  roles: [CATEGORY, SERIES, VALUES, MULTIPLES],
  options: [STACK_OPTION, LABELS_OPTION, LEGEND_OPTION, ...axisOptions(false)],
  refLines: true,
  sort: 'value',
  limit: 50,
  render: (ctx) => kit.barChart(chartContext(ctx)),
};

const column: VisualDef = {
  ...bar,
  type: 'column',
  label: 'Column chart',
  icon: ICONS.column!,
  options: [STACK_OPTION, LABELS_OPTION, LEGEND_OPTION, ...axisOptions(true)],
  sort: 'category',
  render: (ctx) => kit.columnChart(chartContext(ctx)),
};

const line: VisualDef = {
  type: 'line',
  label: 'Line chart',
  group: 'core',
  icon: ICONS.line!,
  roles: [CATEGORY, SERIES, VALUES, MULTIPLES],
  options: [
    { key: 'smooth', label: 'Smooth lines', type: 'bool', default: false },
    { key: 'markers', label: 'Markers', type: 'bool', default: false },
    LABELS_OPTION,
    LEGEND_OPTION,
    ...axisOptions(true),
  ],
  refLines: true,
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
  roles: [CATEGORY, { name: 'columns', label: 'Column values', kind: 'measure' }, { name: 'lines', label: 'Line values', kind: 'measure' }, MULTIPLES],
  options: [{ key: 'secondaryAxis', label: 'Secondary axis for lines', type: 'bool', default: true }, STACK_OPTION, LABELS_OPTION, LEGEND_OPTION, ...axisOptions(true, true)],
  refLines: true,
  sort: 'category',
  render: (ctx) => kit.comboChart(chartContext(ctx)),
};

for (const d of [bar, column, line, area, combo]) registerVisual(d);
