---
description: "A report's pages: drill-through, filters, the page grid, fixed page sizes and phones."
---

# Pages

```jsonc
{
  "id": "overview", "name": "Overview",
  "hidden": false,
  "drillthrough": ["customers.country"],       // makes this a drill-through target
  "filters": [ … ],
  "layout": { "rowHeight": 56, "columns": 12, "gap": 12 },   // overrides the theme's page grid
  "size": { "preset": "a4", "landscape": true },             // optional: a fixed page (below); responsive without it
  "phoneOrder": ["k-rev", "c-date"],                         // optional: phone column order (the rest follow)
  "visuals": [ … ]                                           // see Visuals
}
```

## Page size

`size` is optional ([ADR 0006](/adr/0006-outside-code-smaltdf-pages-calendar)). Without it a page is responsive: it fills the window and grows with its
visuals, and on narrow screens the visuals stack. With it the page is a fixed sheet that never reflows:

- `preset` is one of `16:9` (1280 × 720 px), `4:3` (1024 × 768), `letter` (816 × 1056, 8.5 × 11 in) or `a4`
  (794 × 1123), in CSS pixels at 96 per inch, or `custom` with `width` and `height`.
- Paper is portrait unless `landscape` is true. Screens are landscape unless `landscape` is false.
- The page's `layout.rows` (12 by default) fill the sheet's height, so the row height is worked out, not
  `rowHeight`. Visuals below the last row are cut off; the designer marks them.
- Readers see the sheet at 100% and scroll, or choose *Fit to window* in the viewer bar, which scales it down. The
  choice is remembered in their browser.

## On phones

[ADR 0007](/adr/0007-phones-responsive): a report narrower than 720px shows every page, fixed-size ones included, as one column.
The visuals come in reading order (top to bottom, then left to right) at their desktop height. `phoneOrder` lists
the ids that come first, in that order. A visual's `phone.hidden` leaves it out on phones, and `phone.h` sets its
height in rows there.

The visuals on a page: [Visuals](./visuals). In the designer: [Pages and interaction](/guide/pages).
