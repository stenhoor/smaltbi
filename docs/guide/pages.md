---
description: "Pages, filtering between visuals, arranging, copy and paste, phones and fixed page sizes."
---

# Pages and interaction

A report has pages, shown as tabs. Double-click a tab to rename it. **Preview** shows the report as a reader sees it,
and **Edit** goes back.

## Filtering

Click a bar, a slice or a row: the other visuals on the page filter to it; click it again to clear. Slicers are
visuals readers click to filter: a list, a dropdown, buttons, a range or a search box. Pages can also be drill-through
targets, and bookmarks save a view of the report. In `report.json`: [filters](/REPORT_FORMAT#filters) and
[bookmarks](/REPORT_FORMAT#bookmarks-and-view-state).

## Arranging visuals

- Shift-click (or Ctrl/⌘-click) visuals to select several, or press Ctrl/⌘+A for all of them.
- The side panel then aligns them (left, centre, right, top, middle, bottom), spreads them evenly, or gives them the
  same width or height, always taking the first one you selected as the reference.
- Drag any one of them to move them all; lines show where edges meet other visuals.
- The arrow keys move the selection a cell at a time, and Shift+arrow resizes the first one.

## Copy and paste

Ctrl/⌘+C copies the selected visuals and Ctrl/⌘+V pastes them on any page, or into another report in another tab.
Pasted visuals keep their arrangement, and go below the other visuals if their place is taken. Fields the other
report doesn't have are named in a warning. Ctrl/⌘+X cuts, and Ctrl/⌘+D duplicates.

## Phones

On a phone every page is one column of its visuals in reading order, fixed-size pages too, so a report works there
without setup. *Phone view* in the top bar shows the page at phone width. In *Format*, under *On phones*, a visual
can be hidden on phones, given its own height, or moved up and down the column.

## Page size

A page is responsive by default, fitting the window. For a slide or a printed page, click an empty part of the canvas
and choose a *Page size* in the side panel: 16:9, 4:3, US Letter, A4 (portrait or landscape) or a custom size.

- The page becomes a sheet of that size, with its rows fitted to it.
- Visuals that reach below it are marked, because readers won't see them.
- Readers see a sheet at 100% and scroll, or click *Fit to window*.
