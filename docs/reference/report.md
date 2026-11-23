# Report

The top level of a report file: a JSON object with the format version, the data, the model, the theme and the pages.

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
  "plugins": [ { "url": "plugins/bullet.js", "integrity": "sha384-…" } ],
  "branding": { "poweredBy": true }
}
```

## Fields

| Field | Type | Meaning |
|---|---|---|
| `smaltbi` | `1` | The format version. A file without it isn't a report. |
| `name` | string | The report's title. |
| `description` | string | Optional. |
| `data` | object | How the report's database is built. [Data](./data). |
| `model` | object | Relationships, measures, calculated columns, hierarchies, display settings. [Model](./model). |
| `theme` | string or object | A built-in theme's name (`smalt`, `paper`, `midnight`), a path or URL to a `.theme.json`, or a theme inline. [Themes](./themes). |
| `filters` | array | Filters on every page. [Filters](./filters). |
| `pages` | array | The pages, in tab order. [Page](./page). |
| `bookmarks` | array | Saved views. [View state](./view-state). |
| `plugins` | array | Plugin files, each `{ url, integrity, name? }`: an ES module by URL (absolute, or relative to the report), pinned by its SRI hash (`sha384-…`); `name` is shown in place of the plugin's own. [Plugin API](./plugin-api). |
| `branding.poweredBy` | boolean | The "Powered by smaltbi" badge in the viewer. Default `true`. |

## Notes

- By convention a report file is named `*.smaltbi.json` or `report.json`.
- **Relative paths** (data files, theme files, plugins, map shapes) resolve against the report file's URL.
- A plugin loads only if its file matches its hash, and a report from another site asks the reader before its
  plugins run.
- **Compatibility:** `smaltbi: 1` is the format version. Until 1.0, fields may still change; a migration function
  will upgrade older files when the format changes.

## Example

The sample, [`examples/sales/report.json`](../../examples/sales/report.json), uses nearly every feature:
<a href="../designer.html?report=examples/sales/report.json" target="_self">open it in the designer</a>.

## See also

[Data](./data) · [Model](./model) · [Page](./page) · [Getting started](../guide/)
