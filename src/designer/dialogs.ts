// Designer dialogs: data sources, the model (measures, columns, relationships, hierarchies),
// themes, and publishing.
import type { CalcColumn, DataStep, Format, Hierarchy, Measure, Relationship, SqlValue, Theme } from '../core/types.js';
import { formatter } from '../core/format.js';
import { compileQuery } from '../core/compile.js';
import { Model } from '../core/model.js';
import { BUILTIN_THEMES, mergeTheme } from '../theme/theme.js';
import { formatFromName } from '../data/sources.js';
import { dialog, download, esc, fileName, h, pickFile, toast } from '../kit/dom.js';
import { listOpfsDatabases } from '../kit/engine.js';
import { localFiles } from '../kit/files.js';
import { normalizeDataUrl } from '../kit/urls.js';
import { publishZip } from '../publish/publish.js';
import { checkbox, field, textInput } from './panel.js';
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
  if (data.init !== 'none') data.database = { name: data.database?.name ?? fileName(ctx.store.report.name), storage: storage.value as 'memory' | 'opfs' };
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
  const sql = h('textarea.sbd-input.sbd-code', { rows: 5, spellcheck: false, placeholder: kind === 'measure' ? 'SUM(sales.amount)   or   [Revenue] / NULLIF([Orders], 0)' : "strftime('%Y-%m', sales.order_date)" }, existing?.sql ?? '') as HTMLTextAreaElement;
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
      return false;
    }
  };
  const body = h(
    'div.sbd-form',
    {},
    h('div.sbd-row', {}, field('Name', nameIn), field('Table', tableSel)),
    field(kind === 'measure' ? 'SQL aggregate expression' : 'SQL row expression', sql),
    h('div.sbd-hint', {}, kind === 'measure' ? 'Any SQL aggregate over the model’s tables: SUM, AVG, COUNT(DISTINCT …), FILTER (WHERE …). Write [Other Measure] to reuse a measure.' : 'A value per row of the table. Reference other columns as table.column, or [Calculated Column].'),
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

export async function modelDialog(ctx: DialogContext): Promise<void> {
  const model = ctx.session.model;
  const spec = structuredClone(ctx.store.report.model);
  spec.relationships ??= [];
  spec.hierarchies ??= [];
  const cols = [...model.tables.values()].flatMap((t) => [...t.columns.values()].filter((c) => !c.calc).map((c) => `${t.name}.${c.name}`));
  const rels = h('div.sbd-steps');
  const renderRels = () => {
    rels.replaceChildren(
      ...spec.relationships!.map((r, i) =>
        h(
          'div.sbd-step',
          {},
          h('span', {}, `${r.from}  →  ${r.to}`, r.active === false ? ' (inactive)' : ''),
          h('button.sbd-chip-btn', { title: 'Remove', onclick: () => (spec.relationships!.splice(i, 1), renderRels()) }, '×'),
        ),
      ),
    );
    if (!spec.relationships!.length) rels.append(h('div.sbd-hint', {}, 'No relationships. Visuals can then only combine fields of one table.'));
  };
  renderRels();
  const colSel = () => h('select.sbd-input', {}, ...cols.map((c) => h('option', { value: c }, c))) as HTMLSelectElement;
  const from = colSel();
  const to = colSel();
  const hiers = h('div.sbd-steps');
  const renderH = () => {
    hiers.replaceChildren(...spec.hierarchies!.map((x, i) => h('div.sbd-step', {}, h('span', {}, `${x.table}.${x.name}: ${x.levels.join(' › ')}`), h('button.sbd-chip-btn', { onclick: () => (spec.hierarchies!.splice(i, 1), renderH()) }, '×'))));
  };
  renderH();
  const hName = h('input.sbd-input', { placeholder: 'Date' }) as HTMLInputElement;
  const hTable = h('select.sbd-input', {}, ...[...model.tables.keys()].map((t) => h('option', { value: t }, t))) as HTMLSelectElement;
  const hLevels = h('input.sbd-input', { placeholder: 'Year, Quarter, Month' }) as HTMLInputElement;
  const measures = h(
    'div.sbd-steps',
    {},
    ...(spec.measures ?? []).map((m) => h('div.sbd-step', {}, h('span', {}, h('b', {}, m.name), ` (${m.table})  `, h('code', {}, m.sql)))),
    ...(spec.columns ?? []).map((c) => h('div.sbd-step', {}, h('span', {}, h('b', {}, c.name), ` (${c.table}, column)  `, h('code', {}, c.sql)))),
  );
  const problems = model.validate();
  const body = h(
    'div.sbd-form',
    {},
    problems.length ? h('div.sbd-test.sbd-bad', {}, problems.join('\n')) : null,
    h('div.sbd-section-title', {}, 'Relationships (many → one)'),
    rels,
    h(
      'div.sbd-row',
      {},
      from,
      h('span', {}, '→'),
      to,
      h('button.sbd-btn', { onclick: () => (spec.relationships!.push({ from: from.value, to: to.value }), renderRels()) }, 'Add'),
    ),
    h(
      'button.sbd-btn',
      {
        onclick: () => {
          const sug: Relationship[] = new Model(ctx.session.schema, { ...spec }).suggestRelationships();
          const fk = ctx.session.schema.foreignKeys ?? [];
          let n = 0;
          for (const r of [...fk, ...sug])
            if (!spec.relationships!.some((x) => x.from === r.from)) {
              spec.relationships!.push(r);
              n++;
            }
          renderRels();
          toast(n ? `Added ${n} relationship${n > 1 ? 's' : ''}` : 'Nothing new found');
        },
      },
      'Detect relationships',
    ),
    h('div.sbd-section-title', {}, 'Hierarchies (drill paths)'),
    hiers,
    h('div.sbd-row', {}, hName, hTable, hLevels, h('button.sbd-btn', { onclick: () => {
      const levels = hLevels.value.split(',').map((s) => s.trim()).filter(Boolean);
      if (!hName.value || levels.length < 2) return toast('A hierarchy needs a name and at least two levels', 'error');
      spec.hierarchies!.push({ table: hTable.value, name: hName.value, levels } as Hierarchy);
      hName.value = hLevels.value = '';
      renderH();
    } }, 'Add')),
    h('div.sbd-section-title', {}, 'Measures and calculated columns'),
    h('div.sbd-hint', {}, 'Create and edit these from the Fields pane (+ƒ next to a table, or right-click a field).'),
    measures,
  );
  const ok = await dialog('Model', body, [{ label: 'Cancel' }, { label: 'Apply', primary: true, value: () => true }], { wide: true });
  if (ok) ctx.store.change('model', (r) => (r.model = { ...r.model, relationships: spec.relationships, hierarchies: spec.hierarchies }));
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
      h('button.sbd-btn', { onclick: () => download(fileName(current.name) + '.theme.json', JSON.stringify(current, null, 2) + '\n', 'application/json') }, 'Export theme…'),
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
  const status = h('div.sbd-hint');
  const body = h(
    'div.sbd-form',
    {},
    h('p', {}, 'Publishing creates a static website: the viewer, the smaltdb engine, report.json and its data files, in one ZIP. Unzip it onto any static host (GitHub Pages, Netlify, S3, an intranet web server). Every visitor’s browser runs the report; no server-side code.'),
    h('label.sbd-check', {}, snapshot, h('span', {}, 'Include a snapshot of the current data (CSV) instead of the report’s data steps')),
    noSteps ? h('div.sbd-hint', {}, 'This report has no data steps, so a snapshot is needed.') : null,
    status,
  );
  await dialog('Publish', body, [
    { label: 'Cancel' },
    { label: 'Download report.json', value: () => (download(fileName(r.name) + '.smaltbi.json', JSON.stringify(r, null, 2) + '\n', 'application/json'), true) },
    {
      label: 'Download site (.zip)',
      primary: true,
      value: async () => {
        status.textContent = 'Building…';
        const blob = await publishZip(ctx.session, { appBase: ctx.appBase, snapshot: snapshot.checked, files: localFiles, log: (t) => (status.textContent = 'Adding ' + t + '…') });
        download(fileName(r.name) + '-site.zip', blob, 'application/zip');
        toast('Published: unzip onto any static host', 'ok');
        return true;
      },
    },
  ]);
}
