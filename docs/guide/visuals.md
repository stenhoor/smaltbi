# Visuals

In **Report**, click a field to add a visual, or drag fields onto the canvas and into a visual's wells. A field clicked
with nothing selected starts a visual of its own (a measure makes a KPI card, a column a table); with a visual
selected, it goes into the visual's best free well. The side panel changes the visual's type, fields, format,
filters and SQL.

## Fields and wells

- **Wells:** drop a field where you want it in a well. Drag a field from one well to another to move it; its
  aggregation and label move with it. Alt+↑ and Alt+↓ reorder the focused field, and Delete removes it.
- **Several fields at once:** Ctrl-click (⌘-click on a Mac) or Shift-click to select several fields, then drag them,
  or choose *Add*. With no visual selected, they make one chart: the first category field on the axis and the
  measures as its values.
- **Field search:** press `/` and type to find a field. Use ↓ and ↑ to move through the matches and Enter to add one;
  Space selects it, and Esc clears the search.

## Every visual shows its SQL

Each visual runs one readable query, joined along the model's relationships. The **SQL** tab shows it: copy it, or
replace it with your own (`sql` in the report). Output columns map to the visual's roles by their labels.

## Tables

In *Format*, *Rows per page* adds a pager and *Frozen columns* keeps the first columns in view when a wide table
scrolls sideways. Drag the right edge of a column's header to set its width, which is saved with the table;
double-click the edge to fit the column to its contents again.

## Conditional formatting

Tables, matrices and KPI cards colour measure values and add icons by rules: by value, or by another measure (Revenue
below last year's in red, with a down arrow). The first rule that matches wins. See
[conditional formatting](../reference/visual#conditional) for the rules' fields.

## Repeat for each

Drop a field on a visual's *Repeat for each* well (in Build) to get a copy of it for each of the field's values: a
card per product category, or a chart per region, each titled with its value. New values get their own copy when the
data changes. Choose the number of columns, the most copies to show, and A → Z or Z → A. Give each copy a minimum size
in page grid cells (*Columns wide*, *Rows tall*), and the section a minimum and maximum number of columns and rows;
the minimums win when space is short. When the copies don't fit, they scroll inside the visual, or, with *Expand the
visual*, it grows to show them all, up to *Grow up to* rows tall, and the visuals below move down (in Preview and the
viewer; responsive pages only, since a fixed-size page keeps its size). A click in one copy filters the page by that
value too.

## Maps

The *Map* visual colours regions by a measure, or places points by latitude and longitude. The region shapes are a
GeoJSON or TopoJSON file you add to the report, like a data file, and name in *Format → Shapes file*; public sources
such as Natural Earth have country and state boundaries. Locations match the shapes' `name` property (or their id or
ISO code); *Match locations on property* picks another. Publishing copies the shapes file.

## Visual types

Bar, column, line, area, line-and-column combo, pie, donut, scatter/bubble, KPI card (with comparison and sparkline),
table, matrix, slicer, parameter, text (Markdown with live values), image, waterfall, funnel, treemap, heatmap, map and
gauge. [Visual types](../reference/visual-types) lists each one's wells and options.

Plugins add more: *File → Plugins…* adds a visual plugin by the URL of its file. See [plugins](./plugins).

## What's next

- [Pages](./pages): arrange visuals, add pages, and make the report interactive.
- [Visuals in the report format](../reference/visual).
