import { CATEGORIES } from '../../constants/categories.js';
import { shiftInputDateByMonths } from '../../utils/date-utils.js';
import {
  buildGoalTargetsByCategory,
  computeGoalTargetForDateRange,
  getGoalScopeLabel,
  getGoalsForReferenceMonth,
  getMonthBounds,
  getMonthKeyFromDate,
  normalizeGoalScope
} from '../../utils/goal-utils.js';
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

  const referenceMonthKey = getMonthKeyFromDate(app.state.filters.endDate || app.state.filters.startDate);
  const referenceMonth = getMonthBounds(referenceMonthKey);
  const activeGoalScope = normalizeGoalScope(app.state.filters.accountType);
  const activeGoalScopeLabel = getGoalScopeLabel(activeGoalScope);
  const monthlyGoals = Array.isArray(app.state.monthlyGoals) ? app.state.monthlyGoals : [];
  const scopedMonthlyGoals = monthlyGoals.filter(
    (goal) => normalizeGoalScope(goal?.accountScope) === activeGoalScope
  );
  const goalTargetsByCategory = buildGoalTargetsByCategory(
    scopedMonthlyGoals,
    app.state.filters.startDate,
    app.state.filters.endDate
  );
  const goalsForReferenceMonth = getGoalsForReferenceMonth(scopedMonthlyGoals, referenceMonthKey, activeGoalScope).map(
    (goal) => {
      const targetForPeriod = computeGoalTargetForDateRange(goal, app.state.filters.startDate, app.state.filters.endDate);
      const currentValue = Number(summary.categoryTotals[goal.category] || 0);
      const progressPercent = targetForPeriod > 0 ? (currentValue / targetForPeriod) * 100 : 0;
      return {
        ...goal,
        targetForPeriod,
        currentValue,
        progressPercent
      };
    }
  );

  const availableCategories = [...new Set([...CATEGORIES, ...app.state.userCategories])];
  const availableBankAccounts = app.state.userBankAccounts || ['Padrão'];

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
    bankAccounts: availableBankAccounts,
    aiConsultant: {
      ...app.state.aiConsultant,
      report: activeInsight?.insights || null
    },
    goals: {
      referenceMonthKey,
      referenceMonthLabel: `${referenceMonth.label} · ${activeGoalScopeLabel}`,
      scope: activeGoalScope,
      scopeLabel: activeGoalScopeLabel,
      items: goalsForReferenceMonth,
      targetsByCategory: goalTargetsByCategory
    }
  });
}
