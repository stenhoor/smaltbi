---
description: "What smaltbi is, how to run it on your computer, and where a report lives."
---

# Getting started

smaltbi is a report designer and a viewer, built as a static web app on [smaltdb](https://smaltdb.dev). You load CSV,
JSON or Parquet files (or open an existing smaltdb database), model them with relationships and SQL measures, drag
fields onto a canvas, and publish the result as a static site. Every report runs in its reader's browser: there is no
server to set up, and the data goes no further than the page.

## Try it here

- <a href="../designer.html?report=examples/sales/report.json" target="_self">The designer</a>, with the sample report.
- <a href="../viewer.html?report=examples/sales/report.json" target="_self">The viewer</a>: the same report as a reader
  sees it.
- <a href="../sample/" target="_self">The sample, published</a> as a static site of its own.

## Run it on your computer

smaltbi builds with Node 22 (the version its CI uses). It is not on npm yet; build it from its repository:

```bash
git clone https://github.com/stenhoor/smaltbi && cd smaltbi
npm install        # also builds the engine (smaltdb, smaltql, plugins) into vendor/smaltdb/
npm run build      # bundles the designer and the viewer into dist/
npm run serve      # http://localhost:8080/designer.html
```

`npm run serve` makes the page cross-origin isolated (COOP and COEP headers), so smaltdb can use parallel reader workers
and interrupt a running statement; `--no-isolation` turns that off. A published report is plain static files, for any
web server.

## Where a report lives

A report is one JSON file, `report.json`: its data steps, its model, its pages and their visuals, and its theme. The
designer reads and writes it; the viewer only reads it. It diffs well in git. [Report format](/REPORT_FORMAT)
describes it field by field.

- **Open one:** `designer.html?report=<url>` or `viewer.html?report=<url>`, a URL relative to the page or absolute.
  In the designer, *File* opens a file from your computer or a URL.
- **Save one:** *File → Save report file* (Ctrl+S) downloads it. The designer also keeps your work in this browser
  between visits.
- **Share one:** *Publish* makes a static site of the report, its data and the viewer: see
  [Publishing](./publishing).

## Next

- The [tutorial](./tutorial) builds a report from CSV files, step by step.
- The user guide covers each part of the app: [data](./data), [the model](./model), [visuals](./visuals),
  [pages and interaction](./pages) and [publishing](./publishing).
- [For AI agents](./agents): how an agent reads and writes smaltbi reports.
