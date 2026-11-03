// Scatter / bubble chart and heatmap.
// The definitions (roles, options, queries) live here; drawing is done by smaltkit.
import * as kit from 'smaltkit';
import { LEGEND_OPTION, chartContext, registerVisual } from './api.js';

const ico = (d: string) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;

registerVisual({
  type: 'scatter',
  label: 'Scatter chart',
  group: 'core',
  icon: ico('M5 17a2 2 0 1 0 0 .1zM9 11a2.5 2.5 0 1 0 0 .1zM15 14a1.6 1.6 0 1 0 0 .1zM17 6a3 3 0 1 0 0 .1zM3 3h1.5v16.5H21V21H3z'),
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
  icon: ico('M3 3h5v5H3zM9.5 3h5v5h-5zM16 3h5v5h-5zM3 9.5h5v5H3zM9.5 9.5h5v5h-5zM16 9.5h5v5h-5zM3 16h5v5H3zM9.5 16h5v5h-5zM16 16h5v5h-5z'),
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
