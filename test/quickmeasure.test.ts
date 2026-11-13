// The name the Quick measure dialog suggests (designer/quickmeasure.ts): from the base measure and the calculation,
// and never one a measure already has, since the dialog refuses those.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickMeasureName } from '../src/designer/quickmeasure.js';

test('the suggested name follows the calculation, and is free', () => {
  assert.equal(quickMeasureName('Revenue', 'py', 3), 'Revenue LY');
  assert.equal(quickMeasureName('Revenue', 'rolling', 6), 'Revenue rolling 6 months');
  assert.equal(quickMeasureName('Revenue', 'py', 3, ['Revenue', 'Orders']), 'Revenue LY');
  // Taken (in any case): the first free number.
  assert.equal(quickMeasureName('Revenue', 'py', 3, ['revenue ly']), 'Revenue LY 2');
  assert.equal(quickMeasureName('Revenue', 'py', 3, ['Revenue LY', 'Revenue LY 2', 'Revenue LY 4']), 'Revenue LY 3');
});
