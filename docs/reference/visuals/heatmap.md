---
description: "A grid of coloured cells: a measure by two fields."
---

# Heatmap

A grid of coloured cells: a measure by two fields.

In `report.json`: `"type": "heatmap"`.

## Fields

Wells in the designer's Build tab; `fields` in `report.json`, by role.

| Role | Well | Takes | At most |
|---|---|---|---|
| `rows` | Rows | fields to group by | 1 |
| `columns` | Columns | fields to group by | 1 |
| `values` | Value | measures (a column is aggregated) | 1 |

## Options

In the Format tab; `options` in `report.json`.

| Option | Label | Values | Default |
|---|---|---|---|
| `labels` | Show values | `true`, `false` | `true` |

## See also

- [Visuals](/guide/visuals)
- [All visual types](./)
