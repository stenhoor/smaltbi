// SQL text helpers. smaltdb follows SQLite quoting rules.
import type { SqlValue } from './types.js';

export function quoteIdent(name: string): string {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

export function quoteLiteral(v: SqlValue | boolean | undefined): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Uint8Array) return "X'" + Array.from(v, (b) => b.toString(16).padStart(2, '0')).join('') + "'";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

/** Split "table.column" at the first dot. */
export function splitRef(ref: string): [string, string] {
  const i = ref.indexOf('.');
  if (i < 0) return ['', ref];
  return [ref.slice(0, i), ref.slice(i + 1)];
}

/** FNV-1a hash, base 36: cache keys and stable ids. */
export function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
