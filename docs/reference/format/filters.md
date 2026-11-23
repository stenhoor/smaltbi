---
description: "Filters on the report, a page or a visual: operators, top N, measures and SQL."
---

# Filters

```jsonc
{ "field": "products.category", "op": "in", "values": ["Tea", "Coffee"] }
{ "field": "sales.order_date", "op": "between", "values": ["2025-01-01", null] }   // open-ended
{ "field": "products.name", "op": "top", "values": [10], "by": "sales.Revenue" }   // [10, "bottom"] for bottom N
{ "field": "sales.Revenue", "op": "gt", "values": [1000] }                          // on a measure: HAVING
{ "op": "tuples", "fields": ["products.category", "customers.segment"], "tuples": [["Tea", "Consumer"]] }
{ "op": "sql", "sql": "sales.quantity * sales.unit_price > 50" }
```

Operators: `in`, `not-in`, `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `between`, `contains`,
`starts-with`, `is-null`, `not-null`, `top`, `tuples`, `sql`. `null` in `values` means blank.

Report filters are the report's `filters`, page filters a page's, visual filters a visual's. Slicers and clicks between visuals add filters while a reader works: [Bookmarks and view state](./bookmarks).
