// The grid of a repeated visual (report/repeatgrid.ts): columns, rows, copies shown, the height Expand needs, and
// how visuals below a grown one move down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pushDown, REPEAT_MIN_HEIGHT, repeatGrid, rowsFor } from '../src/report/repeatgrid.js';

const F = 'customers.country';

test('automatic columns fill the space; columns, maxColumns and minWidth set or cap them', () => {
  // 7 copies in 1200 × 200: copies about 1.4 times as wide as tall gives 5 columns, 2 rows.
  assert.deepEqual(repeatGrid({ field: F }, 7, 1200, 200, 10), { cols: 5, rows: 2, shown: 7, minHeight: REPEAT_MIN_HEIGHT, need: 2 * 90 + 10 });
  assert.equal(repeatGrid({ field: F, columns: 7 }, 7, 1200, 200, 10).cols, 7);
  assert.equal(repeatGrid({ field: F, columns: 9 }, 7, 1200, 200, 10).cols, 7, 'never more columns than copies');
  assert.equal(repeatGrid({ field: F, maxColumns: 3 }, 7, 1200, 200, 10).cols, 3);
  // minWidth 300 in 1200 px with 10 px gaps: three fit ((1200 + 10) / 310 = 3.9); it caps fixed columns too.
  assert.equal(repeatGrid({ field: F, minWidth: 300 }, 7, 1200, 200, 10).cols, 3);
  assert.equal(repeatGrid({ field: F, columns: 7, minWidth: 300 }, 7, 1200, 200, 10).cols, 3);
  // A narrow screen: one column, never none.
  assert.equal(repeatGrid({ field: F, minWidth: 300 }, 7, 200, 200, 10).cols, 1);
});

test('maxRows shows the first copies only; minHeight sets the height Expand needs', () => {
  const g = repeatGrid({ field: F, columns: 3, maxRows: 2 }, 10, 900, 300, 10);
  assert.deepEqual([g.cols, g.rows, g.shown], [3, 2, 6]);
  const e = repeatGrid({ field: F, columns: 2, minHeight: 150, overflow: 'expand' }, 7, 600, 100, 10);
  assert.deepEqual([e.rows, e.need], [4, 4 * 150 + 3 * 10]);
  // Expand without columns: as many as fit at minWidth (else 1.4 × minHeight wide).
  assert.equal(repeatGrid({ field: F, minWidth: 190, overflow: 'expand' }, 12, 1000, 100, 10).cols, 5);
  assert.equal(repeatGrid({ field: F, minHeight: 100, overflow: 'expand' }, 12, 1000, 100, 10).cols, 6);
  // Bad values are ignored.
  assert.equal(repeatGrid({ field: F, maxRows: 0, minHeight: -5 } as never, 4, 800, 400, 10).minHeight, REPEAT_MIN_HEIGHT);
});

test('rows a frame spans, and visuals below a grown one move down', () => {
  assert.equal(rowsFor(100, 40, 10), 3); // 40 + 10 + 40 = 90 < 100 ≤ 140
  assert.equal(rowsFor(90, 40, 10), 2);
  const items = [
    { id: 'a', y: 0, h: 2 },
    { id: 'side', y: 0, h: 4 }, // beside a, taller: stretches with the insertion at a's bottom
    { id: 'b', y: 2, h: 3 },
    { id: 'c', y: 5, h: 2 },
    { id: 'top', y: 0, h: 1 },
  ];
  const out = pushDown(items, new Map([['a', 3], ['b', 1]]));
  assert.deepEqual(Object.fromEntries(out), {
    a: { y: 0, h: 5 },
    side: { y: 0, h: 7 },
    b: { y: 5, h: 4 },
    c: { y: 9, h: 2 },
    top: { y: 0, h: 1 },
  });
  // Nothing grows: nothing moves.
  assert.deepEqual(pushDown(items, new Map()).get('c'), { y: 5, h: 2 });
});
