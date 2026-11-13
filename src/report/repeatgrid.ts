// The grid of a repeated visual (visual.repeat): how many columns and rows of copies, how many copies are shown, how
// low a row may be, and how tall the grid must be to show them all. Pure, so it is unit-tested; view.ts draws it.
import type { Visual } from '../core/types.js';

/** A copy's minimum height (its title included) when the report sets none, in pixels. */
export const REPEAT_MIN_HEIGHT = 90;
/** Copies about this much wider than tall when the columns are automatic. */
const ASPECT = 1.4;

/** The grid settings in pixels: `repeat` with the copy's minimum size (page grid cells) worked out. */
export interface GridSpec {
  columns?: number;
  minColumns?: number;
  maxColumns?: number;
  minRows?: number;
  maxRows?: number;
  /** A copy's minimum width and height (px). */
  minWidth?: number;
  minHeight?: number;
  expand?: boolean;
}

export interface RepeatGrid {
  cols: number;
  rows: number;
  /** Copies drawn: all of them, or the first cols × maxRows. */
  shown: number;
  /** The least a row of copies may be (px): the copy's minimum height, lowered so `minRows` rows fit in view. */
  rowHeight: number;
  /** The grid's height with every row at the copy's minimum height (px): what Expand grows the visual to. */
  need: number;
}

/** A copy's minimum size in pixels from page grid cells (`repeat.copy`): w columns and h rows, with the gaps between. */
export function copyPx(copy: { w?: number; h?: number } | undefined, colWidth: number, rowHeight: number, gap: number): { minWidth?: number; minHeight?: number } {
  const w = pos(copy?.w);
  const h = pos(copy?.h);
  return {
    minWidth: w ? Math.round(w * colWidth + (w - 1) * gap) : undefined,
    minHeight: h ? Math.round(h * rowHeight + (h - 1) * gap) : undefined,
  };
}

/**
 * Columns: `columns` if set, else automatic (copies about 1.4 times as wide as tall in the space there is, or as many
 * as fit at `minWidth` when the grid expands). A copy is never narrower than `minWidth`, unless `minColumns` needs it
 * to be: the minimum counts win over the copy's size. `maxColumns` caps the columns, last. Rows: as many as the copies
 * need, at most `maxRows`; a row is `minHeight` high, lower when `minRows` rows must fit in `height`.
 */
export function repeatGrid(spec: GridSpec, n: number, width: number, height: number, gap: number): RepeatGrid {
  const minHeight = pos(spec.minHeight) ?? REPEAT_MIN_HEIGHT;
  const minWidth = pos(spec.minWidth);
  const fit = (w: number) => Math.floor((width + gap) / (w + gap));
  let cols: number;
  const fixed = pos(spec.columns);
  if (fixed) cols = Math.round(fixed);
  else if (spec.expand) cols = fit(minWidth ?? Math.round(minHeight * ASPECT));
  else cols = Math.round(Math.sqrt((n * width) / (Math.max(1, height) * ASPECT)));
  if (minWidth) cols = Math.min(cols, fit(minWidth));
  const minCols = pos(spec.minColumns);
  if (minCols) cols = Math.max(cols, Math.round(minCols));
  const maxCols = pos(spec.maxColumns);
  if (maxCols) cols = Math.min(cols, Math.round(maxCols));
  cols = Math.max(1, Math.min(Math.max(1, n), cols));
  let rows = Math.ceil(n / cols);
  const maxRows = pos(spec.maxRows);
  if (maxRows) rows = Math.min(rows, Math.round(maxRows));
  const shown = Math.min(n, rows * cols);
  const minRows = pos(spec.minRows) ? Math.min(Math.round(pos(spec.minRows)!), rows) : 0;
  const rowHeight = minRows > 1 || (minRows === 1 && rows >= 1) ? Math.max(20, Math.min(minHeight, (height - (minRows - 1) * gap) / minRows)) : minHeight;
  return { cols, rows, shown, rowHeight: Math.floor(rowHeight), need: rows * minHeight + Math.max(0, rows - 1) * gap };
}

/** Grid rows (of `row` px, `gap` apart) a frame of `px` pixels spans. */
export function rowsFor(px: number, row: number, gap: number): number {
  return Math.max(1, Math.ceil((px + gap) / (row + gap) - 1e-9));
}

/**
 * Where each visual goes when some grow (Expand): a visual that grows by k rows inserts k rows below its old bottom
 * edge, so everything below moves down and nothing overlaps. Visuals ending on the same line share one insertion (the
 * largest). A visual that spans an insertion stretches with it. Returns each visual's new start row and span.
 */
export function pushDown(items: { id: string; y: number; h: number }[], extra: Map<string, number>): Map<string, { y: number; h: number }> {
  const insert = new Map<number, number>();
  for (const it of items) {
    const k = extra.get(it.id) ?? 0;
    if (k > 0) insert.set(it.y + it.h, Math.max(insert.get(it.y + it.h) ?? 0, k));
  }
  const lines = [...insert.keys()].sort((a, b) => a - b);
  const at = (r: number) => r + lines.filter((b) => b <= r).reduce((s, b) => s + insert.get(b)!, 0);
  const out = new Map<string, { y: number; h: number }>();
  for (const it of items) {
    // The start moves by the insertions above it; the end by those above or on its bottom edge (its own included).
    const y = at(it.y);
    out.set(it.id, { y, h: at(it.y + it.h) - y });
  }
  return out;
}

/** The repeat's grid settings, with the copy's minimum size in pixels for a page of this geometry. */
export function gridSpec(spec: NonNullable<Visual['repeat']>, expand: boolean, colWidth: number, rowHeight: number, gap: number): GridSpec {
  return { columns: spec.columns, minColumns: spec.minColumns, maxColumns: spec.maxColumns, minRows: spec.minRows, maxRows: spec.maxRows, ...copyPx(spec.copy, colWidth, rowHeight, gap), expand };
}

function pos(v: unknown): number | undefined {
  const n = Number(v);
  return v !== undefined && v !== null && v !== '' && Number.isFinite(n) && n > 0 ? n : undefined;
}
