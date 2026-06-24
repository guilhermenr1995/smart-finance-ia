import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultCycleRange } from '../src/utils/date-utils.js';

test('default cycle range starts on 03 of the previous month when today is day 01 or 02', () => {
  const rangeOnSecondDay = getDefaultCycleRange(new Date(2026, 0, 2, 10, 0, 0, 0));

  assert.equal(rangeOnSecondDay.startDate, '2025-12-03');
  assert.equal(rangeOnSecondDay.endDate, '2026-01-02');
});

test('default cycle range starts on 03 of the current month when today is day 03 or later', () => {
  const rangeOnThirdDay = getDefaultCycleRange(new Date(2026, 5, 24, 10, 0, 0, 0));

  assert.equal(rangeOnThirdDay.startDate, '2026-06-03');
  assert.equal(rangeOnThirdDay.endDate, '2026-06-24');
});
