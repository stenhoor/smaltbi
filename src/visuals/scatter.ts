// Scatter / bubble chart and heatmap.
// The definitions (roles, options, queries) live here; drawing is done by smaltkit.
import * as kit from 'smaltkit';
import { LEGEND_OPTION, chartContext, registerVisual } from './api.js';
import { ICONS } from './icons.js';


registerVisual({
  type: 'scatter',
  label: 'Scatter chart',
  group: 'core',
  icon: ICONS.scatter!,
  roles: [
    { name: 'details', label: 'Values (one point each)', kind: 'dimension' },
    { name: 'legend', label: 'Legend', kind: 'dimension', max: 1 },
    { name: 'x', label: 'X axis', kind: 'measure', max: 1 },
    { name: 'y', label: 'Y axis', kind: 'measure', max: 1 },
    { name: 'size', label: 'Size', kind: 'measure', max: 1 },
  ],
  options: [{ key: 'zero', label: 'Axes start at zero', type: 'bool', default: false }, LEGEND_OPTION],
  limit: 5000,
  render: (ctx) => kit.scatterChart(chartContext(ctx)),
});

registerVisual({
  type: 'heatmap',
  label: 'Heatmap',
  group: 'advanced',
  icon: ICONS.heatmap!,
  roles: [
    { name: 'rows', label: 'Rows', kind: 'dimension', max: 1 },
    { name: 'columns', label: 'Columns', kind: 'dimension', max: 1 },
    { name: 'values', label: 'Value', kind: 'measure', max: 1 },
  ],
  options: [{ key: 'labels', label: 'Show values', type: 'bool', default: true }],
  sort: 'category',
  limit: 5000,
  render: (ctx) => kit.heatmapChart(chartContext(ctx)),
});
