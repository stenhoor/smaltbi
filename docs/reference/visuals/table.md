---
description: "Rows and columns: fields and measures, with totals, paging and conditional formatting."
---

# Table

Rows and columns: fields and measures, with totals, paging and conditional formatting.

In `report.json`: `"type": "table"`.

## Fields

Wells in the designer's Build tab; `fields` in `report.json`, by role.

| Role | Well | Takes | At most |
|---|---|---|---|
| `columns` | Columns | fields to group by | any |
| `values` | Values | measures (a column is aggregated) | any |

## Options

In the Format tab; `options` in `report.json`.

| Option | Label | Values | Default |
|---|---|---|---|
| `totals` | Totals row | `true`, `false` | `true` |
| `format` | Value formatting | `"none"` (None), `"bars"` (Data bars), `"heat"` (Heat colors) | `"none"` |
| `density` | Density | `"normal"` (Normal), `"compact"` (Compact), `"relaxed"` (Relaxed) | `"normal"` |
| `pageSize` | Rows per page | `"0"` (All (scroll)), `"10"` (10), `"25"` (25), `"50"` (50), `"100"` (100) | `"0"` |
| `freeze` | Frozen columns | `"0"` (None), `"1"` (First column), `"2"` (First two columns) | `"0"` |

## See also

- [Visuals](/guide/visuals), [conditional formatting](/reference/format/conditional)
- [All visual types](./)
