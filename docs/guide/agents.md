---
description: For AI agents - how to write and change smaltbi reports, the rules a report must follow, and what isn't supported.
---

# For AI agents

This site publishes Markdown for AI agents beside its pages, generated from the same sources at every build:

- A Markdown twin of every page: the page's address with `.md` (`guide/model.md`).
- [`llms.txt`](https://stenhoor.github.io/smaltbi/llms.txt): an index of the twins, as the sidebar groups them.
- [`agents.md`](https://stenhoor.github.io/smaltbi/agents.md): the agent guide, in one file. It starts with this page,
  then the report format's reference, in order.

## How to use smaltbi

smaltbi is a report designer and viewer that runs in a browser, on smaltdb. An agent works with a report as its file:
one JSON document (`*.smaltbi.json` or `report.json`) that the designer reads and writes, and that diffs well in git.

- **Write or change the file,** then open it to check it: `designer.html?report=<path or URL>` in the designer, or
  `viewer.html?report=<path or URL>` as a reader sees it. Relative paths in the report resolve against the report's
  URL.
- **Publish** with `node scripts/publish.mjs report.json out/` (after `npm install` and `npm run build` in the
  repository): a static site for any web host.
- **The sample,** [`examples/sales/report.json`](https://github.com/stenhoor/smaltbi/blob/main/examples/sales/report.json),
  uses nearly every feature: copy its patterns.
- **The TypeScript definitions,** [`src/core/types.ts`](https://github.com/stenhoor/smaltbi/blob/main/src/core/types.ts),
  are the format's reference; the [reference pages](../reference/) explain them.

## Rules

Follow these in every report you write.

1. **Version:** the top level has `"smaltbi": 1`, and the format's required fields: `name`, `data`, `model` and
   `pages`.
2. **Field references** are `"table.name"`: a column, calculated column, measure or hierarchy of that table. The first
   dot separates the table. A role-playing table is named by its role: `"Ship date.month"`.
3. **Measures are SQL aggregates** (`SUM(…)`, `COUNT(…)`, `AVG(…)`, …), in smaltql's SQL (SQLite's dialect). `[Name]`
   inlines another measure, `[@Name]` a parameter. A measure that combines two facts is written from measures
   (`[Revenue] / [Target]`), never as one aggregate over both tables.
4. **Calculated columns are row-level** SQL over their table's columns.
5. **Relationships are many-to-one:** `from` is the foreign key, `to` a key whose values are unique. Two active paths
   between the same tables are an error: set `"active": false` on one.
6. **A visual's `fields`** go in its type's roles, within each role's `max`; dimensions in dimension roles, measures in
   measure roles (a number column in a measure role is aggregated, `SUM` by default). See
   [visual types](../reference/visual-types).
7. **Ids** of pages and visuals are unique in the report. Bookmarks and the view state name them.
8. **Layout** is in grid cells: 12 columns by default, `x` and `w` within them.
9. **Plugins** are pinned: `{ "url", "integrity": "sha384-…" }`, the file's SRI hash. A changed file doesn't load.

## What isn't supported, and what to do instead

| Not supported | Instead |
|---|---|
| A server, sign-in, scheduled refresh on a server, row-level security | smaltbi is static: the reader's browser builds the data. Those are planned as plugins or a host around the app. |
| Bookmarks made in the designer | Write them in the file: `bookmarks` ([view state](../reference/view-state)). |
| Plugins other than visuals (data connectors, exports, other formula languages) | Planned. Use data steps (`sql`, `link`, `connection`) and SQL measures. |
| A formula language other than SQL (such as DAX) | SQL measures, with `[Measure]` references and `FILTER (WHERE …)`. |
| Time-intelligence measures inside another measure's SQL, or beside another fact's measures | Put the quick measure on the visual itself, with the base measure's fact only. |
| Many-to-many without a link table | Add a link table (two relationships out, keys only), or a table with one row per value: [Model](../reference/model). |
| `local:` files in a command-line publish | Publish from the designer, or put the file beside the report and import it by path. |
