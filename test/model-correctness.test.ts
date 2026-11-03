// 0.2 part 1: unambiguous models and relevant values (ADR 0004, decisions 9 and 10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileQuery } from '../src/core/compile.js';
import { Model, ModelError } from '../src/core/model.js';
import { sampleSession } from './helpers.js';

const s = await sampleSession();
const base = s.report.model;
// A second path sales → customers: sales → stores → customers (contrived, but a real ambiguity).
const withExtra = (active?: boolean) => new Model(s.schema, { ...base, relationships: [...(base.relationships ?? []), { from: 'stores.id', to: 'customers.id', ...(active === false ? { active } : {}) }] });

test('a query over an ambiguous path is an error that names the tables and the fix', () => {
  const m = withExtra();
  assert.throws(
    () => compileQuery(m, { dims: [m.resolve('customers.country')], measures: [m.resolve('sales.Revenue')] }),
    (e: unknown) => e instanceof ModelError && /more than one/.test((e as Error).message) && /sales/.test((e as Error).message) && /customers/.test((e as Error).message) && /inactive/.test((e as Error).message),
  );
});

test('marking the extra relationship inactive resolves the ambiguity', async () => {
  const m = withExtra(false);
  const q = compileQuery(m, { dims: [m.resolve('customers.country')], measures: [m.resolve('sales.Revenue')] });
  assert.match(q.sql, /LEFT JOIN "customers" ON "sales"\."customer_id" = "customers"\."id"/);
  await s.runner.run(q.sql);
});

test('queries that do not cross the ambiguous part still work', async () => {
  const m = withExtra();
  const q = compileQuery(m, { dims: [m.resolve('products.category')], measures: [m.resolve('sales.Revenue')] });
  await s.runner.run(q.sql);
});

test('relevant values: a dimension-only query is filtered by another dimension through the fact table', async () => {
  const m = s.model;
  // Stores that sold to customers in Japan: the two Japanese stores and the online shop.
  const q = compileQuery(m, { dims: [m.resolve('stores.name')], measures: [], filters: [{ field: 'customers.country', op: 'eq', values: ['Japan'] }] });
  assert.equal(q.ignored.length, 0, 'the customers filter applies');
  assert.equal(q.root, 'sales');
  const f = await s.runner.run(q.sql);
  const names = Array.from(f.data.d0 as ArrayLike<string>).sort();
  assert.deepEqual(names, ['Online Shop', ...names.filter((n) => n !== 'Online Shop')].sort());
  assert.equal(f.length, 3, `got ${names.join(', ')}`);
});

test('relevant values: without filters on other tables, a dimension lists all its values', async () => {
  const m = s.model;
  const q = compileQuery(m, { dims: [m.resolve('stores.name')], measures: [] });
  assert.equal(q.root, 'stores');
  assert.equal((await s.runner.run(q.sql)).length, 17);
});

test('relevant values: a filter that no table connects stays ignored instead of failing', () => {
  const m = new Model(s.schema, { ...base, relationships: [] });
  const q = compileQuery(m, { dims: [m.resolve('stores.name')], measures: [], filters: [{ field: 'customers.country', op: 'eq', values: ['Japan'] }] });
  assert.equal(q.root, 'stores');
  assert.equal(q.ignored.length, 1);
});
