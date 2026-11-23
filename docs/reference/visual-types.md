# Visual types

The built-in visual types: each one's roles (the wells fields go in) and options (`options` in the visual, with their
defaults). A role is a *dimension* (grouped by) or a *measure* (aggregated); *max* is the most fields it takes, and a
*drill* role's fields form a drill path (Year → Quarter → Month) instead of being used at once. Plugins add more types,
namespaced: `acme.bullet` ([plugin API](./plugin-api)).

## Charts

| Type | Name | Roles | Options (default) |
|---|---|---|---|
| `bar` | Bar chart | `category` (dimension, drill), `series` (dimension, max 1), `values` (measure), `multiples` (dimension, max 1) | `stack` (`none`), `labels` (false), `legend` (`auto`), and the [axis options](#axis-options) but `xAxis` |
| `column` | Column chart | as `bar` | `stack` (`none`), `labels` (false), `legend` (`auto`), and the axis options |
| `line` | Line chart | as `bar` | `smooth` (false), `markers` (false), `labels` (false), `legend` (`auto`), and the axis options |
| `area` | Area chart | as `bar` | `stack` (`none`), `smooth` (false), `markers` (false), `labels` (false), `legend` (`auto`), and the axis options |
| `combo` | Line and column | `category` (dimension, drill), `columns` (measure), `lines` (measure), `multiples` (dimension, max 1) | `secondaryAxis` (true), `stack` (`none`), `labels` (false), `legend` (`auto`), the axis options, and `y2Title` (with `secondaryAxis`) |
| `pie` | Pie chart | `category` (dimension, drill), `values` (measure, max 1) | `labels` (false), `legend` (`auto`) |
| `donut` | Donut chart | as `pie` | `center` (true: the total in the middle), `labels` (false), `legend` (`auto`) |
| `scatter` | Scatter chart | `details` (dimension), `legend` (dimension, max 1), `x`, `y`, `size` (measure, max 1 each) | `zero` (false; true starts the axes at zero), `legend` (`auto`) |
| `waterfall` | Waterfall | `category` (dimension, max 1), `values` (measure, max 1) | `total` (true), `labels` (false) |
| `funnel` | Funnel | `category` (dimension, max 1), `values` (measure, max 1) | `percent` (true: each step's % of the first) |
| `treemap` | Treemap | `category` (dimension, drill), `values` (measure, max 1) | `labels` (false) |
| `heatmap` | Heatmap | `rows`, `columns` (dimension, max 1 each), `values` (measure, max 1) | `labels` (true) |
| `gauge` | Gauge | `values`, `target`, `max` (measure, max 1 each) | `maxValue` |
| `map` | Map | `location`, `latitude`, `longitude` (dimension, max 1 each), `values` (measure, max 1: the colour), `size` (measure, max 1) | `shapes` (a GeoJSON or TopoJSON file, relative to the report), `key` (`name`: the property locations match), `object` (TopoJSON's object), `projection` (`mercator` or `equirectangular`), `legend` (true) |

`stack` is `none`, `stacked` or `percent`. `legend` is `auto`, `top`, `bottom`, `right` or `none`.

### Axis options

Of bar, column, line, area and combo charts:

- `xAxis`: `category` (default) or `continuous`. Continuous places dates (and numbers) by value, so gaps and uneven
  dates show; categories that aren't dates or numbers stay evenly spaced. Not for bar charts.
- `yScale`: `linear` (default) or `log` (positive values; ignored when stacked). `yMin`, `yMax` fix the value axis's
  ends.
- `xTitle`, `yTitle`: axis titles.
- `refLines` (set in the Format tab): `[{ "value": 1500, "label": "Target", "tone": "good" }, { "stat": "avg" }]`.
  `stat` is one of `avg`, `median`, `min` and `max` of the first series, and `tone` is one of `good`, `bad`, `warn` and
  `accent`.
- A `multiples` field draws a small chart per value, up to 24, all with the same scale.

## Cards, tables and matrices

| Type | Name | Roles | Options (default) |
|---|---|---|---|
| `card` | KPI card | `values`, `target` (measure, max 1 each), `trend` (dimension, max 1: the trend axis, a sparkline) | `compare` (`delta`; or `value`, `none`), `goodWhen` (`up` or `down`), `caption` |
| `table` | Table | `columns` (dimension), `values` (measure) | `totals` (true), `format` (`none`; `bars` or `heat`), `density` (`normal`; `compact` or `relaxed`), `pageSize` (0: no pager; 10, 25, 50 or 100 rows per page), `freeze` (0; 1 or 2 leading columns kept in view when scrolling sideways) |
| `matrix` | Matrix | `rows` (dimension), `columns` (dimension, max 2), `values` (measure) | `rowTotals` (true), `colTotals` (true), `format` (`none`; `heat` or `bars`), `layout` (`stepped`: one indented row-header column, parents expand and collapse; or `tabular`: a column per row field), `subtotals` (true; stepped: parent rows show their level's subtotals), `collapsed` (false: start with parents collapsed) |

A table also keeps `widths`, the column widths in pixels by field, set by dragging a header's edge. Matrix row and
column totals are separate queries, so non-additive measures stay correct.

## Controls and content

| Type | Name | Roles | Options (default) |
|---|---|---|---|
| `slicer` | Slicer | `field` (dimension, max 1) | `style` (`list`; `dropdown`, `buttons`, `range` or `search`), `single` (false; true allows one value at a time), `sync` (false; true applies it to all pages) |
| `parameter` | Parameter | none | `param` (the parameter's name; the only one, if the model has one) |
| `text` | Text box | `values` (measure): `{0}`, `{1}` in the text | `text` (Markdown: a subset), `align` (`left`, `center` or `right`) |
| `image` | Image | none | `url`, `alt`, `fit` (`contain` or `cover`) |

## See also

[Visual](./visual) · [Visuals in the guide](../guide/visuals) · [Plugin API](./plugin-api)
