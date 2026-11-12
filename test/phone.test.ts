// The phone layout (report/phone.ts): one column in reading order, or the page's own order, hidden visuals and heights.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movePhone, phoneLayout, phoneSequence, readingOrder } from '../src/report/phone.js';
import type { Page, Visual } from '../src/core/types.js';

const V = (id: string, x: number, y: number, h = 2, phone?: Visual['phone']): Visual => ({ id, type: 'card', layout: { x, y, w: 3, h }, fields: {}, ...(phone ? { phone } : {}) });
const page = (visuals: Visual[], phoneOrder?: string[]): Page => ({ id: 'p', name: 'P', visuals, ...(phoneOrder ? { phoneOrder } : {}) });

test('reading order: top to bottom, then left to right', () => {
  const vs = [V('c', 6, 2), V('a', 0, 0), V('d', 0, 5), V('b', 9, 0)];
  assert.deepEqual(readingOrder(vs).map((v) => v.id), ['a', 'b', 'c', 'd']);
});

test("the page's own order first, then the rest in reading order; gone ids are skipped", () => {
  const p = page([V('a', 0, 0), V('b', 3, 0), V('c', 0, 3), V('d', 3, 3)], ['d', 'gone', 'b']);
  assert.deepEqual(phoneSequence(p).map((v) => v.id), ['d', 'b', 'a', 'c']);
});

test('slots: order, the phone height or the desktop one, hidden', () => {
  const p = page([V('a', 0, 0, 4), V('b', 3, 0, 2, { h: 6 }), V('c', 0, 4, 3, { hidden: true }), V('d', 3, 4, 2, { h: 99 })]);
  const slots = phoneLayout(p);
  assert.deepEqual(slots.get('a'), { order: 0, h: 4, hidden: false });
  assert.deepEqual(slots.get('b'), { order: 1, h: 6, hidden: false });
  assert.deepEqual(slots.get('c'), { order: 2, h: 3, hidden: true });
  assert.equal(slots.get('d')!.h, 2, 'an unreasonable height falls back to the desktop one');
});

test('moving a visual up or down the column writes the whole order', () => {
  const p = page([V('a', 0, 0), V('b', 3, 0), V('c', 0, 3)]);
  assert.deepEqual(movePhone(p, 'c', -1), ['a', 'c', 'b']);
  assert.deepEqual(movePhone(p, 'a', -1), ['a', 'b', 'c'], 'already first');
});
