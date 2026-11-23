---
description: "A visual in report.json: its type, layout, fields, options, sort, custom SQL and interactions."
---

# Visuals

```jsonc
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
  "repeat": { "field": "products.category", "columns": 4, "max": 24, "order": "asc", "copy": { "w": 3, "h": 2 }, "minColumns": 2, "overflow": "expand", "maxHeight": 12 },   // optional: Repeat for each
  "conditional": [                                     // tables, matrices, cards: first matching rule wins
    { "apply": "sales.Revenue", "op": "lt", "compare": "sales.Revenue LY", "tone": "bad", "icon": "down" },
    { "apply": "*", "op": "gt", "value": 100000, "tone": "good", "fill": true }
  ]
}
```

A field in `fields` can also be an object: `{ "field": "sales.quantity", "agg": "avg", "label": "Avg qty", "format": "decimal" }`.

- `repeat`: [Repeat for each](./repeat).
- `conditional`: [Conditional formatting](./conditional).
- `phone`: [Pages, On phones](./pages#on-phones).

## Visual types and roles

Each type's page in [Visual types](/reference/visuals/) lists all its roles and options, generated from the code. In short:

| Type | Roles (kind) | Notable options |
|---|---|---|
| `bar`, `column` | category (dim, drill), series (dim, 1), values (measure), multiples (dim, 1) | `stack`: none/stacked/percent, `labels`, `legend`, and the [axis options](./axes) |
| `line`, `area` | category (dim, drill), series (dim, 1), values (measure), multiples (dim, 1) | `smooth`, `markers`, `stack` (area), and the [axis options](./axes) |
| `combo` | category (dim, drill), columns (measure), lines (measure), multiples (dim, 1) | `secondaryAxis`, `y2Title`, and the [axis options](./axes) |
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
