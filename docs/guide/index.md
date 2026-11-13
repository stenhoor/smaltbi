# Getting started

smaltbi is a report designer and viewer, built as a static web app on [smaltdb](https://smaltdb.dev). Load CSV, JSON or
Parquet files (or open an existing smaltdb database), model them with relationships and SQL measures, drag fields onto
a canvas, and publish the result as a static site. Every report runs entirely in its reader's browser.

## Try it

- <a href="../designer.html?report=examples/sales/report.json" target="_self">The designer</a>, with the sample report
  (a small coffee and tea retailer).
- <a href="../viewer.html?report=examples/sales/report.json" target="_self">The viewer</a>: the same report as a reader
  sees it.
- <a href="../sample/" target="_self">The sample, published</a> as a standalone static site.

## Run it locally

```bash
git clone https://github.com/stenhoor/smaltbi && cd smaltbi
npm install        # also builds the engine (smaltdb, smaltql, plugins) into vendor/smaltdb/
npm run build      # bundles the designer and viewer into dist/
npm run serve      # http://localhost:8080/designer.html
```

`npm run docs:dev` serves this site with live reload.

## Build a report

1. **Data.** Open *Data* and add steps: import or link CSV, TSV, JSON, NDJSON or Parquet from a URL or your computer,
   or run SQL to create views. Steps run in order each time the report opens, and again when a reader clicks
   *Refresh* in the viewer bar, beside the time the data was loaded. To refresh on a timer as well, set *Refresh*
   in the Data dialog to a number of minutes.
2. **Model.** Switch to *Model* for the diagram of your tables. Drag a column onto another table's key to relate them,
   and add measures (`SUM(sales.quantity * sales.unit_price)`) and calculated columns. Measures can use each other:
   `[Revenue] - [Cost]`. The editor completes tables, `table.` columns and `[` measures from the model, underlines
   references that don't exist, and Ctrl+Enter tests the expression. *Add date table* creates a calendar related to a date column, with Year › Quarter › Month ›
   Date to drill, and optionally fiscal years, Sunday weeks and ISO weeks. Then right-click a measure, *Quick
   measure…*, for year to date, same period last year (and the change vs it), previous month or quarter, or rolling
   months: no SQL to write. To use one table two ways, such as one calendar for both order date and ship date, add the second
   relationship and give it a *Role* name in its panel (for example "Ship date"). The table then appears a second time
   under that name in the fields. *Parameters…* in the model view adds what-if values (a growth rate, a target) that
   measures use as `[@Growth]`; a *Parameter* visual on the page lets readers change them with a slider or a
   dropdown, and every visual follows.
3. **Visuals.** Back in *Report*, click a field to add a visual, or drag fields onto the canvas and into a visual's
   wells. The side panel changes its type, format, filters and SQL.
   - **Wells:** drop a field where you want it in a well. Drag a field from one well to another to move it; its
     aggregation and label move with it. Alt+↑ and Alt+↓ reorder the focused field, and Delete removes it.
   - **Several fields at once:** Ctrl-click (⌘-click on a Mac) or Shift-click to select several fields, then drag
     them, or choose *Add*. With no visual selected, they make one chart: the first category field on the axis and
     the measures as its values.
   - **Tables:** in *Format*, *Rows per page* adds a pager and *Frozen columns* keeps the first columns in view when a
     wide table scrolls sideways. Drag the right edge of a column's header to set its width, which is saved with the
     table; double-click the edge to fit the column to its contents again.
   - **Field search:** press `/` and type to find a field. Use ↓ and ↑ to move through the matches and Enter to add
     one; Space selects it, and Esc clears the search.
   - **Repeat for each:** drop a field on a visual's *Repeat for each* well (in Build) to get a copy of it for each
     of the field's values: a card per product category, or a chart per region, each titled with its value. New
     values get their own copy when the data changes. Choose the number of columns, the most copies to show, and
     A → Z or Z → A. Give each copy a minimum size in page grid cells (*Columns wide*, *Rows tall*), and the section
     a minimum and maximum number of columns and rows; the minimums win when space is short. When the copies don't
     fit, they scroll inside the visual, or, with *Expand the visual*, it grows to show them all, up to *Grow up to*
     rows tall, and the visuals below move down (in Preview and the viewer). A click in one copy filters the page by
     that value too.
   - **Maps:** the *Map* visual colours regions by a measure, or places points by latitude and longitude. The region
     shapes are a GeoJSON or TopoJSON file you add to the report, like a data file, and name in *Format → Shapes
     file*; public sources such as Natural Earth have country and state boundaries. Locations match the shapes'
     `name` property (or their id or ISO code); *Match locations on property* picks another. Publishing copies the
     shapes file.
   - **Plugins:** *File → Plugins…* adds a visual plugin by the URL of its file. smaltbi records the file's hash, so a
     changed file no longer loads. Plugin visuals appear at the end of the visual gallery. Writing one:
     [plugins](/PLUGINS).
4. **Pages and interaction.** Add pages, slicers, drill-through targets and bookmarks. *Preview* shows the report as a
   reader sees it.
   - **Arranging visuals:** Shift-click (or Ctrl/⌘-click) visuals to select several, or press Ctrl/⌘+A for all of
     them. The side panel then aligns them (left, centre, right, top, middle, bottom), spreads them evenly, or gives
     them the same width or height, always taking the first one you selected as the reference. Drag any one of them
     to move them all; lines show where edges meet other visuals. The arrow keys move the selection a cell at a time,
     and Shift+arrow resizes the first one.
   - **Copy and paste:** Ctrl/⌘+C copies the selected visuals and Ctrl/⌘+V pastes them on any page, or into another
     report in another tab. Pasted visuals keep their arrangement, and go below the other visuals if their place is
     taken. Fields the other report doesn't have are named in a warning. Ctrl/⌘+X cuts, and Ctrl/⌘+D duplicates.
   - **Phones:** on a phone every page is one column of its visuals in reading order, fixed-size pages too, so a
     report works there without setup. *Phone view* in the top bar shows the page at phone width. In *Format*, under
     *On phones*, a visual can be hidden on phones, given its own height, or moved up and down the column.
   - **Page size:** a page is responsive by default, fitting the window. For a slide or a printed page, click an empty
     part of the canvas and choose a *Page size* in the side panel: 16:9, 4:3, US Letter, A4 (portrait or landscape)
     or a custom size. The page becomes a sheet of that size, with its rows fitted to it. Visuals that reach below it
     are marked, because readers won't see them. Readers see a sheet at 100% and scroll, or click *Fit to window*.

The [report format](/REPORT_FORMAT) describes the file the designer writes, field by field.

## Publish

*Publish* downloads a ZIP of a static site: the viewer, the engine, `report.json` and its data. Unzip it onto GitHub
Pages, Netlify, S3 or any web server; readers' browsers build the data and run the report. In a pipeline:

```bash
node scripts/publish.mjs report.json out/
```

Published reports show the "Powered by smaltbi" badge; turn it off in the Publish dialog (`branding.poweredBy: false`).
