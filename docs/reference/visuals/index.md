---
description: "Every built-in visual type: its fields and options, as report.json writes them."
---

# Visual types

Every built-in visual, with the fields it takes (its roles) and its Format options. A visual in `report.json`:

```jsonc
{ "id": "v1", "type": "column", "layout": { "x": 0, "y": 0, "w": 6, "h": 4 },
  "fields": { "category": ["products.category"], "values": ["sales.Revenue"] },
  "options": { "labels": true } }
```

## Charts and tables

| Type | Visual | What it shows |
|---|---|---|
| [`bar`](./bar) | Bar chart | Horizontal bars: compare a measure across the values of a field. |
| [`column`](./column) | Column chart | Vertical columns: compare a measure across the values of a field, or over time. |
| [`line`](./line) | Line chart | Lines: a measure over time or another ordered field. |
| [`area`](./area) | Area chart | Filled lines: a measure over time, with series stacked or overlapping. |
| [`pie`](./pie) | Pie chart | A circle in slices: each value of a field as a share of the whole. |
| [`donut`](./donut) | Donut chart | A ring in slices, with the total in its centre: each value of a field as a share of the whole. |
| [`card`](./card) | KPI card | One number, large: a measure, with a comparison, a trend or a target. |
| [`scatter`](./scatter) | Scatter chart | Points by two measures: how they relate, for each value of a field. |
| [`table`](./table) | Table | Rows and columns: fields and measures, with totals, paging and conditional formatting. |
| [`matrix`](./matrix) | Matrix | A pivot table: a measure by row and column fields, with subtotals and drill-down. |
| [`slicer`](./slicer) | Slicer | A filter readers click: a list, dropdown, buttons, a range or a search box. |
| [`text`](./text) | Text box | Formatted text (Markdown), with measures inside it. |
| [`image`](./image) | Image | An image from a URL. |
| [`parameter`](./parameter) | Parameter | A control for a what-if parameter: a slider or a dropdown that every measure using it follows. |

## More visuals

| Type | Visual | What it shows |
|---|---|---|
| [`combo`](./combo) | Line and column | Columns and lines on one axis: two kinds of measure over the same field. |
| [`funnel`](./funnel) | Funnel | Stages narrowing from top to bottom: a measure across ordered steps. |
| [`treemap`](./treemap) | Treemap | Nested rectangles sized by a measure: parts of a whole, by one or more levels. |
| [`waterfall`](./waterfall) | Waterfall | Steps up and down to a total: how changes add up. |
| [`gauge`](./gauge) | Gauge | A dial: one measure against a target or range. |
| [`heatmap`](./heatmap) | Heatmap | A grid of coloured cells: a measure by two fields. |
| [`map`](./map) | Map | Regions coloured by a measure, or points by latitude and longitude. |

Plugins add visual types of their own: see [Plugins](/PLUGINS).
