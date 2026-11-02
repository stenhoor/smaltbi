# smaltbi

**Business intelligence in the browser, on [smaltdb](https://github.com/stenhoor/smaltdb).**

smaltbi is a report designer and viewer in the spirit of Power BI and Tableau, built as a static
web app. Load CSV, JSON or Parquet files (or point at an existing smaltdb database), model them
with relationships and SQL measures, drag fields onto a canvas, and publish the result as a static
site that runs entirely in each visitor's browser. There is no server.

> **Status: 0.1.0, a working skeleton.** The designer, viewer, semantic model, query compiler,
> 18 visual types, cross-filtering, drill down/through, themes and static publishing work end to
> end. See [docs/ROADMAP.md](docs/ROADMAP.md) for what is next on the way to 1.0.

## Mandates

1. **Fast.** Queries run in smaltdb's worker, off the main thread; results come back columnar and are
   cached; charts are hand-written SVG built in one pass; a theme change is a stylesheet swap.
2. **Simple for the user.** Drag a field, get a chart. Click a bar, everything else filters.
3. **Powerful.** Every visual is backed by readable SQL you can view, copy or replace. Measures are
   SQL aggregates that can reuse each other (`[Revenue] / NULLIF([Orders], 0)`). The tool scales with
   the user: drag-and-drop for most, SQL all the way down for analysts.
4. **Beautiful.** Portable theme files (colors, palettes, fonts, layout) drive every pixel of a report,
   in light and dark.

## Try it

Every push to `main` deploys to GitHub Pages:

- <https://stenhoor.github.io/smaltbi/>: the designer, with the sample report.
- <https://stenhoor.github.io/smaltbi/sample/>: the sample report, published as a standalone static site.
- <https://stenhoor.github.io/smaltbi/viewer.html?report=examples/sales/report.json>: the viewer.

## Quick start

```bash
npm install        # also copies the smaltdb engine into vendor/smaltdb/
npm run build      # bundles the designer and viewer into dist/
npm run serve      # http://localhost:8080
```

- `http://localhost:8080/`: the designer, with the sample report (a small coffee & tea retailer).
- `http://localhost:8080/viewer.html?report=examples/sales/report.json`: the same report as a viewer sees it.

`npm run dev` rebuilds on change. `npm run check` type-checks and runs the unit tests (compiled SQL
is executed against the real smaltdb engine in Node). `node test/e2e.mjs` drives the designer and a
published site in Chromium (needs Playwright); `E2E_CPU_THROTTLE=4 node test/e2e.mjs` runs it with the
browser's CPU slowed 4×, to catch timing races.

## Features

**Data.** Data steps build the report's database when it opens: import or link CSV/TSV/JSON/NDJSON/
Parquet from URLs (HTTP, and smaltdb's S3/Azure connections) or from your computer, run SQL (views,
cleanup), or report on an existing OPFS database. The step format is smaltui's environment manifest.

**Model.** Tables and columns come from the database. On top: many-to-one relationships (typed or
detected), measures (SQL aggregates, `[Measure]` references, `FILTER (WHERE …)`), calculated columns,
hierarchies, display names, formats and hidden fields. The query compiler joins along relationships
from the fact table, so a measure by any related dimension just works.

**Visuals.** Bar, column, line, area, line-and-column combo, pie, donut, scatter/bubble, KPI card
(with comparison and sparkline), table (totals, data bars, heat colors, sort), matrix (row/column
totals as separate queries, so non-additive measures stay correct), slicer (list, dropdown, buttons,
range, search), text (markdown with live values), image, waterfall, funnel, treemap, heatmap, gauge.

**Interaction.** Cross-filtering between visuals (Ctrl-click to add), slicers (optionally synced across
pages), drill down/up along hierarchies, drill-through to detail pages, tooltips, "include/exclude
this", focus mode, show as table, CSV export, bookmarks, and the whole view state in the URL.

**Designer.** Fields pane, drag-and-drop canvas on a 12-column grid, field wells with aggregation and
labels, format options, visual/page/report filters (value pickers, between, top N, SQL), a SQL tab that
shows exactly what runs and lets you replace it, a measure editor with a live test, undo/redo,
autosave, and a preview mode.

**Themes.** `.theme.json` token files compiled to CSS custom properties: colors, 12-color palette,
sequential and diverging ramps, fonts (with web-font imports), sizes, card chrome and page grid, plus a
dark variant. Three built-ins (Smalt, Paper, Midnight); `extends` to derive your own.

**Publishing.** One click produces a ZIP of a static site (viewer, engine, report.json, data) for any
static host. `node scripts/publish.mjs report.json out/` does the same from the command line.

## Repository layout

| Path | Contents |
|---|---|
| `src/core/` | Report types, the semantic model, the SQL compiler, formatting |
| `src/data/` | Data steps, schema introspection, the cached query runner |
| `src/visuals/` | The visual plugin API and every built-in visual |
| `src/report/` | The report renderer (`ReportView`), interactions, URL state, viewer chrome |
| `src/designer/` | The designer app |
| `src/theme/` | Theme loading and compilation to CSS |
| `src/kit/` | Small UI/infra kit shared with smaltui (engine loader, DOM helpers, zip, files) |
| `src/publish/` | Static-site publishing |
| `styles/` | `report.css` (reports and viewer), `app.css` (designer) |
| `themes/` | Built-in theme files |
| `examples/sales/` | The sample report and its generated data (`npm run sample`) |
| `docs/` | Vision, architecture, file formats, plugins, roadmap, decisions |

## Documentation

| Document | Contents |
|---|---|
| [docs/VISION.md](docs/VISION.md) | Mandates, principles, 1.0 scope and non-goals |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, data flow, the query compiler, rendering, performance |
| [docs/REPORT_FORMAT.md](docs/REPORT_FORMAT.md) | The report JSON file, field by field |
| [docs/THEMES.md](docs/THEMES.md) | Theme tokens and the CSS variables they become |
| [docs/PLUGINS.md](docs/PLUGINS.md) | Visual plugins and the plugin policy |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Milestones to 1.0 |
| [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) | Decisions that still need input |
| [docs/adr/](docs/adr/) | Architecture decision records |

## Dependencies

Runtime: **smaltdb** only (loaded at run time from `vendor/smaltdb/`). Build: esbuild and TypeScript.
No UI framework, no chart library, no CSS framework. Anything else goes through the plugin policy in
[docs/PLUGINS.md](docs/PLUGINS.md).

## License

[MIT](LICENSE)
