// Part-to-whole and single-value visuals: pie, donut, funnel, treemap, waterfall, gauge, KPI card.
// The definitions (roles, options, queries) live here; drawing is done by smaltkit.
import * as kit from 'smaltkit';
import { LABELS_OPTION, LEGEND_OPTION, type VisualDef, chartContext, registerVisual } from './api.js';
import { ICONS } from './icons.js';


// ------------------------------------------------------------------ pie / donut

const pieRoles = [
  { name: 'category', label: 'Legend', kind: 'dimension', drill: true },
  { name: 'values', label: 'Values', kind: 'measure', max: 1 },
] as VisualDef['roles'];

registerVisual({
  type: 'pie',
  label: 'Pie chart',
  group: 'core',
  icon: ICONS.pie!,
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
  icon: ICONS.donut!,
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
  icon: ICONS.funnel!,
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
  icon: ICONS.treemap!,
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
  icon: ICONS.waterfall!,
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
  icon: ICONS.gauge!,
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
  conditional: true,
  label: 'KPI card',
  group: 'core',
  icon: ICONS.card!,
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
