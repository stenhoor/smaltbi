// Conditional formatting (ADR 0004 roadmap, 0.2): a visual's rules decide how each measure value looks: a tone (good,
// bad, warning, accent) as text or background, and an icon. smaltkit draws it (ChartContext.cellFormat); the rules
// and their data live here.
import type { CellFormat } from 'smaltkit/charts';
import type { ConditionalRule, SqlValue, Visual } from '../core/types.js';
import type { DataColumn, VisualData } from '../visuals/api.js';

/** The role of the extra measures a rule tests or compares with, when the visual doesn't show them. */
export const CONDITIONAL_ROLE = 'conditional';

/** Field references a visual's rules read besides the values they format (to fetch with its data). */
export function conditionalFields(v: Visual): string[] {
  const out = new Set<string>();
  for (const r of v.conditional ?? []) {
    if (r.test) out.add(r.test);
    if (r.compare) out.add(r.compare);
  }
  return [...out];
}

const num = (x: SqlValue | undefined): number => (typeof x === 'number' ? x : typeof x === 'bigint' ? Number(x) : x === null || x === undefined || x === '' ? NaN : Number(x));

/** Whether a rule's test holds for a value (and the compared value, when the rule compares with a measure). */
export function ruleMatches(r: ConditionalRule, x: SqlValue | undefined, other?: SqlValue): boolean {
  if (r.op === 'blank') return x === null || x === undefined || x === '';
  const a = num(x);
  if (!Number.isFinite(a)) return false;
  if (r.op === 'positive') return a > 0;
  if (r.op === 'negative') return a < 0;
  const b = r.compare !== undefined ? num(other) : num(r.value);
  if (!Number.isFinite(b)) return false;
  switch (r.op) {
    case 'gt':
      return a > b;
    case 'gte':
      return a >= b;
    case 'lt':
      return a < b;
    case 'lte':
      return a <= b;
    case 'eq':
      return a === b;
    case 'ne':
      return a !== b;
    case 'between': {
      const c = num(r.value2);
      return Number.isFinite(c) && a >= Math.min(b, c) && a <= Math.max(b, c);
    }
  }
  return false;
}

const refOf = (c: DataColumn) => c.field.ref;

/** The cellFormat hook for a visual's data: the first rule that applies to the column and matches the row wins. */
export function cellFormatFor(v: Visual, data: VisualData): ((column: DataColumn, row: number) => CellFormat | null) | undefined {
  const rules = v.conditional ?? [];
  if (!rules.length) return undefined;
  const byRef = (ref: string) => data.columns.find((c) => refOf(c) === ref && c.kind === 'measure');
  return (column, row) => {
    for (const r of rules) {
      if (r.apply !== '*' && r.apply !== refOf(column)) continue;
      const tested = r.test ? byRef(r.test) : column;
      if (!tested) continue;
      const other = r.compare ? byRef(r.compare)?.values[row] : undefined;
      if (r.compare && other === undefined) continue;
      if (ruleMatches(r, tested.values[row], other)) return { tone: r.tone, fill: r.fill, icon: r.icon };
    }
    return null;
  };
}
