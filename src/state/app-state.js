import { buildCycleBoundaries, getDefaultCycleRange } from '../utils/date-utils.js';
import { normalizeMonthlyGoalRecord } from '../utils/goal-utils.js';
import { generateTransactionDedupKey, generateTransactionHash } from '../utils/transaction-utils.js';

const DEFAULT_BANK_ACCOUNT = 'Padrão';

export class AppState {
  constructor() {
    const defaultRange = getDefaultCycleRange();

    this.user = null;
    this.transactions = [];
    this.userCategories = [];
    this.userBankAccounts = [DEFAULT_BANK_ACCOUNT];
    this.monthlyGoals = [];
    this.search = {
      mode: 'description',
      term: '',
      useGlobalBase: false
    };
    this.aiConsultant = {
      report: null,
      usage: {
        limit: 3,
        used: 0,
        remaining: 3,
        dateKey: ''
      },
      historyByKey: {}
    };
    this.filters = {
      startDate: defaultRange.startDate,
      endDate: defaultRange.endDate,
      accountType: 'all',
      category: 'all'
    };
    this.installPromptEvent = null;
  }

  setUser(user) {
    this.user = user;
  }

  setTransactions(transactions) {
    const byDocId = new Map();
    const withoutDocId = [];

    (transactions || []).forEach((transaction) => {
      if (!transaction || typeof transaction !== 'object') {
        return;
      }

      const docId = String(transaction.docId || '').trim();
      const normalized = {
        ...transaction,
        hash: String(transaction.hash || '').trim() || generateTransactionHash(transaction),
        dedupKey: String(transaction.dedupKey || '').trim() || generateTransactionDedupKey(transaction)
      };

      if (!docId) {
        withoutDocId.push(normalized);
        return;
      }

      if (!byDocId.has(docId)) {
        byDocId.set(docId, normalized);
        return;
      }

      const current = byDocId.get(docId);
      const currentUpdatedAt = String(current?.lastCategoryUpdateAt || current?.createdAt || '');
      const incomingUpdatedAt = String(normalized?.lastCategoryUpdateAt || normalized?.createdAt || '');
      byDocId.set(docId, incomingUpdatedAt > currentUpdatedAt ? normalized : current);
    });

    this.transactions = [...byDocId.values(), ...withoutDocId];
  }

  setUserCategories(categories) {
    this.userCategories = categories;
  }

  setUserBankAccounts(bankAccounts) {
    const validNames = (bankAccounts || [])
      .map((name) => String(name || '').trim())
      .filter(Boolean);
    const unique = [...new Set(validNames)];

    if (!unique.some((name) => name.toLowerCase() === DEFAULT_BANK_ACCOUNT.toLowerCase())) {
      unique.unshift(DEFAULT_BANK_ACCOUNT);
    }

    this.userBankAccounts = unique.sort((left, right) => {
      if (left.toLowerCase() === DEFAULT_BANK_ACCOUNT.toLowerCase()) {
        return -1;
      }
      if (right.toLowerCase() === DEFAULT_BANK_ACCOUNT.toLowerCase()) {
        return 1;
      }

      return left.localeCompare(right, 'pt-BR');
    });
  }

  setMonthlyGoals(goals) {
    const normalized = (goals || [])
      .map((goal) => normalizeMonthlyGoalRecord(goal))
      .filter((goal) => goal.category && goal.targetValue > 0);

    const dedupedByDocId = new Map();
    normalized.forEach((goal) => {
      dedupedByDocId.set(goal.docId, goal);
    });

    this.monthlyGoals = [...dedupedByDocId.values()].sort((left, right) => {
      const monthDiff = String(right.monthKey).localeCompare(String(left.monthKey));
      if (monthDiff !== 0) {
        return monthDiff;
      }

      return String(left.category || '').localeCompare(String(right.category || ''), 'pt-BR');
    });
  }

  upsertMonthlyGoal(goal) {
    if (!goal) {
      return;
    }

    const normalized = normalizeMonthlyGoalRecord(goal);
    if (!normalized.category || normalized.targetValue <= 0) {
      return;
    }

    const nextGoals = [...this.monthlyGoals];
    const currentIndex = nextGoals.findIndex((item) => item.docId === normalized.docId);
    if (currentIndex >= 0) {
      nextGoals[currentIndex] = normalized;
    } else {
      nextGoals.push(normalized);
    }

    this.setMonthlyGoals(nextGoals);
  }

  removeMonthlyGoal(docId) {
    const safeDocId = String(docId || '').trim();
    if (!safeDocId) {
      return;
    }

    this.monthlyGoals = this.monthlyGoals.filter((goal) => goal.docId !== safeDocId);
  }

  updateSearch(partialSearch) {
    this.search = {
      ...this.search,
      ...partialSearch
    };
  }

  setAiConsultantReport(report) {
    this.aiConsultant = {
      ...this.aiConsultant,
      report
    };
  }

  setAiConsultantUsage(usage) {
    this.aiConsultant = {
      ...this.aiConsultant,
      usage: {
        ...this.aiConsultant.usage,
        ...(usage || {})
      }
    };
  }

  setAiConsultantHistory(records) {
    const historyByKey = {};
    (records || []).forEach((record) => {
      if (!record?.key) {
        return;
      }

      historyByKey[record.key] = record;
    });

    this.aiConsultant = {
      ...this.aiConsultant,
      historyByKey
    };
  }

  upsertAiConsultantHistory(record) {
    if (!record?.key) {
      return;
    }

    this.aiConsultant = {
      ...this.aiConsultant,
      report: record.insights || this.aiConsultant.report,
      historyByKey: {
        ...(this.aiConsultant.historyByKey || {}),
        [record.key]: record
      }
    };
  }

  getAiConsultantHistory(key) {
    if (!key) {
      return null;
    }

    return this.aiConsultant.historyByKey?.[key] || null;
  }

  updateFilters(partialFilters) {
    this.filters = {
      ...this.filters,
      ...partialFilters
    };
  }

  setInstallPromptEvent(promptEvent) {
    this.installPromptEvent = promptEvent;
  }

  getFilterBoundaries() {
    const { cycleStart, cycleEnd } = buildCycleBoundaries(this.filters.startDate, this.filters.endDate);

    return {
      ...this.filters,
      cycleStart,
      cycleEnd
    };
  }
}
