# ADR 0002: Rendering with HTML, CSS and hand-written SVG

Date: 2026-11-02. Status: accepted.

## Context

The mandate is plain HTML and CSS, no large packages, and beautiful, fast charts.

## Decision

- Charts are inline SVG built as strings by small, dependency-free renderers (`src/visuals/`), with
  shared helpers for scales, ticks, arcs and paths (`svg.ts`, ~150 lines).
- Tables, matrices, cards, slicers and text are HTML.
- All styling comes from CSS classes and theme variables; renderers never hard-code colors or fonts.
  Ramps use `color-mix()` so they follow the theme too.
- Canvas is reserved for very dense marks (scatter or line charts with tens of thousands of points),
  added in 0.4 behind the same `VisualDef` API.

## Consequences

- SVG prints and exports crisply, is styleable by themes, and is inspectable.
- One `innerHTML` per render keeps rendering fast for the mark counts BI charts have (hundreds to a
  few thousand). Default row limits keep visuals in that range.
- We own the chart code: layout details (label rotation, legend placement, tick density) are ours to
  get right, and the test suite and screenshots must cover them.
