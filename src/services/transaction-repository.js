import { generateTransactionDedupKey, generateTransactionHash } from '../utils/transaction-utils.js';
import { buildGoalDocId, getMonthBounds, normalizeMonthlyGoalRecord } from '../utils/goal-utils.js';

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

export class TransactionRepository {
  constructor(db, appId) {
    this.db = db;
    this.appId = appId;
  }

  getCollection(userId) {
    return this.db.collection(`artifacts/${this.appId}/users/${userId}/transacoes`);
  }

  getUserDoc(userId) {
    return this.db.collection(`artifacts/${this.appId}/users`).doc(userId);
  }

  getCategoryCollection(userId) {
    return this.db.collection(`artifacts/${this.appId}/users/${userId}/categorias`);
  }

  getConsultantInsightsCollection(userId) {
    return this.db.collection(`artifacts/${this.appId}/users/${userId}/consultor_insights`);
  }

  getBankAccountCollection(userId) {
    return this.db.collection(`artifacts/${this.appId}/users/${userId}/contas_bancarias`);
  }

  getDailyMetricsCollection(userId) {
    return this.db.collection(`artifacts/${this.appId}/users/${userId}/metrics_daily`);
  }

  getMonthlyGoalsCollection(userId) {
    return this.db.collection(`artifacts/${this.appId}/users/${userId}/metas_mensais`);
  }

  async fetchAll(userId) {
    const snapshot = await this.getCollection(userId).get();
    const transactions = [];
    snapshot.forEach((doc) => {
      const data = doc.data() || {};
      const normalizedTransaction = normalizeStoredTransaction(data);
      transactions.push({
        ...normalizedTransaction,
        docId: doc.id
      });
    });

    return transactions;
  }

  async fetchCategories(userId) {
    const snapshot = await this.getCategoryCollection(userId).get();
    const categories = [];
    snapshot.forEach((doc) => {
      const name = doc.data()?.name;
      if (typeof name === 'string' && name.trim().length > 0) {
        categories.push(name.trim());
      }
    });

    return categories.sort((left, right) => left.localeCompare(right, 'pt-BR'));
  }

  async fetchConsultantInsights(userId) {
    const snapshot = await this.getConsultantInsightsCollection(userId).get();
    const insights = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (!data?.key || typeof data?.insights !== 'object') {
        return;
      }

      insights.push({
        ...data,
        docId: doc.id
      });
    });

    insights.sort((left, right) => String(right.generatedAt || '').localeCompare(String(left.generatedAt || '')));
    return insights;
  }

  async fetchConsultantInsightByKey(userId, insightKey) {
    const key = String(insightKey || '').trim();
    if (!key) {
      return null;
    }

    const doc = await this.getConsultantInsightsCollection(userId).doc(key).get();
    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    if (!data?.insights || typeof data.insights !== 'object') {
      return null;
    }

    return {
      ...data,
      key: data.key || key,
      docId: doc.id
    };
  }

  async fetchMonthlyGoals(userId) {
    const snapshot = await this.getMonthlyGoalsCollection(userId).get();
    const goals = [];
    snapshot.forEach((doc) => {
      const normalizedGoal = normalizeMonthlyGoalRecord({
        ...(doc.data() || {}),
        docId: doc.id
      });
      if (!normalizedGoal.category || normalizedGoal.targetValue <= 0) {
        return;
      }
      goals.push(normalizedGoal);
    });

    goals.sort((left, right) => {
      const monthDiff = String(right.monthKey).localeCompare(String(left.monthKey));
      if (monthDiff !== 0) {
        return monthDiff;
      }

      return String(left.category || '').localeCompare(String(right.category || ''), 'pt-BR');
    });

    return goals;
  }

  async fetchBankAccounts(userId) {
    const snapshot = await this.getBankAccountCollection(userId).get();
    const names = [DEFAULT_BANK_ACCOUNT];

    snapshot.forEach((doc) => {
      const name = doc.data()?.name;
      if (typeof name === 'string' && name.trim().length > 0) {
        names.push(name.trim());
      }
    });

    const unique = [...new Set(names)];
    return unique.sort((left, right) => {
      if (left.toLowerCase() === DEFAULT_BANK_ACCOUNT.toLowerCase()) {
        return -1;
      }
      if (right.toLowerCase() === DEFAULT_BANK_ACCOUNT.toLowerCase()) {
        return 1;
      }

      return left.localeCompare(right, 'pt-BR');
    });
  }

  async bulkInsert(userId, transactions, options = {}) {
    const batchSize = options.batchSize || 100;
    const onProgress = options.onProgress || (() => {});
    const collection = this.getCollection(userId);
    const insertedTransactions = [];

    let currentBatch = this.db.batch();
    let pendingOperations = 0;
    let processed = 0;

    const commitBatch = async () => {
      if (pendingOperations === 0) {
        return;
      }

      await currentBatch.commit();
      processed += pendingOperations;
      onProgress(processed, transactions.length);
      currentBatch = this.db.batch();
      pendingOperations = 0;
    };

    for (const transaction of transactions) {
      const docRef = collection.doc();
      const normalizedTransaction = normalizeStoredTransaction(transaction);
      currentBatch.set(docRef, normalizedTransaction);
      insertedTransactions.push({
        ...normalizedTransaction,
        docId: docRef.id
      });
      pendingOperations += 1;

      if (pendingOperations >= batchSize) {
        await commitBatch();
      }
    }

    await commitBatch();
    return insertedTransactions;
  }

  async createTransaction(userId, transaction) {
    const docRef = this.getCollection(userId).doc();
    const normalizedTransaction = normalizeStoredTransaction(transaction);
    await docRef.set(normalizedTransaction);
    return {
      ...normalizedTransaction,
      docId: docRef.id
    };
  }

  async updateCategory(userId, docId, category, metadata = {}) {
    return this.getCollection(userId)
      .doc(docId)
      .update({
        category,
        ...metadata
      });
  }

  async updateBankAccount(userId, docId, bankAccount) {
    return this.getCollection(userId).doc(docId).update({ bankAccount: normalizeBankAccountName(bankAccount) });
  }

  async updateTitle(userId, docId, payload = {}) {
    return this.getCollection(userId)
      .doc(docId)
      .update({
        title: String(payload.title || '').trim(),
        hash: String(payload.hash || '').trim(),
        dedupKey: String(payload.dedupKey || '').trim()
      });
  }

  async toggleActive(userId, docId, currentState) {
    return this.getCollection(userId).doc(docId).update({ active: !currentState });
  }

  async batchUpdateCategories(userId, updates, options = {}) {
    const batchSize = options.batchSize || 100;
    const onProgress = options.onProgress || (() => {});
    const collection = this.getCollection(userId);

    let currentBatch = this.db.batch();
    let pendingOperations = 0;
    let processed = 0;

    const commitBatch = async () => {
      if (pendingOperations === 0) {
        return;
      }

      await currentBatch.commit();
      processed += pendingOperations;
      onProgress(processed, updates.length);
      currentBatch = this.db.batch();
      pendingOperations = 0;
    };

    for (const update of updates) {
      const docRef = collection.doc(update.docId);
      currentBatch.update(docRef, {
        category: update.category,
        ...(update.metadata || {})
      });
      pendingOperations += 1;

      if (pendingOperations >= batchSize) {
        await commitBatch();
      }
    }

    await commitBatch();
  }

  async createCategory(userId, categoryName) {
    const name = String(categoryName || '').trim();
    if (!name) {
      throw new Error('Category name is required.');
    }

    const normalizedName = normalizeCustomCollectionName(name, 'cat');
    const docId = normalizedName;
    await this.getCategoryCollection(userId)
      .doc(docId)
      .set(
        {
          name,
          normalizedName,
          createdAt: new Date().toISOString()
        },
        { merge: true }
      );

    return name;
  }

  async createBankAccount(userId, bankAccountName) {
    const name = normalizeBankAccountName(bankAccountName);
    if (name.toLowerCase() === DEFAULT_BANK_ACCOUNT.toLowerCase()) {
      return DEFAULT_BANK_ACCOUNT;
    }

    const normalizedName = normalizeCustomCollectionName(name, 'acc');
    const docId = normalizedName;

    await this.getBankAccountCollection(userId)
      .doc(docId)
      .set(
        {
          name,
          normalizedName,
          createdAt: new Date().toISOString()
        },
        { merge: true }
      );

    return name;
  }

  async upsertMonthlyGoal(userId, goalPayload = {}) {
    const normalized = normalizeMonthlyGoalRecord(goalPayload);
    if (!normalized.category || normalized.targetValue <= 0) {
      throw new Error('Monthly goal category and target value are required.');
    }

    const monthBounds = getMonthBounds(normalized.monthKey);
    const docId = String(
      normalized.docId || buildGoalDocId(normalized.monthKey, normalized.category, normalized.accountScope)
    ).trim();
    const nowIso = new Date().toISOString();
    const docRef = this.getMonthlyGoalsCollection(userId).doc(docId);
    const snapshot = await docRef.get();
    const createdAt = snapshot.exists ? String(snapshot.data()?.createdAt || nowIso) : nowIso;
    const payload = {
      monthKey: normalized.monthKey,
      periodStart: normalized.periodStart || monthBounds.startDateInput,
      periodEnd: normalized.periodEnd || monthBounds.endDateInput,
      category: normalized.category,
      accountScope: normalized.accountScope,
      targetValue: Number(normalized.targetValue.toFixed(2)),
      source: normalized.source === 'auto' ? 'auto' : 'manual',
      rationale: normalized.rationale || '',
      active: normalized.active !== false,
      createdAt,
      updatedAt: nowIso
    };

    await docRef.set(payload, { merge: true });

    return {
      ...payload,
      docId
    };
  }

  async batchUpsertMonthlyGoals(userId, goals, options = {}) {
    const batchSize = options.batchSize || 80;
    const onProgress = options.onProgress || (() => {});
    const collection = this.getMonthlyGoalsCollection(userId);
    const normalizedGoals = (goals || [])
      .map((goal) => normalizeMonthlyGoalRecord(goal))
      .filter((goal) => goal.category && goal.targetValue > 0);

    let currentBatch = this.db.batch();
    let pendingOperations = 0;
    let processed = 0;
    const upserted = [];
    const nowIso = new Date().toISOString();

    const commitBatch = async () => {
      if (pendingOperations === 0) {
        return;
      }

      await currentBatch.commit();
      processed += pendingOperations;
      onProgress(processed, normalizedGoals.length);
      currentBatch = this.db.batch();
      pendingOperations = 0;
    };

    for (const goal of normalizedGoals) {
      const monthBounds = getMonthBounds(goal.monthKey);
      const docId = String(goal.docId || buildGoalDocId(goal.monthKey, goal.category, goal.accountScope)).trim();
      const docRef = collection.doc(docId);
      const payload = {
        monthKey: goal.monthKey,
        periodStart: goal.periodStart || monthBounds.startDateInput,
        periodEnd: goal.periodEnd || monthBounds.endDateInput,
        category: goal.category,
        accountScope: goal.accountScope,
        targetValue: Number(goal.targetValue.toFixed(2)),
        source: goal.source === 'auto' ? 'auto' : 'manual',
        rationale: goal.rationale || '',
        active: goal.active !== false,
        updatedAt: nowIso
      };

      currentBatch.set(docRef, payload, { merge: true });
      upserted.push({
        ...payload,
        docId
      });
      pendingOperations += 1;

      if (pendingOperations >= batchSize) {
        await commitBatch();
      }
    }

    await commitBatch();
    return upserted;
  }

  async deleteMonthlyGoal(userId, goalDocId) {
    const docId = String(goalDocId || '').trim();
    if (!docId) {
      return;
    }

    await this.getMonthlyGoalsCollection(userId).doc(docId).delete();
  }

  async deleteMonthlyGoalsByMonth(userId, monthKey, options = {}) {
    const safeMonthKey = String(monthKey || '').trim();
    if (!safeMonthKey) {
      return { removed: 0, total: 0 };
    }

    const batchSize = Math.max(1, Number(options.batchSize || 100));
    const onProgress = options.onProgress || (() => {});
    const collection = this.getMonthlyGoalsCollection(userId);
    const snapshot = await collection.where('monthKey', '==', safeMonthKey).get();
    const docs = snapshot.docs || [];

    if (docs.length === 0) {
      onProgress(0, 0);
      return { removed: 0, total: 0 };
    }

    let currentBatch = this.db.batch();
    let pendingOperations = 0;
    let processed = 0;

    const commitBatch = async () => {
      if (pendingOperations === 0) {
        return;
      }

      await currentBatch.commit();
      processed += pendingOperations;
      onProgress(processed, docs.length);
      currentBatch = this.db.batch();
      pendingOperations = 0;
    };

    for (const doc of docs) {
      currentBatch.delete(doc.ref);
      pendingOperations += 1;

      if (pendingOperations >= batchSize) {
        await commitBatch();
      }
    }

    await commitBatch();
    return {
      removed: processed,
      total: docs.length
    };
  }

  async batchDeleteMonthlyGoals(userId, goalDocIds = [], options = {}) {
    const docIds = [...new Set((goalDocIds || []).map((docId) => String(docId || '').trim()).filter(Boolean))];
    if (docIds.length === 0) {
      return { removed: 0, total: 0 };
    }

    const batchSize = Math.max(1, Number(options.batchSize || 100));
    const onProgress = options.onProgress || (() => {});
    const collection = this.getMonthlyGoalsCollection(userId);

    let currentBatch = this.db.batch();
    let pendingOperations = 0;
    let processed = 0;

    const commitBatch = async () => {
      if (pendingOperations === 0) {
        return;
      }

      await currentBatch.commit();
      processed += pendingOperations;
      onProgress(processed, docIds.length);
      currentBatch = this.db.batch();
      pendingOperations = 0;
    };

    for (const docId of docIds) {
      currentBatch.delete(collection.doc(docId));
      pendingOperations += 1;

      if (pendingOperations >= batchSize) {
        await commitBatch();
      }
    }

    await commitBatch();
    return {
      removed: processed,
      total: docIds.length
    };
  }

  async upsertUserProfile(user) {
    const userId = String(user?.uid || '').trim();
    if (!userId) {
      return;
    }

    const profileRef = this.getUserDoc(userId);
    const nowIso = new Date().toISOString();
    const dateKey = getDateKeyInTimezone();
    const providerIds = (user?.providerData || [])
      .map((provider) => String(provider?.providerId || '').trim())
      .filter(Boolean)
      .slice(0, 8);

    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(profileRef);
      const existing = snapshot.exists ? snapshot.data() || {} : {};

      const payload = {
        uid: userId,
        email: String(user?.email || existing.email || '').trim(),
        displayName: String(user?.displayName || existing.displayName || '').trim(),
        photoURL: String(user?.photoURL || existing.photoURL || '').trim(),
        providerIds: providerIds.length > 0 ? providerIds : existing.providerIds || [],
        lastAccessAt: nowIso,
        lastAccessDateKey: dateKey
      };

      if (!snapshot.exists) {
        payload.createdAt = nowIso;
        payload.createdDateKey = dateKey;
        payload.importOperationsTotal = 0;
        payload.importedTransactionsTotal = 0;
        payload.manualTransactionsTotal = 0;
        payload.aiCategorizationRunsTotal = 0;
        payload.aiConsultantRunsTotal = 0;
      }

      transaction.set(profileRef, payload, { merge: true });
    });
  }

  async recordUsageMetrics(userId, partialCounters = {}) {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) {
      return;
    }

    const counters = {
      aiCategorizationRuns: Math.max(0, Number(partialCounters.aiCategorizationRuns || 0)),
      aiConsultantRuns: Math.max(0, Number(partialCounters.aiConsultantRuns || 0)),
      importOperations: Math.max(0, Number(partialCounters.importOperations || 0)),
      importedTransactions: Math.max(0, Number(partialCounters.importedTransactions || 0)),
      manualTransactions: Math.max(0, Number(partialCounters.manualTransactions || 0))
    };

    const hasAnyIncrement = Object.values(counters).some((value) => value > 0);
    if (!hasAnyIncrement) {
      return;
    }

    const nowIso = new Date().toISOString();
    const dateKey = getDateKeyInTimezone();
    const dailyRef = this.getDailyMetricsCollection(normalizedUserId).doc(dateKey);

    await this.db.runTransaction(async (transaction) => {
      const dailySnapshot = await transaction.get(dailyRef);
      const dailyData = dailySnapshot.exists ? dailySnapshot.data() || {} : {};

      const nextDailyPayload = {
        dateKey,
        aiCategorizationRuns: Number(dailyData.aiCategorizationRuns || 0) + counters.aiCategorizationRuns,
        aiConsultantRuns: Number(dailyData.aiConsultantRuns || 0) + counters.aiConsultantRuns,
        importOperations: Number(dailyData.importOperations || 0) + counters.importOperations,
        importedTransactions: Number(dailyData.importedTransactions || 0) + counters.importedTransactions,
        manualTransactions: Number(dailyData.manualTransactions || 0) + counters.manualTransactions,
        updatedAt: nowIso
      };

      if (!dailySnapshot.exists) {
        nextDailyPayload.createdAt = nowIso;
      }

      transaction.set(dailyRef, nextDailyPayload, { merge: true });
    });
  }
}
