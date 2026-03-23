import test from 'node:test';
import assert from 'node:assert/strict';
import { CsvImportService } from '../src/services/csv-import-service.js';

const service = new CsvImportService();

test('imports credit CSV with reordered headers', () => {
  const csv = [
    'Descrição;Data;Valor',
    'Supermercado XPTO;21/03/2026;-123,45',
    'Padaria Sabor;22/03/2026;-15,90'
  ].join('\n');

  const result = service.parseCsvContent(csv, 'Crédito', new Set());
  assert.equal(result.transactions.length, 2);
  assert.equal(result.skipped, 0);
  assert.equal(result.transactions[0].date, '2026-03-21');
  assert.equal(result.transactions[0].value, 123.45);
});

test('imports checking account CSV with trailing minus values', () => {
  const csv = [
    'Data;Descrição;Valor',
    '21/03/2026 00:00:00;Transferência enviada para Fulano;123,45-',
    '22/03/2026 00:00:00;Compra mercado;89,10-'
  ].join('\n');

  const result = service.parseCsvContent(csv, 'Conta', new Set());
  assert.equal(result.transactions.length, 2);
  assert.equal(result.skipped, 0);
  assert.equal(result.transactions[0].date, '2026-03-21');
  assert.equal(result.transactions[0].value, 123.45);
});

test('imports checking account CSV using debit and credit columns', () => {
  const csv = [
    'Data;Histórico;Débito;Crédito;Saldo',
    '21/03/2026;Compra mercado;150,00;;2.000,00',
    '22/03/2026;Recebimento PIX;;500,00;2.500,00'
  ].join('\n');

  const result = service.parseCsvContent(csv, 'Conta', new Set());
  assert.equal(result.transactions.length, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.transactions[0].title, 'Compra mercado');
  assert.equal(result.transactions[0].value, 150);
});

test('keeps existing dedup behavior for repeated rows', () => {
  const csv = [
    'Data;Descrição;Valor',
    '21/03/2026;Compra mercado;100,00-',
    '21/03/2026;Compra mercado;100,00-'
  ].join('\n');

  const result = service.parseCsvContent(csv, 'Conta', new Set());
  assert.equal(result.transactions.length, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.diagnostics.skippedDuplicateRows, 1);
});
