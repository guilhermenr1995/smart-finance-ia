const DEFAULT_BANK_ACCOUNT = 'Padrão';

function normalizeBankAccountName(value) {
  const name = String(value || '').trim();
  return name || DEFAULT_BANK_ACCOUNT;
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

  getCategoryCollection(userId) {
    return this.db.collection(`artifacts/${this.appId}/users/${userId}/categorias`);
  }

  getConsultantInsightsCollection(userId) {
    return this.db.collection(`artifacts/${this.appId}/users/${userId}/consultor_insights`);
  }

  getBankAccountCollection(userId) {
    return this.db.collection(`artifacts/${this.appId}/users/${userId}/contas_bancarias`);
  }

  async fetchAll(userId) {
    const snapshot = await this.getCollection(userId).get();
    const transactions = [];
    snapshot.forEach((doc) => {
      const data = doc.data() || {};
      transactions.push({
        ...data,
        bankAccount: normalizeBankAccountName(data.bankAccount),
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
      currentBatch.set(docRef, transaction);
      insertedTransactions.push({
        ...transaction,
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
    await docRef.set(transaction);
    return {
      ...transaction,
      docId: docRef.id
    };
  }

  async updateCategory(userId, docId, category) {
    return this.getCollection(userId).doc(docId).update({ category });
  }

  async updateBankAccount(userId, docId, bankAccount) {
    return this.getCollection(userId).doc(docId).update({ bankAccount: normalizeBankAccountName(bankAccount) });
  }

  async updateTitle(userId, docId, title) {
    return this.getCollection(userId).doc(docId).update({ title: String(title || '').trim() });
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
      currentBatch.update(docRef, { category: update.category });
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
}
