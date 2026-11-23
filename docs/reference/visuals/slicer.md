---
description: "A filter readers click: a list, dropdown, buttons, a range or a search box."
---

# Slicer

A filter readers click: a list, dropdown, buttons, a range or a search box.

In `report.json`: `"type": "slicer"`.

## Fields

Wells in the designer's Build tab; `fields` in `report.json`, by role.

| Role | Well | Takes | At most |
|---|---|---|---|
| `field` | Field | fields to group by | 1 |

## Options

In the Format tab; `options` in `report.json`.

| Option | Label | Values | Default |
|---|---|---|---|
| `style` | Style | `"list"` (List), `"dropdown"` (Dropdown), `"buttons"` (Buttons), `"range"` (Range (between)), `"search"` (Search (contains)) | `"list"` |
| `single` | Single selection | `true`, `false` | `false` |
| `sync` | Apply to all pages | `true`, `false` | `false` |

## See also

- [Visuals](/guide/visuals), [filters](/reference/format/filters)
- [All visual types](./)
