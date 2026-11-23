---
description: "Short answers: where the data goes, what smaltbi needs, where your work is kept, and how it relates to smaltdb."
---

# FAQ

## Does my data leave my computer?

No. The designer and the viewer are static pages; smaltdb runs in a Web Worker in your browser, and the data steps
fetch files from where the report says. smaltbi has no server of its own.

## Do I need a server?

Only a static one, to serve the files. A published report is HTML, JavaScript, `report.json` and data files. It
doesn't open from disk (`file://`): browsers block module workers and data fetches there.

## Where is my work kept?

The designer saves your work in this browser between visits, and *File → Save report file* (Ctrl+S) downloads it as
`report.json`. Files you choose from your computer (`local:` in the data steps) stay in this browser until you
publish.

## How is a measure different from a column?

A measure is an aggregate, worked out for each point of a visual: `SUM(sales.quantity)` per category. A calculated
column is a value for each row, which you can group by. See [The model](./model).

## What is smaltdb?

The database engine smaltbi runs on: an embedded database for web pages, with SQL from smaltql. See
[smaltdb.dev](https://smaltdb.dev).

## Is it on npm?

Not yet: [build it from its repository](./getting-started#run-it-on-your-computer).
