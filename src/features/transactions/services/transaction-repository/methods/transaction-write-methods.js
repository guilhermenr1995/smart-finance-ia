import {
  DEFAULT_BANK_ACCOUNT,
  APP_TIMEZONE,
  buildGoalDocId,
  getDateKeyInTimezone,
  getMonthBounds,
  normalizeBankAccountName,
  normalizeCustomCollectionName,
  normalizeMonthlyGoalRecord,
  normalizeStoredTransaction,
  normalizeTransactionMetadata
} from '../shared.js';
import { applyClassMethods } from './register-methods.js';

class TransactionRepositoryWriteMethods {
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
}

export function registerTransactionWriteMethods(TransactionRepository) {
  applyClassMethods(TransactionRepository, TransactionRepositoryWriteMethods);
}
