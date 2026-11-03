// Table and matrix (pivot table) visuals: plain HTML tables with sticky headers, totals,
// data bars and heat formatting.
import type { SqlValue } from '../core/types.js';
import { type DataColumn, type RenderContext, type VisualData, registerVisual } from './api.js';
import { esc, seqColor, toNum } from './svg.js';

const ico = (d: string) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;

function rowClass(ctx: RenderContext, row: number): string {
  const s = ctx.selected(row);
  return s === false ? ' sb-dim' : s ? ' sb-on' : '';
}

function extent(col: DataColumn, n: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = toNum(col.values[i]);
    if (Number.isFinite(v)) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  return [lo, hi];
}

function cellStyle(mode: unknown, v: number, [lo, hi]: [number, number]): string {
  if (!Number.isFinite(v)) return '';
  if (mode === 'bars') {
    const p = Math.max(0, Math.min(100, (Math.max(0, v) / (hi > 0 ? hi : 1)) * 100));
    return ` style="--bar:${p.toFixed(1)}%" data-bar`;
  }
  if (mode === 'heat') {
    // Past the middle of the ramp the cell is strong (dark smalt in light mode, pale smalt in dark
    // mode): its text switches to the theme's on-mark colour so it stays readable in both.
    const t = (v - lo) / (hi - lo || 1);
    return ` style="background:${seqColor(t)}${t > 0.55 ? ';color:var(--sb-on-mark,#fff)' : ''}"`;
  }
  return '';
}

const sortState = new WeakMap<HTMLElement, { col: number; dir: 1 | -1 }>();

registerVisual({
  type: 'table',
  label: 'Table',
  group: 'core',
  icon: ico('M3 4h18v16H3zm2 2v3h6V6zm8 0v3h6V6zM5 11v3h6v-3zm8 0v3h6v-3zM5 16v2h6v-2zm8 0v2h6v-2z'),
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
  render(ctx) {
    const { data } = ctx;
    if (!data.columns.length) {
      ctx.el.innerHTML = '<div class="sb-empty">Add columns</div>';
      return;
    }
    const cols = [...data.role('columns'), ...data.role('values')];
    const n = data.rows;
    const order = [...Array(n).keys()];
    const st = sortState.get(ctx.el);
    if (st && cols[st.col]) {
      const c = cols[st.col]!;
      order.sort((a, b) => cmp(c.values[a]!, c.values[b]!) * st.dir);
    }
    const ext = cols.map((c) => (c.field.kind === 'measure' ? extent(c, n) : ([0, 0] as [number, number])));
    let html = `<table class="sb-table sb-density-${esc(ctx.options.density)}"><thead><tr>`;
    cols.forEach((c, i) => {
      const arrow = st?.col === i ? (st.dir === 1 ? ' ▲' : ' ▼') : '';
      html += `<th data-col="${i}" class="${c.field.kind === 'measure' ? 'sb-num' : ''}">${esc(c.label)}${arrow}</th>`;
    });
    html += '</tr></thead><tbody>';
    for (const r of order) {
      html += `<tr class="sb-mark${rowClass(ctx, r)}" data-row="${r}">`;
      cols.forEach((c, i) => {
        const v = c.values[r]!;
        const num = c.field.kind === 'measure';
        html += `<td class="${num ? 'sb-num' : ''}"${num ? cellStyle(ctx.options.format, toNum(v), ext[i]!) : ''}>${esc(c.fmt(v))}</td>`;
      });
      html += '</tr>';
    }
    html += '</tbody>';
    const tot = ctx.extra.totals;
    if (tot && tot.rows) {
      html += '<tfoot><tr>';
      cols.forEach((c, i) => {
        if (c.field.kind !== 'measure') html += `<td>${i === 0 ? 'Total' : ''}</td>`;
        else {
          const t = tot.columns.find((x) => x.field.ref === c.field.ref && x.label === c.label) ?? tot.measures[cols.filter((x) => x.field.kind === 'measure').indexOf(c)];
          html += `<td class="sb-num">${t ? esc(c.fmt(t.values[0]!)) : ''}</td>`;
        }
      });
      html += '</tr></tfoot>';
    }
    html += '</table>';
    if (n >= (ctx.visual.limit ?? 1000)) html += `<div class="sb-note">Showing the first ${n} rows</div>`;
    ctx.el.innerHTML = `<div class="sb-table-wrap">${html}</div>`;
    ctx.el.querySelector('thead')!.addEventListener('click', (e) => {
      const th = (e.target as HTMLElement).closest('th');
      if (!th) return;
      const col = Number(th.dataset.col);
      const cur = sortState.get(ctx.el);
      sortState.set(ctx.el, { col, dir: cur?.col === col ? (-cur.dir as 1 | -1) : cols[col]!.field.kind === 'measure' ? -1 : 1 });
      this.render(ctx);
    });
  },
});

function cmp(a: SqlValue, b: SqlValue): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

// ------------------------------------------------------------------ matrix

function keyOf(cols: DataColumn[], r: number): string {
  return JSON.stringify(cols.map((c) => normalize(c.values[r]!)));
}
function normalize(v: SqlValue): unknown {
  return typeof v === 'bigint' ? Number(v) : v instanceof Uint8Array ? null : v;
}

registerVisual({
  type: 'matrix',
  label: 'Matrix',
  group: 'core',
  icon: ico('M3 4h18v16H3zm2 2v3h4V6zm6 0v3h4V6zm6 0v3h2V6zM5 11v3h4v-3zm6 0v3h4v-3zm6 0v3h2v-3zM5 16v2h4v-2z'),
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
  render(ctx) {
    const { data } = ctx;
    const rows = data.role('rows');
    const cols = data.role('columns');
    const ms = data.role('values');
    if (!rows.length && !cols.length) {
      ctx.el.innerHTML = '<div class="sb-empty">Add rows or columns</div>';
      return;
    }
    const n = data.rows;
    const rowKeys = new Map<string, number>();
    const colKeys = new Map<string, number>();
    const rowFirst: number[] = [];
    const colFirst: number[] = [];
    const cell = new Map<string, number>();
    for (let r = 0; r < n; r++) {
      const rk = keyOf(rows, r);
      const ck = keyOf(cols, r);
      if (!rowKeys.has(rk)) {
        rowKeys.set(rk, rowFirst.length);
        rowFirst.push(r);
      }
      if (!colKeys.has(ck)) {
        colKeys.set(ck, colFirst.length);
        colFirst.push(r);
      }
      cell.set(rowKeys.get(rk) + '|' + colKeys.get(ck), r);
    }
    const ext = ms.map((m) => extent(m, n));
    const lookup = (vd: VisualData | undefined, dimsOf: DataColumn[], r: number) => {
      if (!vd) return null;
      const want = keyOf(dimsOf, r);
      for (let i = 0; i < vd.rows; i++) if (keyOf(vd.dims, i) === want) return i;
      return null;
    };
    const rt = ctx.extra.rowTotals;
    const ct = ctx.extra.colTotals;
    const gt = ctx.extra.grand;
    let html = '<table class="sb-table sb-matrix"><thead>';
    // Header rows: one per column dimension, then measure names.
    const span = Math.max(1, ms.length);
    cols.forEach((c, level) => {
      html += '<tr>' + rows.map(() => '<th></th>').join('');
      for (const r of colFirst) html += `<th colspan="${span}" class="sb-colhead">${esc(c.fmt(c.values[r]!))}</th>`;
      if (rt) html += level === 0 ? `<th colspan="${span}" class="sb-colhead sb-total" rowspan="${cols.length}">Total</th>` : '';
      html += '</tr>';
    });
    html += '<tr>' + rows.map((r) => `<th>${esc(r.label)}</th>`).join('');
    const colCount = Math.max(1, colFirst.length);
    for (let c = 0; c < colCount; c++) for (const m of ms) html += `<th class="sb-num">${esc(m.label)}</th>`;
    if (rt) for (const m of ms) html += `<th class="sb-num sb-total">${esc(m.label)}</th>`;
    html += '</tr></thead><tbody>';
    let prev: string[] = [];
    rowFirst.forEach((fr, ri) => {
      html += '<tr>';
      const labels = rows.map((c) => c.fmt(c.values[fr]!));
      labels.forEach((l, i) => {
        // Repeat a parent label only when it changes (stepped look without collapse).
        const same = labels.slice(0, i + 1).every((x, j) => prev[j] === x);
        html += `<th class="sb-rowhead">${same && i < labels.length - 1 ? '' : esc(l)}</th>`;
      });
      prev = labels;
      for (let c = 0; c < colCount; c++) {
        const r = cell.get(ri + '|' + c);
        ms.forEach((m, mi) => {
          if (r === undefined) html += '<td class="sb-num"></td>';
          else html += `<td class="sb-num sb-mark${rowClass(ctx, r)}" data-row="${r}"${cellStyle(ctx.options.format, toNum(m.values[r]!), ext[mi]!)}>${esc(m.fmt(m.values[r]!))}</td>`;
        });
      }
      if (rt) {
        const i = lookup(rt, rows, fr);
        ms.forEach((m, mi) => (html += `<td class="sb-num sb-total">${i === null ? '' : esc(m.fmt(rt.measures[mi]!.values[i]!))}</td>`));
      }
      html += '</tr>';
    });
    html += '</tbody>';
    if (ct) {
      html += '<tfoot><tr>' + rows.map((_, i) => `<th>${i === 0 ? 'Total' : ''}</th>`).join('');
      for (let c = 0; c < colCount; c++) {
        const i = cols.length ? lookup(ct, cols, colFirst[c]!) : 0;
        ms.forEach((m, mi) => (html += `<td class="sb-num">${i === null || !ct.rows ? '' : esc(m.fmt(ct.measures[mi]!.values[i]!))}</td>`));
      }
      if (rt) ms.forEach((m, mi) => (html += `<td class="sb-num sb-total">${gt?.rows ? esc(m.fmt(gt.measures[mi]!.values[0]!)) : ''}</td>`));
      html += '</tr></tfoot>';
    }
    html += '</table>';
    ctx.el.innerHTML = `<div class="sb-table-wrap">${html}</div>`;
  },
});
