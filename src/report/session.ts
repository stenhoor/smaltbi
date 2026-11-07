// A report session: the open database, the resolved model, the theme and the query runner.
// Shared by the designer and the viewer.
import type { Report, Theme } from '../core/types.js';
import { Model, type SchemaInfo } from '../core/model.js';
import { hash } from '../core/sql.js';
import { loadTheme } from '../theme/theme.js';
import { type Database, type Engine, loadEngine } from './engine.js';
import { applySteps, type FileStore } from 'smaltkit/manifest';

export type Log = (level: 'ok' | 'warn' | 'info', text: string) => void;
import { introspect } from '../data/introspect.js';
import { QueryRunner } from '../data/runner.js';

export interface SessionOptions {
  engine?: Engine;
  log?: Log;
  files?: FileStore;
}

export class ReportSession {
  schema!: SchemaInfo;
  model!: Model;
  theme!: Theme;
  runner!: QueryRunner;
  /** Row counts by table (model view). They change only when the data reloads, not with the model. */
  private rowCounts = new Map<string, Promise<number | null>>();
  /** Settled row counts, for showing a count without waiting (null: the source can't be read). */
  readonly knownRowCounts = new Map<string, number | null>();

  private constructor(
    public report: Report,
    /** URL the report's relative paths resolve against. */
    public base: string,
    public engine: Engine,
    public db: Database,
    private opts: SessionOptions,
  ) {}

  static async open(report: Report, base: string, opts: SessionOptions = {}): Promise<ReportSession> {
    const engine = opts.engine ?? (await loadEngine());
    const db = await openDatabase(engine, report, base, opts);
    const s = new ReportSession(report, base, engine, db, opts);
    s.runner = new QueryRunner(db);
    await s.refreshSchema();
    s.theme = await loadTheme(report.theme, base);
    return s;
  }

  /** Re-read the schema and rebuild the model (after data or model changes). */
  async refreshSchema(): Promise<void> {
    this.schema = await introspect(this.db);
    this.rebuildModel();
  }

  rebuildModel(): void {
    this.model = new Model(this.schema, this.report.model);
    this.runner.invalidate();
  }

  async setTheme(theme: Theme | string | undefined): Promise<void> {
    this.report.theme = theme;
    this.theme = await loadTheme(theme, this.base);
  }

  /** Rebuild the database from the report's data steps (after the data section changed). */
  async reloadData(): Promise<void> {
    await this.db.close().catch(() => {});
    this.db = await openDatabase(this.engine, this.report, this.base, { ...this.opts, force: true });
    this.rowCounts.clear();
    this.knownRowCounts.clear();
    this.runner = new QueryRunner(this.db);
    await this.refreshSchema();
  }

  /** A table's row count, counted once per data load (null when the source can't be read). */
  rowCount(table: string): Promise<number | null> {
    let p = this.rowCounts.get(table);
    if (!p) {
      p = this.db
        .query(`SELECT count(*) AS n FROM "${table.replace(/"/g, '""')}"`)
        .then((rows) => Number((rows as { n: number }[])[0]?.n ?? 0))
        .catch(() => null)
        .then((n) => (this.knownRowCounts.set(table, n), n));
      this.rowCounts.set(table, p);
    }
    return p;
  }

  /** Run extra SQL against the report database (designer: add a step and apply it). */
  async exec(sql: string): Promise<void> {
    await this.db.exec(sql);
    this.runner.invalidate();
  }
}

export function databaseName(report: Report): string {
  return report.data.database?.name ?? `smaltbi-${hash(report.name + JSON.stringify(report.data.steps ?? []))}`;
}

async function openDatabase(engine: Engine, report: Report, base: string, opts: SessionOptions & { force?: boolean }): Promise<Database> {
  const storage = report.data.database?.storage ?? 'memory';
  const name = databaseName(report);
  const db = await engine.open(storage === 'memory' ? name : name, { storage });
  const init = report.data.init ?? (storage === 'memory' ? 'always' : 'once');
  if (init === 'none') return db;
  if (storage === 'opfs') {
    if (init === 'once' && !opts.force) {
      const t = (await db.query("SELECT count(*) AS n FROM information_schema.tables WHERE table_name NOT LIKE 'sqlite_%'")) as { n: number }[];
      if (t[0]?.n) return db;
    }
    // Rebuild: drop what the steps would create.
    const objs = (await db.query("SELECT table_name AS name, table_type AS type FROM information_schema.tables WHERE table_name NOT LIKE 'sqlite_%'")) as { name: string; type: string }[];
    for (const o of objs) {
      const kw = o.type === 'VIEW' ? 'VIEW' : o.type === 'MATERIALIZED VIEW' ? 'MATERIALIZED VIEW' : o.type === 'EXTERNAL' ? 'EXTERNAL TABLE' : 'TABLE';
      await db.exec(`DROP ${kw} IF EXISTS "${o.name.replace(/"/g, '""')}"`).catch(() => {});
    }
  }
  await applySteps<Database>(db, report.data.steps ?? [], { base, io: engine.client, log: opts.log, files: opts.files });
  return db;
}
