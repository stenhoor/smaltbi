// The Map visual: filled regions coloured by a measure, or points by latitude and longitude, drawn by smaltkit/maps.
// Shapes are a GeoJSON or TopoJSON file the report names (options.shapes, relative to the report like a data file);
// none ship with smaltbi. The file is fetched once per page and the map draws again when it arrives.
import { mapChart } from 'smaltkit/maps';
import { chartContext, registerVisual, type RenderContext } from './api.js';
import { ICONS } from './icons.js';

const shapes = new Map<string, { data?: unknown; error?: string; waiting: Set<() => void> }>();

/** The parsed shapes file at url, or undefined while it loads (then `redraw` runs once it has). */
function shapesAt(url: string, redraw: () => void): { data?: unknown; error?: string } {
  let entry = shapes.get(url);
  if (!entry) {
    const e: { data?: unknown; error?: string; waiting: Set<() => void> } = { waiting: new Set() };
    entry = e;
    shapes.set(url, e);
    void fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        e.data = await r.json();
      })
      .catch((err: Error) => (e.error = `cannot load ${url}: ${err.message}`))
      .finally(() => {
        for (const fn of e.waiting) fn();
        e.waiting.clear();
      });
  }
  if (entry.data === undefined && !entry.error) entry.waiting.add(redraw);
  return entry;
}

function render(ctx: RenderContext): void {
  const file = typeof ctx.options.shapes === 'string' ? ctx.options.shapes.trim() : '';
  let data: unknown;
  if (file) {
    let url: string;
    try {
      url = new URL(file, ctx.base ?? location.href).href;
    } catch {
      ctx.el.innerHTML = `<div class="sk-empty">The shapes file "${file.replace(/[<&"]/g, '')}" is not a URL or path</div>`;
      return;
    }
    const got = shapesAt(url, () => ctx.el.isConnected && render(ctx));
    if (got.error) {
      ctx.el.innerHTML = `<div class="sb-error">${got.error.replace(/[<&]/g, '')}</div>`;
      return;
    }
    if (got.data === undefined) {
      ctx.el.innerHTML = '<div class="sk-empty">Loading shapes…</div>';
      return;
    }
    data = got.data;
  }
  mapChart({ ...chartContext(ctx), options: { ...ctx.options, shapes: data } });
}

registerVisual({
  type: 'map',
  label: 'Map',
  group: 'advanced',
  icon: ICONS.map!,
  roles: [
    { name: 'location', label: 'Location', kind: 'dimension', max: 1 },
    { name: 'latitude', label: 'Latitude', kind: 'dimension', max: 1 },
    { name: 'longitude', label: 'Longitude', kind: 'dimension', max: 1 },
    { name: 'values', label: 'Colour by', kind: 'measure', max: 1 },
    { name: 'size', label: 'Size by', kind: 'measure', max: 1 },
  ],
  options: [
    { key: 'shapes', label: 'Shapes file (GeoJSON or TopoJSON)', type: 'text', default: '' },
    { key: 'key', label: 'Match locations on property', type: 'text', default: 'name' },
    { key: 'object', label: 'TopoJSON object', type: 'text', default: '' },
    { key: 'projection', label: 'Projection', type: 'select', choices: [['mercator', 'Mercator'], ['equirectangular', 'Equirectangular']], default: 'mercator' },
    { key: 'legend', label: 'Legend', type: 'bool', default: true },
  ],
  sort: 'category',
  limit: 5000,
  render,
});
