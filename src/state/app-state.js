import { buildCycleBoundaries, getDefaultCycleRange } from '../utils/date-utils.js';

export class AppState {
  constructor() {
    const defaultRange = getDefaultCycleRange();

    this.user = null;
    this.transactions = [];
    this.userCategories = [];
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
