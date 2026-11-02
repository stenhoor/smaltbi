// Part-to-whole and single-value visuals: pie, donut, funnel, treemap, waterfall, gauge, KPI card.
import { LABELS_OPTION, LEGEND_OPTION, type RenderContext, type VisualDef, legendHtml, registerVisual } from './api.js';
import { arc, band, esc, linear, r2, textWidth, toNum, truncate } from './svg.js';
import { axisFormatter } from '../core/format.js';

const ico = (d: string) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;

function dim(ctx: RenderContext, row: number): string {
  const s = ctx.selected(row);
  return s === false ? ' sb-dim' : s ? ' sb-on' : '';
}

function empty(ctx: RenderContext, msg = 'No data'): boolean {
  if (ctx.data.rows > 0 && ctx.data.measures.length) return false;
  ctx.el.innerHTML = `<div class="sb-empty">${esc(msg)}</div>`;
  return true;
}

// ------------------------------------------------------------------ pie / donut

function renderPie(ctx: RenderContext, donut: boolean): void {
  if (empty(ctx)) return;
  const cat = ctx.data.role('category')[0];
  const m = ctx.data.measures[0]!;
  const n = ctx.data.rows;
  const vals = Array.from({ length: n }, (_, i) => Math.max(0, toNum(m.values[i])));
  const total = vals.reduce((a, b) => a + (b || 0), 0) || 1;
  const names = Array.from({ length: n }, (_, i) => (cat ? cat.fmt(cat.values[i]!) : m.label));
  const legendPos = String(ctx.options.legend ?? 'auto');
  const showLegend = legendPos !== 'none';
  const side = showLegend && (legendPos === 'right' || (legendPos === 'auto' && ctx.width > ctx.height * 1.4));
  const legendW = side ? Math.min(ctx.width * 0.4, Math.max(...names.map((s) => textWidth(s, 11))) + 30) : 0;
  const legendH = showLegend && !side ? 26 : 0;
  const W = Math.max(20, ctx.width - legendW);
  const H = Math.max(20, ctx.height - legendH);
  const R = Math.max(10, Math.min(W, H) / 2 - (ctx.options.labels ? 22 : 6));
  const r0 = donut ? R * Number(ctx.options.hole ?? 0.6) : 0;
  const cx = W / 2;
  const cy = H / 2;
  let a = 0;
  let svg = '';
  vals.forEach((v, i) => {
    const da = (v / total) * Math.PI * 2;
    if (da <= 0) return;
    svg += `<path class="sb-mark sb-slice sb-c${i % ctx.palette}${dim(ctx, i)}" data-row="${i}" d="${arc(cx, cy, r0, R, a, a + da)}"/>`;
    if (ctx.options.labels && da > 0.25) {
      const mid = a + da / 2;
      const lr = donut ? (r0 + R) / 2 : R * 0.65;
      svg += `<text class="sb-label sb-on-mark" x="${r2(cx + lr * Math.sin(mid))}" y="${r2(cy - lr * Math.cos(mid) + 4)}" text-anchor="middle">${esc(Math.round((v / total) * 100) + '%')}</text>`;
    }
    a += da;
  });
  if (donut && ctx.options.center !== false) {
    svg += `<text class="sb-donut-total" x="${cx}" y="${r2(cy + 2)}" text-anchor="middle">${esc(axisFormatter(m.field.format)(total))}</text><text class="sb-donut-caption" x="${cx}" y="${r2(cy + 18)}" text-anchor="middle">${esc(truncate(m.label, r0 * 1.6, 11))}</text>`;
  }
  const legend = showLegend ? legendHtml(names, ctx.palette, esc) : '';
  ctx.el.innerHTML = `<div class="sb-chart ${side ? 'sb-legend-right' : ''}">${side ? '' : legend}<svg class="sb-svg" width="${W}" height="${H}">${svg}</svg>${side ? legend : ''}</div>`;
}

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
  render: (ctx) => renderPie(ctx, false),
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
  render: (ctx) => renderPie(ctx, true),
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
  render(ctx) {
    if (empty(ctx)) return;
    const cat = ctx.data.role('category')[0];
    const m = ctx.data.measures[0]!;
    const n = ctx.data.rows;
    const vals = Array.from({ length: n }, (_, i) => Math.max(0, toNum(m.values[i]) || 0));
    const max = Math.max(...vals) || 1;
    const first = vals[0] || 1;
    const labelW = Math.min(ctx.width * 0.3, Math.max(...Array.from({ length: n }, (_, i) => textWidth(cat ? cat.fmt(cat.values[i]!) : '', 11))) + 12);
    const W = ctx.width - labelW;
    const y = band(n, 0, ctx.height, 0.15);
    let svg = '';
    vals.forEach((v, i) => {
      const w = Math.max(2, (v / max) * (W - 8));
      const x = labelW + (W - w) / 2;
      svg += `<rect class="sb-mark sb-bar sb-c0${dim(ctx, i)}" data-row="${i}" x="${r2(x)}" y="${r2(y(i))}" width="${r2(w)}" height="${r2(y.bandwidth)}"/>`;
      const txt = m.fmt(v) + (ctx.options.percent !== false && i > 0 ? `  ·  ${Math.round((v / first) * 100)}%` : '');
      svg += `<text class="sb-label sb-on-mark" x="${r2(labelW + W / 2)}" y="${r2(y(i) + y.bandwidth / 2 + 4)}" text-anchor="middle">${esc(txt)}</text>`;
      if (cat) svg += `<text class="sb-tick sb-cat" x="${labelW - 8}" y="${r2(y(i) + y.bandwidth / 2 + 4)}" text-anchor="end">${esc(truncate(cat.fmt(cat.values[i]!), labelW - 10, 11))}</text>`;
    });
    ctx.el.innerHTML = `<svg class="sb-svg" width="${ctx.width}" height="${ctx.height}">${svg}</svg>`;
  },
});

// ------------------------------------------------------------------ treemap

interface Node {
  i: number;
  v: number;
}
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Squarified treemap layout (Bruls, Huizing, van Wijk). */
export function squarify(nodes: Node[], rect: Rect): (Rect & { i: number })[] {
  const out: (Rect & { i: number })[] = [];
  const total = nodes.reduce((a, n) => a + n.v, 0);
  if (!total) return out;
  const scale = (rect.w * rect.h) / total;
  const items = nodes.map((n) => ({ i: n.i, a: n.v * scale })).filter((n) => n.a > 0);
  let { x, y, w, h } = rect;
  let row: { i: number; a: number }[] = [];
  const worst = (r: { a: number }[], side: number) => {
    const s = r.reduce((acc, n) => acc + n.a, 0);
    let mx = 0;
    for (const n of r) mx = Math.max(mx, Math.max((side * side * n.a) / (s * s), (s * s) / (side * side * n.a)));
    return mx;
  };
  const flush = () => {
    const s = row.reduce((acc, n) => acc + n.a, 0);
    if (w >= h) {
      const cw = s / h;
      let yy = y;
      for (const n of row) {
        const ch = n.a / cw;
        out.push({ i: n.i, x, y: yy, w: cw, h: ch });
        yy += ch;
      }
      x += cw;
      w -= cw;
    } else {
      const ch = s / w;
      let xx = x;
      for (const n of row) {
        const cw = n.a / ch;
        out.push({ i: n.i, x: xx, y, w: cw, h: ch });
        xx += cw;
      }
      y += ch;
      h -= ch;
    }
    row = [];
  };
  for (const it of items) {
    const side = Math.min(w, h);
    if (row.length && worst([...row, it], side) > worst(row, side)) flush();
    row.push(it);
  }
  if (row.length) flush();
  return out;
}

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
  render(ctx) {
    if (empty(ctx)) return;
    const cat = ctx.data.role('category')[0];
    const m = ctx.data.measures[0]!;
    const nodes: Node[] = [];
    for (let i = 0; i < ctx.data.rows; i++) nodes.push({ i, v: Math.max(0, toNum(m.values[i]) || 0) });
    nodes.sort((a, b) => b.v - a.v);
    const rects = squarify(nodes, { x: 0, y: 0, w: ctx.width, h: ctx.height });
    let svg = '';
    for (const r of rects) {
      svg += `<rect class="sb-mark sb-tile sb-c${r.i % ctx.palette}${dim(ctx, r.i)}" data-row="${r.i}" x="${r2(r.x + 1)}" y="${r2(r.y + 1)}" width="${r2(Math.max(0, r.w - 2))}" height="${r2(Math.max(0, r.h - 2))}"/>`;
      if (r.w > 40 && r.h > 22) {
        const name = cat ? cat.fmt(cat.values[r.i]!) : m.label;
        svg += `<text class="sb-label sb-on-mark" x="${r2(r.x + 7)}" y="${r2(r.y + 17)}">${esc(truncate(name, r.w - 12, 11))}</text>`;
        if (r.h > 38 && ctx.options.labels !== false) svg += `<text class="sb-label sb-on-mark sb-sub" x="${r2(r.x + 7)}" y="${r2(r.y + 32)}">${esc(truncate(m.fmt(m.values[r.i]!), r.w - 12, 11))}</text>`;
      }
    }
    ctx.el.innerHTML = `<svg class="sb-svg" width="${ctx.width}" height="${ctx.height}">${svg}</svg>`;
  },
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
  render(ctx) {
    if (empty(ctx)) return;
    const cat = ctx.data.role('category')[0];
    const m = ctx.data.measures[0]!;
    const n = ctx.data.rows;
    const steps: { label: string; a: number; b: number; row: number; kind: 'up' | 'down' | 'total' }[] = [];
    let run = 0;
    for (let i = 0; i < n; i++) {
      const v = toNum(m.values[i]) || 0;
      steps.push({ label: cat ? cat.fmt(cat.values[i]!) : String(i + 1), a: run, b: run + v, row: i, kind: v >= 0 ? 'up' : 'down' });
      run += v;
    }
    if (ctx.options.total !== false) steps.push({ label: 'Total', a: 0, b: run, row: -1, kind: 'total' });
    const lo = Math.min(0, ...steps.map((s) => Math.min(s.a, s.b)));
    const hi = Math.max(0, ...steps.map((s) => Math.max(s.a, s.b)));
    const fmt = axisFormatter(m.field.format);
    const yt = linear(lo, hi, 0, 1, { count: Math.max(2, Math.floor(ctx.height / 50)) });
    const left = Math.max(...yt.ticks.map((t) => textWidth(fmt(t), 11))) + 12;
    const bottom = 20;
    const y = linear(yt.domain[0], yt.domain[1], ctx.height - bottom, 8, { nice: false, zero: false });
    const x = band(steps.length, left, ctx.width - 8, 0.3);
    let svg = '';
    for (const t of yt.ticks) svg += `<line class="sb-gridline" x1="${left}" x2="${ctx.width - 8}" y1="${r2(y(t))}" y2="${r2(y(t))}"/><text class="sb-tick" x="${left - 6}" y="${r2(y(t) + 4)}" text-anchor="end">${esc(fmt(t))}</text>`;
    const every = Math.max(1, Math.ceil(60 / x.step));
    steps.forEach((s, i) => {
      const top = y(Math.max(s.a, s.b));
      const h = Math.max(1, Math.abs(y(s.a) - y(s.b)));
      const cls = s.kind === 'up' ? 'sb-pos' : s.kind === 'down' ? 'sb-neg' : 'sb-c0';
      svg += `<rect class="sb-mark sb-bar ${cls}${s.row >= 0 ? dim(ctx, s.row) : ''}" ${s.row >= 0 ? `data-row="${s.row}"` : ''} x="${r2(x(i))}" y="${r2(top)}" width="${r2(x.bandwidth)}" height="${r2(h)}"/>`;
      if (i < steps.length - 1 && s.kind !== 'total') svg += `<line class="sb-connector" x1="${r2(x(i) + x.bandwidth)}" x2="${r2(x(i + 1))}" y1="${r2(y(s.b))}" y2="${r2(y(s.b))}"/>`;
      if (ctx.options.labels) svg += `<text class="sb-label" x="${r2(x(i) + x.bandwidth / 2)}" y="${r2(top - 4)}" text-anchor="middle">${esc(m.fmt(s.kind === 'total' ? s.b : s.b - s.a))}</text>`;
      if (i % every === 0) svg += `<text class="sb-tick sb-cat" x="${r2(x(i) + x.bandwidth / 2)}" y="${ctx.height - 6}" text-anchor="middle">${esc(truncate(s.label, x.step * every - 4, 11))}</text>`;
    });
    svg += `<line class="sb-axis" x1="${left}" x2="${ctx.width - 8}" y1="${r2(y(0))}" y2="${r2(y(0))}"/>`;
    ctx.el.innerHTML = `<svg class="sb-svg" width="${ctx.width}" height="${ctx.height}">${svg}</svg>`;
  },
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
  render(ctx) {
    const v = ctx.data.role('values')[0];
    if (!v || !ctx.data.rows) {
      ctx.el.innerHTML = '<div class="sb-empty">Add a value</div>';
      return;
    }
    const val = toNum(v.values[0]) || 0;
    const tgtCol = ctx.data.role('target')[0];
    const tgt = tgtCol ? toNum(tgtCol.values[0]) : NaN;
    const maxCol = ctx.data.role('max')[0];
    const max = (maxCol ? toNum(maxCol.values[0]) : Number(ctx.options.maxValue)) || Math.max(val, Number.isFinite(tgt) ? tgt : 0) * 1.25 || 1;
    const W = ctx.width;
    const H = ctx.height;
    const R = Math.max(20, Math.min(W / 2 - 8, H - 34));
    const cx = W / 2;
    const cy = 8 + R;
    const th = R * 0.22;
    const ang = (x: number) => -Math.PI / 2 + Math.max(0, Math.min(1, x / max)) * Math.PI;
    let svg = `<path class="sb-gauge-track" d="${arc(cx, cy, R - th, R, -Math.PI / 2, Math.PI / 2)}"/>`;
    svg += `<path class="sb-mark sb-c0" data-row="0" d="${arc(cx, cy, R - th, R, -Math.PI / 2, ang(val))}"/>`;
    if (Number.isFinite(tgt)) {
      const a = ang(tgt);
      svg += `<line class="sb-gauge-target" x1="${r2(cx + (R - th - 4) * Math.sin(a))}" y1="${r2(cy - (R - th - 4) * Math.cos(a))}" x2="${r2(cx + (R + 4) * Math.sin(a))}" y2="${r2(cy - (R + 4) * Math.cos(a))}"/>`;
    }
    svg += `<text class="sb-gauge-value" x="${cx}" y="${r2(cy - 4)}" text-anchor="middle">${esc(v.fmt(val))}</text>`;
    svg += `<text class="sb-tick" x="${r2(cx - R + th / 2)}" y="${r2(cy + 16)}" text-anchor="middle">0</text><text class="sb-tick" x="${r2(cx + R - th / 2)}" y="${r2(cy + 16)}" text-anchor="middle">${esc(axisFormatter(v.field.format)(max))}</text>`;
    if (Number.isFinite(tgt)) svg += `<text class="sb-tick" x="${cx}" y="${r2(cy + 18)}" text-anchor="middle">Target ${esc(v.fmt(tgt))}</text>`;
    ctx.el.innerHTML = `<svg class="sb-svg" width="${W}" height="${H}">${svg}</svg>`;
  },
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
  render(ctx) {
    const v = ctx.data.role('values')[0];
    if (!v) {
      ctx.el.innerHTML = '<div class="sb-empty">Add a value</div>';
      return;
    }
    const val = ctx.data.rows ? v.values[0]! : null;
    const t = ctx.data.role('target')[0];
    let cmp = '';
    if (t && ctx.data.rows && ctx.options.compare !== 'none') {
      const a = toNum(val);
      const b = toNum(t.values[0]);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        const up = a >= b;
        const good = ctx.options.goodWhen === 'down' ? !up : up;
        const txt = ctx.options.compare === 'value' ? `${t.label}: ${t.fmt(b)}` : b ? `${up ? '▲' : '▼'} ${Math.abs(((a - b) / Math.abs(b)) * 100).toFixed(1)}% vs ${t.label}` : '';
        cmp = `<div class="sb-kpi-cmp ${good ? 'sb-good' : 'sb-bad'}">${esc(txt)}</div>`;
      }
    }
    let spark = '';
    const tr = ctx.extra.trend;
    if (tr && tr.rows > 1) {
      const m = tr.measures[0]!;
      const all = Array.from({ length: tr.rows }, (_, i) => toNum(m.values[i]));
      const idx = [...all.keys()].filter((i) => Number.isFinite(all[i]!));
      const lo = Math.min(...idx.map((i) => all[i]!));
      const hi = Math.max(...idx.map((i) => all[i]!));
      const w = Math.max(40, ctx.width);
      const h = Math.max(16, Math.min(48, ctx.height * 0.3));
      const xOf = (i: number) => r2((i / (all.length - 1)) * w);
      const pts = idx.map((i) => `${xOf(i)},${r2(h - 2 - ((all[i]! - lo) / (hi - lo || 1)) * (h - 4))}`);
      if (pts.length > 1)
        spark = `<svg class="sb-spark" width="${w}" height="${h}" preserveAspectRatio="none"><path class="sb-area sb-c0" d="M${xOf(idx[0]!)},${h}L${pts.join('L')}L${xOf(idx[idx.length - 1]!)},${h}Z"/><path class="sb-line sb-c0" d="M${pts.join('L')}"/></svg>`;
    }
    const caption = String(ctx.options.caption || v.label);
    ctx.el.innerHTML = `<div class="sb-kpi"><div class="sb-kpi-value">${esc(v.fmt(val))}</div><div class="sb-kpi-caption">${esc(caption)}</div>${cmp}${spark}</div>`;
  },
});
