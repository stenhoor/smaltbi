// What-if parameters (core/model.ts): `[@Name]` in measures compiles to a placeholder that bindParams turns into a
// literal of the current value, on the real engine with the sample data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileQuery } from '../src/core/compile.js';
import { Model, ModelError, bindParams, paramRefs, paramValue, showParams } from '../src/core/model.js';
import type { Measure, Parameter } from '../src/core/types.js';
import { sampleSession } from './helpers.js';

const s = await sampleSession();
const params: Parameter[] = [
  { name: 'Growth', type: 'number', value: 0.1, min: 0, max: 1, step: 0.05 },
  { name: 'Category', type: 'text', value: 'Tea', choices: ['Tea', 'Coffee'] },
];
const measures: Measure[] = [
  { table: 'sales', name: 'Revenue grown', sql: '[Revenue] * (1 + [@Growth])' },
  { table: 'sales', name: 'Category revenue', sql: "SUM(sales.quantity * sales.unit_price * (1 - sales.discount)) FILTER (WHERE products.category = [@Category])" },
];
const model = new Model(s.schema, { ...s.report.model, parameters: params, measures: [...(s.report.model.measures ?? []), ...measures] });

async function card(measure: string, values?: Record<string, unknown>): Promise<number> {
  const q = compileQuery(model, { dims: [], measures: [model.resolve(`sales.${measure}`, 'measure')] });
  const f = await s.runner.run(bindParams(q.sql, model, values));
  return Number((f.data.m0 as ArrayLike<unknown>)[0]);
}

test('a number parameter: its default, the reader’s value, kept inside its range', async () => {
  const revenue = await card('Revenue');
  assert.ok(Math.abs((await card('Revenue grown')) - revenue * 1.1) < 1e-6, 'default 0.1');
  assert.ok(Math.abs((await card('Revenue grown', { growth: 0.5 })) - revenue * 1.5) < 1e-6, 'names ignore case');
  assert.ok(Math.abs((await card('Revenue grown', { Growth: 7 })) - revenue * 2) < 1e-6, 'clamped to the max (1)');
  assert.ok(Math.abs((await card('Revenue grown', { Growth: 'x' })) - revenue * 1.1) < 1e-6, 'not a number: the default');
});

test('a text parameter: quoted, and only its choices', async () => {
  const tea = await card('Category revenue');
  const coffee = await card('Category revenue', { Category: 'Coffee' });
  assert.ok(tea > 0 && coffee > 0 && tea !== coffee);
  assert.equal(await card('Category revenue', { Category: "x' OR 1=1 --" }), tea, 'a value outside the choices is the default, never SQL');
  assert.equal(paramValue({ name: 'T', type: 'text', value: '' }, "it's"), "it's");
  const quoted = new Model(s.schema, { parameters: [{ name: 'T', type: 'text', value: "it's" }], measures: [{ table: 'sales', name: 'M', sql: 'MAX([@T])' }] });
  const sql = compileQuery(quoted, { dims: [], measures: [quoted.resolve('sales.M', 'measure')] }).sql;
  assert.match(bindParams(sql, quoted), /'it''s'/, 'quotes escaped');
});

test('unknown parameters are errors; SQL for people shows [@Name]; custom SQL can use them', () => {
  const bad = new Model(s.schema, { measures: [{ table: 'sales', name: 'Bad', sql: '[@Nope] * 2' }] });
  assert.throws(() => bad.resolve('sales.Bad', 'measure'), (e: unknown) => e instanceof ModelError && /unknown parameter @Nope/.test((e as Error).message));
  const q = compileQuery(model, { dims: [], measures: [model.resolve('sales.Revenue grown', 'measure')] });
  assert.match(showParams(q.sql, model), /\(1 \+ \[@Growth\]\)/);
  assert.equal(bindParams(paramRefs('SELECT [@Growth] AS g, [@Nope] AS n', model), model, { Growth: 0.25 }), 'SELECT (0.25) AS g, [@Nope] AS n');
});
