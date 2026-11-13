# ADR 0008: Loading plugins

Date: 2026-11-13. Status: proposed (the session's defaults; the owner may change them).

## Context

0.3 starts with plugins (ROADMAP): a report lists ES modules that add visuals, and the viewer and designer load them
before the report renders. A plugin is JavaScript from another site that runs with the page's full rights: it can read
what the page can, including the designer's autosaved report. The core's rule on outside code (CLAUDE.md) puts such
code in named, optional plugins. This ADR is about how they load.

## Decisions

1. **A plugin is one ES module file** that exports `setup(api)` (or a default object `{ name, apiVersion, setup }`, or
   a default function). It has no imports; `api` gives it `registerVisual`, smaltkit (`api.kit`), `chartContext` and
   shared option definitions. The plugin API is version 1 (`PLUGIN_API_VERSION`).
2. **Every plugin is pinned by its hash.** A report lists `{ url, integrity, name? }`; `integrity` is an SRI value
   (`sha384-…`, as the designer records it). The loader fetches the file, checks the hash and imports it from a blob
   URL. A plugin without a hash, or whose file has changed, is not loaded.
3. **Plugins from elsewhere run only after a yes.** A report from the page's own site loads its plugins without asking
   (its author published them together). A report from another site (a `?report=` link, Open from URL) first asks
   "This report uses plugins", listing their URLs, and can open without them. A yes is remembered in that browser for
   that URL and hash.
4. **Plugin visuals are namespaced** (`acme.bullet`), cannot replace a built-in or another plugin's type, and show at
   the end of the visual gallery (group `plugin`).
5. **Failures are not fatal.** A plugin that cannot be fetched, does not match, or throws in `setup` is reported (a
   toast, the console); the report renders, and a visual of a missing type says its plugin is not loaded.
6. **Publishing copies plugins into the site** (`plugins/`), checking their hashes, so a published report is
   self-contained, loads its plugins from its own site and does not ask its readers.

## Consequences

- `docs/PLUGINS.md` documents writing a plugin; `examples/plugins/bullet.js` is a working example, used by the e2e test.
- Other plugin kinds (data connectors, export) will extend the same API (`api.register…`) under a new API version.
