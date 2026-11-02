# Open questions

Decisions that still need input from the project owner. Answered questions move into an ADR.

## Product

1. **Time intelligence.** Power BI users expect "same period last year", YTD, rolling averages. Plan
   for 0.2: generate them as SQL measures from a date column (no new language). Is a generated-SQL
   approach acceptable, or should time intelligence wait for a formula-language plugin?
2. **Date table.** Should smaltbi create a date dimension automatically for every date column (as
   Power BI does), or only on request ("Add date table" in the model view)? Automatic is simpler for
   users; on request keeps the model explicit and the SQL readable.
3. **Report sharing without a server.** Published reports are static sites. Is "one report = one
   folder" right, or should one site host several reports (an index page, shared themes, shared data)?
4. **Editing published reports.** Should a published site include the designer (so readers can
   "save a copy and edit"), or is the viewer enough?
5. **Branding.** May the viewer show a small "made with smaltbi" mark, or should it be fully
   white-label by default?

## Data

6. **Large files.** Importing copies data into smaltdb; linking reads it in place on every query.
   What default should the designer pick for files over, say, 50 MB: link, or import into OPFS?
7. **Refresh semantics.** For linked URLs, should reports re-fetch on every open, on a schedule while
   open, or only when the user clicks refresh?
8. **Credentials.** For S3/Azure sources, credentials can't live in report files. For static
   publishing, is "the viewer asks the reader for credentials" acceptable, with anything else left to a
   host plugin?

## Model and SQL

9. **Bracket syntax.** `[Name]` inlines a measure or calculated column. SQLite also allows `[ident]`
   as identifier quoting; smaltbi only rewrites brackets that name a model field. Keep this, or switch
   to a syntax that can never clash (e.g. `{Name}`)?
10. **Ambiguous paths.** With several relationship paths between two tables, the compiler takes the
    shortest. Should the designer instead force the model to be unambiguous (Power BI's rule)?
11. **Bidirectional filters.** Single-direction (dimension filters fact) is the only behavior today:
    a slicer on a dimension does not narrow another dimension's slicer except through the fact table.
    Is that the right default?

## Shared kit with smaltui

12. **Packaging.** Staged in `src/kit/` (ADR 0003). Should the shared kit become its own repository
    and npm package (`smaltkit`), live inside smaltui, or inside smaltdb's monorepo?
13. **Language.** smaltui is plain JavaScript; smaltbi is TypeScript. Should the shared kit be
    TypeScript (with JS + .d.ts output, which smaltui can consume unchanged)?

## Design

14. **Default theme.** "Smalt" uses a cobalt accent and Inter (with system fallbacks, no web-font
    download). Keep, or pick a house font to bundle?
15. **Canvas size.** Pages are a responsive 12-column grid that fills the window width. Power BI uses
    a fixed 16:9 canvas scaled to fit. Should fixed-size pages (for slides and print) be an option per
    page, or the default?
