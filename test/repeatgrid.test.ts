// The grid of a repeated visual (report/repeatgrid.ts): columns, rows, copies shown, row height, the height Expand
// needs, the copy's minimum size in page grid cells, and how visuals below a grown one move down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyPx, gridSpec, pushDown, REPEAT_MIN_HEIGHT, repeatGrid, rowsFor } from '../src/report/repeatgrid.js';

test('automatic columns fill the space; columns and maxColumns set or cap them', () => {
  // 7 copies in 1200 × 200: copies about 1.4 times as wide as tall gives 5 columns, 2 rows.
  assert.deepEqual(repeatGrid({}, 7, 1200, 200, 10), { cols: 5, rows: 2, shown: 7, rowHeight: REPEAT_MIN_HEIGHT, need: 2 * 90 + 10 });
  assert.equal(repeatGrid({ columns: 7 }, 7, 1200, 200, 10).cols, 7);
  assert.equal(repeatGrid({ columns: 9 }, 7, 1200, 200, 10).cols, 7, 'never more columns than copies');
  assert.equal(repeatGrid({ maxColumns: 3 }, 7, 1200, 200, 10).cols, 3);
});

test("a copy's minimum width lowers the columns; minColumns wins over it", () => {
  // minWidth 300 in 1200 px with 10 px gaps: three fit ((1200 + 10) / 310 = 3.9); it caps fixed columns too.
  assert.equal(repeatGrid({ minWidth: 300 }, 7, 1200, 200, 10).cols, 3);
  assert.equal(repeatGrid({ columns: 7, minWidth: 300 }, 7, 1200, 200, 10).cols, 3);
  assert.equal(repeatGrid({ minWidth: 300 }, 7, 200, 200, 10).cols, 1, 'a narrow screen: one column, never none');
  // At least 2 columns, even where one copy of the minimum width fills the screen: the copies shrink.
  assert.equal(repeatGrid({ minWidth: 300, minColumns: 2 }, 7, 200, 200, 10).cols, 2);
  // maxColumns is applied last; never more columns than copies.
  assert.equal(repeatGrid({ minColumns: 5, maxColumns: 4 }, 7, 1200, 200, 10).cols, 4);
  assert.equal(repeatGrid({ minColumns: 5 }, 3, 1200, 200, 10).cols, 3);
});

test('rows: maxRows shows the first copies only; minRows lowers the rows to fit; Expand needs every row', () => {
  const g = repeatGrid({ columns: 3, maxRows: 2 }, 10, 900, 300, 10);
  assert.deepEqual([g.cols, g.rows, g.shown], [3, 2, 6]);
  // 3 rows of 100 px copies must show in 200 px: rows of (200 - 2 × 10) / 3 = 60 px.
  assert.equal(repeatGrid({ columns: 3, minRows: 3, minHeight: 100 }, 9, 900, 200, 10).rowHeight, 60);
  assert.equal(repeatGrid({ columns: 3, minRows: 3, minHeight: 50 }, 9, 900, 200, 10).rowHeight, 50, 'already fits: the copy height');
  const e = repeatGrid({ columns: 2, minHeight: 150, expand: true }, 7, 600, 100, 10);
  assert.deepEqual([e.rows, e.need], [4, 4 * 150 + 3 * 10]);
  // Expand without columns: as many as fit at minWidth (else 1.4 × minHeight wide).
  assert.equal(repeatGrid({ minWidth: 190, expand: true }, 12, 1000, 100, 10).cols, 5);
  assert.equal(repeatGrid({ minHeight: 100, expand: true }, 12, 1000, 100, 10).cols, 6);
  // Bad values are ignored.
  assert.equal(repeatGrid({ maxRows: 0, minHeight: -5 }, 4, 800, 400, 10).rowHeight, REPEAT_MIN_HEIGHT);
});

test("a copy's minimum size in page grid cells", () => {
  // 3 columns of 80 px and 2 rows of 40 px, 16 px gaps: 3 × 80 + 2 × 16 = 272 wide, 2 × 40 + 16 = 96 high.
  assert.deepEqual(copyPx({ w: 3, h: 2 }, 80, 40, 16), { minWidth: 272, minHeight: 96 });
  assert.deepEqual(copyPx(undefined, 80, 40, 16), { minWidth: undefined, minHeight: undefined });
  const spec = gridSpec({ field: 'customers.country', copy: { w: 3 }, minColumns: 2, maxRows: 4 }, true, 80, 40, 16);
  assert.deepEqual(spec, { columns: undefined, minColumns: 2, maxColumns: undefined, minRows: undefined, maxRows: 4, minWidth: 272, minHeight: undefined, expand: true });
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
