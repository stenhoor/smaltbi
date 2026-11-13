// Relationships to a column that isn't unique (ADR 0009, step 1): the data check, and the model refusing queries with
// measures that would count rows more than once. On the real engine with the sample data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileQuery } from '../src/core/compile.js';
import { Model, ModelError } from '../src/core/model.js';
import { repeatsValues } from '../src/data/keys.js';
import type { ModelSpec } from '../src/core/types.js';
import { sampleSession } from './helpers.js';

const s = await sampleSession();
// customers.country repeats (600 customers in 7 countries); stores.id is a key.
const spec: ModelSpec = {
  relationships: [{ from: 'stores.country', to: 'customers.country' }],
  measures: [{ table: 'stores', name: 'Stores', sql: 'COUNT(*)' }],
};

test('the data check finds a target column with repeated values', async () => {
  assert.equal(await repeatsValues(s.db, s.schema, 'customers.country'), true);
  assert.equal(await repeatsValues(s.db, s.schema, 'customers.id'), false);
  assert.equal(await repeatsValues(s.db, s.schema, 'stores.id'), false);
  assert.equal(await repeatsValues(s.db, s.schema, 'nowhere.id'), false, 'a missing table is left to the query');
});

test('without the check the numbers are inflated: that is the bug', async () => {
  const m = new Model(s.schema, spec);
  const q = compileQuery(m, { dims: [m.resolve('customers.region')], measures: [m.resolve('stores.Stores', 'measure')] });
  const f = await s.runner.run(q.sql);
  const total = Array.from(f.data.m0 as ArrayLike<number>).reduce((a, b) => a + b, 0);
  assert.ok(total > 17 * 10, `17 stores counted ${total} times`);
});

test('a query with measures through it is refused, with what to do', () => {
  const m = new Model(s.schema, spec, new Set(['customers.country']));
  assert.throws(
    () => compileQuery(m, { dims: [m.resolve('customers.region')], measures: [m.resolve('stores.Stores', 'measure')] }),
    (e: unknown) => e instanceof ModelError && /customers\.country is not unique: the relationship stores\.country → customers\.country would count stores rows more than once/.test((e as Error).message),
  );
  assert.ok(m.validate().some((x) => /customers\.country is not unique/.test(x)), 'the model lists it');
  assert.equal(m.edges.find((e) => e.to.table === 'customers')?.notUnique, true);
});

test('what the relationship does not touch still works, and a list of values may use it', async () => {
  const m = new Model(s.schema, spec, new Set(['customers.country']));
  // Stores by their own columns: no join through the relationship.
  const own = compileQuery(m, { dims: [m.resolve('stores.region')], measures: [m.resolve('stores.Stores', 'measure')] });
  const f = await s.runner.run(own.sql);
  assert.equal(Array.from(f.data.m0 as ArrayLike<number>).reduce((a, b) => a + b, 0), 17);
  // A slicer's values (no measures) only lists distinct values: repeated rows can't inflate anything.
  const values = compileQuery(m, { dims: [m.resolve('customers.region')], measures: [], filters: [{ field: 'stores.channel', op: 'in', values: ['Store'] }] });
  assert.ok((await s.runner.run(values.sql)).length >= 3);
});

test('a role through a non-unique column is refused too', () => {
  const m = new Model(s.schema, { ...spec, relationships: [{ from: 'stores.country', to: 'customers.country', role: 'Local customers' }] }, new Set(['customers.country']));
  assert.throws(() => compileQuery(m, { dims: [m.resolve('Local customers.segment')], measures: [m.resolve('stores.Stores', 'measure')] }), /customers\.country is not unique/);
});
