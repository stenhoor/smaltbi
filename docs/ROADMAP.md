# Roadmap

Milestones to 1.0. Each ends with the designer, the viewer and the sample report working, the unit
tests and the Chromium end-to-end test green.

## 0.1: Skeleton (done)

- Report format, semantic model (relationships, `[Measure]` composition, calculated columns,
  hierarchies), SQL compiler with join planning, formats.
- 18 visuals: the core set and the advanced set.
- Cross-filtering, slicers (synced), filters at three levels, drill down/up, drill-through, tooltips,
  focus mode, show data, CSV export, bookmarks, URL state.
- Designer: fields, drag-and-drop canvas, wells, format/filters/SQL panels, custom SQL, data, measure and
  theme dialogs, undo/redo, autosave, preview.
- Model view: an ER diagram of tables and relationships (drag to relate, click to edit, auto layout,
  ambiguous-path warnings), with table details, measures, calculated columns and hierarchies.
- Themes: tokens → CSS variables, three built-ins, editor, import/export, dark mode.
- Static publishing (ZIP and CLI). Sample dataset and report. Unit + e2e tests, CI.
- Brand: smalt-brand logos, favicons and the "Powered by smaltbi" badge (on by default, ADR 0004); the Smalt theme and designer on
  the Kiln palette with Geist, Geist Mono and Martian Mono.
- ✓ Brand, round 2: the smaltbi mark in the viewer header, the designer on the brand's `tokens.css`, and
  visual-type, field-type and colour-mode icons in the brand's Chevron style.

## 0.2: Depth in the model and the designer

Decisions behind this milestone: [ADR 0004](adr/0004-product-decisions.md).

- Next, after catching up with the family's engine and smaltkit ([ADR 0006](adr/0006-outside-code-smaltdf-pages-calendar.md)):
  - "Add date table" in the model view (calendar table, relationship, Year › Quarter › Month › Day), with a
    fiscal year start, a week start day and ISO weeks.
  - Quick measures for time intelligence, written as plain SQL: previous period, year-to-date, same
    period last year, rolling N (generated from a date column; no new language).
- ✓ Unambiguous models: the model view flags tables reachable by more than one active path, and the
  compiler errors instead of guessing; marking a relationship inactive resolves it.
- ✓ Relevant values: dimensions filter each other through the fact table (slicers list only values
  with data under the other selections).
- Fixed page sizes as an option per page (16:9, 4:3, Letter and A4 portrait or landscape, or a custom size);
  responsive stays the default. Readers see a fixed page at 100% and scroll, or switch on "Fit to window".
- ✓ Shared kit in the `smaltkit` repository, used by smaltui, smaltbi and smaltnb
  ([ADR 0005](adr/0005-smaltkit-and-smalt-brand.md)): charts, tables, controls, formatting, DOM helpers, data steps,
  URLs and the engine loader. Still to move when another app needs them: the zip writer, local files, dev scripts.
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
- Data: refresh button and freshness indicator; optional auto-refresh interval per report;
  incremental reload; materialized views as a "cache this table" switch; parameters (what-if
  values usable in measures).
- Large files are imported into OPFS by default (link in place stays available).
- Credentials: reports declare connections that need them; the viewer asks the reader and keeps
  them in memory only.
- Publishing: multi-report sites (index page, shared themes and data), optional "Edit a copy"
  (ships the designer).
- Role-playing dimensions (a dimension related twice, e.g. order date and ship date).
- Many-to-many through bridge tables; both-direction filtering where explicitly enabled.

## 0.4: Performance and scale

- A performance suite with budgets (open, page switch, slicer click) at 100k and 1M rows.
- Canvas rendering for dense scatter and line charts (ADR 0002).
- Query batching (one round trip for a page), result streaming for tables, cancelation of
  superseded queries (`AbortSignal`).
- Worker-side aggregation caches keyed by filter context.

## 0.5: Reporting polish

- PDF/print layouts (page size, headers, footers) and PDF/PNG export of the current page from the viewer.
- Report-level tooltips pages; custom tooltip fields.
- Theme gallery, theme from a brand color, contrast checks (WCAG AA) in the theme editor.
- Accessibility: keyboard navigation of marks, screen-reader summaries, "show as table" everywhere.
- Localization of the UI; number/date locale per report.

## 1.0

- Stable report format with migrations from earlier versions.
- Shared kit (`smaltkit`) at 1.0, API docs for plugins, a documentation site with the sample
  reports live.
- smaltdb 1.0 as the engine.
