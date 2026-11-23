---
description: "For AI agents that read and write smaltbi reports: the format, the rules, and how to check a report."
---

# For AI agents

This page is written for AI agents that read or write smaltbi reports, and it opens the agent guide. The site
publishes Markdown made for agents beside its pages:

- [`/agents.md`](https://stenhoor.github.io/smaltbi/agents.md): this page, then the report format, every visual type
  and the keyboard shortcuts, in one file.
- [`/llms.txt`](https://stenhoor.github.io/smaltbi/llms.txt): an index of every page, each as Markdown.
- Any page as Markdown: its address with `.md`, such as
  [`guide/model.md`](https://stenhoor.github.io/smaltbi/guide/model.md).

## What smaltbi is

smaltbi is a report designer and a viewer: static web pages that run reports in the reader's browser, on smaltdb, an
embedded database for web pages. A report is one JSON file, `report.json`. The designer writes it; the viewer reads
it. An agent can write the file directly: everything the designer does is in it.

## A report

```json
{
  "smaltbi": 1,
  "name": "Sales by category",
  "data": {
    "steps": [
      { "import": "examples/sales/data/sales.csv", "table": "sales" },
      { "import": "examples/sales/data/products.csv", "table": "products" }
    ]
  },
  "model": {
    "relationships": [{ "from": "sales.product_id", "to": "products.id" }],
    "measures": [{ "table": "sales", "name": "Revenue", "sql": "SUM(sales.quantity * sales.unit_price)" }]
  },
  "pages": [
    {
      "id": "p1",
      "name": "Overview",
      "visuals": [
        { "id": "v1", "type": "card", "layout": { "x": 0, "y": 0, "w": 3, "h": 2 }, "fields": { "values": ["sales.Revenue"] } },
        { "id": "v2", "type": "column", "layout": { "x": 3, "y": 0, "w": 9, "h": 5 },
          "fields": { "category": ["products.category"], "values": ["sales.Revenue"] }, "options": { "labels": true } }
      ]
    }
  ]
}
```

- **`data.steps`** run in order and build the database: `import` copies a CSV, TSV, JSON, NDJSON or Parquet file
  into a table, `link` reads one in place, `sql` runs a statement. Paths are relative to the report's URL.
- **`model`** relates tables (`from` the many side, `to` a unique column) and defines measures and calculated
  columns in SQL: smaltql, SQLite's dialect.
- **`pages[].visuals[]`**: `type` is a visual type; `fields` maps the type's roles to field references; `layout` is
  in grid cells (12 columns in the built-in themes); `options` are the type's Format options.

## Rules

- **Field references are `"table.name"`**, where `name` is a column, a calculated column, a measure or a hierarchy of
  that table. The first dot separates the table.
- **Measures are SQL aggregates**: `SUM(...)`, `COUNT(DISTINCT ...)`, `AVG(...) FILTER (WHERE ...)`. Inside one,
  `[Name]` uses another measure and `[@Name]` a what-if parameter.
- **A column on a value well is aggregated**: `SUM` for numbers, `COUNT` otherwise.
- **Each type takes its own roles.** A bar chart takes `category`, `series`, `values` and `multiples`; a card takes
  `values`, `target` and `trend`. The roles, their limits and the options of every type are in
  [Visual types](/reference/visuals/).
- **Ids are unique**: page ids in the report, visual ids on their page.
- **A relationship's `to` column must be unique**, and two active paths between the same tables are refused: set
  `"active": false` on one.

## Check a report

There is no validator command yet. Open the report in the viewer (`viewer.html?report=<url>`) or the designer, served
by `npm run serve`: a visual that can't run shows its error in its place, and the designer's model view marks
problems in the model. [Report format](/reference/format/) is the full description; its source of truth is the TypeScript
types in [`src/core/types.ts`](https://github.com/stenhoor/smaltbi/blob/HEAD/src/core/types.ts).
