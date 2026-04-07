import { detectCsvDelimiter, parseCsvLine, parseLocaleNumber, splitCsvLines, normalizeCsvHeader } from '../../../../utils/csv-utils.js';
import {
  detectBaseCategory,
  generateTransactionDedupKey,
  generateTransactionDedupKeyVariants,
  generateTransactionHash,
  isIgnoredCreditEntry,
  isIncomeOrIgnoredStatement
} from '../../../../utils/transaction-utils.js';

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

function getCandidateTransactionDateKey(candidate = {}) {
  return normalizeImportedDate(candidate?.date);
}

function deduplicateImportedTransactions(candidates = [], existingHashes = new Set()) {
  const orderedCandidates = [...(Array.isArray(candidates) ? candidates : [])].sort((left, right) => {
    const rightDate = getCandidateTransactionDateKey(right);
    const leftDate = getCandidateTransactionDateKey(left);
    if (rightDate !== leftDate) {
      return rightDate.localeCompare(leftDate);
    }

    const leftIndex = Number.isFinite(left?.originalIndex) ? left.originalIndex : 0;
    const rightIndex = Number.isFinite(right?.originalIndex) ? right.originalIndex : 0;
    return leftIndex - rightIndex;
  });

  const acceptedCandidates = [];
  let skippedDuplicateRows = 0;

  orderedCandidates.forEach((candidate) => {
    const parsed = { ...candidate };
    const originalIndex = Number.isFinite(parsed.originalIndex) ? parsed.originalIndex : 0;
    delete parsed.originalIndex;

    const hash = generateTransactionHash(parsed);
    const dedupKey = generateTransactionDedupKey(parsed);
    const dedupMatchKeys = generateTransactionDedupKeyVariants(parsed, {
      includeCurrentDay: true,
      includePreviousDay: true
    });

    const duplicateByHash = existingHashes.has(hash);
    const duplicateByDedup = dedupMatchKeys.some((key) => existingHashes.has(key));
    if (duplicateByHash || duplicateByDedup) {
      skippedDuplicateRows += 1;
      return;
    }

    existingHashes.add(hash);
    dedupMatchKeys.forEach((key) => existingHashes.add(key));

    acceptedCandidates.push({
      ...parsed,
      dedupKey,
      hash,
      active: true,
      originalIndex
    });
  });

  const transactions = acceptedCandidates
    .sort((left, right) => left.originalIndex - right.originalIndex)
    .map((candidate) => {
      const normalized = { ...candidate };
      delete normalized.originalIndex;
      return normalized;
    });

  return {
    transactions,
    skippedDuplicateRows
  };
}


export {
  DEFAULT_BANK_ACCOUNT,
  deduplicateImportedTransactions,
  detectBaseCategory,
  detectCsvDelimiter,
  extractOfxTagValue,
  extractPdfAmountTokens,
  findHeaderIndex,
  generateTransactionDedupKey,
  generateTransactionDedupKeyVariants,
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
};
