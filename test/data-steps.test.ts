// Data steps (smaltkit/manifest) on the engine the browser runs: smaltdb 0.9 with SQL from smaltql and the io, external and Parquet
// plugins (src/engine/worker.ts registers the same set). Parquet fixtures: smaltdb-parquet's, written by pyarrow
// (4,000 rows: id, region, amount, day, note).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applySteps, type ManifestStep } from 'smaltkit/manifest';
import { clientDb, nodeIo, root } from './helpers.js';

const fixture = (name: string) => new Blob([readFileSync(join(root, 'test/fixtures', name))]);
const files = { get: async (name: string) => fixture(name) };

test('Parquet import copies a file into a table (Snappy and gzip)', async () => {
  const db = clientDb();
  await applySteps(db, [{ import: 'local:sales-snappy.parquet', table: 'a' }, { import: 'local:sales-gzip.parquet', table: 'b' }], { base: 'http://x/', io: nodeIo, files });
  for (const t of ['a', 'b']) {
    const [r] = (await db.query(`SELECT count(*) AS n, count(DISTINCT region) AS regions, sum(id) AS ids FROM ${t}`)) as { n: number; regions: number; ids: number }[];
    assert.deepEqual({ ...r }, { n: 4000, regions: 3, ids: (3999 * 4000) / 2 }, t);
  }
  // The temporary external table is gone.
  const tables = (await db.query("SELECT table_name AS name FROM information_schema.tables WHERE table_name LIKE '__import_%'")) as unknown[];
  assert.equal(tables.length, 0);
});

test('Parquet link reads the file in place, with filters', async () => {
  const db = clientDb();
  await applySteps(db, [{ link: 'local:sales-snappy.parquet', table: 'sales', format: 'parquet' }], { base: 'http://x/', io: nodeIo, files });
  const [r] = (await db.query("SELECT count(*) AS n FROM sales WHERE region = 'eu'")) as { n: number }[];
  assert.equal(r!.n, 2000);
});

test('CSV, JSON, inline rows and SQL steps', async () => {
  const db = clientDb();
  const csv = { get: async (name: string) => new Blob([name.endsWith('.csv') ? 'id,name\n1,Tea\n2,Coffee\n' : '[{"id":3,"name":"Cocoa"}]']) };
  const steps: ManifestStep[] = [
    { import: 'local:p.csv', table: 'p' },
    { import: 'local:q.json', table: 'q' },
    { table: 'r', data: [{ id: 4, name: 'Mate' }] },
    { sql: 'CREATE VIEW everything AS SELECT id, name FROM p UNION ALL SELECT id, name FROM q UNION ALL SELECT id, name FROM r' },
  ];
  await applySteps(db, steps, { base: 'http://x/', io: nodeIo, files: csv });
  const rows = (await db.query('SELECT name FROM everything ORDER BY id')) as { name: string }[];
  assert.deepEqual(rows.map((r) => r.name), ['Tea', 'Coffee', 'Cocoa', 'Mate']);
});
