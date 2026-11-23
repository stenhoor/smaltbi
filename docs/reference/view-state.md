# View state

How a report is being looked at, apart from what it is: the page, the selections, the drill levels, a drill-through,
the parameter values. The viewer keeps it in the URL, and a bookmark saves one.

```jsonc
"bookmarks": [
  { "name": "Europe only", "state": {
      "page": "overview",
      "selections": { "s-region": [ { "field": "stores.region", "op": "in", "values": ["Europe"] } ] },
      "drill": { "c-date": { "level": 1, "path": { "0": "2025" } } }
  } }
]
```

## Fields

| Field | Type | Meaning |
|---|---|---|
| `page` | string | The page's `id`. |
| `selections` | object | By visual id: its cross-filters and slicer values, as [filters](./filters). |
| `drill` | object | By visual id: `level`, the index of the level shown, and `path`, the values the upper levels are filtered to, by level index. |
| `drillthrough` | object | The filters a drill-through set on the page, and `from`, where it came from. |
| `params` | object | Parameter values the reader set, by name; the rest keep their defaults. |

## In the URL

The viewer keeps the current state in the URL as `#s=<base64url JSON>`, with the same shape: copy the address to share
exactly what you see.

## Bookmarks

`bookmarks` in the [report](./report) is a list of `{ name, state }`. Readers open them from **☆ Bookmarks** in the
viewer bar.

## See also

[Reading a report](../guide/reading) · [Filters](./filters)
