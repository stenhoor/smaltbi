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

## Visual plugins (available now)

A visual is a `VisualDef` registered with `registerVisual()`. The built-ins use exactly this API
(`src/visuals/`), so a plugin visual is a peer of a bar chart.

```ts
// Today: import from src/visuals/api.ts (a published 'smaltbi/visuals' entry point is planned).
import { registerVisual, type VisualDef } from 'smaltbi/visuals';

const bullet: VisualDef = {
  type: 'acme.bullet',
  label: 'Bullet chart',
  group: 'plugin',
  icon: '<svg viewBox="0 0 24 24"><path d="M3 9h14v6H3zM19 7h2v10h-2z"/></svg>',
  roles: [
    { name: 'category', label: 'Category', kind: 'dimension', max: 1 },
    { name: 'values', label: 'Value', kind: 'measure', max: 1 },
    { name: 'target', label: 'Target', kind: 'measure', max: 1 },
  ],
  options: [{ key: 'labels', label: 'Data labels', type: 'bool', default: true }],
  sort: 'value',
  render(ctx) {
    const cat = ctx.data.role('category')[0];
    const val = ctx.data.role('values')[0];
    // … build an SVG string using ctx.width / ctx.height; marks get class "sb-mark sb-c0"
    // and data-row="<row index>" to take part in cross-filtering, tooltips and drill.
    ctx.el.innerHTML = '<svg class="sb-svg" …>…</svg>';
  },
};
registerVisual(bullet);
```

What a visual gets in `render(ctx)`:

| Field | Meaning |
|---|---|
| `el`, `width`, `height` | The frame body to draw into, and its size |
| `data` | Columnar result: `data.role(name)` → columns with `values`, `label`, `fmt` (formatter), `field` |
| `extra` | Results of additional queries from `plan()` |
| `options` | The visual's options merged with defaults |
| `palette` | Number of palette colors (use classes `sb-c0` … `sb-c{n-1}`) |
| `selected(row)` | `null` when nothing in this visual is selected, else whether the row is |
| `api.select(row, additive)` | Cross-filter (usually not needed: clicks on `[data-row]` are handled) |
| `api.setFilters(filters)` | For slicer-like visuals: replace this visual's filters on the page |
| `api.query(spec)` | Run another query (e.g. to populate a control) |
| `api.drill(row)` | Drill down from a row |

Optional `plan(ctx)` returns `{ main, extra }` query specs built from `ctx.fields` (resolved fields per
role), `ctx.pick(...roles)`, and `ctx.aggregate(field, agg)`. Without it, the default plan groups by
all dimension roles and aggregates all measure roles.

Style marks with the theme's variables (`var(--c)` is the series color on `sb-cN` elements, plus
`--sb-text`, `--sb-muted`, `--sb-grid`, …) so the visual follows every theme and dark mode.

### Loading plugins (planned for 0.3)

Reports will list plugins by URL; the viewer imports them before rendering:

```json
"plugins": [{ "url": "https://cdn.example.com/acme-visuals@1.2.0/index.js", "integrity": "sha384-…" }]
```

The designer will show plugin visuals in the gallery's "plugin" group. Until then, plugins can be
registered by bundling them into a custom build (import the module next to `src/visuals/index.ts`).

## Other plugin kinds (planned)

| Kind | Purpose | Examples |
|---|---|---|
| Visual | New chart types | Maps (with GeoJSON/TopoJSON), Sankey, Gantt, box plot |
| Data connector | New data step kinds | REST/JSON APIs with paging, Google Sheets, SQL servers via a proxy |
| Expression language | Alternative to SQL measures | A DAX-like formula language compiled to SQL |
| Export | Output formats | PDF/PNG export, PowerPoint |
| Host | Server-side wrapper | Scheduled refresh, sharing and permissions, row-level security |
