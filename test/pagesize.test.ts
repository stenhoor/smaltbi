// Fixed page sizes (ADR 0006): presets, orientation, custom sizes, and the row height that fills the sheet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_PRESETS, pageGeometry, pageSize } from '../src/theme/theme.js';
import type { Theme } from '../src/core/types.js';

test('presets: screens are landscape, paper is portrait, either turns', () => {
  assert.equal(pageSize({}), null, 'no size: responsive');
  assert.deepEqual(pageSize({ size: { preset: '16:9' } }), { width: 1280, height: 720 });
  assert.deepEqual(pageSize({ size: { preset: '16:9', landscape: false } }), { width: 720, height: 1280 });
  assert.deepEqual(pageSize({ size: { preset: '4:3' } }), { width: 1024, height: 768 });
  assert.deepEqual(pageSize({ size: { preset: 'letter' } }), { width: 816, height: 1056 }, '8.5 × 11 in at 96 px/in');
  assert.deepEqual(pageSize({ size: { preset: 'a4', landscape: true } }), { width: 1123, height: 794 });
  assert.equal(Object.keys(PAGE_PRESETS).join(), '16:9,4:3,letter,a4');
});

test('custom sizes are whole pixels within limits', () => {
  assert.deepEqual(pageSize({ size: { preset: 'custom', width: 1600.4, height: 900 } }), { width: 1600, height: 900 });
  assert.equal(pageSize({ size: { preset: 'custom', width: 1600 } }), null, 'a missing height');
  assert.equal(pageSize({ size: { preset: 'custom', width: 50, height: 900 } }), null, 'too small');
});

test('a fixed page fits its rows to the sheet; a responsive page keeps the theme row height', () => {
  const theme = { page: { rowHeight: 56, gap: 12, padding: 16, rows: 12 } } as Theme;
  const fixed = pageGeometry(theme, { size: { preset: '16:9' } });
  assert.deepEqual(fixed.fixed, { width: 1280, height: 720 });
  // 12 rows and 11 gaps fill 720 - 2 × 16.
  assert.ok(Math.abs(fixed.rows * fixed.rowHeight + (fixed.rows - 1) * fixed.gap + 2 * fixed.pad - 720) < 1e-9);
  const tall = pageGeometry(theme, { size: { preset: 'a4' }, layout: { rows: 16 } });
  assert.equal(tall.rows, 16);
  assert.ok(Math.abs(16 * tall.rowHeight + 15 * 12 + 32 - 1123) < 1e-9);
  const responsive = pageGeometry(theme, {});
  assert.equal(responsive.fixed, null);
  assert.equal(responsive.rowHeight, 56);
});
