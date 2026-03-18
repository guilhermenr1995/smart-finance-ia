import { buildCycleBoundaries, getDefaultCycleRange } from '../utils/date-utils.js';

export class AppState {
  constructor() {
    const defaultRange = getDefaultCycleRange();

    this.user = null;
    this.transactions = [];
    this.userCategories = [];
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
    this.transactions = transactions;
  }

  setUserCategories(categories) {
    this.userCategories = categories;
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
