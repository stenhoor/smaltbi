// Scatter / bubble chart and heatmap.
import { axisFormatter } from '../core/format.js';
import { LEGEND_OPTION, type RenderContext, legendHtml, registerVisual } from './api.js';
import { band, esc, linear, r2, seqColor, textWidth, toNum, truncate } from './svg.js';

const ico = (d: string) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;

function dim(ctx: RenderContext, row: number): string {
  const s = ctx.selected(row);
  return s === false ? ' sb-dim' : s ? ' sb-on' : '';
}

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
  render(ctx) {
    const xc = ctx.data.role('x')[0];
    const yc = ctx.data.role('y')[0];
    if (!xc || !yc || !ctx.data.rows) {
      ctx.el.innerHTML = `<div class="sb-empty">${xc && yc ? 'No data' : 'Add X and Y values'}</div>`;
      return;
    }
    const sc = ctx.data.role('size')[0];
    const lc = ctx.data.role('legend')[0];
    const n = ctx.data.rows;
    const xs = Array.from({ length: n }, (_, i) => toNum(xc.values[i]));
    const ys = Array.from({ length: n }, (_, i) => toNum(yc.values[i]));
    const ss = sc ? Array.from({ length: n }, (_, i) => Math.max(0, toNum(sc.values[i]) || 0)) : null;
    const smax = ss ? Math.max(...ss) || 1 : 1;
    const groups = new Map<unknown, number>();
    const names: string[] = [];
    const color = (i: number) => {
      if (!lc) return 0;
      const v = lc.values[i];
      let g = groups.get(v);
      if (g === undefined) {
        g = groups.size;
        groups.set(v, g);
        names.push(lc.fmt(v ?? null));
      }
      return g % ctx.palette;
    };
    const colors = Array.from({ length: n }, (_, i) => color(i));
    const showLegend = lc && ctx.options.legend !== 'none';
    const legendH = showLegend ? 24 : 0;
    const W = ctx.width;
    const H = ctx.height - legendH;
    const fx = axisFormatter(xc.field.format);
    const fy = axisFormatter(yc.field.format);
    const fin = (a: number[]) => a.filter(Number.isFinite);
    const zero = !!ctx.options.zero;
    const ytmp = linear(Math.min(...fin(ys)), Math.max(...fin(ys)), 0, 1, { zero, count: Math.max(2, Math.floor(H / 50)) });
    const left = Math.max(...ytmp.ticks.map((t) => textWidth(fy(t), 11))) + 12;
    const bottom = 34;
    const x = linear(Math.min(...fin(xs)), Math.max(...fin(xs)), left + 6, W - 10, { zero, count: Math.max(2, Math.floor(W / 90)) });
    const y = linear(ytmp.domain[0], ytmp.domain[1], H - bottom, 8, { nice: false, zero: false });
    let svg = '';
    for (const t of ytmp.ticks) svg += `<line class="sb-gridline" x1="${left}" x2="${W - 10}" y1="${r2(y(t))}" y2="${r2(y(t))}"/><text class="sb-tick" x="${left - 6}" y="${r2(y(t) + 4)}" text-anchor="end">${esc(fy(t))}</text>`;
    for (const t of x.ticks) svg += `<line class="sb-gridline" y1="8" y2="${H - bottom}" x1="${r2(x(t))}" x2="${r2(x(t))}"/><text class="sb-tick" y="${H - bottom + 15}" x="${r2(x(t))}" text-anchor="middle">${esc(fx(t))}</text>`;
    svg += `<text class="sb-axis-title" x="${r2((left + W) / 2)}" y="${H - 4}" text-anchor="middle">${esc(xc.label)}</text>`;
    const maxR = Math.max(6, Math.min(W, H) / 14);
    const order = ss ? [...xs.keys()].sort((a, b) => ss[b]! - ss[a]!) : [...xs.keys()];
    for (const i of order) {
      if (!Number.isFinite(xs[i]!) || !Number.isFinite(ys[i]!)) continue;
      const r = ss ? 3 + Math.sqrt(ss[i]! / smax) * maxR : 4.5;
      svg += `<circle class="sb-mark sb-dot sb-c${colors[i]}${dim(ctx, i)}" data-row="${i}" cx="${r2(x(xs[i]!))}" cy="${r2(y(ys[i]!))}" r="${r2(r)}"/>`;
    }
    const legend = showLegend ? legendHtml(names, ctx.palette, esc) : '';
    ctx.el.innerHTML = `<div class="sb-chart">${legend}<svg class="sb-svg" width="${W}" height="${H}">${svg}</svg></div>`;
  },
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
  render(ctx) {
    const rc = ctx.data.role('rows')[0];
    const cc = ctx.data.role('columns')[0];
    const m = ctx.data.measures[0];
    if (!rc || !cc || !m || !ctx.data.rows) {
      ctx.el.innerHTML = `<div class="sb-empty">${rc && cc && m ? 'No data' : 'Add rows, columns and a value'}</div>`;
      return;
    }
    const rIdx = new Map<unknown, number>();
    const cIdx = new Map<unknown, number>();
    const rl: string[] = [];
    const cl: string[] = [];
    const cells: { r: number; c: number; v: number; row: number }[] = [];
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < ctx.data.rows; i++) {
      const rv = rc.values[i];
      const cv = cc.values[i];
      if (!rIdx.has(rv)) {
        rIdx.set(rv, rl.length);
        rl.push(rc.fmt(rv ?? null));
      }
      if (!cIdx.has(cv)) {
        cIdx.set(cv, cl.length);
        cl.push(cc.fmt(cv ?? null));
      }
      const v = toNum(m.values[i]);
      if (Number.isFinite(v)) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      cells.push({ r: rIdx.get(rv)!, c: cIdx.get(cv)!, v, row: i });
    }
    const left = Math.min(ctx.width * 0.3, Math.max(...rl.map((s) => textWidth(s, 11))) + 10);
    const top = 20;
    const x = band(cl.length, left, ctx.width, 0.06, 0);
    const y = band(rl.length, top, ctx.height, 0.06, 0);
    let svg = '';
    cl.forEach((l, i) => {
      if (x.step > 18) svg += `<text class="sb-tick" x="${r2(x(i) + x.bandwidth / 2)}" y="13" text-anchor="middle">${esc(truncate(l, x.step - 2, 11))}</text>`;
    });
    rl.forEach((l, i) => {
      if (y.step > 9) svg += `<text class="sb-tick" x="${left - 6}" y="${r2(y(i) + y.bandwidth / 2 + 4)}" text-anchor="end">${esc(truncate(l, left - 8, 11))}</text>`;
    });
    for (const c of cells) {
      const t = (c.v - lo) / (hi - lo || 1);
      svg += `<rect class="sb-mark sb-cell${dim(ctx, c.row)}" data-row="${c.row}" x="${r2(x(c.c))}" y="${r2(y(c.r))}" width="${r2(x.bandwidth)}" height="${r2(y.bandwidth)}" style="fill:${Number.isFinite(c.v) ? seqColor(t) : 'transparent'}"/>`;
      if (ctx.options.labels !== false && x.bandwidth > 34 && y.bandwidth > 14)
        svg += `<text class="sb-label ${t > 0.55 ? 'sb-on-mark' : ''}" x="${r2(x(c.c) + x.bandwidth / 2)}" y="${r2(y(c.r) + y.bandwidth / 2 + 4)}" text-anchor="middle">${esc(truncate(m.fmt(c.v), x.bandwidth - 4, 11))}</text>`;
    }
    ctx.el.innerHTML = `<svg class="sb-svg" width="${ctx.width}" height="${ctx.height}">${svg}</svg>`;
  },
});
