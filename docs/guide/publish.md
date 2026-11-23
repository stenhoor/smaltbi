# Publishing

A published report is a static site: the viewer, the engine, `report.json` and every file its data steps read. Put it
on GitHub Pages, Netlify, S3 or any web server. Readers' browsers build the data and run the report; there is no
server to run.

## From the designer

**Publish** downloads a ZIP of the site. Unzip it onto any static host. Files you added from your computer (`local:`
data steps), map shapes and plugins are copied into it.

*Show the "Powered by smaltbi" badge* puts the badge in the viewer; untick it to leave it out (`branding.poweredBy:
false` in the report).

## From the command line

For a git-based workflow or CI, after `npm run build`:

```bash
node scripts/publish.mjs report.json out/
```

It copies the viewer (`dist/`), the engine (`vendor/smaltdb/`), the report and every file its data steps read.
Files that exist only in a browser (`local:` steps) can't be copied from the command line: publish those reports from
the designer.

## The viewer, without publishing

The viewer opens a report by URL, `viewer.html?report=<path or URL>`, as
<a href="../viewer.html?report=examples/sales/report.json" target="_self">the sample</a> does. Relative paths in the
report (data files, themes, plugins, map shapes) resolve against the report's own URL.
