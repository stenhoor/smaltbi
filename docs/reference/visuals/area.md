---
description: "Filled lines: a measure over time, with series stacked or overlapping."
---

# Area chart

Filled lines: a measure over time, with series stacked or overlapping.

In `report.json`: `"type": "area"`.

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
| `stack` | Stacking | `"none"` (Overlapping), `"stacked"` (Stacked), `"percent"` (100% stacked) | `"none"` |
| `smooth` | Smooth lines | `true`, `false` | `false` |
| `markers` | Markers | `true`, `false` | `false` |
| `labels` | Data labels | `true`, `false` | `false` |
| `legend` | Legend | `"auto"` (Auto), `"top"` (Top), `"bottom"` (Bottom), `"right"` (Right), `"none"` (Hidden) | `"auto"` |
| `xAxis` | X axis | `"category"` (Categories), `"continuous"` (Continuous (dates, numbers)) | `"category"` |
| `yScale` | Y axis scale | `"linear"` (Linear), `"log"` (Logarithmic) | `"linear"` |
| `yMin` | Y axis minimum | a number |  |
| `yMax` | Y axis maximum | a number |  |
| `xTitle` | X axis title | text |  |
| `yTitle` | Y axis title | text |  |

## See also

- [Visuals](/guide/visuals), [reference lines](/REPORT_FORMAT#pages-and-visuals)
- [All visual types](./)
