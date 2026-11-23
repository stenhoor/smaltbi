# Visual

A visual on a page: its type, where it sits on the grid, the fields in its roles, and its options.

```jsonc
{
  "id": "c-date",
  "type": "column",
  "title": "Revenue over time", "subtitle": "Double-click to drill down",
  "layout": { "x": 0, "y": 3, "w": 8, "h": 5 },
  "fields": { "category": ["sales.Date"], "values": ["sales.Revenue"] },
  "options": { "stack": "none", "labels": false },
  "filters": [ … ],
  "sort": [ { "by": "values:0", "dir": "desc" } ],
  "limit": 50,
  "sql": "SELECT …",
  "interactions": { "filterOthers": true, "filteredByOthers": true },
  "style": { "surface": "#ffffff" },
  "phone": { "hidden": false, "h": 4 },
  "repeat": { "field": "products.category", "columns": 4, "max": 24, "order": "asc" },
  "conditional": [ … ]
}
```

## Fields

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Unique in the report. |
| `type` | string | A [visual type](./visual-types): `bar`, `table`, … or a plugin's `acme.bullet`. |
| `title`, `subtitle` | string | Shown above the visual. |
| `layout` | `{ x, y, w, h }` | Grid cells: columns from the left, rows from the top, width and height. |
| `fields` | object | Roles (`category`, `values`, `series`, …) to [field references](#fields-in-roles). |
| `options` | object | The type's options; unset ones take their defaults. [Visual types](./visual-types). |
| `filters` | array | Filters on this visual only. [Filters](./filters). |
| `sort` | array | `{ by, dir }`: `by` is a role and index (`"values:0"`) or a field reference; `dir` is `asc` or `desc`. |
| `limit` | number | The most rows the query returns (its `LIMIT`); a type may have a default of its own. |
| `sql` | string | Custom SQL that replaces the generated query. Output columns map to roles by the fields' labels. |
| `interactions` | object | `filterOthers: false` keeps clicks in it from filtering the page; `filteredByOthers: false` keeps it from being filtered by them. |
| `style` | object | Theme tokens for this visual only, by variable name without `--sb-`: `{ "surface": "#fff8e6" }`. [Themes](./themes#per-visual-overrides). |
| `phone` | `{ hidden, h }` | On phones: leave it out, or give it its own height in rows. [Page](./page#on-phones). |
| `repeat` | object | A copy per value of a field (below). |
| `conditional` | array | Conditional formatting (below). |

## Fields in roles

A field is a reference, `"table.name"` (a column, calculated column, measure or hierarchy), or an object:

```json
{ "field": "sales.quantity", "agg": "avg", "label": "Avg qty", "format": "decimal" }
```

`agg` is `sum`, `avg`, `min`, `max`, `count`, `countd` (distinct) or `none`. `label` names it in the visual, and in
custom SQL's output. `format`: [Formats](./formats).

## repeat

**Repeat for each** (any visual with data fields): the visual becomes a grid of copies, one per value of `field` (a
dimension), each filtered to its value and titled with it: a card for each product category, a chart for each region.
`columns` sets the grid (else automatic), `max` the number of copies (default 24; a note says how many more there
are), `order` `asc` or `desc`. The grid can be shaped further:

- `copy`: each copy is at least `w` columns and `h` rows of the page grid (the gaps between them included; without
  `h`, 90 px with the copy's title). On a phone, where the page is one column, a cell is measured at the page's own
  width, so copies keep their size and fewer fit across. The copy's width lowers the number of columns, `columns`
  included.
- `minColumns` and `minRows`: at least this many copies across and rows in view. They win over `copy`: the copies
  shrink to fit them (rows down to 20 px).
- `maxColumns` and `maxRows` cap the grid. Copies past `maxColumns × maxRows` are not shown; the note counts them.
  `maxColumns` is applied last.
- `overflow`: when the rows don't fit, `scroll` (the default) scrolls inside the visual; `expand` grows the visual to
  show every row at the copy's height, and the visuals below it move down (those beside it stretch with it).
  `maxHeight` (grid rows) is the most it grows to, the visual's own height included; past that it scrolls. Without
  `columns`, an expanding grid has as many columns as fit at the copy's width (else 1.4 × its height). The visual
  grows in the viewer and the designer's Preview, and on the designer's canvas it scrolls. Expand is for responsive
  pages: a fixed-size page keeps its size, so there the copies scroll, and the designer offers Expand only on
  responsive pages.

The data is one query grouped by the field as well, so a click in a copy selects that value too (the bar *and* its
region). Each copy has its own scale; for one shared scale across charts, use the cartesian charts' `multiples` field.

## conditional

Conditional formatting (tables, matrices and KPI cards) colours measure values and adds icons. The first rule that
matches a value wins.

```jsonc
"conditional": [
  { "apply": "sales.Revenue", "op": "lt", "compare": "sales.Revenue LY", "tone": "bad", "icon": "down" },
  { "apply": "*", "op": "gt", "value": 100000, "tone": "good", "fill": true }
]
```

| Field | Meaning |
|---|---|
| `apply` | The measure values it formats: a measure field of the visual, or `"*"` for all. |
| `test` | What is tested: the value itself (default), or another measure in the same row. |
| `op` | `gt`, `gte`, `lt`, `lte`, `eq`, `ne`, `between`, `positive`, `negative` or `blank`. |
| `value`, `value2` | The number to compare with (`between`: from `value` to `value2`). |
| `compare` | Or another measure to compare with, in the same row ("by measure"). |
| `tone` | `good`, `bad`, `warn` or `accent`: the text colour. |
| `fill` | Colour the background with the tone, not the text. |
| `icon` | `up`, `down`, `flat`, `check`, `cross`, `warn` or `dot`. |

Measures that a rule tests or compares with but the visual doesn't show are fetched with its data.

## See also

[Visuals in the guide](../guide/visuals) · [Visual types](./visual-types) · [Filters](./filters) · [Page](./page)
