// Table and matrix (pivot table) visuals: plain HTML tables with sticky headers, totals,
// data bars and heat formatting.
// The definitions (roles, options, queries) live here; drawing is done by smaltkit.
import * as kit from 'smaltkit';
import { chartContext, registerVisual } from './api.js';
import { ICONS } from './icons.js';


registerVisual({
  type: 'table',
  conditional: true,
  label: 'Table',
  group: 'core',
  icon: ICONS.table!,
  roles: [
    { name: 'columns', label: 'Columns', kind: 'dimension' },
    { name: 'values', label: 'Values', kind: 'measure' },
  ],
  options: [
    { key: 'totals', label: 'Totals row', type: 'bool', default: true },
    { key: 'format', label: 'Value formatting', type: 'select', choices: [['none', 'None'], ['bars', 'Data bars'], ['heat', 'Heat colors']], default: 'none' },
    { key: 'density', label: 'Density', type: 'select', choices: [['normal', 'Normal'], ['compact', 'Compact'], ['relaxed', 'Relaxed']], default: 'normal' },
  ],
  sort: 'value',
  limit: 1000,
  plan(ctx) {
    const p = ctx.defaultPlan();
    const v = ctx.visual;
    const measures = ctx.pick('values');
    if (v.options?.totals !== false && measures.length && ctx.pick('columns').length) p.extra = { totals: { dims: [], measures } };
    return p;
  },
  render: (ctx) => kit.tableView(chartContext(ctx)),
});

// ------------------------------------------------------------------ matrix

registerVisual({
  type: 'matrix',
  conditional: true,
  label: 'Matrix',
  group: 'core',
  icon: ICONS.matrix!,
  roles: [
    { name: 'rows', label: 'Rows', kind: 'dimension' },
    { name: 'columns', label: 'Columns', kind: 'dimension', max: 2 },
    { name: 'values', label: 'Values', kind: 'measure' },
  ],
  options: [
    { key: 'rowTotals', label: 'Row totals', type: 'bool', default: true },
    { key: 'colTotals', label: 'Column totals', type: 'bool', default: true },
    { key: 'format', label: 'Value formatting', type: 'select', choices: [['none', 'None'], ['heat', 'Heat colors'], ['bars', 'Data bars']], default: 'none' },
  ],
  sort: 'category',
  limit: 20000,
  plan(ctx) {
    const rows = ctx.pick('rows');
    const cols = ctx.pick('columns');
    const measures = ctx.pick('values');
    const main = { dims: [...rows, ...cols], measures };
    const extra: Record<string, typeof main> = {};
    if (measures.length) {
      // Totals are separate queries: measures are not always additive (averages, distinct counts, ratios).
      if (cols.length && ctx.visual.options?.rowTotals !== false) extra.rowTotals = { dims: rows, measures };
      if (rows.length && ctx.visual.options?.colTotals !== false) extra.colTotals = { dims: cols, measures };
      if (rows.length && cols.length && ctx.visual.options?.rowTotals !== false && ctx.visual.options?.colTotals !== false) extra.grand = { dims: [], measures };
      if (!cols.length && rows.length && ctx.visual.options?.colTotals !== false) extra.colTotals = { dims: [], measures };
    }
    return { main, extra };
  },
  render: (ctx) => kit.matrixView(chartContext(ctx)),
});
