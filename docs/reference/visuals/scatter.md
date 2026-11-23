---
description: "Points by two measures: how they relate, for each value of a field."
---

# Scatter chart

Points by two measures: how they relate, for each value of a field.

In `report.json`: `"type": "scatter"`.

## Fields

Wells in the designer's Build tab; `fields` in `report.json`, by role.

| Role | Well | Takes | At most |
|---|---|---|---|
| `details` | Values (one point each) | fields to group by | any |
| `legend` | Legend | fields to group by | 1 |
| `x` | X axis | measures (a column is aggregated) | 1 |
| `y` | Y axis | measures (a column is aggregated) | 1 |
| `size` | Size | measures (a column is aggregated) | 1 |

## Options

In the Format tab; `options` in `report.json`.

| Option | Label | Values | Default |
|---|---|---|---|
| `zero` | Axes start at zero | `true`, `false` | `false` |
| `legend` | Legend | `"auto"` (Auto), `"top"` (Top), `"bottom"` (Bottom), `"right"` (Right), `"none"` (Hidden) | `"auto"` |

## See also

- [Visuals](/guide/visuals)
- [All visual types](./)
