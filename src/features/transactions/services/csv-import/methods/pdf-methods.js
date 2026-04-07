import {
  DEFAULT_BANK_ACCOUNT,
  deduplicateImportedTransactions,
  detectBaseCategory,
  detectCsvDelimiter,
  extractOfxTagValue,
  extractPdfAmountTokens,
  findHeaderIndex,
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

class CsvImportServicePdfMethods {
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
    const parsedCandidates = [];
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

      parsedCandidates.push({
        ...parsed,
        originalIndex: lineIndex
      });
    }

    const dedupResult = deduplicateImportedTransactions(parsedCandidates, existingHashes);
    const transactions = dedupResult.transactions;
    skipped += dedupResult.skippedDuplicateRows;
    skippedDuplicateRows += dedupResult.skippedDuplicateRows;

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

}

export function registerPdfMethods(CsvImportService) {
  applyClassMethods(CsvImportService, CsvImportServicePdfMethods);
}
