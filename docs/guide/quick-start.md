---
description: "Five minutes, three steps, nothing to install: change a report in the designer and see it as a reader does."
---

# Quick start

Five minutes, three steps, nothing to install. You change the sample report, a small coffee and tea retailer, in the
designer that runs in this site.

## 1. Open the designer

<a href="../designer.html?report=examples/sales/report.json" target="_self">Open the sample in the designer</a>. It
loads five years of sales into smaltdb, in your browser, and draws the Overview page. Nothing leaves the page.

## 2. Add a chart

1. Click an empty part of the canvas, so nothing is selected.
2. In the *Fields* pane on the left, Ctrl-click (⌘-click on a Mac) **Revenue** under *Sales*, then **category** under
   *Products*. The pane says *2 fields selected*.
3. Click **Add** beside it. A bar chart of revenue by category joins the page.
4. Click a bar. The other visuals on the page filter to that category; click it again to clear.

The side panel on the right changes the chart's type, its fields and its format. Its *SQL* tab shows the one query the
chart runs.

## 3. See it as a reader does

Click **Preview** in the top bar. This is the report as the viewer shows it: pages as tabs, the same filters, no
editing. **Edit** goes back. To keep your change, *File → Save report file* (Ctrl+S) downloads the report as one JSON
file.

Next: [Getting started](./getting-started) runs smaltbi on your own computer, and the [tutorial](./tutorial) builds a
report from CSV files.
