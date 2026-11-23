---
description: "One number, large: a measure, with a comparison, a trend or a target."
---

# KPI card

One number, large: a measure, with a comparison, a trend or a target.

In `report.json`: `"type": "card"`.

## Fields

Wells in the designer's Build tab; `fields` in `report.json`, by role.

| Role | Well | Takes | At most |
|---|---|---|---|
| `values` | Value | measures (a column is aggregated) | 1 |
| `target` | Compare to | measures (a column is aggregated) | 1 |
| `trend` | Trend axis | fields to group by | 1 |

## Options

In the Format tab; `options` in `report.json`.

| Option | Label | Values | Default |
|---|---|---|---|
| `compare` | Comparison | `"delta"` (Change %), `"value"` (Value), `"none"` (None) | `"delta"` |
| `goodWhen` | Good when | `"up"` (Higher), `"down"` (Lower) | `"up"` |
| `caption` | Caption | text |  |

## See also

- [Visuals](/guide/visuals), [conditional formatting](/reference/format/conditional)
- [All visual types](./)
