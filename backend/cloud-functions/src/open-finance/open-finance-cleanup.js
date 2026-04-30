const { db } = require('../core/base');
const { sanitizeString, normalizeCategoryKey } = require('../core/domain-utils');

const BASE_CATEGORIES = [
  'Alimentação',
  'Mercado',
  'Transporte',
  'Lazer',
  'Saúde',
  'Assinaturas',
  'Compras',
  'Pet',
  'Casa',
  'Educação',
  'Parcelas',
  'Transferência',
  'Outros'
];

const BASE_CATEGORY_KEYS = new Set(BASE_CATEGORIES.map((category) => normalizeCategoryKey(category)));

function normalizeProviderItemIds(values = []) {
  return [...new Set((values || []).map((value) => sanitizeString(value, 140)).filter(Boolean))];
}

function isOpenFinanceTransactionRecord(data = {}) {
  const origin = String(data.transactionOrigin || '').trim().toLowerCase();
  if (origin === 'open-finance' || origin === 'openfinance') {
    return true;
  }

  if (sanitizeString(data.providerTransactionId, 140)) {
    return true;
  }
  if (sanitizeString(data.providerItemId, 140)) {
    return true;
  }
  if (sanitizeString(data.providerAccountId, 140)) {
    return true;
  }

  const categorySource = String(data.categorySource || '').trim().toLowerCase();
  if (categorySource.includes('open-finance') || categorySource.includes('openfinance')) {
    return true;
  }

  const bankAccount = String(data.bankAccount || '').trim().toLowerCase();
  return bankAccount === 'meu pluggy';
}

function shouldDeleteTransaction(data = {}, options = {}) {
  if (!isOpenFinanceTransactionRecord(data)) {
    return false;
  }

  if (options.deleteAllOpenFinance) {
    return true;
  }

  const targetProviderItemIds = options.targetProviderItemIds instanceof Set ? options.targetProviderItemIds : new Set();
  if (targetProviderItemIds.size <= 0) {
    return true;
  }

  const providerItemId = sanitizeString(data.providerItemId, 140);
  if (!providerItemId) {
    return false;
  }

  return targetProviderItemIds.has(providerItemId);
}

async function deleteOpenFinanceDataForUser(appId, userId, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const deleteAllOpenFinance = Boolean(options.deleteAllOpenFinance);
  const batchSize = Math.max(1, Math.min(450, Number(options.batchSize || 350)));
  const providerItemIds = normalizeProviderItemIds(options.providerItemIds);
  const targetProviderItemIds = new Set(providerItemIds);

  const transactionsRef = db.collection(`artifacts/${appId}/users/${userId}/transacoes`);
  const categoriesRef = db.collection(`artifacts/${appId}/users/${userId}/categorias`);
  const transactionSnapshot = await transactionsRef.get();

  let scanned = 0;
  let matchedOpenFinance = 0;
  let deletedTransactions = 0;
  const deletedCategoryKeys = new Set();
  let pendingBatchOps = 0;
  let currentBatch = db.batch();

  const commitTransactionBatch = async () => {
    if (pendingBatchOps <= 0) {
      return;
    }
    await currentBatch.commit();
    deletedTransactions += pendingBatchOps;
    currentBatch = db.batch();
    pendingBatchOps = 0;
  };

  for (const doc of transactionSnapshot.docs) {
    scanned += 1;
    const data = doc.data() || {};
    if (!shouldDeleteTransaction(data, { deleteAllOpenFinance, targetProviderItemIds })) {
      continue;
    }

    matchedOpenFinance += 1;
    const categoryKey = normalizeCategoryKey(sanitizeString(data.category, 120));
    if (categoryKey) {
      deletedCategoryKeys.add(categoryKey);
    }

    if (dryRun) {
      continue;
    }

    currentBatch.delete(doc.ref);
    pendingBatchOps += 1;
    if (pendingBatchOps >= batchSize) {
      await commitTransactionBatch();
    }
  }

  if (!dryRun) {
    await commitTransactionBatch();
  } else {
    deletedTransactions = matchedOpenFinance;
  }

  const remainingTransactionsSnapshot = dryRun ? transactionSnapshot : await transactionsRef.get();
  const remainingCategoryKeys = new Set();
  remainingTransactionsSnapshot.forEach((doc) => {
    const data = doc.data() || {};
    const categoryKey = normalizeCategoryKey(sanitizeString(data.category, 120));
    if (categoryKey) {
      remainingCategoryKeys.add(categoryKey);
    }
  });

  const categorySnapshot = await categoriesRef.get();
  let matchedCategoryDocs = 0;
  let deletedCategoryDocs = 0;
  const deletedCategories = [];
  pendingBatchOps = 0;
  currentBatch = db.batch();

  const commitCategoryBatch = async () => {
    if (pendingBatchOps <= 0) {
      return;
    }
    await currentBatch.commit();
    deletedCategoryDocs += pendingBatchOps;
    currentBatch = db.batch();
    pendingBatchOps = 0;
  };

  for (const doc of categorySnapshot.docs) {
    const data = doc.data() || {};
    const name = sanitizeString(data.name, 120);
    if (!name) {
      continue;
    }

    const categoryKey = normalizeCategoryKey(name);
    if (!categoryKey || BASE_CATEGORY_KEYS.has(categoryKey)) {
      continue;
    }

    if (!deletedCategoryKeys.has(categoryKey)) {
      continue;
    }

    if (remainingCategoryKeys.has(categoryKey)) {
      continue;
    }

    matchedCategoryDocs += 1;
    deletedCategories.push(name);

    if (dryRun) {
      continue;
    }

    currentBatch.delete(doc.ref);
    pendingBatchOps += 1;
    if (pendingBatchOps >= batchSize) {
      await commitCategoryBatch();
    }
  }

  if (!dryRun) {
    await commitCategoryBatch();
  } else {
    deletedCategoryDocs = matchedCategoryDocs;
  }

  return {
    appId,
    userId,
    scanned,
    matchedOpenFinance,
    deletedTransactions,
    matchedCategoryDocs,
    deletedCategoryDocs,
    deletedCategories: [...new Set(deletedCategories)].sort((left, right) => left.localeCompare(right, 'pt-BR')),
    providerItemIds,
    deleteAllOpenFinance
  };
}

module.exports = {
  BASE_CATEGORIES,
  isOpenFinanceTransactionRecord,
  deleteOpenFinanceDataForUser
};
