---
description: "Publish a report as a static site, from the designer or from a script, and where to host it."
---

# Publishing

*Publish* in the designer downloads a ZIP of a static site: the viewer, the engine, `report.json` and its data. Unzip
it onto GitHub Pages, Netlify, S3 or any web server; readers' browsers build the data and run the report. There is
no server to run.

## From a script

In a pipeline, after `npm run build`:

```bash
node scripts/publish.mjs report.json out/
```

It copies the viewer, the engine, the report and every file its data steps read. Files kept in a browser (`local:`)
exist only there: publish those reports from the designer.

## Open a published report

Serve the folder from a web server and open `index.html`. Opened straight from disk (`file://`), it does not work:
browsers block module workers and data fetches there. For a quick look, `npm run serve <folder>`.

The ZIP has a `_headers` file, which Netlify and Cloudflare Pages read: it makes the page cross-origin isolated (COOP
and COEP headers), so smaltdb can use parallel readers. Without the headers the report still runs; this site, on
GitHub Pages, runs without them.

## Branding

Published reports show the "Powered by smaltbi" badge; turn it off in the Publish dialog (`branding.poweredBy:
false`).
