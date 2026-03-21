const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

initializeApp();

const db = getFirestore();
const DEFAULT_ALLOWED_ORIGIN = 'https://smart-finance-ia.web.app';
const CONSULTANT_DAILY_LIMIT = 3;
const APP_TIMEZONE = 'America/Sao_Paulo';
const DEFAULT_BANK_ACCOUNT = 'Padrão';

const ALLOWED_ORIGINS = new Set([
  'https://smart-finance-ia.web.app',
  'https://smart-finance-ia.firebaseapp.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const DEFAULT_FALLBACK_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
const DEFAULT_ADMIN_EMAILS = ['guilhermenr1995@gmail.com'];
const USER_JOURNEY_RESET_COLLECTIONS = ['transacoes', 'categorias', 'contas_bancarias', 'consultor_insights', 'metrics_daily'];

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function setCorsHeaders(request, response) {
  const origin = request.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : DEFAULT_ALLOWED_ORIGIN;

  response.set('Access-Control-Allow-Origin', allowOrigin);
  response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.set('Vary', 'Origin');
}

function handlePreflightAndMethod(request, response) {
  if (request.method === 'OPTIONS') {
    response.status(204).send('');
    return true;
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return true;
  }

  return false;
}

async function authenticateRequest(request, response) {
  const authHeader = request.get('Authorization') || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '');

  if (!idToken) {
    response.status(401).json({ error: 'Missing Authorization token' });
    return null;
  }

  try {
    return await getAuth().verifyIdToken(idToken);
  } catch (error) {
    response.status(401).json({ error: 'Invalid or expired Authorization token' });
    return null;
  }
}

async function requestGeminiWithRetry(url, options, retryConfig = {}) {
  const maxRetries = retryConfig.maxRetries || 3;
  const baseDelayMs = retryConfig.baseDelayMs || 450;
  let lastPayload = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(url, options);
    const text = await response.text();
    lastPayload = text;

    if (response.ok) {
      return {
        ok: true,
        payload: text
      };
    }

    if (!RETRYABLE_STATUS.has(response.status) || attempt === maxRetries) {
      return {
        ok: false,
        status: response.status,
        payload: text
      };
    }

    const jitter = Math.floor(Math.random() * 350);
    const waitMs = Math.min(baseDelayMs * (2 ** attempt) + jitter, 2600);
    await sleep(waitMs);
  }

  return {
    ok: false,
    status: 500,
    payload: lastPayload || 'Unknown Gemini error'
  };
}

function uniqueNonEmpty(values) {
  const seen = new Set();
  const output = [];

  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function buildModelCandidates(primaryModel) {
  const envFallback = String(process.env.GEMINI_FALLBACK_MODELS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return uniqueNonEmpty([primaryModel, ...envFallback, ...DEFAULT_FALLBACK_MODELS]);
}

function isNotFoundModelError(status, payload) {
  if (status === 404) {
    return true;
  }

  const raw = String(payload || '');
  return /NOT_FOUND|is not found|unsupported for generateContent/i.test(raw);
}

function safeParseJson(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return null;
  }

  try {
    return JSON.parse(rawText.replace(/^```json\s*/i, '').replace(/```$/, '').trim());
  } catch (error) {
    return null;
  }
}

function toSafeKey(value) {
  return String(value || '')
    .trim()
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/[^A-Za-z0-9_-]/g, '');
}

function buildInsightKeyFromFilters(filters = {}) {
  const payload = JSON.stringify({
    startDate: filters.startDate || '',
    endDate: filters.endDate || '',
    accountType: filters.accountType || 'all',
    category: filters.category || 'all'
  });

  return toSafeKey(Buffer.from(payload, 'utf8').toString('base64'));
}

function resolveInsightKey(rawKey, filters) {
  const safeRawKey = toSafeKey(rawKey);
  if (safeRawKey.length >= 12) {
    return safeRawKey;
  }

  return buildInsightKeyFromFilters(filters);
}

function getDateKeyInTimezone() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function toNormalizedEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getAllowedAdminEmails() {
  const envEmails = String(process.env.ADMIN_ALLOWED_EMAILS || '')
    .split(',')
    .map((item) => toNormalizedEmail(item))
    .filter(Boolean);

  return new Set(uniqueNonEmpty([...DEFAULT_ADMIN_EMAILS, ...envEmails]).map((item) => toNormalizedEmail(item)));
}

function isAdminRequest(decodedToken) {
  const email = toNormalizedEmail(decodedToken?.email);
  if (!email) {
    return false;
  }

  const provider = String(decodedToken?.firebase?.sign_in_provider || '').trim().toLowerCase();
  if (provider !== 'google.com') {
    return false;
  }

  return getAllowedAdminEmails().has(email);
}

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

async function deduplicateUserTransactions(appId, userId, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const collectionRef = db.collection(`artifacts/${appId}/users/${userId}/transacoes`);
  const snapshot = await collectionRef.get();
  const groups = new Map();

  snapshot.forEach((doc) => {
    const data = doc.data() || {};
    const key = String(data.dedupKey || '').trim() || buildTransactionDedupKey(data);
    if (!key) {
      return;
    }

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push({
      id: doc.id,
      ref: doc.ref,
      data
    });
  });

  const duplicateGroups = [...groups.entries()].filter(([, docs]) => docs.length > 1);
  const operations = [];
  let keeperUpdates = 0;
  let duplicateDocs = 0;
  const sampleGroups = [];

  duplicateGroups.forEach(([groupKey, docs]) => {
    const ordered = sortByPriorityWithTimestamp(docs);
    const keeperDoc = ordered[0];
    const mergedKeeper = mergeDuplicateTransactionGroup(keeperDoc, ordered);
    const docsToDelete = ordered.slice(1);

    duplicateDocs += docsToDelete.length;
    if (sampleGroups.length < 8) {
      sampleGroups.push({
        dedupKey: groupKey,
        keeperDocId: keeperDoc.id,
        duplicateDocIds: docsToDelete.map((doc) => doc.id)
      });
    }

    if (shouldUpdateKeeper(keeperDoc.data, mergedKeeper)) {
      keeperUpdates += 1;
      operations.push({
        type: 'set',
        ref: keeperDoc.ref,
        data: mergedKeeper
      });
    }

    docsToDelete.forEach((doc) => {
      operations.push({
        type: 'delete',
        ref: doc.ref
      });
    });
  });

  if (!dryRun && operations.length > 0) {
    const batchSize = 420;
    for (let index = 0; index < operations.length; index += batchSize) {
      const chunk = operations.slice(index, index + batchSize);
      const batch = db.batch();

      chunk.forEach((operation) => {
        if (operation.type === 'set') {
          batch.set(operation.ref, operation.data, { merge: true });
          return;
        }

        batch.delete(operation.ref);
      });

      await batch.commit();
    }
  }

  return {
    userId,
    scannedTransactions: snapshot.size,
    duplicateGroups: duplicateGroups.length,
    duplicateDocs,
    keeperUpdates,
    dryRun,
    sampleGroups
  };
}

async function deleteCollectionDocuments(collectionRef, options = {}) {
  const batchSize = Math.max(1, Math.min(Number(options.batchSize || 380), 420));
  let deletedCount = 0;

  while (true) {
    const snapshot = await collectionRef.limit(batchSize).get();
    if (snapshot.empty) {
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    deletedCount += snapshot.size;
    if (snapshot.size < batchSize) {
      break;
    }
  }

  return deletedCount;
}

async function deleteQueryDocuments(queryRef, options = {}) {
  const batchSize = Math.max(1, Math.min(Number(options.batchSize || 380), 420));
  let deletedCount = 0;

  while (true) {
    const snapshot = await queryRef.limit(batchSize).get();
    if (snapshot.empty) {
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    deletedCount += snapshot.size;
    if (snapshot.size < batchSize) {
      break;
    }
  }

  return deletedCount;
}

function compareResetCollectionRefs(left, right) {
  const leftName = String(left?.id || '');
  const rightName = String(right?.id || '');
  const leftPriority = USER_JOURNEY_RESET_COLLECTIONS.indexOf(leftName);
  const rightPriority = USER_JOURNEY_RESET_COLLECTIONS.indexOf(rightName);

  const normalizedLeftPriority = leftPriority === -1 ? Number.MAX_SAFE_INTEGER : leftPriority;
  const normalizedRightPriority = rightPriority === -1 ? Number.MAX_SAFE_INTEGER : rightPriority;

  if (normalizedLeftPriority !== normalizedRightPriority) {
    return normalizedLeftPriority - normalizedRightPriority;
  }

  return leftName.localeCompare(rightName);
}

async function resolveUserCollectionsForReset(userRef) {
  const collectionMap = new Map();

  const listedCollections = await userRef.listCollections();
  listedCollections.forEach((collectionRef) => {
    collectionMap.set(collectionRef.id, collectionRef);
  });

  USER_JOURNEY_RESET_COLLECTIONS.forEach((collectionName) => {
    if (!collectionMap.has(collectionName)) {
      collectionMap.set(collectionName, userRef.collection(collectionName));
    }
  });

  return [...collectionMap.values()].sort(compareResetCollectionRefs);
}

async function resetUserJourneyData(appId, userId, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const resetBy = String(options.resetBy || '').trim();
  const userRef = db.doc(`artifacts/${appId}/users/${userId}`);
  const deletedByCollection = {};
  let totalDocsMatched = 0;
  let totalDocsDeleted = 0;

  const collectionsForReset = await resolveUserCollectionsForReset(userRef);
  for (const collectionRef of collectionsForReset) {
    const collectionName = collectionRef.id;
    const snapshot = await collectionRef.get();
    const matched = snapshot.size;
    totalDocsMatched += matched;

    let deleted = 0;
    if (!dryRun && matched > 0) {
      deleted = await deleteCollectionDocuments(collectionRef);
    } else if (dryRun) {
      deleted = matched;
    }

    totalDocsDeleted += deleted;
    deletedByCollection[collectionName] = {
      matched,
      deleted
    };
  }

  const consultantUsageQuery = db.collection('ai_consultant_usage').where('userId', '==', userId);
  const consultantUsageSnapshot = await consultantUsageQuery.get();
  const consultantUsageMatched = consultantUsageSnapshot.size;
  const consultantUsageDeleted = dryRun
    ? consultantUsageMatched
    : consultantUsageMatched > 0
    ? await deleteQueryDocuments(consultantUsageQuery)
    : 0;

  totalDocsMatched += consultantUsageMatched;
  totalDocsDeleted += consultantUsageDeleted;
  deletedByCollection.ai_consultant_usage = {
    matched: consultantUsageMatched,
    deleted: consultantUsageDeleted
  };

  if (!dryRun) {
    const nowIso = new Date().toISOString();
    await userRef.set(
      {
        importOperationsTotal: 0,
        importedTransactionsTotal: 0,
        manualTransactionsTotal: 0,
        aiCategorizationRunsTotal: 0,
        aiConsultantRunsTotal: 0,
        lastDataResetAt: nowIso,
        lastDataResetBy: resetBy
      },
      { merge: true }
    );
  }

  return {
    userId,
    dryRun,
    deletedByCollection,
    totalDocsMatched,
    totalDocsDeleted
  };
}

function formatCurrencyBRL(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(toFiniteNumber(value));
}

function calculateGrowthPercent(currentValue, previousValue) {
  const current = toFiniteNumber(currentValue);
  const previous = toFiniteNumber(previousValue);
  if (previous <= 0) {
    return current > 0 ? 100 : 0;
  }

  return toPercent(((current - previous) / previous) * 100);
}

function parseInputDate(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return new Date();
  }

  if (raw.includes('-')) {
    const [year, month, day] = raw.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  if (raw.includes('/')) {
    const [day, month, year] = raw.split('/').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  return new Date(raw);
}

function getDaysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function formatMonthYear(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric'
  }).format(date);
}

function sanitizeCategoryMetrics(rawMetrics, fallbackBreakdown, totalPeriod) {
  if (Array.isArray(rawMetrics) && rawMetrics.length > 0) {
    return rawMetrics
      .map((metric) => {
        const category = String(metric?.category || '').trim() || 'Sem categoria';
        const total = toCurrency(metric?.total);
        const transactions = Math.max(0, Math.round(toFiniteNumber(metric?.transactions)));
        const ticketAverage = transactions > 0 ? toCurrency(total / transactions) : 0;
        const share = totalPeriod > 0 ? toPercent((total / totalPeriod) * 100) : 0;

        return {
          category,
          total,
          transactions,
          ticketAverage: toCurrency(metric?.ticketAverage || ticketAverage),
          share: toPercent(metric?.share ?? share)
        };
      })
      .sort((left, right) => right.total - left.total);
  }

  if (!Array.isArray(fallbackBreakdown)) {
    return [];
  }

  return fallbackBreakdown
    .map((item) => {
      const category = String(item?.category || '').trim() || 'Sem categoria';
      const total = toCurrency(item?.total);
      const share = totalPeriod > 0 ? toPercent((total / totalPeriod) * 100) : 0;
      return {
        category,
        total,
        transactions: 0,
        ticketAverage: 0,
        share
      };
    })
    .sort((left, right) => right.total - left.total);
}

function sanitizeTopMerchants(rawMerchants, totalPeriod) {
  if (!Array.isArray(rawMerchants)) {
    return [];
  }

  return rawMerchants
    .map((merchant) => {
      const total = toCurrency(merchant?.total);
      const transactions = Math.max(0, Math.round(toFiniteNumber(merchant?.transactions)));
      const share = totalPeriod > 0 ? toPercent((total / totalPeriod) * 100) : 0;

      return {
        merchant: String(merchant?.merchant || '').trim() || 'Sem identificação',
        total,
        transactions,
        ticketAverage: toCurrency(merchant?.ticketAverage || (transactions > 0 ? total / transactions : 0)),
        share: toPercent(merchant?.share ?? share)
      };
    })
    .sort((left, right) => right.total - left.total)
    .slice(0, 10);
}

function sanitizeTopTransactions(rawTransactions) {
  if (!Array.isArray(rawTransactions)) {
    return [];
  }

  return rawTransactions
    .map((transaction) => ({
      date: String(transaction?.date || '').trim(),
      title: String(transaction?.title || '').trim(),
      category: String(transaction?.category || '').trim() || 'Outros',
      accountType: String(transaction?.accountType || '').trim() || 'Conta',
      value: toCurrency(transaction?.value)
    }))
    .filter((transaction) => transaction.value > 0 && transaction.title)
    .sort((left, right) => right.value - left.value)
    .slice(0, 20);
}

function sanitizeOutlierTransactions(rawOutliers) {
  if (!Array.isArray(rawOutliers)) {
    return [];
  }

  return rawOutliers
    .map((transaction) => ({
      date: String(transaction?.date || '').trim(),
      title: String(transaction?.title || '').trim(),
      category: String(transaction?.category || '').trim() || 'Outros',
      value: toCurrency(transaction?.value)
    }))
    .filter((transaction) => transaction.value > 0 && transaction.title)
    .sort((left, right) => right.value - left.value)
    .slice(0, 10);
}

function normalizeDeterministicPeriod(period = {}) {
  const deterministic = period?.deterministic || {};
  const fallbackTotal = Array.isArray(period.categoryBreakdown)
    ? period.categoryBreakdown.reduce((sum, item) => sum + toFiniteNumber(item?.total), 0)
    : 0;

  const totalPeriod = toCurrency(deterministic.totalPeriod || period.total || fallbackTotal);
  const periodDays = Math.max(1, Math.round(toFiniteNumber(deterministic.periodDays, 30)));
  const totalInstallments = toCurrency(deterministic.totalInstallments);
  const newConsumption = toCurrency(
    deterministic.newConsumption !== undefined ? deterministic.newConsumption : totalPeriod - totalInstallments
  );
  const dailyAverage = toCurrency(deterministic.dailyAverage || newConsumption / Math.max(periodDays, 1));
  const behavioralAverage = toCurrency(
    deterministic.behavioralAverage || deterministic.mediaComportamental || dailyAverage
  );
  const outlierThreshold = toCurrency(deterministic.outlierThreshold);

  const categoryMetrics = sanitizeCategoryMetrics(deterministic.categoryMetrics, period.categoryBreakdown, totalPeriod);
  const topMerchants = sanitizeTopMerchants(deterministic.topMerchants, totalPeriod);
  const topTransactions = sanitizeTopTransactions(period.topTransactions);
  const outlierTransactions = sanitizeOutlierTransactions(deterministic.outlierTransactions);
  const smartAlerts = uniqueNonEmpty(Array.isArray(deterministic.smartAlerts) ? deterministic.smartAlerts : []);

  const endDate = parseInputDate(period.endDate);
  const currentMonthDays = Math.max(28, Math.round(toFiniteNumber(deterministic?.projections?.currentMonthDays, getDaysInMonth(endDate))));
  const daysRemainingInMonth = Math.max(
    0,
    Math.round(toFiniteNumber(deterministic?.projections?.daysRemainingInMonth, currentMonthDays - endDate.getDate()))
  );

  const projectedAdditionalEndOfMonth = toCurrency(
    deterministic?.projections?.projectedAdditionalEndOfMonth !== undefined
      ? deterministic.projections.projectedAdditionalEndOfMonth
      : behavioralAverage * daysRemainingInMonth
  );
  const projectedEndOfMonth = toCurrency(
    deterministic?.projections?.projectedEndOfMonth !== undefined
      ? deterministic.projections.projectedEndOfMonth
      : totalPeriod + projectedAdditionalEndOfMonth
  );

  const nextMonthDate = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 1);
  const nextMonthDays = Math.max(
    28,
    Math.round(toFiniteNumber(deterministic?.projections?.nextMonthDays, getDaysInMonth(nextMonthDate)))
  );
  const estimatedInstallmentsPerDay = toCurrency(totalInstallments / Math.max(periodDays, 1));
  const projectedNextMonthInstallments = toCurrency(
    deterministic?.projections?.projectedNextMonthInstallments !== undefined
      ? deterministic.projections.projectedNextMonthInstallments
      : estimatedInstallmentsPerDay * nextMonthDays
  );
  const projectedNextMonthConsumption = toCurrency(
    deterministic?.projections?.projectedNextMonthConsumption !== undefined
      ? deterministic.projections.projectedNextMonthConsumption
      : behavioralAverage * nextMonthDays
  );
  const projectedNextMonthTotal = toCurrency(
    deterministic?.projections?.projectedNextMonthTotal !== undefined
      ? deterministic.projections.projectedNextMonthTotal
      : projectedNextMonthInstallments + projectedNextMonthConsumption
  );

  return {
    startDate: String(period.startDate || ''),
    endDate: String(period.endDate || ''),
    totalPeriod,
    periodDays,
    transactionsConsidered: Math.max(0, Math.round(toFiniteNumber(deterministic.transactionsConsidered, period.count))),
    totalInstallments,
    newConsumption,
    dailyAverage,
    behavioralAverage,
    outlierThreshold,
    categoryMetrics,
    topMerchants,
    topTransactions,
    outlierTransactions,
    smartAlerts,
    projections: {
      currentMonthDays,
      daysRemainingInMonth,
      projectedAdditionalEndOfMonth,
      projectedEndOfMonth,
      nextMonthDays,
      projectedNextMonthInstallments,
      projectedNextMonthConsumption,
      projectedNextMonthTotal,
      currentMonthLabel: formatMonthYear(endDate),
      nextMonthLabel: formatMonthYear(nextMonthDate)
    }
  };
}

function buildCategoryComparisons(currentMetrics, previousMetrics) {
  const currentMap = new Map();
  const previousMap = new Map();

  (currentMetrics || []).forEach((metric) => {
    currentMap.set(metric.category, metric);
  });
  (previousMetrics || []).forEach((metric) => {
    previousMap.set(metric.category, metric);
  });

  const categories = new Set([...currentMap.keys(), ...previousMap.keys()]);
  const deltas = [];

  categories.forEach((category) => {
    const current = currentMap.get(category) || {
      category,
      total: 0,
      transactions: 0,
      ticketAverage: 0,
      share: 0
    };
    const previous = previousMap.get(category) || {
      category,
      total: 0,
      transactions: 0,
      ticketAverage: 0,
      share: 0
    };

    const delta = toCurrency(current.total - previous.total);
    deltas.push({
      category,
      current: toCurrency(current.total),
      previous: toCurrency(previous.total),
      delta,
      deltaPercent: calculateGrowthPercent(current.total, previous.total),
      share: toPercent(current.share || 0),
      transactions: Math.max(0, Math.round(toFiniteNumber(current.transactions))),
      ticketAverage: toCurrency(current.ticketAverage)
    });
  });

  const increased = deltas
    .filter((item) => item.delta > 0.01)
    .sort((left, right) => right.delta - left.delta)
    .slice(0, 6);

  const reduced = deltas
    .filter((item) => item.delta < -0.01)
    .sort((left, right) => left.delta - right.delta)
    .slice(0, 6);

  const categoryHighlights = deltas
    .filter((item) => item.current > 0 || item.previous > 0)
    .sort((left, right) => right.current - left.current)
    .slice(0, 8);

  return {
    increased,
    reduced,
    categoryHighlights
  };
}

function buildDeterministicOverview(current, previous, totalDelta, totalDeltaPercent) {
  if (previous.totalPeriod <= 0 && current.totalPeriod > 0) {
    return `No período atual, você registrou ${formatCurrencyBRL(current.totalPeriod)} em despesas. Ainda não há base anterior equivalente para comparação direta.`;
  }

  if (Math.abs(totalDelta) <= 0.01) {
    return `Seu gasto ficou praticamente estável em ${formatCurrencyBRL(current.totalPeriod)} no período atual.`;
  }

  const direction = totalDelta > 0 ? 'acima' : 'abaixo';
  return `Você fechou o período com ${formatCurrencyBRL(current.totalPeriod)}, ${formatCurrencyBRL(Math.abs(totalDelta))} (${Math.abs(
    totalDeltaPercent
  ).toFixed(1)}%) ${direction} do período anterior.`;
}

function buildFallbackActions(baseReport) {
  const criticalActions = [];
  const dispensableCuts = [];

  if (baseReport.increased[0]) {
    criticalActions.push(
      `Defina um limite semanal para ${baseReport.increased[0].category} e acompanhe diariamente para evitar novo pico.`
    );
  }
  if (baseReport.increased[1]) {
    criticalActions.push(
      `Revise os lançamentos de ${baseReport.increased[1].category}; houve aumento de ${formatCurrencyBRL(
        baseReport.increased[1].delta
      )} no período.`
    );
  }
  if (baseReport.indicators.installmentsShare >= 35) {
    criticalActions.push(
      `Seu comprometimento com parcelas está em ${baseReport.indicators.installmentsShare.toFixed(
        1
      )}% do total. Priorize reduzir novas compras parceladas.`
    );
  }

  if (baseReport.categoryHighlights[0]) {
    dispensableCuts.push(
      `Busque reduzir em 10% os gastos de ${baseReport.categoryHighlights[0].category} para aliviar o próximo ciclo.`
    );
  }
  if (baseReport.categoryHighlights[1]) {
    dispensableCuts.push(
      `Consolide compras em ${baseReport.categoryHighlights[1].category} para diminuir gastos recorrentes pequenos.`
    );
  }
  if (baseReport.outlierTransactions[0]) {
    dispensableCuts.push(
      `Evite compras pontuais de alto valor como "${baseReport.outlierTransactions[0].title}" fora de planejamento.`
    );
  }

  return {
    criticalActions: criticalActions.slice(0, 4),
    dispensableCuts: dispensableCuts.slice(0, 4)
  };
}

function buildDefaultProjectionSummary(current) {
  return `Mantendo o padrão atual, a projeção de fechamento de ${current.projections.currentMonthLabel} é ${formatCurrencyBRL(
    current.projections.projectedEndOfMonth
  )}, e para ${current.projections.nextMonthLabel} é ${formatCurrencyBRL(current.projections.projectedNextMonthTotal)}.`;
}

function buildDeterministicConsultantReport(currentPeriod, previousPeriod) {
  const current = normalizeDeterministicPeriod(currentPeriod);
  const previous = normalizeDeterministicPeriod(previousPeriod);
  const totalDelta = toCurrency(current.totalPeriod - previous.totalPeriod);
  const totalDeltaPercent = calculateGrowthPercent(current.totalPeriod, previous.totalPeriod);
  const installmentsShare = current.totalPeriod > 0 ? toPercent((current.totalInstallments / current.totalPeriod) * 100) : 0;
  const comparisons = buildCategoryComparisons(current.categoryMetrics, previous.categoryMetrics);

  const smartAlerts = [
    ...current.smartAlerts,
    ...(totalDeltaPercent >= 20 ? ['O gasto total está acima de 20% em relação ao período anterior.'] : []),
    ...(installmentsShare >= 35
      ? ['Parcelamentos estão elevados para o período e podem reduzir a margem de consumo dos próximos meses.']
      : []),
    ...(current.outlierTransactions.length > 0
      ? [`Foram detectadas ${current.outlierTransactions.length} compra(s) fora do padrão de valor.`]
      : [])
  ];

  const report = {
    overview: buildDeterministicOverview(current, previous, totalDelta, totalDeltaPercent),
    projectionSummary: buildDefaultProjectionSummary(current),
    indicators: {
      periodDays: current.periodDays,
      transactionsCount: current.transactionsConsidered,
      totalPeriod: current.totalPeriod,
      previousTotalPeriod: previous.totalPeriod,
      totalDelta,
      totalDeltaPercent,
      totalInstallments: current.totalInstallments,
      newConsumption: current.newConsumption,
      dailyAverage: current.dailyAverage,
      behavioralAverage: current.behavioralAverage,
      installmentsShare,
      outlierThreshold: current.outlierThreshold
    },
    projections: {
      endOfMonth: {
        monthLabel: current.projections.currentMonthLabel,
        daysRemaining: current.projections.daysRemainingInMonth,
        projectedAdditional: current.projections.projectedAdditionalEndOfMonth,
        projectedTotal: current.projections.projectedEndOfMonth
      },
      nextMonth: {
        monthLabel: current.projections.nextMonthLabel,
        days: current.projections.nextMonthDays,
        projectedInstallments: current.projections.projectedNextMonthInstallments,
        projectedConsumption: current.projections.projectedNextMonthConsumption,
        projectedTotal: current.projections.projectedNextMonthTotal
      }
    },
    increased: comparisons.increased.map((item) => ({
      ...item,
      insight: buildDefaultDeltaInsight(item)
    })),
    reduced: comparisons.reduced.map((item) => ({
      ...item,
      insight: buildDefaultDeltaInsight(item)
    })),
    categoryHighlights: comparisons.categoryHighlights.map((item) => ({
      ...item,
      insight: buildDefaultCategoryInsight(item)
    })),
    topMerchants: current.topMerchants,
    topTransactions: current.topTransactions,
    outlierTransactions: current.outlierTransactions,
    smartAlerts: uniqueNonEmpty(smartAlerts)
  };

  const fallbackActions = buildFallbackActions(report);
  report.criticalActions = fallbackActions.criticalActions;
  report.dispensableCuts = fallbackActions.dispensableCuts;

  report.increased = report.increased.map((item) => ({
    ...item,
    drivers: buildCategoryTransactionDrivers(item.category, current.topTransactions, previous.topTransactions, 'increase')
  }));
  report.reduced = report.reduced.map((item) => ({
    ...item,
    drivers: buildCategoryTransactionDrivers(item.category, current.topTransactions, previous.topTransactions, 'reduction')
  }));

  report.increased = report.increased.map((item) => ({
    ...item,
    insight: buildDefaultDeltaInsight(item)
  }));
  report.reduced = report.reduced.map((item) => ({
    ...item,
    insight: buildDefaultDeltaInsight(item)
  }));

  return report;
}

function buildCategoryTransactionDrivers(category, currentTopTransactions, previousTopTransactions, direction = 'increase') {
  const normalizedCategory = normalizeCategoryKey(category);
  if (!normalizedCategory) {
    return [];
  }

  const aggregateByTitle = (transactions) => {
    const map = new Map();

    (transactions || []).forEach((transaction) => {
      if (normalizeCategoryKey(transaction?.category) !== normalizedCategory) {
        return;
      }

      const title = String(transaction?.title || '').trim();
      const key = normalizeTransactionTitleKey(title) || normalizeCategoryKey(title);
      if (!key) {
        return;
      }

      const current = map.get(key) || {
        key,
        title,
        total: 0
      };

      current.total += toFiniteNumber(transaction?.value);
      if (!current.title || title.length > current.title.length) {
        current.title = title;
      }

      map.set(key, current);
    });

    return map;
  };

  const currentMap = aggregateByTitle(currentTopTransactions);
  const previousMap = aggregateByTitle(previousTopTransactions);
  const keys = new Set([...currentMap.keys(), ...previousMap.keys()]);

  const deltas = [...keys].map((key) => {
    const current = currentMap.get(key);
    const previous = previousMap.get(key);
    const currentTotal = toCurrency(current?.total || 0);
    const previousTotal = toCurrency(previous?.total || 0);
    const delta = toCurrency(currentTotal - previousTotal);

    return {
      title: String(current?.title || previous?.title || '').trim() || 'Sem descrição',
      currentTotal,
      previousTotal,
      delta
    };
  });

  const filtered =
    direction === 'reduction'
      ? deltas.filter((item) => item.delta < -0.01).sort((left, right) => left.delta - right.delta)
      : deltas.filter((item) => item.delta > 0.01).sort((left, right) => right.delta - left.delta);

  return filtered.slice(0, 3);
}

function buildDefaultDeltaInsight(item) {
  const deltaValue = formatCurrencyBRL(Math.abs(item.delta));
  const topDriver = Array.isArray(item.drivers) && item.drivers.length > 0 ? item.drivers[0] : null;

  if (item.delta > 0) {
    if (topDriver) {
      return `Subiu ${deltaValue} no período. Principal impacto: "${topDriver.title}" (${formatCurrencyBRL(topDriver.delta)} a mais).`;
    }

    return `Subiu ${deltaValue} no período e merece acompanhamento mais próximo.`;
  }

  if (item.delta < 0) {
    if (topDriver) {
      return `Reduziu ${deltaValue} no período. Principal alívio: "${topDriver.title}" (${formatCurrencyBRL(Math.abs(topDriver.delta))} a menos).`;
    }

    return `Reduziu ${deltaValue} no período, mantendo tendência positiva.`;
  }

  return 'Manteve padrão estável em relação ao período anterior.';
}

function buildDefaultCategoryInsight(item) {
  if (item.delta > 0) {
    return `Participação relevante no período atual, com aumento de ${formatCurrencyBRL(item.delta)}.`;
  }
  if (item.delta < 0) {
    return `Categoria segue relevante e apresentou queda de ${formatCurrencyBRL(Math.abs(item.delta))}.`;
  }

  return 'Categoria relevante e estável entre os períodos comparados.';
}

function mergeArrayInsightsByCategory(items, insightItems, fallbackBuilder = buildDefaultDeltaInsight) {
  const insightMap = new Map();
  (insightItems || []).forEach((item) => {
    const key = normalizeCategoryKey(item?.category);
    const text = String(item?.insight || '').trim();
    if (!key || !text) {
      return;
    }
    insightMap.set(key, text);
  });

  return (items || []).map((item) => {
    const key = normalizeCategoryKey(item.category);
    const insight = insightMap.get(key) || item.insight || fallbackBuilder(item);
    return {
      ...item,
      insight
    };
  });
}

function mergeNarrativeWithDeterministic(baseReport, aiNarrative) {
  const narrative = aiNarrative && typeof aiNarrative === 'object' ? aiNarrative : {};
  const criticalActions = uniqueNonEmpty([
    ...(Array.isArray(narrative.criticalActions) ? narrative.criticalActions : []),
    ...(Array.isArray(baseReport.criticalActions) ? baseReport.criticalActions : [])
  ]).slice(0, 6);

  const dispensableCuts = uniqueNonEmpty([
    ...(Array.isArray(narrative.dispensableCuts) ? narrative.dispensableCuts : []),
    ...(Array.isArray(baseReport.dispensableCuts) ? baseReport.dispensableCuts : [])
  ]).slice(0, 6);

  const smartAlerts = uniqueNonEmpty([
    ...(Array.isArray(baseReport.smartAlerts) ? baseReport.smartAlerts : []),
    ...(Array.isArray(narrative.smartAlerts) ? narrative.smartAlerts : [])
  ]).slice(0, 8);

  const merged = {
    ...baseReport,
    overview: String(narrative.overview || '').trim() || baseReport.overview,
    projectionSummary: String(narrative.projectionSummary || '').trim() || baseReport.projectionSummary,
    increased: mergeArrayInsightsByCategory(baseReport.increased, narrative.increasedInsights, buildDefaultDeltaInsight),
    reduced: mergeArrayInsightsByCategory(baseReport.reduced, narrative.reducedInsights, buildDefaultDeltaInsight),
    categoryHighlights: mergeArrayInsightsByCategory(
      baseReport.categoryHighlights,
      narrative.categoryInsights,
      buildDefaultCategoryInsight
    ),
    criticalActions,
    dispensableCuts,
    smartAlerts
  };

  return merged;
}

function parseIsoDate(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function toIsoOrEmpty(value) {
  if (!value) {
    return '';
  }

  if (typeof value?.toDate === 'function') {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = parseIsoDate(value);
  return parsed ? parsed.toISOString() : String(value || '');
}

function summarizeTransactionCollection(snapshot) {
  const summary = {
    totalTransactions: 0,
    importedTransactions: 0,
    manualTransactions: 0,
    activeTransactions: 0,
    pendingCategorization: 0,
    autoAcceptedTransactions: 0,
    autoOverriddenTransactions: 0,
    autoBySource: {}
  };

  snapshot.forEach((doc) => {
    const data = doc.data() || {};
    const category = String(data.category || 'Outros').trim() || 'Outros';
    const createdBy = data.createdBy === 'manual' ? 'manual' : 'import';
    const isAutoAssigned = Boolean(data.categoryAutoAssigned);
    const isManuallyEdited = Boolean(data.categoryManuallyEdited);
    const source = String(data.categorySource || 'unknown').trim() || 'unknown';

    summary.totalTransactions += 1;
    summary.activeTransactions += data.active === false ? 0 : 1;
    summary.pendingCategorization += data.active === false ? 0 : category === 'Outros' ? 1 : 0;

    if (createdBy === 'manual') {
      summary.manualTransactions += 1;
    } else {
      summary.importedTransactions += 1;
    }

    if (isAutoAssigned && !isManuallyEdited) {
      summary.autoAcceptedTransactions += 1;
      summary.autoBySource[source] = Number(summary.autoBySource[source] || 0) + 1;
    } else if (isAutoAssigned && isManuallyEdited) {
      summary.autoOverriddenTransactions += 1;
      summary.autoBySource[source] = Number(summary.autoBySource[source] || 0) + 1;
    }
  });

  return summary;
}

function mergeDailyUsage(globalDailyUsage, perUserDailyUsage, userId, dateKey, dailyData) {
  const aiCategorizationRuns = Math.max(0, Math.round(toFiniteNumber(dailyData.aiCategorizationRuns)));
  const aiConsultantRuns = Math.max(0, Math.round(toFiniteNumber(dailyData.aiConsultantRuns)));
  const importOperations = Math.max(0, Math.round(toFiniteNumber(dailyData.importOperations)));
  const importedTransactions = Math.max(0, Math.round(toFiniteNumber(dailyData.importedTransactions)));
  const manualTransactions = Math.max(0, Math.round(toFiniteNumber(dailyData.manualTransactions)));

  if (!globalDailyUsage[dateKey]) {
    globalDailyUsage[dateKey] = {
      dateKey,
      aiCategorizationRuns: 0,
      aiConsultantRuns: 0,
      importOperations: 0,
      importedTransactions: 0,
      manualTransactions: 0
    };
  }

  globalDailyUsage[dateKey].aiCategorizationRuns += aiCategorizationRuns;
  globalDailyUsage[dateKey].aiConsultantRuns += aiConsultantRuns;
  globalDailyUsage[dateKey].importOperations += importOperations;
  globalDailyUsage[dateKey].importedTransactions += importedTransactions;
  globalDailyUsage[dateKey].manualTransactions += manualTransactions;

  if (!perUserDailyUsage[userId]) {
    perUserDailyUsage[userId] = {
      aiCategorizationRunsTotal: 0,
      aiConsultantRunsTotal: 0,
      importOperationsTotal: 0,
      importedTransactionsTotal: 0,
      manualTransactionsTotal: 0
    };
  }

  perUserDailyUsage[userId].aiCategorizationRunsTotal += aiCategorizationRuns;
  perUserDailyUsage[userId].aiConsultantRunsTotal += aiConsultantRuns;
  perUserDailyUsage[userId].importOperationsTotal += importOperations;
  perUserDailyUsage[userId].importedTransactionsTotal += importedTransactions;
  perUserDailyUsage[userId].manualTransactionsTotal += manualTransactions;
}

async function listAllProjectAuthUsers() {
  const users = [];
  let nextPageToken = undefined;

  do {
    const page = await getAuth().listUsers(1000, nextPageToken);
    users.push(...(page.users || []));
    nextPageToken = page.pageToken;
  } while (nextPageToken);

  return users;
}

async function reserveConsultantUsage(userId, appId) {
  const dateKey = getDateKeyInTimezone();
  const usageRef = db.collection('ai_consultant_usage').doc(`${userId}_${dateKey}`);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(usageRef);
    const usedCount = Number(snapshot.data()?.count || 0);

    if (usedCount >= CONSULTANT_DAILY_LIMIT) {
      const limitError = new Error('Daily consultant limit reached');
      limitError.code = 'DAILY_LIMIT_REACHED';
      limitError.usage = {
        limit: CONSULTANT_DAILY_LIMIT,
        used: usedCount,
        remaining: 0,
        dateKey
      };
      throw limitError;
    }

    const nextCount = usedCount + 1;
    const payload = {
      userId,
      appId: appId || null,
      dateKey,
      count: nextCount,
      updatedAt: FieldValue.serverTimestamp()
    };

    if (!snapshot.exists) {
      payload.createdAt = FieldValue.serverTimestamp();
    }

    transaction.set(usageRef, payload, { merge: true });

    return {
      limit: CONSULTANT_DAILY_LIMIT,
      used: nextCount,
      remaining: Math.max(0, CONSULTANT_DAILY_LIMIT - nextCount),
      dateKey
    };
  });
}

async function askGeminiForJson({
  geminiApiKey,
  geminiModel,
  systemInstruction,
  promptText,
  temperature = 0
}) {
  const modelCandidates = buildModelCandidates(geminiModel);
  let lastError = null;

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const candidateModel = modelCandidates[index];
    const geminiResult = await requestGeminiWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          generationConfig: {
            temperature,
            responseMimeType: 'application/json'
          }
        })
      },
      {
        maxRetries: 3,
        baseDelayMs: 450
      }
    );

    if (!geminiResult.ok) {
      const shouldTryNextModel =
        isNotFoundModelError(geminiResult.status, geminiResult.payload) && index < modelCandidates.length - 1;
      if (shouldTryNextModel) {
        continue;
      }

      lastError = {
        ok: false,
        status: geminiResult.status || 500,
        payload: geminiResult.payload,
        model: candidateModel
      };
      break;
    }

    const envelope = safeParseJson(geminiResult.payload);
    const rawText = envelope?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return {
        ok: false,
        status: 502,
        payload: 'Gemini returned an empty response',
        model: candidateModel
      };
    }

    const parsed = safeParseJson(rawText);
    if (!parsed) {
      return {
        ok: false,
        status: 502,
        payload: 'Gemini returned invalid JSON',
        model: candidateModel
      };
    }

    return {
      ok: true,
      data: parsed,
      model: candidateModel
    };
  }

  return (
    lastError || {
      ok: false,
      status: 500,
      payload: 'Gemini request failed on all candidate models',
      model: modelCandidates[0] || geminiModel
    }
  );
}

exports.categorizeTransactions = onRequest(
  {
    invoker: 'public',
    timeoutSeconds: 120,
    memory: '256MiB'
  },
  async (request, response) => {
    setCorsHeaders(request, response);

    if (handlePreflightAndMethod(request, response)) {
      return;
    }

    const decodedToken = await authenticateRequest(request, response);
    if (!decodedToken) {
      return;
    }

    try {
      const items = request.body?.items;
      const categories = request.body?.categories;

      if (!Array.isArray(items) || items.length === 0) {
        response.status(400).json({ error: 'items is required and must be a non-empty array' });
        return;
      }

      if (!Array.isArray(categories) || categories.length === 0) {
        response.status(400).json({ error: 'categories is required and must be a non-empty array' });
        return;
      }

      const geminiApiKey = process.env.GEMINI_API_KEY;
      const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

      if (!geminiApiKey) {
        response.status(500).json({ error: 'Missing GEMINI_API_KEY environment variable' });
        return;
      }

      const promptList = items.map((item) => `${item.index}: "${item.title}"`).join('\n');
      const result = await askGeminiForJson({
        geminiApiKey,
        geminiModel,
        systemInstruction: `Categorize each item strictly using one of these categories: ${categories.join(', ')}. Return only JSON in the format {"index": "category"}.`,
        promptText: promptList,
        temperature: 0
      });

      if (!result.ok) {
        response.status(result.status || 500).json({
          error: 'Gemini request failed',
          details: result.payload,
          model: result.model
        });
        return;
      }

      response.status(200).json({ mapping: result.data });
    } catch (error) {
      response.status(500).json({
        error: 'Unexpected error while categorizing transactions',
        details: error?.message || 'unknown error'
      });
    }
  }
);

exports.analyzeSpendingInsights = onRequest(
  {
    invoker: 'public',
    timeoutSeconds: 120,
    memory: '256MiB'
  },
  async (request, response) => {
    setCorsHeaders(request, response);

    if (handlePreflightAndMethod(request, response)) {
      return;
    }

    const decodedToken = await authenticateRequest(request, response);
    if (!decodedToken) {
      return;
    }

    try {
      const currentPeriod = request.body?.currentPeriod;
      const previousPeriod = request.body?.previousPeriod;
      const filters = request.body?.filters || {};
      const appId = request.body?.appId || null;
      const insightKey = resolveInsightKey(request.body?.insightKey, filters);

      if (!currentPeriod || typeof currentPeriod !== 'object') {
        response.status(400).json({ error: 'currentPeriod is required' });
        return;
      }

      if (!previousPeriod || typeof previousPeriod !== 'object') {
        response.status(400).json({ error: 'previousPeriod is required' });
        return;
      }

      // Daily usage validation is temporarily disabled.
      const usage = {
        limit: CONSULTANT_DAILY_LIMIT,
        used: 0,
        remaining: CONSULTANT_DAILY_LIMIT,
        dateKey: getDateKeyInTimezone()
      };

      if (appId && insightKey) {
        const existingInsightDoc = await db
          .collection(`artifacts/${appId}/users/${decodedToken.uid}/consultor_insights`)
          .doc(insightKey)
          .get();

        if (existingInsightDoc.exists) {
          const existingInsight = existingInsightDoc.data();
          if (existingInsight?.insights && typeof existingInsight.insights === 'object') {
            response.status(200).json({
              insights: existingInsight.insights,
              usage,
              storedInsight: {
                ...existingInsight,
                key: existingInsight.key || insightKey
              },
              fromCache: true
            });
            return;
          }
        }
      }

      const geminiApiKey = process.env.GEMINI_API_KEY;
      const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      if (!geminiApiKey) {
        response.status(500).json({ error: 'Missing GEMINI_API_KEY environment variable' });
        return;
      }

      const baseReport = buildDeterministicConsultantReport(currentPeriod, previousPeriod);
      const promptPayload = {
        filters,
        deterministicBase: {
          indicators: baseReport.indicators,
          projections: baseReport.projections,
          increased: baseReport.increased,
          reduced: baseReport.reduced,
          categoryHighlights: baseReport.categoryHighlights,
          increasedDrivers: baseReport.increased.map((item) => ({
            category: item.category,
            drivers: item.drivers || []
          })),
          reducedDrivers: baseReport.reduced.map((item) => ({
            category: item.category,
            drivers: item.drivers || []
          })),
          topMerchants: baseReport.topMerchants,
          topTransactions: baseReport.topTransactions,
          outlierTransactions: baseReport.outlierTransactions,
          smartAlerts: baseReport.smartAlerts
        }
      };

      const result = await askGeminiForJson({
        geminiApiKey,
        geminiModel,
        systemInstruction:
          'Você é um consultor financeiro pessoal. Sempre retorne JSON válido e somente JSON. Responda em português do Brasil. Não invente números, use apenas os dados recebidos. Gere recomendações práticas, claras e realistas para o consumidor final.',
        promptText:
          'Analise os dados e retorne estritamente este JSON: ' +
          '{"overview":"...","projectionSummary":"...","increasedInsights":[{"category":"...","insight":"..."}],"reducedInsights":[{"category":"...","insight":"..."}],"categoryInsights":[{"category":"...","insight":"..."}],"criticalActions":["..."],"dispensableCuts":["..."],"smartAlerts":["..."]}. ' +
          'Regras: textos objetivos, práticos, úteis para reduzir gastos; sem jargão técnico; destaque aumento/redução por categoria, risco de parcelas e oportunidades de corte. Sempre que possível, cite transações/estabelecimentos específicos que puxaram alta ou queda de cada categoria com base nos drivers fornecidos. Dados: ' +
          JSON.stringify(promptPayload),
        temperature: 0.25
      });

      const insights = result.ok ? mergeNarrativeWithDeterministic(baseReport, result.data) : baseReport;
      const warning =
        result.ok
          ? null
          : {
              error: 'Gemini request failed, deterministic fallback used',
              details: result.payload,
              model: result.model
            };

      const generatedAt = new Date().toISOString();
      const storedInsight = {
        key: insightKey,
        filters: {
          startDate: filters.startDate || '',
          endDate: filters.endDate || '',
          accountType: filters.accountType || 'all',
          category: filters.category || 'all'
        },
        currentPeriod: {
          startDate: currentPeriod.startDate || '',
          endDate: currentPeriod.endDate || ''
        },
        previousPeriod: {
          startDate: previousPeriod.startDate || '',
          endDate: previousPeriod.endDate || ''
        },
        insights,
        model: result.model || geminiModel,
        generatedAt,
        updatedAt: generatedAt,
        warning
      };

      if (appId) {
        await db
          .collection(`artifacts/${appId}/users/${decodedToken.uid}/consultor_insights`)
          .doc(insightKey)
          .set(storedInsight, { merge: true });
      }

      response.status(200).json({
        insights,
        usage,
        storedInsight,
        warning
      });
    } catch (error) {
      response.status(500).json({
        error: 'Unexpected error while generating spending insights',
        details: error?.message || 'unknown error'
      });
    }
  }
);

exports.getAdminDashboard = onRequest(
  {
    invoker: 'public',
    timeoutSeconds: 120,
    memory: '512MiB'
  },
  async (request, response) => {
    setCorsHeaders(request, response);

    if (handlePreflightAndMethod(request, response)) {
      return;
    }

    const decodedToken = await authenticateRequest(request, response);
    if (!decodedToken) {
      return;
    }

    if (!isAdminRequest(decodedToken)) {
      response.status(403).json({
        error: 'Forbidden',
        message: 'Only admin accounts can access this endpoint.'
      });
      return;
    }

    try {
      const appId = String(request.body?.appId || '').trim();
      if (!appId) {
        response.status(400).json({
          error: 'appId is required'
        });
        return;
      }

      const usersSnapshot = await db.collection(`artifacts/${appId}/users`).get();
      const userProfiles = new Map();
      usersSnapshot.forEach((doc) => {
        userProfiles.set(doc.id, {
          uid: doc.id,
          ...(doc.data() || {})
        });
      });

      const authUsers = await listAllProjectAuthUsers();
      authUsers.forEach((authUser) => {
        if (authUser.disabled) {
          return;
        }

        const providerIds = (authUser.providerData || [])
          .map((provider) => String(provider?.providerId || '').trim())
          .filter(Boolean);

        if (providerIds.length === 0) {
          return;
        }

        const existingProfile = userProfiles.get(authUser.uid) || { uid: authUser.uid };
        userProfiles.set(authUser.uid, {
          ...existingProfile,
          uid: authUser.uid,
          email: String(existingProfile.email || authUser.email || '').trim(),
          displayName: String(existingProfile.displayName || authUser.displayName || '').trim(),
          providerIds: providerIds.length > 0 ? providerIds : existingProfile.providerIds || [],
          createdAt: toIsoOrEmpty(existingProfile.createdAt || authUser.metadata?.creationTime),
          lastAccessAt: toIsoOrEmpty(existingProfile.lastAccessAt || authUser.metadata?.lastSignInTime)
        });
      });

      const globalDailyUsage = {};
      const perUserDailyUsage = {};
      const dailySnapshot = await db.collectionGroup('metrics_daily').get();

      dailySnapshot.forEach((doc) => {
        const pathSegments = doc.ref.path.split('/');
        if (
          pathSegments.length < 6 ||
          pathSegments[0] !== 'artifacts' ||
          pathSegments[1] !== appId ||
          pathSegments[2] !== 'users' ||
          pathSegments[4] !== 'metrics_daily'
        ) {
          return;
        }

        const userId = pathSegments[3];
        const dateKey = pathSegments[5];
        const dailyData = doc.data() || {};
        mergeDailyUsage(globalDailyUsage, perUserDailyUsage, userId, dateKey, dailyData);

        if (!userProfiles.has(userId)) {
          userProfiles.set(userId, { uid: userId });
        }
      });

      const userIds = [...userProfiles.keys()];
      const transactionStatsEntries = await Promise.all(
        userIds.map(async (userId) => {
          const transactionSnapshot = await db.collection(`artifacts/${appId}/users/${userId}/transacoes`).get();
          return [userId, summarizeTransactionCollection(transactionSnapshot)];
        })
      );

      const transactionStatsByUser = Object.fromEntries(transactionStatsEntries);
      const now = new Date();
      const cutoff7Days = new Date(now.getTime() - 7 * 86400000);
      const cutoff30Days = new Date(now.getTime() - 30 * 86400000);

      const users = userIds
        .map((userId) => {
          const profile = userProfiles.get(userId) || {};
          const usage = perUserDailyUsage[userId] || {
            aiCategorizationRunsTotal: 0,
            aiConsultantRunsTotal: 0,
            importOperationsTotal: 0,
            importedTransactionsTotal: 0,
            manualTransactionsTotal: 0
          };
          const transactionStats = transactionStatsByUser[userId] || summarizeTransactionCollection({ forEach: () => {} });

          const createdAt = toIsoOrEmpty(profile.createdAt);
          const lastAccessAt = toIsoOrEmpty(profile.lastAccessAt);
          const autoCategorizedTotal =
            transactionStats.autoAcceptedTransactions + transactionStats.autoOverriddenTransactions;
          const automationAcceptedRate =
            autoCategorizedTotal > 0 ? toPercent((transactionStats.autoAcceptedTransactions / autoCategorizedTotal) * 100) : 0;

          return {
            uid: userId,
            email: String(profile.email || '').trim(),
            displayName: String(profile.displayName || '').trim(),
            createdAt,
            lastAccessAt,
            transactions: {
              total: transactionStats.totalTransactions,
              imported: transactionStats.importedTransactions,
              manual: transactionStats.manualTransactions,
              active: transactionStats.activeTransactions,
              pendingCategorization: transactionStats.pendingCategorization
            },
            aiUsage: {
              categorizationRunsTotal: usage.aiCategorizationRunsTotal,
              consultantRunsTotal: usage.aiConsultantRunsTotal
            },
            automation: {
              autoAcceptedTransactions: transactionStats.autoAcceptedTransactions,
              autoOverriddenTransactions: transactionStats.autoOverriddenTransactions,
              autoCategorizedTotal,
              acceptedRate: automationAcceptedRate,
              bySource: transactionStats.autoBySource
            }
          };
        })
        .sort((left, right) => String(right.lastAccessAt || '').localeCompare(String(left.lastAccessAt || '')));

      const totals = users.reduce(
        (accumulator, user) => {
          accumulator.users += 1;
          accumulator.transactions += user.transactions.total;
          accumulator.importedTransactions += user.transactions.imported;
          accumulator.manualTransactions += user.transactions.manual;
          accumulator.pendingCategorization += user.transactions.pendingCategorization;
          accumulator.aiCategorizationRuns += user.aiUsage.categorizationRunsTotal;
          accumulator.aiConsultantRuns += user.aiUsage.consultantRunsTotal;
          accumulator.autoAcceptedTransactions += user.automation.autoAcceptedTransactions;
          accumulator.autoOverriddenTransactions += user.automation.autoOverriddenTransactions;

          const lastAccessDate = parseIsoDate(user.lastAccessAt);
          if (lastAccessDate && lastAccessDate >= cutoff7Days) {
            accumulator.activeUsers7d += 1;
          }
          if (lastAccessDate && lastAccessDate >= cutoff30Days) {
            accumulator.activeUsers30d += 1;
          }

          return accumulator;
        },
        {
          users: 0,
          activeUsers7d: 0,
          activeUsers30d: 0,
          transactions: 0,
          importedTransactions: 0,
          manualTransactions: 0,
          pendingCategorization: 0,
          aiCategorizationRuns: 0,
          aiConsultantRuns: 0,
          autoAcceptedTransactions: 0,
          autoOverriddenTransactions: 0
        }
      );

      const autoTotal = totals.autoAcceptedTransactions + totals.autoOverriddenTransactions;
      const dailyRecords = Object.values(globalDailyUsage).sort((left, right) => String(left.dateKey).localeCompare(right.dateKey));
      const aiCategorizationRunsByDay = dailyRecords.map((record) => ({
        dateKey: record.dateKey,
        count: record.aiCategorizationRuns
      }));
      const aiConsultantRunsByDay = dailyRecords.map((record) => ({
        dateKey: record.dateKey,
        count: record.aiConsultantRuns
      }));
      const importOperationsByDay = dailyRecords.map((record) => ({
        dateKey: record.dateKey,
        count: record.importOperations
      }));
      const importedTransactionsByDay = dailyRecords.map((record) => ({
        dateKey: record.dateKey,
        count: record.importedTransactions
      }));
      const manualTransactionsByDay = dailyRecords.map((record) => ({
        dateKey: record.dateKey,
        count: record.manualTransactions
      }));

      const topUsersByVolume = [...users]
        .sort((left, right) => right.transactions.total - left.transactions.total)
        .slice(0, 10)
        .map((user) => ({
          uid: user.uid,
          email: user.email,
          totalTransactions: user.transactions.total,
          importedTransactions: user.transactions.imported,
          manualTransactions: user.transactions.manual
        }));

      response.status(200).json({
        generatedAt: new Date().toISOString(),
        appId,
        admin: {
          email: decodedToken.email || ''
        },
        totals: {
          ...totals,
          averageTransactionsPerUser: totals.users > 0 ? toCurrency(totals.transactions / totals.users) : 0,
          automationAcceptedRate: autoTotal > 0 ? toPercent((totals.autoAcceptedTransactions / autoTotal) * 100) : 0,
          automationOverrideRate: autoTotal > 0 ? toPercent((totals.autoOverriddenTransactions / autoTotal) * 100) : 0
        },
        dailyUsage: {
          aiCategorizationRunsByDay,
          aiConsultantRunsByDay,
          importOperationsByDay,
          importedTransactionsByDay,
          manualTransactionsByDay
        },
        highlights: {
          usersWithNoTransactions: users.filter((user) => user.transactions.total === 0).length,
          usersWithPendingCategorization: users.filter((user) => user.transactions.pendingCategorization > 0).length,
          topUsersByVolume
        },
        users
      });
    } catch (error) {
      response.status(500).json({
        error: 'Unexpected error while loading admin dashboard',
        details: error?.message || 'unknown error'
      });
    }
  }
);

exports.maintenanceDeduplicateTransactions = onRequest(
  {
    invoker: 'public',
    timeoutSeconds: 540,
    memory: '1GiB'
  },
  async (request, response) => {
    setCorsHeaders(request, response);

    if (handlePreflightAndMethod(request, response)) {
      return;
    }

    const decodedToken = await authenticateRequest(request, response);
    if (!decodedToken) {
      return;
    }

    if (!isAdminRequest(decodedToken)) {
      response.status(403).json({
        error: 'Forbidden',
        message: 'Only admin accounts can run maintenance.'
      });
      return;
    }

    try {
      const appId = String(request.body?.appId || '').trim();
      if (!appId) {
        response.status(400).json({
          error: 'appId is required'
        });
        return;
      }

      const dryRun = Boolean(request.body?.dryRun);
      const targetUserId = String(request.body?.userId || '').trim();

      let userIds = [];
      if (targetUserId) {
        userIds = [targetUserId];
      } else {
        const usersSnapshot = await db.collection(`artifacts/${appId}/users`).get();
        userIds = usersSnapshot.docs.map((doc) => doc.id);
      }

      const startedAt = Date.now();
      const users = [];
      for (const userId of userIds) {
        const result = await deduplicateUserTransactions(appId, userId, { dryRun });
        users.push(result);
      }

      const summary = users.reduce(
        (accumulator, user) => {
          accumulator.usersScanned += 1;
          accumulator.transactionsScanned += Number(user.scannedTransactions || 0);
          accumulator.duplicateGroups += Number(user.duplicateGroups || 0);
          accumulator.duplicateDocs += Number(user.duplicateDocs || 0);
          accumulator.keeperUpdates += Number(user.keeperUpdates || 0);
          if (Number(user.duplicateGroups || 0) > 0) {
            accumulator.usersWithDuplicates += 1;
          }
          return accumulator;
        },
        {
          usersScanned: 0,
          usersWithDuplicates: 0,
          transactionsScanned: 0,
          duplicateGroups: 0,
          duplicateDocs: 0,
          keeperUpdates: 0
        }
      );

      response.status(200).json({
        appId,
        dryRun,
        triggeredBy: decodedToken.email || '',
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        summary,
        users: users.filter((user) => user.duplicateGroups > 0 || user.keeperUpdates > 0)
      });
    } catch (error) {
      response.status(500).json({
        error: 'Unexpected error while deduplicating transactions',
        details: error?.message || 'unknown error'
      });
    }
  }
);

exports.maintenanceResetUserJourney = onRequest(
  {
    invoker: 'public',
    timeoutSeconds: 540,
    memory: '1GiB'
  },
  async (request, response) => {
    setCorsHeaders(request, response);

    if (handlePreflightAndMethod(request, response)) {
      return;
    }

    const decodedToken = await authenticateRequest(request, response);
    if (!decodedToken) {
      return;
    }

    if (!isAdminRequest(decodedToken)) {
      response.status(403).json({
        error: 'Forbidden',
        message: 'Only admin accounts can run maintenance.'
      });
      return;
    }

    try {
      const appId = String(request.body?.appId || '').trim();
      if (!appId) {
        response.status(400).json({
          error: 'appId is required'
        });
        return;
      }

      const userId = String(request.body?.userId || '').trim();
      if (!userId) {
        response.status(400).json({
          error: 'userId is required'
        });
        return;
      }

      const dryRun = Boolean(request.body?.dryRun);
      const startedAt = Date.now();
      const summary = await resetUserJourneyData(appId, userId, {
        dryRun,
        resetBy: decodedToken.email || ''
      });

      response.status(200).json({
        appId,
        userId,
        dryRun,
        triggeredBy: decodedToken.email || '',
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        summary
      });
    } catch (error) {
      response.status(500).json({
        error: 'Unexpected error while resetting user journey',
        details: error?.message || 'unknown error'
      });
    }
  }
);
