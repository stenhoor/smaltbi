// The published-report viewer: loads report.json (or ?report=url), builds its database in the
// visitor's browser, and renders it read-only with interactions. No server involved.
import '../visuals/index.js';
import type { Report } from '../core/types.js';
import { ReportSession } from '../report/session.js';
import { ReportView } from '../report/view.js';
import { poweredByBadge, viewerBar } from '../report/chrome.js';
import { stateFromHash, writeHash } from '../report/state.js';
import { applyTheme } from '../theme/theme.js';
import { h } from 'smaltkit/dom';
import { corsHint } from 'smaltkit/urls';

async function main(): Promise<void> {
  const app = document.getElementById('app')!;
  const status = h('div.sbv-loading', {}, h('div.sbv-spinner'), h('div', {}, 'Loading report…'));
  app.replaceChildren(status);
  const say = (t: string) => (status.lastElementChild!.textContent = t);
  const url = new URL(new URLSearchParams(location.search).get('report') ?? 'report.json', location.href).href;
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`cannot load ${url}: HTTP ${r.status}`);
    const report = (await r.json()) as Report;
    document.title = report.name;
    say('Loading data…');
    const session = await ReportSession.open(report, url, { log: (_l, t) => say(t) });
    applyTheme(session.theme, document, 'sb-theme-chrome');
    document.body.classList.add('sb-themed');
    const host = h('main.sbv-host');
    let bar: ReturnType<typeof viewerBar> | undefined;
    const view = new ReportView(session, host, { mode: 'view', onState: (s) => (writeHash(s), bar?.renderTabs()) }, stateFromHash() ?? undefined);
    bar = viewerBar(view);
    app.replaceChildren(...[bar, host, poweredByBadge(report)].filter((x): x is HTMLElement => !!x));
    view.render();
    addEventListener('hashchange', () => {
      const s = stateFromHash();
      if (s) view.setState(s);
    });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    app.replaceChildren(h('div.sbv-loading.sbv-failed', {}, h('h2', {}, 'This report could not be opened'), h('p', {}, msg), corsHint(msg) ? h('p', {}, corsHint(msg)) : null));
    console.error(e);
  }
}

void main();
