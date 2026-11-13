import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Model } from '../src/core/model.js';
import { ambiguousPaths, autoLayout } from '../src/designer/modelview.js';
import { sampleSession } from './helpers.js';

const s = await sampleSession();

test('auto layout puts the fact table between its dimensions', () => {
  const pos = autoLayout(s.model);
  assert.deepEqual(Object.keys(pos).sort(), ['calendar', 'customers', 'products', 'sales', 'stores']);
  const xs = Object.fromEntries(Object.entries(pos).map(([t, p]) => [t, p.x]));
  const dims = ['calendar', 'customers', 'products', 'stores'];
  assert.ok(dims.some((d) => xs[d]! < xs.sales!), 'a dimension on the left');
  assert.ok(dims.some((d) => xs[d]! > xs.sales!), 'a dimension on the right');
  // No two cards in the same column overlap vertically.
  for (const a of dims) for (const b of dims) if (a < b && xs[a] === xs[b]) assert.notEqual(pos[a]!.y, pos[b]!.y);
});

test('unrelated tables go in a row below', () => {
  const bare = new Model(s.schema, { relationships: [] });
  const pos = autoLayout(bare);
  const ys = new Set(Object.values(pos).map((p) => p.y));
  assert.equal(ys.size, 1);
});

test('ambiguous paths are detected', () => {
  assert.deepEqual(ambiguousPaths(s.model), []);
  // sales → customers directly and sales → stores → customers (a contrived second path).
  const amb = new Model(s.schema, { relationships: [...(s.report.model.relationships ?? []), { from: 'stores.id', to: 'customers.id' }] });
  assert.deepEqual(ambiguousPaths(amb), [['sales', 'customers']]);
  const inactive = new Model(s.schema, { relationships: [...(s.report.model.relationships ?? []), { from: 'stores.id', to: 'customers.id', active: false }] });
  assert.deepEqual(ambiguousPaths(inactive), []);
});
