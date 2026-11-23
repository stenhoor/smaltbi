# Pages

Add pages with **+** at the end of the page tabs. Slicers, drill-through pages and bookmarks make the report
interactive. **▶ Preview** shows the report as a reader sees it.

## Arranging visuals

Shift-click (or Ctrl/⌘-click) visuals to select several, or press Ctrl/⌘+A for all of them. The side panel then
aligns them (left, centre, right, top, middle, bottom), spreads them evenly, or gives them the same width or height,
always taking the first one you selected as the reference. Drag any one of them to move them all; lines show where
edges meet other visuals. The arrow keys move the selection a cell at a time, and Shift+arrow resizes the first one.

## Copy and paste

Ctrl/⌘+C copies the selected visuals and Ctrl/⌘+V pastes them on any page, or into another report in another tab.
Pasted visuals keep their arrangement, and go below the other visuals if their place is taken. Fields the other report
doesn't have are named in a warning. Ctrl/⌘+X cuts, and Ctrl/⌘+D duplicates.

## Page size

A page is responsive by default, fitting the window. For a slide or a printed page, click an empty part of the canvas
and choose a *Page size* in the side panel: 16:9, 4:3, US Letter, A4 (portrait or landscape) or a custom size. The page
becomes a sheet of that size, with its rows fitted to it. Visuals that reach below it are marked, because readers
won't see them. Readers see a sheet at 100% and scroll, or click *Fit to window*.

## Phones

On a phone every page is one column of its visuals in reading order, fixed-size pages too, so a report works there
without setup. *Phone view* in the top bar shows the page at phone width. In *Format*, under *On phones*, a visual can
be hidden on phones, given its own height, or moved up and down the column.

## Drill-through

Click an empty part of the canvas, and drop a field on the page's *Drill-through fields* (such as
`customers.country`): the page becomes a drill-through target, marked ↳ in the page tabs. A reader right-clicks a value
of that field in another visual to open the page filtered to it.

## Bookmarks

A bookmark is a saved view of the report: its page, selections, slicer values and drill levels. Readers open them from
**☆ Bookmarks** in the viewer bar. The designer has no button for them yet: they are written in the report file, under
[`bookmarks`](../reference/view-state).

## What's next

- [Reading a report](./reading): what readers can do with it.
- [Pages in the report format](../reference/page).
