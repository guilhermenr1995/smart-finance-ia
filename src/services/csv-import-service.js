import { detectCsvDelimiter, parseCsvLine, parseLocaleNumber, splitCsvLines, normalizeCsvHeader } from '../utils/csv-utils.js';
import {
  detectBaseCategory,
  generateTransactionDedupKey,
  generateTransactionHash,
  isIgnoredCreditEntry,
  isIncomeOrIgnoredStatement
} from '../utils/transaction-utils.js';

const DEFAULT_BANK_ACCOUNT = 'Padrão';

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

function normalizeHeaderCell(value) {
  return normalizeCsvHeader(String(value || ''))
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findHeaderIndex(normalizedHeaders, aliases = []) {
  const normalizedAliases = aliases.map((item) => normalizeHeaderCell(item)).filter(Boolean);
  if (!Array.isArray(normalizedHeaders) || normalizedAliases.length === 0) {
    return -1;
  }

  for (const alias of normalizedAliases) {
    const exactMatchIndex = normalizedHeaders.findIndex((header) => header === alias);
    if (exactMatchIndex !== -1) {
      return exactMatchIndex;
    }
  }

  for (const alias of normalizedAliases) {
    const partialMatchIndex = normalizedHeaders.findIndex((header) => header.includes(alias) || alias.includes(header));
    if (partialMatchIndex !== -1) {
      return partialMatchIndex;
    }
  }

  return -1;
}

function uniqueIndexes(indexes = [], columnsLength = 0) {
  return [...new Set(indexes)]
    .filter((index) => Number.isInteger(index))
    .filter((index) => index >= 0 && index < columnsLength);
}

function normalizeImportedDate(rawDate) {
  const value = String(rawDate || '').trim();
  if (!value) {
    return '';
  }

  const isoLike = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoLike) {
    const year = Number.parseInt(isoLike[1], 10);
    const month = Number.parseInt(isoLike[2], 10);
    const day = Number.parseInt(isoLike[3], 10);
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const brLike = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+.*)?$/);
  if (brLike) {
    const day = Number.parseInt(brLike[1], 10);
    const month = Number.parseInt(brLike[2], 10);
    const rawYear = Number.parseInt(brLike[3], 10);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const year = String(parsed.getFullYear()).padStart(4, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeSignalText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function normalizeForPdfMatching(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function normalizePdfDate(day, month, year) {
  const fullYear = year < 100 ? 2000 + year : year;
  return `${String(fullYear).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parsePdfDateToken(dateToken, inferredYear) {
  const fullDateMatch = String(dateToken || '').match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (fullDateMatch) {
    const day = Number.parseInt(fullDateMatch[1], 10);
    const month = Number.parseInt(fullDateMatch[2], 10);
    const year = Number.parseInt(fullDateMatch[3], 10);
    if (!Number.isNaN(day) && !Number.isNaN(month) && !Number.isNaN(year)) {
      return normalizePdfDate(day, month, year);
    }
  }

  const shortDateMatch = String(dateToken || '').match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (shortDateMatch) {
    const day = Number.parseInt(shortDateMatch[1], 10);
    const month = Number.parseInt(shortDateMatch[2], 10);
    const year = Number.isFinite(inferredYear) ? inferredYear : new Date().getFullYear();
    if (!Number.isNaN(day) && !Number.isNaN(month)) {
      return normalizePdfDate(day, month, year);
    }
  }

  return '';
}

function extractPdfAmountTokens(line) {
  const decimalCommaTokens = String(line || '').match(/(?:R\$\s*)?[-+]?\d{1,3}(?:\.\d{3})*,\d{2}-?/g) || [];
  if (decimalCommaTokens.length > 0) {
    return decimalCommaTokens;
  }

  return String(line || '').match(/(?:R\$\s*)?[-+]?\d+\.\d{2}-?/g) || [];
}

export class CsvImportService {
  constructor(config = {}) {
    this.minimumColumns = 3;
    this.pdfWorkerUrl =
      config.pdfWorkerUrl || 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    this.pdfLib = config.pdfLib || null;
  }

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

  getPdfLib() {
    const pdfLib = this.pdfLib || globalThis.pdfjsLib || null;
    if (!pdfLib || typeof pdfLib.getDocument !== 'function') {
      throw new Error(
        'Importação de PDF indisponível no momento. Recarregue a página e tente novamente.'
      );
    }

    if (pdfLib.GlobalWorkerOptions) {
      pdfLib.GlobalWorkerOptions.workerSrc = this.pdfWorkerUrl;
    }

    return pdfLib;
  }

  async parsePdfContent(fileContent, fileName, accountType, existingHashes = new Set()) {
    const pdfLib = this.getPdfLib();
    const binaryData =
      fileContent instanceof ArrayBuffer
        ? new Uint8Array(fileContent)
        : new Uint8Array(await new Blob([fileContent]).arrayBuffer());
    const loadingTask = pdfLib.getDocument({ data: binaryData });
    const pdfDocument = await loadingTask.promise;

    const allLines = [];
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageLines = this.extractLinesFromPdfItems(textContent.items || []);
      allLines.push(...pageLines);
    }

    const inferredYear = this.resolvePdfYear(fileName, allLines);
    const transactions = [];
    let skipped = 0;
    let skippedInvalidRows = 0;
    let skippedIgnoredRows = 0;
    let skippedDuplicateRows = 0;

    for (let lineIndex = 0; lineIndex < allLines.length; lineIndex += 1) {
      const currentLine = allLines[lineIndex];
      let candidate = this.parsePdfLineToTransaction(currentLine, inferredYear, accountType);

      if (!candidate && lineIndex + 1 < allLines.length) {
        const mergedLine = `${currentLine} ${allLines[lineIndex + 1]}`;
        candidate = this.parsePdfLineToTransaction(mergedLine, inferredYear, accountType);
        if (candidate) {
          lineIndex += 1;
        }
      }

      if (!candidate) {
        skipped += 1;
        skippedInvalidRows += 1;
        continue;
      }

      const shouldIgnore =
        accountType === 'Crédito'
          ? isIgnoredCreditEntry(candidate.signedValue, candidate.title)
          : isIncomeOrIgnoredStatement(candidate.signedValue, candidate.title);

      if (shouldIgnore) {
        skipped += 1;
        skippedIgnoredRows += 1;
        continue;
      }

      const parsed = {
        date: candidate.date,
        title: candidate.title,
        value: Math.abs(candidate.signedValue),
        category: detectBaseCategory(candidate.title),
        accountType,
        bankAccount: DEFAULT_BANK_ACCOUNT
      };

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
        sourceType: 'pdf',
        totalRows: allLines.length,
        importedRows: transactions.length,
        skippedRows: skipped,
        skippedInvalidRows,
        skippedIgnoredRows,
        skippedDuplicateRows
      }
    };
  }

  extractLinesFromPdfItems(items) {
    const linesByY = new Map();

    items.forEach((item) => {
      const text = String(item?.str || '').trim();
      if (!text) {
        return;
      }

      const x = Number(item?.transform?.[4] || 0);
      const y = Math.round(Number(item?.transform?.[5] || 0));
      if (!linesByY.has(y)) {
        linesByY.set(y, []);
      }
      linesByY.get(y).push({ x, text });
    });

    return [...linesByY.entries()]
      .sort((left, right) => right[0] - left[0])
      .map(([, lineItems]) =>
        lineItems
          .sort((left, right) => left.x - right.x)
          .map((item) => item.text)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
      )
      .filter(Boolean);
  }

  resolvePdfYear(fileName, lines) {
    const nameYearMatch = String(fileName || '').match(/(20\d{2})/);
    if (nameYearMatch) {
      return Number.parseInt(nameYearMatch[1], 10);
    }

    for (const line of lines) {
      const lineYearMatch = String(line || '').match(/\b(20\d{2})\b/);
      if (lineYearMatch) {
        return Number.parseInt(lineYearMatch[1], 10);
      }
    }

    return new Date().getFullYear();
  }

  parsePdfLineToTransaction(line, inferredYear, accountType) {
    const normalizedLine = String(line || '').replace(/\s+/g, ' ').trim();
    if (normalizedLine.length < 8) {
      return null;
    }

    const blockedHeaders = /\b(DATA|DESCRICAO|DESCRIÇÃO|SALDO|LANCAMENTO|LANÇAMENTO|HISTORICO|HISTÓRICO|EXTRATO)\b/i;
    if (blockedHeaders.test(normalizedLine) && !/\d{1,2}[/-]\d{1,2}/.test(normalizedLine)) {
      return null;
    }

    const dateTokenMatch = normalizedLine.match(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/);
    if (!dateTokenMatch) {
      return null;
    }

    const amountTokens = extractPdfAmountTokens(normalizedLine);
    if (amountTokens.length === 0) {
      return null;
    }

    const hasBalanceMarker = /\b(SALDO|DISPONIVEL|DISPONIBILIDADE|LIMITE)\b/i.test(normalizedLine);
    let amountToken = amountTokens[0];
    if (hasBalanceMarker && amountTokens.length >= 2) {
      amountToken = amountTokens[amountTokens.length - 2];
    } else if (amountTokens.length >= 2) {
      amountToken = amountTokens[0];
    }
    const parsedAmount = parseOfxAmount(amountToken);
    if (Number.isNaN(parsedAmount)) {
      return null;
    }

    let signedValue = parsedAmount;
    const normalizedForSignal = normalizeForPdfMatching(normalizedLine);

    if (/^-/.test(amountToken) || /-$/.test(amountToken)) {
      signedValue = -Math.abs(parsedAmount);
    }

    if (/\bD\b|\bDEBITO\b/.test(normalizedForSignal)) {
      signedValue = -Math.abs(parsedAmount);
    } else if (/\bC\b|\bCREDITO\b/.test(normalizedForSignal) && !/^-/.test(amountToken) && !/-$/.test(amountToken)) {
      signedValue = Math.abs(parsedAmount);
    }

    if (
      accountType !== 'Crédito' &&
      /\b(PIX ENVIAD|TRANSFERENCIA ENVIAD|COMPRA|PAGAMENTO|DEBITO|TED ENVIAD|DOC ENVIAD|SAQUE|TARIFA|IOF|JUROS|ENCARGO|BOLETO)\b/.test(
        normalizedForSignal
      )
    ) {
      signedValue = -Math.abs(parsedAmount);
    }

    const date = parsePdfDateToken(dateTokenMatch[0], inferredYear);
    if (!date) {
      return null;
    }

    let title = normalizedLine
      .replace(dateTokenMatch[0], ' ')
      .replace(/(?:R\$\s*)?[-+]?\d{1,3}(?:\.\d{3})*,\d{2}-?/g, ' ')
      .replace(/(?:R\$\s*)?[-+]?\d+\.\d{2}-?/g, ' ')
      .replace(/\b[CD]\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    title = title.replace(/^[-:]+/, '').trim();
    if (!title || /\b(SALDO ANTERIOR|SALDO FINAL|SALDO DO DIA)\b/i.test(title)) {
      return null;
    }

    return {
      date,
      title,
      signedValue
    };
  }

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
