# Architecture

smaltbi is a static web app in TypeScript, bundled by esbuild into two entry points: the designer
(`dist/designer.js`, ~140 KB minified) and the viewer (`dist/viewer.js`). The engine is not
bundled: it is loaded at run time from `vendor/smaltdb/` and runs in a Web Worker. It is built from
`src/engine/`: smaltdb, with SQL from [smaltql](https://github.com/stenhoor/smaltql) and the `@smaltdb/io`,
`@smaltdb/external` and `@smaltdb/parquet` plugins registered in the worker.

```
                        ┌──────────────────────── main thread ───────────────────────────┐
 report.json ──► ReportSession ──► Model ──► compileQuery() ──► QueryRunner ──► VisualDef.render()
  (data, model,     │  (db, theme,   (schema +   (SQL text)      (cache by SQL,    (SVG / HTML string
   pages, theme)    │   runner)       spec)                        columnar)         into the frame)
                    │                                                 │
                    └── applySteps() ──► smaltdb client ◄─────────────┘
                                             │  postMessage
                        ┌─────────── worker ─▼────────────┐
                        │ smaltdb + smaltql, OPFS, plugins │
                        └──────────────────────────────────┘
```

## Components

| Module | Responsibility |
|---|---|
| `core/types.ts` | The report document: data steps, model spec, pages, visuals, filters, view state, theme. |
| `core/model.ts` | `Model`: the schema (from introspection) overlaid with the spec. Resolves field references to SQL expressions, expands `[Measure]` / `[Column]` references, finds join paths. |
| `core/compile.ts` | `compileQuery()`: dimensions + measures + filters → one SQL statement. `wrapCustomSql()` applies filters to custom SQL. |
| `core/datetable.ts`, `core/timeintel.ts` | The generated date table, and time-intelligence measures compiled over it. |
| `core/format.ts` | Display formats, re-exported from `smaltkit/format` (presets, Intl options, small patterns, dates without time-zone shifts). |
| `smaltkit/manifest` | Data steps (the environment manifest format, shared with smaltui and smaltnb): import, link, SQL, inline rows, connections. |
| `data/introspect.ts` | Tables, columns and BI types (dates are detected from ISO strings), keys, foreign keys. |
| `data/runner.ts` | Runs SQL in columnar mode with an LRU cache keyed by SQL text. |
| `report/session.ts` | Opens the database, applies steps, builds the model, loads the theme. |
| `report/view.ts` | `ReportView`: lays out a page, plans and runs each visual's queries, renders, and handles every interaction. Used by both the designer and the viewer. |
| `visuals/` | The plugin API (`api.ts`) and the built-in visuals: their roles, options and queries. The charts and tables are drawn by `smaltkit/charts` and `smaltkit/table`, and styled by its `ui.css`. |
| `theme/theme.ts` | Theme merge (`extends`) and compilation to CSS custom properties. |
| `designer/` | The designer: document store with undo/autosave, fields pane, panels, dialogs, canvas editing, and the model view (`modelview.ts`: the ER diagram; `modelpanel.ts`: table and relationship details). |
| `publish/publish.ts` | Builds the static site file set and zips it (`kit/zip.ts`). |
| `report/engine.ts` | smaltbi's settings for `smaltkit/engine`: loads `vendor/smaltdb/` (built from `engine/`), npm engines off. |
| `kit/` | Small framework-free helpers, staged for sharing (see ADR 0003): zip and local files. The DOM helpers, formatting, charts, tables, controls, data steps, URLs and the engine loader are in [smaltkit](https://github.com/stenhoor/smaltkit). |

## From a visual to SQL

A visual has data **roles** (axis, legend, values, …), each declared by its `VisualDef` as a
`dimension` (grouped by) or a `measure` (aggregated). For each visual, `ReportView`:

1. **Resolves fields.** Hierarchies expand to their levels. For a drillable role with several levels,
   only the current level is used and the levels above become filters (the drill path).
2. **Plans queries.** The default plan is one query: every dimension role, then every measure role.
   Visuals can plan more (the matrix plans row, column and grand totals, and a subtotal query per row level; the KPI card a sparkline).
3. **Collects filters.** Report, page and visual filters; a drill-through's filters; and the
   selections of every *other* visual on the page (plus slicers synced from other pages). A visual is
   never filtered by its own selection: it highlights instead.
4. **Compiles.** `compileQuery()`:
   - gathers the tables every field and filter reads (from `table.` references in the SQL);
   - picks the **root** (the fact table): the first measure table from which every needed table can be
     reached along many-to-one relationships (BFS), else any such table;
   - for a **dimension-only** query (a slicer, a list of values), picks a root that also reaches the
     filtered tables, normally the fact table, so other selections narrow it to values that have data
     ("relevant values", ADR 0004 decision 10); with no filters on other tables it lists every value;
   - refuses an **ambiguous** model: if a needed table can be reached from the root by more than one
     active path, it raises an error naming the path instead of picking one (ADR 0004 decision 9);
     the fix is to mark a relationship inactive, and the model view flags such paths;
   - emits `LEFT JOIN`s along the paths found, `WHERE` for column filters, `GROUP BY` the dimensions,
     `HAVING` for measure filters, `ORDER BY`, `LIMIT`;
   - reports filters on tables it cannot reach (they are ignored, like a single-direction relationship);
   - with **time-intelligence measures** (`core/timeintel.ts`), wraps the query in CTEs: the query itself (plus each
     time measure's base measure), the periods of the visual's date-table fields under the date-table filters, each
     period's window of days (the year so far, the same days last year, the last N months, …), and the base measure
     over the facts on those days under the other filters, joined back on the period and the other fields. The base
     measure is aggregated afresh over each window, so distinct counts and ratios come out right.
5. **Runs** through the `QueryRunner`. Identical SQL is answered from the cache, so re-rendering,
   switching pages back and forth, and undo are free.
6. **Renders.** The `VisualDef` receives the columnar result tagged with roles and formatters, the
   size of its frame, its options, and a selection test, and writes markup into the frame.

Values are inlined as quoted SQL literals rather than bound parameters, so the SQL shown in the
designer's SQL tab is exactly the SQL that runs, and the cache key is the text alone.

### Measures and totals

Measures are SQL aggregate expressions over the model's tables, e.g.
`SUM(sales.quantity * products.unit_cost)`. A measure can reference others with `[Name]`; references
are inlined recursively (cycles are an error). Because the compiler joins whatever tables a measure
reads, cross-table measures need no extra setup.

Totals (table totals row, matrix row/column/grand totals) are separate aggregate queries with fewer
dimensions, never sums of the visible cells: averages, ratios and distinct counts stay right.

### Custom SQL

Any visual can replace its generated query with SQL (SQL tab → *Edit as custom SQL*, which starts
from the generated query with readable column names). Output columns map to the visual's fields in
order. Filters still apply where an output column has the filtered field's name or label: the query is
wrapped as `SELECT * FROM (…) WHERE …`.

## Rendering

- **One string per render.** Visuals build an SVG/HTML string and assign it once. No virtual DOM.
- **Theme by CSS variables.** Marks carry smaltkit classes (`sk-bar sk-c3`); colors, fonts and sizes come
  from variables the theme defines on `.sb-themed` (`--sb-*`), which `report.css` passes to the kit's
  `--sk-*` properties. Sequential and diverging colors use CSS `color-mix()`
  between the theme's ramp ends, so heatmaps re-theme without re-rendering too.
- **Resize** re-renders from the last data (ResizeObserver), without querying.
- **Selection highlighting** toggles classes on existing marks, so hover and double-click survive.
- **Events are delegated** on the report root: marks only carry `data-row`.
- Narrow screens (container under 720 px) stack visuals in one column.

## Interactions and state

`ViewState` (page, selections per visual, drill state, drill-through filters) is everything about how a
report is being looked at. The viewer writes it to the URL hash (`#s=` + base64url JSON) on every
change, so any view can be shared as a link; bookmarks store the same object.

## Performance notes

- smaltdb runs queries in its worker; the main thread only builds SQL strings and markup.
- Columnar results (`Float64Array` for numeric columns) avoid per-row objects.
- All queries of a page start in parallel; stale results are discarded by a per-visual generation counter.
- The sample report (17k fact rows, four pages, ~40 queries) renders each page in a fraction of a
  second in Chromium. A performance suite with budgets is on the roadmap.
- Very large result sets: visuals have default row limits (bar 50, table 1,000, scatter 5,000) that
  the designer can raise; Canvas rendering for dense scatter plots is planned (ADR 0002).

## Security notes

- Report JSON is data: text is escaped before it reaches markup; the text visual's markdown subset
  allows only http(s) links (opened with `rel=noopener`); image URLs are restricted to http(s), data images or relative paths.
- Custom SQL runs inside the visitor's own in-browser database; it cannot reach anything the
  report's data steps did not load.
- Credentials for private data sources go through smaltdb's `registerCredentials` and are never
  written into the report file.
