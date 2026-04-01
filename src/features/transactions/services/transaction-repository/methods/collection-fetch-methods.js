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

class TransactionRepositoryCollectionFetchMethods {
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

  getOpenFinanceConnectionsCollection(userId) {
    return this.db.collection(`artifacts/${this.appId}/users/${userId}/open_finance_conexoes`);
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

  async fetchOpenFinanceConnections(userId) {
    const snapshot = await this.getOpenFinanceConnectionsCollection(userId).get();
    const connections = [];

    snapshot.forEach((doc) => {
      const data = doc.data() || {};
      connections.push({
        id: doc.id,
        bankCode: String(data.bankCode || '').trim(),
        bankName: String(data.bankName || '').trim(),
        provider: String(data.provider || 'mock-aggregator').trim(),
        status: String(data.status || 'unknown').trim(),
        consentExpiresAt: String(data.consentExpiresAt || '').trim(),
        lastSyncAt: String(data.lastSyncAt || '').trim(),
        lastSyncInserted: Number(data.lastSyncInserted || 0),
        createdAt: String(data.createdAt || '').trim(),
        updatedAt: String(data.updatedAt || '').trim(),
        errorMessage: String(data.errorMessage || '').trim()
      });
    });

    connections.sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
    return connections;
  }
}

export function registerCollectionAndFetchMethods(TransactionRepository) {
  applyClassMethods(TransactionRepository, TransactionRepositoryCollectionFetchMethods);
}
