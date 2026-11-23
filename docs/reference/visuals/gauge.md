---
description: "A dial: one measure against a target or range."
---

# Gauge

A dial: one measure against a target or range.

In `report.json`: `"type": "gauge"`.

## Fields

Wells in the designer's Build tab; `fields` in `report.json`, by role.

| Role | Well | Takes | At most |
|---|---|---|---|
| `values` | Value | measures (a column is aggregated) | 1 |
| `target` | Target | measures (a column is aggregated) | 1 |
| `max` | Maximum | measures (a column is aggregated) | 1 |

## Options

In the Format tab; `options` in `report.json`.

| Option | Label | Values | Default |
|---|---|---|---|
| `maxValue` | Maximum (when no field) | a number |  |

## See also

- [Visuals](/guide/visuals)
- [All visual types](./)
