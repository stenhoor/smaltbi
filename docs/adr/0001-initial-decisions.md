# ADR 0001: Initial decisions

Date: 2026-11-02. Status: accepted. Source: the project kickoff interview.

## Context

smaltbi is a browser-based business intelligence platform on smaltdb, a spiritual successor to
Power BI and Tableau. Mandates, in order: fast, simple for the user, powerful functions, beautiful
reporting.

## Decisions

| Topic | Decision |
|---|---|
| Deployment | Static by default, including the ability to publish reports as static pages. Anything server-based is a plugin or a wrapper environment. |
| Data sources (1.0) | External files by URL, local file import, data bundled with a published report, existing smaltdb (OPFS) databases. |
| Authoring | Drag-and-drop first, without limiting analysts: every visual exposes its SQL and can run custom SQL. Capability scales with the user. |
| Semantic model | Yes, SQL-based: relationships, measures as SQL aggregates, calculated columns, hierarchies. Other expression languages are plugins or future releases. |
| Interactivity (1.0) | Cross-filtering; slicers and report/page/visual filters; drill down and drill-through; tooltips and bookmarks. |
| Rendering | Plain HTML and CSS; inline SVG for charts; Canvas only for very dense charts. No chart or UI library. See ADR 0002. |
| Visuals (1.0) | Core set (bar/column, line/area, pie/donut, scatter/bubble, KPI card, table, matrix, slicers, text/image) and advanced set (combo, waterfall, funnel, heatmap, treemap, gauge, sparklines, small multiples). Maps and others via plugins. |
| Themes | Portable JSON token files compiled to CSS custom properties, with optional raw CSS overrides. |
| Language and build | TypeScript; esbuild. Runtime dependency: smaltdb only. |
| smaltui | Extract a shared kit for what both need (engine loading, data steps, URLs, DOM helpers, later the SQL editor and grid). See ADR 0003. |
| Report files | Human-readable JSON that diffs well in git; publishing emits a static folder (viewer + report + data), downloadable as a ZIP. |
| Scope | SQL from smaltdb only for 1.0; another engine is out of scope. |
| License | MIT. Third-party code is evaluated as a plugin first. |
