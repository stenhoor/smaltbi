import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatter, formatDate, axisFormatter } from '../src/core/format.js';
import { niceTicks, squarifyCheck } from './visual-helpers.js';
import { themeCss, mergeTheme, BUILTIN_THEMES, loadTheme } from '../src/theme/theme.js';
import { quoteIdent, quoteLiteral } from '../src/core/sql.js';

test('number formats', () => {
  assert.equal(formatter({ currency: 'USD', decimals: 0 }, 'number', 'en-US')(1234.5), '$1,235');
  assert.equal(formatter('percent', 'number', 'en-US')(0.1234), '12.3%');
  assert.equal(formatter('integer', 'number', 'en-US')(1234.56), '1,235');
  assert.equal(formatter('$#,0.00', 'number', 'en-US')(1234.5), '$1,234.50');
  assert.equal(formatter(undefined, 'number', 'en-US')(null), '(Blank)');
  assert.equal(axisFormatter(undefined, 'en-US')(1500000), '1.5M');
  assert.equal(formatter(undefined, 'text')('Tea'), 'Tea');
});

test('date formats do not shift time zones', () => {
  assert.equal(formatDate('2025-01-01', 'MMM YYYY'), 'Jan 2025');
  assert.equal(formatDate('2025-03', 'MMM YYYY'), 'Mar 2025');
  assert.equal(formatDate('2025-08-09 13:05:00', 'YYYY-MM-DD HH:mm'), '2025-08-09 13:05');
  assert.equal(formatDate('2025-08-09', 'Q'), '3');
  assert.equal(formatter('month')('2025-11'), 'Nov 2025');
});

test('nice ticks', () => {
  assert.deepEqual(niceTicks(0, 97, 5).ticks, [0, 20, 40, 60, 80, 100]);
  assert.deepEqual(niceTicks(-3, 12, 4).ticks, [-5, 0, 5, 10, 15]);
});

test('treemap layout fills the rectangle', () => {
  assert.ok(squarifyCheck());
});

test('SQL quoting', () => {
  assert.equal(quoteIdent('a"b'), '"a""b"');
  assert.equal(quoteLiteral("it's"), "'it''s'");
  assert.equal(quoteLiteral(null), 'NULL');
  assert.equal(quoteLiteral(true), '1');
});

test('themes compile to scoped CSS variables, with dark mode', async () => {
  const css = themeCss(BUILTIN_THEMES.smalt!);
  assert.match(css, /\.sb-themed\{--sb-bg:#f4f6f9;/);
  assert.match(css, /--sb-c11:/);
  assert.match(css, /prefers-color-scheme: dark/);
  const t = mergeTheme(BUILTIN_THEMES.smalt!, { name: 'Mine', colors: { accent: '#ff0000' } });
  assert.equal(t.colors!.accent, '#ff0000');
  assert.equal(t.colors!.background, '#f4f6f9');
  const ext = await loadTheme({ name: 'X', extends: 'paper', palette: ['#000'] });
  assert.equal(ext.fonts!.body!.includes('Source Serif'), true);
  assert.match(themeCss(ext), /@import url\("https:\/\/fonts\.googleapis\.com/);
});
