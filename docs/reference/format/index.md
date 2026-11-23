---
description: "A report is one JSON file: its data steps, model, pages, visuals, filters and bookmarks, section by section."
---

# Report format

A report is one JSON file (by convention `*.smaltbi.json` or `report.json`). The TypeScript
definitions in [`src/core/types.ts`](../../../src/core/types.ts) are the reference; these pages explain them.
The sample, [`examples/sales/report.json`](../../../examples/sales/report.json), uses nearly every feature.

```jsonc
{
  "smaltbi": 1,                 // format version
  "name": "Sales",
  "description": "…",
  "data": { … },                // how to build the database
  "model": { … },               // relationships, measures, columns, hierarchies, display settings
  "theme": "smalt",             // built-in name, a URL/path to a .theme.json, or an inline theme
  "filters": [ … ],             // report-level filters (every page)
  "pages": [ … ],
  "bookmarks": [ … ],
  "plugins": [ { "url": "plugins/bullet.js", "integrity": "sha384-…" } ],   // optional: ADR 0008, docs/PLUGINS.md
  "branding": { "poweredBy": true }   // the "Powered by smaltbi" badge in the viewer (default true)
}
```

Relative paths (data files, theme files, plugins, map shapes) resolve against the report file's URL. Each plugin is one ES module
file pinned by its SRI hash: it loads only if the file matches, and a report from another site asks before its
plugins run ([Plugins](/PLUGINS)).

## Sections

- [Data](./data): `data`, the steps that build the database.
- [Model](./model): `model`, relationships, measures, calculated columns, hierarchies and parameters.
- [Formats](./formats): number and date formats, for measures, columns and fields.
- [Pages](./pages): `pages`, with their size and their layout on phones.
- [Visuals](./visuals): a page's `visuals`, their fields and options.
- [Repeat for each](./repeat): a visual repeated for each value of a field.
- [Conditional formatting](./conditional): colours and icons by value, in tables, matrices and cards.
- [Chart axes](./axes): the axis options and reference lines of bar, column, line, area and combo charts.
- [Filters](./filters): report, page and visual `filters`.
- [Bookmarks and view state](./bookmarks): saved views, and the state in the viewer's URL.

Every visual type's fields and options: [Visual types](/reference/visuals/).

## Compatibility

`smaltbi: 1` is the format version. Until 1.0, fields may still change; a migration function will
upgrade older files when the format changes.
