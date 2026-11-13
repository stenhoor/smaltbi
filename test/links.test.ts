// Link tables (ADR 0009, shape A): products ↔ labels through product_labels (the sample's own tags work the same way),
// on the real engine with the sample data. Grouping goes through the link's distinct pairs, filters are semi-joins;
// each result is checked against direct SQL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileQuery } from '../src/core/compile.js';
import { Model } from '../src/core/model.js';
import { introspect } from '../src/data/introspect.js';
import type { Filter, ModelSpec } from '../src/core/types.js';
import { sampleSession } from './helpers.js';

const s = await sampleSession();
// Product 1 is Organic and Fair trade; products 1–6 have tags, the rest none; (2, Organic) is listed twice.
await s.db.exec(`
  CREATE TABLE labels (id INTEGER PRIMARY KEY, name TEXT);
  INSERT INTO labels VALUES (1, 'Organic'), (2, 'Fair trade'), (3, 'Gift');
  CREATE TABLE product_labels (product_id INTEGER, tag_id INTEGER);
  INSERT INTO product_labels VALUES (1, 1), (1, 2), (2, 1), (2, 1), (3, 2), (4, 3), (5, 3), (6, 1);
`);
const LINE = 'sales.quantity * sales.unit_price * (1 - sales.discount)';
const spec: ModelSpec = {
  ...s.report.model,
  relationships: [...(s.report.model.relationships ?? []), { from: 'product_labels.product_id', to: 'products.id' }, { from: 'product_labels.tag_id', to: 'labels.id' }],
};
const model = new Model(await introspect(s.db), spec);

async function rows(dims: string[], measures: string[], filters: Filter[] = []) {
  const q = compileQuery(model, { dims: dims.map((d) => model.resolve(d)), measures: measures.map((m) => model.resolve(m, 'measure')), filters });
  const f = await s.runner.run(q.sql);
  return { q, rows: Array.from({ length: f.length }, (_, r) => Object.fromEntries(Object.entries(f.data).map(([k, v]) => [k, (v as ArrayLike<unknown>)[r]]))) };
}
const one = async (sql: string) => Number(((await s.db.query(sql)) as { v: number }[])[0]?.v ?? 0);
const revenueOf = (products: string) => one(`SELECT SUM(${LINE}) AS v FROM sales WHERE product_id IN (${products})`);
const close = (a: unknown, b: number, what: string) => assert.ok(Math.abs(Number(a) - b) < 0.01, `${what}: ${a} vs ${b}`);

test('a table of keys is a link; a fact table is not, even without measures', () => {
  assert.deepEqual([...model.links].sort(), ['product_labels', 'product_tags']);
  const bare = new Model(s.schema, { relationships: s.report.model.relationships });
  assert.equal(bare.links.has('sales'), false, 'sales has quantities: a fact, measures or not');
});

test('revenue by tag: each sale once in each of its tags; untagged sales are blank; the groups overlap', async () => {
  const { q, rows: r } = await rows(['labels.name'], ['sales.Revenue']);
  const by = Object.fromEntries(r.map((x) => [String(x.d0), Number(x.m0)]));
  close(by.Organic, await revenueOf('1, 2, 6'), 'Organic (the duplicate pair counts once)');
  close(by['Fair trade'], await revenueOf('1, 3'), 'Fair trade');
  close(by.Gift, await revenueOf('4, 5'), 'Gift');
  close(by.null, await one(`SELECT SUM(${LINE}) AS v FROM sales WHERE product_id > 6`), 'untagged');
  assert.deepEqual(q.overlap, ['d0']);
  assert.match(q.sql, /SELECT DISTINCT "product_id", "tag_id" FROM "product_labels"/);
  // The total, without the tag, is every sale once.
  const { rows: t } = await rows([], ['sales.Revenue']);
  close(t[0]!.m0, await one(`SELECT SUM(${LINE}) AS v FROM sales`), 'total');
});

test('a filter beyond the link is a semi-join: no sale counted twice, whatever the visual groups by', async () => {
  // Organic or Fair trade: product 1 has both, and counts once.
  const f: Filter = { field: 'labels.name', op: 'in', values: ['Organic', 'Fair trade'] };
  const { q, rows: r } = await rows(['products.category'], ['sales.Revenue'], [f]);
  assert.match(q.sql, /"products"\."id" IN \(SELECT /);
  const total = r.reduce((a, x) => a + Number(x.m0), 0);
  close(total, await revenueOf('1, 2, 3, 6'), 'Organic or Fair trade, by category');
  assert.equal(q.overlap, undefined, 'grouped by category: no overlap');
  // A cross-filter selection mixing a tag and a store region (a tuple).
  const t: Filter = { op: 'tuples', fields: ['labels.name', 'stores.region'], tuples: [['Gift', 'Europe']] };
  const { rows: g } = await rows([], ['sales.Revenue'], [t]);
  close(g[0]!.m0, await one(`SELECT SUM(${LINE}) AS v FROM sales JOIN stores ON stores.id = sales.store_id WHERE product_id IN (4, 5) AND stores.region = 'Europe'`), 'Gift in Europe');
});

test('relevant values: a tag slicer under a selection of products lists those products’ tags', async () => {
  const { rows: r } = await rows(['labels.name'], [], [{ field: 'products.id', op: 'in', values: [4, 5] }]);
  assert.deepEqual(r.map((x) => x.d0), ['Gift']);
});

test('two links between the same tables are ambiguous', async () => {
  await s.db.exec(`CREATE TABLE product_labels2 (product_id INTEGER, tag_id INTEGER); INSERT INTO product_labels2 VALUES (1, 3);`);
  const twice = new Model(await introspect(s.db), { ...spec, relationships: [...spec.relationships!, { from: 'product_labels2.product_id', to: 'products.id' }, { from: 'product_labels2.tag_id', to: 'labels.id' }] });
  assert.throws(() => compileQuery(twice, { dims: [twice.resolve('labels.name')], measures: [twice.resolve('sales.Revenue', 'measure')] }), /more than one relationship path/);
});

test('time-intelligence measures by year, filtered by a tag', async () => {
  const withCal = new Model(model.spec.dateTable ? await introspect(s.db) : s.schema, {
    ...spec,
    measures: [...(spec.measures ?? []), { table: 'sales', name: 'Revenue LY test', sql: '', time: { of: 'Revenue', calc: 'py' } }],
  });
  const q = compileQuery(withCal, { dims: [withCal.resolve('calendar.year')], measures: [withCal.resolve('sales.Revenue', 'measure'), withCal.resolve('sales.Revenue LY test', 'measure')], filters: [{ field: 'labels.name', op: 'in', values: ['Gift'] }] });
  const f = await s.runner.run(q.sql);
  const years = Array.from(f.data.d0 as ArrayLike<unknown>).map(String);
  const i = years.indexOf('2025');
  const j = years.indexOf('2024');
  close((f.data.m0 as ArrayLike<number>)[i], await one(`SELECT SUM(${LINE}) AS v FROM sales WHERE product_id IN (4, 5) AND order_date LIKE '2025%'`), 'Gift 2025');
  close((f.data.m1 as ArrayLike<number>)[i], (f.data.m0 as ArrayLike<number>)[j]!, 'Gift last year');
});

test('filtered to a tag and grouped by tag: the other tags are left out', async () => {
  const { q, rows: r } = await rows(['labels.name'], ['sales.Revenue'], [{ field: 'labels.name', op: 'in', values: ['Gift'] }]);
  assert.deepEqual(r.map((x) => x.d0), ['Gift'], 'only the selected tag');
  close(r[0]!.m0, await revenueOf('4, 5'), 'Gift');
  assert.doesNotMatch(q.sql, /\bIN \(SELECT/, 'a plain condition on the joined tag');
});
