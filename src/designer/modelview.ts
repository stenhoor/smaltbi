// The model view: an entity-relationship diagram of the report's tables and relationships.
//
// Table cards list their columns (keys first, marked PK/FK), calculated columns, measures and
// hierarchies. Relationships are drawn between the actual columns they join, with `*` on the
// many side, `1` on the one side, and an arrow showing which way filters flow (one → many).
// Drag a card to arrange the diagram, drag a column onto another table's column to relate them,
// click a line to edit or delete the relationship.
import type { Relationship, Report } from '../core/types.js';
import type { Model, TableInfo } from '../core/model.js';
import { splitRef } from '../core/sql.js';
import { h, toast } from 'smaltkit/dom';
import { typeIcon } from '../visuals/icons.js';
import type { DocStore } from './store.js';
import { dateTableDialog } from './datetable.js';
import { parametersDialog } from './parameters.js';
import type { ReportSession } from '../report/session.js';

export type ModelSelection = { kind: 'table'; table: string } | { kind: 'rel'; index: number } | null;

export interface ModelViewContext {
  store: DocStore;
  session: ReportSession;
  selection: ModelSelection;
  select(s: ModelSelection): void;
}

const CARD_W = 232;
const HEAD_H = 38;
const ROW_H = 22;
const MAX_ROWS = 14;
const GAP_X = 96;
const GAP_Y = 36;

interface Pos {
  x: number;
  y: number;
}

/** Estimated card height (used by auto layout before the card is in the DOM). */
function cardHeight(t: TableInfo): number {
  const rows = Math.min(MAX_ROWS, t.columns.size);
  const foot = t.measures.size || t.hierarchies.size ? 28 : 0;
  return HEAD_H + rows * ROW_H + 8 + foot;
}

/**
 * Auto layout for star and snowflake schemas: tables that only point at others (facts) go in the
 * middle column; tables they point at alternate right and left of them, one column further out per
 * hop; unrelated tables go in a row underneath.
 */
export function autoLayout(model: Model): Record<string, Pos> {
  // A role table has no card of its own: its lines go to the table it plays.
  const tables = [...model.tables.values()].filter((t) => !t.source);
  const card = (name: string) => model.tables.get(name)?.source ?? name;
  const edges = model.edges.map((e) => ({ from: card(e.from.table), to: card(e.to.table) }));
  const level = new Map<string, number>();
  const into = new Set(edges.map((e) => e.to));
  const related = new Set(edges.flatMap((e) => [e.from, e.to]));
  for (const t of tables) if (related.has(t.name) && !into.has(t.name)) level.set(t.name, 0);
  if (!level.size && related.size) level.set([...related][0]!, 0);
  // Longest path from a fact (relaxation, bounded by the table count so cycles terminate).
  for (let pass = 0; pass < tables.length; pass++) {
    let changed = false;
    for (const e of edges) {
      const l = level.get(e.from);
      if (l === undefined || e.from === e.to) continue;
      if ((level.get(e.to) ?? -1) < l + 1 && l + 1 <= tables.length) {
        level.set(e.to, l + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }
  // Column index: facts at 0; deeper levels alternate +level / -level so dimensions surround facts.
  const columns = new Map<number, TableInfo[]>();
  const seenAtLevel = new Map<number, number>();
  for (const t of tables) {
    const l = level.get(t.name);
    if (l === undefined) continue;
    let col = 0;
    if (l > 0) {
      const n = seenAtLevel.get(l) ?? 0;
      seenAtLevel.set(l, n + 1);
      col = n % 2 === 0 ? l : -l;
    }
    if (!columns.has(col)) columns.set(col, []);
    columns.get(col)!.push(t);
  }
  const out: Record<string, Pos> = {};
  const cols = [...columns.keys()].sort((a, b) => a - b);
  const heights = cols.map((c) => columns.get(c)!.reduce((s, t) => s + cardHeight(t) + GAP_Y, -GAP_Y));
  const tallest = Math.max(0, ...heights);
  cols.forEach((c, i) => {
    let y = 40 + (tallest - heights[i]!) / 2;
    for (const t of columns.get(c)!) {
      out[t.name] = { x: 40 + i * (CARD_W + GAP_X), y };
      y += cardHeight(t) + GAP_Y;
    }
  });
  let x = 40;
  const y = 40 + tallest + (tallest ? 70 : 0);
  for (const t of tables) {
    if (out[t.name]) continue;
    out[t.name] = { x, y };
    x += CARD_W + 40;
  }
  return out;
}

/** Pairs of tables connected by more than one active path (an ambiguous model). */
export function ambiguousPaths(model: Model): [string, string][] {
  return model.ambiguousPaths();
}

export class ModelView {
  readonly root: HTMLElement;
  private board: HTMLElement;
  private scroller: HTMLElement;
  private svg: SVGSVGElement;
  private cards = new Map<string, HTMLElement>();
  private pos: Record<string, Pos> = {};
  private zoom = 1;
  private fitted = false;
  private temp: SVGPathElement | null = null;

  constructor(private ctx: ModelViewContext) {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('sbd-mv-lines');
    this.board = h('div.sbd-mv-board');
    this.scroller = h('div.sbd-mv-scroll', {}, this.board);
    this.root = h('div.sbd-mv');
    this.scroller.addEventListener('pointerdown', (e) => {
      if (e.target === this.scroller || e.target === this.board || e.target === this.svg) this.ctx.select(null);
    });
    this.scroller.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        this.setZoom(this.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
      },
      { passive: false },
    );
  }

  get model(): Model {
    return this.ctx.session.model;
  }

  get report(): Report {
    return this.ctx.store.report;
  }

  setContext(ctx: ModelViewContext): void {
    this.ctx = ctx;
  }

  render(): void {
    const auto = autoLayout(this.model);
    const saved = this.report.model.layout ?? {};
    this.pos = {};
    for (const t of this.model.tables.keys()) this.pos[t] = saved[t] ?? auto[t] ?? { x: 40, y: 40 };
    const amb = ambiguousPaths(this.model);
    const notUnique = (this.report.model.relationships ?? []).filter((r) => r.active !== false && this.model.notUnique.has(r.to)).map((r) => `${r.from} → ${r.to}`);
    const toolbar = h(
      'div.sbd-mv-toolbar',
      {},
      h('button.sbd-btn', { title: 'Arrange tables automatically', onclick: () => this.autoArrange() }, 'Auto layout'),
      h('button.sbd-btn', { title: 'Find relationships from foreign keys and column names', onclick: () => this.detect() }, 'Detect relationships'),
      h(
        'button.sbd-btn.sbd-mv-datetable',
        { title: 'A calendar table related to a date column: Year › Quarter › Month › Date, fiscal years and weeks', onclick: () => void dateTableDialog(this.ctx.store, this.model) },
        this.report.model.dateTable ? 'Date table…' : 'Add date table',
      ),
      h(
        'button.sbd-btn.sbd-mv-params',
        { title: 'What-if values readers change with a Parameter control; measures use them as [@Name]', onclick: () => void parametersDialog(this.ctx.store) },
        (this.report.model.parameters?.length ? `Parameters (${this.report.model.parameters.length})…` : 'Parameters…'),
      ),
      h(
        'span.sbd-mv-zoom',
        {},
        h('button.sbd-btn', { title: 'Zoom out (Ctrl+wheel)', onclick: () => this.setZoom(this.zoom / 1.2) }, '−'),
        h('button.sbd-btn', { title: 'Actual size', onclick: () => this.setZoom(1) }, Math.round(this.zoom * 100) + '%'),
        h('button.sbd-btn', { title: 'Zoom in (Ctrl+wheel)', onclick: () => this.setZoom(this.zoom * 1.2) }, '+'),
        h('button.sbd-btn', { title: 'Fit the whole model on screen', onclick: () => this.fit() }, 'Fit'),
      ),
      notUnique.length ? h('span.sbd-mv-warn.sbd-mv-warn-notunique', { title: notUnique.join('\n') }, `⚠ ${notUnique.length} relationship${notUnique.length > 1 ? 's' : ''} to a column that isn’t unique: its numbers would be counted more than once`) : null,
      amb.length ? h('span.sbd-mv-warn', { title: amb.map(([a, b]) => `${a} → ${b}`).join('\n') }, `⚠ ${amb.length} ambiguous path${amb.length > 1 ? 's' : ''}: mark a relationship inactive`) : null,
      h('span.sbd-mv-legend', {}, 'Drag a column onto another table’s column to relate them. ', h('b', {}, '*'), ' many · ', h('b', {}, '1'), ' one · ▸ filter direction'),
    );
    this.board.replaceChildren(this.svg);
    this.cards.clear();
    // A role is drawn as its relationship (labelled with the role), not as a card of its own.
    for (const t of this.model.tables.values()) if (!t.source) this.board.append(this.card(t));
    this.root.replaceChildren(toolbar, this.scroller);
    this.applyZoom();
    requestAnimationFrame(() => {
      this.drawLines();
      if (!this.fitted) {
        this.fitted = true;
        this.fit(true);
      }
    });
  }

  private card(t: TableInfo): HTMLElement {
    const p = this.pos[t.name]!;
    const keyCols = new Set<string>();
    const fkCols = new Set<string>();
    for (const r of this.report.model.relationships ?? []) {
      const [ft, fc] = splitRef(r.from);
      const [tt, tc] = splitRef(r.to);
      if (ft === t.name) fkCols.add(fc);
      if (tt === t.name) keyCols.add(tc);
    }
    const cols = [...t.columns.values()].sort((a, b) => {
      const rank = (c: typeof a) => (c.pk || keyCols.has(c.name) ? 0 : fkCols.has(c.name) ? 1 : c.calc ? 3 : 2);
      return rank(a) - rank(b);
    });
    const rows = h('div.sbd-mv-cols', { style: `max-height:${MAX_ROWS * ROW_H}px` });
    for (const c of cols) {
      const badge = c.pk || keyCols.has(c.name) ? h('span.sbd-mv-key', { title: 'Key (one side)' }, 'PK') : fkCols.has(c.name) ? h('span.sbd-mv-fk', { title: 'Foreign key (many side)' }, 'FK') : null;
      const row = h(
        'div.sbd-mv-col' + (c.hidden ? '.sbd-mv-hidden' : '') + (c.calc ? '.sbd-mv-calc' : ''),
        { 'data-col': c.name, title: c.calc ? `${c.name} = ${c.sql}` : `${c.name} (${c.type}). Drag onto a column of another table to create a relationship.` },
        h('span.sbd-mv-icon', { html: typeIcon(c.type) }),
        h('span.sbd-mv-name', {}, c.label),
        badge,
      );
      row.addEventListener('pointerdown', (e) => this.startLink(e, t.name, c.name));
      rows.append(row);
    }
    rows.addEventListener('scroll', () => this.drawLines());
    const foot =
      t.measures.size || t.hierarchies.size
        ? h(
            'div.sbd-mv-foot',
            {},
            t.measures.size ? h('span', { title: [...t.measures.keys()].join('\n') }, `ƒx ${t.measures.size} measure${t.measures.size > 1 ? 's' : ''}`) : null,
            t.hierarchies.size ? h('span', { title: [...t.hierarchies.values()].map((x) => `${x.name}: ${x.levels.join(' › ')}`).join('\n') }, `⋮ ${t.hierarchies.size} hierarch${t.hierarchies.size > 1 ? 'ies' : 'y'}`) : null,
          )
        : null;
    const head = h('div.sbd-mv-head', { title: 'Drag to move; click for details' }, h('span.sbd-mv-title', {}, t.label), t.kind !== 'BASE TABLE' ? h('span.sbd-mv-kind', {}, t.kind.toLowerCase()) : null, this.model.links.has(t.name) ? h('span.sbd-mv-kind.sbd-mv-linkmark', { title: `A link table: ${this.linkEnds(t.name)} are related many-to-many through it` }, '⇄ link') : null, h('span.sbd-mv-count', {}, ''));
    const sel = this.ctx.selection;
    const card = h(
      'div.sbd-mv-card' + (sel?.kind === 'table' && sel.table === t.name ? '.sbd-on' : '') + (t.hidden ? '.sbd-mv-hidden' : '') + (this.model.links.has(t.name) ? '.sbd-mv-linktable' : ''),
      { 'data-table': t.name, style: `left:${p.x}px;top:${p.y}px;width:${CARD_W}px` },
      head,
      rows,
      foot,
    );
    head.addEventListener('pointerdown', (e) => this.startMove(e, t.name, card));
    this.cards.set(t.name, card);
    void this.countRows(t.name, head.querySelector('.sbd-mv-count')!);
    return card;
  }

  /** Row counts come from the session's per-load cache: re-renders (clicks, moves, model edits)
   * show a known count at once instead of blanking it and counting again. */
  /** The tables a link table relates, for its label. */
  private linkEnds(link: string): string {
    return [...new Set(this.model.edges.filter((e) => e.from.table === link).map((e) => e.to.table))].join(' and ');
  }

  private countRows(table: string, el: Element): void {
    const show = (n: number | null) => (el.textContent = n === null ? '' : new Intl.NumberFormat(undefined, { notation: 'compact' }).format(n) + ' rows');
    const session = this.ctx.session;
    if (session.knownRowCounts.has(table)) show(session.knownRowCounts.get(table)!);
    else void session.rowCount(table).then(show);
  }

  // ---------------------------------------------------------------- lines

  /** The point where a relationship meets a column row (clamped to the card's visible rows). */
  private anchor(table: string, col: string, side: 'left' | 'right'): Pos | null {
    const card = this.cards.get(table);
    if (!card) return null;
    const rows = card.querySelector('.sbd-mv-cols') as HTMLElement;
    const row = rows.querySelector(`[data-col="${CSS.escape(col)}"]`) as HTMLElement | null;
    const top = card.offsetTop + rows.offsetTop;
    let y = card.offsetTop + HEAD_H / 2;
    if (row) y = Math.max(top + 6, Math.min(top + rows.clientHeight - 6, top + row.offsetTop - rows.scrollTop + row.offsetHeight / 2));
    return { x: side === 'left' ? card.offsetLeft : card.offsetLeft + card.offsetWidth, y };
  }

  drawLines(): void {
    const cards = [...this.cards.values()];
    const w = Math.max(400, ...cards.map((c) => c.offsetLeft + c.offsetWidth)) + 200;
    const hh = Math.max(300, ...cards.map((c) => c.offsetTop + c.offsetHeight)) + 200;
    this.board.style.width = w + 'px';
    this.board.style.height = hh + 'px';
    this.svg.setAttribute('width', String(w));
    this.svg.setAttribute('height', String(hh));
    const rels = this.report.model.relationships ?? [];
    const sel = this.ctx.selection;
    let out = '';
    rels.forEach((r, i) => {
      const [ft, fc] = splitRef(r.from);
      const [tt, tc] = splitRef(r.to);
      const a = this.cards.get(ft);
      const b = this.cards.get(tt);
      if (!a || !b) return;
      const self = ft === tt;
      const aLeftOfB = a.offsetLeft + a.offsetWidth / 2 < b.offsetLeft + b.offsetWidth / 2;
      const p1 = this.anchor(ft, fc, self || aLeftOfB ? 'right' : 'left')!;
      const p2 = this.anchor(tt, tc, self ? 'right' : aLeftOfB ? 'left' : 'right')!;
      const d1 = self || aLeftOfB ? 1 : -1;
      const d2 = self ? 1 : aLeftOfB ? -1 : 1;
      const dx = Math.max(50, Math.abs(p2.x - p1.x) / 2);
      const c1 = { x: p1.x + d1 * dx, y: p1.y };
      const c2 = { x: p2.x + d2 * dx, y: p2.y };
      const d = `M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`;
      // Midpoint and tangent of the cubic at t = 0.5, for the filter-direction arrow (one → many).
      const mx = (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8;
      const my = (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8;
      const tx = p2.x + c2.x - c1.x - p1.x;
      const ty = p2.y + c2.y - c1.y - p1.y;
      const ang = (Math.atan2(-ty, -tx) * 180) / Math.PI;
      const on = sel?.kind === 'rel' && sel.index === i;
      // A target with repeated values: queries with measures refuse this relationship (ADR 0009).
      const notUnique = r.active !== false && this.model.notUnique.has(r.to);
      const cls = `sbd-mv-rel${r.active === false ? ' sbd-mv-inactive' : ''}${r.role ? ' sbd-mv-role' : ''}${notUnique ? ' sbd-mv-notunique' : ''}${on ? ' sbd-on' : ''}`;
      out += `<g class="${cls}" data-rel="${i}"><path class="sbd-mv-hit" d="${d}"/><path class="sbd-mv-path" d="${d}"/>`;
      out += `<path class="sbd-mv-arrow" d="M-6,-5 L6,0 L-6,5 Z" transform="translate(${mx.toFixed(1)},${my.toFixed(1)}) rotate(${ang.toFixed(1)})"/>`;
      out += `<text class="sbd-mv-mark" x="${p1.x + d1 * 12}" y="${p1.y - 5}" text-anchor="middle">*</text>`;
      out += `<text class="sbd-mv-mark" x="${p2.x + d2 * 12}" y="${p2.y - 5}" text-anchor="middle">1</text>`;
      if (r.role) out += `<text class="sbd-mv-rolelabel" x="${mx.toFixed(1)}" y="${(my - 9).toFixed(1)}" text-anchor="middle">as ${r.role.replace(/[<&"]/g, '')}</text>`;
      if (notUnique) out += `<text class="sbd-mv-notuniquelabel" x="${mx.toFixed(1)}" y="${(my + 18).toFixed(1)}" text-anchor="middle">⚠ not unique</text>`;
      out += '</g>';
    });
    this.svg.innerHTML = out + (this.temp ? this.temp.outerHTML : '');
    this.svg.querySelectorAll<SVGGElement>('.sbd-mv-rel').forEach((g) => {
      g.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.ctx.select({ kind: 'rel', index: Number(g.dataset.rel) });
      });
      g.addEventListener('pointerenter', () => this.highlight(Number(g.dataset.rel), true));
      g.addEventListener('pointerleave', () => this.highlight(Number(g.dataset.rel), false));
    });
    if (sel?.kind === 'rel') this.highlight(sel.index, true);
  }

  private highlight(i: number, on: boolean): void {
    const r = (this.report.model.relationships ?? [])[i];
    if (!r) return;
    const keep = this.ctx.selection?.kind === 'rel' && this.ctx.selection.index === i;
    for (const ref of [r.from, r.to]) {
      const [t, c] = splitRef(ref);
      this.cards.get(t)?.querySelector(`[data-col="${CSS.escape(c)}"]`)?.classList.toggle('sbd-mv-lit', on || keep);
    }
  }

  // ---------------------------------------------------------------- interactions

  private point(e: PointerEvent): Pos {
    const r = this.board.getBoundingClientRect();
    return { x: (e.clientX - r.left) / this.zoom, y: (e.clientY - r.top) / this.zoom };
  }

  private startMove(e: PointerEvent, table: string, card: HTMLElement): void {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = this.point(e);
    const p0 = { ...this.pos[table]! };
    let moved = false;
    card.classList.add('sbd-mv-dragging');
    const move = (ev: PointerEvent) => {
      const p = this.point(ev);
      const x = Math.max(0, Math.round((p0.x + p.x - start.x) / 4) * 4);
      const y = Math.max(0, Math.round((p0.y + p.y - start.y) / 4) * 4);
      if (Math.abs(x - p0.x) + Math.abs(y - p0.y) > 2) moved = true;
      this.pos[table] = { x, y };
      card.style.left = x + 'px';
      card.style.top = y + 'px';
      this.drawLines();
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      card.classList.remove('sbd-mv-dragging');
      if (moved) this.ctx.store.change('diagram', (r) => (r.model.layout = { ...(r.model.layout ?? {}), [table]: this.pos[table]! }));
      else this.ctx.select({ kind: 'table', table });
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  /** Drag from a column to another table's column: create a relationship. */
  private startLink(e: PointerEvent, table: string, col: string): void {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const from = this.anchor(table, col, 'right')!;
    this.temp = document.createElementNS('http://www.w3.org/2000/svg', 'path') as SVGPathElement;
    this.temp.setAttribute('class', 'sbd-mv-temp');
    const colAt = (ev: PointerEvent) => (document.elementFromPoint(ev.clientX, ev.clientY) as Element | null)?.closest('.sbd-mv-col') as HTMLElement | null;
    const tableOf = (el: Element | null | undefined) => (el?.closest('.sbd-mv-card') as HTMLElement | null)?.dataset.table;
    const move = (ev: PointerEvent) => {
      const p = this.point(ev);
      this.temp!.setAttribute('d', `M${from.x},${from.y} L${p.x},${p.y}`);
      this.drawLines();
      this.board.querySelectorAll('.sbd-mv-target').forEach((x) => x.classList.remove('sbd-mv-target'));
      const over = colAt(ev);
      if (over && tableOf(over) !== table) over.classList.add('sbd-mv-target');
    };
    const up = (ev: PointerEvent) => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      this.temp = null;
      this.board.querySelectorAll('.sbd-mv-target').forEach((x) => x.classList.remove('sbd-mv-target'));
      const over = colAt(ev);
      const other = tableOf(over);
      if (!over || !other || other === table) return this.drawLines();
      this.link(table, col, other, over.dataset.col!);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  /** Create a relationship; the side that is a key (or named id) becomes the one side. */
  link(t1: string, c1: string, t2: string, c2: string): void {
    const isKey = (t: string, c: string) => !!this.model.tables.get(t)?.columns.get(c)?.pk || c.toLowerCase() === 'id';
    let rel: Relationship = { from: `${t1}.${c1}`, to: `${t2}.${c2}` };
    if (isKey(t1, c1) && !isKey(t2, c2)) rel = { from: `${t2}.${c2}`, to: `${t1}.${c1}` };
    const rels = this.report.model.relationships ?? [];
    if (rels.some((r) => (r.from === rel.from && r.to === rel.to) || (r.from === rel.to && r.to === rel.from))) {
      toast('Those columns are already related');
      this.drawLines();
      return;
    }
    this.ctx.store.change('model', (r) => (r.model.relationships = [...(r.model.relationships ?? []), rel]));
    this.ctx.select({ kind: 'rel', index: rels.length });
    toast(`Related ${rel.from} → ${rel.to}`, 'ok');
  }

  autoArrange(): void {
    this.ctx.store.change('diagram', (r) => delete r.model.layout);
  }

  detect(): void {
    const existing = new Set((this.report.model.relationships ?? []).map((r) => r.from));
    const found = [...(this.ctx.session.schema.foreignKeys ?? []), ...this.model.suggestRelationships()].filter((r) => {
      if (existing.has(r.from)) return false;
      existing.add(r.from);
      return true;
    });
    if (!found.length) return toast('No new relationships found');
    this.ctx.store.change('model', (r) => (r.model.relationships = [...(r.model.relationships ?? []), ...found]));
    toast(`Added ${found.length} relationship${found.length > 1 ? 's' : ''}`, 'ok');
  }

  setZoom(z: number): void {
    this.zoom = Math.max(0.3, Math.min(2, z));
    this.applyZoom();
    const label = this.root.querySelector('.sbd-mv-zoom button:nth-child(2)');
    if (label) label.textContent = Math.round(this.zoom * 100) + '%';
  }

  /** Zoom so every card is visible (never above 100%; `shrinkOnly` keeps 100% when it fits). */
  fit(shrinkOnly = false): void {
    const cards = [...this.cards.values()];
    if (!cards.length || !this.scroller.clientWidth) return;
    const w = Math.max(...cards.map((c) => c.offsetLeft + c.offsetWidth)) + 40;
    const hh = Math.max(...cards.map((c) => c.offsetTop + c.offsetHeight)) + 40;
    const z = Math.min(1, (this.scroller.clientWidth - 8) / w, (this.scroller.clientHeight - 8) / hh);
    if (shrinkOnly && z >= 1) return;
    this.setZoom(z);
    this.scroller.scrollTo(0, 0);
  }

  private applyZoom(): void {
    this.board.style.transform = `scale(${this.zoom})`;
  }

  /** Scroll a table card into view and flash it. */
  reveal(table: string): void {
    const card = this.cards.get(table);
    if (!card) return;
    card.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    card.classList.add('sbd-mv-flash');
    setTimeout(() => card.classList.remove('sbd-mv-flash'), 900);
  }
}
