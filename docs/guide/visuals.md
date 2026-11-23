---
description: "Add visuals, fill their wells, select several fields, repeat a visual for each value, maps and plugin visuals."
---

# Visuals

In **Report**, click a field to add a visual, or drag fields onto the canvas and into a visual's wells. The side
panel changes the selected visual's type, its fields (*Build*), its *Format*, its filters and its *SQL*. Every type,
with its fields and options: [Visual types](/reference/visuals/).

## Add a visual

- **One field:** with nothing selected, click a field. A measure makes a card; a column makes a table.
- **Several fields at once:** Ctrl-click (⌘-click on a Mac) or Shift-click to select several fields, then drag them,
  or choose *Add*. With no visual selected, they make one chart: the first category field on the axis and the
  measures as its values.
- **Field search:** press `/` and type to find a field. Use ↓ and ↑ to move through the matches and Enter to add one;
  Space selects it, and Esc clears the search.
- **Change the type:** click a type in the side panel's *Visual type* gallery.

## Wells

Drop a field where you want it in a well. Drag a field from one well to another to move it; its aggregation and label
move with it. Alt+↑ and Alt+↓ reorder the focused field, and Delete removes it.

## Tables

In *Format*, *Rows per page* adds a pager and *Frozen columns* keeps the first columns in view when a wide table
scrolls sideways. Drag the right edge of a column's header to set its width, which is saved with the table;
double-click the edge to fit the column to its contents again.

## Repeat for each

Drop a field on a visual's *Repeat for each* well (in Build) to get a copy of it for each of the field's values: a
card per product category, or a chart per region, each titled with its value. New values get their own copy when the
data changes.

- Choose the number of columns, the most copies to show, and A → Z or Z → A.
- Give each copy a minimum size in page grid cells (*Columns wide*, *Rows tall*), and the section a minimum and
  maximum number of columns and rows. The minimums win when space is short.
- When the copies don't fit, they scroll inside the visual. With *Expand the visual*, it grows to show them all, up
  to *Grow up to* rows tall, and the visuals below move down (in Preview and the viewer; responsive pages only, since
  a fixed-size page keeps its size).
- A click in one copy filters the page by that value too.

## Maps

The *Map* visual colours regions by a measure, or places points by latitude and longitude. The region shapes are a
GeoJSON or TopoJSON file you add to the report, like a data file, and name in *Format → Shapes file*; public sources
such as Natural Earth have country and state boundaries. Locations match the shapes' `name` property (or their id or
ISO code); *Match locations on property* picks another. Publishing copies the shapes file.

## Plugin visuals

*File → Plugins…* adds a visual plugin by the URL of its file. smaltbi records the file's hash, so a changed file no
longer loads. Plugin visuals appear at the end of the visual gallery. Writing one: [Plugins](/PLUGINS).
