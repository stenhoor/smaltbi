---
description: "The axis options of bar, column, line, area and combo charts: scales, titles, reference lines and small multiples."
---

# Chart axes

Axis options of bar, column, line, area and combo charts:

- `xAxis`: `category` (default) or `continuous`. Continuous places dates (and numbers) by value, so gaps and uneven
  dates show; categories that aren't dates or numbers stay evenly spaced. Not for bar charts.
- `yScale`: `linear` or `log` (positive values; ignored when stacked). `yMin`, `yMax` fix the value axis's ends.
- `xTitle`, `yTitle`: axis titles.
- `refLines`: `[{ "value": 1500, "label": "Target", "tone": "good" }, { "stat": "avg" }]`. `stat` is one of
  `avg`, `median`, `min` and `max` of the first series, and `tone` is one of `good`, `bad`, `warn` and `accent`.
- A `multiples` field draws a small chart per value, up to 24, all with the same scale.
