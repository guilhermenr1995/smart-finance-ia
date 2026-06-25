import test from 'node:test';
import assert from 'node:assert/strict';
import { filterBudgetRecords } from '../src/features/family-budget/shared.js';

const records = [
  { recordId: '1', ownerId: 'owner-1', type: 'income', name: 'Salário', amount: 5000, notes: 'Pagamento mensal' },
  { recordId: '2', ownerId: 'owner-1', type: 'expense', name: 'Mercado', amount: 450, notes: 'Feira da semana' },
  { recordId: '3', ownerId: 'owner-2', type: 'reserve', name: 'Caixinha', amount: 200, notes: 'Guardado no mês' }
];

test('filters family budget records by type without affecting the collection order', () => {
  const filtered = filterBudgetRecords(records, { filterType: 'expense' });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].recordId, '2');
});

test('filters family budget records by search term across name, notes and owner', () => {
  const filteredByName = filterBudgetRecords(records, {
    filterType: 'all',
    searchTerm: 'mercado',
    ownerNamesById: {
      'owner-1': 'Ana',
      'owner-2': 'Bruno'
    }
  });

  const filteredByOwner = filterBudgetRecords(records, {
    filterType: 'all',
    searchTerm: 'bruno',
    ownerNamesById: {
      'owner-1': 'Ana',
      'owner-2': 'Bruno'
    }
  });

  assert.equal(filteredByName.length, 1);
  assert.equal(filteredByName[0].recordId, '2');
  assert.equal(filteredByOwner.length, 1);
  assert.equal(filteredByOwner[0].recordId, '3');
});
