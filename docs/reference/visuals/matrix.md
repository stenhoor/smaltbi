---
description: "A pivot table: a measure by row and column fields, with subtotals and drill-down."
---

# Matrix

A pivot table: a measure by row and column fields, with subtotals and drill-down.

In `report.json`: `"type": "matrix"`.

## Fields

Wells in the designer's Build tab; `fields` in `report.json`, by role.

| Role | Well | Takes | At most |
|---|---|---|---|
| `rows` | Rows | fields to group by | any |
| `columns` | Columns | fields to group by | 2 |
| `values` | Values | measures (a column is aggregated) | any |

## Options

In the Format tab; `options` in `report.json`.

| Option | Label | Values | Default |
|---|---|---|---|
| `rowTotals` | Row totals | `true`, `false` | `true` |
| `colTotals` | Column totals | `true`, `false` | `true` |
| `format` | Value formatting | `"none"` (None), `"heat"` (Heat colors), `"bars"` (Data bars) | `"none"` |
| `layout` | Layout | `"stepped"` (Stepped (expand and collapse)), `"tabular"` (Tabular (a column per level)) | `"stepped"` |
| `subtotals` | Subtotals Shown when `layout` is `"stepped"`. | `true`, `false` | `true` |
| `collapsed` | Start collapsed Shown when `layout` is `"stepped"`. | `true`, `false` | `false` |

## See also

- [Visuals](/guide/visuals), [conditional formatting](/reference/format/conditional)
- [All visual types](./)
