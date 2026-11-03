// Themes: JSON design tokens compiled to CSS custom properties on `.sb-report`.
// Visuals only ever reference the variables, so a theme switch is a stylesheet swap: no re-query,
// no re-render.
import type { PageLayout, Theme } from '../core/types.js';
import smalt from '../../themes/smalt.theme.json';
import paper from '../../themes/paper.theme.json';
import midnight from '../../themes/midnight.theme.json';

export const BUILTIN_THEMES: Record<string, Theme> = {
  smalt: smalt as Theme,
  paper: paper as Theme,
  midnight: midnight as Theme,
};

export const DEFAULT_PAGE: PageLayout = { width: 1280, rows: 12, columns: 12, rowHeight: 56, gap: 12, fit: 'width' };

/** Merge `over` onto `base`, one level deep for the object-valued token groups. */
export function mergeTheme(base: Theme, over: Partial<Theme>): Theme {
  const out: Theme = { ...base, ...over, name: over.name ?? base.name };
  for (const k of ['colors', 'fonts', 'sizes', 'visual', 'page'] as const) {
    if (base[k] || over[k]) (out as unknown as Record<string, unknown>)[k] = { ...(base[k] ?? {}), ...(over[k] ?? {}) };
  }
  if (base.dark || over.dark) {
    out.dark = { ...(base.dark ?? {}), ...(over.dark ?? {}) };
    if (base.dark?.colors || over.dark?.colors) out.dark.colors = { ...(base.dark?.colors ?? {}), ...(over.dark?.colors ?? {}) };
  }
  if (over.css && base.css) out.css = base.css + '\n' + over.css;
  delete out.extends;
  return out;
}

/** Resolve a theme reference (built-in name, URL, or inline object with optional `extends`). */
export async function loadTheme(ref: Theme | string | undefined, base?: string): Promise<Theme> {
  const root = BUILTIN_THEMES.smalt!;
  if (!ref) return root;
  if (typeof ref === 'string') {
    const builtin = BUILTIN_THEMES[ref.toLowerCase()];
    if (builtin) return mergeTheme(root, builtin);
    const url = new URL(ref, base ?? globalThis.location?.href).href;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`cannot load theme ${url}: HTTP ${r.status}`);
    return loadTheme((await r.json()) as Theme, url);
  }
  const parent = ref.extends ? await loadTheme(ref.extends, base) : root;
  return mergeTheme(parent, ref);
}

/** The page layout of a page, falling back to the theme's page settings. */
export function pageLayout(theme: Theme, page?: { layout?: Partial<PageLayout> }): PageLayout {
  return { ...DEFAULT_PAGE, ...(theme.page ?? {}), ...(page?.layout ?? {}) } as PageLayout;
}

const px = (n: number | undefined, d: number) => `${n ?? d}px`;

function colorVars(t: Pick<Theme, 'colors' | 'palette' | 'sequential' | 'diverging'>): string[] {
  const out: string[] = [];
  const c = t.colors ?? {};
  const map: Record<string, string | undefined> = {
    bg: c.background,
    surface: c.surface,
    text: c.text,
    muted: c.muted,
    border: c.border,
    grid: c.grid,
    accent: c.accent,
    pos: c.positive,
    neg: c.negative,
    neutral: c.neutral,
    sel: c.selection,
    'on-mark': c.onMark,
  };
  for (const [k, v] of Object.entries(map)) if (v) out.push(`--sb-${k}:${v}`);
  (t.palette ?? []).forEach((v, i) => out.push(`--sb-c${i}:${v}`));
  if (t.palette?.length) {
    // Fill 12 slots by cycling, so `.sb-c0` … `.sb-c11` always resolve.
    for (let i = t.palette.length; i < 12; i++) out.push(`--sb-c${i}:${t.palette[i % t.palette.length]}`);
  }
  const seq = t.sequential;
  if (seq?.length) out.push(`--sb-seq-lo:${seq[0]}`, `--sb-seq-hi:${seq[seq.length - 1]}`);
  const div = t.diverging;
  if (div?.length) out.push(`--sb-div-lo:${div[0]}`, `--sb-div-mid:${div[Math.floor(div.length / 2)]}`, `--sb-div-hi:${div[div.length - 1]}`);
  return out;
}

/** Compile a theme to a stylesheet scoped to `scope` (default `.sb-themed`: the report and any chrome around it). */
export function themeCss(t: Theme, scope = '.sb-themed'): string {
  const v = t.visual ?? {};
  const s = t.sizes ?? {};
  const f = t.fonts ?? {};
  const p = t.page ?? {};
  const vars = [
    ...colorVars(t),
    `--sb-font:${f.body ?? 'system-ui, sans-serif'}`,
    `--sb-font-heading:${f.heading ?? f.body ?? 'system-ui, sans-serif'}`,
    `--sb-font-num:${f.numeric ?? f.body ?? 'system-ui, sans-serif'}`,
    `--sb-fs:${px(s.base, 13)}`,
    `--sb-fs-title:${px(s.title, 14)}`,
    `--sb-fs-sub:${px(s.subtitle, 12)}`,
    `--sb-fs-label:${px(s.label, 11)}`,
    `--sb-fs-kpi:${px(s.kpi, 34)}`,
    `--sb-fs-small:${px(s.small, 10)}`,
    `--sb-radius:${px(v.radius, 8)}`,
    `--sb-pad:${px(v.padding, 12)}`,
    `--sb-vborder:${v.border ?? '1px solid var(--sb-border)'}`,
    `--sb-shadow:${v.shadow ?? 'none'}`,
    `--sb-title-align:${v.titleAlign ?? 'left'}`,
    `--sb-title-weight:${v.titleWeight ?? 600}`,
    `--sb-bar-radius:${v.barRadius ?? 2}`,
    `--sb-line-width:${v.lineWidth ?? 2}`,
    `--sb-marker:${v.markerSize ?? 3}`,
    `--sb-gridlines:${v.gridlines === false ? 0 : 1}`,
    `--sb-gap:${px(p.gap, 12)}`,
    `--sb-page-pad:${px(p.padding, 16)}`,
  ];
  if (p.background) vars.push(`--sb-page-bg:${p.background}`);
  let css = `${scope}{${vars.join(';')}}\n`;
  if (t.dark) {
    const dv = colorVars(t.dark).join(';');
    css += `@media (prefers-color-scheme: dark){${scope}:not([data-mode=light]){${dv}}}\n${scope}[data-mode=dark]{${dv}}\n`;
  }
  for (const url of f.imports ?? []) {
    // Only https stylesheets; prepended as @import must come first.
    if (/^https:\/\//.test(url)) css = `@import url(${JSON.stringify(url)});\n` + css;
  }
  if (t.css) css += t.css + '\n';
  return css;
}

/** Install (or replace) a theme's stylesheet in a document. */
export function applyTheme(t: Theme, doc: Document = document, id = 'sb-theme', scope?: string): void {
  let el = doc.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = doc.createElement('style');
    el.id = id;
    doc.head.appendChild(el);
  }
  el.textContent = themeCss(t, scope);
}

/** Read the number of palette colors (for cycling series classes). */
export function paletteSize(t: Theme): number {
  return Math.max(1, Math.min(12, t.palette?.length ?? 12));
}
