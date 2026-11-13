# Report format

A report is one JSON file (by convention `*.smaltbi.json` or `report.json`). The TypeScript
definitions in [`src/core/types.ts`](../src/core/types.ts) are the reference; this page explains them.
The sample, [`examples/sales/report.json`](../examples/sales/report.json), uses nearly every feature.

```jsonc
{
  "smaltbi": 1,                 // format version
  "name": "Sales",
  "description": "…",
  "data": { … },                // how to build the database
  "model": { … },               // relationships, measures, columns, hierarchies, display settings
  "theme": "smalt",             // built-in name, a URL/path to a .theme.json, or an inline theme
  "filters": [ … ],             // report-level filters (every page)
  "pages": [ … ],
  "bookmarks": [ … ],
  "plugins": [ { "url": "plugins/bullet.js", "integrity": "sha384-…" } ],   // optional: ADR 0008, docs/PLUGINS.md
  "branding": { "poweredBy": true }   // the "Powered by smaltbi" badge in the viewer (default true)
}
```

Relative paths (data files, theme files, plugins, map shapes) resolve against the report file's URL. Each plugin is one ES module
file pinned by its SRI hash: it loads only if the file matches, and a report from another site asks before its
plugins run ([PLUGINS](PLUGINS.md)).

## data

```jsonc
"data": {
  "database": { "name": "sales", "storage": "memory" },   // or "opfs"
  "init": "always",            // opfs: "once" (default: build only if empty) | "always" | "none" (use as is)
  "refresh": { "every": 15 },  // optional: the viewer loads the data again every 15 minutes (while visible)
  "steps": [
    { "import": "data/sales.csv", "table": "sales" },                       // copy into a table
    { "import": "https://…/x.parquet", "table": "x" },
    { "import": "local:orders.csv", "table": "orders" },                    // a file kept in this browser
    { "link": "data/rates.csv", "table": "rates", "format": "csv" },         // external table, read in place
    { "sql": "CREATE VIEW big_orders AS SELECT * FROM orders WHERE amount > 100" },
    { "sqlFile": "views.sql" },
    { "table": "targets", "data": [ { "region": "EU", "target": 100 } ] },  // inline rows
    { "connection": "api", "url": "https://data.example.com/" }             // smaltdb connection
  ]
}
```

`format` is inferred from the extension (`csv`, `tsv`, `json`, `ndjson`, `parquet`); `options` pass
through to smaltdb's importers / external tables. This is the same step format as smaltui's
environment manifests. To report on an existing OPFS database, use
`{ "database": { "name": "mydb", "storage": "opfs" }, "init": "none" }` with no steps.

## model

```jsonc
"model": {
  "relationships": [ { "from": "sales.customer_id", "to": "customers.id" } ],   // many → one
  "measures": [
    { "table": "sales", "name": "Revenue", "sql": "SUM(sales.quantity * sales.unit_price)", "format": "currency0" },
    { "table": "sales", "name": "Margin %", "sql": "([Revenue] - [Cost]) / NULLIF([Revenue], 0)", "format": "percent" },
    { "table": "sales", "name": "Revenue 2025", "sql": "SUM([Line Revenue]) FILTER (WHERE sales.order_date >= '2025-01-01')" }
  ],
  "columns": [
    { "table": "sales", "name": "Month", "sql": "strftime('%Y-%m', sales.order_date)", "type": "date", "format": "month" },
    { "table": "sales", "name": "Month Name", "sql": "…", "sortBy": "order_date" }
  ],
  "hierarchies": [ { "table": "sales", "name": "Date", "levels": ["Year", "Quarter", "Month"] } ],
  "tables": {
    "sales": { "label": "Sales", "hidden": false, "columns": { "id": { "hidden": true }, "discount": { "format": "percent" } } }
  },
  "layout": { "sales": { "x": 368, "y": 40 }, "customers": { "x": 696, "y": 40 } },  // model diagram positions (display only)
  "dateTable": { "table": "calendar", "column": "date", "source": "sales.order_date",   // written by "Add date table"
                 "fiscalStart": 7, "weekStart": 1, "isoWeeks": true },
  "parameters": [                                            // what-if values, used as [@Name]
    { "name": "Growth", "type": "number", "value": 0.1, "min": 0, "max": 0.5, "step": 0.05, "format": "percent" },
    { "name": "Region", "type": "text", "value": "Europe", "choices": ["Europe", "North America"] }
  ]
}
```

- **Field references** are `"table.name"`, where `name` is a column, calculated column, measure or
  hierarchy of that table. The first dot separates the table.
- **`[Name]`** inside measure or column SQL inlines a measure (searched model-wide) or a calculated
  column (of the same table, or `[table.Name]`). Other bracketed text is left alone.
- **`[@Name]`** inside measure or column SQL is a **parameter**: a value readers change with a Parameter control
  visual (a slider for a number with `min` and `max`, a number box, a dropdown for text with `choices`, or a text
  box). It runs as a literal of the current value: the reader's choice, kept inside `min`/`max` or `choices`, or else
  `value`. Custom visual SQL can use `[@Name]` too. The reader's values are part of the view state (`params`, in
  the URL), like slicers.
- **Quick measures** for time intelligence carry `time` instead of SQL (`sql` stays empty):
  `{ "table": "sales", "name": "Revenue YTD", "sql": "", "time": { "of": "sales.Revenue", "calc": "ytd" } }`.
  `calc` is `ytd`, `qtd` or `mtd` (to date; years and quarters follow the date table's fiscal year), `py` (the same
  dates last year), `yoy` / `yoy%` (change vs last year), `pm` / `pq` (the period moved back one or three months,
  whole months), or `rolling` (the last `months` months, default 3). They need `dateTable`, a base measure over its
  source's table, and a date-table field on the visual or a date-table filter to give each row its period. They
  can't be used inside another measure's SQL, and filters on them are not applied.
- **Measures** must be aggregates. A plain column dropped on a value well is aggregated implicitly
  (`SUM` for numbers, `COUNT` otherwise; changeable per visual).
- **`sortBy`** sorts a column by another column of the same table (month names by month number).
- **Types**: `number`, `text`, `date`, `datetime`, `bool`, `any`. Introspection detects ISO date strings.
- Without `relationships`, foreign keys declared in the database are used.
- **`dateTable`** records the calendar that "Add date table" (model view) created: a SQL data step (the last one) that
  builds a row per day over whole (fiscal) years around `source`'s dates, a relationship `source → table.date`, the
  hierarchies *Calendar* (year › quarter › month › date), *Fiscal calendar* (when `fiscalStart` isn't 1; a fiscal
  year is named by the year it ends in, e.g. FY2025 for July 2024 – June 2025) and *ISO weeks* (with `isoWeeks`), and
  the columns' labels and sort order. `weekStart` is 1 for Monday weeks or 0 for Sunday weeks.
- Relationships must be **unambiguous**: two active paths between the same tables (for example
  `sales → customers` and `sales → stores → customers`) make queries that cross them fail with an
  explanation. Set `"active": false` on one of them.

### Formats

A format is a preset name or an object:

| Preset | Example |
|---|---|
| `number` | 1,234.57 |
| `integer` | 1,235 |
| `decimal` | 1,234.57 |
| `percent` | 12.3% (value 0.123) |
| `currency`, `currency0` | $1,234.57, $1,235 |
| `compact`, `currency-compact` | 1.2K, $1.2K |
| `date`, `datetime`, `month`, `year` | 2025-03-09, 2025-03-09 14:05, Mar 2025, 2025 |

Objects: `{ "currency": "EUR", "decimals": 0, "compact": true, "percent": true, "prefix": "~", "suffix": " kg", "scale": 0.001, "locale": "de-DE", "date": "D MMM YYYY" }`.
Patterns such as `"$#,0.00"` or `"0.0%"` also work.

## pages and visuals

```jsonc
{
  "id": "overview", "name": "Overview",
  "hidden": false,
  "drillthrough": ["customers.country"],       // makes this a drill-through target
  "filters": [ … ],
  "layout": { "rowHeight": 56, "columns": 12, "gap": 12 },   // overrides the theme's page grid
  "size": { "preset": "a4", "landscape": true },             // optional: a fixed page (below); responsive without it
  "phoneOrder": ["k-rev", "c-date"],                         // optional: phone column order (the rest follow)
  "visuals": [
    {
      "id": "c-date",
      "type": "column",
      "title": "Revenue over time", "subtitle": "Double-click to drill down",
      "layout": { "x": 0, "y": 3, "w": 8, "h": 5 },           // grid cells: 12 columns, rows of rowHeight
      "fields": { "category": ["sales.Date"], "values": ["sales.Revenue"] },
      "options": { "stack": "none", "labels": false },
      "filters": [ … ],
      "sort": [ { "by": "values:0", "dir": "desc" } ],       // role:index, or a field reference
      "limit": 50,
      "sql": "SELECT …",                                    // optional custom SQL
      "interactions": { "filterOthers": true, "filteredByOthers": true },
      "style": { "surface": "#ffffff" },                   // per-visual theme token overrides
      "phone": { "hidden": false, "h": 4 },                // optional: on phones, hidden or its own height (rows)
      "repeat": { "field": "products.category", "columns": 4, "max": 24, "order": "asc" },   // optional (below)
      "conditional": [                                     // tables, matrices, cards: first matching rule wins
        { "apply": "sales.Revenue", "op": "lt", "compare": "sales.Revenue LY", "tone": "bad", "icon": "down" },
        { "apply": "*", "op": "gt", "value": 100000, "tone": "good", "fill": true }
      ]
    }
  ]
}
```

**Page size** (`size`, optional; ADR 0006). Without it a page is responsive: it fills the window and grows with its
visuals, and on narrow screens the visuals stack. With it the page is a fixed sheet that never reflows:

- `preset` is one of `16:9` (1280 × 720 px), `4:3` (1024 × 768), `letter` (816 × 1056, 8.5 × 11 in) or `a4`
  (794 × 1123), in CSS pixels at 96 per inch, or `custom` with `width` and `height`.
- Paper is portrait unless `landscape` is true. Screens are landscape unless `landscape` is false.
- The page's `layout.rows` (12 by default) fill the sheet's height, so the row height is worked out, not
  `rowHeight`. Visuals below the last row are cut off; the designer marks them.
- Readers see the sheet at 100% and scroll, or choose *Fit to window* in the viewer bar, which scales it down. The
  choice is remembered in their browser.

**Repeat for each** (`repeat`, any visual with data fields): the visual becomes a grid of copies, one per value of
`field` (a dimension), each filtered to its value and titled with it: a card for each product category, a chart for
each region. `columns` sets the grid (else automatic), `max` the number of copies (default 24; a note says how many
more there are), `order` `asc` or `desc`. The data is one query grouped by the field as well, so a click in a copy
selects that value too (the bar *and* its region). Each copy has its own scale; for one shared scale across charts,
use the cartesian charts' `multiples` field.

**On phones** (ADR 0007): a report narrower than 720px shows every page, fixed-size ones included, as one column.
The visuals come in reading order (top to bottom, then left to right) at their desktop height. `phoneOrder` lists
the ids that come first, in that order. A visual's `phone.hidden` leaves it out on phones, and `phone.h` sets its
height in rows there.

**Conditional formatting** (`conditional`, tables, matrices and KPI cards) colours measure values and adds icons.
Each rule formats `apply` (a measure field of the visual, or `"*"` for all) when a test holds: the value itself, or
`test` (another measure in the same row), compared by `op` (`gt`, `gte`, `lt`, `lte`, `eq`, `ne`, `between`,
`positive`, `negative`, `blank`) with `value` (and `value2` for `between`) or with `compare`, another measure ("by
measure"). Measures that a rule tests or compares with but the visual doesn't show are fetched with its data. The
effect: `tone` (`good`, `bad`, `warn`, `accent`) as the text colour, or the background with `fill`, and an `icon`
(`up`, `down`, `flat`, `check`, `cross`, `warn`, `dot`). The first rule that matches a value wins.

A field in `fields` can also be an object: `{ "field": "sales.quantity", "agg": "avg", "label": "Avg qty", "format": "decimal" }`.

### Visual types and roles

| Type | Roles (kind) | Notable options |
|---|---|---|
| `bar`, `column` | category (dim, drill), series (dim, 1), values (measure), multiples (dim, 1) | `stack`: none/stacked/percent, `labels`, `legend`, and the axis options below |
| `line`, `area` | category (dim, drill), series (dim, 1), values (measure), multiples (dim, 1) | `smooth`, `markers`, `stack` (area), and the axis options below |
| `combo` | category (dim, drill), columns (measure), lines (measure), multiples (dim, 1) | `secondaryAxis`, `y2Title`, and the axis options below |
| `pie`, `donut` | category (dim, drill), values (measure, 1) | `labels`, `legend`, `center` |
| `scatter` | details (dim), legend (dim, 1), x, y, size (measure, 1 each) | `zero` |
| `card` | values, target (measure, 1), trend (dim, 1) | `compare`: delta/value/none, `goodWhen`, `caption` |
| `table` | columns (dim), values (measure) | `totals`, `format`: none/bars/heat, `density`, `pageSize` (rows per page; a pager under the table), `freeze` (leading columns kept in view when scrolling sideways), `widths` (px by field, set by dragging a header's edge) |
| `matrix` | rows (dim), columns (dim, 2), values (measure) | `rowTotals`, `colTotals`, `format`, `layout` (`stepped`: one indented row-header column, parents expand and collapse; `tabular`: a column per row field), `subtotals` (stepped: parent rows show their level's subtotals), `collapsed` (start with parents collapsed) |
| `slicer` | field (dim, 1) | `style`: list/dropdown/buttons/range/search, `single`, `sync` |
| `parameter` | — | `param` (the parameter's name; the only one if there is one) |
| `text` | values (measure) for `{0}`, `{1}` | `text` (markdown subset), `align` |
| `image` | — | `url`, `alt`, `fit` |
| `waterfall` | category (dim, 1), values (measure, 1) | `total`, `labels` |
| `funnel` | category (dim, 1), values (measure, 1) | `percent` |
| `treemap` | category (dim, drill), values (measure, 1) | `labels` |
| `heatmap` | rows, columns (dim, 1 each), values (measure, 1) | `labels` |
| `map` | location, latitude, longitude (dim, 1 each), values (measure, 1: colour), size (measure, 1) | `shapes` (a GeoJSON or TopoJSON file, relative to the report), `key` (the property locations match, default `name`), `object` (TopoJSON), `projection`: mercator/equirectangular, `legend` |
| `gauge` | values, target, max (measure, 1 each) | `maxValue` |

Axis options of bar, column, line, area and combo charts:

- `xAxis`: `category` (default) or `continuous`. Continuous places dates (and numbers) by value, so gaps and uneven
  dates show; categories that aren't dates or numbers stay evenly spaced. Not for bar charts.
- `yScale`: `linear` or `log` (positive values; ignored when stacked). `yMin`, `yMax` fix the value axis's ends.
- `xTitle`, `yTitle`: axis titles.
- `refLines`: `[{ "value": 1500, "label": "Target", "tone": "good" }, { "stat": "avg" }]`. `stat` is one of
  `avg`, `median`, `min` and `max` of the first series, and `tone` is one of `good`, `bad`, `warn` and `accent`.
- A `multiples` field draws a small chart per value, up to 24, all with the same scale.

## filters

```jsonc
{ "field": "products.category", "op": "in", "values": ["Tea", "Coffee"] }
{ "field": "sales.order_date", "op": "between", "values": ["2025-01-01", null] }   // open-ended
{ "field": "products.name", "op": "top", "values": [10], "by": "sales.Revenue" }   // [10, "bottom"] for bottom N
{ "field": "sales.Revenue", "op": "gt", "values": [1000] }                          // on a measure: HAVING
{ "op": "tuples", "fields": ["products.category", "customers.segment"], "tuples": [["Tea", "Consumer"]] }
{ "op": "sql", "sql": "sales.quantity * sales.unit_price > 50" }
```

Operators: `in`, `not-in`, `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `between`, `contains`,
`starts-with`, `is-null`, `not-null`, `top`, `tuples`, `sql`. `null` in `values` means blank.

## bookmarks and view state

```jsonc
"bookmarks": [
  { "name": "Europe only", "state": {
      "page": "overview",
      "selections": { "s-region": [ { "field": "stores.region", "op": "in", "values": ["Europe"] } ] },
      "drill": { "c-date": { "level": 1, "path": { "0": "2025" } } }
  } }
]
```

The viewer keeps the current state in the URL as `#s=<base64url JSON>` with the same shape.

## Compatibility

`smaltbi: 1` is the format version. Until 1.0, fields may still change; a migration function will
upgrade older files when the format changes.
