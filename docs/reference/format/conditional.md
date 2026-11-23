---
description: "Rules that colour measure values and add icons in tables, matrices and KPI cards."
---

# Conditional formatting

`conditional`, on tables, matrices and KPI cards, colours measure values and adds icons.
Each rule formats `apply` (a measure field of the visual, or `"*"` for all) when a test holds: the value itself, or
`test` (another measure in the same row), compared by `op` (`gt`, `gte`, `lt`, `lte`, `eq`, `ne`, `between`,
`positive`, `negative`, `blank`) with `value` (and `value2` for `between`) or with `compare`, another measure ("by
measure"). Measures that a rule tests or compares with but the visual doesn't show are fetched with its data. The
effect: `tone` (`good`, `bad`, `warn`, `accent`) as the text colour, or the background with `fill`, and an `icon`
(`up`, `down`, `flat`, `check`, `cross`, `warn`, `dot`). The first rule that matches a value wins.

Where it sits in a visual: [Visuals](./visuals).
