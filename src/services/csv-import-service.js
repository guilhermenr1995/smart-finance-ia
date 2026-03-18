import { parseCsvLine, parseLocaleNumber, splitCsvLines, normalizeCsvHeader } from '../utils/csv-utils.js';
import {
  detectBaseCategory,
  generateTransactionHash,
  isIgnoredCreditEntry,
  isIncomeOrIgnoredStatement
} from '../utils/transaction-utils.js';

export class CsvImportService {
  constructor() {
    this.minimumColumns = 3;
  }

  parseContent(csvText, accountType, existingHashes = new Set()) {
    const lines = splitCsvLines(csvText);
    if (lines.length <= 1) {
      return {
        transactions: [],
        skipped: 0
      };
    }

    const header = normalizeCsvHeader(lines[0]);
    const isCheckingAccountStatement = header.includes('identificador');
    const transactions = [];
    let skipped = 0;

    for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
      const columns = parseCsvLine(lines[lineIndex]).map((cell) => cell.replace(/^"|"$/g, '').trim());
      if (columns.length < this.minimumColumns) {
        skipped += 1;
        continue;
      }

      const parsed = isCheckingAccountStatement
        ? this.parseCheckingAccountLine(columns, accountType)
        : this.parseCreditCardLine(columns, accountType);

      if (!parsed) {
        skipped += 1;
        continue;
      }

      const hash = generateTransactionHash(parsed);
      if (existingHashes.has(hash)) {
        skipped += 1;
        continue;
      }

      existingHashes.add(hash);
      transactions.push({
        ...parsed,
        hash,
        active: true
      });
    }

    return {
      transactions,
      skipped
    };
  }

  parseCheckingAccountLine(columns, accountType) {
    const date = columns[0];
    const value = parseLocaleNumber(columns[1]);
    const title = columns[3] || columns[2] || 'Sem título';

    if (Number.isNaN(value) || isIncomeOrIgnoredStatement(value, title)) {
      return null;
    }

    return {
      date,
      title,
      value: Math.abs(value),
      category: detectBaseCategory(title),
      accountType
    };
  }

  parseCreditCardLine(columns, accountType) {
    const date = columns[0];
    const title = columns[1] || 'Sem título';
    const value = parseLocaleNumber(columns[2]);

    if (Number.isNaN(value) || isIgnoredCreditEntry(value, title)) {
      return null;
    }

    return {
      date,
      title,
      value: Math.abs(value),
      category: detectBaseCategory(title),
      accountType
    };
  }
}
