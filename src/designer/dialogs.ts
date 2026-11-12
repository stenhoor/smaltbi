// Designer dialogs: data sources, the measure / calculated column editor, themes, and publishing.
// Relationships and hierarchies are edited in the model view (modelview.ts, modelpanel.ts).
import type { CalcColumn, DataStep, Format, Measure, SqlValue, Theme } from '../core/types.js';
import { formatter } from '../core/format.js';
import { compileQuery } from '../core/compile.js';
import { Model } from '../core/model.js';
import { BUILTIN_THEMES, mergeTheme } from '../theme/theme.js';
import { formatFromName } from 'smaltkit/manifest';
import { dialog, download, esc, fileName, h, pickFile, toast } from 'smaltkit/dom';
import { listOpfsDatabases } from '../report/engine.js';
import { localFiles } from '../kit/files.js';
import { normalizeDataUrl } from 'smaltkit/urls';
import { publishZip } from '../publish/publish.js';
import { checkbox, field, textInput } from './panel.js';
import { Editor } from 'smaltkit/editor';
import { errorRange, measureLanguage, modelSchema, referenceWarnings } from './measurelang.js';
import type { DocStore } from './store.js';
import type { ReportSession } from '../report/session.js';

export interface DialogContext {
  store: DocStore;
  session: ReportSession;
  appBase: string;
}

const FORMATS: [string, string][] = [
  ['', 'Default'],
  ['number', 'Number'],
  ['integer', 'Whole number'],
  ['decimal', 'Decimal (2)'],
  ['percent', 'Percent'],
  ['currency', 'Currency'],
  ['currency0', 'Currency, no cents'],
  ['compact', 'Compact (1.2K)'],
  ['currency-compact', 'Currency compact'],
  ['date', 'Date'],
  ['month', 'Month'],
  ['year', 'Year'],
];

function formatSelect(value: Format | undefined): HTMLSelectElement {
  const cur = typeof value === 'string' ? value : value ? 'custom' : '';
  const sel = h('select.sbd-input', {}, ...FORMATS.map(([v, l]) => h('option', { value: v, selected: cur === v }, l))) as HTMLSelectElement;
  if (cur === 'custom') sel.append(h('option', { value: '__keep', selected: true }, 'Custom (from JSON)'));
  return sel;
}

function readFormat(sel: HTMLSelectElement, old: Format | undefined): Format | undefined {
  if (sel.value === '__keep') return old;
  return sel.value || undefined;
}

// ------------------------------------------------------------------ data

function stepLabel(s: DataStep): string {
  if ('import' in s) return `Import ${s.import} → ${s.table}`;
  if ('link' in s) return `Link ${s.link} → ${s.table} (external)`;
  if ('sqlFile' in s) return `SQL file ${s.sqlFile}`;
  if ('sql' in s) return `SQL: ${s.sql.slice(0, 60)}${s.sql.length > 60 ? '…' : ''}`;
  if ('data' in s) return `Inline rows → ${s.table} (${s.data.length})`;
  if ('connection' in s) return `Connection ${s.connection}`;
  return 'Step';
}

export async function dataDialog(ctx: DialogContext): Promise<boolean> {
  const data = structuredClone(ctx.store.report.data);
  data.steps ??= [];
  const list = h('div.sbd-steps');
  const renderList = () => {
    list.replaceChildren(
      ...data.steps!.map((s, i) =>
        h(
          'div.sbd-step',
          {},
          h('span', {}, stepLabel(s)),
          h('button.sbd-chip-btn', { title: 'Remove', onclick: () => (data.steps!.splice(i, 1), renderList()) }, '×'),
        ),
      ),
    );
    if (!data.steps!.length) list.append(h('div.sbd-hint', {}, data.init === 'none' ? `Using the existing database “${data.database?.name}” as it is.` : 'No data yet.'));
  };
  renderList();
  const tableFrom = (name: string) => name.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '').replace(/[^\w]+/g, '_').toLowerCase() || 'data';

  const url = h('input.sbd-input', { placeholder: 'https://… .csv / .json / .parquet, or a path relative to the report' }) as HTMLInputElement;
  const urlTable = h('input.sbd-input', { placeholder: 'table name' }) as HTMLInputElement;
  const link = h('input', { type: 'checkbox' }) as HTMLInputElement;
  url.addEventListener('change', () => {
    const n = normalizeDataUrl(url.value);
    if (n.changed) {
      url.value = n.url;
      toast(n.note);
    }
    if (!urlTable.value) urlTable.value = tableFrom(url.value);
  });
  const addUrl = h('button.sbd-btn', {
    onclick: () => {
      if (!url.value || !urlTable.value) return toast('Enter a URL and a table name', 'error');
      const format = formatFromName(url.value);
      data.steps!.push(link.checked ? { link: url.value, table: urlTable.value, format } : { import: url.value, table: urlTable.value, format });
      url.value = urlTable.value = '';
      renderList();
    },
  }, 'Add');

  const addFile = h('button.sbd-btn', {
    onclick: async () => {
      const f = await pickFile('.csv,.tsv,.json,.ndjson,.jsonl,.parquet,.txt');
      if (!f) return;
      await localFiles.put(f.name, f);
      data.steps!.push({ import: 'local:' + f.name, table: tableFrom(f.name), format: formatFromName(f.name) });
      renderList();
    },
  }, 'Choose a file…');

  const sql = h('textarea.sbd-input.sbd-code', { rows: 3, placeholder: 'CREATE VIEW … AS SELECT …' }) as HTMLTextAreaElement;
  const addSql = h('button.sbd-btn', { onclick: () => sql.value.trim() && (data.steps!.push({ sql: sql.value }), (sql.value = ''), renderList()) }, 'Add SQL step');

  const dbs = await listOpfsDatabases();
  const dbSel = h('select.sbd-input', {}, h('option', { value: '' }, dbs.length ? 'Choose…' : 'No OPFS databases in this browser'), ...dbs.map((d) => h('option', { value: d, selected: data.init === 'none' && data.database?.name === d }, d))) as HTMLSelectElement;
  const useDb = h('button.sbd-btn', {
    onclick: () => {
      if (!dbSel.value) return;
      data.database = { name: dbSel.value, storage: 'opfs' };
      data.init = 'none';
      data.steps = [];
      renderList();
    },
  }, 'Use');
  const storage = h('select.sbd-input', {}, h('option', { value: 'memory', selected: (data.database?.storage ?? 'memory') === 'memory' }, 'In memory (rebuilt on open)'), h('option', { value: 'opfs', selected: data.database?.storage === 'opfs' }, 'Browser storage, OPFS (kept between visits)')) as HTMLSelectElement;

  const body = h(
    'div.sbd-form',
    {},
    h('div.sbd-section-title', {}, 'Steps (run in order to build the report database)'),
    list,
    h('div.sbd-section-title', {}, 'Add a file from a URL'),
    url,
    h('div.sbd-row', {}, urlTable, h('label.sbd-check', {}, link, h('span', {}, 'Link (query in place, no copy)')), addUrl),
    h('div.sbd-section-title', {}, 'Add a file from this computer'),
    h('div.sbd-row', {}, addFile, h('span.sbd-hint', {}, 'Kept in this browser; included when you publish.')),
    h('div.sbd-section-title', {}, 'Add SQL (views, cleanup, derived tables)'),
    sql,
    addSql,
    h('div.sbd-section-title', {}, 'Or report on an existing smaltdb database'),
    h('div.sbd-row', {}, dbSel, useDb),
    h('div.sbd-section-title', {}, 'Storage'),
    storage,
  );
  const ok = await dialog('Data', body, [{ label: 'Cancel' }, { label: 'Apply', primary: true, value: () => true }], { wide: true });
  if (!ok) return false;
  if (data.init !== 'none') data.database = { name: data.database?.name ?? fileName(ctx.store.report.name, 'report'), storage: storage.value as 'memory' | 'opfs' };
  ctx.store.change('data', (r) => (r.data = data));
  return true;
}

// ------------------------------------------------------------------ model

export async function measureDialog(ctx: DialogContext, table: string, name?: string, kind: 'measure' | 'column' = 'measure'): Promise<void> {
  const model = ctx.store.report.model;
  const listKey = kind === 'measure' ? 'measures' : 'columns';
  const list = (model[listKey] ??= []) as (Measure | CalcColumn)[];
  const existing = name ? list.find((m) => m.table === table && m.name === name) : undefined;
  const nameIn = h('input.sbd-input', { value: existing?.name ?? '', placeholder: kind === 'measure' ? 'Revenue' : 'Order Month' }) as HTMLInputElement;
  const tableSel = h('select.sbd-input', {}, ...[...ctx.session.model.tables.keys()].map((t) => h('option', { value: t, selected: t === table }, t))) as HTMLSelectElement;
  // The expression: smaltkit's SQL editor, completing from the model (measureLang.ts), checking [references] as you
  // type, and marking where a failed test points. Ctrl/Cmd+Enter tests.
  const sqlHost = h('div.sbd-code-editor');
  const sm = ctx.session.model;
  const sql: Editor = new Editor(sqlHost, {
    value: existing?.sql ?? '',
    language: measureLanguage(sm, table),
    schema: () => modelSchema(sm),
    label: kind === 'measure' ? 'Measure SQL' : 'Calculated column SQL',
    keys: { 'Mod+Enter': () => void test() },
    onChange: () => scheduleCheck(),
  });
  let checkTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleCheck = () => {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => sql.setWarnings(referenceWarnings(sql.value, sm, tableSel.value)), 300);
  };
  sql.setWarnings(referenceWarnings(sql.value, sm, table));
  const fmt = formatSelect(existing?.format);
  const desc = h('input.sbd-input', { value: existing?.description ?? '' }) as HTMLInputElement;
  const result = h('div.sbd-test');
  const build = (): Measure | CalcColumn => ({ table: tableSel.value, name: nameIn.value.trim(), sql: sql.value.trim(), format: readFormat(fmt, existing?.format), ...(desc.value ? { description: desc.value } : {}), ...(kind === 'column' ? { type: (existing as CalcColumn | undefined)?.type ?? 'any' } : {}) });
  const test = async (): Promise<boolean> => {
    const m = build();
    if (!m.name || !m.sql) {
      result.textContent = 'Enter a name and an expression.';
      return false;
    }
    const others = list.filter((x) => x !== existing);
    const spec = { ...model, [listKey]: [...others, m] };
    try {
      const tmp = new Model(ctx.session.schema, spec);
      const f = tmp.resolve(`${m.table}.${m.name}`);
      const q = compileQuery(tmp, kind === 'measure' ? { dims: [], measures: [f] } : { dims: [f], measures: [], limit: 5 });
      const frame = await ctx.session.runner.run(q.sql);
      const vals = Array.from(frame.data[q.columns[0]!.key] ?? []).slice(0, 5);
      result.className = 'sbd-test sbd-ok';
      const fmt = formatter(m.format ?? f.format, kind === 'measure' ? 'number' : f.type);
      result.textContent = '✓ ' + vals.map((v) => fmt(v as SqlValue)).join(', ');
      if (kind === 'column' && vals.length) (m as CalcColumn).type = vals.every((v) => typeof v === 'number' || v === null) ? 'number' : /^\d{4}-\d{2}(-\d{2})?$/.test(String(vals.find((v) => v !== null))) ? 'date' : 'text';
      return true;
    } catch (e) {
      result.className = 'sbd-test sbd-bad';
      result.textContent = (e as Error).message;
      const at = errorRange(sql.value, (e as Error).message);
      if (at) sql.highlightRange(at.start, at.end);
      return false;
    }
  };
  const body = h(
    'div.sbd-form',
    {},
    h('div.sbd-row', {}, field('Name', nameIn), field('Table', tableSel)),
    h('div.sbd-field-row', {}, h('span', {}, kind === 'measure' ? 'SQL aggregate expression' : 'SQL row expression'), sqlHost),
    h('div.sbd-hint', {}, kind === 'measure' ? 'Any SQL aggregate over the model’s tables: SUM, AVG, COUNT(DISTINCT …), FILTER (WHERE …). Type [ for measures to reuse, table. for its columns, Ctrl+Space to complete, Ctrl+Enter to test.' : 'A value per row of the table. Type table. for its columns, or [ for calculated columns; Ctrl+Space completes, Ctrl+Enter tests.'),
    h('div.sbd-row', {}, field('Format', fmt), field('Description', desc)),
    h('button.sbd-btn', { onclick: () => void test() }, 'Test'),
    result,
  );
  const buttons: Parameters<typeof dialog>[2] = [{ label: 'Cancel' }];
  if (existing)
    buttons.push({
      label: 'Delete',
      value: () => {
        ctx.store.change('model', (r) => ((r.model[listKey] as (Measure | CalcColumn)[]) = list.filter((x) => x !== existing)));
        return true;
      },
    });
  buttons.push({
    label: 'Save',
    primary: true,
    value: async () => {
      if (!(await test())) return undefined;
      const m = build();
      ctx.store.change('model', (r) => {
        const l = [...((r.model[listKey] ?? []) as (Measure | CalcColumn)[])];
        const i = existing ? l.findIndex((x) => x.table === existing.table && x.name === existing.name) : -1;
        if (i >= 0) l[i] = m;
        else l.push(m);
        (r.model[listKey] as (Measure | CalcColumn)[]) = l;
      });
      return true;
    },
  });
  await dialog(existing ? `Edit ${kind}` : kind === 'measure' ? 'New measure' : 'New calculated column', body, buttons, { wide: true });
}

// ------------------------------------------------------------------ theme

export async function themeDialog(ctx: DialogContext, apply: (t: Theme | string) => Promise<void>): Promise<void> {
  let current: Theme = structuredClone(ctx.session.theme);
  const original = ctx.store.report.theme;
  const cards = h('div.sbd-theme-cards');
  for (const [key, t] of Object.entries(BUILTIN_THEMES)) {
    const full = mergeTheme(BUILTIN_THEMES.smalt!, t);
    cards.append(
      h(
        'button.sbd-theme-card',
        {
          onclick: async () => {
            current = structuredClone(full);
            await apply(key);
            renderEditor();
          },
        },
        h('div.sbd-swatches', { html: (full.palette ?? []).slice(0, 6).map((c) => `<i style="background:${esc(c)}"></i>`).join('') }),
        h('div', { style: `font-family:${full.fonts?.heading ?? 'inherit'}` }, full.name),
        h('div.sbd-theme-bg', { style: `background:${full.colors?.background};border-color:${full.colors?.border}` }),
      ),
    );
  }
  const editor = h('div.sbd-form');
  const live = () => void apply(current);
  const renderEditor = () => {
    const c = current.colors ?? {};
    const colorRow = (key: keyof NonNullable<Theme['colors']>, label: string) =>
      field(label, h('input.sbd-input', { type: 'color', value: (c as Record<string, string>)[key] ?? '#000000', oninput: (e: Event) => ((current.colors = { ...(current.colors ?? {}), [key]: (e.target as HTMLInputElement).value }), live()) }));
    const pal = h(
      'div.sbd-palette',
      {},
      ...(current.palette ?? []).map((col, i) =>
        h('input', { type: 'color', value: col, title: `Series ${i + 1}`, oninput: (e: Event) => ((current.palette = (current.palette ?? []).map((x, j) => (j === i ? (e.target as HTMLInputElement).value : x))), live()) }),
      ),
    );
    const num = (label: string, get: () => number | undefined, set: (n: number) => void) => field(label, h('input.sbd-input', { type: 'number', value: get() ?? '', oninput: (e: Event) => (set(Number((e.target as HTMLInputElement).value)), live()) }));
    editor.replaceChildren(
      field('Name', textInput(current.name, (v) => (current.name = v))),
      h('div.sbd-grid2', {}, colorRow('background', 'Page'), colorRow('surface', 'Visuals'), colorRow('text', 'Text'), colorRow('muted', 'Secondary text'), colorRow('accent', 'Accent'), colorRow('border', 'Borders'), colorRow('positive', 'Good'), colorRow('negative', 'Bad')),
      h('div.sbd-section-title', {}, 'Series colors'),
      pal,
      h('div.sbd-section-title', {}, 'Type and shape'),
      field('Font', textInput(current.fonts?.body ?? '', (v) => ((current.fonts = { ...(current.fonts ?? {}), body: v, heading: v }), live()))),
      field('Number font', textInput(current.fonts?.numeric ?? '', (v) => ((current.fonts = { ...(current.fonts ?? {}), numeric: v }), live()))),
      h(
        'div.sbd-grid2',
        {},
        num('Base size', () => current.sizes?.base, (n) => (current.sizes = { ...(current.sizes ?? {}), base: n })),
        num('KPI size', () => current.sizes?.kpi, (n) => (current.sizes = { ...(current.sizes ?? {}), kpi: n })),
        num('Corner radius', () => current.visual?.radius, (n) => (current.visual = { ...(current.visual ?? {}), radius: n })),
        num('Padding', () => current.visual?.padding, (n) => (current.visual = { ...(current.visual ?? {}), padding: n })),
        num('Gap', () => current.page?.gap, (n) => (current.page = { ...(current.page ?? {}), gap: n })),
        num('Row height', () => current.page?.rowHeight, (n) => (current.page = { ...(current.page ?? {}), rowHeight: n })),
      ),
      checkbox('Gridlines', current.visual?.gridlines !== false, (on) => ((current.visual = { ...(current.visual ?? {}), gridlines: on }), live())),
      checkbox('Card shadows', (current.visual?.shadow ?? 'none') !== 'none', (on) => ((current.visual = { ...(current.visual ?? {}), shadow: on ? BUILTIN_THEMES.smalt!.visual!.shadow! : 'none' }), live())),
    );
  };
  renderEditor();
  const body = h(
    'div.sbd-theme',
    {},
    h('div.sbd-section-title', {}, 'Start from'),
    cards,
    h('div.sbd-section-title', {}, 'Customize'),
    editor,
    h(
      'div.sbd-row',
      {},
      h('button.sbd-btn', { onclick: () => download(fileName(current.name, 'report') + '.theme.json', JSON.stringify(current, null, 2) + '\n', 'application/json') }, 'Export theme…'),
      h('button.sbd-btn', {
        onclick: async () => {
          const f = await pickFile('.json');
          if (!f) return;
          try {
            current = mergeTheme(BUILTIN_THEMES.smalt!, JSON.parse(await f.text()) as Theme);
            await apply(current);
            renderEditor();
          } catch (e) {
            toast('Not a theme file: ' + (e as Error).message, 'error');
          }
        },
      }, 'Import theme…'),
    ),
  );
  const ok = await dialog('Theme', body, [{ label: 'Cancel' }, { label: 'Use this theme', primary: true, value: () => true }], { wide: true });
  const isBuiltin = Object.values(BUILTIN_THEMES).some((t) => JSON.stringify(mergeTheme(BUILTIN_THEMES.smalt!, t)) === JSON.stringify(current));
  const key = Object.entries(BUILTIN_THEMES).find(([, t]) => JSON.stringify(mergeTheme(BUILTIN_THEMES.smalt!, t)) === JSON.stringify(current))?.[0];
  if (ok) ctx.store.change('theme', (r) => (r.theme = isBuiltin && key ? key : current));
  else await apply(original ?? 'smalt');
}

// ------------------------------------------------------------------ publish

export async function publishDialog(ctx: DialogContext): Promise<void> {
  const r = ctx.store.report;
  const noSteps = !(r.data.steps ?? []).length || r.data.init === 'none';
  const snapshot = h('input', { type: 'checkbox', checked: noSteps }) as HTMLInputElement;
  const badge = h('input', { type: 'checkbox', checked: r.branding?.poweredBy !== false }) as HTMLInputElement;
  badge.addEventListener('change', () =>
    ctx.store.change('report', (rep) => {
      const branding = { ...(rep.branding ?? {}), poweredBy: badge.checked };
      if (branding.poweredBy) delete (branding as { poweredBy?: boolean }).poweredBy;
      rep.branding = Object.keys(branding).length ? branding : undefined;
      if (!rep.branding) delete rep.branding;
    }),
  );
  const status = h('div.sbd-hint');
  const body = h(
    'div.sbd-form',
    {},
    h('p', {}, 'Publishing creates a static website: the viewer, the smaltdb engine, report.json and its data files, in one ZIP. Unzip it onto any static host (GitHub Pages, Netlify, S3, an intranet web server). Every visitor’s browser runs the report; no server-side code.'),
    h('label.sbd-check', {}, snapshot, h('span', {}, 'Include a snapshot of the current data (CSV) instead of the report’s data steps')),
    noSteps ? h('div.sbd-hint', {}, 'This report has no data steps, so a snapshot is needed.') : null,
    h('label.sbd-check', {}, badge, h('span', {}, 'Show the “Powered by smaltbi” badge')),
    status,
  );
  await dialog('Publish', body, [
    { label: 'Cancel' },
    { label: 'Download report.json', value: () => (download(fileName(r.name, 'report') + '.smaltbi.json', JSON.stringify(r, null, 2) + '\n', 'application/json'), true) },
    {
      label: 'Download site (.zip)',
      primary: true,
      value: async () => {
        status.textContent = 'Building…';
        const blob = await publishZip(ctx.session, { appBase: ctx.appBase, snapshot: snapshot.checked, files: localFiles, log: (t) => (status.textContent = 'Adding ' + t + '…') });
        download(fileName(r.name, 'report') + '-site.zip', blob, 'application/zip');
        toast('Published: unzip onto any static host', 'ok');
        return true;
      },
    },
  ]);
}
