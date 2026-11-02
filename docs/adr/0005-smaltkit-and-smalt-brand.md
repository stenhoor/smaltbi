# ADR 0005: smaltkit and smalt-brand repositories

Date: 2026-11-02. Status: accepted.

## Context

ADR 0003 staged shared code in `src/kit/`, and ADR 0004 chose a separate package for it. Brand
assets (colors, icons, fonts, "Powered by" badges) are also shared across smaltdb, smaltui and
smaltbi, but they are not code and change on a different rhythm.

## Decision

Two shared repositories, under the same owner as smaltdb, smaltui and smaltbi:

| Repository | Holds | Consumed as |
|---|---|---|
| **smaltkit** | Shared code: the engine loader, data steps (the environment manifest format), URL helpers, DOM helpers, the zip writer, the OPFS file store, the dev server and vendoring scripts; later smaltui's SQL editor and virtualized grid. | npm package, TypeScript shipped as JS + `.d.ts` |
| **smalt-brand** (future) | The unified color scheme, iconography, font choices, logos and lockups, and the "Powered by" badges. | npm package of static assets: CSS tokens, an SVG icon set, badge SVG/HTML |

## Consequences for smaltbi

- `src/kit/`, `src/data/sources.ts` and the two shared scripts move to smaltkit in 0.2.
- smaltbi's own colors, icons and fonts are placeholders until smalt-brand exists:
  - the default **Smalt** theme will take its colors and fonts from smalt-brand's tokens
    (it stays a normal `.theme.json`, so reports keep working);
  - the designer's logo and the visual-type icons will come from smalt-brand's icon set;
  - the "Powered by" badge in published reports will be smalt-brand's, so it looks
    the same across smaltui, smaltbi and anything else built on smaltdb.
- Until then, these are kept in one place each (`themes/smalt.theme.json`, the icon strings in
  `src/visuals/`, the logo in `src/designer/main.ts`) so they are easy to swap.
