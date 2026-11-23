# Reference

The formats smaltbi reads and writes, and its shortcuts.

## The report format

A report is one JSON file. The TypeScript definitions in [`src/core/types.ts`](../../src/core/types.ts) are the
reference; these pages explain them, an object per page.

| Page | What it covers |
|---|---|
| [Report](./report) | The file's top level: name, data, model, theme, filters, pages, bookmarks, plugins |
| [Data](./data) | `data`: the database and the steps that build it |
| [Model](./model) | `model`: relationships, measures, calculated columns, hierarchies, the date table, parameters |
| [Formats](./formats) | Number and date formats, by preset name or object |
| [Page](./page) | A page: its visuals, filters, grid, fixed size, phone order, drill-through |
| [Visual](./visual) | A visual: fields, options, sort, custom SQL, interactions, repeat, conditional formatting |
| [Visual types](./visual-types) | Every built-in type, with its roles and options |
| [Filters](./filters) | Report, page and visual filters, and their operators |
| [View state](./view-state) | Bookmarks and the view kept in the URL |

## Other formats

| Page | What it covers |
|---|---|
| [Themes](./themes) | `.theme.json`: every token and the CSS variable it becomes |
| [Plugin API](./plugin-api) | A plugin file: `setup(api)`, `registerVisual`, and what a visual's `render` gets |
| [Shortcuts](./shortcuts) | Keys and mouse in the designer, the model view and the viewer |
