// The smaltbi designer: fields on the left, the report canvas in the middle, visual settings on
// the right, pages at the bottom. Everything is edited in place and saved as report JSON.
import '../visuals/index.js';
import type { FieldRef, Report, Theme, Visual } from '../core/types.js';
import { visualDef } from '../visuals/index.js';
import { ReportSession } from '../report/session.js';
import { ReportView } from '../report/view.js';
import { type ColorMode, colorModeButton, poweredByBadge, viewerBar } from '../report/chrome.js';
import { pageLayout } from '../theme/theme.js';
import { type Engine, loadEngine } from '../report/engine.js';
import { dialog, download, fileName, h, pickFile, showMenu, toast } from 'smaltkit/dom';
import { localFiles } from '../kit/files.js';
import { corsHint } from 'smaltkit/urls';
import { DocStore, emptyReport, freeSpot, newId, type ChangeKind } from './store.js';
import { FIELD_MIME, fieldsPane } from './fields.js';
import { defaultFilter, panel } from './panel.js';
import { dataDialog, measureDialog, publishDialog, themeDialog, type DialogContext } from './dialogs.js';
import { quickMeasureDialog } from './quickmeasure.js';
import { ModelView, type ModelSelection } from './modelview.js';
import { modelPanel } from './modelpanel.js';

const SAMPLE = 'examples/sales/report.json';
const appBase = document.baseURI;

class Designer {
  view!: ReportView;
  selected: string | null = null;
  tab = 'Build';
  preview = false;
  /** Report canvas or the model (ER) diagram. */
  mode: 'report' | 'model' = 'report';
  modelSel: ModelSelection = null;
  private modelView: ModelView | null = null;
  collapsed = new Set<string>();
  private previewBar: ReturnType<typeof viewerBar> | undefined;
  private fieldsHost = h('aside.sbd-left');
  private panelHost = h('aside.sbd-right');
  private canvasHost = h('div.sbd-canvas');
  private pagesHost = h('nav.sbd-pages');
  private top = h('header.sbd-top');
  // Light, dark or automatic, for the designer and the report on its canvas; shared with the viewer and the site.
  private colorMode: ColorMode = 'auto';
  private modeBtn = colorModeButton('button.sbd-tbtn.sbd-mode', (m) => this.applyColorMode(m));
  private root = h('div.sbd-app');

  constructor(
    public store: DocStore,
    public session: ReportSession,
    private engine: Engine,
  ) {
    store.on((kind, id) => void this.onChange(kind, id));
    this.root.append(this.top, this.fieldsHost, h('main.sbd-main', {}, this.canvasHost, this.pagesHost), this.panelHost);
    document.getElementById('app')!.replaceChildren(this.root);
    this.mountView();
    this.renderAll();
    this.bindKeys();
    this.bindCanvasDrop();
  }

  get dctx(): DialogContext {
    return { store: this.store, session: this.session, appBase };
  }

  get page() {
    return this.view.page;
  }

  mountView(): void {
    const state = this.view?.state;
    this.canvasHost.replaceChildren();
    // App-level state first: the Model branch below can return early.
    this.root.classList.toggle('sbd-model-mode', this.mode === 'model');
    this.root.classList.toggle('sbd-preview', this.preview);
    this.previewBar = undefined;
    if (this.mode === 'model' && !this.preview) {
      // The diagram replaces the canvas. The report view object is kept only for its view state
      // (current page); it is rebuilt when switching back to Report or Preview.
      this.modelView = new ModelView(this.modelContext());
      this.canvasHost.append(this.modelView.root);
      this.modelView.render();
      if (this.view) return;
    } else this.modelView = null;
    this.view?.destroy();
    const host = h('div.sbd-report-host');
    if (this.mode === 'model' && !this.preview) host.hidden = true;
    this.canvasHost.append(host);
    this.view = new ReportView(
      this.session,
      host,
      {
        mode: this.preview ? 'view' : 'edit',
        onSelectVisual: (id) => this.select(id),
        onState: () => (this.renderPages(), this.previewBar?.renderTabs()),
        decorate: (frame, v) => this.decorate(frame, v),
      },
      state ? { page: state.page } : undefined,
    );
    this.view.selectedVisual = this.selected;
    this.view.setColorMode(this.colorMode);
    if (this.preview) {
      // The top bar keeps the colour-mode switch, so the preview's bar leaves its own out.
      const bar = viewerBar(this.view, { mode: false, extra: [h('button.sbv-btn', { onclick: () => this.togglePreview() }, '✎ Back to editing')] });
      this.canvasHost.prepend(bar);
      this.previewBar = bar;
      // Preview shows what readers get, including the badge.
      const badge = poweredByBadge(this.store.report);
      if (badge) this.canvasHost.append(badge);
    }
    this.view.render();
  }

  /** The report canvas is on screen (not replaced by the model diagram). */
  get reportVisible(): boolean {
    return this.mode === 'report' || this.preview;
  }

  /** Re-render the report canvas, unless the model diagram is showing (it is rebuilt on return). */
  renderReport(): void {
    if (this.reportVisible) this.view.render();
  }

  private modelContext() {
    return {
      store: this.store,
      session: this.session,
      selection: this.modelSel,
      select: (s: ModelSelection) => this.selectModel(s),
    };
  }

  selectModel(s: ModelSelection): void {
    this.modelSel = s;
    if (this.modelView) {
      this.modelView.setContext(this.modelContext());
      this.modelView.render();
    }
    this.renderPanel();
  }

  setMode(mode: 'report' | 'model'): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.modelSel = null;
    if (mode === 'report') {
      this.modelView = null;
      this.mountView();
    } else {
      this.select(null);
      this.mountView();
    }
    this.renderAll();
  }

  renderAll(): void {
    this.renderTop();
    this.renderFields();
    this.renderPanel();
    this.renderPages();
  }

  // ---------------------------------------------------------------- top bar

  renderTop(): void {
    const name = h('input.sbd-name', { value: this.store.report.name, title: 'Report name' }) as HTMLInputElement;
    name.addEventListener('change', () => this.store.change('report', (r) => (r.name = name.value || 'Untitled report')));
    const btn = (label: string, title: string, fn: () => void, cls = '') => h('button.sbd-tbtn' + cls, { title, onclick: fn }, label);
    this.top.replaceChildren(
      h('a.sbd-logo', {
        href: 'https://github.com/stenhoor/smaltbi',
        target: '_blank',
        rel: 'noopener',
        title: 'smaltbi: Small. Alternative. Insight.',
        // Brand assets from stenhoor/smalt-brand (brand/): the Scatter mark and the wordmark, light and dark.
        html:
          '<img class="sbd-light" src="brand/scatter-mark.svg" alt="" width="24" height="24"><img class="sbd-dark" src="brand/scatter-mark-on-dark.svg" alt="" width="24" height="24">' +
          '<img class="sbd-light" src="brand/wordmark.svg" alt="smaltbi" height="15"><img class="sbd-dark" src="brand/wordmark-on-dark.svg" alt="smaltbi" height="15">',
      }),
      name,
      ...(this.preview
        ? []
        : [h(
            'div.sbd-seg',
            { role: 'tablist' },
            h('button.sbd-seg-btn' + (this.mode === 'report' ? '.sbd-on' : ''), { role: 'tab', title: 'Design report pages', onclick: () => this.setMode('report') }, 'Report'),
            h('button.sbd-seg-btn' + (this.mode === 'model' ? '.sbd-on' : ''), { role: 'tab', title: 'Tables and relationships (ER diagram)', onclick: () => this.setMode('model') }, 'Model'),
          )]),
      h(
        'div.sbd-tgroup',
        {},
        btn('File', 'New, open, save', () => this.fileMenu()),
        btn('Data', 'Data sources', () => void dataDialog(this.dctx)),
        btn('Theme', 'Colors, fonts, layout', () => void themeDialog(this.dctx, (t) => this.applyTheme(t))),
      ),
      h(
        'div.sbd-tgroup',
        {},
        h('button.sbd-tbtn', { title: 'Undo (Ctrl+Z)', disabled: !this.store.canUndo, onclick: () => this.store.undo() }, '↶'),
        h('button.sbd-tbtn', { title: 'Redo (Ctrl+Shift+Z)', disabled: !this.store.canRedo, onclick: () => this.store.redo() }, '↷'),
      ),
      h('div.sbd-spacer'),
      this.modeBtn,
      h('span.sbd-engine', { title: 'Query engine' }, this.engine.label),
      btn(this.preview ? '✎ Edit' : '▶ Preview', 'Try the report as a viewer sees it', () => this.togglePreview()),
      btn('Publish', 'Download a static site', () => void publishDialog(this.dctx), '.sbd-primary'),
    );
  }

  /** Light / dark for the designer's chrome (`data-theme`, read by tokens.css and app.css) and the report canvas. */
  private applyColorMode(m: ColorMode): void {
    this.colorMode = m;
    if (m === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = m;
    if (m === 'auto') document.body.removeAttribute('data-mode');
    else document.body.dataset.mode = m;
    this.view?.setColorMode(m);
  }

  private fileMenu(): void {
    const r = this.top.querySelector('.sbd-tgroup .sbd-tbtn')!.getBoundingClientRect();
    showMenu(r.left, r.bottom + 4, [
      { label: 'New report', action: () => void this.openReport(emptyReport(), appBase) },
      { label: 'Open report file…', action: () => void this.openFile() },
      { label: 'Open from URL…', action: () => void this.openUrl() },
      { label: 'Open the sample report', action: () => void this.openUrlString(SAMPLE) },
      { label: '', separator: true },
      { label: 'Save report file', hint: 'Ctrl+S', action: () => this.save() },
      { label: 'Copy report JSON', action: () => void navigator.clipboard?.writeText(JSON.stringify(this.store.report, null, 2)).then(() => toast('Copied', 'ok')) },
    ]);
  }

  save(): void {
    download(fileName(this.store.report.name, 'report') + '.smaltbi.json', JSON.stringify(this.store.report, null, 2) + '\n', 'application/json');
  }

  async openFile(): Promise<void> {
    const f = await pickFile('.json');
    if (!f) return;
    try {
      const report = JSON.parse(await f.text()) as Report;
      await this.openReport(report, appBase);
    } catch (e) {
      toast('Could not open: ' + (e as Error).message, 'error');
    }
  }

  async openUrl(): Promise<void> {
    const input = h('input.sbd-input', { placeholder: 'https://…/report.json' }) as HTMLInputElement;
    const url = await dialog<string>('Open from URL', input, [{ label: 'Cancel' }, { label: 'Open', primary: true, value: () => input.value || undefined }]);
    if (url) await this.openUrlString(url);
  }

  async openUrlString(url: string): Promise<void> {
    const abs = new URL(url, appBase).href;
    try {
      const r = await fetch(abs, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await this.openReport((await r.json()) as Report, abs);
      history.replaceState(null, '', `?report=${encodeURIComponent(url)}`);
    } catch (e) {
      toast(`Could not open ${url}: ${(e as Error).message}`, 'error');
    }
  }

  async openReport(report: Report, base: string): Promise<void> {
    if (report.smaltbi !== 1 || !Array.isArray(report.pages)) throw new Error('not a smaltbi report');
    toast('Loading data…');
    const session = await ReportSession.open(report, base, { engine: this.engine, files: localFiles });
    this.store = new DocStore(report, base);
    this.store.on((kind, id) => void this.onChange(kind, id));
    this.session = session;
    this.selected = null;
    this.modelSel = null;
    this.view.destroy();
    this.view = undefined as unknown as ReportView;
    this.mountView();
    this.renderAll();
    this.store.autosave();
  }

  togglePreview(): void {
    this.preview = !this.preview;
    this.selected = null;
    // A relationship selected in the diagram must not stay selected (and deletable) while hidden.
    this.modelSel = null;
    this.mountView();
    this.renderAll();
  }

  async applyTheme(t: Theme | string): Promise<void> {
    await this.session.setTheme(t);
    this.view.applyTheme();
    this.view.render();
  }

  // ---------------------------------------------------------------- panes

  renderFields(): void {
    this.fieldsHost.replaceChildren(
      fieldsPane(
        this.session.model,
        {
          add: (ref) => this.addField(ref),
          newMeasure: (t) => void measureDialog(this.dctx, t),
          newColumn: (t) => void measureDialog(this.dctx, t, undefined, 'column'),
          editMeasure: (t, n) => void this.editMeasure(t, n),
          quickMeasure: (t, n, of) => void quickMeasureDialog(this.dctx, t, n, of),
          editColumn: (t, n) => void measureDialog(this.dctx, t, n, 'column'),
          filter: (ref) => {
            const sel = this.selected ? this.store.visual(this.selected)?.visual : undefined;
            if (sel) this.store.change('visual', () => (sel.filters = [...(sel.filters ?? []), defaultFilter(this, ref)]), sel.id);
            else this.store.change('page', () => (this.page.filters = [...(this.page.filters ?? []), defaultFilter(this, ref)]), this.page.id);
            this.tab = 'Filters';
            this.renderPanel();
          },
        },
        this.collapsed,
      ),
    );
  }

  renderPanel(): void {
    if (this.preview) return void this.panelHost.replaceChildren();
    if (this.mode === 'model' && this.modelView) {
      this.panelHost.replaceChildren(
        modelPanel({
          ...this.modelContext(),
          diagram: this.modelView,
          editMeasure: (t, n) => void (n ? this.editMeasure(t, n) : measureDialog(this.dctx, t)),
          editColumn: (t, n) => void measureDialog(this.dctx, t, n, 'column'),
        }),
      );
      return;
    }
    this.panelHost.replaceChildren(
      panel({
        store: this.store,
        session: this.session,
        view: this.view,
        selected: this.selected,
        page: this.page,
        tab: this.tab,
        setTab: (t) => ((this.tab = t), this.renderPanel()),
        createVisual: (type, fields) => this.createVisual(type, fields),
        changeType: (v, type) => this.changeType(v, type),
      }),
    );
  }

  renderPages(): void {
    const r = this.store.report;
    this.pagesHost.replaceChildren(
      ...r.pages.map((p) =>
        h(
          'button.sbd-page-tab' + (p.id === this.view.state.page ? '.sbd-on' : '') + (p.hidden ? '.sbd-hidden' : ''),
          {
            onclick: () => this.goToPage(p.id),
            ondblclick: () => this.renamePage(p.id),
            oncontextmenu: (e: Event) => {
              const me = e as MouseEvent;
              me.preventDefault();
              showMenu(me.clientX, me.clientY, [
                { label: 'Rename', action: () => this.renamePage(p.id) },
                { label: 'Duplicate', action: () => this.duplicatePage(p.id) },
                { label: p.hidden ? 'Show in viewer' : 'Hide in viewer', action: () => this.store.change('pages', () => (p.hidden = !p.hidden || undefined)) },
                { label: 'Move left', disabled: r.pages[0] === p, action: () => this.movePage(p.id, -1) },
                { label: 'Move right', disabled: r.pages.at(-1) === p, action: () => this.movePage(p.id, 1) },
                { label: 'Delete', disabled: r.pages.length < 2, action: () => this.deletePage(p.id) },
              ]);
            },
          },
          p.drillthrough?.length ? '↳ ' : '',
          p.name,
        ),
      ),
      ...(this.preview ? [] : [h('button.sbd-page-add', { title: 'New page', onclick: () => this.addPage() }, '+')]),
    );
  }

  goToPage(id: string): void {
    this.selected = null;
    this.view.selectedVisual = null;
    this.view.goTo(id);
    this.renderPanel();
  }

  addPage(): void {
    const id = newId('page', this.store.report.pages.map((p) => p.id));
    this.store.change('pages', (r) => r.pages.push({ id, name: `Page ${r.pages.length + 1}`, visuals: [] }));
    this.goToPage(id);
  }

  renamePage(id: string): void {
    const p = this.store.page(id);
    const name = p && prompt('Page name', p.name);
    if (p && name) this.store.change('pages', () => (p.name = name));
  }

  duplicatePage(id: string): void {
    const p = this.store.page(id);
    if (!p) return;
    const copy = structuredClone(p);
    copy.id = newId('page', this.store.report.pages.map((x) => x.id));
    copy.name = p.name + ' (copy)';
    const taken = this.store.report.pages.flatMap((x) => x.visuals.map((v) => v.id));
    for (const v of copy.visuals) {
      v.id = newId('v', taken);
      taken.push(v.id);
    }
    this.store.change('pages', (r) => r.pages.splice(r.pages.indexOf(p) + 1, 0, copy));
    this.goToPage(copy.id);
  }

  movePage(id: string, d: number): void {
    this.store.change('pages', (r) => {
      const i = r.pages.findIndex((p) => p.id === id);
      const [p] = r.pages.splice(i, 1);
      r.pages.splice(Math.max(0, Math.min(r.pages.length, i + d)), 0, p!);
    });
  }

  deletePage(id: string): void {
    if (!confirm('Delete this page?')) return;
    this.store.change('pages', (r) => (r.pages = r.pages.filter((p) => p.id !== id)));
    this.goToPage(this.store.report.pages[0]!.id);
  }

  // ---------------------------------------------------------------- visuals

  select(id: string | null): void {
    if (this.selected === id) return;
    this.selected = id;
    this.view.selectedVisual = id;
    this.canvasHost.querySelectorAll('.sb-visual').forEach((el) => el.classList.toggle('sb-selected', (el as HTMLElement).dataset.id === id));
    this.renderPanel();
  }

  allVisualIds(): string[] {
    return this.store.report.pages.flatMap((p) => p.visuals.map((v) => v.id));
  }

  createVisual(type: string, fields: Record<string, FieldRef[]> = {}, at?: { x: number; y: number }): void {
    const def = visualDef(type);
    if (!def) return;
    const size = type === 'card' ? { w: 3, h: 2 } : type === 'slicer' ? { w: 3, h: 3 } : type === 'text' ? { w: 6, h: 1 } : { w: 5, h: 5 };
    const spot = at ?? freeSpot(this.page, size.w, size.h, pageLayout(this.session.theme, this.page).columns);
    const v: Visual = { id: newId('v', this.allVisualIds()), type, layout: { x: Math.min(spot.x, 12 - size.w), y: spot.y, ...size }, fields };
    this.store.change('page', () => this.page.visuals.push(v), this.page.id);
    this.select(v.id);
  }

  /** Change a visual's type, moving fields to compatible roles. */
  changeType(v: Visual, type: string): void {
    const to = visualDef(type);
    const from = visualDef(v.type);
    if (!to || !from) return;
    const dims: FieldRef[] = [];
    const measures: FieldRef[] = [];
    for (const r of from.roles) for (const f of v.fields[r.name] ?? []) (r.kind === 'dimension' ? dims : measures).push(f);
    const fields: Record<string, FieldRef[]> = {};
    const fill = (list: FieldRef[], kind: 'dimension' | 'measure') => {
      for (const role of to.roles.filter((r) => r.kind === kind)) {
        const n = role.max ?? (role.drill || kind === 'measure' ? list.length : list.length);
        const take = list.splice(0, n);
        if (take.length) fields[role.name] = take;
      }
    };
    fill(dims, 'dimension');
    fill(measures, 'measure');
    this.store.change(
      'visual',
      () => {
        v.type = type;
        v.fields = fields;
        v.options = undefined;
      },
      v.id,
    );
  }

  /** Click on a field: add it to the selected visual's best role, or start a new visual. */
  addField(ref: string, target?: Visual): void {
    if (this.mode === 'model') {
      const table = ref.slice(0, ref.indexOf('.'));
      this.selectModel({ kind: 'table', table });
      this.modelView?.reveal(table);
      return;
    }
    const kind = this.session.model.kindOf(ref);
    const sel = target ?? (this.selected ? this.store.visual(this.selected)?.visual : undefined);
    if (!sel) {
      const isMeasure = kind === 'measure';
      return this.createVisual(isMeasure ? 'card' : 'table', isMeasure ? { values: [ref] } : { columns: [ref] });
    }
    const def = visualDef(sel.type);
    if (!def) return;
    const wantKind = kind === 'measure' ? 'measure' : kind === 'hierarchy' ? 'dimension' : this.session.model.column(ref)?.type === 'number' && def.roles.some((r) => r.kind === 'measure' && !(sel.fields[r.name] ?? []).length) && def.roles.filter((r) => r.kind === 'dimension').every((r) => (sel.fields[r.name] ?? []).length) ? 'measure' : 'dimension';
    const roles = def.roles.filter((r) => r.kind === wantKind);
    const role = roles.find((r) => !(sel.fields[r.name] ?? []).length) ?? roles.find((r) => !r.max || (sel.fields[r.name] ?? []).length < r.max) ?? def.roles.find((r) => !r.max || (sel.fields[r.name] ?? []).length < r.max);
    if (!role) return toast(`${def.label} has no room for another field`, 'error');
    this.store.change('visual', () => (sel.fields = { ...sel.fields, [role.name]: [...(sel.fields[role.name] ?? []), ref] }), sel.id);
    this.select(sel.id);
  }

  deleteVisual(id: string): void {
    this.store.change('page', () => (this.page.visuals = this.page.visuals.filter((v) => v.id !== id)), this.page.id);
    this.select(null);
  }

  duplicateVisual(id: string): void {
    const v = this.page.visuals.find((x) => x.id === id);
    if (!v) return;
    const copy = structuredClone(v);
    copy.id = newId('v', this.allVisualIds());
    copy.layout = { ...copy.layout, ...freeSpot(this.page, v.layout.w, v.layout.h) };
    this.store.change('page', () => this.page.visuals.push(copy), this.page.id);
    this.select(copy.id);
  }

  /** Move / resize handles and drop targets on each visual frame (edit mode). */
  decorate(frame: HTMLElement, v: Visual): void {
    if (this.preview) return;
    frame.classList.add('sbd-editable');
    const grip = h('div.sbd-grip', { title: 'Drag to move' }, '⠿');
    const resize = h('div.sbd-resize', { title: 'Drag to resize' });
    const del = h('button.sbd-del', { title: 'Delete (Del)', onclick: (e: Event) => (e.stopPropagation(), this.deleteVisual(v.id)) }, '×');
    frame.append(grip, resize, del);
    frame.addEventListener('pointerdown', () => this.select(v.id));
    const drag = (mode: 'move' | 'resize') => (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.select(v.id);
      const grid = frame.parentElement!;
      const layout = pageLayout(this.session.theme, this.page);
      const gr = grid.getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(grid).columnGap) || layout.gap;
      const colW = (gr.width + gap) / layout.columns;
      const rowH = layout.rowHeight + gap;
      const start = { x: e.clientX, y: e.clientY, l: { ...v.layout } };
      let next = { ...v.layout };
      frame.classList.add('sbd-dragging');
      const move = (ev: PointerEvent) => {
        const dx = Math.round((ev.clientX - start.x) / colW);
        const dy = Math.round((ev.clientY - start.y) / rowH);
        if (mode === 'move') next = { ...start.l, x: Math.max(0, Math.min(layout.columns - start.l.w, start.l.x + dx)), y: Math.max(0, start.l.y + dy) };
        else next = { ...start.l, w: Math.max(1, Math.min(layout.columns - start.l.x, start.l.w + dx)), h: Math.max(1, start.l.h + dy) };
        frame.style.gridColumn = `${next.x + 1} / span ${next.w}`;
        frame.style.gridRow = `${next.y + 1} / span ${next.h}`;
      };
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        frame.classList.remove('sbd-dragging');
        if (JSON.stringify(next) !== JSON.stringify(v.layout)) this.store.change('layout', () => (v.layout = next), v.id);
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
    };
    grip.addEventListener('pointerdown', drag('move'));
    frame.querySelector('.sb-visual-head')?.addEventListener('pointerdown', (e) => {
      if (!(e.target as Element).closest('button')) drag('move')(e as PointerEvent);
    });
    resize.addEventListener('pointerdown', drag('resize'));
    frame.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types.includes(FIELD_MIME)) {
        e.preventDefault();
        e.stopPropagation();
        frame.classList.add('sbd-drop-target');
      }
    });
    frame.addEventListener('dragleave', () => frame.classList.remove('sbd-drop-target'));
    frame.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      frame.classList.remove('sbd-drop-target');
      const ref = e.dataTransfer!.getData(FIELD_MIME);
      if (ref) this.addField(ref, v);
    });
  }

  /** Dropping a field on empty canvas creates a visual there. */
  private bindCanvasDrop(): void {
    this.canvasHost.addEventListener('dragover', (e) => {
      if (!this.preview && this.mode === 'report' && e.dataTransfer?.types.includes(FIELD_MIME)) e.preventDefault();
    });
    this.canvasHost.addEventListener('drop', (e) => {
      const ref = e.dataTransfer?.getData(FIELD_MIME);
      if (!ref || this.preview || this.mode !== 'report') return;
      e.preventDefault();
      const grid = this.canvasHost.querySelector('.sb-page') as HTMLElement | null;
      let at: { x: number; y: number } | undefined;
      if (grid) {
        const layout = pageLayout(this.session.theme, this.page);
        const r = grid.getBoundingClientRect();
        at = { x: Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * layout.columns)), y: Math.max(0, Math.floor((e.clientY - r.top) / (layout.rowHeight + layout.gap))) };
      }
      const kind = this.session.model.kindOf(ref);
      const numeric = kind === 'column' && this.session.model.column(ref)?.type === 'number';
      this.selected = null;
      if (kind === 'measure' || numeric) this.createVisual('card', { values: [ref] }, at);
      else if (kind === 'hierarchy' || this.session.model.column(ref)?.type === 'date') this.createVisual('column', { category: [ref] }, at);
      else this.createVisual('bar', { category: [ref] }, at);
    });
    this.canvasHost.addEventListener('pointerdown', (e) => {
      if (!(e.target as Element).closest('.sb-visual')) this.select(null);
    });
  }

  private bindKeys(): void {
    addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      const typing = /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.save();
      } else if (typing) return;
      else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.store.redo();
        else this.store.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.store.redo();
      } else if (mod && e.key.toLowerCase() === 'd' && this.selected) {
        e.preventDefault();
        this.duplicateVisual(this.selected);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.mode === 'model' && !this.preview && this.modelSel?.kind === 'rel') {
        e.preventDefault();
        const i = this.modelSel.index;
        this.selectModel(null);
        this.store.change('model', (r) => (r.model.relationships = (r.model.relationships ?? []).filter((_, j) => j !== i)));
      } else if (e.key === 'Escape' && this.mode === 'model' && !this.preview) this.selectModel(null);
      else if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected) {
        e.preventDefault();
        this.deleteVisual(this.selected);
      } else if (e.key === 'Escape') this.select(null);
    });
  }

  // ---------------------------------------------------------------- changes

  /** Edit a measure: the SQL dialog, or the quick-measure dialog for a time-intelligence measure. */
  private editMeasure(table: string, name: string): void {
    const m = this.store.report.model.measures?.find((x) => x.table === table && x.name === name);
    if (m?.time) void quickMeasureDialog(this.dctx, table, name);
    else void measureDialog(this.dctx, table, name);
  }

  private async onChange(kind: ChangeKind, id?: string): Promise<void> {
    try {
      switch (kind) {
        case 'visual': {
          const found = id ? this.store.visual(id) : undefined;
          if (found && found.page.id === this.page.id && this.reportVisible) this.view.updateVisual(found.visual);
          break;
        }
        case 'layout':
        case 'page':
          this.renderReport();
          break;
        case 'pages':
          if (!this.store.page(this.view.state.page)) this.view.state.page = this.store.report.pages[0]!.id;
          this.renderReport();
          break;
        case 'model':
          this.session.rebuildModel();
          this.renderFields();
          this.renderReport();
          this.modelView?.render();
          break;
        case 'diagram':
          this.modelView?.render();
          break;
        case 'data':
          toast('Loading data…');
          await this.session.reloadData();
          this.renderFields();
          this.renderReport();
          this.modelView?.render();
          toast('Data loaded', 'ok');
          break;
        case 'theme':
          await this.session.setTheme(this.store.report.theme);
          this.view.applyTheme();
          this.renderReport();
          break;
        default:
          this.session.rebuildModel();
          this.renderFields();
          this.renderReport();
      }
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      toast(msg + (corsHint(msg) ? ' — ' + corsHint(msg) : ''), 'error', 8000);
    }
    this.renderTop();
    this.renderPanel();
    this.renderPages();
  }
}

async function boot(): Promise<void> {
  const app = document.getElementById('app')!;
  app.replaceChildren(h('div.sbv-loading', {}, h('div.sbv-spinner'), h('div', {}, 'Starting smaltbi…')));
  const engine = await loadEngine();
  const param = new URLSearchParams(location.search).get('report');
  let report: Report;
  let base = appBase;
  const saved = !param ? DocStore.restore() : null;
  if (param) {
    base = new URL(param, appBase).href;
    report = (await (await fetch(base, { cache: 'no-cache' })).json()) as Report;
  } else if (saved) {
    report = saved.report;
    base = saved.base;
  } else {
    base = new URL(SAMPLE, appBase).href;
    report = (await (await fetch(base)).json()) as Report;
  }
  let session: ReportSession;
  try {
    session = await ReportSession.open(report, base, { engine, files: localFiles, log: (_l, t) => {
      // The loading screen shows progress; the session keeps this log for later reloads, when that screen is gone.
      const status = app.querySelector('.sbv-loading div:last-child');
      if (status) status.textContent = t;
    } });
  } catch (e) {
    console.error(e);
    toast('The saved report could not load its data: ' + (e as Error).message + '. Starting with the sample.', 'error', 8000);
    DocStore.clearAutosave();
    base = new URL(SAMPLE, appBase).href;
    report = (await (await fetch(base)).json()) as Report;
    session = await ReportSession.open(report, base, { engine, files: localFiles });
  }
  const store = new DocStore(report, base);
  const d = new Designer(store, session, engine);
  (window as unknown as { smaltbi: unknown }).smaltbi = d;
}

void boot();
