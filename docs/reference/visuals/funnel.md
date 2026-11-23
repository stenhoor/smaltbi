---
description: "Stages narrowing from top to bottom: a measure across ordered steps."
---

# Funnel

Stages narrowing from top to bottom: a measure across ordered steps.

In `report.json`: `"type": "funnel"`.

## Fields

Wells in the designer's Build tab; `fields` in `report.json`, by role.

| Role | Well | Takes | At most |
|---|---|---|---|
| `category` | Stage | fields to group by | 1 |
| `values` | Value | measures (a column is aggregated) | 1 |

## Options

In the Format tab; `options` in `report.json`.

| Option | Label | Values | Default |
|---|---|---|---|
| `percent` | Show % of first | `true`, `false` | `true` |

## See also

- [Visuals](/guide/visuals)
- [All visual types](./)
