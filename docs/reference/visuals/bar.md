---
description: "Horizontal bars: compare a measure across the values of a field."
---

# Bar chart

Horizontal bars: compare a measure across the values of a field.

In `report.json`: `"type": "bar"`.

## Fields

Wells in the designer's Build tab; `fields` in `report.json`, by role.

| Role | Well | Takes | At most |
|---|---|---|---|
| `category` | Axis | fields to group by, a drill path | any |
| `series` | Legend | fields to group by | 1 |
| `values` | Values | measures (a column is aggregated) | any |
| `multiples` | Small multiples | fields to group by | 1 |

## Options

In the Format tab; `options` in `report.json`.

| Option | Label | Values | Default |
|---|---|---|---|
| `stack` | Stacking | `"none"` (Side by side), `"stacked"` (Stacked), `"percent"` (100% stacked) | `"none"` |
| `labels` | Data labels | `true`, `false` | `false` |
| `legend` | Legend | `"auto"` (Auto), `"top"` (Top), `"bottom"` (Bottom), `"right"` (Right), `"none"` (Hidden) | `"auto"` |
| `yScale` | Value axis scale | `"linear"` (Linear), `"log"` (Logarithmic) | `"linear"` |
| `yMin` | Value axis minimum | a number |  |
| `yMax` | Value axis maximum | a number |  |
| `xTitle` | Value axis title | text |  |
| `yTitle` | Category axis title | text |  |

## See also

- [Visuals](/guide/visuals), [reference lines](/reference/format/axes)
- [All visual types](./)
