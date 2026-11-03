// Visual-type icons in the smalt-brand Chevron style (BRAND.md, Iconography): solid shapes on a 24 px
// grid, no strokes, edges at 0°, 45° and 90° only, bars at least 3 units thick, and at most one chip
// (a rounded bar, class "k") for the detail that matters. The body takes `fill` from the surrounding
// CSS (currentColor by default); the designer colours the chip with the product colour.

const svg = (body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const r = (x: number, y: number, w: number, h: number) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;
const chip = (x: number, y: number, w: number, h: number) => `<rect class="k" x="${x}" y="${y}" width="${w}" height="${h}" rx="1.1"/>`;
const poly = (pts: string, k = false) => `<path${k ? ' class="k"' : ''} d="M${pts}Z"/>`;

/** An octagon (the Chevron style's circle): left/top edge `a`, right/bottom edge `b`, corner cut `c`. */
const oct = (a: number, b: number, c: number) => `${a + c},${a} ${b - c},${a} ${b},${a + c} ${b},${b - c} ${b - c},${b} ${a + c},${b} ${a},${b - c} ${a},${a + c}`;

export const ICONS: Record<string, string> = {
  bar: svg(r(3, 3, 13, 4) + chip(3, 10, 18, 4) + r(3, 17, 9, 4)),
  column: svg(r(3, 9, 4, 12) + chip(10, 3, 4, 18) + r(17, 13, 4, 8)),
  line: svg(poly('2,15 8,9 12,13 20,5 20,10 12,18 8,14 2,20')),
  area: svg(poly('2,15 8,9 12,13 21,4 21,21 2,21')),
  combo: svg(r(3, 15, 4, 6) + r(10, 14, 4, 7) + r(17, 16, 4, 5) + poly('2,8 6,4 11,9 16,4 21,9 21,12.5 16,7.5 11,12.5 6,7.5 2,11.5', true)),
  pie: svg(poly(oct(3, 21, 5.3)) + poly('12,12 12,3 15.7,3 21,8.3 21,12', true)),
  donut: svg(`<path fill-rule="evenodd" d="M${oct(3, 21, 5.3)}ZM${oct(8, 16, 2.4)}Z"/>` + poly('12,3 15.7,3 21,8.3 21,12 16,12 16,10.4 13.6,8 12,8', true)),
  funnel: svg(r(3, 3, 18, 4) + r(6, 10, 12, 4) + chip(9, 17, 6, 4)),
  treemap: svg(r(3, 3, 10, 18) + r(15, 3, 6, 8) + chip(15, 13, 6, 8)),
  waterfall: svg(r(3, 11, 4, 10) + chip(10, 6, 4, 5) + r(17, 6, 4, 15)),
  gauge: svg(poly('3,19 3,12.3 8.3,7 15.7,7 21,12.3 21,19 17.5,19 17.5,13.8 14.2,10.5 9.8,10.5 6.5,13.8 6.5,19') + poly('10.6,17.6 15.9,12.3 17.3,13.7 12,19', true)),
  card: svg(r(3, 4, 15, 7) + r(3, 14, 9, 3) + chip(3, 19, 18, 2.5)),
  scatter: svg(r(3, 15, 4, 4) + r(8, 9, 4, 4) + r(14, 13, 4, 4) + chip(16, 4, 5, 5)),
  heatmap: svg(
    [3, 9.5, 16]
      .flatMap((y, i) => [3, 9.5, 16].map((x, j) => (i === 0 && j === 2 ? chip(x, y, 5, 5) : r(x, y, 5, 5))))
      .join(''),
  ),
  table: svg(chip(3, 3, 18, 5) + r(3, 10.5, 8, 4) + r(13, 10.5, 8, 4) + r(3, 17, 8, 4) + r(13, 17, 8, 4)),
  matrix: svg(r(9, 3, 12, 4) + r(3, 9, 4, 12) + r(9, 9, 5, 5) + r(16, 9, 5, 5) + r(9, 16, 5, 5) + chip(16, 16, 5, 5)),
  slicer: svg(chip(3, 3, 5, 5) + r(10, 4, 11, 3) + r(3, 10, 5, 5) + r(10, 11, 11, 3) + r(3, 17, 5, 5) + r(10, 18, 11, 3)),
  text: svg(r(3, 3, 16, 4) + r(9, 3, 4, 18) + chip(15, 18, 6, 3)),
  image: svg(`<path fill-rule="evenodd" d="M3,3H21V21H3ZM6,6V18H18V6Z"/>` + poly('6,18 10,14 12,16 15,13 18,16 18,18') + chip(13, 8, 3, 3)),
};

/** Light / dark / automatic colour mode, for the viewer bar and the landing page. */
export const MODE_ICONS: Record<'auto' | 'light' | 'dark', string> = {
  // Half of an octagon ring filled: "follows the system".
  auto: svg(`<path fill-rule="evenodd" d="M${oct(3, 21, 5.3)}ZM${oct(6, 18, 4.1)}Z"/>` + poly('12,3 8.3,3 3,8.3 3,15.7 8.3,21 12,21')),
  // A sun: an octagon and eight rays.
  light: svg(
    poly(oct(7.5, 16.5, 2.7)) +
      [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<rect x="10.5" y="1" width="3" height="4" transform="rotate(${a} 12 12)"/>`).join(''),
  ),
  // A moon: an octagon with an octagon bitten out of its upper right.
  dark: svg(poly('8.3,3 12,3 8,7 8,13.7 10.3,16 17,16 21,12 21,15.7 15.7,21 8.3,21 3,15.7 3,8.3')),
};

/** Column-type badges for the field lists: text for numbers and text, Chevron-style icons for the rest. */
const TYPE_ICONS: Record<string, string> = {
  number: '#',
  text: 'Aa',
  // A calendar: a frame with a header bar and one day picked.
  date: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M3,4H21V21H3ZM6,10V18H18V10Z"/>${chip(13, 12, 4, 4)}</svg>`,
  // A switch: a bar and its knob.
  bool: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M2,7H22V17H2ZM5,10V14H11V10Z"/>${chip(13, 9, 7, 6)}</svg>`,
  any: '·',
};
TYPE_ICONS.datetime = TYPE_ICONS.date!;

/** HTML for a column type's badge. */
export function typeIcon(type: string): string {
  return TYPE_ICONS[type] ?? TYPE_ICONS.any!;
}
