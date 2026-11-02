# Roadmap

Milestones to 1.0. Each ends with the designer, the viewer and the sample report working, the unit
tests and the Chromium end-to-end test green.

## 0.1: Skeleton (done)

- Report format, semantic model (relationships, `[Measure]` composition, calculated columns,
  hierarchies), SQL compiler with join planning, formats.
- 18 visuals: the core set and the advanced set.
- Cross-filtering, slicers (synced), filters at three levels, drill down/up, drill-through, tooltips,
  focus mode, show data, CSV export, bookmarks, URL state.
- Designer: fields, drag-and-drop canvas, wells, format/filters/SQL panels, custom SQL, data/model/
  theme dialogs, undo/redo, autosave, preview.
- Themes: tokens → CSS variables, three built-ins, editor, import/export, dark mode.
- Static publishing (ZIP and CLI). Sample dataset and report. Unit + e2e tests, CI.

## 0.2: Depth in the model and the designer

- Time intelligence helpers as SQL templates: previous period, year-to-date, same period last year,
  rolling N (generated measures over a date column; no new language).
- Measure editor with completion and syntax highlighting (shared editor kit from smaltui).
- Field wells: drag to reorder, drag between wells, multi-select; field search with keyboard.
- Conditional formatting rules (by value, by measure, icons) for tables, matrices and cards.
- Matrix: expand/collapse, stepped layout, subtotals per level.
- Table: pagination for large results, column widths, frozen first column.
- Continuous time axis for line/area charts (gaps and uneven dates), log scale, reference lines,
  axis titles, min/max overrides, small multiples.
- Copy/paste visuals between pages and reports; align/distribute tools; snap guides.
- Mobile layout per page.

## 0.3: Plugins and data

- Plugin loading by URL (with integrity hashes) in designer and viewer; plugin manifest; the
  "plugin" gallery group.
- A maps plugin (choropleth and points, GeoJSON/TopoJSON shapes as data files).
- Data: refresh button and freshness indicator for linked sources; incremental reload; materialized
  views as a "cache this table" switch; parameters (what-if values usable in measures).
- Role-playing dimensions (a dimension related twice, e.g. order date and ship date).
- Many-to-many through bridge tables; both-direction filtering where explicitly enabled.

## 0.4: Performance and scale

- A performance suite with budgets (open, page switch, slicer click) at 100k and 1M rows.
- Canvas rendering for dense scatter and line charts (ADR 0002).
- Query batching (one round trip for a page), result streaming for tables, cancelation of
  superseded queries (`AbortSignal`).
- Worker-side aggregation caches keyed by filter context.

## 0.5: Reporting polish

- PDF/print layouts (page size, headers, footers) and PNG export.
- Report-level tooltips pages; custom tooltip fields.
- Theme gallery, theme from a brand color, contrast checks (WCAG AA) in the theme editor.
- Accessibility: keyboard navigation of marks, screen-reader summaries, "show as table" everywhere.
- Localization of the UI; number/date locale per report.

## 1.0

- Stable report format with migrations from earlier versions.
- Shared kit published (with smaltui), API docs for plugins, a documentation site with the sample
  reports live.
- smaltdb 1.0 as the engine.
