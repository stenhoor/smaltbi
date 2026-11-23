# Reading a report

What readers can do with a report, in the viewer, a published site and the designer's Preview.

## Cross-filtering

Click a bar, a slice, a row or a point: every other visual on the page filters to it. Ctrl-click, ⌘-click or
Shift-click adds to the selection (or takes a value out of it). Click the only selected value again to clear it.
**↺ Reset** in the viewer bar clears all selections and slicers.

A visual can be kept out of this, either way: `interactions` in the [report format](../reference/visual).

## Slicers and parameters

A slicer filters the page by a field's values: a list, a dropdown, buttons, a range or a search box. A slicer can be
synced across pages. A *Parameter* visual changes a what-if value (a growth rate, a target) that measures use.

## Drill

A visual whose axis is a hierarchy (Year › Quarter › Month) drills: double-click a value to drill down into it, ↑ in
the visual's corner drills up, and ⇊ shows the next level for every value.

Right-click a value for its menu:

- **Drill down**, and the pages it can **drill through** to, filtered to the value.
- **Include only this** and **Exclude this**.
- **Copy value**.

## The visual's menu

**⋯** in a visual's corner:

- **Focus mode:** the visual on its own, enlarged; **← Back to report** returns.
- **Show as a table:** its data as rows.
- **Export data (CSV)**.
- **View SQL:** the query it ran.
- **Clear selection**, when it has one.

## The viewer bar

Pages, **☆ Bookmarks** (saved views, when the report has any), **↺ Reset**, light, dark or auto, and the time the
data was loaded with *Refresh* to load it again. A fixed-size page has *Fit to window*, which scales it down.

## Links keep the view

The viewer keeps the whole view in the link: the page, selections, slicers, drill levels and parameter values. Copy
the address to share exactly what you see. See [view state](../reference/view-state).
