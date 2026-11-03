// Part-to-whole and single-value visuals: pie, donut, funnel, treemap, waterfall, gauge, KPI card.
// The definitions (roles, options, queries) live here; drawing is done by smaltkit.
import * as kit from 'smaltkit';
import { LABELS_OPTION, LEGEND_OPTION, type VisualDef, chartContext, registerVisual } from './api.js';

const ico = (d: string) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;

// ------------------------------------------------------------------ pie / donut

const pieRoles = [
  { name: 'category', label: 'Legend', kind: 'dimension', drill: true },
  { name: 'values', label: 'Values', kind: 'measure', max: 1 },
] as VisualDef['roles'];

registerVisual({
  type: 'pie',
  label: 'Pie chart',
  group: 'core',
  icon: ico('M11 3a9 9 0 1 0 9 10h-9zM13 2v9h9a9 9 0 0 0-9-9z'),
  roles: pieRoles,
  options: [LABELS_OPTION, LEGEND_OPTION],
  sort: 'value',
  limit: 12,
  render: (ctx) => kit.pieChart(chartContext(ctx)),
});

registerVisual({
  type: 'donut',
  label: 'Donut chart',
  group: 'core',
  icon: ico('M12 3a9 9 0 1 0 9 9h-4a5 5 0 1 1-5-5zM14 3v4.3A5 5 0 0 1 16.7 10H21a9 9 0 0 0-7-7z'),
  roles: pieRoles,
  options: [{ key: 'center', label: 'Total in center', type: 'bool', default: true }, LABELS_OPTION, LEGEND_OPTION],
  sort: 'value',
  limit: 12,
  render: (ctx) => kit.donutChart(chartContext(ctx)),
});

// ------------------------------------------------------------------ funnel

registerVisual({
  type: 'funnel',
  label: 'Funnel',
  group: 'advanced',
  icon: ico('M3 4h18v3H3zM6 9h12v3H6zM8 14h8v3H8zM10 19h4v2h-4z'),
  roles: [
    { name: 'category', label: 'Stage', kind: 'dimension', max: 1 },
    { name: 'values', label: 'Value', kind: 'measure', max: 1 },
  ],
  options: [{ key: 'percent', label: 'Show % of first', type: 'bool', default: true }],
  sort: 'value',
  render: (ctx) => kit.funnelChart(chartContext(ctx)),
});

// ------------------------------------------------------------------ treemap

registerVisual({
  type: 'treemap',
  label: 'Treemap',
  group: 'advanced',
  icon: ico('M3 3h10v11H3zM14 3h7v6h-7zM14 10h7v11h-7zM3 15h10v6H3z'),
  roles: [
    { name: 'category', label: 'Category', kind: 'dimension', drill: true },
    { name: 'values', label: 'Values', kind: 'measure', max: 1 },
  ],
  options: [LABELS_OPTION],
  sort: 'value',
  limit: 100,
  render: (ctx) => kit.treemapChart(chartContext(ctx)),
});

// ------------------------------------------------------------------ waterfall

registerVisual({
  type: 'waterfall',
  label: 'Waterfall',
  group: 'advanced',
  icon: ico('M3 12h3v8H3zM7 8h3v4H7zM11 5h3v3h-3zM15 5h3v9h-3zM19 5h2v15h-2z'),
  roles: [
    { name: 'category', label: 'Category', kind: 'dimension', max: 1 },
    { name: 'values', label: 'Change', kind: 'measure', max: 1 },
  ],
  options: [{ key: 'total', label: 'Show total', type: 'bool', default: true }, LABELS_OPTION],
  sort: 'category',
  render: (ctx) => kit.waterfallChart(chartContext(ctx)),
});

// ------------------------------------------------------------------ gauge

registerVisual({
  type: 'gauge',
  label: 'Gauge',
  group: 'advanced',
  icon: ico('M12 5a9 9 0 0 0-9 9h3a6 6 0 0 1 12 0h3a9 9 0 0 0-9-9zM11 14l5-6 1 1-5 6z'),
  roles: [
    { name: 'values', label: 'Value', kind: 'measure', max: 1 },
    { name: 'target', label: 'Target', kind: 'measure', max: 1 },
    { name: 'max', label: 'Maximum', kind: 'measure', max: 1 },
  ],
  options: [{ key: 'maxValue', label: 'Maximum (when no field)', type: 'number' }],
  render: (ctx) => kit.gaugeChart(chartContext(ctx)),
});

// ------------------------------------------------------------------ KPI card

registerVisual({
  type: 'card',
  label: 'KPI card',
  group: 'core',
  icon: ico('M3 5h18v14H3zM6 9h7v2H6zM6 13h12v3H6z'),
  roles: [
    { name: 'values', label: 'Value', kind: 'measure', max: 1 },
    { name: 'target', label: 'Compare to', kind: 'measure', max: 1 },
    { name: 'trend', label: 'Trend axis', kind: 'dimension', max: 1 },
  ],
  options: [
    { key: 'compare', label: 'Comparison', type: 'select', choices: [['delta', 'Change %'], ['value', 'Value'], ['none', 'None']], default: 'delta' },
    { key: 'goodWhen', label: 'Good when', type: 'select', choices: [['up', 'Higher'], ['down', 'Lower']], default: 'up' },
    { key: 'caption', label: 'Caption', type: 'text' },
  ],
  plan(ctx) {
    const values = ctx.pick('values', 'target');
    const main = { dims: [], measures: values };
    const trend = ctx.fields.trend ?? [];
    const v = ctx.fields.values?.[0];
    if (!trend.length || !v) return { main };
    return { main, extra: { trend: { dims: trend, measures: [v] } } };
  },
  render: (ctx) => kit.kpiCard(chartContext(ctx)),
});
