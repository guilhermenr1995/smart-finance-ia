import { parseCsvLine, parseLocaleNumber, splitCsvLines, normalizeCsvHeader } from '../utils/csv-utils.js';
import {
  detectBaseCategory,
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
        accountType,
        bankAccount: DEFAULT_BANK_ACCOUNT
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
        continue;
      }

      const shouldIgnore =
        accountType === 'Crédito'
          ? isIgnoredCreditEntry(candidate.signedValue, candidate.title)
          : isIncomeOrIgnoredStatement(candidate.signedValue, candidate.title);

      if (shouldIgnore) {
        skipped += 1;
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
      accountType,
      bankAccount: DEFAULT_BANK_ACCOUNT
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
      accountType,
      bankAccount: DEFAULT_BANK_ACCOUNT
    };
  }
}
