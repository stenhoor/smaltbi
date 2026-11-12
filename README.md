<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/lockup-on-dark.svg">
    <img alt="smaltbi" src="brand/lockup.svg" width="320">
  </picture>
</h1>

**Small. Alternative. Insight.**

<a href="https://smaltworks.dev/stability"><picture><source media="(prefers-color-scheme: dark)" srcset="brand/work-in-progress-on-dark.svg"><img alt="Work in progress. Come build with us." src="brand/work-in-progress.svg" height="56"></picture></a>

Business intelligence in the browser, powered by [smaltdb](https://github.com/stenhoor/smaltdb).

smaltbi is a report designer and viewer, built as a static web app. Load CSV, JSON or Parquet files
(or open an existing smaltdb database), model them with relationships and SQL measures, drag fields
onto a canvas, and publish the result as a static site. Every report runs entirely in its reader's
browser.

<a href="https://smaltdb.dev">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/powered-by-smaltdb-on-dark.svg">
    <img alt="Powered by smaltdb" src="brand/powered-by-smaltdb.svg" width="172" height="28">
  </picture>
</a>

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

Every push to `main` deploys to GitHub Pages. This needs **Settings → Pages → Source: GitHub
Actions**; with "Deploy from a branch", GitHub also publishes the raw branch, which has no built app
(the deploy workflow checks this setting and fails if it is wrong):

- <https://stenhoor.github.io/smaltbi/>: the product site (guide, report format, design docs), with a live sample report.
- <https://stenhoor.github.io/smaltbi/designer.html?report=examples/sales/report.json>: the designer, with the sample.
- <https://stenhoor.github.io/smaltbi/sample/>: the sample report, published as a standalone static site.
- <https://stenhoor.github.io/smaltbi/viewer.html?report=examples/sales/report.json>: the viewer.

## Quick start

```bash
npm install        # also builds the engine (smaltdb, smaltql, plugins) into vendor/smaltdb/
npm run build      # bundles the designer and viewer into dist/
npm run serve      # http://localhost:8080
```

- `http://localhost:8080/`: opens the designer. `npm run docs:dev` serves the product site (`docs/`).
- `http://localhost:8080/designer.html`: the designer, with the sample report (a small coffee & tea retailer).
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
hierarchies, display names, formats and hidden fields, and a generated date table (calendar, fiscal years, weeks,
ISO weeks) with time-intelligence quick measures (to date, last year, previous period, rolling months). The query compiler joins along relationships
from the fact table, so a measure by any related dimension just works.

**Visuals.** Bar, column, line, area, line-and-column combo, pie, donut, scatter/bubble, KPI card
(with comparison and sparkline), table (totals, data bars, heat colors, sort), matrix (row/column
totals as separate queries, so non-additive measures stay correct), slicer (list, dropdown, buttons,
range, search), text (markdown with live values), image, waterfall, funnel, treemap, heatmap, gauge.

**Interaction.** Cross-filtering between visuals (Ctrl-click to add), slicers (optionally synced across
pages), drill down/up along hierarchies, drill-through to detail pages, tooltips, "include/exclude
this", focus mode, show as table, CSV export, bookmarks, and the whole view state in the URL.

**Model view.** An ER diagram of the tables: cards with their columns (PK/FK badges, types,
calculated columns, measure and hierarchy counts, row counts) and relationship lines between the
joined columns, marked `*` / `1` with the filter direction. Drag a column onto another table's key to
relate them; click a line to make it inactive, swap or delete it; drag cards to arrange (positions are
saved in the report); auto layout, detect relationships, zoom and fit; ambiguous paths are flagged.

**Designer.** Fields pane, drag-and-drop canvas on a 12-column grid, field wells with aggregation and
labels, format options, visual/page/report filters (value pickers, between, top N, SQL), a SQL tab that
shows exactly what runs and lets you replace it, a measure editor (SQL highlighting, completion of tables, columns and `[measures]` from the model, unknown
references marked as you type, and a live test that marks where an error is), undo/redo,
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
| `src/visuals/` | The visual plugin API and every built-in visual (drawn by smaltkit's charts and tables) |
| `src/report/` | The report renderer (`ReportView`), interactions, URL state, viewer chrome |
| `src/designer/` | The designer app |
| `src/theme/` | Theme loading and compilation to CSS |
| `src/kit/` | Helpers staged for smaltkit (zip, local files) |
| `src/engine/` | The engine worker and client built into `vendor/smaltdb/` (smaltdb, smaltql, plugins) |
| `src/publish/` | Static-site publishing |
| `styles/` | `report.css` (reports and viewer), `app.css` (designer) |
| `themes/` | Built-in theme files |
| `examples/sales/` | The sample report and its generated data (`npm run sample`) |
| `docs/` | The product site (VitePress on the smaltworks docs theme): guide, vision, architecture, file formats, plugins, roadmap, decisions |

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

Runtime: **smaltdb** with **[smaltql](https://github.com/stenhoor/smaltql)** for SQL and the io, external and Parquet
plugins (built from `src/engine/` into `vendor/smaltdb/` and loaded at run time; pinned in `packed.json` until they
are on npm) and
[**smaltkit**](https://github.com/stenhoor/smaltkit), the smalt apps' shared browser code (charts, tables,
formatting, DOM helpers), bundled at build time. Build: esbuild and TypeScript. The UI, charts and styles
are plain HTML, CSS and SVG. Anything else goes through
the plugin policy in [docs/PLUGINS.md](docs/PLUGINS.md).

## Brand

Logos, the "Powered by" badges, colours and type come from
[stenhoor/smalt-brand](https://github.com/stenhoor/smalt-brand/blob/main/BRAND.md). `brand/` holds
copies of smaltbi's assets (synced with `scripts/sync-brand.mjs`, never edited by hand), and the default
**Smalt** theme uses the brand's Kiln palette and Geist type. The designer reads the brand's `tokens.css`, and
the icons follow its Chevron style (`src/visuals/icons.ts`). Published reports show the
"Powered by smaltbi" badge; turn it off per report in the Publish dialog (`branding.poweredBy: false`).

## License

[MIT](LICENSE)

<a href="https://smaltworks.dev"><picture><source media="(prefers-color-scheme: dark)" srcset="brand/a-smaltworks-project-on-dark.svg"><img alt="A smaltworks project" src="brand/a-smaltworks-project.svg" height="28"></picture></a>
