import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeBudgetSummary,
  normalizeBudgetType,
  FAMILY_BUDGET_TYPES
} from '../src/features/family-budget/shared.js';

test('caixinha is tracked separately and does not reduce balance', () => {
  const summary = computeBudgetSummary(
    [
      { ownerId: 'owner-1', name: 'Casa', order: 1, active: true }
    ],
    [
      { recordId: 'r1', ownerId: 'owner-1', type: 'income', name: 'Salário', amount: 5000, order: 1 },
      { recordId: 'r2', ownerId: 'owner-1', type: 'expense', name: 'Aluguel', amount: 1500, order: 2 },
      { recordId: 'r3', ownerId: 'owner-1', type: 'reserve', name: 'Caixinha', amount: 400, order: 3 }
    ]
  );

  assert.equal(summary.family.grossIncome, 5000);
  assert.equal(summary.family.expenseTotal, 1500);
  assert.equal(summary.family.reserveTotal, 400);
  assert.equal(summary.family.netAvailable, 3500);
  assert.equal(summary.family.projectedSavings, 3500);
  assert.equal(summary.family.projectedDeficit, 0);

  assert.equal(summary.ownerSummaries[0].netAvailable, 3500);
  assert.equal(summary.ownerSummaries[0].reserveTotal, 400);
});

test('normalizeBudgetType keeps caixinha as reserve', () => {
  assert.equal(normalizeBudgetType('caixinha'), FAMILY_BUDGET_TYPES.reserve);
  assert.equal(normalizeBudgetType('reserve'), FAMILY_BUDGET_TYPES.reserve);
});
