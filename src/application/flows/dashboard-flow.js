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

function buildRhythmDailyByCategory(consideredTransactions = []) {
  const grouped = new Map();

  consideredTransactions.forEach((transaction) => {
    const dateKey = String(transaction.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return;
    }

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, {
        total: 0,
        categories: {}
      });
    }

    const current = grouped.get(dateKey);
    const category = String(transaction.category || 'Outros').trim() || 'Outros';
    const value = Number(transaction.value || 0);
    current.total += value;
    current.categories[category] = Number(current.categories[category] || 0) + value;
  });

  const days = [...grouped.keys()].sort((left, right) => left.localeCompare(right));
  const categories = [
    ...new Set(
      days.flatMap((day) => Object.keys(grouped.get(day)?.categories || {}))
    )
  ];

  const series = categories.map((category) => ({
    category,
    values: days.map((day) => Number(grouped.get(day)?.categories?.[category] || 0))
  }));

  const dayDetails = days.map((day) => {
    const info = grouped.get(day) || { total: 0, categories: {} };
    const ranking = Object.entries(info.categories)
      .map(([category, value]) => ({
        category,
        value: Number(value || 0),
        percent: info.total > 0 ? (Number(value || 0) / info.total) * 100 : 0
      }))
      .sort((left, right) => right.value - left.value);

    return {
      day,
      total: Number(info.total || 0),
      ranking
    };
  });

  return {
    days,
    categories,
    series,
    details: dayDetails
  };
}

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
  const referenceMonthStartDate = referenceMonth.startDateInput;
  const referenceMonthEndDate = referenceMonth.endDateInput;
  const activeGoalScope = normalizeGoalScope(app.state.filters.accountType);
  const activeGoalScopeLabel = getGoalScopeLabel(activeGoalScope);
  const monthlyGoals = Array.isArray(app.state.monthlyGoals) ? app.state.monthlyGoals : [];
  const scopedMonthlyGoals = monthlyGoals.filter(
    (goal) => normalizeGoalScope(goal?.accountScope) === activeGoalScope
  );
  const goalTargetsByCategory = buildGoalTargetsByCategory(
    scopedMonthlyGoals,
    referenceMonthStartDate,
    referenceMonthEndDate
  );
  const goalsForReferenceMonth = getGoalsForReferenceMonth(scopedMonthlyGoals, referenceMonthKey, activeGoalScope).map(
    (goal) => {
      const targetForPeriod = computeGoalTargetForDateRange(goal, referenceMonthStartDate, referenceMonthEndDate);
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

  const currentDate = new Date(`${app.state.filters.endDate || app.state.filters.startDate}T12:00:00`);
  const totalDaysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const elapsedDays = Math.max(1, Math.min(currentDate.getDate(), totalDaysInMonth));
  const daysRemaining = Math.max(0, totalDaysInMonth - elapsedDays);
  const monthlyBudget = scopedMonthlyGoals.reduce((sum, goal) => sum + Number(goal.targetValue || 0), 0);
  const realized = Number(summary.total || 0);
  const expectedUntilToday = monthlyBudget > 0 ? monthlyBudget * (elapsedDays / totalDaysInMonth) : realized;
  const ratio = expectedUntilToday > 0 ? realized / expectedUntilToday : 1;
  const riskLevel = ratio <= 1 ? 'verde' : ratio <= 1.1 ? 'amarelo' : 'vermelho';
  const averageDailySoFar = realized / elapsedDays;
  const projectedEndOfMonth = realized + averageDailySoFar * daysRemaining;
  const recommendationGap = monthlyBudget > 0 ? Math.max(0, projectedEndOfMonth - monthlyBudget) : 0;
  const rhythmDaily = buildRhythmDailyByCategory(summary.considered || []);

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
    },
    openFinance: app.state.openFinance,
    ritmoDoMes: {
      riskLevel,
      monthlyBudget,
      realized,
      expectedUntilToday,
      daysRemaining,
      recommendationGap,
      selectedCategory: app.state.filters.category,
      daily: rhythmDaily
    }
  });
}
