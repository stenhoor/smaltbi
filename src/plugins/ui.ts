// Asking before plugins from elsewhere run, and saying which failed: shared by the viewer and the designer.
import type { PluginRef } from '../core/types.js';
import { dialog, h, toast } from 'smaltkit/dom';
import { loadPlugins, trustPlugins, untrustedPlugins, type FailedPlugin } from './loader.js';

/**
 * Load a report's plugins before it renders. Plugins from another site than this page's, not allowed before, run only
 * if the person says so; otherwise the report opens without them. Returns the plugins that failed.
 */
export async function preparePlugins(refs: PluginRef[] | undefined, base: string): Promise<FailedPlugin[]> {
  if (!refs?.length) return [];
  let allowed = refs;
  const ask = untrustedPlugins(refs, base);
  if (ask.length) {
    const ok = await dialog<boolean>(
      'This report uses plugins',
      h(
        'div.sb-plugin-ask',
        {},
        h('p', {}, 'Plugins are code from other sites that add visuals to the report. They run with the same rights as this page. Load them only if you trust where they come from:'),
        h('ul', {}, ...ask.map((r) => h('li', {}, h('code', {}, new URL(r.url, base).href)))),
      ),
      [{ label: 'Open without them' }, { label: 'Load plugins', primary: true, value: () => true }],
    );
    if (ok) trustPlugins(ask, base);
    else allowed = refs.filter((r) => !ask.includes(r));
  }
  const { failed } = await loadPlugins(allowed, base);
  const skipped = refs.filter((r) => !allowed.includes(r)).map((r) => ({ ref: r, url: new URL(r.url, base).href, error: 'not allowed' }));
  if (failed.length) toast(`${failed.length === 1 ? 'A plugin' : `${failed.length} plugins`} did not load: ${failed.map((f) => `${f.ref.name ?? f.url} (${f.error})`).join('; ')}`, 'error', 10000);
  return [...failed, ...skipped];
}
