---
description: "Columns and lines on one axis: two kinds of measure over the same field."
---

# Line and column

Columns and lines on one axis: two kinds of measure over the same field.

In `report.json`: `"type": "combo"`.

## Fields

Wells in the designer's Build tab; `fields` in `report.json`, by role.

| Role | Well | Takes | At most |
|---|---|---|---|
| `category` | Axis | fields to group by, a drill path | any |
| `columns` | Column values | measures (a column is aggregated) | any |
| `lines` | Line values | measures (a column is aggregated) | any |
| `multiples` | Small multiples | fields to group by | 1 |

## Options

In the Format tab; `options` in `report.json`.

| Option | Label | Values | Default |
|---|---|---|---|
| `secondaryAxis` | Secondary axis for lines | `true`, `false` | `true` |
| `stack` | Stacking | `"none"` (Side by side), `"stacked"` (Stacked), `"percent"` (100% stacked) | `"none"` |
| `labels` | Data labels | `true`, `false` | `false` |
| `legend` | Legend | `"auto"` (Auto), `"top"` (Top), `"bottom"` (Bottom), `"right"` (Right), `"none"` (Hidden) | `"auto"` |
| `xAxis` | X axis | `"category"` (Categories), `"continuous"` (Continuous (dates, numbers)) | `"category"` |
| `yScale` | Y axis scale | `"linear"` (Linear), `"log"` (Logarithmic) | `"linear"` |
| `yMin` | Y axis minimum | a number |  |
| `yMax` | Y axis maximum | a number |  |
| `xTitle` | X axis title | text |  |
| `yTitle` | Y axis title | text |  |
| `y2Title` | Secondary axis title Shown when `secondaryAxis` is `true`. | text |  |

## See also

- [Visuals](/guide/visuals), [reference lines](/REPORT_FORMAT#pages-and-visuals)
- [All visual types](./)
