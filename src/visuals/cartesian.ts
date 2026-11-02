// Bar, column, line, area and combo charts: categories on one axis, values on the other.
import type { SqlValue } from '../core/types.js';
import { axisFormatter } from '../core/format.js';
import { LABELS_OPTION, LEGEND_OPTION, type DataColumn, type RenderContext, type VisualDef, legendHtml, registerVisual } from './api.js';
import { band, esc, linear, linePath, r2, textWidth, toNum, truncate } from './svg.js';

type Kind = 'bar' | 'line' | 'area';

interface Series {
  name: string;
  kind: Kind;
  axis: 0 | 1;
  color: number;
  values: number[];
  rows: number[];
  col: DataColumn;
  /** Stack bounds per category. */
  y0?: number[];
  y1?: number[];
}

interface Prepared {
  cats: { value: SqlValue; label: string }[];
  series: Series[];
}

function prepare(ctx: RenderContext, kindFor: (role: string, i: number) => Kind, axisFor: (role: string) => 0 | 1): Prepared {
  const { data } = ctx;
  const cat = data.role('category')[0];
  const ser = data.role('series')[0];
  const measures = data.measures;
  const catIndex = new Map<unknown, number>();
  const cats: Prepared['cats'] = [];
  const catOf = (r: number) => {
    const v = cat ? cat.values[r]! : null;
    const k = typeof v === 'bigint' ? Number(v) : v;
    let i = catIndex.get(k);
    if (i === undefined) {
      i = cats.length;
      catIndex.set(k, i);
      cats.push({ value: v, label: cat ? cat.fmt(v) : '' });
    }
    return i;
  };
  const series: Series[] = [];
  if (ser && measures.length) {
    const m = measures[0]!;
    const sIndex = new Map<unknown, number>();
    for (let r = 0; r < data.rows; r++) {
      const ci = catOf(r);
      const sv = ser.values[r];
      let si = sIndex.get(sv);
      if (si === undefined) {
        si = series.length;
        sIndex.set(sv, si);
        series.push({ name: ser.fmt(sv ?? null), kind: kindFor(m.role, 0), axis: axisFor(m.role), color: si % ctx.palette, values: [], rows: [], col: m });
      }
      series[si]!.values[ci] = toNum(m.values[r]);
      series[si]!.rows[ci] = r;
    }
  } else {
    measures.forEach((m, i) => series.push({ name: m.label, kind: kindFor(m.role, i), axis: axisFor(m.role), color: i % ctx.palette, values: [], rows: [], col: m }));
    for (let r = 0; r < data.rows; r++) {
      const ci = catOf(r);
      measures.forEach((m, i) => {
        series[i]!.values[ci] = toNum(m.values[r]);
        series[i]!.rows[ci] = r;
      });
    }
  }
  for (const s of series) for (let i = 0; i < cats.length; i++) if (s.values[i] === undefined) s.values[i] = NaN;
  return { cats, series };
}

function stackSeries(p: Prepared, mode: string, kinds: Kind[]): void {
  const n = p.cats.length;
  const group = p.series.filter((s) => kinds.includes(s.kind) && s.axis === 0);
  if (mode === 'none' || group.length === 0) return;
  for (let i = 0; i < n; i++) {
    let pos = 0;
    let neg = 0;
    let total = 0;
    for (const s of group) total += Math.abs(s.values[i]! || 0);
    for (const s of group) {
      let v = s.values[i]! || 0;
      if (mode === 'percent') v = total ? v / total : 0;
      (s.y0 ??= [])[i] = v >= 0 ? pos : neg;
      if (v >= 0) pos += v;
      else neg += v;
      (s.y1 ??= [])[i] = v >= 0 ? pos : neg;
    }
  }
}

interface ChartOpts {
  horizontal: boolean;
  stack: string;
  smooth: boolean;
  markers: boolean;
  labels: boolean;
  legend: string;
  secondary: boolean;
}

function render(ctx: RenderContext, p: Prepared, o: ChartOpts): void {
  const { width, height } = ctx;
  const fs = 11;
  const { cats, series } = p;
  if (!cats.length || !series.length) {
    ctx.el.innerHTML = '<div class="sb-empty">No data</div>';
    return;
  }
  stackSeries(p, o.stack, o.horizontal ? ['bar'] : ['bar', 'area']);
  const showLegend = o.legend !== 'none' && (series.length > 1 || o.legend !== 'auto');
  const legend = showLegend ? legendHtml(series.map((s) => s.name), ctx.palette, esc) : '';
  const legendH = showLegend ? 24 : 0;
  const H = Math.max(40, height - legendH);
  const W = Math.max(60, width);

  // Value extents per axis.
  const ext = [
    [Infinity, -Infinity],
    [Infinity, -Infinity],
  ] as [number, number][];
  for (const s of series) {
    const e = ext[s.axis]!;
    for (let i = 0; i < cats.length; i++) {
      const lo = s.y0 ? Math.min(s.y0[i]!, s.y1![i]!) : s.values[i]!;
      const hi = s.y0 ? Math.max(s.y0[i]!, s.y1![i]!) : s.values[i]!;
      if (Number.isFinite(lo)) e[0] = Math.min(e[0], lo);
      if (Number.isFinite(hi)) e[1] = Math.max(e[1], hi);
    }
  }
  for (const e of ext) if (!Number.isFinite(e[0])) [e[0], e[1]] = [0, 1];
  const fmtAxis = o.stack === 'percent' ? axisFormatter('percent') : axisFormatter(series[0]!.col.field.format);
  const fmtAxis2 = axisFormatter(series.find((s) => s.axis === 1)?.col.field.format);
  const hasY2 = series.some((s) => s.axis === 1);

  let svg = '';
  const catLabels = cats.map((c) => c.label);
  if (o.horizontal) {
    // Categories down the left, values along the bottom.
    const left = Math.min(W * 0.4, Math.max(...catLabels.map((l) => textWidth(l, fs))) + 10);
    const top = 4;
    const bottom = 20;
    const count = Math.max(2, Math.floor((W - left) / 90));
    const lastTick = linear(ext[0][0], ext[0][1], 0, 1, { count }).ticks.at(-1) ?? 0;
    const right = Math.max(12 + (o.labels ? 40 : 0), textWidth(fmtAxis(lastTick), fs) / 2 + 4);
    const x = linear(ext[0][0], ext[0][1], left, W - right, { count });
    const y = band(cats.length, top, H - bottom, 0.25);
    for (const t of x.ticks) svg += `<line class="sb-gridline" x1="${r2(x(t))}" x2="${r2(x(t))}" y1="${top}" y2="${H - bottom}"/><text class="sb-tick" x="${r2(x(t))}" y="${H - 6}" text-anchor="middle">${esc(fmtAxis(t))}</text>`;
    const bars = series.filter((s) => s.kind === 'bar');
    const grouped = o.stack === 'none' && bars.length > 1;
    const sub = grouped ? band(bars.length, 0, y.bandwidth, 0.08, 0) : null;
    cats.forEach((c, i) => {
      if (y.step >= fs * 0.9 || i % Math.ceil((fs * 1.1) / y.step) === 0)
        svg += `<text class="sb-tick sb-cat" x="${left - 6}" y="${r2(y(i) + y.bandwidth / 2 + 4)}" text-anchor="end">${esc(truncate(c.label, left - 10, fs))}</text>`;
    });
    bars.forEach((s, si) => {
      for (let i = 0; i < cats.length; i++) {
        const v = s.values[i]!;
        if (!Number.isFinite(v)) continue;
        const a = s.y0 ? s.y0[i]! : 0;
        const b = s.y1 ? s.y1[i]! : v;
        const x0 = x(Math.min(a, b));
        const w = Math.max(1, Math.abs(x(b) - x(a)));
        const yy = y(i) + (sub ? sub(si) : 0);
        const hh = sub ? sub.bandwidth : y.bandwidth;
        svg += `<rect class="sb-mark sb-bar sb-c${s.color}${dim(ctx, s.rows[i])}" data-row="${s.rows[i]}" x="${r2(x0)}" y="${r2(yy)}" width="${r2(w)}" height="${r2(hh)}"/>`;
        if (o.labels && (!s.y0 || si === bars.length - 1)) svg += `<text class="sb-label" x="${r2(x(b) + 4)}" y="${r2(yy + hh / 2 + 4)}">${esc(s.col.fmt(s.y0 ? s.y1![i]! : v))}</text>`;
      }
    });
    svg += `<line class="sb-axis" x1="${r2(x(0))}" x2="${r2(x(0))}" y1="${top}" y2="${H - bottom}"/>`;
  } else {
    const yA = linear(ext[0][0], ext[0][1], 0, 1, { count: Math.max(2, Math.floor(H / 50)) });
    const yB = hasY2 && o.secondary ? linear(ext[1][0], ext[1][1], 0, 1, { count: Math.max(2, Math.floor(H / 50)) }) : null;
    const left = Math.max(...yA.ticks.map((t) => textWidth(fmtAxis(t), fs))) + 12;
    const right = yB ? Math.max(...yB.ticks.map((t) => textWidth(fmtAxis2(t), fs))) + 12 : 10;
    const top = 8;
    const maxLabel = Math.max(...catLabels.map((l) => textWidth(l, fs)));
    const hasBars = series.some((s) => s.kind === 'bar');
    let xb = band(cats.length, left, W - right, hasBars ? 0.25 : 0, hasBars ? 0.125 : 0.5);
    // Very few categories: keep bars from becoming slabs.
    const maxBar = 72 * Math.max(1, series.filter((s) => s.kind === 'bar').length * (o.stack === 'none' ? 0.6 : 0.4));
    if (hasBars && xb.bandwidth > maxBar) {
      const shift = (xb.bandwidth - maxBar) / 2;
      const base = xb;
      const nb = ((i: number) => base(i) + shift) as typeof xb;
      nb.step = base.step;
      nb.bandwidth = maxBar;
      xb = nb;
    }
    const rotate = maxLabel > xb.step * 0.95 && cats.length > 1;
    const bottom = rotate ? Math.min(H * 0.35, Math.min(maxLabel, 90) * 0.7 + 14) : 20;
    const y = linear(yA.domain[0], yA.domain[1], H - bottom, top, { nice: false, zero: false });
    y.ticks = yA.ticks;
    const y2 = yB ? linear(yB.domain[0], yB.domain[1], H - bottom, top, { nice: false, zero: false }) : null;
    if (y2) y2.ticks = yB!.ticks;
    const yOf = (s: Series) => (s.axis === 1 && y2 ? y2 : y);
    for (const t of y.ticks) svg += `<line class="sb-gridline" x1="${left}" x2="${W - right}" y1="${r2(y(t))}" y2="${r2(y(t))}"/><text class="sb-tick" x="${left - 6}" y="${r2(y(t) + 4)}" text-anchor="end">${esc(fmtAxis(t))}</text>`;
    if (y2) for (const t of y2.ticks) svg += `<text class="sb-tick" x="${W - right + 6}" y="${r2(y2(t) + 4)}">${esc(fmtAxis2(t))}</text>`;
    const every = rotate ? Math.max(1, Math.ceil((fs * 1.2) / xb.step)) : Math.max(1, Math.ceil((maxLabel + 8) / xb.step));
    cats.forEach((c, i) => {
      if (i % every) return;
      const cx = xb(i) + xb.bandwidth / 2;
      if (rotate) svg += `<text class="sb-tick sb-cat" transform="translate(${r2(cx + 3)},${r2(H - bottom + 8)}) rotate(-40)" text-anchor="end">${esc(truncate(c.label, 90, fs))}</text>`;
      else svg += `<text class="sb-tick sb-cat" x="${r2(cx)}" y="${H - 6}" text-anchor="middle">${esc(c.label)}</text>`;
    });
    // Bars
    const bars = series.filter((s) => s.kind === 'bar');
    const grouped = o.stack === 'none' && bars.length > 1;
    const sub = grouped ? band(bars.length, 0, xb.bandwidth, 0.08, 0) : null;
    bars.forEach((s, si) => {
      const ys = yOf(s);
      for (let i = 0; i < cats.length; i++) {
        const v = s.values[i]!;
        if (!Number.isFinite(v)) continue;
        const a = s.y0 ? s.y0[i]! : 0;
        const b = s.y1 ? s.y1[i]! : v;
        const y0 = ys(Math.max(a, b));
        const h = Math.max(1, Math.abs(ys(a) - ys(b)));
        const xx = xb(i) + (sub ? sub(si) : 0);
        const ww = sub ? sub.bandwidth : xb.bandwidth;
        svg += `<rect class="sb-mark sb-bar sb-c${s.color}${dim(ctx, s.rows[i])}" data-row="${s.rows[i]}" x="${r2(xx)}" y="${r2(y0)}" width="${r2(ww)}" height="${r2(h)}"/>`;
        if (o.labels && ww > 14 && (!s.y0 || si === bars.length - 1)) svg += `<text class="sb-label" x="${r2(xx + ww / 2)}" y="${r2(y0 - 4)}" text-anchor="middle">${esc(s.col.fmt(s.y0 ? s.y1![i]! : v))}</text>`;
      }
    });
    // Areas and lines
    for (const s of series.filter((x) => x.kind !== 'bar')) {
      const ys = yOf(s);
      const pts: [number, number][] = [];
      const base: [number, number][] = [];
      const segs: [number, number][][] = [];
      for (let i = 0; i < cats.length; i++) {
        const v = s.y1 ? s.y1[i]! : s.values[i]!;
        const cx = xb(i) + xb.bandwidth / 2;
        if (!Number.isFinite(s.values[i]!)) {
          if (pts.length) segs.push(pts.splice(0));
          continue;
        }
        pts.push([cx, ys(v)]);
        base.push([cx, ys(s.y0 ? s.y0[i]! : 0)]);
      }
      if (pts.length) segs.push(pts);
      if (s.kind === 'area') {
        const all = segs.flat();
        if (all.length) svg += `<path class="sb-area sb-c${s.color}" d="${linePath(all, o.smooth)}L${base
          .slice()
          .reverse()
          .map(([a, b]) => `${r2(a)},${r2(b)}`)
          .join('L')}Z"/>`;
      }
      for (const seg of segs) svg += `<path class="sb-line sb-c${s.color}" d="${linePath(seg, o.smooth)}"/>`;
      for (let i = 0; i < cats.length; i++) {
        const v = s.y1 ? s.y1[i]! : s.values[i]!;
        if (!Number.isFinite(s.values[i]!)) continue;
        const cx = r2(xb(i) + xb.bandwidth / 2);
        const cy = r2(ys(v));
        svg += `<circle class="sb-hit sb-mark sb-c${s.color}${dim(ctx, s.rows[i])}${o.markers ? ' sb-marker' : ''}" data-row="${s.rows[i]}" cx="${cx}" cy="${cy}" r="${o.markers ? 3.5 : 6}"/>`;
        if (o.labels) svg += `<text class="sb-label" x="${cx}" y="${r2(cy - 7)}" text-anchor="middle">${esc(s.col.fmt(s.values[i]!))}</text>`;
      }
    }
    if (y.domain[0] < 0) svg += `<line class="sb-axis" x1="${left}" x2="${W - right}" y1="${r2(y(0))}" y2="${r2(y(0))}"/>`;
    svg += `<line class="sb-axis" x1="${left}" x2="${W - right}" y1="${H - bottom}" y2="${H - bottom}"/>`;
  }
  const legendTop = o.legend !== 'bottom';
  ctx.el.innerHTML = `<div class="sb-chart">${legendTop ? legend : ''}<svg class="sb-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${svg}</svg>${legendTop ? '' : legend}</div>`;
}

function dim(ctx: RenderContext, row: number | undefined): string {
  if (row === undefined) return '';
  const s = ctx.selected(row);
  return s === false ? ' sb-dim' : s ? ' sb-on' : '';
}

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

function opts(ctx: RenderContext, horizontal: boolean): ChartOpts {
  const o = ctx.options;
  return {
    horizontal,
    stack: String(o.stack ?? 'none'),
    smooth: !!o.smooth,
    markers: !!o.markers,
    labels: !!o.labels,
    legend: String(o.legend ?? 'auto'),
    secondary: o.secondaryAxis !== false,
  };
}

const bar: VisualDef = {
  type: 'bar',
  label: 'Bar chart',
  group: 'core',
  icon: ico('M3 4h12v4H3zM3 10h17v4H3zM3 16h8v4H3z'),
  roles: [CATEGORY, SERIES, VALUES],
  options: [STACK_OPTION, LABELS_OPTION, LEGEND_OPTION],
  sort: 'value',
  limit: 50,
  render: (ctx) => render(ctx, prepare(ctx, () => 'bar', () => 0), opts(ctx, true)),
};

const column: VisualDef = {
  ...bar,
  type: 'column',
  label: 'Column chart',
  icon: ico('M4 9h4v11H4zM10 4h4v16h-4zM16 13h4v7h-4z'),
  sort: 'category',
  render: (ctx) => render(ctx, prepare(ctx, () => 'bar', () => 0), opts(ctx, false)),
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
  render: (ctx) => render(ctx, prepare(ctx, () => 'line', () => 0), opts(ctx, false)),
};

const area: VisualDef = {
  ...line,
  type: 'area',
  label: 'Area chart',
  icon: ico('M3 20V14l5-5 4 3 6-7 3 3v12z'),
  options: [{ ...STACK_OPTION, choices: [['none', 'Overlapping'], ['stacked', 'Stacked'], ['percent', '100% stacked']] }, ...(line.options ?? [])],
  render: (ctx) => render(ctx, prepare(ctx, () => 'area', () => 0), opts(ctx, false)),
};

const combo: VisualDef = {
  type: 'combo',
  label: 'Line and column',
  group: 'advanced',
  icon: ico('M4 12h3v8H4zM10 8h3v12h-3zM16 14h3v6h-3zM3 9l6-4 5 3 7-5 .8 1.2-7.7 5.5-5-3-5.3 3.5z'),
  roles: [CATEGORY, { name: 'columns', label: 'Column values', kind: 'measure' }, { name: 'lines', label: 'Line values', kind: 'measure' }],
  options: [{ key: 'secondaryAxis', label: 'Secondary axis for lines', type: 'bool', default: true }, STACK_OPTION, LABELS_OPTION, LEGEND_OPTION],
  sort: 'category',
  render: (ctx) =>
    render(
      ctx,
      prepare(
        ctx,
        (role) => (role === 'lines' ? 'line' : 'bar'),
        (role) => (role === 'lines' && ctx.options.secondaryAxis !== false ? 1 : 0),
      ),
      { ...opts(ctx, false), markers: true },
    ),
};

for (const d of [bar, column, line, area, combo]) registerVisual(d);
