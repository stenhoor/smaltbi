# Plugins

A plugin adds visual types to smaltbi: a Sankey, a Gantt chart, a bullet chart. It is one JavaScript file that a
report names and pins by its hash.

## Add a plugin

**File → Plugins…** adds a plugin by the URL of its file: smaltbi fetches it, records its hash and loads it. Its visuals
appear at the end of the visual gallery.

- **Pinned:** the file must match its hash; if it changes, it no longer loads. Publish a new file (a new name) for a
  new version.
- **CORS:** the plugin's host must allow cross-origin requests (`Access-Control-Allow-Origin`), since smaltbi fetches
  the file to check it.
- **Asking:** a report from another site asks the reader before its plugins run (the answer is remembered for that
  URL and hash). A published report carries copies of its plugins (`plugins/` in the site), so its readers are not
  asked.
- **Failures:** a plugin that fails to load never stops the report; its visuals say the plugin is missing.

## Why plugins

smaltbi's core depends on smaltdb and nothing else at run time. Before any third-party package is used, it is
evaluated as a **plugin**:

1. Can it be done in a few hundred lines of our own code? Then write it (the zip writer, the treemap layout and the
   markdown subset are examples).
2. Otherwise it becomes a plugin: an ES module, loaded only when a report asks for it, that talks to smaltbi through a
   documented API. Its licence stays with it; the core stays MIT and small.
3. Server-side features (refresh schedules, sharing, sign-in, row-level security) are plugins or a wrapper environment
   around the static app, never core.

## Planned kinds

Visuals are the only plugin kind today. Planned: data connectors (new data step kinds, such as REST APIs with paging),
expression languages (an alternative to SQL measures), exports (PDF, PNG, PowerPoint) and hosts (scheduled refresh,
sharing, row-level security).

## What's next

[The plugin API](../reference/plugin-api): write a plugin, with a complete example.
