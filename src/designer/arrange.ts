// Arranging visuals on the page grid: align and distribute several, match sizes, find a place for pasted visuals,
// and the guides shown while dragging. Pure functions on grid layouts (cells), so they are unit-tested.
import type { Page, Visual } from '../core/types.js';
import { newId } from './store.js';

export type Layout = Visual['layout'];
export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/** Align layouts to the first one (the primary selection): its left edge, centre, right edge, top, middle or bottom. */
export function align(layouts: Layout[], mode: AlignMode, columns = 12): Layout[] {
  const ref = layouts[0];
  if (!ref) return [];
  return layouts.map((l, i) => {
    if (i === 0) return { ...l };
    const n = { ...l };
    if (mode === 'left') n.x = ref.x;
    else if (mode === 'right') n.x = ref.x + ref.w - l.w;
    else if (mode === 'center') n.x = Math.round(ref.x + (ref.w - l.w) / 2);
    else if (mode === 'top') n.y = ref.y;
    else if (mode === 'bottom') n.y = ref.y + ref.h - l.h;
    else n.y = Math.round(ref.y + (ref.h - l.h) / 2);
    n.x = Math.max(0, Math.min(columns - n.w, n.x));
    n.y = Math.max(0, n.y);
    return n;
  });
}

/**
 * Spread three or more layouts evenly along an axis: the first and last (by position) stay, the others move so the
 * gaps between them are as equal as whole cells allow. Fewer than three come back unchanged.
 */
export function distribute(layouts: Layout[], axis: 'x' | 'y'): Layout[] {
  const out = layouts.map((l) => ({ ...l }));
  if (out.length < 3) return out;
  const size = axis === 'x' ? 'w' : 'h';
  const order = out.map((_, i) => i).sort((a, b) => out[a]![axis] - out[b]![axis] || a - b);
  const first = out[order[0]!]!;
  const last = out[order.at(-1)!]!;
  const span = last[axis] + last[size] - first[axis];
  const total = order.reduce((t, i) => t + out[i]![size], 0);
  const gap = (span - total) / (order.length - 1);
  let pos = first[axis] + first[size];
  for (const i of order.slice(1, -1)) {
    const l = out[i]!;
    l[axis] = Math.max(0, Math.round(pos + gap));
    pos += gap + l[size];
  }
  return out;
}

/** Give every layout the first one's width or height (kept on the page). */
export function sameSize(layouts: Layout[], dim: 'w' | 'h', columns = 12): Layout[] {
  const ref = layouts[0];
  if (!ref) return [];
  return layouts.map((l) => {
    const n = { ...l, [dim]: ref[dim] };
    if (dim === 'w') n.x = Math.max(0, Math.min(columns - n.w, n.x));
    return n;
  });
}

const overlaps = (a: Layout, b: Layout) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * Visuals pasted onto a page: copies with new ids (unique across `takenIds`), keeping their arrangement. They keep
 * their position when it is free; otherwise the group moves below everything on the page.
 */
export function placePasted(page: Page, visuals: Visual[], takenIds: string[], columns = 12): Visual[] {
  const ids = [...takenIds];
  const copies = visuals.map((v) => {
    const c = structuredClone(v);
    c.id = newId('v', ids);
    ids.push(c.id);
    c.layout = { ...c.layout, w: Math.min(columns, Math.max(1, c.layout.w)), h: Math.max(1, c.layout.h) };
    c.layout.x = Math.max(0, Math.min(columns - c.layout.w, c.layout.x));
    return c;
  });
  const clash = copies.some((c) => page.visuals.some((v) => overlaps(c.layout, v.layout)));
  if (clash) {
    const top = Math.min(...copies.map((c) => c.layout.y));
    const bottom = Math.max(0, ...page.visuals.map((v) => v.layout.y + v.layout.h));
    for (const c of copies) c.layout.y = c.layout.y - top + bottom;
  }
  return copies;
}

/**
 * Snap guides for a layout being dragged: the grid lines (in cells) where one of its edges or centre lines meets the
 * same line of another visual.
 */
export function guides(moving: Layout, others: Layout[]): { x: number[]; y: number[] } {
  const xs = new Set<number>();
  const ys = new Set<number>();
  const vx = (l: Layout) => [l.x, l.x + l.w, l.x + l.w / 2];
  const vy = (l: Layout) => [l.y, l.y + l.h, l.y + l.h / 2];
  const mx = vx(moving);
  const my = vy(moving);
  for (const o of others) {
    for (const a of vx(o)) if (mx.includes(a)) xs.add(a);
    for (const a of vy(o)) if (my.includes(a)) ys.add(a);
  }
  return { x: [...xs].sort((a, b) => a - b), y: [...ys].sort((a, b) => a - b) };
}

/** The clipboard text for copied visuals: JSON other reports (and other tabs) can paste. */
export const CLIP_KIND = 'smaltbi/visuals';

export function clipText(visuals: Visual[]): string {
  return JSON.stringify({ kind: CLIP_KIND, version: 1, visuals });
}

/** Visuals from clipboard text, or null when the text is not smaltbi visuals. */
export function parseClip(text: string): Visual[] | null {
  if (!text || text[0] !== '{') return null;
  try {
    const o = JSON.parse(text) as { kind?: string; visuals?: unknown };
    if (o.kind !== CLIP_KIND || !Array.isArray(o.visuals)) return null;
    const ok = o.visuals.every((v) => v && typeof v === 'object' && typeof (v as Visual).type === 'string' && typeof (v as Visual).layout === 'object');
    return ok ? (o.visuals as Visual[]) : null;
  } catch {
    return null;
  }
}
