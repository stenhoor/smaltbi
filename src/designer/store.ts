// The designer's document: the report being edited, undo/redo history and autosave.
import type { Page, Report, Visual } from '../core/types.js';

const AUTOSAVE = 'smaltbi.autosave';

/** What changed, so the designer refreshes only what depends on it. `diagram` is the model
 * diagram's card positions: saved and undoable, but nothing re-queries. */
export type ChangeKind = 'visual' | 'layout' | 'page' | 'pages' | 'model' | 'diagram' | 'data' | 'theme' | 'report';

export class DocStore {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private listeners: ((kind: ChangeKind, id?: string) => void)[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    public report: Report,
    public base: string,
  ) {}

  on(fn: (kind: ChangeKind, id?: string) => void): void {
    this.listeners.push(fn);
  }

  /** Record the state before a change. */
  checkpoint(): void {
    this.undoStack.push(JSON.stringify(this.report));
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Apply a change: checkpoint, mutate, notify. */
  change(kind: ChangeKind, fn: (r: Report) => void, id?: string): void {
    this.checkpoint();
    fn(this.report);
    this.notify(kind, id);
  }

  notify(kind: ChangeKind, id?: string): void {
    for (const l of this.listeners) l(kind, id);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.autosave(), 400);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(JSON.stringify(this.report));
    this.replace(JSON.parse(prev));
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(JSON.stringify(this.report));
    this.replace(JSON.parse(next));
  }

  private replace(r: Report): void {
    const dataChanged = JSON.stringify(r.data) !== JSON.stringify(this.report.data);
    const modelChanged = JSON.stringify(r.model) !== JSON.stringify(this.report.model);
    const themeChanged = JSON.stringify(r.theme) !== JSON.stringify(this.report.theme);
    Object.assign(this.report, r);
    for (const k of Object.keys(this.report) as (keyof Report)[]) if (!(k in r)) delete this.report[k];
    this.notify(dataChanged ? 'data' : modelChanged ? 'model' : themeChanged ? 'theme' : 'report');
  }

  autosave(): void {
    try {
      localStorage.setItem(AUTOSAVE, JSON.stringify({ base: this.base, report: this.report, at: Date.now() }));
    } catch {
      // storage full or blocked: saving to a file still works
    }
  }

  static restore(): { base: string; report: Report } | null {
    try {
      const s = localStorage.getItem(AUTOSAVE);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  }

  static clearAutosave(): void {
    try {
      localStorage.removeItem(AUTOSAVE);
    } catch {}
  }

  // ---------------------------------------------------------------- lookups

  page(id: string): Page | undefined {
    return this.report.pages.find((p) => p.id === id);
  }

  visual(id: string): { page: Page; visual: Visual } | undefined {
    for (const page of this.report.pages) {
      const visual = page.visuals.find((v) => v.id === id);
      if (visual) return { page, visual };
    }
    return undefined;
  }
}

export function newId(prefix: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  for (let i = 1; ; i++) if (!set.has(`${prefix}${i}`)) return `${prefix}${i}`;
}

export function emptyReport(): Report {
  return {
    smaltbi: 1,
    name: 'Untitled report',
    data: { steps: [] },
    model: { relationships: [], measures: [], columns: [], hierarchies: [] },
    theme: 'smalt',
    pages: [{ id: 'page1', name: 'Page 1', visuals: [] }],
  };
}

/** First free spot of size w×h on a 12-column page. */
export function freeSpot(page: Page, w: number, h: number, cols = 12): { x: number; y: number } {
  const taken = (x: number, y: number) => page.visuals.some((v) => x < v.layout.x + v.layout.w && x + w > v.layout.x && y < v.layout.y + v.layout.h && y + h > v.layout.y);
  for (let y = 0; y < 200; y++) for (let x = 0; x + w <= cols; x++) if (!taken(x, y)) return { x, y };
  return { x: 0, y: Math.max(0, ...page.visuals.map((v) => v.layout.y + v.layout.h)) };
}
