// Conditional formatting rules (report/conditional.ts): which values match, and which rule wins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellFormatFor, conditionalFields, ruleMatches } from '../src/report/conditional.js';
import { makeData } from '../src/report/view.js';
import { dataColumn } from '../src/visuals/api.js';
import type { ConditionalRule, Visual } from '../src/core/types.js';
import { sampleSession } from './helpers.js';

const { model } = await sampleSession();
const col = (ref: string, role: string, values: (number | string | null)[]) => {
  const f = model.resolve(ref, role === 'columns' ? 'dimension' : 'measure');
  return dataColumn(ref, role, f.label, f, values, String);
};
// Three rows: revenue, cost (shown) and orders (fetched for the rules only).
const data = makeData([col('products.category', 'columns', ['Tea', 'Coffee', 'Cocoa']), col('sales.Revenue', 'values', [120, 340, null]), col('sales.Cost', 'values', [150, 100, 10]), col('sales.Orders', 'conditional', [5, 50, 1])], 3);
const visual = (rules: ConditionalRule[]): Visual => ({ id: 'v', type: 'table', layout: { x: 0, y: 0, w: 4, h: 4 }, fields: {}, conditional: rules });
const [cat, revenue, cost] = data.columns as [never, (typeof data.columns)[0], (typeof data.columns)[0]];
void cat;

test('operators', () => {
  const r = (op: ConditionalRule['op'], value?: number, value2?: number): ConditionalRule => ({ apply: '*', op, value, value2 });
  assert.ok(ruleMatches(r('gt', 100), 120) && !ruleMatches(r('gt', 120), 120));
  assert.ok(ruleMatches(r('gte', 120), 120) && ruleMatches(r('lte', 120), 120) && ruleMatches(r('lt', 121), 120));
  assert.ok(ruleMatches(r('eq', 120), 120n) && ruleMatches(r('ne', 1), 120));
  assert.ok(ruleMatches(r('between', 200, 100), 120), 'between either way round');
  assert.ok(ruleMatches(r('positive'), 1) && ruleMatches(r('negative'), -1) && !ruleMatches(r('positive'), 0));
  assert.ok(ruleMatches(r('blank'), null) && !ruleMatches(r('blank'), 0));
  assert.ok(!ruleMatches(r('gt', 100), null), 'a blank value matches only "blank"');
  assert.ok(!ruleMatches(r('gt'), 120), 'no number to compare with: no match');
});

test('apply, compare with a measure in the row, test another measure, first match wins', () => {
  const fmt = cellFormatFor(
    visual([
      // Revenue below cost: bad, filled, with a down arrow.
      { apply: 'sales.Revenue', op: 'lt', compare: 'sales.Cost', tone: 'bad', fill: true, icon: 'down' },
      // Rows with many orders: good (tested on Orders, a measure the table doesn't show).
      { apply: 'sales.Revenue', test: 'sales.Orders', op: 'gte', value: 10, tone: 'good', icon: 'up' },
      // Every measure: blanks get a warning.
      { apply: '*', op: 'blank', tone: 'warn', icon: 'warn' },
    ]),
    data,
  )!;
  assert.deepEqual(fmt(revenue, 0), { tone: 'bad', fill: true, icon: 'down' });
  assert.deepEqual(fmt(revenue, 1), { tone: 'good', fill: undefined, icon: 'up' });
  assert.deepEqual(fmt(revenue, 2), { tone: 'warn', fill: undefined, icon: 'warn' });
  assert.equal(fmt(cost, 0), null, 'rules for Revenue leave Cost alone');
  assert.equal(cellFormatFor(visual([]), data), undefined, 'no rules: no hook');
  // A rule comparing with a field the data lacks never matches.
  assert.equal(cellFormatFor(visual([{ apply: '*', op: 'gt', compare: 'sales.Units', tone: 'good' }]), data)!(revenue, 1), null);
  assert.deepEqual(conditionalFields(visual([{ apply: '*', op: 'gt', compare: 'sales.Cost' }, { apply: '*', test: 'sales.Orders', op: 'gt', value: 1 }])), ['sales.Cost', 'sales.Orders']);
});
