const crypto = require('crypto');
const { db, DEFAULT_BANK_ACCOUNT } = require('../core/base');
const {
  sanitizeString,
  toCurrency,
  normalizeTransactionDateKey,
  buildTransactionHash,
  toFiniteNumber
} = require('../core/domain-utils');
const {
  getSyncStartDateIso,
  sanitizeItemId,
  getItemById,
  updateItemById,
  listAccountsByItem,
  listTransactionsForAccount,
  listTransactionsByIds,
  listTransactionsByCreatedLink,
  listWebhooks,
  createWebhook,
  updateWebhook
} = require('./meu-pluggy-client');
const { sendOpenFinanceTransactionsPushNotification } = require('./meu-pluggy-push');

const MEU_PLUGGY_BANK_CODE = 'meu-pluggy';
const MEU_PLUGGY_BANK_NAME = 'Meu Pluggy';
const MEU_PLUGGY_PROVIDER = 'meu-pluggy';
const MEU_PLUGGY_CONSENT_URL = 'https://meu.pluggy.ai/connections';

const WEBHOOK_COLLECTION = 'open_finance_webhook_events';
const CLIENT_USER_PREFIX = 'smart-finance';
const WEBHOOK_SECRET = String(process.env.OPEN_FINANCE_MEU_PLUGGY_WEBHOOK_SECRET || '').trim();
const WEBHOOK_HEADER_NAME = String(
  process.env.OPEN_FINANCE_MEU_PLUGGY_WEBHOOK_HEADER_NAME || 'x-open-finance-webhook-secret'
)
  .trim()
  .toLowerCase();
const WEBHOOK_ENABLED = !['false', '0', 'no', 'off'].includes(
  String(process.env.OPEN_FINANCE_MEU_PLUGGY_WEBHOOK_ENABLED || 'true').trim().toLowerCase()
);
const WEBHOOK_ALLOW_UNSIGNED = ['true', '1', 'yes', 'on'].includes(
  String(process.env.OPEN_FINANCE_MEU_PLUGGY_WEBHOOK_ALLOW_UNSIGNED || 'false').trim().toLowerCase()
);
const WEBHOOK_AUTOCONFIG = !['false', '0', 'no', 'off'].includes(
  String(process.env.OPEN_FINANCE_MEU_PLUGGY_WEBHOOK_AUTOCONFIG || 'false').trim().toLowerCase()
);
const WEBHOOK_URL = String(process.env.OPEN_FINANCE_MEU_PLUGGY_WEBHOOK_URL || '').trim();

const WEBHOOK_EVENTS_TO_MANAGE = [
  'transactions/created',
  'transactions/updated',
  'transactions/deleted',
  'item/updated',
  'item/created',
  'item/login_succeeded',
  'item/error',
  'item/waiting_user_input',
  'item/deleted'
];

function mapItemStatus(itemStatus) {
  const normalized = String(itemStatus || '').trim().toUpperCase();
  if (!normalized) {
    return 'unknown';
  }
  if (normalized === 'DELETED') {
    return 'revoked';
  }
  if (normalized === 'OUTDATED') {
    return 'expired';
  }
  if (normalized.includes('ERROR')) {
    return 'error';
  }
  if (normalized.includes('WAITING') || normalized.includes('PENDING') || normalized.includes('MFA')) {
    return 'pending';
  }
  if (normalized.includes('UPDAT') || normalized.includes('LOGIN')) {
    return 'syncing';
  }
  if (normalized.includes('CREAT') || normalized.includes('SUCCESS')) {
    return 'active';
  }
  return normalized.toLowerCase();
}

function getConnectionsCollection(appId, userId) {
  return db.collection(`artifacts/${appId}/users/${userId}/open_finance_conexoes`);
}

function getTransactionsCollection(appId, userId) {
  return db.collection(`artifacts/${appId}/users/${userId}/transacoes`);
}

function getWebhookEventsCollection() {
  return db.collection(WEBHOOK_COLLECTION);
}

function buildClientUserId(appId, userId) {
  return `${CLIENT_USER_PREFIX}:${sanitizeString(appId, 120)}:${sanitizeString(userId, 200)}`;
}

function parseClientUserId(clientUserId) {
  const safe = String(clientUserId || '').trim();
  const parts = safe.split(':');
  if (parts.length < 3) {
    return null;
  }
  if (parts[0] !== CLIENT_USER_PREFIX) {
    return null;
  }

  const appId = sanitizeString(parts[1], 120);
  const userId = sanitizeString(parts.slice(2).join(':'), 200);
  if (!appId || !userId) {
    return null;
  }

  return { appId, userId };
}

function resolveConnectionDocId(itemId) {
  return sanitizeItemId(itemId);
}

function toIso(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toISOString();
}

function resolveTransactionAmount(transaction = {}) {
  const amountInAccountCurrency = Number(transaction.amountInAccountCurrency);
  if (Number.isFinite(amountInAccountCurrency) && Math.abs(amountInAccountCurrency) > 0.00001) {
    return amountInAccountCurrency;
  }
  const amount = Number(transaction.amount);
  if (Number.isFinite(amount)) {
    return amount;
  }
  return NaN;
}

function resolveAccountType(account = {}) {
  const type = String(account.type || '').trim().toUpperCase();
  return type === 'CREDIT' ? 'Crédito' : 'Conta';
}

function normalizeTitleForMatching(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getTransactionTitleMatchKey(title) {
  return normalizeTitleForMatching(title)
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shiftDateKey(dateKey, deltaDays = 0) {
  const isoMatch = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!isoMatch) {
    return '';
  }

  const shift = Number.parseInt(deltaDays, 10);
  if (Number.isNaN(shift) || shift === 0) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const parsed = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  parsed.setUTCDate(parsed.getUTCDate() + shift);
  const year = String(parsed.getUTCFullYear()).padStart(4, '0');
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildImportCompatibleDedupKey(transaction = {}) {
  const dateKey = normalizeTransactionDateKey(transaction.date);
  const titleKey = getTransactionTitleMatchKey(transaction.title);
  const numericValue = Math.abs(toFiniteNumber(transaction.value));
  return `${dateKey}|${titleKey}|${numericValue.toFixed(2)}`;
}

function buildImportCompatibleDedupVariants(
  transaction = {},
  { includeCurrentDay = true, includePreviousDay = false, includeNextDay = false } = {}
) {
  const dedupKeys = [];
  const seen = new Set();
  const baseDateKey = normalizeTransactionDateKey(transaction.date);

  const pushDateKey = (dateKey) => {
    if (!dateKey) {
      return;
    }
    const dedupKey = buildImportCompatibleDedupKey({
      date: dateKey,
      title: transaction.title,
      value: transaction.value
    });
    if (!dedupKey || seen.has(dedupKey)) {
      return;
    }
    seen.add(dedupKey);
    dedupKeys.push(dedupKey);
  };

  if (includeCurrentDay) {
    pushDateKey(baseDateKey);
  }
  if (includePreviousDay) {
    pushDateKey(shiftDateKey(baseDateKey, -1));
  }
  if (includeNextDay) {
    pushDateKey(shiftDateKey(baseDateKey, 1));
  }

  return dedupKeys;
}

function isIncomeOrIgnoredStatement(value, title) {
  const normalizedTitle = normalizeTitleForMatching(title);
  return value >= 0 || /\b(PAGAMENTO|RECEBIDO|DEPOSITO|ESTORNO|CREDITO)\b/.test(normalizedTitle);
}

function isIgnoredCreditEntry(value, title) {
  const normalizedTitle = normalizeTitleForMatching(title);
  const numericValue = Number(value);
  const hasNeutralValue = !Number.isFinite(numericValue) || Math.abs(numericValue) < 0.00001;
  if (hasNeutralValue) {
    return true;
  }

  return /\b(PAGAMENTO|ESTORNO|RECEBIDO|DEPOSITO|CREDITO|CASHBACK|AJUSTE)\b/.test(normalizedTitle);
}

function detectBaseCategory(title) {
  const normalizedTitle = normalizeTitleForMatching(title);
  return normalizedTitle.includes('TRANSFERENCIA') || /\bTRANSFER\b/.test(normalizedTitle) || /\bPIX\b/.test(normalizedTitle)
    ? 'Transferência'
    : 'Outros';
}

function resolveSignedAmountForValidation(rawTransaction = {}, accountType = 'Conta') {
  const amount = resolveTransactionAmount(rawTransaction);
  if (!Number.isFinite(amount) || Math.abs(amount) < 0.00001) {
    return Number.NaN;
  }

  if (accountType === 'Crédito') {
    return amount;
  }

  const txType = String(rawTransaction.type || '').trim().toUpperCase();
  if (txType === 'DEBIT') {
    return -Math.abs(amount);
  }
  if (txType === 'CREDIT') {
    return Math.abs(amount);
  }
  return amount;
}

function buildTransactionTitle(transaction = {}) {
  return String(
    sanitizeString(transaction.description, 200) ||
    sanitizeString(transaction.descriptionRaw, 200) ||
    sanitizeString(transaction.merchant?.name, 200) ||
    sanitizeString(transaction.providerCode, 200) ||
    'Transação Meu Pluggy'
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function mapTransactionToDocument(rawTransaction = {}, account = {}, context = {}, originalIndex = 0) {
  const accountType = resolveAccountType(account);
  const signedAmount = resolveSignedAmountForValidation(rawTransaction, accountType);
  const title = buildTransactionTitle(rawTransaction);
  const shouldIgnoreByBusinessRules =
    accountType === 'Crédito'
      ? isIgnoredCreditEntry(signedAmount, title)
      : isIncomeOrIgnoredStatement(signedAmount, title);
  if (!Number.isFinite(signedAmount) || shouldIgnoreByBusinessRules) {
    return null;
  }

  const rawDate = sanitizeString(rawTransaction.date || rawTransaction.createdAt, 80);
  const date = normalizeTransactionDateKey(rawDate);
  const value = Math.abs(toCurrency(signedAmount));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !title || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  const nowIso = new Date().toISOString();
  const payload = {
    date,
    title,
    value,
    category: detectBaseCategory(title),
    accountType,
    bankAccount: sanitizeString(context.bankName || DEFAULT_BANK_ACCOUNT, 60) || DEFAULT_BANK_ACCOUNT,
    active: true,
    createdBy: 'import',
    createdAt: nowIso,
    categorySource: 'open-finance',
    categoryAutoAssigned: false,
    categoryManuallyEdited: false,
    lastCategoryUpdateAt: nowIso,
    transactionOrigin: 'open-finance',
    providerTransactionId: sanitizeString(rawTransaction.id, 140),
    providerItemId: sanitizeString(context.itemId, 140),
    providerAccountId: sanitizeString(account?.id || rawTransaction.accountId, 140),
    providerStatus: sanitizeString(rawTransaction.status, 40),
    originalIndex: Number.isFinite(originalIndex) ? originalIndex : 0
  };

  payload.hash = buildTransactionHash(payload);
  payload.dedupKey = buildImportCompatibleDedupKey(payload);
  return payload;
}

function chunk(values = [], size = 10) {
  const items = [];
  for (let index = 0; index < values.length; index += size) {
    items.push(values.slice(index, index + size));
  }
  return items;
}

function sanitizeOriginalIndex(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function sortCandidatesByDateDesc(candidates = []) {
  return [...(Array.isArray(candidates) ? candidates : [])].sort((left, right) => {
    const rightDate = normalizeTransactionDateKey(right?.date);
    const leftDate = normalizeTransactionDateKey(left?.date);
    if (rightDate !== leftDate) {
      return rightDate.localeCompare(leftDate);
    }

    return sanitizeOriginalIndex(left?.originalIndex) - sanitizeOriginalIndex(right?.originalIndex);
  });
}

async function buildExistingTransactionIdentity(collectionRef) {
  const identityKeys = new Set();
  const providerTransactionIds = new Set();
  const snapshot = await collectionRef.get();

  snapshot.forEach((doc) => {
    const data = doc.data() || {};
    const providerTransactionId = sanitizeString(data.providerTransactionId, 140);
    if (providerTransactionId) {
      providerTransactionIds.add(providerTransactionId);
    }

    const storedHash = sanitizeString(data.hash, 420);
    if (storedHash) {
      identityKeys.add(storedHash);
    }

    const storedDedupKey = sanitizeString(data.dedupKey, 420);
    if (storedDedupKey) {
      identityKeys.add(storedDedupKey);
    }

    const rebuiltHash = buildTransactionHash(data);
    if (rebuiltHash) {
      identityKeys.add(rebuiltHash);
    }

    const dedupVariants = buildImportCompatibleDedupVariants(data, {
      includeCurrentDay: true,
      includePreviousDay: true
    });
    dedupVariants.forEach((dedupKey) => identityKeys.add(dedupKey));
  });

  return {
    identityKeys,
    providerTransactionIds
  };
}

function deduplicateMappedTransactions(candidates = [], existingIdentity = {}) {
  const identityKeys = existingIdentity?.identityKeys instanceof Set ? existingIdentity.identityKeys : new Set();
  const providerTransactionIds =
    existingIdentity?.providerTransactionIds instanceof Set ? existingIdentity.providerTransactionIds : new Set();

  const orderedCandidates = sortCandidatesByDateDesc(candidates);
  const accepted = [];

  orderedCandidates.forEach((candidate) => {
    const providerTransactionId = sanitizeString(candidate?.providerTransactionId, 140);
    if (providerTransactionId && providerTransactionIds.has(providerTransactionId)) {
      return;
    }

    const hash = sanitizeString(candidate?.hash, 420);
    const dedupVariants = buildImportCompatibleDedupVariants(candidate, {
      includeCurrentDay: true,
      includePreviousDay: true
    });
    const dedupKey = sanitizeString(candidate?.dedupKey, 420) || buildImportCompatibleDedupKey(candidate);
    const duplicateByIdentity =
      (hash && identityKeys.has(hash)) ||
      (dedupKey && identityKeys.has(dedupKey)) ||
      dedupVariants.some((variant) => identityKeys.has(variant));
    if (duplicateByIdentity) {
      return;
    }

    if (providerTransactionId) {
      providerTransactionIds.add(providerTransactionId);
    }
    if (hash) {
      identityKeys.add(hash);
    }
    if (dedupKey) {
      identityKeys.add(dedupKey);
    }
    dedupVariants.forEach((variant) => identityKeys.add(variant));

    accepted.push({
      ...candidate,
      dedupKey,
      hash
    });
  });

  return accepted
    .sort((left, right) => sanitizeOriginalIndex(left?.originalIndex) - sanitizeOriginalIndex(right?.originalIndex))
    .map((transaction) => {
      const normalized = { ...transaction };
      delete normalized.originalIndex;
      return normalized;
    });
}

function buildOpenFinanceTransactionDocId(transaction = {}) {
  const providerTransactionId = sanitizeString(transaction.providerTransactionId, 140);
  const dedupKey = sanitizeString(transaction.dedupKey, 420);
  const accountType = sanitizeString(transaction.accountType, 20);
  const discriminator = providerTransactionId
    ? `provider:${providerTransactionId}`
    : `dedup:${dedupKey}|${accountType}`;
  return crypto.createHash('sha1').update(discriminator).digest('hex');
}

async function persistOpenFinanceTransactions(appId, userId, transactions = []) {
  const collectionRef = getTransactionsCollection(appId, userId);
  const normalized = (transactions || []).filter((item) => item && typeof item === 'object');

  if (normalized.length === 0) {
    return {
      insertedCount: 0,
      skippedCount: 0,
      insertedTransactions: []
    };
  }

  const existingIdentity = await buildExistingTransactionIdentity(collectionRef);
  const toInsert = deduplicateMappedTransactions(normalized, existingIdentity);

  if (toInsert.length === 0) {
    return {
      insertedCount: 0,
      skippedCount: normalized.length,
      insertedTransactions: []
    };
  }

  const batch = db.batch();
  const insertedTransactions = [];
  toInsert.forEach((transaction) => {
    const docId = buildOpenFinanceTransactionDocId(transaction);
    const docRef = collectionRef.doc(docId);
    batch.set(docRef, transaction, { merge: true });
    insertedTransactions.push({
      ...transaction,
      docId: docRef.id
    });
  });
  await batch.commit();

  return {
    insertedCount: insertedTransactions.length,
    skippedCount: normalized.length - insertedTransactions.length,
    insertedTransactions
  };
}

async function collectTransactionsFromAccounts(accounts = [], options = {}) {
  const fromDate = sanitizeString(options.fromDate || getSyncStartDateIso(), 40);
  const itemId = sanitizeString(options.itemId, 140);
  const bankName = sanitizeString(options.bankName || MEU_PLUGGY_BANK_NAME, 80) || MEU_PLUGGY_BANK_NAME;
  const collected = [];

  for (const account of accounts) {
    const accountId = sanitizeString(account?.id, 140);
    if (!accountId) {
      continue;
    }
    const accountTransactions = await listTransactionsForAccount(accountId, { from: fromDate });
    accountTransactions.forEach((transaction) => {
      const mapped = mapTransactionToDocument(transaction, account, { itemId, bankName }, collected.length);
      if (mapped) {
        collected.push(mapped);
      }
    });
  }

  const uniqueByProviderId = new Map();
  const uniqueByFallback = new Map();
  collected.forEach((transaction) => {
    const providerTransactionId = sanitizeString(transaction.providerTransactionId, 140);
    if (providerTransactionId) {
      if (!uniqueByProviderId.has(providerTransactionId)) {
        uniqueByProviderId.set(providerTransactionId, transaction);
      }
      return;
    }

    const fallbackKey = `${transaction.dedupKey}|${transaction.accountType}`;
    if (!uniqueByFallback.has(fallbackKey)) {
      uniqueByFallback.set(fallbackKey, transaction);
    }
  });

  return [...uniqueByProviderId.values(), ...uniqueByFallback.values()];
}

function buildConnectionSnapshot(connectionId, data = {}) {
  return {
    id: sanitizeString(connectionId, 140),
    bankCode: MEU_PLUGGY_BANK_CODE,
    bankName: MEU_PLUGGY_BANK_NAME,
    provider: MEU_PLUGGY_PROVIDER,
    providerConnectionId: sanitizeString(data.providerConnectionId || connectionId, 140),
    providerItemId: sanitizeString(data.providerItemId || connectionId, 140),
    status: sanitizeString(data.status || 'unknown', 40) || 'unknown',
    consentUrl: sanitizeString(data.consentUrl || MEU_PLUGGY_CONSENT_URL, 700),
    consentExpiresAt: sanitizeString(data.consentExpiresAt, 80),
    lastSyncAt: sanitizeString(data.lastSyncAt, 80),
    lastSyncInserted: Math.max(0, Math.round(toFiniteNumber(data.lastSyncInserted))),
    createdAt: sanitizeString(data.createdAt, 80),
    updatedAt: sanitizeString(data.updatedAt, 80),
    errorMessage: sanitizeString(data.errorMessage, 500),
    itemStatusRaw: sanitizeString(data.itemStatusRaw, 80),
    connectorId: sanitizeString(data.connectorId, 80),
    connectorName: sanitizeString(data.connectorName, 120),
    lastWebhookEvent: sanitizeString(data.lastWebhookEvent, 120),
    lastWebhookAt: sanitizeString(data.lastWebhookAt, 80)
  };
}

async function upsertConnectionRecord(appId, userId, item, extra = {}) {
  const itemId = sanitizeItemId(item?.id || extra.itemId);
  if (!itemId) {
    const error = new Error('Item ID inválido para salvar conexão.');
    error.statusCode = 400;
    throw error;
  }

  const nowIso = new Date().toISOString();
  const connectionRef = getConnectionsCollection(appId, userId).doc(resolveConnectionDocId(itemId));
  const previousSnapshot = await connectionRef.get();
  const previousData = previousSnapshot.exists ? previousSnapshot.data() || {} : {};
  const itemStatusRaw = sanitizeString(item?.status || extra.itemStatusRaw, 80);
  const status = sanitizeString(extra.status || mapItemStatus(itemStatusRaw), 40) || 'unknown';

  const payload = {
    bankCode: MEU_PLUGGY_BANK_CODE,
    bankName: MEU_PLUGGY_BANK_NAME,
    provider: MEU_PLUGGY_PROVIDER,
    providerConnectionId: itemId,
    providerItemId: itemId,
    clientUserId: buildClientUserId(appId, userId),
    status,
    consentUrl: sanitizeString(item?.consentUrl || previousData.consentUrl || MEU_PLUGGY_CONSENT_URL, 700),
    consentExpiresAt: sanitizeString(
      item?.consentExpiresAt || item?.consent?.expiresAt || previousData.consentExpiresAt,
      80
    ),
    itemStatusRaw,
    connectorId: sanitizeString(item?.connector?.id || item?.connectorId || previousData.connectorId, 80),
    connectorName: sanitizeString(item?.connector?.name || previousData.connectorName, 120),
    lastSyncAt: sanitizeString(extra.lastSyncAt || previousData.lastSyncAt, 80),
    lastSyncInserted: Math.max(
      0,
      Math.round(
        toFiniteNumber(extra.lastSyncInserted, toFiniteNumber(previousData.lastSyncInserted, 0))
      )
    ),
    lastWebhookEvent: sanitizeString(extra.lastWebhookEvent || previousData.lastWebhookEvent, 120),
    lastWebhookAt: sanitizeString(extra.lastWebhookAt || previousData.lastWebhookAt, 80),
    errorMessage: sanitizeString(extra.errorMessage || previousData.errorMessage, 500),
    createdAt: sanitizeString(previousData.createdAt, 80) || nowIso,
    updatedAt: nowIso
  };

  if (status === 'revoked') {
    payload.revokedAt = nowIso;
  }

  await connectionRef.set(payload, { merge: true });
  return buildConnectionSnapshot(connectionRef.id, payload);
}

async function listConnections(appId, userId) {
  const snapshot = await getConnectionsCollection(appId, userId).get();
  const connections = [];
  snapshot.forEach((doc) => {
    connections.push(buildConnectionSnapshot(doc.id, doc.data() || {}));
  });
  connections.sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
  return connections;
}

async function getConnectionById(appId, userId, connectionId) {
  const safeId = sanitizeItemId(connectionId);
  if (!safeId) {
    return null;
  }
  const snapshot = await getConnectionsCollection(appId, userId).doc(safeId).get();
  if (!snapshot.exists) {
    return null;
  }
  return {
    id: snapshot.id,
    ...(snapshot.data() || {})
  };
}

async function setWebhookStatus(appId, userId, connectionId, statusPayload = {}) {
  const safeId = sanitizeItemId(connectionId);
  if (!safeId) {
    return;
  }
  const nowIso = new Date().toISOString();
  await getConnectionsCollection(appId, userId)
    .doc(safeId)
    .set(
      {
        lastWebhookEvent: sanitizeString(statusPayload.event || '', 120),
        lastWebhookAt: sanitizeString(statusPayload.when || nowIso, 80),
        status: sanitizeString(statusPayload.status || '', 40) || undefined,
        errorMessage: sanitizeString(statusPayload.errorMessage || '', 500),
        updatedAt: nowIso
      },
      { merge: true }
    );
}

async function syncItem(appId, userId, itemId, options = {}) {
  const safeItemId = sanitizeItemId(itemId);
  if (!safeItemId) {
    const error = new Error('Item ID inválido para sincronização.');
    error.statusCode = 400;
    throw error;
  }

  const nowIso = new Date().toISOString();
  const webhookUrl = sanitizeString(options.webhookUrl || '', 700);
  const clientUserId = buildClientUserId(appId, userId);

  const patchPayload = {
    clientUserId
  };
  if (webhookUrl) {
    patchPayload.webhookUrl = webhookUrl;
  }

  await updateItemById(safeItemId, patchPayload).catch((_error) => {
    // Sync may be already running. We keep processing with latest collected data.
  });

  const item = await getItemById(safeItemId);
  const accounts = await listAccountsByItem(safeItemId);
  const mappedTransactions = await collectTransactionsFromAccounts(accounts, {
    fromDate: getSyncStartDateIso(),
    itemId: safeItemId,
    bankName: MEU_PLUGGY_BANK_NAME
  });
  const persisted = await persistOpenFinanceTransactions(appId, userId, mappedTransactions);

  const connection = await upsertConnectionRecord(appId, userId, item, {
    lastSyncAt: nowIso,
    lastSyncInserted: persisted.insertedCount,
    status: mapItemStatus(item?.status),
    errorMessage: ''
  });

  return {
    connection,
    transactions: persisted.insertedTransactions,
    insertedCount: persisted.insertedCount,
    skippedCount: persisted.skippedCount
  };
}

async function revokeItemConnection(appId, userId, itemId) {
  const safeItemId = sanitizeItemId(itemId);
  if (!safeItemId) {
    const error = new Error('connectionId inválido.');
    error.statusCode = 400;
    throw error;
  }

  await upsertConnectionRecord(appId, userId, { id: safeItemId, status: 'DELETED' }, { status: 'revoked' });
}

function parseWebhookHeaderSecret(request) {
  if (WEBHOOK_ALLOW_UNSIGNED) {
    return {
      enabled: false,
      valid: true,
      bypassed: true
    };
  }

  const configuredSecret = WEBHOOK_SECRET;
  if (!configuredSecret) {
    return {
      enabled: false,
      valid: true,
      bypassed: true
    };
  }

  const headerValue = String(request.get(WEBHOOK_HEADER_NAME) || '').trim();
  return {
    enabled: true,
    valid: headerValue && headerValue === configuredSecret,
    bypassed: false
  };
}

function buildWebhookEventDocId(payload = {}) {
  const event = sanitizeString(payload.event, 80);
  const eventId = sanitizeString(payload.eventId, 140);
  const itemId = sanitizeString(payload.itemId || payload.id, 140);
  const accountId = sanitizeString(payload.accountId, 140);
  const discriminator = `${event}|${eventId}|${itemId}|${accountId}|${sanitizeString(payload.transactionsCreatedAtFrom, 80)}`;
  return crypto.createHash('sha1').update(discriminator).digest('hex');
}

async function resolveConnectionOwner(payload = {}) {
  const itemId = sanitizeItemId(payload.itemId || payload.id);
  const fromClientUserId = parseClientUserId(payload.clientUserId);
  if (fromClientUserId && itemId) {
    return {
      ...fromClientUserId,
      itemId
    };
  }

  if (!itemId) {
    return null;
  }

  let snapshot;
  try {
    snapshot = await db
      .collectionGroup('open_finance_conexoes')
      .where('providerItemId', '==', itemId)
      .limit(1)
      .get();
  } catch (error) {
    const message = sanitizeString(error?.message, 500);
    const code = Number(error?.code);
    if (code === 9 || /FAILED_PRECONDITION/i.test(message)) {
      console.warn('Falha de pré-condição ao resolver owner por itemId; ignorando fallback de owner.', {
        itemId,
        message
      });
      return null;
    }
    throw error;
  }

  if (snapshot.empty) {
    return null;
  }

  const match = snapshot.docs[0];
  const path = match.ref.path.split('/');
  if (path.length < 6) {
    return null;
  }

  return {
    appId: sanitizeString(path[1], 120),
    userId: sanitizeString(path[3], 200),
    itemId
  };
}

async function queueWebhookEvent(payload = {}, meta = {}) {
  const owner = await resolveConnectionOwner(payload);
  const eventDocId = buildWebhookEventDocId(payload);
  const eventRef = getWebhookEventsCollection().doc(eventDocId);
  const existing = await eventRef.get();
  if (existing.exists) {
    return {
      accepted: true,
      duplicate: true,
      eventId: eventDocId,
      owner
    };
  }

  const nowIso = new Date().toISOString();
  await eventRef.set({
    eventDocId,
    event: sanitizeString(payload.event, 80),
    eventId: sanitizeString(payload.eventId, 140),
    itemId: sanitizeItemId(payload.itemId || payload.id),
    accountId: sanitizeString(payload.accountId, 140),
    transactionIds: Array.isArray(payload.transactionIds)
      ? payload.transactionIds.map((id) => sanitizeString(id, 140)).filter(Boolean)
      : [],
    createdTransactionsLink: sanitizeString(payload.createdTransactionsLink, 2000),
    transactionsCreatedAtFrom: sanitizeString(payload.transactionsCreatedAtFrom, 80),
    transactionsCount: Math.max(0, Math.round(toFiniteNumber(payload.transactionsCount))),
    errorCode: sanitizeString(payload?.error?.code, 120),
    errorMessageFromPayload: sanitizeString(payload?.error?.message || payload?.error?.detail, 600),
    clientUserId: sanitizeString(payload.clientUserId, 220),
    triggeredBy: sanitizeString(payload.triggeredBy, 60),
    ownerAppId: sanitizeString(owner?.appId, 120),
    ownerUserId: sanitizeString(owner?.userId, 200),
    status: owner ? 'queued' : 'ignored-no-owner',
    retryCount: 0,
    lastError: '',
    payloadHash: sanitizeString(meta.payloadHash, 80),
    sourceIp: sanitizeString(meta.sourceIp, 80),
    createdAt: nowIso,
    updatedAt: nowIso
  });

  return {
    accepted: true,
    duplicate: false,
    eventId: eventDocId,
    owner
  };
}

function mapTransactionBatch(rawTransactions = [], account = {}, context = {}) {
  return (rawTransactions || [])
    .map((transaction, index) => mapTransactionToDocument(transaction, account, context, index))
    .filter(Boolean);
}

async function processTransactionsCreatedEvent(eventDoc = {}) {
  const itemId = sanitizeItemId(eventDoc.itemId);
  const appId = sanitizeString(eventDoc.ownerAppId, 120);
  const userId = sanitizeString(eventDoc.ownerUserId, 200);
  const accountId = sanitizeString(eventDoc.accountId, 140);
  if (!itemId || !appId || !userId || !accountId) {
    return { insertedCount: 0, skippedCount: 0, reason: 'missing-item-or-owner' };
  }

  const accounts = await listAccountsByItem(itemId);
  const account = accounts.find((entry) => sanitizeString(entry?.id, 140) === accountId);
  if (!account) {
    return { insertedCount: 0, skippedCount: 0, reason: 'account-not-found' };
  }

  let rawTransactions = [];
  if (eventDoc.createdTransactionsLink) {
    rawTransactions = await listTransactionsByCreatedLink(eventDoc.createdTransactionsLink);
  } else {
    rawTransactions = await listTransactionsForAccount(accountId, {
      createdAtFrom: eventDoc.transactionsCreatedAtFrom || undefined
    });
  }

  const mapped = mapTransactionBatch(rawTransactions, account, {
    itemId,
    bankName: MEU_PLUGGY_BANK_NAME
  });
  const persisted = await persistOpenFinanceTransactions(appId, userId, mapped);
  return {
    insertedCount: persisted.insertedCount,
    skippedCount: persisted.skippedCount,
    reason: 'transactions-created'
  };
}

async function processTransactionsUpdatedEvent(eventDoc = {}) {
  const itemId = sanitizeItemId(eventDoc.itemId);
  const appId = sanitizeString(eventDoc.ownerAppId, 120);
  const userId = sanitizeString(eventDoc.ownerUserId, 200);
  const accountId = sanitizeString(eventDoc.accountId, 140);
  const transactionIds = Array.isArray(eventDoc.transactionIds) ? eventDoc.transactionIds : [];
  if (!itemId || !appId || !userId || !accountId || transactionIds.length === 0) {
    return { insertedCount: 0, skippedCount: 0, reason: 'missing-updated-payload' };
  }

  const accounts = await listAccountsByItem(itemId);
  const account = accounts.find((entry) => sanitizeString(entry?.id, 140) === accountId);
  if (!account) {
    return { insertedCount: 0, skippedCount: 0, reason: 'account-not-found' };
  }

  const rawTransactions = await listTransactionsByIds(accountId, transactionIds);
  const mapped = mapTransactionBatch(rawTransactions, account, {
    itemId,
    bankName: MEU_PLUGGY_BANK_NAME
  });
  const persisted = await persistOpenFinanceTransactions(appId, userId, mapped);
  return {
    insertedCount: persisted.insertedCount,
    skippedCount: persisted.skippedCount,
    reason: 'transactions-updated'
  };
}

async function markTransactionsAsDeleted(appId, userId, transactionIds = []) {
  const collectionRef = getTransactionsCollection(appId, userId);
  const normalizedIds = [...new Set((transactionIds || []).map((id) => sanitizeString(id, 140)).filter(Boolean))];
  if (normalizedIds.length === 0) {
    return {
      updatedCount: 0
    };
  }

  let updatedCount = 0;
  const idChunks = chunk(normalizedIds, 10);
  for (const idChunk of idChunks) {
    const snapshot = await collectionRef.where('providerTransactionId', 'in', idChunk).get();
    if (snapshot.empty) {
      continue;
    }

    const nowIso = new Date().toISOString();
    const batch = db.batch();
    snapshot.forEach((doc) => {
      batch.set(
        doc.ref,
        {
          active: false,
          providerStatus: 'DELETED',
          deletedByProvider: true,
          updatedAt: nowIso,
          lastCategoryUpdateAt: nowIso
        },
        { merge: true }
      );
      updatedCount += 1;
    });
    await batch.commit();
  }

  return {
    updatedCount
  };
}

async function processTransactionsDeletedEvent(eventDoc = {}) {
  const appId = sanitizeString(eventDoc.ownerAppId, 120);
  const userId = sanitizeString(eventDoc.ownerUserId, 200);
  const transactionIds = Array.isArray(eventDoc.transactionIds) ? eventDoc.transactionIds : [];

  if (!appId || !userId || transactionIds.length === 0) {
    return { insertedCount: 0, skippedCount: 0, reason: 'missing-deleted-payload', updatedCount: 0 };
  }

  const deleted = await markTransactionsAsDeleted(appId, userId, transactionIds);
  return {
    insertedCount: 0,
    skippedCount: Math.max(0, transactionIds.length - deleted.updatedCount),
    updatedCount: deleted.updatedCount,
    reason: 'transactions-deleted'
  };
}

async function processItemEvent(eventDoc = {}) {
  const itemId = sanitizeItemId(eventDoc.itemId);
  const appId = sanitizeString(eventDoc.ownerAppId, 120);
  const userId = sanitizeString(eventDoc.ownerUserId, 200);
  if (!itemId || !appId || !userId) {
    return { insertedCount: 0, skippedCount: 0, reason: 'missing-owner' };
  }

  const item = await getItemById(itemId);
  await upsertConnectionRecord(appId, userId, item, {
    lastWebhookEvent: sanitizeString(eventDoc.event, 80),
    lastWebhookAt: new Date().toISOString(),
    errorMessage:
      sanitizeString(eventDoc.event, 80) === 'item/error'
        ? sanitizeString(eventDoc.errorMessageFromPayload || 'Item reportou erro no Pluggy.', 500)
        : ''
  });

  if (String(eventDoc.event || '').trim() === 'item/deleted') {
    await revokeItemConnection(appId, userId, itemId);
    return { insertedCount: 0, skippedCount: 0, reason: 'item-deleted' };
  }

  const accounts = await listAccountsByItem(itemId);
  const mapped = await collectTransactionsFromAccounts(accounts, {
    fromDate: getSyncStartDateIso(),
    itemId,
    bankName: MEU_PLUGGY_BANK_NAME
  });
  const persisted = await persistOpenFinanceTransactions(appId, userId, mapped);
  return {
    insertedCount: persisted.insertedCount,
    skippedCount: persisted.skippedCount,
    reason: 'item-full-sync'
  };
}

async function processQueuedWebhookEvent(eventDocId) {
  const safeEventDocId = sanitizeString(eventDocId, 80);
  if (!safeEventDocId) {
    return null;
  }

  const eventRef = getWebhookEventsCollection().doc(safeEventDocId);
  const snapshot = await eventRef.get();
  if (!snapshot.exists) {
    return null;
  }
  const data = snapshot.data() || {};
  if (String(data.status || '').trim() !== 'queued') {
    return data;
  }

  const startedAt = new Date().toISOString();
  await eventRef.set(
    {
      status: 'processing',
      processingStartedAt: startedAt,
      updatedAt: startedAt
    },
    { merge: true }
  );

  try {
    const eventName = sanitizeString(data.event, 80);
    let result = {
      insertedCount: 0,
      skippedCount: 0,
      reason: 'ignored'
    };
    let pushNotification = null;

    if (eventName === 'transactions/created') {
      result = await processTransactionsCreatedEvent(data);
    } else if (eventName === 'transactions/updated') {
      result = await processTransactionsUpdatedEvent(data);
    } else if (eventName === 'transactions/deleted') {
      result = await processTransactionsDeletedEvent(data);
    } else if (eventName.startsWith('item/')) {
      result = await processItemEvent(data);
    }

    if (Number(result?.insertedCount || 0) > 0) {
      try {
        pushNotification = await sendOpenFinanceTransactionsPushNotification({
          appId: data.ownerAppId,
          userId: data.ownerUserId,
          insertedCount: Number(result.insertedCount || 0),
          eventName
        });
      } catch (pushError) {
        pushNotification = {
          attempted: true,
          error: sanitizeString(pushError?.message || 'push-notification-failed', 240)
        };
      }
    }

    const finishedAt = new Date().toISOString();
    await eventRef.set(
      {
        status: 'processed',
        result: {
          ...result,
          pushNotification
        },
        processedAt: finishedAt,
        updatedAt: finishedAt,
        retryCount: Math.max(0, Math.round(toFiniteNumber(data.retryCount)))
      },
      { merge: true }
    );

    if (data.ownerAppId && data.ownerUserId && data.itemId) {
      await setWebhookStatus(data.ownerAppId, data.ownerUserId, data.itemId, {
        event: eventName,
        when: finishedAt,
        status: eventName === 'item/deleted' ? 'revoked' : undefined,
        errorMessage: ''
      });
    }

    return {
      ...data,
      status: 'processed',
      result
    };
  } catch (error) {
    const failedAt = new Date().toISOString();
    const nextRetry = Math.max(0, Math.round(toFiniteNumber(data.retryCount))) + 1;
    await eventRef.set(
      {
        status: 'failed',
        retryCount: nextRetry,
        lastError: sanitizeString(error?.message || 'Erro ao processar webhook.', 600),
        failedAt,
        updatedAt: failedAt
      },
      { merge: true }
    );

    if (data.ownerAppId && data.ownerUserId && data.itemId) {
      await setWebhookStatus(data.ownerAppId, data.ownerUserId, data.itemId, {
        event: sanitizeString(data.event, 80),
        when: failedAt,
        status: 'error',
        errorMessage: sanitizeString(error?.message || 'Erro no processamento do webhook.', 500)
      });
    }

    throw error;
  }
}

async function ensureWebhooksConfigured() {
  if (!WEBHOOK_ENABLED || !WEBHOOK_AUTOCONFIG || !WEBHOOK_URL) {
    return {
      configured: false,
      reason: 'autoconfig-disabled'
    };
  }

  const hooks = await listWebhooks();
  const headerKey = WEBHOOK_HEADER_NAME || 'x-open-finance-webhook-secret';
  const desiredHeaders = WEBHOOK_SECRET ? { [headerKey]: WEBHOOK_SECRET } : {};

  const normalizedHooks = hooks
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      id: sanitizeString(entry.id, 140),
      url: sanitizeString(entry.url, 700),
      event: sanitizeString(entry.event, 80)
    }))
    .filter((entry) => entry.id && entry.url && entry.event);

  const actions = [];

  for (const eventName of WEBHOOK_EVENTS_TO_MANAGE) {
    const existing = normalizedHooks.find((entry) => entry.event === eventName && entry.url === WEBHOOK_URL);
    if (existing) {
      continue;
    }

    const reusable = normalizedHooks.find((entry) => entry.event === eventName);
    if (reusable) {
      await updateWebhook(reusable.id, {
        url: WEBHOOK_URL,
        event: eventName,
        headers: desiredHeaders
      });
      actions.push(`updated:${eventName}`);
      continue;
    }

    await createWebhook({
      url: WEBHOOK_URL,
      event: eventName,
      headers: desiredHeaders
    });
    actions.push(`created:${eventName}`);
  }

  return {
    configured: true,
    actions
  };
}

module.exports = {
  MEU_PLUGGY_BANK_CODE,
  MEU_PLUGGY_BANK_NAME,
  MEU_PLUGGY_PROVIDER,
  MEU_PLUGGY_CONSENT_URL,
  WEBHOOK_COLLECTION,
  WEBHOOK_SECRET,
  WEBHOOK_HEADER_NAME,
  WEBHOOK_ENABLED,
  WEBHOOK_ALLOW_UNSIGNED,
  WEBHOOK_AUTOCONFIG,
  WEBHOOK_URL,
  WEBHOOK_EVENTS_TO_MANAGE,
  mapItemStatus,
  getConnectionsCollection,
  getTransactionsCollection,
  getWebhookEventsCollection,
  buildClientUserId,
  parseClientUserId,
  resolveConnectionDocId,
  buildConnectionSnapshot,
  listConnections,
  getConnectionById,
  setWebhookStatus,
  syncItem,
  revokeItemConnection,
  parseWebhookHeaderSecret,
  queueWebhookEvent,
  processQueuedWebhookEvent,
  ensureWebhooksConfigured
};
