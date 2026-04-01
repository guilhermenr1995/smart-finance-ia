import {
  DEFAULT_BANK_ACCOUNT,
  detectBaseCategory,
  detectCsvDelimiter,
  extractOfxTagValue,
  extractPdfAmountTokens,
  findHeaderIndex,
  generateTransactionDedupKey,
  generateTransactionHash,
  isIgnoredCreditEntry,
  isIncomeOrIgnoredStatement,
  normalizeForPdfMatching,
  normalizeHeaderCell,
  normalizeImportedDate,
  normalizePdfDate,
  normalizeSignalText,
  parseCsvLine,
  parseLocaleNumber,
  parseOfxAmount,
  parseOfxDate,
  parsePdfDateToken,
  splitCsvLines,
  uniqueIndexes
} from '../shared.js';
import { applyClassMethods } from './register-methods.js';

class CsvImportServiceCsvLayoutMethods {
  resolveCsvLayout(headerColumns, isCheckingAccountStatement) {
    const normalizedHeaders = (Array.isArray(headerColumns) ? headerColumns : []).map((cell) => normalizeHeaderCell(cell));
    const dateIndex = findHeaderIndex(normalizedHeaders, [
      'data',
      'date',
      'dt',
      'posted date',
      'transaction date',
      'data da transacao',
      'data da transação',
      'data de compra'
    ]);
    const titleIndex = findHeaderIndex(normalizedHeaders, [
      'descricao',
      'descrição',
      'historico',
      'histórico',
      'detalhes',
      'title',
      'titulo',
      'título',
      'merchant',
      'estabelecimento',
      'nome'
    ]);
    const valueIndex = findHeaderIndex(normalizedHeaders, [
      'valor',
      'amount',
      'price',
      'preco',
      'preço',
      'total',
      'valor r$',
      'valor da transacao',
      'valor da transação'
    ]);
    const identifierIndex = findHeaderIndex(normalizedHeaders, [
      'identificador',
      'id',
      'id transacao',
      'id transação',
      'transaction id',
      'fitid'
    ]);
    const typeIndex = findHeaderIndex(normalizedHeaders, [
      'tipo',
      'natureza',
      'tipo lancamento',
      'tipo lançamento',
      'tipo movimentacao',
      'tipo movimentação',
      'debito credito',
      'd c',
      'dc'
    ]);
    const debitIndex = findHeaderIndex(normalizedHeaders, [
      'debito',
      'débito',
      'valor debito',
      'valor débito',
      'saida',
      'saída'
    ]);
    const creditIndex = findHeaderIndex(normalizedHeaders, [
      'credito',
      'crédito',
      'valor credito',
      'valor crédito',
      'entrada'
    ]);

    return {
      dateIndex: dateIndex >= 0 ? dateIndex : 0,
      titleIndex: titleIndex >= 0 ? titleIndex : isCheckingAccountStatement ? 3 : 1,
      valueIndex: valueIndex >= 0 ? valueIndex : isCheckingAccountStatement ? 1 : 2,
      identifierIndex,
      typeIndex,
      debitIndex,
      creditIndex
    };
  }

  resolveTextFromColumns(columns, preferredIndexes = [], fallback = '') {
    const indexes = uniqueIndexes(preferredIndexes, columns.length);
    for (const index of indexes) {
      const value = String(columns[index] || '').trim();
      if (value) {
        return value;
      }
    }

    return String(fallback || '').trim();
  }

  resolveValueFromColumns(columns, preferredIndexes = [], options = {}) {
    const fallbackToAnyColumn = options.fallbackToAnyColumn !== false;
    const indexes = uniqueIndexes(
      fallbackToAnyColumn ? [...preferredIndexes, ...columns.map((_, index) => index)] : preferredIndexes,
      columns.length
    );
    const dateLikePattern = /^\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?$/;
    for (const index of indexes) {
      const raw = String(columns[index] || '').trim();
      if (!raw || dateLikePattern.test(raw)) {
        continue;
      }

      const parsed = parseLocaleNumber(raw);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return Number.NaN;
  }

  resolveSignedCheckingValue(columns, csvLayout, value, title) {
    const debitColumnValue = this.resolveValueFromColumns(columns, [csvLayout.debitIndex], {
      fallbackToAnyColumn: false
    });
    if (Number.isFinite(debitColumnValue) && Math.abs(debitColumnValue) > 0.00001) {
      return -Math.abs(debitColumnValue);
    }

    const creditColumnValue = this.resolveValueFromColumns(columns, [csvLayout.creditIndex], {
      fallbackToAnyColumn: false
    });
    if (Number.isFinite(creditColumnValue) && Math.abs(creditColumnValue) > 0.00001) {
      return Math.abs(creditColumnValue);
    }

    let signedValue = Number(value);
    if (!Number.isFinite(signedValue)) {
      return Number.NaN;
    }

    const typeToken = normalizeSignalText(this.resolveTextFromColumns(columns, [csvLayout.typeIndex], ''));
    const rowToken = normalizeSignalText(columns.join(' '));
    const titleToken = normalizeSignalText(title);
    const signalToken = `${typeToken} ${titleToken} ${rowToken}`;

    if (/\b(D|DEBITO|DEBIT|SAIDA|SAQUE)\b/.test(typeToken)) {
      signedValue = -Math.abs(signedValue);
      return signedValue;
    }

    if (/\b(C|CREDITO|CREDIT|ENTRADA)\b/.test(typeToken)) {
      signedValue = Math.abs(signedValue);
      return signedValue;
    }

    if (
      /\b(PIX ENVIAD|TRANSFERENCIA ENVIAD|TRANSFERENCIA|COMPRA|PAGAMENTO|DEBITO|TED ENVIAD|DOC ENVIAD|SAQUE|TARIFA|IOF|JUROS|ENCARGO|BOLETO)\b/.test(
        signalToken
      )
    ) {
      signedValue = -Math.abs(signedValue);
      return signedValue;
    }

    return signedValue;
  }

  parseCheckingAccountLine(columns, accountType, csvLayout = {}) {
    const date = normalizeImportedDate(this.resolveTextFromColumns(columns, [csvLayout.dateIndex, 0], ''));
    const value = this.resolveValueFromColumns(columns, [csvLayout.valueIndex, 1, 2, 3]);
    const title = this.resolveTextFromColumns(columns, [csvLayout.titleIndex, 3, 2, 1], 'Sem título');
    const signedValue = this.resolveSignedCheckingValue(columns, csvLayout, value, title);

    if (!date || Number.isNaN(signedValue) || isIncomeOrIgnoredStatement(signedValue, title)) {
      return null;
    }

    return {
      date,
      title,
      value: Math.abs(signedValue),
      category: detectBaseCategory(title),
      accountType,
      bankAccount: DEFAULT_BANK_ACCOUNT
    };
  }

  parseCreditCardLine(columns, accountType, csvLayout = {}) {
    const date = normalizeImportedDate(this.resolveTextFromColumns(columns, [csvLayout.dateIndex, 0], ''));
    const title = this.resolveTextFromColumns(columns, [csvLayout.titleIndex, 1, 2, 3], 'Sem título');
    const value = this.resolveValueFromColumns(columns, [csvLayout.valueIndex, 2, 3, 1]);

    if (!date || Number.isNaN(value) || isIgnoredCreditEntry(value, title)) {
      return null;
    }

    return {
      date,
      title,
      value: Math.abs(value),
      category: detectBaseCategory(title),
      accountType,
      bankAccount: DEFAULT_BANK_ACCOUNT
    };
  }
}

export function registerCsvLayoutMethods(CsvImportService) {
  applyClassMethods(CsvImportService, CsvImportServiceCsvLayoutMethods);
}
