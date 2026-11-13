// File → Plugins…: the report's plugins (ADR 0008). Adding one by URL fetches it, records its integrity hash, loads it
// and lists the visuals it adds; they appear in the visual gallery's Plugins group.
import type { PluginRef } from '../core/types.js';
import { dialog, h, toast } from 'smaltkit/dom';
import { fetchPlugin, integrityOf, loadPlugin, trustPlugins } from '../plugins/loader.js';
import { visualDefs } from '../visuals/index.js';
import type { DialogContext } from './dialogs.js';

export async function pluginsDialog(ctx: DialogContext, onChange: () => void): Promise<void> {
  const list = h('div.sbd-plugins');
  const base = ctx.store.base;
  const pluginVisuals = () => visualDefs().filter((d) => d.group === 'plugin').map((d) => d.label);
  const render = () => {
    const refs = ctx.store.report.plugins ?? [];
    list.replaceChildren(
      ...(refs.length
        ? refs.map((r, i) =>
            h(
              'div.sbd-plugin',
              {},
              h('div.sbd-plugin-main', {}, h('b', {}, r.name ?? r.url.split('/').pop() ?? r.url), h('code.sbd-plugin-url', { title: r.integrity }, new URL(r.url, base).href)),
              h(
                'button.sbd-chip-btn',
                {
                  title: 'Remove the plugin (its visuals stop working when the report is opened again)',
                  onclick: () => {
                    ctx.store.change('report', (rep) => {
                      rep.plugins = (rep.plugins ?? []).filter((_, j) => j !== i);
                      if (!rep.plugins.length) delete rep.plugins;
                    });
                    render();
                  },
                },
                '×',
              ),
            ),
          )
        : [h('div.sbd-hint', {}, 'No plugins. A plugin is one JavaScript module file that adds visuals: give its URL below.')]),
      ...(pluginVisuals().length ? [h('div.sbd-hint', {}, `Plugin visuals: ${pluginVisuals().join(', ')} (at the end of the visual gallery).`)] : []),
    );
  };
  const url = h('input.sbd-input.sbd-plugin-input', { type: 'url', placeholder: 'https://…/plugin.js', spellcheck: false }) as HTMLInputElement;
  const add = async () => {
    const raw = url.value.trim();
    if (!raw) return;
    let abs: string;
    try {
      abs = new URL(raw, base).href;
    } catch {
      return toast('That is not a URL', 'error');
    }
    if ((ctx.store.report.plugins ?? []).some((r) => new URL(r.url, base).href === abs)) return toast('That plugin is already in the report', 'error');
    try {
      const bytes = await fetchPlugin(abs);
      const ref: PluginRef = { url: raw, integrity: await integrityOf(bytes) };
      const loaded = await loadPlugin(ref, base);
      trustPlugins([ref], base);
      ctx.store.change('report', (rep) => (rep.plugins = [...(rep.plugins ?? []), ref]));
      url.value = '';
      render();
      onChange();
      toast(`${loaded.name} added: ${loaded.visuals.length ? loaded.visuals.map((t) => visualDefs().find((d) => d.type === t)?.label ?? t).join(', ') : 'no visuals'}`, 'ok');
    } catch (e) {
      toast(`Could not add the plugin: ${(e as Error).message}`, 'error', 8000);
    }
  };
  url.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), void add()));
  render();
  await dialog(
    'Plugins',
    h(
      'div.sbd-form',
      {},
      h('div.sbd-hint', {}, 'Plugins are code from other sites that runs with the same rights as the report. Add only plugins you trust. Each is pinned by its hash: if the file changes, it no longer loads.'),
      list,
      h('div.sbd-row', {}, url, h('button.sbd-btn.sbd-plugin-add', { onclick: () => void add() }, 'Add')),
    ),
    [{ label: 'Done', primary: true }],
  );
}
