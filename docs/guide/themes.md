# Themes

A theme sets a report's colours, palettes, fonts and layout, in light and dark. Switching or editing a theme is a
stylesheet swap: no query runs again.

## Choose a theme

**Theme** in the top bar picks a built-in theme: *Smalt* (the default, the smaltworks brand), *Paper* (editorial: warm
paper, a serif face, flat cards) or *Midnight* (a dark control room). Readers switch between light and dark in the
viewer bar; a theme without a dark variant looks the same in both.

## Make your own

In the **Theme** dialog, *Start from* a theme, then *Customize* it: page, visual and text colours, the accent, good
and bad, the series colours, the fonts and sizes, corner radius, padding, gap, row height, gridlines and card shadows.
*Use this theme* applies it to the report. *Export theme…* saves it as a `.theme.json` file, and *Import theme…* loads
one. A report names its theme by built-in name, by path or URL (`"theme": "brand.theme.json"`), or holds it inline.

A theme can start from another with `extends`, and change only what differs:

```json
{
  "name": "Acme",
  "extends": "smalt",
  "colors": { "accent": "#d0342c" },
  "palette": ["#d0342c", "#1d3557", "#f4a261", "#2a9d8f", "#6d597a", "#e9c46a"]
}
```

One visual can override any token in its `style`: `{ "surface": "#fff8e6" }`.

## What's next

[The theme format](../reference/themes): every token and the CSS variable it becomes.
