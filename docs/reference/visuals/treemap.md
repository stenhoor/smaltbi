---
description: "Nested rectangles sized by a measure: parts of a whole, by one or more levels."
---

# Treemap

Nested rectangles sized by a measure: parts of a whole, by one or more levels.

In `report.json`: `"type": "treemap"`.

## Fields

Wells in the designer's Build tab; `fields` in `report.json`, by role.

| Role | Well | Takes | At most |
|---|---|---|---|
| `category` | Category | fields to group by, a drill path | any |
| `values` | Values | measures (a column is aggregated) | 1 |

## Options

In the Format tab; `options` in `report.json`.

| Option | Label | Values | Default |
|---|---|---|---|
| `labels` | Data labels | `true`, `false` | `false` |

## See also

- [Visuals](/guide/visuals)
- [All visual types](./)
