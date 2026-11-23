---
description: "Build a report from two CSV files: load them, relate them, write a measure, chart it and publish it."
---

# Tutorial: your first report

You build a report from the sample's CSV files: sales and products. It takes about fifteen minutes in
<a href="../designer.html" target="_self">the designer</a>. The finished `report.json` is at the end; the
[tests](https://github.com/stenhoor/smaltbi/blob/HEAD/test/docs.test.ts) open it and run every visual in it.

## 1. Start a report and load the data

1. *File → New report*.
2. Open **Data** in the top bar. Under *Add a file from a URL*, enter `examples/sales/data/sales.csv`. The table name
   fills in as `sales`. Click **Add**.
3. Add `examples/sales/data/products.csv` the same way, as `products`.
4. Click **Apply**. smaltdb loads both files, in your browser.

Paths are relative to the report; a new report sits beside the designer. Files on your computer work too: *Choose a
file…* keeps them in this browser and publishing copies them. More in [Data](./data).

## 2. Relate the tables and write a measure

1. Switch to **Model**. The diagram shows both tables.
2. Drag `product_id` in the sales card onto `id` in the products card. The line between them is the relationship:
   many sales to one product.
3. In the *Fields* pane, right-click **sales** and choose *New measure…*. Name it `Revenue` and write:

   ```sql noplay
   SUM(sales.quantity * sales.unit_price * (1 - sales.discount))
   ```

   **Test** (Ctrl+Enter) runs it. **Save** adds it under sales, as *Revenue*.

Measures are SQL aggregates, and can use each other by name: `[Revenue] / COUNT(DISTINCT sales.id)`. More in
[The model](./model).

## 3. Build the page

1. Switch back to **Report**. Click an empty part of the canvas, then click **Revenue**: a card with the total.
2. Click the canvas again. Ctrl-click (⌘-click on a Mac) **Revenue** and **category** (under products), then click
   **Add**: a bar chart of revenue by category.
3. Click the canvas, then **category**: a table of the categories. Change its type to *Slicer* in the side panel.
   Click a category in it: the card and the chart follow.
4. Double-click the page's tab and name it `Overview`.

## 4. Preview and publish

1. **Preview** shows the report as a reader sees it. **Edit** goes back.
2. **Publish** downloads a ZIP: the viewer, the engine, your `report.json` and its data. Unzip it on any static host,
   or open it with `npm run serve <folder>`. More in [Publishing](./publishing).

## The finished report

This is the file the tutorial builds, give or take the layout and the ids the designer picks:

```json
{
  "smaltbi": 1,
  "name": "My first report",
  "data": {
    "steps": [
      { "import": "examples/sales/data/sales.csv", "table": "sales", "format": "csv" },
      { "import": "examples/sales/data/products.csv", "table": "products", "format": "csv" }
    ]
  },
  "model": {
    "relationships": [{ "from": "sales.product_id", "to": "products.id" }],
    "measures": [{ "table": "sales", "name": "Revenue", "sql": "SUM(sales.quantity * sales.unit_price * (1 - sales.discount))" }]
  },
  "theme": "smalt",
  "pages": [
    {
      "id": "page1",
      "name": "Overview",
      "visuals": [
        { "id": "v1", "type": "card", "layout": { "x": 0, "y": 0, "w": 3, "h": 2 }, "fields": { "values": ["sales.Revenue"] } },
        { "id": "v2", "type": "bar", "layout": { "x": 3, "y": 0, "w": 6, "h": 4 }, "fields": { "category": ["products.category"], "values": ["sales.Revenue"] } },
        { "id": "v3", "type": "slicer", "layout": { "x": 9, "y": 0, "w": 3, "h": 4 }, "fields": { "field": ["products.category"] } }
      ]
    }
  ]
}
```

Open it in the designer: save it as `report.json` beside the designer and go to `designer.html?report=report.json`.
