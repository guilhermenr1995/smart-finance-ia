import { parseCsvLine, parseLocaleNumber, splitCsvLines, normalizeCsvHeader } from '../utils/csv-utils.js';
import {
  detectBaseCategory,
  generateTransactionHash,
  isIgnoredCreditEntry,
  isIncomeOrIgnoredStatement
} from '../utils/transaction-utils.js';

function extractOfxTagValue(block, tagName) {
  const closeTagPattern = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i');
  const closeTagMatch = block.match(closeTagPattern);
  if (closeTagMatch?.[1]) {
    return closeTagMatch[1].trim();
  }

  const openTagPattern = new RegExp(`<${tagName}>([^\\r\\n<]+)`, 'i');
  const openTagMatch = block.match(openTagPattern);
  return openTagMatch?.[1] ? openTagMatch[1].trim() : '';
}

function parseOfxDate(rawValue) {
  const match = String(rawValue || '').match(/(\d{4})(\d{2})(\d{2})/);
  if (!match) {
    return '';
  }

  const [, year, month, day] = match;
  return `${year}-${month}-${day}`;
}

function parseOfxAmount(rawValue) {
  let normalized = String(rawValue || '')
    .replace(/[^\d,.-]/g, '')
    .trim();

  if (!normalized) {
    return Number.NaN;
  }

  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');

  if (hasComma && hasDot) {
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (hasComma) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = normalized.replace(/,/g, '');
  }

  return Number.parseFloat(normalized);
}

export class CsvImportService {
  constructor() {
    this.minimumColumns = 3;
  }

  parseFileContent(fileName, fileContent, accountType, existingHashes = new Set()) {
    const normalizedName = String(fileName || '').toLowerCase();
    const normalizedContent = String(fileContent || '');
    const looksLikeOfx =
      normalizedName.endsWith('.ofx') ||
      normalizedName.endsWith('.ofc') ||
      /<OFX>/i.test(normalizedContent) ||
      /<STMTTRN>/i.test(normalizedContent);

    if (looksLikeOfx) {
      return this.parseOfxContent(normalizedContent, accountType, existingHashes);
    }

    return this.parseCsvContent(normalizedContent, accountType, existingHashes);
  }

  parseContent(csvText, accountType, existingHashes = new Set()) {
    return this.parseCsvContent(csvText, accountType, existingHashes);
  }

  parseCsvContent(csvText, accountType, existingHashes = new Set()) {
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

  parseOfxContent(ofxText, accountType, existingHashes = new Set()) {
    const blocks = String(ofxText || '').match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
    if (blocks.length === 0) {
      return {
        transactions: [],
        skipped: 0
      };
    }

    const transactions = [];
    let skipped = 0;

    blocks.forEach((block) => {
      const date = parseOfxDate(extractOfxTagValue(block, 'DTPOSTED'));
      const value = parseOfxAmount(extractOfxTagValue(block, 'TRNAMT'));
      const memo = extractOfxTagValue(block, 'MEMO');
      const name = extractOfxTagValue(block, 'NAME');
      const fitId = extractOfxTagValue(block, 'FITID');
      const transactionType = extractOfxTagValue(block, 'TRNTYPE');
      const title = memo || name || `${transactionType || 'Transação'} ${fitId}`.trim() || 'Sem título';

      if (!date || Number.isNaN(value)) {
        skipped += 1;
        return;
      }

      const shouldIgnore =
        accountType === 'Crédito' ? isIgnoredCreditEntry(value, title) : isIncomeOrIgnoredStatement(value, title);

      if (shouldIgnore) {
        skipped += 1;
        return;
      }

      const parsed = {
        date,
        title,
        value: Math.abs(value),
        category: detectBaseCategory(title),
        accountType
      };

      const hash = generateTransactionHash(parsed);
      if (existingHashes.has(hash)) {
        skipped += 1;
        return;
      }

      existingHashes.add(hash);
      transactions.push({
        ...parsed,
        hash,
        active: true
      });
    });

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
