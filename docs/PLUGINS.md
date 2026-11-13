# Plugins

## Policy

smaltbi's core depends on smaltdb and nothing else at run time. Before any third-party package is
used, it is evaluated as a **plugin**:

1. Can it be done in a few hundred lines of our own code? Then write it (the zip writer, the treemap
   layout and the markdown subset are examples).
2. Otherwise it becomes a plugin: an ES module, loaded only when a report asks for it, that talks to
   smaltbi through a documented API. Its license stays with it; the core stays MIT and small.
3. Server-side features (refresh schedules, sharing, sign-in, row-level security) are plugins or a
   wrapper environment around the static app, never core.

## Visual plugins

A plugin is **one ES module file** with no imports ([ADR 0008](adr/0008-plugin-loading.md)). It exports `setup(api)`,
and smaltbi calls it with everything the plugin needs. A visual is a `VisualDef`, the same definition the built-in
visuals use (`src/visuals/`), so a plugin visual is a peer of a bar chart. A complete example is
[`examples/plugins/bullet.js`](https://github.com/stenhoor/smaltbi/blob/main/examples/plugins/bullet.js).

```js
export default {
  name: 'Acme visuals',
  apiVersion: 1,
  setup(api) {
    const { esc, columnChart } = api.kit;
    api.registerVisual({
      type: 'acme.bullet', // namespaced: "<your name>.<visual>"
      label: 'Bullet chart',
      icon: '<svg viewBox="0 0 24 24">…</svg>',
      roles: [
        { name: 'category', label: 'Category', kind: 'dimension', max: 1 },
        { name: 'values', label: 'Value', kind: 'measure', max: 1 },
        { name: 'target', label: 'Target', kind: 'measure', max: 1 },
      ],
      options: [api.options.labels],
      sort: 'value',
      render(ctx) {
        // Build SVG for ctx.width × ctx.height. Marks get class "sk-mark sk-c0" and data-row="<row index>" to take
        // part in cross-filtering, tooltips and drill.
        ctx.el.innerHTML = '<svg class="sk-svg" …>…</svg>';
        // Or reuse a smaltkit chart: columnChart(api.chartContext(ctx));
      },
    });
  },
};
```

What `api` holds:

| Field | Meaning |
|---|---|
| `apiVersion` | The plugin API version smaltbi offers (1). A plugin that sets a higher `apiVersion` is not loaded. |
| `registerVisual(def)` | Add a visual. Its `type` must be namespaced (`acme.bullet`) and new; it shows at the end of the gallery. |
| `kit` | smaltkit: charts (`columnChart`, …), tables, formatting, SVG helpers (`esc`, `linear`, `band`, `r2`), DOM helpers. |
| `chartContext(ctx)` | The smaltkit chart context for a render context, to draw with a smaltkit chart. |
| `options.legend`, `options.labels` | The shared Legend and Data labels options. |

What a visual gets in `render(ctx)`:

| Field | Meaning |
|---|---|
| `el`, `width`, `height` | The frame body to draw into, and its size |
| `data` | Columnar result: `data.role(name)` → columns with `values`, `label`, `fmt` (formatter), `field` |
| `extra` | Results of additional queries from `plan()` |
| `options` | The visual's options merged with defaults |
| `palette` | Number of palette colors (use classes `sk-c0` … `sk-c{n-1}`) |
| `selected(row)` | `null` when nothing in this visual is selected, else whether the row is |
| `api.select(row, additive)` | Cross-filter (usually not needed: clicks on `[data-row]` are handled) |
| `api.setFilters(filters)` | For slicer-like visuals: replace this visual's filters on the page |
| `api.query(spec)` | Run another query (e.g. to populate a control) |
| `api.drill(row)` | Drill down from a row |

Optional `plan(ctx)` returns `{ main, extra }` query specs built from `ctx.fields` (resolved fields per
role), `ctx.pick(...roles)`, and `ctx.aggregate(field, agg)`. Without it, the default plan groups by
all dimension roles and aggregates all measure roles.

Style marks with the theme's variables (`var(--c)` is the series color on `sk-cN` elements, plus
`--sk-text`, `--sk-muted`, `--sk-grid`, …) so the visual follows every theme and dark mode.

### Loading plugins

In the designer, **File → Plugins…** adds a plugin by URL: smaltbi fetches it, records its hash and loads it. In the
report it is listed as:

```json
"plugins": [{ "url": "https://plugins.example.com/acme-visuals-1.2.0.js", "integrity": "sha384-…" }]
```

- **Pinned:** the file must match its hash; if it changes, it no longer loads. Publish a new file (a new name) for a
  new version.
- **CORS:** the plugin's host must allow cross-origin requests (`Access-Control-Allow-Origin`), since smaltbi fetches
  the file to check it.
- **Asking:** a report from another site asks the reader before its plugins run (the answer is remembered for that
  URL and hash). A published report carries copies of its plugins (`plugins/` in the site), so its readers are not
  asked.
- **Failures:** a plugin that fails to load never stops the report; its visuals say the plugin is missing.

## Other plugin kinds (planned)

| Kind | Purpose | Examples |
|---|---|---|
| Visual | New chart types | Maps (with GeoJSON/TopoJSON), Sankey, Gantt, box plot |
| Data connector | New data step kinds | REST/JSON APIs with paging, Google Sheets, SQL servers via a proxy |
| Expression language | Alternative to SQL measures | A DAX-like formula language compiled to SQL |
| Export | Output formats | PDF/PNG export, PowerPoint |
| Host | Server-side wrapper | Scheduled refresh, sharing and permissions, row-level security |
