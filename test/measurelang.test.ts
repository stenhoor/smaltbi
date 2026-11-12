// The measure editor's language (designer/measurelang.ts): completion from the model, reference checks, error ranges.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bracketNames, errorRange, measureLanguage, modelSchema, referenceWarnings } from '../src/designer/measurelang.js';
import { sampleSession } from './helpers.js';

const { model } = await sampleSession();
const lang = measureLanguage(model, 'sales');
const schema = modelSchema(model);
const complete = (text: string, explicit = false) => {
  const r = lang.complete!(text, text.length, schema, explicit);
  return { labels: r.items.map((i) => i.label), start: r.start };
};

test('[ completes measures and calculated columns, by name anywhere in it', () => {
  const r = complete('SUM(x) / [gro');
  assert.equal(r.start, 'SUM(x) / ['.length);
  assert.deepEqual(r.labels, ['Gross Margin']);
  // Calculated columns of the home table are bare; the list includes them.
  assert.ok(complete('[', true).labels.includes('Line Revenue'));
  // Contains, not only starts with: "margin" finds Gross Margin and Margin %, prefix matches first.
  assert.deepEqual(complete('[margin').labels, ['Margin %', 'Gross Margin']);
  // After a closed reference, completion is SQL again.
  assert.ok(!complete('[Revenue] + SU').labels.includes('Revenue'));
});

test('table. completes its columns, calculated ones included', () => {
  const labels = complete('SUM(sales.').labels;
  for (const c of ['quantity', 'unit_price', 'discount']) assert.ok(labels.includes(c), c);
  // "Line Revenue" has a space: it's completed through [ ], not after a dot.
  assert.ok(!labels.includes('Line Revenue'));
  assert.ok(complete('products.').labels.includes('unit_cost'));
});

test('unknown [references] are marked where they are', () => {
  const text = 'SUM([Line Revenue]) / NULLIF([Ordres], 0) + [sales.Revenue]';
  const w = referenceWarnings(text, model, 'sales');
  assert.equal(w.length, 1);
  assert.equal(text.slice(w[0]!.start, w[0]!.end), '[Ordres]');
  assert.match(w[0]!.message, /No measure or calculated column named Ordres/);
  assert.equal(referenceWarnings('COUNT(*)', model, 'sales').length, 0);
  assert.ok(bracketNames(model, 'products').some((i) => i.label === 'sales.Line Revenue'), 'other tables\' columns are qualified');
});

test('an error points at the name it quotes', () => {
  const text = 'SUM(sales.quanity)';
  const r = errorRange(text, 'no such column: sales.quanity');
  assert.deepEqual(r && text.slice(r.start, r.end), 'sales.quanity');
  assert.equal(errorRange('COUNT(*)', 'something else went wrong'), null);
});
