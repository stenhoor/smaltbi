# Model

The model says how the tables relate and what to measure. Its tables and columns come from the database; on top of
them you add relationships, measures, calculated columns, hierarchies, display names and formats.

## The model view

Switch to **Model** for the diagram of your tables: cards with their columns (key badges, types, calculated columns,
measure and hierarchy counts, row counts) and lines between the joined columns, marked `*` and `1`, with the filter's
direction.

- **Relate tables:** drag a column onto another table's key. *Detect relationships* finds them from column names and
  keys.
- **A relationship's line:** click it to make it inactive, swap its ends or delete it (Delete).
- **Arrange:** drag cards; their positions are saved with the report. *Auto layout*, zoom (Ctrl+wheel) and fit.
- **Ambiguous paths** (two active ways between the same tables) are flagged: make one inactive.

## Measures

A measure is an SQL aggregate: `SUM(sales.quantity * sales.unit_price)`. Measures can use each other: `[Revenue] -
[Cost]`. The editor completes tables, `table.` columns and `[` measures from the model, underlines references that
don't exist, and Ctrl+Enter tests the expression.

A plain number column dropped on a visual's value well is aggregated for you (`SUM` for numbers, `COUNT` otherwise),
and the aggregation can be changed per visual.

## Calculated columns and hierarchies

A calculated column is a row-level SQL expression over the table's columns: `strftime('%Y-%m', sales.order_date)`. A
hierarchy lists columns from the top level down (Year › Quarter › Month) and makes a visual's axis drillable.

## Date table and quick measures

*Add date table* creates a calendar related to a date column, with Year › Quarter › Month › Date to drill, and
optionally fiscal years, Sunday weeks and ISO weeks. Then right-click a measure, *Quick measure…*, for year to date,
same period last year (and the change vs it), previous month or quarter, or rolling months: no SQL to write.

## Roles

To use one table two ways, such as one calendar for both order date and ship date, add the second relationship and
give it a *Role* name in its panel (for example "Ship date"). The table then appears a second time under that name in
the fields.

## Parameters

*Parameters…* in the model view adds what-if values (a growth rate, a target) that measures use as `[@Growth]`. A
*Parameter* visual on the page lets readers change them with a slider or a dropdown, and every visual follows.

## What's next

- [Visuals](./visuals): put fields on the canvas.
- [The model in the report format](../reference/model): every rule, including many-to-many and several facts in one
  visual.
