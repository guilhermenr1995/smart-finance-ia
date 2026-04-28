const {
  db,
  OPEN_FINANCE_REAL_PROVIDERS,
  OPEN_FINANCE_PROVIDER,
  OPEN_FINANCE_UPSTREAM_URL,
  OPEN_FINANCE_UPSTREAM_API_KEY,
  DEFAULT_BANK_ACCOUNT
} = require('./base');
const {
  toFiniteNumber,
  toCurrency,
  sanitizeString,
  normalizeTransactionDateKey,
  buildTransactionHash,
  buildTransactionDedupKey
} = require('./domain-utils');
const {
  requestEmbeddedOpenFinanceUpstream
} = require('../open-finance/embedded-provider');
const {
  hasPluggyDirectCredentials,
  requestPluggyOpenFinance
} = require('../open-finance/pluggy-provider');

function getOpenFinanceConnectionsCollection(appId, userId) {
  return db.collection(`artifacts/${appId}/users/${userId}/open_finance_conexoes`);
}

function getTransactionsCollection(appId, userId) {
  return db.collection(`artifacts/${appId}/users/${userId}/transacoes`);
}

function normalizeBankCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
}

function addDaysToIso(days) {
  const target = new Date();
  target.setDate(target.getDate() + Number(days || 0));
  return target.toISOString();
}

function isOpenFinanceFallbackAllowed() {
  const value = String(process.env.OPEN_FINANCE_ALLOW_FALLBACK || 'true').trim().toLowerCase();
  return value !== 'false' && value !== '0' && value !== 'no';
}

function isPlaceholderUpstreamUrl(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return normalized.includes('your-open-finance-backend.example.com');
}

function isPluggyDirectModeEnabled() {
  const mode = String(process.env.OPEN_FINANCE_PLUGGY_DIRECT_MODE || 'auto').trim().toLowerCase();
  if (mode === 'false' || mode === '0' || mode === 'off' || mode === 'disabled') {
    return false;
  }

  if (mode === 'true' || mode === '1' || mode === 'on' || mode === 'enabled' || mode === 'force') {
    return true;
  }

  // auto mode: use direct adapter when there is no real upstream URL configured.
  return !OPEN_FINANCE_UPSTREAM_URL || isPlaceholderUpstreamUrl(OPEN_FINANCE_UPSTREAM_URL);
}

function shouldUseEmbeddedProviderByConfig() {
  if (!isOpenFinanceFallbackAllowed()) {
    return false;
  }

  return isPlaceholderUpstreamUrl(OPEN_FINANCE_UPSTREAM_URL);
}

function assertOpenFinanceProviderConfigured() {
  if (!OPEN_FINANCE_PROVIDER) {
    const error = new Error(
      'Integração Open Finance sem provider definido. Configure OPEN_FINANCE_PROVIDER com um agregador real (ex.: pluggy).'
    );
    error.statusCode = 503;
    throw error;
  }

  if (OPEN_FINANCE_PROVIDER === 'mock' || OPEN_FINANCE_PROVIDER === 'disabled') {
    const error = new Error(
      'Provider de Open Finance inválido para produção. Defina OPEN_FINANCE_PROVIDER com um agregador real.'
    );
    error.statusCode = 503;
    throw error;
  }

  if (!OPEN_FINANCE_REAL_PROVIDERS.has(OPEN_FINANCE_PROVIDER)) {
    const error = new Error(
      `Provider de Open Finance não suportado: "${OPEN_FINANCE_PROVIDER}". Use um agregador real suportado (${[...OPEN_FINANCE_REAL_PROVIDERS].join(', ')}).`
    );
    error.statusCode = 503;
    throw error;
  }

  if (
    OPEN_FINANCE_PROVIDER === 'pluggy' &&
    isPluggyDirectModeEnabled() &&
    hasPluggyDirectCredentials()
  ) {
    return;
  }

  if (!OPEN_FINANCE_UPSTREAM_URL && !isOpenFinanceFallbackAllowed()) {
    const error = new Error(
      'Integração Open Finance real não configurada no backend. Defina OPEN_FINANCE_UPSTREAM_URL e OPEN_FINANCE_PROVIDER no ambiente das functions, ou habilite OPEN_FINANCE_ALLOW_FALLBACK.'
    );
    error.statusCode = 503;
    throw error;
  }

  if (isPlaceholderUpstreamUrl(OPEN_FINANCE_UPSTREAM_URL) && !isOpenFinanceFallbackAllowed()) {
    const error = new Error(
      'OPEN_FINANCE_UPSTREAM_URL ainda está com valor placeholder e o fallback está desabilitado.'
    );
    error.statusCode = 503;
    throw error;
  }
}

async function requestOpenFinanceUpstream(action, payload = {}, context = {}) {
  if (
    OPEN_FINANCE_PROVIDER === 'pluggy' &&
    isPluggyDirectModeEnabled() &&
    hasPluggyDirectCredentials()
  ) {
    return requestPluggyOpenFinance(action, payload, context);
  }

  assertOpenFinanceProviderConfigured();

  if (shouldUseEmbeddedProviderByConfig()) {
    return requestEmbeddedOpenFinanceUpstream(action, payload, context, {
      provider: OPEN_FINANCE_PROVIDER,
      reason: 'upstream-placeholder'
    });
  }

  let response;
  try {
    response = await fetch(OPEN_FINANCE_UPSTREAM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(OPEN_FINANCE_UPSTREAM_API_KEY ? { 'x-api-key': OPEN_FINANCE_UPSTREAM_API_KEY } : {})
      },
      body: JSON.stringify({
        provider: OPEN_FINANCE_PROVIDER,
        action,
        ...payload,
        context
      })
    });
  } catch (error) {
    if (isOpenFinanceFallbackAllowed()) {
      return requestEmbeddedOpenFinanceUpstream(action, payload, context, {
        provider: OPEN_FINANCE_PROVIDER,
        reason: 'upstream-fetch-failed'
      });
    }

    const wrappedError = new Error(
      `Falha de conectividade com o agregador Open Finance: ${error?.message || 'erro de rede'}`
    );
    wrappedError.statusCode = 502;
    throw wrappedError;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status >= 500 && isOpenFinanceFallbackAllowed()) {
      return requestEmbeddedOpenFinanceUpstream(action, payload, context, {
        provider: OPEN_FINANCE_PROVIDER,
        reason: `upstream-http-${response.status}`
      });
    }

    const message = String(data?.message || data?.error || `Falha no agregador Open Finance (${response.status})`).trim();
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  return data;
}

function chunkArray(values = [], chunkSize = 10) {
  const chunks = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

function resolveProviderConnectionId(connection = {}, fallback = '') {
  return sanitizeString(connection.providerConnectionId || fallback, 140);
}

function sanitizeOpenFinanceTransaction(raw = {}, context = {}) {
  const nowIso = new Date().toISOString();
  const accountType = String(raw.accountType || 'Conta').trim() === 'Crédito' ? 'Crédito' : 'Conta';
  const value = Math.abs(toCurrency(raw.value));

  const payload = {
    date: normalizeTransactionDateKey(raw.date || nowIso.slice(0, 10)),
    title: sanitizeString(raw.title || `Transação ${context.bankName || 'Open Finance'}`, 200),
    value,
    category: sanitizeString(raw.category || 'Outros', 50) || 'Outros',
    accountType,
    bankAccount: sanitizeString(context.bankName || DEFAULT_BANK_ACCOUNT, 60) || DEFAULT_BANK_ACCOUNT,
    active: true,
    createdBy: 'import',
    createdAt: nowIso,
    categorySource: 'open-finance',
    categoryAutoAssigned: false,
    categoryManuallyEdited: false,
    lastCategoryUpdateAt: nowIso
  };

  payload.hash = buildTransactionHash(payload);
  payload.dedupKey = buildTransactionDedupKey(payload);
  return payload;
}

async function resolveExistingKeys(collectionRef, keys = [], fieldName) {
  const keySet = new Set();
  const nonEmpty = [...new Set(keys.map((item) => String(item || '').trim()).filter(Boolean))];
  if (nonEmpty.length === 0) {
    return keySet;
  }

  const chunks = chunkArray(nonEmpty, 10);
  for (const chunk of chunks) {
    const snapshot = await collectionRef.where(fieldName, 'in', chunk).get();
    snapshot.forEach((doc) => {
      const value = String(doc.data()?.[fieldName] || '').trim();
      if (value) {
        keySet.add(value);
      }
    });
  }

  return keySet;
}

async function persistOpenFinanceTransactions(appId, userId, rawTransactions = [], connection = {}) {
  const collectionRef = getTransactionsCollection(appId, userId);
  const sanitized = rawTransactions
    .map((transaction) => sanitizeOpenFinanceTransaction(transaction, connection))
    .filter((transaction) => transaction.title && transaction.value > 0 && /^\d{4}-\d{2}-\d{2}$/.test(transaction.date));

  if (sanitized.length === 0) {
    return {
      insertedCount: 0,
      skippedCount: 0,
      insertedTransactions: []
    };
  }

  const existingDedupKeys = await resolveExistingKeys(
    collectionRef,
    sanitized.map((item) => item.dedupKey),
    'dedupKey'
  );
  const existingHashes = await resolveExistingKeys(
    collectionRef,
    sanitized.map((item) => item.hash),
    'hash'
  );

  const toInsert = sanitized.filter(
    (item) => !existingDedupKeys.has(item.dedupKey) && !existingHashes.has(item.hash)
  );

  if (toInsert.length === 0) {
    return {
      insertedCount: 0,
      skippedCount: sanitized.length,
      insertedTransactions: []
    };
  }

  const insertedTransactions = [];
  const batch = db.batch();
  toInsert.forEach((transaction) => {
    const docRef = collectionRef.doc();
    batch.set(docRef, transaction);
    insertedTransactions.push({
      ...transaction,
      docId: docRef.id
    });
  });
  await batch.commit();

  return {
    insertedCount: insertedTransactions.length,
    skippedCount: sanitized.length - insertedTransactions.length,
    insertedTransactions
  };
}

async function listOpenFinanceConnections(appId, userId) {
  const snapshot = await getOpenFinanceConnectionsCollection(appId, userId).get();
  const items = [];
  snapshot.forEach((doc) => {
    const data = doc.data() || {};
    items.push({
      id: doc.id,
      bankCode: String(data.bankCode || '').trim(),
      bankName: String(data.bankName || '').trim(),
      provider: String(data.provider || OPEN_FINANCE_PROVIDER || 'unknown').trim(),
      status: String(data.status || 'unknown').trim(),
      consentExpiresAt: String(data.consentExpiresAt || '').trim(),
      lastSyncAt: String(data.lastSyncAt || '').trim(),
      lastSyncInserted: Math.max(0, Math.round(toFiniteNumber(data.lastSyncInserted))),
      errorMessage: String(data.errorMessage || '').trim(),
      createdAt: String(data.createdAt || '').trim(),
      updatedAt: String(data.updatedAt || '').trim()
    });
  });

  return items.sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
}

module.exports = {
  getOpenFinanceConnectionsCollection,
  getTransactionsCollection,
  normalizeBankCode,
  addDaysToIso,
  assertOpenFinanceProviderConfigured,
  requestOpenFinanceUpstream,
  chunkArray,
  resolveProviderConnectionId,
  sanitizeOpenFinanceTransaction,
  resolveExistingKeys,
  persistOpenFinanceTransactions,
  listOpenFinanceConnections
};
