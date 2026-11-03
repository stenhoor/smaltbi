// The bar above a report in view mode: title, page tabs, bookmarks, reset, color mode.
// Used by the published viewer and the designer's preview.
import type { ViewState } from '../core/types.js';
import { h, showMenu } from 'smaltkit/dom';
import type { ReportView } from './view.js';
import { MODE_ICONS } from '../visuals/icons.js';

export function viewerBar(view: ReportView, opts: { extra?: HTMLElement[] } = {}): HTMLElement & { renderTabs(): void } {
  const report = view.report;
  const tabs = h('nav.sbv-tabs', { role: 'tablist' });
  const renderTabs = () => {
    tabs.replaceChildren(
      ...report.pages
        .filter((p) => !p.hidden && !p.drillthrough?.length)
        .map((p) => h('button.sbv-tab' + (p.id === view.state.page ? '.sbv-on' : ''), { role: 'tab', 'aria-selected': p.id === view.state.page, onclick: () => view.goTo(p.id) }, p.name)),
    );
  };
  renderTabs();
  const modes: ('auto' | 'light' | 'dark')[] = ['auto', 'light', 'dark'];
  let mode = 0;
  try {
    mode = Math.max(0, modes.indexOf((localStorage.getItem('smaltbi.mode') as 'auto') ?? 'auto'));
  } catch {}
  const modeBtn = h('button.sbv-btn.sbv-mode', { title: 'Light, dark or automatic' });
  const applyMode = () => {
    view.setColorMode(modes[mode]!);
    document.body.dataset.mode = modes[mode] === 'auto' ? '' : modes[mode]!;
    if (modes[mode] === 'auto') document.body.removeAttribute('data-mode');
    const m = modes[mode]!;
    modeBtn.innerHTML = `${MODE_ICONS[m]}<span>${{ auto: 'Auto', light: 'Light', dark: 'Dark' }[m]}</span>`;
    modeBtn.setAttribute('aria-label', `Colour mode: ${m} (click to change)`);
  };
  // Another page of the site (the landing page around an embedded report) changed the setting.
  addEventListener('storage', (e) => {
    if (e.key !== 'smaltbi.mode') return;
    const i = modes.indexOf((e.newValue as 'auto') ?? 'auto');
    mode = i < 0 ? 0 : i;
    applyMode();
  });
  modeBtn.addEventListener('click', () => {
    mode = (mode + 1) % 3;
    try {
      localStorage.setItem('smaltbi.mode', modes[mode]!);
    } catch {}
    applyMode();
  });
  applyMode();
  const bookmarks = report.bookmarks ?? [];
  const bar = h(
    'header.sbv-bar',
    {},
    h('div.sbv-title', {}, brandMark(report), h('span.sbv-name', {}, report.name)),
    tabs,
    h(
      'div.sbv-actions',
      {},
      bookmarks.length
        ? h(
            'button.sbv-btn',
            {
              onclick: (e: Event) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                showMenu(
                  r.left,
                  r.bottom + 4,
                  bookmarks.map((b) => ({ label: b.name, action: () => view.setState(structuredClone(b.state) as ViewState) })),
                );
              },
            },
            '☆ Bookmarks',
          )
        : null,
      h('button.sbv-btn', { title: 'Clear all selections and slicers', onclick: () => view.clearSelections() }, '↺ Reset'),
      modeBtn,
      ...(opts.extra ?? []),
    ),
  );
  return Object.assign(bar, { renderTabs });
}

/**
 * The smaltbi Scatter mark before the report name (smalt-brand logos/smaltbi). Hidden with the badge
 * when a report turns branding off (`branding.poweredBy: false`).
 */
function brandMark(report: { branding?: { poweredBy?: boolean } }): HTMLElement | null {
  if (report.branding?.poweredBy === false) return null;
  return h(
    'span.sbv-mark',
    { title: 'smaltbi' },
    h('img.sbv-mark-light', { src: 'brand/scatter-mark.svg', alt: '', width: 22, height: 22 }),
    h('img.sbv-mark-dark', { src: 'brand/scatter-mark-on-dark.svg', alt: '', width: 22, height: 22 }),
  );
}

/** Link of the "Powered by smaltbi" badge (smalt-brand badges/README.md). */
export const POWERED_BY_URL = 'https://github.com/stenhoor/smaltbi';

/**
 * The "Powered by smaltbi" badge from stenhoor/smalt-brand (copied into brand/), light and dark
 * variants switched by the viewer's colour mode. null when the report turns it off.
 */
export function poweredByBadge(report: { branding?: { poweredBy?: boolean } }, base = ''): HTMLElement | null {
  if (report.branding?.poweredBy === false) return null;
  return h(
    'footer.sbv-foot',
    {},
    h(
      'a.sbv-badge',
      { href: POWERED_BY_URL, target: '_blank', rel: 'noopener', title: 'smaltbi: business intelligence in the browser, powered by smaltdb' },
      h('img.sbv-badge-light', { src: base + 'brand/powered-by-smaltbi.svg', alt: 'Powered by smaltbi', width: 172, height: 28 }),
      h('img.sbv-badge-dark', { src: base + 'brand/powered-by-smaltbi-on-dark.svg', alt: 'Powered by smaltbi', width: 172, height: 28 }),
    ),
  );
}
