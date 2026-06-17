import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TransactionQueryService,
  generateTransactionDedupKey,
  getTransactionNetValue,
  isIncomeOrIgnoredStatement,
  matchesTransactionSearch
} from '../src/utils/transaction-utils.js';

test('treats discount transactions as negative and keeps dedup keys distinct', () => {
  const discount = {
    date: '2026-03-21',
    title: 'Desconto supermercado',
    value: 50,
    entryType: 'discount'
  };
  const transaction = {
    ...discount,
    entryType: 'transaction'
  };

  assert.equal(getTransactionNetValue(discount), -50);
  assert.equal(getTransactionNetValue(transaction), 50);
  assert.notEqual(generateTransactionDedupKey(discount), generateTransactionDedupKey(transaction));
});

test('buildSummary subtracts discounts and excludes them from ai candidates', () => {
  const queryService = new TransactionQueryService();
  const visibleTransactions = [
    {
      docId: 'tx-1',
      date: '2026-03-21',
      title: 'Compra mercado',
      category: 'Mercado',
      accountType: 'Conta',
      value: 100,
      entryType: 'transaction',
      active: true
    },
    {
      docId: 'tx-2',
      date: '2026-03-21',
      title: 'Desconto mercado',
      category: 'Alimentação',
      accountType: 'Conta',
      value: -20,
      entryType: 'discount',
      active: true
    },
    {
      docId: 'tx-3',
      date: '2026-03-21',
      title: 'Padaria',
      category: 'Outros',
      accountType: 'Conta',
      value: 15,
      entryType: 'transaction',
      active: true
    }
  ];

  const summary = queryService.buildSummary(visibleTransactions);
  const candidates = queryService.getAiCandidates(visibleTransactions);

  assert.equal(summary.total, 95);
  assert.equal(summary.categoryTotals['Mercado'], 100);
  assert.equal(summary.categoryTotals['Alimentação'], -20);
  assert.equal(summary.categoryTotals['Outros'], 15);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].docId, 'tx-3');
});

test('does not ignore boleto payments as income on checking statements', () => {
  const title = 'Pagamento de boleto efetuado - UNIMED GUAXUPE COOP.TR.MED';
  assert.equal(isIncomeOrIgnoredStatement(654.36, title), false);
  assert.equal(isIncomeOrIgnoredStatement(-654.36, title), false);
});

test('matches value search by absolute amount', () => {
  assert.equal(
    matchesTransactionSearch(
      {
        value: -42.5
      },
      'value',
      '42,50'
    ),
    true
  );
});
