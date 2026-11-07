// Runs compiled queries with a result cache. Results are columnar (smaltdb's wire format), which
// is what charts want: one array per column.
import type { SqlValue } from '../core/types.js';
import type { Database } from '../report/engine.js';

export interface Frame {
  columns: string[];
  length: number;
  data: Record<string, ArrayLike<SqlValue>>;
  ms: number;
}

export class QueryRunner {
  private cache = new Map<string, Promise<Frame>>();
  private limit = 256;
  /** Statistics for the performance panel. */
  stats = { queries: 0, hits: 0, ms: 0 };

  constructor(public db: Database) {}

  run(sql: string): Promise<Frame> {
    const hit = this.cache.get(sql);
    if (hit) {
      this.stats.hits++;
      // refresh LRU position
      this.cache.delete(sql);
      this.cache.set(sql, hit);
      return hit;
    }
    const p = this.exec(sql);
    this.cache.set(sql, p);
    p.catch(() => this.cache.delete(sql));
    while (this.cache.size > this.limit) this.cache.delete(this.cache.keys().next().value!);
    return p;
  }

  private async exec(sql: string): Promise<Frame> {
    const t0 = performance.now();
    const r = (await this.db.query(sql, undefined, { rowMode: 'columnar' })) as unknown as { columns: string[]; length: number; data: Record<string, ArrayLike<SqlValue>> };
    const ms = performance.now() - t0;
    this.stats.queries++;
    this.stats.ms += ms;
    return { columns: r.columns, length: r.length, data: r.data, ms };
  }

  /** Column names of a query, without reading its rows. */
  async columnsOf(sql: string): Promise<string[]> {
    const body = sql.trim().replace(/;\s*$/, '');
    const r = await this.run(`SELECT * FROM (\n${body}\n) LIMIT 0`);
    return r.columns;
  }

  invalidate(): void {
    this.cache.clear();
  }
}
