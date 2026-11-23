---
description: "Regions coloured by a measure, or points by latitude and longitude."
---

# Map

Regions coloured by a measure, or points by latitude and longitude.

In `report.json`: `"type": "map"`.

## Fields

Wells in the designer's Build tab; `fields` in `report.json`, by role.

| Role | Well | Takes | At most |
|---|---|---|---|
| `location` | Location | fields to group by | 1 |
| `latitude` | Latitude | fields to group by | 1 |
| `longitude` | Longitude | fields to group by | 1 |
| `values` | Colour by | measures (a column is aggregated) | 1 |
| `size` | Size by | measures (a column is aggregated) | 1 |

## Options

In the Format tab; `options` in `report.json`.

| Option | Label | Values | Default |
|---|---|---|---|
| `shapes` | Shapes file (GeoJSON or TopoJSON) | text |  |
| `key` | Match locations on property | text | `"name"` |
| `object` | TopoJSON object | text |  |
| `projection` | Projection | `"mercator"` (Mercator), `"equirectangular"` (Equirectangular) | `"mercator"` |
| `legend` | Legend | `true`, `false` | `true` |

## See also

- [Visuals](/guide/visuals)
- [All visual types](./)
