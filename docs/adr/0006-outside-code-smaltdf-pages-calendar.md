# ADR 0006: Outside code, smaltdf, fixed page sizes and the calendar

Date: 2026-11-12. Status: accepted (owner's answers to an interview, 2026-11-12).

## Context

- The working rules now say to ask before adding outside code (CLAUDE.md, "Ask before adding outside code"). Two
  packages arrived before that rule: `hyparquet-compressors`, bundled into the engine so compressed Parquet files open
  (smaltdb 0.8.3 shipped it too), and `vitepress`, which builds the product site in `docs/`.
- smaltdf, a dataframe language for smaltdb (Polars-inspired), has joined the family beside smaltql. smaltbi's model is
  SQL: measures and calculated columns are SQL fragments composed into one generated query per visual.
- Open question 1 asked which fixed page sizes to offer.
- smaltdb now has date and time types (smaltdb ADR 0019), which time intelligence and a date table build on.

## Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | `hyparquet-compressors` | Belongs in a plugin, not in smaltbi: compression for Parquet should come with the Parquet plugin (or a companion plugin), so every app gets it. smaltbi drops its own copy once a plugin provides it; until then it stays, so gzip / zstd / LZ4 / Brotli files keep opening. |
| 2 | `vitepress` | Approved, as a build-time tool for the product site only (as in smaltnb, smaltql and smaltui). Nothing of it ships in the app or in published reports. |
| 3 | smaltdf | **Not in smaltbi.** smaltbi stays SQL-only: data steps, measures, calculated columns and custom visual SQL. Dataframes belong in smaltnb. This keeps one language and one set of semantics (division, rounding, NULL and NaN, booleans) in a report. |
| 4 | Fixed page sizes | An **option** per page; responsive stays the default. Presets: **16:9, 4:3, US Letter and A4** (Letter and A4 in portrait and landscape), plus a **custom width × height**. |
| 5 | A fixed page larger than the window | **The reader chooses.** The viewer shows the page at 100% and scrolls; a "Fit to window" switch in the viewer bar scales it down instead. Scrolling is a valid view, not a fallback. |
| 6 | Date table and calendar | "Add date table" offers a **fiscal year start** (any month; fiscal year and quarter follow it), a **week start day** (Monday or Sunday, with week numbers) and **ISO weeks** (ISO 8601 week-year and week columns). |
| 7 | Order of work | After catching up with the family's current engine and smaltkit, the **date table and time-intelligence quick measures** come first. |

## Consequences

- `docs/OPEN_QUESTIONS.md` has no open questions; question 1 is answered here.
- `docs/ROADMAP.md`: fixed page sizes follow decisions 4 and 5; the date table follows decision 6; a non-SQL
  expression language stays out of scope (VISION, ADR 0001), now with smaltdf named.
- Decision 1 is a request to the smaltdb-parquet maintainers; smaltbi changes when the plugin does.
