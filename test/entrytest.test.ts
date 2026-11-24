// The test the measure dialog and the agent's model actions run before saving a measure or calculated column
// (src/core/entrytest.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnTypeOf, entryTest } from '../src/core/entrytest.js';
import { sampleSession } from './helpers.js';

const session = await sampleSession();

test('a measure is tested over all the data, a calculated column on its first five values', async () => {
  const m = entryTest(session.schema, session.report.model, new Set(), 'measure', { table: 'sales', name: 'Twice', sql: '[Units] * 2' });
  assert.deepEqual([m.field.kind, m.query.columns.length], ['measure', 1]);
  const units = await session.runner.run(entryTest(session.schema, session.report.model, new Set(), 'measure', { table: 'sales', name: 'U', sql: 'SUM(sales.quantity)' }).query.sql);
  const twice = await session.runner.run(m.query.sql);
  assert.equal(twice.data[m.query.columns[0]!.key]![0], 2 * (units.data[units.columns[0]!]![0] as number));
  const c = entryTest(session.schema, session.report.model, new Set(), 'column', { table: 'sales', name: 'Big', sql: 'sales.quantity > 5' });
  assert.match(c.query.sql, /LIMIT 5/);
});

test('in place of the one being edited, and with the model\'s own errors', () => {
  const units = session.report.model.measures!.find((x) => x.name === 'Units')!;
  const t = entryTest(session.schema, session.report.model, new Set(), 'measure', { ...units, sql: 'SUM(sales.quantity) + 1' }, units);
  assert.equal(t.model.spec.measures!.filter((x) => x.name === 'Units').length, 1, 'the edited measure replaces the old one');
  assert.throws(() => entryTest(session.schema, session.report.model, new Set(), 'measure', { table: 'sales', name: 'Loop', sql: '[Loop] + 1' }));
});

test("a calculated column's type from its first values", () => {
  assert.equal(columnTypeOf([1, null, 3]), 'number');
  assert.equal(columnTypeOf([null, '2024-03', '2024-04']), 'date');
  assert.equal(columnTypeOf(['a', 'b']), 'text');
  assert.equal(columnTypeOf([]), undefined);
});
