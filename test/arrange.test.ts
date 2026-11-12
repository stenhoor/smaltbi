// Arranging visuals (designer/arrange.ts): align, distribute, same size, paste placement, snap guides, clipboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { align, clipText, distribute, guides, parseClip, placePasted, sameSize } from '../src/designer/arrange.js';
import type { Page, Visual } from '../src/core/types.js';

const L = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

test('align to the first layout', () => {
  const ls = [L(2, 1, 4, 3), L(7, 5, 2, 1), L(0, 9, 6, 2)];
  assert.deepEqual(align(ls, 'left').map((l) => l.x), [2, 2, 2]);
  assert.deepEqual(align(ls, 'right').map((l) => l.x + l.w), [6, 6, 6]);
  assert.deepEqual(align(ls, 'center').map((l) => l.x), [2, 3, 1]);
  assert.deepEqual(align(ls, 'top').map((l) => l.y), [1, 1, 1]);
  assert.deepEqual(align(ls, 'bottom').map((l) => l.y + l.h), [4, 4, 4]);
  assert.deepEqual(align(ls, 'middle').map((l) => l.y), [1, 2, 2]);
  // Kept on the page: a wide visual aligned right of a narrow one at the left edge.
  assert.deepEqual(align([L(0, 0, 2, 2), L(5, 0, 6, 2)], 'right')[1], L(0, 0, 6, 2));
});

test('distribute evenly between the outermost', () => {
  const out = distribute([L(0, 0, 2, 2), L(3, 0, 2, 2), L(10, 0, 2, 2)], 'x');
  assert.deepEqual(out.map((l) => l.x), [0, 5, 10], 'gaps of 3 cells');
  const ys = distribute([L(0, 12, 4, 2), L(0, 0, 4, 2), L(0, 3, 4, 4)], 'y');
  assert.deepEqual(ys.map((l) => l.y), [12, 0, 5], 'order by position, not selection; gaps of 3');
  assert.deepEqual(distribute([L(0, 0, 1, 1), L(5, 0, 1, 1)], 'x').map((l) => l.x), [0, 5], 'two: unchanged');
});

test('same width or height as the first', () => {
  assert.deepEqual(sameSize([L(0, 0, 6, 3), L(9, 4, 2, 5)], 'w')[1], L(6, 4, 6, 5), 'widened and kept on the page');
  assert.deepEqual(sameSize([L(0, 0, 6, 3), L(9, 4, 2, 5)], 'h')[1], L(9, 4, 2, 3));
});

test('pasted visuals get new ids, keep a free position, else go below the page', () => {
  const page: Page = { id: 'p', name: 'P', visuals: [{ id: 'v1', type: 'card', layout: L(0, 0, 3, 2), fields: {} }] };
  const copied: Visual[] = [
    { id: 'v1', type: 'card', layout: L(0, 0, 3, 2), fields: { values: ['sales.Revenue'] } },
    { id: 'v2', type: 'bar', layout: L(3, 0, 5, 4), fields: {} },
  ];
  const same = placePasted(page, copied, ['v1', 'v2']);
  assert.deepEqual(same.map((v) => v.id), ['v3', 'v4']);
  assert.deepEqual(same.map((v) => v.layout), [L(0, 2, 3, 2), L(3, 2, 5, 4)], 'below, arrangement kept');
  assert.notEqual(same[0]!.fields, copied[0]!.fields, 'deep copies');
  const empty: Page = { id: 'q', name: 'Q', visuals: [] };
  assert.deepEqual(placePasted(empty, copied, ['v1', 'v2']).map((v) => v.layout), [L(0, 0, 3, 2), L(3, 0, 5, 4)], 'free: same place');
});

test('snap guides where edges and centres meet', () => {
  const g = guides(L(2, 5, 4, 2), [L(2, 0, 3, 2), L(8, 6, 4, 4), L(0, 9, 8, 1)]);
  assert.deepEqual(g, { x: [2, 4], y: [6] });
});

test('clipboard text round-trips; other text is not visuals', () => {
  const vs: Visual[] = [{ id: 'v1', type: 'card', layout: L(0, 0, 3, 2), fields: {} }];
  assert.deepEqual(parseClip(clipText(vs)), vs);
  assert.equal(parseClip('hello'), null);
  assert.equal(parseClip('{"kind":"other"}'), null);
  assert.equal(parseClip('{"kind":"smaltbi/visuals","visuals":[{"id":1}]}'), null);
});
