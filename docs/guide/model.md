---
description: "Relate tables, write measures and calculated columns, add a date table, quick measures, roles and what-if parameters."
---

# The model

Switch to **Model** for the diagram of your tables. The model is what turns tables into fields you can chart: how
tables relate, and the measures and columns you add.

## Relationships

Drag a column onto another table's key to relate them: many rows on one side, one on the other. A visual that uses
fields of both tables joins along the relationship. Select a line and press Delete to remove it.

To use one table two ways, such as one calendar for both order date and ship date, add the second relationship and
give it a *Role* name in its panel (for example "Ship date"). The table then appears a second time under that name in
the fields.

## Measures

A measure is a SQL aggregate: right-click a table in *Fields*, *New measure…*.

```sql noplay
SUM(sales.quantity * sales.unit_price)
```

- Measures can use each other by name: `[Revenue] - [Cost]`.
- The editor completes tables, `table.` columns and `[` measures from the model (Ctrl+Space), and underlines
  references that don't exist.
- **Test** (Ctrl+Enter) runs the expression; **Save** adds the measure.

*New calculated column…* adds a column computed for each row, from the same menu.

## Date table and quick measures

*Add date table* creates a calendar related to a date column, with Year › Quarter › Month › Date to drill, and
optionally fiscal years, Sunday weeks and ISO weeks.

Then right-click a measure, *Quick measure…*, for year to date, same period last year (and the change vs it),
previous month or quarter, or rolling months: no SQL to write.

## What-if parameters

*Parameters…* in the model view adds what-if values (a growth rate, a target) that measures use as `[@Growth]`. A
*Parameter* visual on the page lets readers change them with a slider or a dropdown, and every visual follows.

## In `report.json`

The model is `model`: [Report format, model](/REPORT_FORMAT#model).

```json
{
  "relationships": [{ "from": "sales.product_id", "to": "products.id" }],
  "measures": [{ "table": "sales", "name": "Revenue", "sql": "SUM(sales.quantity * sales.unit_price)" }]
}
```
