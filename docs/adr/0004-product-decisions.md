# ADR 0004: Product decisions from the second interview

Date: 2026-11-02. Status: accepted. Answers to the questions in OPEN_QUESTIONS.md (first round).

| # | Topic | Decision | Roadmap |
|---|---|---|---|
| 1 | Time intelligence | **Generated SQL measures.** A "quick measure" wizard writes ordinary SQL measures (YTD, previous period, same period last year, rolling N) from a date column, using `FILTER (WHERE …)` and window functions. No new language. | 0.2 |
| 2 | Date table | **On request.** "Add date table" in the model view creates a calendar table, its relationship and a Year › Quarter › Month › Day hierarchy. Nothing is created silently. | 0.2 |
| 3 | Measure references | **Keep `[Name]`.** Only brackets that name a model field are rewritten; other brackets pass through as SQL identifier quoting. The measure editor will highlight resolved references. | 0.2 |
| 4 | Page canvas | **Responsive by default, fixed as an option.** The 12-column grid that fills the window (and stacks on phones) stays the default; a page can choose a fixed size (16:9, 4:3, Letter, A4) scaled to fit, for slides and print. | 0.2 |
| 5 | Shared kit | **New repository and npm package** (working name `smaltkit`): TypeScript, shipped as JS + `.d.ts` so plain-JS smaltui uses it unchanged. smaltui and smaltbi both depend on it. | 0.2 |
| 6 | Large files | **Import into OPFS by default.** Files over ~50 MB are copied once into browser storage (kept between visits); linking in place stays available. | 0.3 |
| 7 | Refresh | **Refresh button** with a freshness indicator in the viewer, plus an **optional auto-refresh interval** per report (for wall dashboards). | 0.3 |
| 8 | Credentials | **The viewer asks the reader.** A report declares that a connection needs credentials; the viewer prompts and keeps them in memory only (smaltdb `registerCredentials`). SSO/OAuth and server-held secrets are host plugins. | 0.3 |
| 9 | Ambiguous relationship paths | **Require an unambiguous model.** The model view flags tables reachable by more than one active path; extra relationships must be marked inactive. The compiler errors instead of picking the shortest path. | 0.2 |
| 10 | Filter direction | **Through the fact table.** Slicers and dimension-only visuals show only values that have data under the other selections ("relevant values"). | 0.2 |
| 11 | Publishing | All four: **multi-report sites** (index page, shared themes and data), an optional **"Edit a copy"** that ships the designer, a small removable **"Powered by"** badge, and **PDF/PNG export** of the current page in the viewer. | 0.3; PDF/PNG 0.5 |
| 12 | Default font | **Keep system fallbacks.** The Smalt theme names Inter but downloads nothing; themes can import web fonts. | — |
