// The measure and calculated-column editor's language: smaltkit's SQL editor (highlighting from smaltql's dialect),
// completing from the report's model rather than the raw database, and checking `[Name]` references as you type.
import { completeSql, sqlLanguage, type CompletionItem, type EditorLanguage, type EditorSchema, type EditorWarning, type SchemaTable } from 'smaltkit/editor';
import type { Model } from '../core/model.js';

/** The model as the editor's schema: tables and their columns, calculated ones included. */
export function modelSchema(model: Model): EditorSchema {
  const tables = new Map<string, SchemaTable>();
  for (const t of model.tables.values()) {
    const cols = [...t.columns.values()].filter((c) => !c.calc).map((c) => ({ name: c.name, type: c.type, pk: c.pk })) as SchemaTable;
    cols.kind = t.kind === 'VIEW' ? 'view' : 'table';
    tables.set(t.name, cols);
  }
  return { names: new Set([...tables.keys()].map((k) => k.toLowerCase())), tables };
}

/** The names `[…]` can refer to from `home`: every measure, and the calculated columns (home's bare, others qualified). */
export function bracketNames(model: Model, home: string): CompletionItem[] {
  const out: CompletionItem[] = [];
  for (const t of model.tables.values()) {
    for (const m of t.measures.values()) out.push({ label: m.name, kind: 'measure', detail: m.time ? `${t.name} · quick` : t.name });
    for (const c of t.columns.values()) if (c.calc) out.push({ label: t.name === home ? c.name : `${t.name}.${c.name}`, kind: 'column', detail: `${t.name} · calculated` });
  }
  return out;
}

/** The open `[` before `pos` on the same reference (no `]` between), or -1. */
function openBracket(text: string, pos: number): number {
  for (let i = pos - 1; i >= 0; i--) {
    const c = text[i];
    if (c === ']' || c === '\n') return -1;
    if (c === '[') return i;
  }
  return -1;
}

/** SQL for the model: `table.` completes that table's columns (calculated ones too), `[` the measures and columns. */
export function measureLanguage(model: Model, home: string): EditorLanguage {
  return {
    ...sqlLanguage,
    name: 'SQL',
    statementAt: undefined, // one expression, not statements: no shading
    complete(text, pos, schema, explicit) {
      const open = openBracket(text, pos);
      if (open >= 0) {
        const typed = text.slice(open + 1, pos).toLowerCase();
        const items = bracketNames(model, home).filter((i) => i.label.toLowerCase().includes(typed) && (explicit || i.label.toLowerCase() !== typed));
        items.sort((a, b) => Number(!a.label.toLowerCase().startsWith(typed)) - Number(!b.label.toLowerCase().startsWith(typed)) || a.label.localeCompare(b.label));
        return { items: items.slice(0, 60), start: open + 1 };
      }
      const r = completeSql(text, pos, schema, explicit);
      // After `table.`, add that table's calculated columns (completeSql knows only the database's columns).
      const dot = /([A-Za-z_][\w]*)\.(\w*)$/.exec(text.slice(0, pos));
      const t = dot ? model.tables.get(dot[1]!) : undefined;
      if (t) {
        const w = dot![2]!.toLowerCase();
        for (const c of t.columns.values()) if (c.calc && c.name.toLowerCase().startsWith(w) && !/\W/.test(c.name)) r.items.push({ label: c.name, kind: 'col', detail: 'calculated column' });
      }
      return r;
    },
  };
}

/** Warnings for `[Name]` references that name no measure or calculated column (the SQL would fail on them). */
export function referenceWarnings(text: string, model: Model, home: string): EditorWarning[] {
  const known = new Set(bracketNames(model, home).map((i) => i.label.toLowerCase()));
  for (const t of model.tables.values()) for (const c of t.columns.values()) if (c.calc) known.add(`${t.name}.${c.name}`.toLowerCase());
  for (const t of model.tables.values()) for (const m of t.measures.values()) known.add(`${t.name}.${m.name}`.toLowerCase());
  const out: EditorWarning[] = [];
  for (const m of text.matchAll(/\[([^\[\]\n]+)\]/g)) {
    const name = m[1]!.trim();
    if (!known.has(name.toLowerCase())) out.push({ start: m.index!, end: m.index! + m[0].length, message: `No measure or calculated column named ${name}` });
  }
  return out;
}

/** Where an engine or model error points in the text: the name it quotes, if the text has it. */
export function errorRange(text: string, message: string): { start: number; end: number } | null {
  const candidates = [...message.matchAll(/(?:"([^"]+)"|: ([\w.]+)\s*$|near "([^"]+)")/g)].map((m) => m[1] ?? m[2] ?? m[3]).filter(Boolean) as string[];
  for (const c of candidates) {
    const i = text.toLowerCase().indexOf(c.toLowerCase());
    if (i >= 0) return { start: i, end: i + c.length };
  }
  return null;
}
