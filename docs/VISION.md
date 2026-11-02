# Vision

smaltbi is a spiritual successor to Power BI and Tableau that lives entirely in the browser. It
should feel as approachable as dragging a field onto a canvas and as deep as writing SQL, and every
report it produces should be fast and good-looking enough to show to anyone.

## The four mandates

| Mandate | What it means in practice |
|---|---|
| **Fast** | Target: interactions answer in under 100 ms on the sample data (17k rows), measured in the performance suite (see the roadmap). Queries run off the main thread in smaltdb; results are columnar and cached by SQL text; visuals render in one pass to markup; switching themes never re-queries. |
| **Simple for the user** | One gesture per idea: drag a field to get a sensible visual; click a mark to filter the page; double-click to drill. Defaults are good (sorting, formats, colors, legends), so most reports need no formatting at all. |
| **Powerful functions** | The model is SQL: measures are SQL aggregates that compose (`[Revenue] - [Cost]`), calculated columns are SQL expressions, filters can be SQL. Every visual shows the exact SQL it runs, and any visual can run custom SQL instead. Totals are computed, not summed, so ratios and distinct counts stay correct. |
| **Beautiful reporting** | Themes are portable files of design tokens: colors, palettes, ramps, fonts, sizes, card chrome and page grid, light and dark. Charts follow good defaults (light gridlines, tabular numbers, consistent palettes, legible labels). |

## Principles

- **Static by default.** The designer and every published report are static files. All computation
  happens in the visitor's browser. Anything that needs a server (scheduled refresh, shared
  workspaces, row-level security, sign-in) is a plugin or a wrapper environment, never core.
- **Capability scales with the user.** Drag-and-drop never hides the SQL; SQL never requires leaving
  the designer. A business user and an analyst work on the same report.
- **Plain HTML, CSS and SVG.** No UI framework, no chart library. Small internal kits (the DOM
  helpers, the visual API, the theme compiler) generalize what repeats.
- **Independence.** Runtime dependencies: smaltdb (and code shared with smaltui). Anything else is
  first evaluated as a plugin, to keep the license clean (MIT) and the bundle small.
- **Readable files.** A report is one JSON file that diffs well in git, reviews well in a pull
  request, and can be written by hand or by a program.
- **SQL first for 1.0.** smaltdb SQL is the only expression language. Other languages (a DAX-like
  formula language, Python, …) would be plugins or later releases.

## 1.0 scope

In:

- Data from URLs, local files, bundled files and existing smaltdb (OPFS) databases.
- A SQL semantic model: relationships, measures, calculated columns, hierarchies, formats.
- The core and advanced visual sets (see the README), all themeable, light and dark.
- Cross-filtering, slicers (synced across pages), report/page/visual filters, drill down,
  drill-through, tooltips, bookmarks, URL state.
- A designer with drag-and-drop, field wells, formatting, SQL view and custom SQL, undo/redo.
- Themes as portable JSON token files, with a theme editor.
- Static publishing (ZIP from the designer, CLI for pipelines).
- A visual plugin API.

Out of 1.0 (candidates for plugins or later releases):

- A non-SQL expression language; query engines other than smaltdb.
- Server features: refresh schedules, sharing/permissions, row-level security, subscriptions, alerts.
- Maps (need geo shapes: a plugin).
- Writing back to data sources.
- Natural-language Q&A and AI features.

## How smaltbi maps to Power BI / Tableau concepts

| Power BI / Tableau | smaltbi |
|---|---|
| Dataset / data source | The report's `data` steps and the smaltdb database they build |
| Power Query | Data steps: imports, links, SQL views |
| Model view, relationships | `model.relationships` (many-to-one), detected from keys and naming |
| DAX measures / calculated fields | `model.measures`: SQL aggregates with `[Measure]` references |
| Calculated columns | `model.columns`: SQL row expressions |
| Hierarchies, drill | `model.hierarchies`; drill on visuals whose axis has several levels |
| Visual-level / page / report filters | `visual.filters`, `page.filters`, `report.filters` |
| Slicers, sync slicers | `slicer` visual, `options.sync` |
| Cross-highlight / cross-filter | Click a mark: other visuals filter, the source highlights |
| Drill-through pages | `page.drillthrough` |
| Bookmarks | `report.bookmarks`, and the URL `#s=` state |
| Themes (JSON) | `.theme.json` token files |
| Publish to web | Static site ZIP / `scripts/publish.mjs` |
