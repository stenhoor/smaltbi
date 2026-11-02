# ADR 0003: A shared kit with smaltui

Date: 2026-11-02. Status: accepted. Packaging decided in ADR 0004 and ADR 0005: the `smaltkit` repository and npm package, TypeScript shipped as JS + `.d.ts`. Brand assets go to a separate future `smalt-brand` repository.

## Context

smaltui (the query workbench) and smaltbi both load the smaltdb engine, build databases from
manifests of data steps, fix up pasted data URLs, and need small framework-free UI pieces. smaltui
also has a SQL editor with completion and a virtualized grid that smaltbi's measure editor and data
views will want.

## Decision

Code that both projects need lives in `src/kit/` in smaltbi, written so it has no smaltbi
dependencies, until it is extracted into a shared package:

| Module | From smaltui | Purpose |
|---|---|---|
| `kit/engine.ts` | `app/engine.js` | Load the smaltdb client and worker (vendor, npm, URL); list OPFS databases |
| `kit/urls.ts` | `app/urls.js` | Rewrite GitHub/Hugging Face page links to raw files; CORS hints |
| `data/sources.ts` | `app/env.js` | Data steps (the environment manifest format) |
| `kit/dom.ts` | new | Element builder, menus, dialogs, toasts, downloads |
| `kit/zip.ts` | new | Stored ZIP writer |
| `kit/files.ts` | new | Local files kept in OPFS |
| `scripts/vendor-smaltdb.mjs`, `scripts/serve.mjs` | same files | Vendor the engine; dev server with COOP/COEP and Range support |

Next candidates: smaltui's SQL editor (`editor.js`, `sql.js`) for the measure editor, and its
virtualized grid (`grid.js`) for large tables.

The report data step format stays identical to smaltui's environment manifest, so either tool can
open the other's data definitions.

## Consequences

- No duplication drift for the engine loader and data steps once extracted; until then, changes are
  ported by hand in both directions.
- The kit is TypeScript; it can ship as JS with `.d.ts`, which plain-JS smaltui can use unchanged.
