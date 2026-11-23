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

The [quick start](./quick-start) builds a chart in the designer in three steps.

## Run it locally

smaltbi isn't on npm yet: run it from its repository, with Node.js.

```bash
git clone https://github.com/stenhoor/smaltbi && cd smaltbi
npm install        # also builds the engine (smaltdb, smaltql, plugins) into vendor/smaltdb/
npm run build      # bundles the designer and viewer into dist/
npm run serve      # http://localhost:8080/designer.html
```

`npm run docs:dev` serves this site with live reload.

## Your first report

A report is built in four steps, each a view or a dialog of the designer:

1. **[Data](./data):** add data steps that import or link your files (CSV, TSV, JSON, NDJSON, Parquet) or run SQL.
   They run each time the report opens.
2. **[Model](./model):** relate the tables, and add measures (`SUM(sales.quantity * sales.unit_price)`), calculated
   columns and hierarchies.
3. **[Visuals](./visuals):** click or drag fields onto the canvas, then choose each visual's type, fields, format and
   filters in the side panel.
4. **[Pages](./pages):** add pages, slicers, drill-through targets and bookmarks, and try the report in Preview.

Then [publish](./publish) it: a ZIP of a static site for any web host. The [report format](../reference/report) is the
file the designer saves, field by field.

## Where the report is kept

The designer keeps the report in your browser as you work (autosave, in its local storage). **File** starts a new
report, opens a report file and saves one: Ctrl/⌘+S downloads it as `<name>.smaltbi.json`. A report is one JSON file
that diffs well in git.

## For AI agents

Every page of this site has a Markdown twin for AI agents, and
[`llms.txt`](https://stenhoor.github.io/smaltbi/llms.txt) indexes them.
[`agents.md`](https://stenhoor.github.io/smaltbi/agents.md) is the agent guide: how to write and change reports, in one
file. See [For AI agents](./agents).
