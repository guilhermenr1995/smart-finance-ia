import { CATEGORIES } from '../../constants/categories.js';
import { shiftInputDateByMonths } from '../../utils/date-utils.js';
import { matchesTransactionSearch } from '../../utils/transaction-utils.js';

export function getVisibleTransactions(app) {
  return app.queryService.getVisibleTransactions(app.state.transactions, app.state.getFilterBoundaries());
}

export function getTableTransactions(app, sourceTransactions) {
  const term = app.state.search.term.trim();
  if (!term) {
    return sourceTransactions;
  }

  return sourceTransactions.filter((transaction) =>
    matchesTransactionSearch(transaction, app.state.search.mode, term)
  );
}

export function refreshDashboard(app) {
  const visibleTransactions = getVisibleTransactions(app);
  const trimmedSearchTerm = app.state.search.term.trim();
  const useGlobalBase = Boolean(app.state.search.useGlobalBase) && trimmedSearchTerm.length > 0;
  const searchSourceTransactions = useGlobalBase ? app.state.transactions : visibleTransactions;
  const tableTransactions = getTableTransactions(app, searchSourceTransactions);
  const summary = app.queryService.buildSummary(visibleTransactions);
  const pendingAiCount = app.queryService.getAiCandidates(visibleTransactions).length;
  const activeInsight = app.state.getAiConsultantHistory(app.buildConsultantInsightKey(app.state.filters));
  const activeTableTransactions = tableTransactions.filter((transaction) => transaction.active !== false);
  const matchedTotal = activeTableTransactions.reduce((sum, transaction) => sum + Number(transaction.value || 0), 0);
  const baseTotal = searchSourceTransactions.reduce((sum, transaction) => {
    if (transaction.active === false) {
      return sum;
    }

    return sum + Number(transaction.value || 0);
  }, 0);
  const percentageOfBase = baseTotal > 0 ? (matchedTotal / baseTotal) * 100 : 0;

  const previousStartDate = shiftInputDateByMonths(app.state.filters.startDate, -1);
  const previousEndDate = shiftInputDateByMonths(app.state.filters.endDate, -1);
  const previousBounds = {
    ...app.state.getFilterBoundaries(),
    cycleStart: new Date(`${previousStartDate}T00:00:00`),
    cycleEnd: new Date(`${previousEndDate}T23:59:59`)
  };
  const previousVisibleTransactions = app.queryService.getVisibleTransactions(app.state.transactions, previousBounds);
  const previousSummary = app.queryService.buildSummary(previousVisibleTransactions);

  const availableCategories = [...new Set([...CATEGORIES, ...app.state.userCategories])];

  app.dashboardView.render({
    filters: app.state.filters,
    search: app.state.search,
    summary,
    previousSummary,
    tableTransactions,
    searchTotals: {
      hasSearch: trimmedSearchTerm.length > 0,
      mode: app.state.search.mode,
      term: trimmedSearchTerm,
      useGlobalBase,
      matchedCount: tableTransactions.length,
      matchedTotal,
      baseTotal,
      percentageOfBase
    },
    pendingAiCount,
    categories: availableCategories,
    aiConsultant: {
      ...app.state.aiConsultant,
      report: activeInsight?.insights || null
    }
  });
}
