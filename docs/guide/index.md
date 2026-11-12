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
   or run SQL to create views. Steps run in order each time the report opens.
2. **Model.** Switch to *Model* for the diagram of your tables. Drag a column onto another table's key to relate them,
   and add measures (`SUM(sales.quantity * sales.unit_price)`) and calculated columns. Measures can use each other:
   `[Revenue] - [Cost]`. The editor completes tables, `table.` columns and `[` measures from the model, underlines
   references that don't exist, and Ctrl+Enter tests the expression. *Add date table* creates a calendar related to a date column, with Year › Quarter › Month ›
   Date to drill, and optionally fiscal years, Sunday weeks and ISO weeks. Then right-click a measure, *Quick
   measure…*, for year to date, same period last year (and the change vs it), previous month or quarter, or rolling
   months: no SQL to write.
3. **Visuals.** Back in *Report*, click a field to add a visual, or drag fields onto the canvas and into a visual's
   wells. The side panel changes its type, format, filters and SQL.
4. **Pages and interaction.** Add pages, slicers, drill-through targets and bookmarks. *Preview* shows the report as a
   reader sees it.

The [report format](/REPORT_FORMAT) describes the file the designer writes, field by field.

## Publish

*Publish* downloads a ZIP of a static site: the viewer, the engine, `report.json` and its data. Unzip it onto GitHub
Pages, Netlify, S3 or any web server; readers' browsers build the data and run the report. In a pipeline:

```bash
node scripts/publish.mjs report.json out/
```

Published reports show the "Powered by smaltbi" badge; turn it off in the Publish dialog (`branding.poweredBy: false`).
