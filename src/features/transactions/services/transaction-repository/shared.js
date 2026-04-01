import { generateTransactionDedupKey, generateTransactionHash } from '../../../../utils/transaction-utils.js';
import { buildGoalDocId, getMonthBounds, normalizeMonthlyGoalRecord } from '../../../../utils/goal-utils.js';

const DEFAULT_BANK_ACCOUNT = 'Padrão';
const APP_TIMEZONE = 'America/Sao_Paulo';

function getDateKeyInTimezone() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function normalizeBankAccountName(value) {
  const name = String(value || '').trim();
  return name || DEFAULT_BANK_ACCOUNT;
}

function normalizeTransactionMetadata(data = {}) {
  const categorySource = String(data.categorySource || '').trim() || 'manual';
  const createdAt = String(data.createdAt || '').trim();
  const lastCategoryUpdateAt = String(data.lastCategoryUpdateAt || '').trim() || createdAt;
  return {
    categorySource,
    categoryAutoAssigned: Boolean(data.categoryAutoAssigned),
    categoryManuallyEdited: Boolean(data.categoryManuallyEdited),
    createdBy: data.createdBy === 'manual' ? 'manual' : 'import',
    createdAt,
    lastCategoryUpdateAt
  };
}

function normalizeStoredTransaction(transaction = {}) {
  const normalized = {
    ...transaction,
    ...normalizeTransactionMetadata(transaction),
    bankAccount: normalizeBankAccountName(transaction.bankAccount)
  };

  const hash = String(normalized.hash || '').trim();
  const dedupKey = String(normalized.dedupKey || '').trim();

  if (!hash) {
    normalized.hash = generateTransactionHash(normalized);
  }

  if (!dedupKey) {
    normalized.dedupKey = generateTransactionDedupKey(normalized);
  }

  return normalized;
}

function normalizeCustomCollectionName(value, prefix = 'item') {
  const normalizedName = String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return normalizedName || `${prefix}-${Date.now()}`;
}


export {
  APP_TIMEZONE,
  DEFAULT_BANK_ACCOUNT,
  buildGoalDocId,
  generateTransactionDedupKey,
  generateTransactionHash,
  getDateKeyInTimezone,
  getMonthBounds,
  normalizeBankAccountName,
  normalizeCustomCollectionName,
  normalizeMonthlyGoalRecord,
  normalizeStoredTransaction,
  normalizeTransactionMetadata
};
