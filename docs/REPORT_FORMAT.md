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
  "branding": { "poweredBy": true }   // the "Powered by smaltbi" badge in the viewer (default true)
}
```

Relative paths (data files, theme files) resolve against the report file's URL.

## data

```jsonc
"data": {
  "database": { "name": "sales", "storage": "memory" },   // or "opfs"
  "init": "always",            // opfs: "once" (default: build only if empty) | "always" | "none" (use as is)
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
  "layout": { "sales": { "x": 368, "y": 40 }, "customers": { "x": 696, "y": 40 } }   // model diagram positions (display only)
}
```

- **Field references** are `"table.name"`, where `name` is a column, calculated column, measure or
  hierarchy of that table. The first dot separates the table.
- **`[Name]`** inside measure or column SQL inlines a measure (searched model-wide) or a calculated
  column (of the same table, or `[table.Name]`). Other bracketed text is left alone.
- **Measures** must be aggregates. A plain column dropped on a value well is aggregated implicitly
  (`SUM` for numbers, `COUNT` otherwise; changeable per visual).
- **`sortBy`** sorts a column by another column of the same table (month names by month number).
- **Types**: `number`, `text`, `date`, `datetime`, `bool`, `any`. Introspection detects ISO date strings.
- Without `relationships`, foreign keys declared in the database are used.
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
      "style": { "surface": "#ffffff" }                    // per-visual theme token overrides
    }
  ]
}
```

A field in `fields` can also be an object: `{ "field": "sales.quantity", "agg": "avg", "label": "Avg qty", "format": "decimal" }`.

### Visual types and roles

| Type | Roles (kind) | Notable options |
|---|---|---|
| `bar`, `column` | category (dim, drill), series (dim, 1), values (measure) | `stack`: none/stacked/percent, `labels`, `legend` |
| `line`, `area` | category (dim, drill), series (dim, 1), values (measure) | `smooth`, `markers`, `stack` (area) |
| `combo` | category (dim, drill), columns (measure), lines (measure) | `secondaryAxis` |
| `pie`, `donut` | category (dim, drill), values (measure, 1) | `labels`, `legend`, `center` |
| `scatter` | details (dim), legend (dim, 1), x, y, size (measure, 1 each) | `zero` |
| `card` | values, target (measure, 1), trend (dim, 1) | `compare`: delta/value/none, `goodWhen`, `caption` |
| `table` | columns (dim), values (measure) | `totals`, `format`: none/bars/heat, `density` |
| `matrix` | rows (dim), columns (dim, 2), values (measure) | `rowTotals`, `colTotals`, `format` |
| `slicer` | field (dim, 1) | `style`: list/dropdown/buttons/range/search, `single`, `sync` |
| `text` | values (measure) for `{0}`, `{1}` | `text` (markdown subset), `align` |
| `image` | — | `url`, `alt`, `fit` |
| `waterfall` | category (dim, 1), values (measure, 1) | `total`, `labels` |
| `funnel` | category (dim, 1), values (measure, 1) | `percent` |
| `treemap` | category (dim, drill), values (measure, 1) | `labels` |
| `heatmap` | rows, columns (dim, 1 each), values (measure, 1) | `labels` |
| `gauge` | values, target, max (measure, 1 each) | `maxValue` |

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
