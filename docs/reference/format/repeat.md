---
description: "A visual repeated for each value of a field: the grid of copies, their size, and when they scroll or expand."
---

# Repeat for each

`repeat`, on any visual with data fields: the visual becomes a grid of copies, one per value of
`field` (a dimension), each filtered to its value and titled with it: a card for each product category, a chart for
each region. `columns` sets the grid (else automatic), `max` the number of copies (default 24; a note says how many
more there are), `order` `asc` or `desc`. The grid can be shaped further:

- `copy`: each copy is at least `w` columns and `h` rows of the page grid (the gaps between them included; without
  `h`, 90 px with the copy's title). On a phone, where the page is one column, a cell is measured at the page's own
  width, so copies keep their size and fewer fit across. The copy's width lowers the number of columns, `columns`
  included.
- `minColumns` and `minRows`: at least this many copies across and rows in view. They win over `copy`: the copies
  shrink to fit them (rows down to 20 px).
- `maxColumns` and `maxRows` cap the grid. Copies past `maxColumns × maxRows` are not shown; the note counts them.
  `maxColumns` is applied last.
- `overflow`: when the rows don't fit, `scroll` (the default) scrolls inside the visual; `expand` grows the visual to
  show every row at the copy's height, and the visuals below it move down (those beside it stretch with it).
  `maxHeight` (grid rows) is the most it grows to, the visual's own height included; past that it scrolls. Without
  `columns`, an expanding grid has as many columns as fit at the copy's width (else 1.4 × its height). The visual
  grows in the viewer and the designer's Preview, and on the designer's canvas it scrolls. Expand is for responsive
  pages: a fixed-size page keeps its size, so there the copies scroll, and the designer offers Expand only on
  responsive pages.

The data is one query grouped by the field as well, so a click in a copy selects that value too (the bar *and* its
region). Each copy has its own scale; for one shared scale across charts, use the cartesian charts' `multiples` field.

In the designer: [Visuals, Repeat for each](/guide/visuals#repeat-for-each).
