import { parseDateFlexible } from './date-utils.js';

function normalizeTitleForMatching(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSearchAmount(rawValue) {
  const sanitized = String(rawValue || '')
    .replace(/[^\d,.-]/g, '')
    .trim();

  if (!sanitized) {
    return Number.NaN;
  }

  let normalized = sanitized;
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

export function matchesTransactionSearch(transaction, mode, term) {
  const searchTerm = String(term || '').trim();
  if (!searchTerm) {
    return true;
  }

  if (mode === 'value') {
    const expectedValue = parseSearchAmount(searchTerm);
    if (!Number.isFinite(expectedValue)) {
      return false;
    }

    return Math.abs(Number(transaction.value || 0) - expectedValue) <= 0.01;
  }

  if (mode === 'category') {
    const normalizedTerm = normalizeTitleForMatching(searchTerm);
    const normalizedCategory = normalizeTitleForMatching(transaction.category || '');
    const normalizedDisplayCategory = normalizeTitleForMatching(getDisplayCategory(transaction) || '');
    return normalizedCategory.includes(normalizedTerm) || normalizedDisplayCategory.includes(normalizedTerm);
  }

  const normalizedTerm = normalizeTitleForMatching(searchTerm);
  const normalizedTitle = normalizeTitleForMatching(transaction.title);
  return normalizedTitle.includes(normalizedTerm);
}

export function isTransferTransactionTitle(title) {
  return normalizeTitleForMatching(title).startsWith('TRANSFERENCIA');
}

export function getTransactionTitleMatchKey(title) {
  return normalizeTitleForMatching(title)
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function generateTransactionHash({ date, title, value, accountType }) {
  const payload = `${date}_${title}_${Number(value).toFixed(2)}_${accountType}`;
  return btoa(unescape(encodeURIComponent(payload)));
}

export function isIncomeOrIgnoredStatement(value, title) {
  const normalizedTitle = normalizeTitleForMatching(title);
  return value >= 0 || /\b(PAGAMENTO|RECEBIDO|DEPOSITO|ESTORNO|CREDITO)\b/.test(normalizedTitle);
}

export function isIgnoredCreditEntry(value, title) {
  const normalizedTitle = normalizeTitleForMatching(title);
  return value <= 0 || /\b(PAGAMENTO|ESTORNO)\b/.test(normalizedTitle);
}

export function detectBaseCategory(title) {
  const normalizedTitle = normalizeTitleForMatching(title);
  return normalizedTitle.includes('TRANSFERENCIA') || /\bTRANSFER\b/.test(normalizedTitle) || /\bPIX\b/.test(normalizedTitle)
    ? 'Transferência'
    : 'Outros';
}

export function getInstallmentInfo(title) {
  if (isTransferTransactionTitle(title)) {
    return null;
  }

  const rawTitle = String(title || '');
  const contextualMatch = rawTitle.match(/\bPARCELA(?:S)?\s*(\d{1,2})\s*\/\s*(\d{1,2})\b/i);
  const suffixMatch = rawTitle.match(/(?:^|[\s\-])(\d{1,2})\s*\/\s*(\d{1,2})\s*$/);
  const match = contextualMatch || suffixMatch;
  if (!match) {
    return null;
  }

  const current = Number.parseInt(match[1], 10);
  const total = Number.parseInt(match[2], 10);
  if (Number.isNaN(current) || Number.isNaN(total) || current < 1 || total < 2 || current > total || total > 72) {
    return null;
  }

  return {
    current,
    total
  };
}

export function getInstallmentGroupKey(title) {
  if (!getInstallmentInfo(title)) {
    return null;
  }

  const normalized = normalizeTitleForMatching(title)
    .replace(/\bPARCELA(?:S)?\b/g, ' ')
    .replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}\s*X\b/g, ' ')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || null;
}

export function getDisplayCategory(transaction) {
  const installment = getInstallmentInfo(transaction.title);
  if (installment && installment.current > 1) {
    return 'Parcelas';
  }

  return transaction.category;
}

export function sortTransactionsByDateDesc(transactions) {
  return [...transactions].sort((left, right) => parseDateFlexible(right.date) - parseDateFlexible(left.date));
}

export class TransactionQueryService {
  getVisibleTransactions(transactions, filters) {
    const { cycleStart, cycleEnd, accountType, category } = filters;

    return transactions.filter((transaction) => {
      const txDate = parseDateFlexible(transaction.date);
      const matchPeriod = txDate >= cycleStart && txDate <= cycleEnd;
      const matchAccount = accountType === 'all' || transaction.accountType === accountType;
      const displayCategory = getDisplayCategory(transaction);
      const matchCategory = category === 'all' || displayCategory === category;

      return matchPeriod && matchAccount && matchCategory;
    });
  }

  buildSummary(visibleTransactions) {
    const considered = visibleTransactions.filter((transaction) => transaction.active !== false);
    const ignored = visibleTransactions.filter((transaction) => transaction.active === false);

    const total = considered.reduce((sum, transaction) => sum + transaction.value, 0);
    const ignoredTotal = ignored.reduce((sum, transaction) => sum + transaction.value, 0);

    const categoryTotals = {};
    considered.forEach((transaction) => {
      const displayCategory = getDisplayCategory(transaction);
      categoryTotals[displayCategory] = (categoryTotals[displayCategory] || 0) + transaction.value;
    });

    const sortedCategories = Object.keys(categoryTotals).sort(
      (left, right) => categoryTotals[right] - categoryTotals[left]
    );

    return {
      considered,
      ignored,
      total,
      ignoredTotal,
      categoryTotals,
      sortedCategories
    };
  }

  getAiCandidates(visibleTransactions) {
    return visibleTransactions.filter((transaction) => transaction.active !== false && transaction.category === 'Outros');
  }
}
