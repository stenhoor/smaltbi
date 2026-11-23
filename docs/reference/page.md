# Page

A page of the report: its visuals, its filters, its grid, and optionally a fixed size, a phone order and drill-through
fields.

```jsonc
{
  "id": "overview", "name": "Overview",
  "hidden": false,
  "drillthrough": ["customers.country"],
  "filters": [ … ],
  "layout": { "rowHeight": 56, "columns": 12, "gap": 12 },
  "size": { "preset": "a4", "landscape": true },
  "phoneOrder": ["k-rev", "c-date"],
  "visuals": [ … ]
}
```

## Fields

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Unique in the report; bookmarks and links name the page by it. |
| `name` | string | The tab's name. |
| `visuals` | array | [Visuals](./visual). |
| `filters` | array | Filters on every visual of the page. [Filters](./filters). |
| `drillthrough` | string[] | Fields that make this page a drill-through target. The viewer's tabs leave a target out: readers reach it by drilling through. |
| `hidden` | boolean | Left out of the viewer's tabs (*Hide in viewer* in the designer's page tab menu). |
| `layout` | object | Overrides the theme's page grid (below). |
| `size` | object | A fixed page (below). Responsive without it. |
| `phoneOrder` | string[] | Visual ids that come first on phones, in that order. |

## layout

| Field | Meaning |
|---|---|
| `columns` | Grid columns. Default 12. |
| `rowHeight` | Row height in pixels. |
| `gap` | The gap between visuals, in pixels. |
| `rows` | Rows of the grid shown in the designer; the page grows when visuals go further. A fixed page's rows fill its height. |
| `width` | Page width in pixels (the canvas scales to fit the window). |
| `fit` | `width`, `page` or `none`. |

## size

Without it a page is responsive: it fills the window and grows with its visuals, and on narrow screens the visuals
stack. With it the page is a fixed sheet that never reflows (ADR 0006):

- `preset` is one of `16:9` (1280 × 720 px), `4:3` (1024 × 768), `letter` (816 × 1056, 8.5 × 11 in) or `a4`
  (794 × 1123), in CSS pixels at 96 per inch, or `custom` with `width` and `height`.
- Paper is portrait unless `landscape` is true. Screens are landscape unless `landscape` is false.
- The page's `layout.rows` (12 by default) fill the sheet's height, so the row height is worked out, not `rowHeight`.
  Visuals below the last row are cut off; the designer marks them.
- Readers see the sheet at 100% and scroll, or choose *Fit to window* in the viewer bar, which scales it down. The
  choice is remembered in their browser.

## On phones

A report narrower than 720px shows every page, fixed-size ones included, as one column (ADR 0007). The visuals come
in reading order (top to bottom, then left to right) at their desktop height. `phoneOrder` lists the ids that come
first, in that order. A visual's `phone.hidden` leaves it out on phones, and `phone.h` sets its height in rows there.

## See also

[Pages in the guide](../guide/pages) · [Visual](./visual) · [Filters](./filters)
