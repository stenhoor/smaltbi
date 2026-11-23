---
description: Five minutes, three steps, nothing to install - a chart of the sample data in the designer, then the report as a reader sees it.
---

# Quick start

Three steps, in the demo: smaltbi runs in your browser, so there is nothing to install.

## 1. Open the demo

<a href="../designer.html?report=examples/sales/report.json" target="_self">Open the designer with the sample report</a>:
a small coffee and tea retailer, with sales, products, stores and customers. The **Fields** pane on the left lists its
tables. The canvas shows the report's first page.

Click **+** at the end of the page tabs for a new, empty page.

## 2. Add two visuals

1. In **Fields**, open **Products** and **Sales**. Hold Ctrl (⌘ on a Mac) and click **category**, then **Revenue**.
   The pane says "2 fields selected": choose **Add**. You get a bar chart of revenue by category: the first category
   field goes on the axis and the measure becomes its values.
2. Press Esc to deselect the chart, then click **Units**. A field clicked with nothing selected starts a visual of its
   own: a measure makes a KPI card.

Drag a visual by its **⠿** grip to move it, and by its corner to resize it. The side panel on the right changes its type,
fields, format, filters and SQL.

## 3. Read it as a reader would

Click **▶ Preview**. Now click a bar: the card filters to that category. Ctrl-click (⌘-click) another bar to add it
to the selection. Click a bar that is the only one selected to clear it. **✎ Back to editing** returns to the designer.

## Next

- [Getting started](./): run smaltbi on your own computer, and build a report from your own files.
- [Working in the app](./data): data, the model, visuals, pages, themes and publishing.
- [The report format](../reference/report): the file the designer saves.
