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

class TransactionRepositoryGoalsMethods {
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
}

export function registerGoalsMethods(TransactionRepository) {
  applyClassMethods(TransactionRepository, TransactionRepositoryGoalsMethods);
}
