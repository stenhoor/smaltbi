# Filters

A filter limits the rows a visual sees. Filters sit on the report (every page), a page (its visuals) or one visual;
cross-filter selections and slicers are filters too, kept in the [view state](./view-state).

```jsonc
{ "field": "products.category", "op": "in", "values": ["Tea", "Coffee"] }
{ "field": "sales.order_date", "op": "between", "values": ["2025-01-01", null] }   // open-ended
{ "field": "products.name", "op": "top", "values": [10], "by": "sales.Revenue" }   // [10, "bottom"] for bottom N
{ "field": "sales.Revenue", "op": "gt", "values": [1000] }                          // on a measure: HAVING
{ "op": "tuples", "fields": ["products.category", "customers.segment"], "tuples": [["Tea", "Consumer"]] }
{ "op": "sql", "sql": "sales.quantity * sales.unit_price > 50" }
```

## Fields

| Field | Type | Meaning |
|---|---|---|
| `field` | string | The field it tests: a column, or a measure (then it filters groups, as `HAVING`). |
| `op` | string | The operator (below). |
| `values` | array | What it compares with. `null` means blank. |
| `fields`, `tuples` | arrays | For `tuples`: several fields matched together, a row of values each. |
| `by` | string | For `top`: the measure to rank by. |
| `sql` | string | For `sql`: a boolean SQL expression. |
| `locked` | boolean | Shown in the filter pane, but readers can't change it. |
| `label` | string | Its name in the filter pane. |

## Operators

| `op` | Keeps rows where the field… |
|---|---|
| `in`, `not-in` | is, or isn't, one of `values` |
| `eq`, `ne`, `gt`, `gte`, `lt`, `lte` | compares so with `values[0]` |
| `between` | is from `values[0]` to `values[1]`; `null` leaves that end open |
| `contains`, `starts-with` | contains, or starts with, the text `values[0]`, ignoring case |
| `is-null`, `not-null` | is, or isn't, blank |
| `top` | is among the first `values[0]` by `by` (`[n, "bottom"]` for the last n) |
| `tuples` | matches one of `tuples` across `fields` (a cross-filter selection) |
| `sql` | makes `sql` true |

## See also

[Report](./report) · [Page](./page) · [Visual](./visual) · [View state](./view-state)
