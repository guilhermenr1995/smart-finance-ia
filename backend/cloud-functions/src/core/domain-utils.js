const {
  DEFAULT_BANK_ACCOUNT,
  getDateKeyInTimezone
} = require('./base');

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toCurrency(value) {
  return Number(toFiniteNumber(value).toFixed(2));
}

function toPercent(value) {
  return Number(toFiniteNumber(value).toFixed(2));
}

function sanitizeString(value, maxLength = 200) {
  return String(value || '').trim().slice(0, maxLength);
}

function sanitizeProviderIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => sanitizeString(item, 120))
    .filter(Boolean)
    .slice(0, 8);
}

function buildResetUserProfilePayload(userId, existingData = {}) {
  const nowIso = new Date().toISOString();
  const dateKey = getDateKeyInTimezone();

  return {
    uid: sanitizeString(existingData.uid || userId, 150),
    email: sanitizeString(existingData.email, 200),
    displayName: sanitizeString(existingData.displayName, 140),
    photoURL: sanitizeString(existingData.photoURL, 500),
    providerIds: sanitizeProviderIds(existingData.providerIds),
    createdAt: sanitizeString(existingData.createdAt, 50) || nowIso,
    lastAccessAt: sanitizeString(existingData.lastAccessAt, 50) || nowIso,
    createdDateKey: sanitizeString(existingData.createdDateKey, 10) || dateKey,
    lastAccessDateKey: sanitizeString(existingData.lastAccessDateKey, 10) || dateKey,
    importOperationsTotal: 0,
    importedTransactionsTotal: 0,
    manualTransactionsTotal: 0,
    aiCategorizationRunsTotal: 0,
    aiConsultantRunsTotal: 0
  };
}

function normalizeCategoryKey(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeTransactionTitleKey(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bparcela(?:s)?\b/g, ' ')
    .replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTransactionDateKey(value) {
  const raw = String(value || '').trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }

  const year = String(parsed.getFullYear()).padStart(4, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildTransactionDedupKey(transaction = {}) {
  const dateKey = normalizeTransactionDateKey(transaction.date);
  const titleKey = normalizeTransactionTitleKey(transaction.title);
  const numericValue = Math.abs(toFiniteNumber(transaction.value));
  const valueKey = numericValue.toFixed(2);
  return `${dateKey}|${titleKey}|${valueKey}`;
}

function buildTransactionHash(transaction = {}) {
  const payload = `${String(transaction.date || '').trim()}_${String(transaction.title || '').trim()}_${Math.abs(
    toFiniteNumber(transaction.value)
  ).toFixed(2)}_${String(transaction.accountType || '').trim()}`;
  return Buffer.from(payload, 'utf8').toString('base64');
}

function isCategoryDefined(category) {
  const normalized = String(category || '').trim().toLowerCase();
  return normalized.length > 0 && normalized !== 'outros';
}

function getTransactionQualityScore(transaction = {}) {
  let score = 0;

  if (isCategoryDefined(transaction.category)) {
    score += 100;
  }

  if (Boolean(transaction.categoryManuallyEdited)) {
    score += 40;
  }

  if (Boolean(transaction.categoryAutoAssigned)) {
    score += 20;
  }

  if (transaction.active !== false) {
    score += 10;
  }

  if (String(transaction.createdBy || '').trim().toLowerCase() === 'manual') {
    score += 6;
  }

  const normalizedBankAccount = String(transaction.bankAccount || '').trim().toLowerCase();
  if (normalizedBankAccount && normalizedBankAccount !== DEFAULT_BANK_ACCOUNT.toLowerCase()) {
    score += 3;
  }

  return score;
}

function sortByPriorityWithTimestamp(docs = []) {
  return [...docs].sort((left, right) => {
    const rightScore = getTransactionQualityScore(right.data);
    const leftScore = getTransactionQualityScore(left.data);
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    const leftUpdated = String(left.data.lastCategoryUpdateAt || left.data.createdAt || '');
    const rightUpdated = String(right.data.lastCategoryUpdateAt || right.data.createdAt || '');
    return rightUpdated.localeCompare(leftUpdated);
  });
}

function selectPreferredBankAccount(docs = []) {
  const preferred = docs.find((doc) => {
    const normalized = String(doc.data.bankAccount || '').trim();
    return normalized && normalized.toLowerCase() !== DEFAULT_BANK_ACCOUNT.toLowerCase();
  });

  if (preferred) {
    return String(preferred.data.bankAccount || '').trim();
  }

  const fallback = String(docs[0]?.data?.bankAccount || '').trim();
  return fallback || DEFAULT_BANK_ACCOUNT;
}

function mergeDuplicateTransactionGroup(keeperDoc, groupDocs = []) {
  const ordered = sortByPriorityWithTimestamp(groupDocs);
  const bestCategoryDoc =
    ordered.find((doc) => isCategoryDefined(doc.data.category)) ||
    ordered.find((doc) => String(doc.data.category || '').trim().length > 0) ||
    ordered[0];

  const allCategorySources = ordered
    .map((doc) => String(doc.data.categorySource || '').trim())
    .filter(Boolean);
  const mergedCategorySource =
    String(bestCategoryDoc?.data?.categorySource || '').trim() || allCategorySources[0] || 'manual';

  const mergedCategory = String(bestCategoryDoc?.data?.category || '').trim() || 'Outros';
  const hasAnyAutoAssigned = ordered.some((doc) => Boolean(doc.data.categoryAutoAssigned));
  const hasAnyManuallyEdited = ordered.some((doc) => Boolean(doc.data.categoryManuallyEdited));
  const hasAnyActive = ordered.some((doc) => doc.data.active !== false);
  const latestCategoryUpdateAt = ordered
    .map((doc) => String(doc.data.lastCategoryUpdateAt || '').trim())
    .filter(Boolean)
    .sort((left, right) => right.localeCompare(left))[0];
  const earliestCreatedAt = ordered
    .map((doc) => String(doc.data.createdAt || '').trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))[0];

  const merged = {
    ...keeperDoc.data,
    category: mergedCategory,
    categorySource: mergedCategorySource,
    categoryAutoAssigned: hasAnyAutoAssigned,
    categoryManuallyEdited: hasAnyManuallyEdited,
    active: hasAnyActive,
    bankAccount: selectPreferredBankAccount(ordered)
  };

  if (latestCategoryUpdateAt) {
    merged.lastCategoryUpdateAt = latestCategoryUpdateAt;
  }

  if (earliestCreatedAt) {
    merged.createdAt = earliestCreatedAt;
  }

  merged.hash = buildTransactionHash(merged);
  merged.dedupKey = buildTransactionDedupKey(merged);

  return merged;
}

function shouldUpdateKeeper(currentData = {}, mergedData = {}) {
  const fieldsToCompare = [
    'category',
    'categorySource',
    'categoryAutoAssigned',
    'categoryManuallyEdited',
    'active',
    'bankAccount',
    'createdAt',
    'lastCategoryUpdateAt',
    'hash',
    'dedupKey'
  ];

  return fieldsToCompare.some((field) => {
    const currentValue = currentData[field];
    const mergedValue = mergedData[field];
    return JSON.stringify(currentValue) !== JSON.stringify(mergedValue);
  });
}


module.exports = {
  toFiniteNumber,
  toCurrency,
  toPercent,
  sanitizeString,
  sanitizeProviderIds,
  buildResetUserProfilePayload,
  normalizeCategoryKey,
  normalizeTransactionTitleKey,
  normalizeTransactionDateKey,
  buildTransactionDedupKey,
  buildTransactionHash,
  isCategoryDefined,
  getTransactionQualityScore,
  sortByPriorityWithTimestamp,
  selectPreferredBankAccount,
  mergeDuplicateTransactionGroup,
  shouldUpdateKeeper
};
