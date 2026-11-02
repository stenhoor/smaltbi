import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileQuery, wrapCustomSql } from '../src/core/compile.js';
import { Model } from '../src/core/model.js';
import { sampleSession } from './helpers.js';

const s = await sampleSession();
const { model, runner } = s;
const run = async (sql: string) => runner.run(sql);
const R = (ref: string, as: 'dimension' | 'measure' = 'dimension') => model.resolve(ref, as);

test('introspection finds tables, keys and date columns', () => {
  const sales = s.schema.tables.find((t) => t.name === 'sales')!;
  assert.ok(sales);
  assert.equal(sales.columns.find((c) => c.name === 'order_date')!.type, 'date');
  assert.equal(sales.columns.find((c) => c.name === 'quantity')!.type, 'number');
  assert.equal(model.validate().length, 0, model.validate().join('; '));
});

test('a measure by a dimension of a related table joins along relationships', async () => {
  const q = compileQuery(model, { dims: [R('products.category')], measures: [R('sales.Revenue')] });
  assert.equal(q.root, 'sales');
  assert.match(q.sql, /LEFT JOIN "products" ON "sales"\."product_id" = "products"\."id"/);
  const f = await run(q.sql);
  assert.equal(f.length, 4);
  const total = Array.from(f.data.m0 as ArrayLike<number>).reduce((a, b) => a + b, 0);
  const direct = await run('SELECT SUM(quantity * unit_price * (1 - discount)) AS t FROM sales');
  assert.ok(Math.abs(total - (direct.data.t as ArrayLike<number>)[0]!) < 1e-6);
});

test('measures inline other measures and cross-table expressions', async () => {
  const q = compileQuery(model, { dims: [], measures: [R('sales.Margin %'), R('sales.Gross Margin')] });
  assert.match(q.sql, /LEFT JOIN "products"/, 'Cost reads products.unit_cost, so products must be joined');
  const f = await run(q.sql);
  const m = (f.data.m0 as ArrayLike<number>)[0]!;
  assert.ok(m > 0.2 && m < 0.6, `margin ${m}`);
});

test('calculated columns expand [refs] and group correctly', async () => {
  const q = compileQuery(model, { dims: [R('sales.Year Quarter')], measures: [R('sales.Orders')] });
  const f = await run(q.sql);
  assert.equal((f.data.d0 as ArrayLike<string>)[0], '2024 Q1');
  assert.equal(f.length, 8);
});

test('implicit aggregation of a column used as a measure', async () => {
  const q = compileQuery(model, { dims: [R('stores.region')], measures: [R('sales.quantity', 'measure'), model.resolve({ field: 'sales.customer_id', agg: 'countd' }, 'measure')] });
  assert.match(q.sql, /SUM\("sales"\."quantity"\)/);
  assert.match(q.sql, /COUNT\(DISTINCT "sales"\."customer_id"\)/);
  await run(q.sql);
});

test('filters: column filters go to WHERE, measure filters to HAVING', async () => {
  const q = compileQuery(model, {
    dims: [R('customers.country')],
    measures: [R('sales.Revenue')],
    filters: [
      { field: 'products.category', op: 'in', values: ['Tea', 'Coffee'] },
      { field: 'sales.Revenue', op: 'gt', values: [1000] },
      { field: 'sales.order_date', op: 'between', values: ['2025-01-01', null] },
    ],
  });
  assert.match(q.sql, /WHERE .*IN \('Tea', 'Coffee'\)/s);
  assert.match(q.sql, /HAVING \(SUM\(.*\)\) > 1000/);
  assert.match(q.sql, /"sales"\."order_date" >= '2025-01-01'/);
  const f = await run(q.sql);
  assert.ok(f.length > 0);
});

test('tuple filters (cross-filter selections) and quoting', async () => {
  const q = compileQuery(model, {
    dims: [R('stores.name')],
    measures: [R('sales.Orders')],
    filters: [{ op: 'tuples', fields: ['products.category', 'customers.segment'], tuples: [['Tea', 'Consumer'], ["O'Brien", null]] }],
  });
  assert.match(q.sql, /\("products"\."category" = 'Tea' AND "customers"\."segment" = 'Consumer'\) OR \("products"\."category" = 'O''Brien' AND "customers"\."segment" IS NULL\)/);
  await run(q.sql);
});

test('top N filter keeps the N best values under the other filters', async () => {
  const q = compileQuery(model, {
    dims: [R('products.name')],
    measures: [R('sales.Revenue')],
    filters: [
      { field: 'products.name', op: 'top', values: [3], by: 'sales.Revenue' },
      { field: 'products.category', op: 'eq', values: ['Tea'] },
    ],
  });
  const f = await run(q.sql);
  assert.equal(f.length, 3);
});

test('filters on unrelated tables are reported, not applied', () => {
  const q = compileQuery(model, { dims: [R('customers.segment')], measures: [], filters: [{ field: 'products.category', op: 'eq', values: ['Tea'] }] });
  assert.equal(q.root, 'customers');
  assert.equal(q.ignored.length, 1);
});

test('dimension-only queries across dimensions go through the fact table', async () => {
  const q = compileQuery(model, { dims: [R('customers.segment'), R('products.category')], measures: [] });
  assert.equal(q.root, 'sales');
  const f = await run(q.sql);
  assert.equal(f.length, 12);
});

test('sortBy, label aliases and limit', () => {
  const m2 = new Model(s.schema, { ...s.report.model, columns: [...(s.report.model.columns ?? []), { table: 'sales', name: 'Mon', sql: "strftime('%m', sales.order_date)", sortBy: 'order_date' }] });
  const q = compileQuery(m2, { dims: [m2.resolve('sales.Mon')], measures: [m2.resolve('sales.Revenue')], limit: 5, labelAliases: true });
  assert.match(q.sql, /AS "Mon"/);
  assert.match(q.sql, /AS "Revenue"/);
  assert.match(q.sql, /ORDER BY "s0" ASC/);
  assert.match(q.sql, /LIMIT 5$/);
});

test('custom SQL is wrapped so matching filters still apply', async () => {
  const sql = 'SELECT p.category, SUM(s.quantity) AS units FROM sales s JOIN products p ON p.id = s.product_id GROUP BY 1';
  const cols = await runner.columnsOf(sql);
  assert.deepEqual(cols, ['category', 'units']);
  const w = wrapCustomSql(sql, cols, [{ field: 'products.category', op: 'in', values: ['Tea'] }, { field: 'stores.region', op: 'eq', values: ['Europe'] }], model);
  assert.equal(w.ignored.length, 1);
  const f = await run(w.sql);
  assert.equal(f.length, 1);
});

test('relationship suggestions by naming convention', () => {
  const bare = new Model(s.schema, {});
  const sug = bare.suggestRelationships().map((r) => `${r.from}->${r.to}`).sort();
  assert.deepEqual(sug, ['sales.customer_id->customers.id', 'sales.product_id->products.id', 'sales.store_id->stores.id']);
});

test('self-referencing measures are rejected', () => {
  const bad = new Model(s.schema, { measures: [{ table: 'sales', name: 'Loop', sql: '[Loop] + 1' }] });
  assert.throws(() => bad.resolve('sales.Loop'), /refers to itself/);
});

test('hierarchies expand to their levels', () => {
  assert.deepEqual(model.expand(['sales.Date', 'stores.region']), ['sales.Year', 'sales.Quarter', 'sales.Month', 'stores.region']);
});

test('every visual of the sample report compiles and runs', async () => {
  const { visualDef } = await import('../src/visuals/api.js');
  await import('../src/visuals/index.js');
  for (const page of s.report.pages) {
    for (const v of page.visuals) {
      const def = visualDef(v.type);
      assert.ok(def, `visual type ${v.type}`);
      const fields: Record<string, ReturnType<typeof R>[]> = {};
      for (const role of def.roles) {
        let refs = model.expand(v.fields[role.name] ?? []);
        if (role.drill) refs = refs.slice(0, 1);
        fields[role.name] = refs.map((r) => model.resolve(r, role.kind));
      }
      const dims = def.roles.filter((r) => r.kind === 'dimension').flatMap((r) => fields[r.name]!);
      const measures = def.roles.filter((r) => r.kind === 'measure').flatMap((r) => fields[r.name]!);
      if (!dims.length && !measures.length) continue;
      const q = compileQuery(model, { dims, measures, limit: 100 });
      await assert.doesNotReject(run(q.sql), `${page.id}/${v.id}: ${q.sql}`);
    }
  }
});
