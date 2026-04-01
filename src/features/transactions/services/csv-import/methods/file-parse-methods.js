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

class CsvImportServiceFileParseMethods {
  async parseFileContent(fileName, fileContent, accountType, existingHashes = new Set()) {
    const normalizedName = String(fileName || '').toLowerCase();
    const isPdf = normalizedName.endsWith('.pdf');
    if (isPdf) {
      return this.parsePdfContent(fileContent, fileName, accountType, existingHashes);
    }

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
        skipped: 0,
        diagnostics: {
          sourceType: 'csv',
          delimiter: ',',
          totalRows: 0,
          importedRows: 0,
          skippedRows: 0,
          skippedInvalidRows: 0,
          skippedIgnoredRows: 0,
          skippedDuplicateRows: 0
        }
      };
    }

    const delimiter = detectCsvDelimiter(lines);
    const headerColumns = parseCsvLine(lines[0], delimiter).map((cell) => cell.replace(/^"|"$/g, '').trim());
    const header = normalizeCsvHeader(headerColumns.join(' '));
    const forceCheckingByAccountType = String(accountType || '').trim() !== 'Crédito';
    const isCheckingAccountStatement =
      forceCheckingByAccountType ||
      header.includes('identificador') ||
      /\b(saldo|debito|débito|credito|crédito|conta corrente|movimentacao|movimentação)\b/i.test(header);
    const csvLayout = this.resolveCsvLayout(headerColumns, isCheckingAccountStatement);
    const transactions = [];
    let skipped = 0;
    let skippedInvalidRows = 0;
    let skippedIgnoredRows = 0;
    let skippedDuplicateRows = 0;

    for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
      const columns = parseCsvLine(lines[lineIndex], delimiter).map((cell) => cell.replace(/^"|"$/g, '').trim());
      if (columns.length < this.minimumColumns) {
        skipped += 1;
        skippedInvalidRows += 1;
        continue;
      }

      const parsed = isCheckingAccountStatement
        ? this.parseCheckingAccountLine(columns, accountType, csvLayout)
        : this.parseCreditCardLine(columns, accountType, csvLayout);

      if (!parsed) {
        skipped += 1;
        const candidateValue = isCheckingAccountStatement
          ? this.resolveValueFromColumns(columns, [csvLayout.valueIndex, 1, 2, 3])
          : this.resolveValueFromColumns(columns, [csvLayout.valueIndex, 2, 3, 1]);
        const candidateTitle = isCheckingAccountStatement
          ? this.resolveTextFromColumns(columns, [csvLayout.titleIndex, 3, 2, 1], '')
          : this.resolveTextFromColumns(columns, [csvLayout.titleIndex, 1, 2], '');
        const ignoredByBusinessRule = isCheckingAccountStatement
          ? !Number.isNaN(candidateValue) && isIncomeOrIgnoredStatement(candidateValue, candidateTitle)
          : !Number.isNaN(candidateValue) && isIgnoredCreditEntry(candidateValue, candidateTitle);

        if (ignoredByBusinessRule) {
          skippedIgnoredRows += 1;
        } else {
          skippedInvalidRows += 1;
        }
        continue;
      }

      const hash = generateTransactionHash(parsed);
      const dedupKey = generateTransactionDedupKey(parsed);
      if (existingHashes.has(hash) || existingHashes.has(dedupKey)) {
        skipped += 1;
        skippedDuplicateRows += 1;
        continue;
      }

      existingHashes.add(hash);
      existingHashes.add(dedupKey);
      transactions.push({
        ...parsed,
        dedupKey,
        hash,
        active: true
      });
    }

    return {
      transactions,
      skipped,
      diagnostics: {
        sourceType: 'csv',
        delimiter,
        fieldMapping: {
          dateIndex: csvLayout.dateIndex,
          titleIndex: csvLayout.titleIndex,
          valueIndex: csvLayout.valueIndex,
          identifierIndex: csvLayout.identifierIndex,
          typeIndex: csvLayout.typeIndex,
          debitIndex: csvLayout.debitIndex,
          creditIndex: csvLayout.creditIndex,
          parseMode: isCheckingAccountStatement ? 'checking' : 'credit'
        },
        totalRows: Math.max(0, lines.length - 1),
        importedRows: transactions.length,
        skippedRows: skipped,
        skippedInvalidRows,
        skippedIgnoredRows,
        skippedDuplicateRows
      }
    };
  }

  parseOfxContent(ofxText, accountType, existingHashes = new Set()) {
    const blocks = String(ofxText || '').match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
    if (blocks.length === 0) {
      return {
        transactions: [],
        skipped: 0,
        diagnostics: {
          sourceType: 'ofx',
          totalRows: 0,
          importedRows: 0,
          skippedRows: 0,
          skippedInvalidRows: 0,
          skippedIgnoredRows: 0,
          skippedDuplicateRows: 0
        }
      };
    }

    const transactions = [];
    let skipped = 0;
    let skippedInvalidRows = 0;
    let skippedIgnoredRows = 0;
    let skippedDuplicateRows = 0;

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
        skippedInvalidRows += 1;
        return;
      }

      const shouldIgnore =
        accountType === 'Crédito' ? isIgnoredCreditEntry(value, title) : isIncomeOrIgnoredStatement(value, title);

      if (shouldIgnore) {
        skipped += 1;
        skippedIgnoredRows += 1;
        return;
      }

      const parsed = {
        date,
        title,
        value: Math.abs(value),
        category: detectBaseCategory(title),
        accountType,
        bankAccount: DEFAULT_BANK_ACCOUNT
      };

      const hash = generateTransactionHash(parsed);
      const dedupKey = generateTransactionDedupKey(parsed);
      if (existingHashes.has(hash) || existingHashes.has(dedupKey)) {
        skipped += 1;
        skippedDuplicateRows += 1;
        return;
      }

      existingHashes.add(hash);
      existingHashes.add(dedupKey);
      transactions.push({
        ...parsed,
        dedupKey,
        hash,
        active: true
      });
    });

    return {
      transactions,
      skipped,
      diagnostics: {
        sourceType: 'ofx',
        totalRows: blocks.length,
        importedRows: transactions.length,
        skippedRows: skipped,
        skippedInvalidRows,
        skippedIgnoredRows,
        skippedDuplicateRows
      }
    };
  }

}

export function registerFileParseMethods(CsvImportService) {
  applyClassMethods(CsvImportService, CsvImportServiceFileParseMethods);
}
