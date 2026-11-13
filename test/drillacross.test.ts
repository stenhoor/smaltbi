// Several facts in one visual (ADR 0009, shape B: drill-across), on the real engine with the sample data and a small
// quota table (a budget by category). Each result is checked against direct SQL over each fact on its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileQuery } from '../src/core/compile.js';
import { Model, ModelError } from '../src/core/model.js';
import { introspect } from '../src/data/introspect.js';
import type { Filter, ModelSpec } from '../src/core/types.js';
import { sampleSession } from './helpers.js';

const s = await sampleSession();
// A quota by category (one category has a target and no sales), and a table of categories both facts relate to.
await s.db.exec(`
  CREATE TABLE quota (category TEXT, target REAL);
  INSERT INTO quota VALUES ('Coffee', 400000), ('Coffee', 50000), ('Tea', 300000), ('Equipment', 250000), ('Gift cards', 20000);
  CREATE TABLE cats (category TEXT PRIMARY KEY);
  INSERT INTO cats SELECT DISTINCT category FROM products;
  INSERT INTO cats VALUES ('Gift cards');
`);
const LINE = 'sales.quantity * sales.unit_price * (1 - sales.discount)';
const spec: ModelSpec = {
  ...s.report.model,
  relationships: [...(s.report.model.relationships ?? []), { from: 'products.category', to: 'cats.category' }, { from: 'quota.category', to: 'cats.category' }],
  measures: [
    ...(s.report.model.measures ?? []),
    { table: 'quota', name: 'Quota', sql: 'SUM(quota.target)' },
    { table: 'sales', name: 'vs Quota', sql: '[Revenue] / NULLIF([Quota], 0)' },
    { table: 'sales', name: 'Mixed', sql: 'SUM(sales.quantity) / SUM(quota.target)' },
  ],
};
const model = new Model(await introspect(s.db), spec);

async function rows(dims: string[], measures: string[], filters: Filter[] = [], extra: { sort?: { key: string; dir: 'asc' | 'desc' }[]; limit?: number } = {}) {
  const q = compileQuery(model, { dims: dims.map((d) => model.resolve(d)), measures: measures.map((m) => model.resolve(m, 'measure')), filters, ...extra });
  const f = await s.runner.run(q.sql);
  return { q, rows: Array.from({ length: f.length }, (_, r) => Object.fromEntries(Object.entries(f.data).map(([k, v]) => [k, (v as ArrayLike<unknown>)[r]]))) };
}
async function direct(sql: string): Promise<Map<unknown, number>> {
  const r = (await s.db.query(sql)) as { k: unknown; v: number }[];
  return new Map(r.map((x) => [x.k, Number(x.v)]));
}
const close = (a: unknown, b: number | undefined, what: string) => assert.ok(b !== undefined && Math.abs(Number(a) - b) < 0.01, `${what}: ${a} vs ${b}`);

test('revenue and target by a category both facts share: each fact on its own, lined up', async () => {
  const { q, rows: r } = await rows(['cats.category'], ['sales.Revenue', 'quota.Quota']);
  assert.match(q.sql, /^WITH f0 AS \(/);
  const rev = await direct(`SELECT products.category AS k, SUM(${LINE}) AS v FROM sales JOIN products ON products.id = sales.product_id GROUP BY 1`);
  const tgt = await direct(`SELECT category AS k, SUM(target) AS v FROM quota GROUP BY 1`);
  for (const x of r) {
    if (rev.has(x.d0)) close(x.m0, rev.get(x.d0), `revenue ${x.d0}`);
    else assert.equal(x.m0, null, `${x.d0} has no sales`);
    if (tgt.has(x.d0)) close(x.m1, tgt.get(x.d0), `target ${x.d0}`);
    else assert.equal(x.m1, null, `${x.d0} has no target`);
  }
  assert.deepEqual(r.map((x) => x.d0).sort(), ['Accessories', 'Coffee', 'Equipment', 'Gift cards', 'Tea'], 'categories of either fact');
  // Coffee's two quota rows are summed once: no fan-out from the sales side.
  close(r.find((x) => x.d0 === 'Coffee')!.m1, 450000, 'Coffee target');
});

test('a measure combining the facts is computed after the line-up', async () => {
  const { rows: r } = await rows(['cats.category'], ['sales.vs Quota']);
  const rev = await direct(`SELECT products.category AS k, SUM(${LINE}) AS v FROM sales JOIN products ON products.id = sales.product_id GROUP BY 1`);
  const tea = r.find((x) => x.d0 === 'Tea')!;
  close(tea.m0, rev.get('Tea')! / 300000, 'Tea vs target');
  assert.equal(r.find((x) => x.d0 === 'Accessories')!.m0, null, 'no target: no ratio');
  // Totals (no dimensions): one row of each.
  const { rows: t } = await rows([], ['sales.Revenue', 'quota.Quota', 'sales.vs Quota']);
  const all = (await direct(`SELECT 1 AS k, SUM(${LINE}) AS v FROM sales`)).get(1)!;
  close(t[0]!.m0, all, 'total revenue');
  close(t[0]!.m1, 1020000, 'total target');
  close(t[0]!.m2, all / 1020000, 'total ratio');
});

test('filters go to each fact they reach; measure filters test the lined-up value', async () => {
  // A category filter reaches both facts.
  const { rows: a } = await rows(['cats.category'], ['sales.Revenue', 'quota.Quota'], [{ field: 'cats.category', op: 'in', values: ['Tea', 'Coffee'] }]);
  assert.deepEqual(a.map((x) => x.d0).sort(), ['Coffee', 'Tea']);
  // A subcategory filter reaches sales only: revenue narrows, the target stays (and is listed as not applied there).
  const { q, rows: b } = await rows(['cats.category'], ['sales.Revenue', 'quota.Quota'], [{ field: 'products.subcategory', op: 'in', values: ['Green'] }]);
  const tea = b.find((x) => x.d0 === 'Tea')!;
  const green = (await direct(`SELECT 1 AS k, SUM(${LINE}) AS v FROM sales JOIN products ON products.id = sales.product_id WHERE products.subcategory = 'Green'`)).get(1)!;
  close(tea.m0, green, 'green tea revenue');
  close(tea.m1, 300000, 'tea target unchanged');
  assert.equal(q.ignored.length, 1);
  // Revenue above 200,000: tested on the lined-up revenue.
  const { rows: c } = await rows(['cats.category'], ['sales.Revenue', 'quota.Quota'], [{ field: 'sales.Revenue', op: 'gt', values: [200000] }]);
  assert.ok(c.length >= 1 && c.every((x) => Number(x.m0) > 200000), JSON.stringify(c));
});

test('sorting and a limit apply to the lined-up rows', async () => {
  const { rows: r } = await rows(['cats.category'], ['sales.Revenue', 'quota.Quota'], [], { sort: [{ key: 'm1', dir: 'desc' }], limit: 2 });
  assert.deepEqual(r.map((x) => x.d0), ['Coffee', 'Tea']);
});

test('a field only one fact relates to is refused, naming it (decision 2)', () => {
  assert.throws(
    () => compileQuery(model, { dims: [model.resolve('products.name')], measures: [model.resolve('sales.Revenue', 'measure'), model.resolve('quota.Quota', 'measure')] }),
    (e: unknown) => e instanceof ModelError && /^Quota has no relationship to name: use a field both share/.test((e as Error).message),
  );
  // Facts mixed inside one aggregate can't be split.
  assert.throws(() => compileQuery(model, { dims: [model.resolve('cats.category')], measures: [model.resolve('sales.Mixed', 'measure')] }), /mixes tables that are computed separately/);
});

test('one fact still compiles to the ordinary query', () => {
  const q = compileQuery(model, { dims: [model.resolve('cats.category')], measures: [model.resolve('sales.Revenue', 'measure')] });
  assert.doesNotMatch(q.sql, /^WITH/);
});
