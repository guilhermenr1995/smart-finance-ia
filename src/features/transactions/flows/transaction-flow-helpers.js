import {
  generateTransactionDedupKey,
  generateTransactionHash,
  getInstallmentGroupKey,
  getInstallmentInfo,
  getTransactionTitleMatchKey
} from '../../../utils/transaction-utils.js';

const DEFAULT_BANK_ACCOUNT = 'Padrão';

function normalizeBankAccountName(value) {
  const name = String(value || '').trim();
  return name || DEFAULT_BANK_ACCOUNT;
}

function parseManualAmount(value) {
  const sanitized = String(value || '')
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

function resolveManualTransactionDate(app) {
  const fallbackDate = new Date().toISOString().slice(0, 10);
  const filteredEndDate = String(app.state?.filters?.endDate || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(filteredEndDate) ? filteredEndDate : fallbackDate;
}

function buildPlatformCategorySource(rawSource) {
  const source = String(rawSource || 'memory').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return `platform-${source || 'memory'}`;
}

function buildManualCategoryMetadata(existingTransaction, nextCategory, updatedAt) {
  const previousCategory = String(existingTransaction?.category || '');
  const changedCategory = previousCategory !== String(nextCategory || '');
  const wasAutoAssigned = Boolean(existingTransaction?.categoryAutoAssigned);

  return {
    categorySource: 'manual',
    categoryAutoAssigned: wasAutoAssigned,
    categoryManuallyEdited: wasAutoAssigned ? Boolean(existingTransaction?.categoryManuallyEdited) || changedCategory : false,
    lastCategoryUpdateAt: updatedAt
  };
}


export {
  DEFAULT_BANK_ACCOUNT,
  buildManualCategoryMetadata,
  buildPlatformCategorySource,
  generateTransactionDedupKey,
  generateTransactionHash,
  getInstallmentGroupKey,
  getInstallmentInfo,
  getTransactionTitleMatchKey,
  normalizeBankAccountName,
  parseManualAmount,
  resolveManualTransactionDate
};
