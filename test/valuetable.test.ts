// "Make a table" (ADR 0009, decision 3a), on the real engine: a budget by category related to products.category (not
// unique) is refused; the made table fixes it, and Revenue beside Target by category is right.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileQuery } from '../src/core/compile.js';
import { Model } from '../src/core/model.js';
import { applyValueTable, planValueTable } from '../src/core/valuetable.js';
import { introspect } from '../src/data/introspect.js';
import { repeatsValues } from '../src/data/keys.js';
import type { Report } from '../src/core/types.js';
import { sampleSession } from './helpers.js';

const s = await sampleSession();
await s.db.exec(`CREATE TABLE goals (category TEXT, goal REAL); INSERT INTO goals VALUES ('Coffee', 450000), ('Tea', 300000), ('Gift cards', 20000);`);
const report: Report = structuredClone(s.report);
report.model.relationships = [...(report.model.relationships ?? []), { from: 'goals.category', to: 'products.category' }];
report.model.measures = [...(report.model.measures ?? []), { table: 'goals', name: 'Goal', sql: 'SUM(goals.goal)' }];
const index = report.model.relationships.length - 1;
const LINE = 'sales.quantity * sales.unit_price * (1 - sales.discount)';

test('the plan: a table of the values from both sides, the flagged relationship pointed at it', async () => {
  const schema = await introspect(s.db);
  const plan = planValueTable(report, index, schema);
  // The sample has a category table of its own: the name gets a suffix.
  assert.equal(plan.table, 'category_values');
  assert.match(plan.step.sql, /CREATE TABLE "category_values" \("category" TEXT PRIMARY KEY\);/);
  assert.match(plan.step.sql, /SELECT CAST\("category" AS TEXT\) FROM "products" WHERE "category" IS NOT NULL\nUNION SELECT CAST\("category" AS TEXT\) FROM "goals"/);
  assert.deepEqual(plan.relationships.slice(-2), [
    { from: 'goals.category', to: 'category_values.category' },
    { from: 'products.category', to: 'category_values.category' },
  ]);
  // Taken twice: a number too.
  const taken = { ...schema, tables: [...schema.tables, { name: 'category_values', kind: 'BASE TABLE', columns: [] }] };
  assert.equal(planValueTable(report, index, taken).table, 'category_values_2');
});

test('made: Revenue and Goal by category line up, the goal counted once, a category with no sales kept', async () => {
  const before = new Model(await introspect(s.db), report.model, new Set((await repeatsValues(s.db, s.schema, 'products.category')) ? ['products.category'] : []));
  assert.throws(() => compileQuery(before, { dims: [before.resolve('products.category')], measures: [before.resolve('goals.Goal', 'measure')] }), /not unique/);
  const fixed: Report = structuredClone(report);
  const plan = applyValueTable(fixed, index, await introspect(s.db));
  await s.db.exec(plan.step.sql);
  const model = new Model(await introspect(s.db), fixed.model, new Set());
  assert.equal(await repeatsValues(s.db, await introspect(s.db), 'category_values.category'), false, 'the made column is unique');
  const q = compileQuery(model, { dims: [model.resolve('category_values.category')], measures: [model.resolve('sales.Revenue', 'measure'), model.resolve('goals.Goal', 'measure')] });
  const f = await s.runner.run(q.sql);
  const rows = Array.from({ length: f.length }, (_, i) => [(f.data.d0 as ArrayLike<unknown>)[i], (f.data.m0 as ArrayLike<number>)[i], (f.data.m1 as ArrayLike<number>)[i]] as const);
  const tea = rows.find((r) => r[0] === 'Tea')!;
  const teaRevenue = Number(((await s.db.query(`SELECT SUM(${LINE}) AS v FROM sales JOIN products ON products.id = sales.product_id WHERE products.category = 'Tea'`)) as { v: number }[])[0]!.v);
  assert.ok(Math.abs(Number(tea[1]) - teaRevenue) < 0.01, 'tea revenue');
  assert.equal(tea[2], 300000, 'tea goal once');
  assert.deepEqual(rows.find((r) => r[0] === 'Gift cards')?.slice(1), [null, 20000], 'a goal with no sales');
  assert.equal(rows.find((r) => r[0] === 'Accessories')?.[2], null, 'sales with no goal');
});

test('a year that is text on one side and a number on the other is one value', async () => {
  await s.db.exec(`CREATE TABLE plan (year INTEGER, amount REAL); INSERT INTO plan VALUES (2024, 1), (2025, 2);`);
  const r: Report = structuredClone(s.report);
  r.model.relationships = [...(r.model.relationships ?? []), { from: 'plan.year', to: 'calendar.year' }];
  const i = r.model.relationships.length - 1;
  const p = planValueTable(r, i, await introspect(s.db));
  assert.equal(p.table, 'year_values');
  await s.db.exec(p.step.sql);
  const n = Number(((await s.db.query(`SELECT COUNT(*) AS n FROM year_values`)) as { n: number }[])[0]!.n);
  const years = Number(((await s.db.query(`SELECT COUNT(DISTINCT year) AS n FROM calendar`)) as { n: number }[])[0]!.n);
  assert.equal(n, years, 'one row per year, 2024 and 2025 not doubled');
});
