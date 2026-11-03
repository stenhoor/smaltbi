# Themes

A theme is a portable JSON file of design tokens. smaltbi compiles it into CSS custom properties on
`.sb-themed` (the report and its viewer chrome); every visual reads only those variables. Switching or
editing a theme is therefore a stylesheet swap: no query, no re-render.

Use a theme by name (`"theme": "paper"`), by path or URL (`"theme": "brand.theme.json"`), or inline.
Create one in the designer (**Theme** → customize → *Export theme*), or by hand starting from:

```json
{
  "name": "Acme",
  "extends": "smalt",
  "colors": { "accent": "#d0342c" },
  "palette": ["#d0342c", "#1d3557", "#f4a261", "#2a9d8f", "#6d597a", "#e9c46a"],
  "fonts": { "body": "'Work Sans', system-ui, sans-serif", "imports": ["https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;600&display=swap"] }
}
```

`extends` names a built-in theme (or a URL); the theme's groups are merged over it one level deep.

## Tokens

| Token | CSS variable | Used for |
|---|---|---|
| `colors.background` | `--sb-bg` | Page background |
| `colors.surface` | `--sb-surface` | Visual cards, tooltips text |
| `colors.text` | `--sb-text` | Titles, values |
| `colors.muted` | `--sb-muted` | Subtitles, axis labels, captions |
| `colors.border` | `--sb-border` | Card borders, table header rule |
| `colors.grid` | `--sb-grid` | Gridlines, table row rules, gauge track |
| `colors.accent` | `--sb-accent` | Selected tabs, chips, data bars, focus |
| `colors.positive` / `negative` | `--sb-pos` / `--sb-neg` | KPI deltas, waterfall up/down |
| `colors.neutral` | `--sb-neutral` | Neutral marks |
| `colors.selection` | `--sb-sel` | Selected table rows |
| `colors.onMark` | `--sb-on-mark` | Data labels drawn on series colours (pie slices, treemap tiles, dark heat cells); default white |
| `palette[0..11]` | `--sb-c0` … `--sb-c11` | Series colors (cycled when fewer than 12) |
| `sequential` [low, …, high] | `--sb-seq-lo`, `--sb-seq-hi` | Heatmaps, matrix/table heat colors |
| `diverging` [neg, mid, pos] | `--sb-div-lo`, `--sb-div-mid`, `--sb-div-hi` | Diverging scales |
| `fonts.body` / `heading` / `numeric` | `--sb-font`, `--sb-font-heading`, `--sb-font-num` | Text, titles, numbers |
| `fonts.imports` | `@import` | Web-font stylesheets (https only) |
| `sizes.base`, `title`, `subtitle`, `label`, `kpi`, `small` | `--sb-fs`, `--sb-fs-title`, … | Type scale (px) |
| `visual.radius` | `--sb-radius` | Card corners |
| `visual.padding` | `--sb-pad` | Card padding |
| `visual.border` | `--sb-vborder` | Card border (any CSS border) |
| `visual.shadow` | `--sb-shadow` | Card shadow (any CSS box-shadow, or `none`) |
| `visual.titleAlign`, `titleWeight` | `--sb-title-align`, `--sb-title-weight` | Visual titles |
| `visual.gridlines` | `--sb-gridlines` | 1 or 0 (gridline opacity) |
| `visual.barRadius` | `--sb-bar-radius` | Bar corner radius |
| `visual.lineWidth`, `markerSize` | `--sb-line-width`, `--sb-marker` | Lines |
| `page.columns`, `rowHeight`, `gap`, `padding`, `width`, `fit` | grid + `--sb-gap`, `--sb-page-pad` | Page layout |
| `page.background` | `--sb-page-bg` | Page background override (image or gradient allowed) |
| `dark` | same variables under dark mode | `colors`, `palette`, `sequential`, `diverging` for dark mode |
| `css` | appended verbatim | Anything tokens do not cover |

Sequential and diverging colors are mixed with CSS `color-mix(in oklab, …)`, so ramps stay smooth and
re-theme instantly.

## Dark mode

A theme's `dark` block overrides colors when the viewer chooses Dark, or when it is on Auto and the
system prefers dark. Themes without a `dark` block look the same in both modes.

## Per-visual overrides

`visual.style` overrides any token for one visual by variable name without the `--sb-` prefix, for
example `{ "surface": "#fff8e6", "text": "#3b2f00" }`.

## Custom CSS

`css` is appended after the variables. Useful hooks: `.sb-visual[data-type=card]`,
`.sb-visual[data-id=…]`, `.sb-visual-title`, and the chart classes from smaltkit: `.sk-kpi-value`,
`.sk-table th`, `.sk-legend`, `.sk-bar`, `.sk-c0` … `.sk-c11`.

## Built-in themes

| Name | Look |
|---|---|
| `smalt` | Default. The smalt brand ([stenhoor/smalt-brand](https://github.com/stenhoor/smalt-brand)): the Kiln palette (smalt `#003399` on graphite neutrals), Geist with tabular numbers, light and dark. Chart colours start from the brand's smalt, kiln orange, smaltbi violet and smaltui cerulean; every series colour is at least 3:1 against the card surface in both modes (checked by a unit test). |
| `paper` | Editorial: warm paper, Source Serif, flat cards, no markers. |
| `midnight` | Dark control room: teal accent, IBM Plex Sans with Plex Mono numbers. |
