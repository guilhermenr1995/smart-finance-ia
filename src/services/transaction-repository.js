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

  async fetchAll(userId) {
    const snapshot = await this.getCollection(userId).get();
    const transactions = [];
    snapshot.forEach((doc) => {
      transactions.push({
        ...doc.data(),
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

  async updateCategory(userId, docId, category) {
    return this.getCollection(userId).doc(docId).update({ category });
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

    const normalizedName = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);

    const docId = normalizedName || `cat-${Date.now()}`;
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
}
