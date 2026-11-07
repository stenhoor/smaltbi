---
layout: home

hero:
  name: 'sm<span class="alt">alt</span><span class="suffix tool">bi</span>'
  text: Small. Alternative. Insight.
  tagline: Business intelligence in the browser, powered by smaltdb.
  image:
    light: /scatter-mark.svg
    dark: /scatter-mark-on-dark.svg
    alt: smaltbi
  actions:
    - theme: brand
      text: Open the designer
      link: /designer.html?report=examples/sales/report.json
      target: _self
    - theme: alt
      text: View the published sample
      link: /sample/
      target: _self
    - theme: alt
      text: Getting started
      link: /guide/

features:
  - title: Drag fields, get charts
    details: Drop a field on the canvas and smaltbi picks a visual. Change its type, add fields to its axis, legend or values, and format it from the side panel.
  - title: Model with SQL
    details: Relationships, measures written as SQL aggregates that build on each other ([Revenue] - [Cost]), calculated columns and drill hierarchies. The model view draws it all as a diagram.
    link: /REPORT_FORMAT#model
    linkText: The model
  - title: Every visual shows its SQL
    details: Each chart runs one readable query, joined along your relationships. Open the SQL tab to see it, copy it, or replace it with your own.
    link: /ARCHITECTURE#from-a-visual-to-sql
    linkText: How it works
  - title: Interactive reports
    details: Cross-filtering, slicers, report, page and visual filters, drill down and drill-through, tooltips, bookmarks, and the view state in the link.
  - title: Themes
    details: Portable theme files set colours, palettes, fonts and layout, in light and dark. Switching themes never re-runs a query.
    link: /THEMES
    linkText: Themes
  - title: Publish a static site
    details: A report is one JSON file that diffs well in git. Publishing packs it with the viewer, smaltdb and its data into a folder for any static host.
    link: /guide/#publish
    linkText: Publishing
---

## Your data stays in your browser

smaltbi runs on [smaltdb](https://smaltdb.dev), the smaltworks engine, in a Web Worker: data stays in memory or in the
browser's private storage (OPFS), and the page fetches only the files a report loads. There is no server to set up.
smaltbi is one of the [smaltworks](https://smaltworks.dev) tools, beside the [smaltui](https://stenhoor.github.io/smaltui/)
query workbench and [smaltnb](https://stenhoor.github.io/smaltnb/) notebooks.
