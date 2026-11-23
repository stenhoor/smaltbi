---
description: "Relationships, measures, calculated columns, hierarchies, roles, date tables and what-if parameters."
---

# Model

```jsonc
"model": {
  "relationships": [
    { "from": "sales.customer_id", "to": "customers.id" },                     // many → one
    { "from": "sales.ship_date", "to": "calendar.date", "role": "Ship date" }   // a role (below)
  ],
  "measures": [
    { "table": "sales", "name": "Revenue", "sql": "SUM(sales.quantity * sales.unit_price)", "format": "currency0" },
    { "table": "sales", "name": "Margin %", "sql": "([Revenue] - [Cost]) / NULLIF([Revenue], 0)", "format": "percent" },
    { "table": "sales", "name": "Revenue 2025", "sql": "SUM([Line Revenue]) FILTER (WHERE sales.order_date >= '2025-01-01')" }
  ],
  "columns": [
    { "table": "sales", "name": "Month", "sql": "strftime('%Y-%m', sales.order_date)", "type": "date", "format": "month" },
    { "table": "sales", "name": "Month Name", "sql": "…", "sortBy": "order_date" }
  ],
  "hierarchies": [ { "table": "sales", "name": "Date", "levels": ["Year", "Quarter", "Month"] } ],
  "tables": {
    "sales": { "label": "Sales", "hidden": false, "columns": { "id": { "hidden": true }, "discount": { "format": "percent" } } }
  },
  "layout": { "sales": { "x": 368, "y": 40 }, "customers": { "x": 696, "y": 40 } },  // model diagram positions (display only)
  "dateTable": { "table": "calendar", "column": "date", "source": "sales.order_date",   // written by "Add date table"
                 "fiscalStart": 7, "weekStart": 1, "isoWeeks": true },
  "parameters": [                                            // what-if values, used as [@Name]
    { "name": "Growth", "type": "number", "value": 0.1, "min": 0, "max": 0.5, "step": 0.05, "format": "percent" },
    { "name": "Region", "type": "text", "value": "Europe", "choices": ["Europe", "North America"] }
  ]
}
```

- **Field references** are `"table.name"`, where `name` is a column, calculated column, measure or
  hierarchy of that table. The first dot separates the table.
- **`[Name]`** inside measure or column SQL inlines a measure (searched model-wide) or a calculated
  column (of the same table, or `[table.Name]`). Other bracketed text is left alone.
- **Roles** (role-playing dimensions): a relationship with a `role` makes its `to` table appear a second time under
  that name, joined through this relationship: `calendar` for the order date and `Ship date` for the ship date. Refer
  to its fields as `"Ship date.month"`; its columns and hierarchies are the table's own. Only the table itself is
  repeated: tables beyond it are still reached through the original. A role name can't be a table's name or contain
  a dot.
- **`[@Name]`** inside measure or column SQL is a **parameter**: a value readers change with a Parameter control
  visual (a slider for a number with `min` and `max`, a number box, a dropdown for text with `choices`, or a text
  box). It runs as a literal of the current value: the reader's choice, kept inside `min`/`max` or `choices`, or else
  `value`. Custom visual SQL can use `[@Name]` too. The reader's values are part of the view state (`params`, in
  the URL), like slicers.
- **Quick measures** for time intelligence carry `time` instead of SQL (`sql` stays empty):
  `{ "table": "sales", "name": "Revenue YTD", "sql": "", "time": { "of": "sales.Revenue", "calc": "ytd" } }`.
  `calc` is `ytd`, `qtd` or `mtd` (to date; years and quarters follow the date table's fiscal year), `py` (the same
  dates last year), `yoy` / `yoy%` (change vs last year), `pm` / `pq` (the period moved back one or three months,
  whole months), or `rolling` (the last `months` months, default 3). They need `dateTable`, a base measure over its
  source's table, and a date-table field on the visual or a date-table filter to give each row its period. They
  can't be used inside another measure's SQL, and filters on them are not applied.
- **Measures** must be aggregates. A plain column dropped on a value well is aggregated implicitly
  (`SUM` for numbers, `COUNT` otherwise; changeable per visual).
- **Measures of several facts** in one visual (Revenue from `sales` beside Target from `budget`): each fact's
  measures are computed on their own, grouped by the visual's fields, and lined up by them (drill-across, [ADR 0009](/adr/0009-many-to-many)).
  - The fields must be ones every fact reaches (a category both relate to). A field only one fact has is refused,
    naming it.
  - A measure that combines facts is written from measures, `[Revenue] / [Target]`, and is computed after the
    line-up. `SUM(sales.x) / SUM(budget.y)` mixes the facts inside one aggregate and is refused.
  - Filters apply to each fact they reach. A filter on a measure tests its lined-up value.
  - Time-intelligence measures can't yet sit beside another fact's measures.
- **`sortBy`** sorts a column by another column of the same table (month names by month number).
- **Types**: `number`, `text`, `date`, `datetime`, `bool`, `any`. Introspection detects ISO date strings.
- Without `relationships`, foreign keys declared in the database are used.
- **`dateTable`** records the calendar that "Add date table" (model view) created: a SQL data step (the last one) that
  builds a row per day over whole (fiscal) years around `source`'s dates, a relationship `source → table.date`, the
  hierarchies *Calendar* (year › quarter › month › date), *Fiscal calendar* (when `fiscalStart` isn't 1; a fiscal
  year is named by the year it ends in, e.g. FY2025 for July 2024 – June 2025) and *ISO weeks* (with `isoWeeks`), and
  the columns' labels and sort order. `weekStart` is 1 for Monday weeks or 0 for Sunday weeks.
- Relationships must be **unambiguous**: two active paths between the same tables (for example
  `sales → customers` and `sales → stores → customers`) make queries that cross them fail with an
  explanation. Set `"active": false` on one of them.
- **Link tables** (many-to-many, [ADR 0009](/adr/0009-many-to-many)): a table with two or more relationships out, no measures and no numbers
  besides its keys, such as `product_tags` (product_id → products, tag_id → tags). Queries pass through it where no
  plain relationship reaches the table they need:
  - Revenue by tag counts each sale once in each of its tags, through the link's distinct pairs. Totals count it once.
  - A filter on a tag is a semi-join, so no sale is counted twice.
  - Part-to-whole visuals by a field beyond a link (pie, donut, treemap, funnel, waterfall, 100% stacked) say that
    their parts overlap. A donut's centre shows the true total, from a query of its own.
  - The model view marks a link table "⇄ link".
- A relationship's `to` column must be **unique** (one row per value), or each `from` row would be counted once per
  repeat. When the data loads, each relationship's target column is checked (declared primary keys pass without
  looking). The model view marks one with repeated values, and visuals with measures through it fail with an
  explanation; lists of values (slicers) still work.
- The fix for a different grain (a budget by category related to `products.category`): a table with one row per
  value. **Make a ⟨column⟩ table**, in the relationship's panel, adds it as a data step. The step builds the table from
  both columns' values, cast to one type, so a year that is text on one side and a number on the other is one value.
  The flagged relationship then points at the new table, and the original column gets a relationship to it too.
  After that, the budget and the sales are two facts sharing a dimension, lined up by drill-across. The sample's
  budget does this for category and for year (Targets page).
- Replacing the date table keeps its step where it was, so a step that reads the calendar still runs after it.
  Removing the date table is refused while another step reads it.

In the designer: [The model](/guide/model). How values are shown: [Formats](./formats).
