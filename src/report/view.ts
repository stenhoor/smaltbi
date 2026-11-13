// ReportView renders one page of a report and runs its interactions: cross-filtering, slicers,
// drill down / up, drill-through, tooltips, focus mode, "show data" and CSV export.
// The designer and the published viewer both use it.
import type { FieldRef, Filter, Page, Report, SqlValue, ViewState, Visual } from '../core/types.js';
import { type ResolvedField, ModelError, refName } from '../core/model.js';
import { compileQuery, type CompiledQuery, type QuerySpec, wrapCustomSql } from '../core/compile.js';
import { formatter } from '../core/format.js';
import { pageGeometry, pageSize, paletteSize, themeCss } from '../theme/theme.js';
import { PHONE_WIDTH, phoneLayout, type PhoneSlot } from './phone.js';
import { CONDITIONAL_ROLE, cellFormatFor, conditionalFields } from './conditional.js';
import { type DataColumn, dataColumn, type Plan, type PlanContext, type VisualData, type VisualDef, optionsOf, visualDef } from '../visuals/index.js';
import type { Frame } from '../data/runner.js';
import { download, esc, h, showMenu, type MenuItem } from 'smaltkit/dom';
import type { ReportSession } from './session.js';

export interface ViewOptions {
  mode: 'view' | 'edit';
  /** Called whenever the view state changes (to persist it in the URL). */
  onState?: (s: ViewState) => void;
  /** Edit mode: a visual frame was clicked. */
  onSelectVisual?: (id: string | null, e?: MouseEvent) => void;
  /** Edit mode: extra frame decorations (move / resize handles). */
  decorate?: (frame: HTMLElement, v: Visual) => void;
  /** Edit mode: an option changed on the visual itself (a table's column widths dragged): keep it with the visual. */
  onOption?: (v: Visual, key: string, value: unknown) => void;
}

interface VisualRuntime {
  frame: HTMLElement;
  body: HTMLElement;
  gen: number;
  data?: VisualData;
  extra?: Record<string, VisualData>;
  sql?: string;
  error?: string;
  dims: ResolvedField[];
  ro?: ResizeObserver;
  lastSize?: string;
}

export class ReportView {
  state: ViewState;
  readonly root: HTMLElement;
  private runtimes = new Map<string, VisualRuntime>();
  private tooltip: HTMLElement;
  private styleEl: HTMLStyleElement;
  selectedVisual: string | null = null;

  constructor(
    public session: ReportSession,
    private host: HTMLElement,
    private opts: ViewOptions,
    state?: Partial<ViewState>,
  ) {
    this.state = { page: state?.page ?? this.report.pages.find((p) => !p.hidden)?.id ?? this.report.pages[0]?.id ?? '', ...state } as ViewState;
    if (!this.report.pages.some((p) => p.id === this.state.page)) this.state.page = this.report.pages[0]?.id ?? '';
    this.styleEl = h('style');
    this.root = h('div.sb-themed.sb-report', { 'data-mode-ui': opts.mode });
    this.tooltip = h('div.sb-tooltip', { role: 'tooltip' });
    host.replaceChildren(this.styleEl, this.root, this.tooltip);
    this.applyTheme();
    this.bindEvents();
  }

  get report(): Report {
    return this.session.report;
  }

  get page(): Page {
    return this.report.pages.find((p) => p.id === this.state.page) ?? this.report.pages[0]!;
  }

  applyTheme(): void {
    this.styleEl.textContent = themeCss(this.session.theme);
  }

  /** The report is phone-narrow (the stylesheet's one-column breakpoint): pages are laid out as one column. */
  narrow = false;

  isNarrow(): boolean {
    const w = this.root.clientWidth;
    if (!w) return false;
    const cs = getComputedStyle(this.root);
    return w - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) <= PHONE_WIDTH;
  }

  /** Fixed-size pages: scaled down to fit the window (the viewer's "Fit to window"), or shown at 100% and scrolled. */
  fitPage = false;
  private fitSheet: (() => void) | null = null;

  setFitPage(on: boolean): void {
    this.fitPage = on;
    this.fitSheet?.();
  }

  /** The current page has a fixed size (the viewer offers "Fit to window" then). */
  get fixedPage(): boolean {
    return !!pageSize(this.page) && !this.narrow;
  }

  private refreshing: Promise<void> | null = null;

  /** Load the data again (the data steps run again) and redraw; selections, filters and the page stay. */
  refreshData(): Promise<void> {
    this.refreshing ??= this.session
      .reloadData()
      .then(() => {
        this.render();
        this.emit();
      })
      .finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  setColorMode(mode: 'auto' | 'light' | 'dark'): void {
    if (mode === 'auto') this.root.removeAttribute('data-mode');
    else this.root.dataset.mode = mode;
  }

  // ---------------------------------------------------------------- navigation and state

  goTo(pageId: string, drillthrough?: ViewState['drillthrough']): void {
    this.state = { ...this.state, page: pageId, drillthrough };
    this.render();
    this.emit();
  }

  setState(s: ViewState): void {
    this.state = { ...s };
    if (!this.report.pages.some((p) => p.id === this.state.page)) this.state.page = this.report.pages[0]?.id ?? '';
    this.render();
    this.emit();
  }

  private emit(): void {
    this.opts.onState?.(structuredClone(this.state));
  }

  clearSelections(): void {
    this.state.selections = {};
    this.refreshAll();
    this.emit();
  }

  // ---------------------------------------------------------------- rendering

  /** Build the page's frames and query every visual. */
  render(): void {
    for (const rt of this.runtimes.values()) rt.ro?.disconnect();
    this.runtimes.clear();
    const page = this.page;
    if (!page) {
      this.root.replaceChildren(h('div.sb-empty', {}, 'This report has no pages'));
      return;
    }
    // On a phone every page is a responsive web page, fixed-size ones too: one column, no sheet.
    this.narrow = this.isNarrow();
    const layout = this.narrow ? { ...pageGeometry(this.session.theme, { layout: page.layout }), fixed: null } : pageGeometry(this.session.theme, page);
    const rows = Math.max(layout.rows, ...page.visuals.map((v) => v.layout.y + v.layout.h));
    const grid = h('div.sb-page', {
      style: `--cols:${layout.columns};--row:${layout.rowHeight}px;--rows:${rows};max-width:${layout.fit === 'width' ? 'none' : layout.width + 'px'}`,
    });
    // A fixed page is a sheet of its size; "Fit to window" scales it (and the box around it) down.
    let sheet: HTMLElement = grid;
    this.fitSheet = null;
    if (layout.fixed) {
      const { width, height } = layout.fixed;
      grid.classList.add('sb-fixed');
      grid.style.cssText += `;width:${width}px;height:${height}px;max-width:none;padding:${layout.pad}px`;
      sheet = h('div.sb-sheet', { 'data-size': `${width}x${height}` }, grid);
      const fit = () => {
        let s = 1;
        if (this.fitPage && sheet.isConnected) {
          const cs = getComputedStyle(this.root);
          const availW = this.root.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          // The height the sheet has when the pane it scrolls in (the designer's canvas, or the window) is at the
          // top: where it is now would count the part scrolled out of view as room.
          const win = this.root.ownerDocument.defaultView!;
          let pane: HTMLElement | null = null;
          for (let el = this.root.parentElement; el; el = el.parentElement) {
            if (/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.clientHeight < el.scrollHeight + 1) {
              pane = el;
              break;
            }
          }
          const rect = sheet.getBoundingClientRect();
          const paneTop = pane ? pane.getBoundingClientRect().top : 0;
          const scrolled = pane ? pane.scrollTop : win.scrollY;
          const top = rect.top - paneTop + scrolled;
          const visible = pane ? pane.clientHeight : win.innerHeight;
          const availH = visible - top - parseFloat(cs.paddingBottom) - 8;
          s = Math.max(0.1, Math.min(1, availW / width, availH / height));
        }
        grid.style.transform = s === 1 ? '' : `scale(${s})`;
        sheet.style.width = `${width * s}px`;
        sheet.style.height = `${height * s}px`;
        sheet.dataset.scale = String(Math.round(s * 1000) / 1000);
      };
      this.fitSheet = fit;
      queueMicrotask(fit);
    }
    if (this.state.drillthrough) {
      const from = this.state.drillthrough.from;
      const chips = this.state.drillthrough.filters.map((f) => `${this.fieldLabel(f.field ?? '')}: ${(f.values ?? []).map((v) => this.fmtValue(f.field ?? '', v)).join(', ')}`);
      this.root.replaceChildren(
        h('div.sb-drillbar', {}, h('button.sb-back', { onclick: () => this.goTo(from) }, '← Back'), h('span', {}, 'Drill-through: ' + chips.join(' · '))),
        sheet,
      );
    } else this.root.replaceChildren(sheet);
    const phone = phoneLayout(page);
    for (const v of page.visuals) grid.append(this.frameFor(v, phone.get(v.id)));
    this.refreshAll();
  }

  private frameFor(v: Visual, phone?: PhoneSlot): HTMLElement {
    const def = visualDef(v.type);
    const body = h('div.sb-visual-body');
    const header = h('div.sb-visual-head');
    const frame = h(
      'div.sb-visual',
      {
        'data-id': v.id,
        'data-type': v.type,
        style: `grid-column:${v.layout.x + 1} / span ${v.layout.w};grid-row:${v.layout.y + 1} / span ${v.layout.h};--h:${v.layout.h};--phone-order:${phone?.order ?? 0};--phone-h:${phone?.h ?? v.layout.h}`,
      },
      header,
      body,
    );
    if (v.style) for (const [k, val] of Object.entries(v.style)) frame.style.setProperty(`--sb-${k}`, String(val));
    if (v.type === 'text' || v.type === 'image') frame.classList.add('sb-plain');
    if (phone?.hidden) frame.classList.add('sb-phone-hidden');
    if (this.selectedVisual === v.id) frame.classList.add('sb-selected');
    const rt: VisualRuntime = { frame, body, gen: 0, dims: [] };
    this.runtimes.set(v.id, rt);
    this.renderHeader(v, def, header);
    rt.ro = new ResizeObserver(() => {
      // Detached or hidden (e.g. the designer switched to the model diagram): nothing to draw.
      if (!body.isConnected || !body.clientWidth || !body.clientHeight) return;
      const size = `${body.clientWidth}x${body.clientHeight}`;
      if (size !== rt.lastSize && rt.data) this.draw(v, rt);
    });
    rt.ro.observe(body);
    this.opts.decorate?.(frame, v);
    return frame;
  }

  private renderHeader(v: Visual, def: VisualDef | undefined, header: HTMLElement): void {
    header.replaceChildren();
    const title = v.title ?? '';
    if (title || v.subtitle) header.append(h('div.sb-visual-titles', {}, title ? h('div.sb-visual-title', {}, title) : null, v.subtitle ? h('div.sb-visual-subtitle', {}, v.subtitle) : null));
    const tools = h('div.sb-visual-tools');
    const levels = this.drillLevels(v, def);
    if (levels && levels.length > 1) {
      const st = this.state.drill?.[v.id];
      const level = st?.level ?? 0;
      tools.append(
        h('button.sb-tool', { title: 'Drill up', disabled: level === 0, onclick: () => this.drillUp(v) }, '↑'),
        h('button.sb-tool', { title: 'Show next level (all)', disabled: level >= levels.length - 1, onclick: () => this.drillNext(v) }, '⇊'),
        h('span.sb-drill-level', {}, this.fieldLabel(refName(levels[level]!))),
      );
    }
    if (!def?.static || Object.values(v.fields).some((f) => f.length))
      tools.append(h('button.sb-tool', { title: 'More options', onclick: (e: Event) => this.visualMenu(v, e as MouseEvent) }, '⋯'));
    header.append(tools);
    header.classList.toggle('sb-empty-head', !title && !v.subtitle);
  }

  /** Re-query every visual (filters changed). */
  refreshAll(): void {
    for (const v of this.page?.visuals ?? []) void this.refresh(v.id);
  }

  /** Re-render one visual after its definition changed (designer). */
  updateVisual(v: Visual): void {
    const old = this.runtimes.get(v.id);
    if (!old) return this.render();
    old.ro?.disconnect();
    const frame = this.frameFor(v);
    old.frame.replaceWith(frame);
    void this.refresh(v.id);
  }

  async refresh(id: string): Promise<void> {
    const v = this.page.visuals.find((x) => x.id === id);
    const rt = this.runtimes.get(id);
    if (!v || !rt) return;
    const def = visualDef(v.type);
    const gen = ++rt.gen;
    if (!def) {
      rt.body.innerHTML = `<div class="sb-error">Unknown visual type “${esc(v.type)}”. Is its plugin loaded?</div>`;
      return;
    }
    rt.frame.classList.add('sb-loading');
    try {
      const { data, extra, sql } = await this.load(v, def, rt);
      // Superseded by a newer refresh, or the page was re-rendered / left while querying.
      if (gen !== rt.gen || this.runtimes.get(id) !== rt) return;
      rt.data = data;
      rt.extra = extra;
      rt.sql = sql;
      rt.error = undefined;
      this.draw(v, rt);
    } catch (e) {
      if (gen !== rt.gen || this.runtimes.get(id) !== rt) return;
      rt.data = undefined;
      rt.error = (e as Error).message ?? String(e);
      rt.body.innerHTML = `<div class="${e instanceof ModelError ? 'sb-empty' : 'sb-error'}">${esc(rt.error)}</div>`;
    } finally {
      if (gen === rt.gen) rt.frame.classList.remove('sb-loading');
    }
  }

  private draw(v: Visual, rt: VisualRuntime): void {
    const def = visualDef(v.type);
    if (!def || !rt.data) return;
    // Not on screen (detached, or hidden behind the model diagram): the ResizeObserver draws the
    // stored data once the body has a size.
    if (!rt.body.isConnected || !rt.body.clientWidth || !rt.body.clientHeight) return;
    rt.lastSize = `${rt.body.clientWidth}x${rt.body.clientHeight}`;
    const own = this.state.selections?.[v.id];
    const tupleSel = own?.find((f) => f.op === 'tuples');
    const keys = tupleSel ? new Set((tupleSel.tuples ?? []).map((t) => JSON.stringify(t.map(norm)))) : null;
    const data = rt.data;
    try {
      def.render({
        el: rt.body,
        width: Math.max(10, rt.body.clientWidth),
        height: Math.max(10, rt.body.clientHeight),
        visual: v,
        options: optionsOf(def, v),
        data,
        extra: rt.extra ?? {},
        palette: paletteSize(this.session.theme),
        base: this.session.base,
        selected: (row) => (keys && !def.slicer ? keys.has(JSON.stringify(this.rowTuple(data, row).map(norm))) : null),
        cellFormat: def.conditional ? cellFormatFor(v, data) : undefined,
        setOption: this.opts.onOption ? (key, value) => this.opts.onOption!(v, key, value) : undefined,
        api: {
          select: (row, additive) => this.select(v, row, !!additive),
          setFilters: (filters) => this.setSelection(v, filters),
          filters: () => this.state.selections?.[v.id] ?? [],
          query: async (spec) => (await this.runSpec(v, spec, [])).data,
          drill: (row) => this.drillDown(v, row),
        },
      });
    } catch (e) {
      rt.body.innerHTML = `<div class="sb-error">${esc((e as Error).message)}</div>`;
    }
  }

  // ---------------------------------------------------------------- queries

  /** The filters that apply to a visual: report, page, visual, drill-through, other visuals' selections, drill path. */
  filtersFor(v: Visual): Filter[] {
    const page = this.page;
    const out: Filter[] = [...(this.report.filters ?? []), ...(page.filters ?? []), ...(v.filters ?? [])];
    if (this.state.drillthrough) out.push(...this.state.drillthrough.filters);
    if (v.interactions?.filteredByOthers !== false) {
      for (const [id, sel] of Object.entries(this.state.selections ?? {})) {
        if (id === v.id || !sel?.length) continue;
        const src = page.visuals.find((x) => x.id === id) ?? this.syncedSlicer(id);
        if (!src || src.interactions?.filterOthers === false) continue;
        out.push(...sel);
      }
    }
    return out;
  }

  private syncedSlicer(id: string): Visual | undefined {
    for (const p of this.report.pages) {
      const v = p.visuals.find((x) => x.id === id);
      if (v && v.type === 'slicer' && v.options?.sync) return v;
    }
    return undefined;
  }

  private drillLevels(v: Visual, def: VisualDef | undefined): FieldRef[] | null {
    const role = def?.roles.find((r) => r.drill);
    if (!role) return null;
    const refs = this.session.model.expand(v.fields[role.name] ?? []);
    return refs.length ? refs : null;
  }

  /** Resolve the visual's fields per role (drill applied), with the drill path's filters. */
  private resolveFields(v: Visual, def: VisualDef): { fields: Record<string, ResolvedField[]>; roleOf: Map<ResolvedField, string>; drillFilters: Filter[] } {
    const model = this.session.model;
    const fields: Record<string, ResolvedField[]> = {};
    const roleOf = new Map<ResolvedField, string>();
    const drillFilters: Filter[] = [];
    for (const role of def.roles) {
      let refs = model.expand(v.fields[role.name] ?? []);
      if (role.drill && refs.length > 1) {
        const st = this.state.drill?.[v.id];
        const level = Math.min(st?.level ?? 0, refs.length - 1);
        for (let i = 0; i < level; i++) if (st && String(i) in st.path) drillFilters.push({ field: refName(refs[i]!), op: 'eq', values: [st.path[String(i)] ?? null] });
        refs = [refs[level]!];
      }
      fields[role.name] = refs.map((r) => {
        const f = model.resolve(r, role.kind);
        roleOf.set(f, role.name);
        return f;
      });
    }
    return { fields, roleOf, drillFilters };
  }

  private plan(v: Visual, def: VisualDef): { plan: Plan; roleOf: Map<ResolvedField, string>; drillFilters: Filter[] } {
    const { fields, roleOf, drillFilters } = this.resolveFields(v, def);
    const pick = (...roles: string[]) => roles.flatMap((r) => fields[r] ?? []);
    const defaultPlan = (): Plan => {
      const dims = def.roles.filter((r) => r.kind === 'dimension').flatMap((r) => fields[r.name] ?? []);
      const measures = def.roles.filter((r) => r.kind === 'measure').flatMap((r) => fields[r.name] ?? []);
      let sort = v.sort?.map((s) => ({ key: this.sortKey(s.by, dims, measures, fields), dir: s.dir ?? 'asc' })).filter((s) => s.key) as QuerySpec['sort'];
      if (!sort?.length) {
        const byValue = def.sort === 'value' && measures.length && dims.length && !(dims[0]!.type === 'date' || dims[0]!.type === 'datetime' || dims[0]!.sortExpr);
        sort = byValue ? [{ key: 'm0', dir: 'desc' }] : undefined;
      }
      return { main: { dims, measures, sort, limit: v.limit ?? def.limit } };
    };
    const ctx: PlanContext = {
      visual: v,
      fields,
      defaultPlan,
      pick,
      aggregate: (f, agg) => {
        const r = this.session.model.resolve({ field: f.ref, agg }, 'measure');
        roleOf.set(r, roleOf.get(f) ?? '');
        return r;
      },
    };
    const plan = def.plan ? def.plan(ctx) : defaultPlan();
    // Conditional formatting may test or compare with measures the visual doesn't show: fetch them in the main query
    // under their own role, which no visual draws.
    const shown = new Set(plan.main.measures.map((m) => m.ref));
    for (const ref of def.conditional ? conditionalFields(v) : []) {
      if (shown.has(ref)) continue;
      try {
        const f = this.session.model.resolve(ref, 'measure');
        roleOf.set(f, CONDITIONAL_ROLE);
        plan.main = { ...plan.main, measures: [...plan.main.measures, f] };
        shown.add(ref);
      } catch {
        // A rule naming a field that no longer exists: it never matches.
      }
    }
    return { plan, roleOf, drillFilters };
  }

  private sortKey(by: string, dims: ResolvedField[], measures: ResolvedField[], fields: Record<string, ResolvedField[]>): string | undefined {
    const m = /^(\w+):(\d+)$/.exec(by);
    const target = m ? fields[m[1]!]?.[Number(m[2])] : [...dims, ...measures].find((f) => f.ref === by);
    if (!target) return undefined;
    const di = dims.indexOf(target);
    if (di >= 0) return 'd' + di;
    const mi = measures.indexOf(target);
    return mi >= 0 ? 'm' + mi : undefined;
  }

  private async load(v: Visual, def: VisualDef, rt: VisualRuntime): Promise<{ data: VisualData; extra: Record<string, VisualData>; sql: string }> {
    const hasFields = def.roles.some((r) => (v.fields[r.name] ?? []).length);
    if (def.static && !hasFields) return { data: emptyData(), extra: {}, sql: '' };
    if (!hasFields && !v.sql) throw new ModelError(def.roles.length ? 'Drag fields here, or onto the field wells' : 'Nothing to show');
    const { plan, roleOf, drillFilters } = this.plan(v, def);
    // A visual is never filtered by its own selection (filtersFor skips it): charts highlight
    // instead, and slicers keep showing every value.
    const filters = [...this.filtersFor(v), ...drillFilters];
    rt.dims = plan.main.dims;
    if (v.sql) {
      const r = await this.runCustom(v, plan, roleOf, filters);
      return { ...r, extra: {} };
    }
    const main = await this.runSpec(v, plan.main, filters, roleOf);
    const extra: Record<string, VisualData> = {};
    await Promise.all(
      Object.entries(plan.extra ?? {}).map(async ([k, spec]) => {
        extra[k] = (await this.runSpec(v, spec, filters, roleOf)).data;
      }),
    );
    return { data: main.data, extra, sql: main.sql };
  }

  private async runSpec(_v: Visual, spec: QuerySpec, filters: Filter[], roleOf = new Map<ResolvedField, string>()): Promise<{ data: VisualData; sql: string }> {
    if (!spec.dims.length && !spec.measures.length) return { data: emptyData(), sql: '' };
    const q = compileQuery(this.session.model, { ...spec, filters: [...(spec.filters ?? []), ...filters] });
    const frame = await this.session.runner.run(q.sql);
    return { data: toVisualData(frame, q, roleOf), sql: q.sql };
  }

  private async runCustom(v: Visual, plan: Plan, roleOf: Map<ResolvedField, string>, filters: Filter[]): Promise<{ data: VisualData; sql: string }> {
    const cols = await this.session.runner.columnsOf(v.sql!);
    const { sql } = wrapCustomSql(v.sql!, cols, filters, this.session.model);
    const frame = await this.session.runner.run(sql);
    // Output columns map to the visual's fields in order (dimensions, then measures); without
    // fields, the first column is the category and numeric columns are values.
    const fields = [...plan.main.dims, ...plan.main.measures];
    const columns: DataColumn[] = frame.columns.map((name, i) => {
      const values = frame.data[name]!;
      const f = fields[i];
      const numeric = values instanceof Float64Array;
      const field: ResolvedField = f
        ? { ...f, label: name }
        : { ref: name, kind: i > 0 && numeric ? 'measure' : 'column', table: '', name, label: name, expr: name, type: numeric ? 'number' : 'any', tables: new Set() };
      const role = f ? (roleOf.get(f) ?? '') : field.kind === 'measure' ? 'values' : 'category';
      return dataColumn(name, role, name, field, values, formatter(field.format, field.type));
    });
    return { data: makeData(columns, frame.length), sql };
  }

  /** The SQL a visual runs, for "View SQL" and "Convert to SQL". */
  sqlFor(v: Visual, forPeople = false): string {
    const def = visualDef(v.type);
    if (!def) return '';
    if (v.sql) return v.sql;
    const { plan, drillFilters } = this.plan(v, def);
    const filters = [...this.filtersFor(v), ...drillFilters];
    const q = compileQuery(this.session.model, { ...plan.main, filters: forPeople ? [...(v.filters ?? [])] : filters, labelAliases: forPeople });
    return q.sql;
  }

  // ---------------------------------------------------------------- interactions

  private rowTuple(data: VisualData, row: number): SqlValue[] {
    return data.dims.map((d) => d.values[row] ?? null);
  }

  private select(v: Visual, row: number, additive: boolean): void {
    const rt = this.runtimes.get(v.id);
    if (!rt?.data || v.interactions?.filterOthers === false) return;
    const dims = rt.data.dims;
    if (!dims.length) return;
    const fields = dims.map((d) => d.field.ref);
    const tuple = this.rowTuple(rt.data, row);
    const cur = this.state.selections?.[v.id]?.find((f) => f.op === 'tuples' && JSON.stringify(f.fields) === JSON.stringify(fields));
    let tuples = cur?.tuples ?? [];
    const k = JSON.stringify(tuple.map(norm));
    const has = tuples.some((t) => JSON.stringify(t.map(norm)) === k);
    if (additive) tuples = has ? tuples.filter((t) => JSON.stringify(t.map(norm)) !== k) : [...tuples, tuple];
    else tuples = has && tuples.length === 1 ? [] : [tuple];
    this.setSelection(v, tuples.length ? [{ op: 'tuples', fields, tuples }] : []);
  }

  setSelection(v: Visual, filters: Filter[]): void {
    const sel = { ...(this.state.selections ?? {}) };
    if (filters.length) sel[v.id] = filters;
    else delete sel[v.id];
    this.state.selections = sel;
    for (const other of this.page.visuals) {
      if (other.id === v.id) this.restyle(v);
      else void this.refresh(other.id);
    }
    this.emit();
  }

  /** Update selection highlighting in place (no re-render: keeps hover and double-click working). */
  private restyle(v: Visual): void {
    const rt = this.runtimes.get(v.id);
    if (!rt?.data) return;
    const def = visualDef(v.type);
    if (def?.selfInteractive) return this.draw(v, rt);
    const tupleSel = this.state.selections?.[v.id]?.find((f) => f.op === 'tuples');
    const keys = tupleSel ? new Set((tupleSel.tuples ?? []).map((t) => JSON.stringify(t.map(norm)))) : null;
    const data = rt.data;
    rt.body.querySelectorAll('[data-row]').forEach((el) => {
      const row = Number(el.getAttribute('data-row'));
      const on = keys ? keys.has(JSON.stringify(this.rowTuple(data, row).map(norm))) : null;
      el.classList.toggle('sk-dim', on === false);
      el.classList.toggle('sk-on', on === true);
    });
  }

  drillDown(v: Visual, row: number): void {
    const def = visualDef(v.type);
    const levels = this.drillLevels(v, def);
    const rt = this.runtimes.get(v.id);
    if (!levels || levels.length < 2 || !rt?.data) return;
    const st = this.state.drill?.[v.id] ?? { level: 0, path: {} };
    if (st.level >= levels.length - 1) return;
    const role = def!.roles.find((r) => r.drill)!;
    const col = rt.data.role(role.name)[0];
    if (!col) return;
    const next = { level: st.level + 1, path: { ...st.path, [String(st.level)]: col.values[row] ?? null } };
    this.state.drill = { ...(this.state.drill ?? {}), [v.id]: next };
    this.afterDrill(v);
  }

  drillUp(v: Visual): void {
    const st = this.state.drill?.[v.id];
    if (!st || st.level === 0) return;
    const path = { ...st.path };
    delete path[String(st.level - 1)];
    this.state.drill = { ...(this.state.drill ?? {}), [v.id]: { level: st.level - 1, path } };
    this.afterDrill(v);
  }

  drillNext(v: Visual): void {
    const st = this.state.drill?.[v.id] ?? { level: 0, path: {} };
    this.state.drill = { ...(this.state.drill ?? {}), [v.id]: { level: st.level + 1, path: st.path } };
    this.afterDrill(v);
  }

  private afterDrill(v: Visual): void {
    // A selection made at another level no longer matches the fields shown.
    if (this.state.selections?.[v.id]) {
      const sel = { ...this.state.selections };
      delete sel[v.id];
      this.state.selections = sel;
      for (const o of this.page.visuals) if (o.id !== v.id) void this.refresh(o.id);
    }
    const rt = this.runtimes.get(v.id);
    if (rt) this.renderHeader(v, visualDef(v.type), rt.frame.querySelector('.sb-visual-head')!);
    void this.refresh(v.id);
    this.emit();
  }

  private drillThroughTargets(v: Visual, row: number): MenuItem[] {
    const rt = this.runtimes.get(v.id);
    if (!rt?.data) return [];
    const dims = rt.data.dims;
    const out: MenuItem[] = [];
    for (const p of this.report.pages) {
      if (p.id === this.page.id || !p.drillthrough?.length) continue;
      const filters: Filter[] = [];
      for (const ref of p.drillthrough) {
        const d = dims.find((x) => x.field.ref === ref);
        if (d) filters.push({ field: ref, op: 'eq', values: [d.values[row] ?? null] });
      }
      if (filters.length === p.drillthrough.length) out.push({ label: `Drill through → ${p.name}`, action: () => this.goTo(p.id, { from: this.page.id, filters }) });
    }
    return out;
  }

  private bindEvents(): void {
    // A fitted sheet follows the window (and the pane it is in).
    new ResizeObserver(() => {
      // A fixed-size page turns into a column on a phone and back into a sheet on a wider screen.
      if (pageSize(this.page) && this.isNarrow() !== this.narrow) return this.render();
      if (this.fitPage) this.fitSheet?.();
    }).observe(this.root);
    this.root.ownerDocument.defaultView?.addEventListener('resize', () => this.fitPage && this.fitSheet?.());
    const markOf = (e: Event) => {
      const t = e.target as Element;
      const mark = t.closest?.('[data-row]') as HTMLElement | SVGElement | null;
      const frame = t.closest?.('.sb-visual') as HTMLElement | null;
      if (!frame) return null;
      const v = this.page.visuals.find((x) => x.id === frame.dataset.id);
      if (!v) return null;
      return { v, frame, row: mark ? Number(mark.getAttribute('data-row')) : null };
    };
    this.root.addEventListener('click', (e) => {
      const m = markOf(e);
      if (!m) {
        if (this.opts.mode === 'view' && (e.target as Element).closest('.sb-page') && !(e.target as Element).closest('.sb-visual')) this.clearSelections();
        return;
      }
      if (this.opts.mode === 'edit') this.opts.onSelectVisual?.(m.v.id, e);
      const def = visualDef(m.v.type);
      if (def?.selfInteractive) return;
      if (m.row !== null && Number.isFinite(m.row)) this.select(m.v, m.row, e.ctrlKey || e.metaKey || e.shiftKey);
      else if ((e.target as Element).closest('.sb-visual-body') && this.state.selections?.[m.v.id] && !(e.target as Element).closest('.sk-table-wrap')) this.setSelection(m.v, []);
    });
    this.root.addEventListener('dblclick', (e) => {
      const m = markOf(e);
      if (m && m.row !== null) this.drillDown(m.v, m.row);
    });
    this.root.addEventListener('contextmenu', (e) => {
      const m = markOf(e);
      if (!m || m.row === null) return;
      e.preventDefault();
      const rt = this.runtimes.get(m.v.id);
      const items: MenuItem[] = [];
      const levels = this.drillLevels(m.v, visualDef(m.v.type));
      if (levels && levels.length > 1) items.push({ label: 'Drill down', action: () => this.drillDown(m.v, m.row!), disabled: (this.state.drill?.[m.v.id]?.level ?? 0) >= levels.length - 1 });
      items.push(...this.drillThroughTargets(m.v, m.row));
      if (rt?.data?.dims.length) {
        const fields = rt.data.dims.map((d) => d.field.ref);
        const tuple = this.rowTuple(rt.data, m.row);
        if (items.length) items.push({ label: '', separator: true });
        items.push({ label: 'Include only this', action: () => this.select(m.v, m.row!, false) });
        items.push({
          label: 'Exclude this',
          action: () => {
            const f: Filter = fields.length === 1 ? { field: fields[0], op: 'not-in', values: [tuple[0] ?? null] } : { op: 'sql', sql: 'NOT (' + fields.map((fr, i) => `${this.session.model.resolve(fr).expr} IS ${sqlLit(tuple[i] ?? null)}`).join(' AND ') + ')' };
            m.v.filters = [...(m.v.filters ?? []), f];
            void this.refresh(m.v.id);
          },
        });
        items.push({ label: 'Copy value', action: () => void navigator.clipboard?.writeText(tuple.map((x) => String(x ?? '')).join('\t')) });
      }
      showMenu(e.clientX, e.clientY, items);
    });
    this.root.addEventListener('mousemove', (e) => {
      const m = markOf(e);
      const rt = m ? this.runtimes.get(m.v.id) : undefined;
      if (!m || m.row === null || !rt?.data || visualDef(m.v.type)?.selfInteractive) {
        this.tooltip.classList.remove('sb-show');
        return;
      }
      const data = rt.data;
      const lines = data.columns.map((c) => `<div><span>${esc(c.label)}</span><b>${esc(c.fmt(c.values[m.row!] ?? null))}</b></div>`).join('');
      this.tooltip.innerHTML = lines;
      this.tooltip.classList.add('sb-show');
      const r = this.tooltip.getBoundingClientRect();
      const hr = this.host.getBoundingClientRect();
      let x = e.clientX - hr.left + 14;
      let y = e.clientY - hr.top + 14;
      if (e.clientX + r.width + 20 > innerWidth) x = e.clientX - hr.left - r.width - 10;
      if (e.clientY + r.height + 20 > innerHeight) y = e.clientY - hr.top - r.height - 10;
      this.tooltip.style.transform = `translate(${x}px, ${y}px)`;
    });
    this.root.addEventListener('mouseleave', () => this.tooltip.classList.remove('sb-show'));
  }

  private visualMenu(v: Visual, e: MouseEvent): void {
    e.stopPropagation();
    const rt = this.runtimes.get(v.id);
    const items: MenuItem[] = [
      { label: 'Focus mode', action: () => this.focus(v) },
      { label: 'Show as a table', action: () => this.showData(v), disabled: !rt?.data },
      { label: 'Export data (CSV)', action: () => this.exportCsv(v), disabled: !rt?.data },
      { label: 'View SQL', action: () => this.showSql(v) },
    ];
    if (this.state.selections?.[v.id]) items.push({ label: 'Clear selection', action: () => this.setSelection(v, []) });
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    showMenu(b.right - 180, b.bottom + 4, items);
  }

  focus(v: Visual): void {
    const rt = this.runtimes.get(v.id);
    if (!rt) return;
    const on = !rt.frame.classList.contains('sb-focus');
    rt.frame.classList.toggle('sb-focus', on);
    this.root.classList.toggle('sb-has-focus', on);
    if (on) {
      const close = h('button.sb-focus-close', { onclick: () => this.focus(v) }, '← Back to report');
      rt.frame.prepend(close);
    } else rt.frame.querySelector('.sb-focus-close')?.remove();
  }

  private showData(v: Visual): void {
    const rt = this.runtimes.get(v.id);
    if (!rt?.data) return;
    const d = rt.data;
    let html = '<table class="sk-table"><thead><tr>' + d.columns.map((c) => `<th>${esc(c.label)}</th>`).join('') + '</tr></thead><tbody>';
    for (let i = 0; i < d.rows; i++) html += '<tr>' + d.columns.map((c) => `<td class="${c.kind === 'measure' ? 'sk-num' : ''}">${esc(c.fmt(c.values[i] ?? null))}</td>`).join('') + '</tr>';
    html += '</tbody></table>';
    const overlay = h('div.sb-overlay', {}, h('div.sb-overlay-head', {}, h('b', {}, v.title || 'Data'), h('button', { onclick: () => overlay.remove() }, 'Close')), h('div.sk-table-wrap', { html }));
    this.root.append(overlay);
  }

  private showSql(v: Visual): void {
    let sql = '';
    try {
      sql = this.runtimes.get(v.id)?.sql || this.sqlFor(v);
    } catch (e) {
      sql = '-- ' + (e as Error).message;
    }
    const overlay = h(
      'div.sb-overlay',
      {},
      h('div.sb-overlay-head', {}, h('b', {}, 'SQL'), h('button', { onclick: () => void navigator.clipboard?.writeText(sql) }, 'Copy'), h('button', { onclick: () => overlay.remove() }, 'Close')),
      h('pre.sb-sql', {}, sql),
    );
    this.root.append(overlay);
  }

  exportCsv(v: Visual): void {
    const d = this.runtimes.get(v.id)?.data;
    if (!d) return;
    const q = (s: unknown) => {
      const t = s === null || s === undefined ? '' : String(s);
      return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    };
    let csv = d.columns.map((c) => q(c.label)).join(',') + '\n';
    for (let i = 0; i < d.rows; i++) csv += d.columns.map((c) => q(c.values[i])).join(',') + '\n';
    download(`${(v.title || v.type).replace(/[^\w-]+/g, '_')}.csv`, csv, 'text/csv');
  }

  // ---------------------------------------------------------------- helpers

  fieldLabel(ref: string): string {
    try {
      return this.session.model.resolve(ref).label;
    } catch {
      return ref;
    }
  }

  private fmtValue(ref: string, v: SqlValue): string {
    try {
      const f = this.session.model.resolve(ref);
      return formatter(f.format, f.type)(v);
    } catch {
      return String(v);
    }
  }

  /** The last data a visual rendered (designer: SQL panel, tests). */
  dataOf(id: string): { data?: VisualData; sql?: string; error?: string } {
    const rt = this.runtimes.get(id);
    return { data: rt?.data, sql: rt?.sql, error: rt?.error };
  }

  destroy(): void {
    for (const rt of this.runtimes.values()) rt.ro?.disconnect();
    this.host.replaceChildren();
  }
}

function norm(v: SqlValue): unknown {
  return typeof v === 'bigint' ? Number(v) : v;
}

function sqlLit(v: SqlValue): string {
  if (v === null) return 'NULL';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}

export function makeData(columns: DataColumn[], rows: number): VisualData {
  return {
    rows,
    columns,
    dims: columns.filter((c) => c.kind === 'dimension'),
    measures: columns.filter((c) => c.kind === 'measure'),
    role: (name) => columns.filter((c) => c.role === name),
  };
}

export function emptyData(): VisualData {
  return makeData([], 0);
}

export function toVisualData(frame: Frame, q: CompiledQuery, roleOf: Map<ResolvedField, string>): VisualData {
  const cols: DataColumn[] = q.columns.map((c) => dataColumn(c.key, roleOf.get(c.field) ?? '', c.field.label, c.field, frame.data[c.key] ?? [], formatter(c.field.format, c.field.type)));
  return makeData(cols, frame.length);
}
