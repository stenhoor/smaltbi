---
description: "Steps up and down to a total: how changes add up."
---

# Waterfall

Steps up and down to a total: how changes add up.

In `report.json`: `"type": "waterfall"`.

## Fields

Wells in the designer's Build tab; `fields` in `report.json`, by role.

| Role | Well | Takes | At most |
|---|---|---|---|
| `category` | Category | fields to group by | 1 |
| `values` | Change | measures (a column is aggregated) | 1 |

## Options

In the Format tab; `options` in `report.json`.

| Option | Label | Values | Default |
|---|---|---|---|
| `total` | Show total | `true`, `false` | `true` |
| `labels` | Data labels | `true`, `false` | `false` |

## See also

- [Visuals](/guide/visuals)
- [All visual types](./)
