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

class TransactionRepositoryMetricsMethods {
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

export function registerMetricsMethods(TransactionRepository) {
  applyClassMethods(TransactionRepository, TransactionRepositoryMetricsMethods);
}
