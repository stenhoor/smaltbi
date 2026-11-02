# Themes

A theme is a portable `.theme.json` file of design tokens: colors, the categorical palette,
sequential and diverging ramps, fonts, sizes, visual chrome (radius, padding, border, shadow) and
page layout. smaltbi compiles it to CSS custom properties, so switching themes never re-runs a
query. See [docs/THEMES.md](../docs/THEMES.md) for every token.

| File | Look |
|---|---|
| `smalt.theme.json` | The default. Cobalt accent, clean sans-serif, light and dark. |
| `paper.theme.json` | Editorial: warm paper, serif type, flat cards. |
| `midnight.theme.json` | Dark control-room: teal accent, monospaced numbers. |

Start a theme of your own with `"extends": "smalt"` and override only what you need.
