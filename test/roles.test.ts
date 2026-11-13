// Role-playing dimensions (core/model.ts): one calendar for the order date and, as "Joined", for the date a customer
// joined. Results are checked against direct SQL on the real engine with the sample data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDateTable } from '../src/core/datetable.js';
import { compileQuery } from '../src/core/compile.js';
import { Model } from '../src/core/model.js';
import { introspect } from '../src/data/introspect.js';
import type { Report } from '../src/core/types.js';
import { sampleSession } from './helpers.js';

const s = await sampleSession();
const report: Report = structuredClone(s.report);
const plan = addDateTable(report, { source: 'sales.order_date', table: 'cal' });
await s.db.exec((plan.step as { sql: string }).sql);
report.model.relationships = [...(report.model.relationships ?? []), { from: 'customers.joined', to: 'cal.date', role: 'Joined' }];
const model = new Model(await introspect(s.db), report.model);
const LINE = 'sales.quantity * sales.unit_price * (1 - sales.discount)';

async function rows(dims: string[], measures: string[]): Promise<Record<string, unknown>[]> {
  const q = compileQuery(model, { dims: dims.map((d) => model.resolve(d)), measures: measures.map((m) => model.resolve(m, 'measure')) });
  const f = await s.runner.run(q.sql);
  return Array.from({ length: f.length }, (_, r) => Object.fromEntries(Object.entries(f.data).map(([k, v]) => [k, (v as ArrayLike<unknown>)[r]])));
}

test('a role is the table again, under its name, with its columns and drill paths', () => {
  const t = model.tables.get('Joined')!;
  assert.equal(t.source, 'cal');
  assert.equal(t.kind, 'ROLE');
  assert.ok(t.columns.has('year') && t.columns.has('month_name'));
  assert.ok(t.hierarchies.size > 0, 'the calendar drill paths come along');
  assert.deepEqual(model.validate(), []);
});

test('revenue by the year customers joined, and by order year and joined year together', async () => {
  const byJoined = await rows(['Joined.year'], ['sales.Revenue']);
  // The calendar covers the order dates; customers who joined before it have no calendar row (a blank year).
  const direct = (await s.db.query(
    `SELECT CASE WHEN customers.joined >= (SELECT min(date) FROM cal) THEN strftime('%Y', customers.joined) END AS y, SUM(${LINE}) AS v
     FROM sales JOIN customers ON sales.customer_id = customers.id GROUP BY 1`,
  )) as { y: string | null; v: number }[];
  const want = new Map(direct.map((r) => [String(r.y), r.v]));
  assert.equal(byJoined.length, want.size);
  for (const r of byJoined) assert.ok(Math.abs(Number(r.m0) - want.get(String(r.d0))!) < 1e-6, `joined ${r.d0}`);
  assert.ok(want.has('null') && want.size >= 2, 'some joined before the calendar, some within it');
  // Both calendars in one query: two joins of the same table, no ambiguity.
  const both = await rows(['cal.year', 'Joined.year'], ['sales.Revenue']);
  const q = compileQuery(model, { dims: [model.resolve('cal.year'), model.resolve('Joined.year')], measures: [model.resolve('sales.Revenue', 'measure')] });
  assert.match(q.sql, /LEFT JOIN "cal" ON/);
  assert.match(q.sql, /LEFT JOIN "cal" AS "Joined" ON "customers"\."joined" = "Joined"\."date"/);
  const total = both.reduce((a, r) => a + Number(r.m2 ?? r.m0), 0);
  const all = (await s.db.query(`SELECT SUM(${LINE}) AS v FROM sales`)) as { v: number }[];
  assert.ok(Math.abs(total - all[0]!.v) < 1e-3, 'the split adds up to all revenue');
});

test('a slicer on a role lists its values from the alias', async () => {
  const q = compileQuery(model, { dims: [model.resolve('Joined.year')], measures: [] });
  assert.match(q.sql, /FROM "cal" AS "Joined"|LEFT JOIN "cal" AS "Joined"/);
  const r = await s.runner.run(q.sql);
  assert.ok(r.length > 0);
});

test('a role name that is a table, or has a dot, is reported and not used', () => {
  const bad = new Model(s.schema, { relationships: [{ from: 'sales.customer_id', to: 'customers.id', role: 'products' }, { from: 'sales.store_id', to: 'stores.id', role: 'a.b' }] });
  assert.equal(bad.tables.get('products')?.source, undefined);
  assert.ok(!bad.tables.has('a.b'));
  assert.equal(bad.validate().filter((m) => /role name/.test(m)).length, 2);
});

test('a role brings only its table: what lies beyond is not reached a second way (no ambiguity)', () => {
  // customers again as "Billed customer": both can be grouped by in one query, and nothing beyond doubles up.
  const m = new Model(s.schema, { ...s.report.model, relationships: [...(s.report.model.relationships ?? []), { from: 'sales.customer_id', to: 'customers.id', role: 'Billed customer' }] });
  assert.ok(m.tables.has('Billed customer'));
  assert.doesNotThrow(() => compileQuery(m, { dims: [m.resolve('Billed customer.region'), m.resolve('customers.region')], measures: [m.resolve('sales.Revenue', 'measure')] }));
});
