---
description: "A circle in slices: each value of a field as a share of the whole."
---

# Pie chart

A circle in slices: each value of a field as a share of the whole.

In `report.json`: `"type": "pie"`.

## Fields

Wells in the designer's Build tab; `fields` in `report.json`, by role.

| Role | Well | Takes | At most |
|---|---|---|---|
| `category` | Legend | fields to group by, a drill path | any |
| `values` | Values | measures (a column is aggregated) | 1 |

## Options

In the Format tab; `options` in `report.json`.

| Option | Label | Values | Default |
|---|---|---|---|
| `labels` | Data labels | `true`, `false` | `false` |
| `legend` | Legend | `"auto"` (Auto), `"top"` (Top), `"bottom"` (Bottom), `"right"` (Right), `"none"` (Hidden) | `"auto"` |

## See also

- [Visuals](/guide/visuals)
- [All visual types](./)
