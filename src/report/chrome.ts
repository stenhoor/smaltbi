// The bar above a report in view mode: title, page tabs, bookmarks, reset, color mode.
// Used by the published viewer and the designer's preview.
import type { ViewState } from '../core/types.js';
import { h, showMenu, toast } from 'smaltkit/dom';
import type { ReportView } from './view.js';
import { MODE_ICONS } from '../visuals/icons.js';

export type ColorMode = 'auto' | 'light' | 'dark';

/**
 * The light / dark / automatic switch, shared by the viewer and the designer. The choice is kept in localStorage
 * (`smaltbi.mode`), so it carries over between them and from the product site, whose own switch writes the same key;
 * a change made in another page of the site arrives as a storage event. `apply` runs now and on every change.
 */
export function colorModeButton(selector: string, apply: (mode: ColorMode) => void): HTMLElement {
  const modes: ColorMode[] = ['auto', 'light', 'dark'];
  let mode = 0;
  try {
    mode = Math.max(0, modes.indexOf((localStorage.getItem('smaltbi.mode') as ColorMode) ?? 'auto'));
  } catch {}
  const btn = h(selector, { title: 'Light, dark or automatic' });
  const show = () => {
    const m = modes[mode]!;
    apply(m);
    btn.innerHTML = `${MODE_ICONS[m]}<span>${{ auto: 'Auto', light: 'Light', dark: 'Dark' }[m]}</span>`;
    btn.setAttribute('aria-label', `Colour mode: ${m} (click to change)`);
  };
  addEventListener('storage', (e) => {
    if (e.key !== 'smaltbi.mode') return;
    const i = modes.indexOf((e.newValue as ColorMode) ?? 'auto');
    mode = i < 0 ? 0 : i;
    show();
  });
  btn.addEventListener('click', () => {
    mode = (mode + 1) % 3;
    try {
      localStorage.setItem('smaltbi.mode', modes[mode]!);
    } catch {}
    show();
  });
  show();
  return btn;
}

/** `mode: false` leaves the colour-mode switch out (the designer's preview, whose top bar has one). */
export function viewerBar(view: ReportView, opts: { extra?: HTMLElement[]; mode?: boolean } = {}): HTMLElement & { renderTabs(): void; refresh(): Promise<void> } {
  const report = view.report;
  const tabs = h('nav.sbv-tabs', { role: 'tablist' });
  const renderTabs = () => {
    showFit();
    tabs.replaceChildren(
      ...report.pages
        .filter((p) => !p.hidden && !p.drillthrough?.length)
        .map((p) => h('button.sbv-tab' + (p.id === view.state.page ? '.sbv-on' : ''), { role: 'tab', 'aria-selected': p.id === view.state.page, onclick: () => view.goTo(p.id) }, p.name)),
    );
  };
  // Fit to window (fixed-size pages only): the reader's choice, remembered in this browser.
  const FIT_KEY = 'smaltbi.fitPage';
  try {
    view.setFitPage(localStorage.getItem(FIT_KEY) === '1');
  } catch {}
  const fitBtn = h('button.sbv-btn.sbv-fit', {
    onclick: () => {
      view.setFitPage(!view.fitPage);
      try {
        localStorage.setItem(FIT_KEY, view.fitPage ? '1' : '0');
      } catch {}
      showFit();
    },
  });
  const showFit = () => {
    fitBtn.hidden = !view.fixedPage;
    fitBtn.textContent = view.fitPage ? '⤢ 100%' : '⤡ Fit to window';
    fitBtn.title = view.fitPage ? 'Show the page at full size (scroll to see all of it)' : 'Scale the page down to fit the window';
    fitBtn.setAttribute('aria-pressed', String(view.fitPage));
  };
  // Refresh: the data steps run again; the label says when the data was loaded.
  const fresh = h('span.sbv-fresh');
  const showFresh = () => {
    const at = view.session.loadedAt;
    fresh.textContent = `Data from ${at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
    fresh.title = `Loaded ${at.toLocaleString()}`;
  };
  const refresh = async () => {
      if (refreshBtn.hasAttribute('disabled')) return;
      refreshBtn.setAttribute('disabled', '');
      refreshBtn.classList.add('sbv-busy');
      try {
        await view.refreshData();
      } catch (e) {
        toast(`The data could not be refreshed: ${(e as Error).message}`, 'error', 8000);
      } finally {
        refreshBtn.removeAttribute('disabled');
        refreshBtn.classList.remove('sbv-busy');
        showFresh();
      }
  };
  const refreshBtn: HTMLElement = h('button.sbv-btn.sbv-refresh', { title: 'Load the data again', onclick: () => void refresh() }, '↻ Refresh');
  showFresh();
  renderTabs();
  showFit();
  const modeBtn = opts.mode === false
    ? null
    : colorModeButton('button.sbv-btn.sbv-mode', (m) => {
        view.setColorMode(m);
        if (m === 'auto') document.body.removeAttribute('data-mode');
        else document.body.dataset.mode = m;
      });
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
      fresh,
      refreshBtn,
      fitBtn,
      h('button.sbv-btn', { title: 'Clear all selections and slicers', onclick: () => view.clearSelections() }, '↺ Reset'),
      modeBtn,
      ...(opts.extra ?? []),
    ),
  );
  return Object.assign(bar, { renderTabs, refresh });
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
