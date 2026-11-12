// The phone layout of a page: on narrow screens every page (fixed-size ones too) is a responsive web page, one
// column of its visuals. By default they come in reading order (top to bottom, then left to right) at their desktop
// height; a page can set its own order (page.phoneOrder) and a visual can be hidden or get its own height (v.phone).
import type { Page, Visual } from '../core/types.js';

/** Narrow screens, in CSS px of the report's width: the same breakpoint as the stylesheet's container query. */
export const PHONE_WIDTH = 720;

export interface PhoneSlot {
  /** Position in the column (0 first). */
  order: number;
  /** Height in rows. */
  h: number;
  hidden: boolean;
}

/** Visuals in reading order: by top row, then left column, then their order in the page. */
export function readingOrder(visuals: Visual[]): Visual[] {
  return visuals.map((v, i) => ({ v, i })).sort((a, b) => a.v.layout.y - b.v.layout.y || a.v.layout.x - b.v.layout.x || a.i - b.i).map((x) => x.v);
}

/** The visuals of a page in phone order: the page's own order first (ids that still exist), then the rest. */
export function phoneSequence(page: Page): Visual[] {
  const byId = new Map(page.visuals.map((v) => [v.id, v]));
  const listed = (page.phoneOrder ?? []).map((id) => byId.get(id)).filter((v): v is Visual => !!v);
  const seen = new Set(listed.map((v) => v.id));
  return [...new Set([...listed, ...readingOrder(page.visuals.filter((v) => !seen.has(v.id)))])];
}

/** Each visual's place on phones, by id. */
export function phoneLayout(page: Page): Map<string, PhoneSlot> {
  return new Map(
    phoneSequence(page).map((v, order) => {
      const h = Math.round(Number(v.phone?.h));
      return [v.id, { order, h: h >= 1 && h <= 40 ? h : Math.max(1, v.layout.h), hidden: !!v.phone?.hidden }];
    }),
  );
}

/** A visual moved up or down the phone column: the page's full phone order after the move. */
export function movePhone(page: Page, id: string, by: -1 | 1): string[] {
  const ids = phoneSequence(page).map((v) => v.id);
  const i = ids.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  return ids;
}
