import {
  getGoalScopeLabel,
  getMonthBounds,
  getMonthKeyFromDate,
  normalizeGoalScope,
  normalizeMonthlyGoalRecord
} from '../../utils/goal-utils.js';
import { shiftInputDateByMonths } from '../../utils/date-utils.js';
import { getDisplayCategory, getTransactionTitleMatchKey } from '../../utils/transaction-utils.js';

const DISCRETIONARY_CATEGORIES = new Set(['alimentacao', 'lazer', 'compras', 'assinaturas', 'outros', 'pet']);
const PROTECTED_CATEGORIES = new Set(['parcelas', 'transferencia']);
const FIXED_CATEGORY_KEYWORDS = [
  'trabalho',
  'imposto',
  'impostos',
  'tributo',
  'tributos',
  'taxa',
  'taxas',
  'inss',
  'mei',
  'das',
  'aluguel',
  'condominio',
  'financiamento',
  'seguro'
];

function normalizeCategoryKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isMonthClosed(monthKey, referenceDate = new Date()) {
  const safeMonthKey = String(monthKey || '').trim();
  const currentMonthKey = getMonthKeyFromDate(referenceDate);
  return safeMonthKey < currentMonthKey;
}

function resolveReferenceMonthKey(app) {
  const dashboardEndDate = String(app?.dashboardView?.endDateInput?.value || '').trim();
  const dashboardStartDate = String(app?.dashboardView?.startDateInput?.value || '').trim();
  const filtersEndDate = String(app?.state?.filters?.endDate || '').trim();
  const filtersStartDate = String(app?.state?.filters?.startDate || '').trim();

  return getMonthKeyFromDate(dashboardEndDate || dashboardStartDate || filtersEndDate || filtersStartDate || new Date());
}

function resolveGoalScope(app, preferredScope = '') {
  return normalizeGoalScope(preferredScope || app?.state?.filters?.accountType || 'all');
}

function transactionMatchesGoalScope(transaction, goalScope) {
  if (!transaction) {
    return false;
  }

  if (goalScope === 'all') {
    return true;
  }

  return String(transaction.accountType || '').trim() === goalScope;
}

function resolveCategoryGoalProfile(categoryKey) {
  if (PROTECTED_CATEGORIES.has(categoryKey)) {
    return 'protected';
  }

  if (DISCRETIONARY_CATEGORIES.has(categoryKey)) {
    return 'discretionary';
  }

  if (FIXED_CATEGORY_KEYWORDS.some((keyword) => categoryKey.includes(keyword))) {
    return 'fixed';
  }

  return 'regular';
}

function summarizeHistoryForAutoGoals(transactions, monthKeys) {
  const totalsByCategoryMonth = new Map();
  const countsByCategoryMonth = new Map();
  const merchantTotalsByCategory = new Map();
  const categoryLabelByKey = new Map();

  const validMonthKeys = new Set(monthKeys);
  (transactions || []).forEach((transaction) => {
    if (!transaction || transaction.active === false) {
      return;
    }

    const value = Math.abs(Number(transaction.value || 0));
    if (!Number.isFinite(value) || value <= 0) {
      return;
    }

    const monthKey = getMonthKeyFromDate(transaction.date);
    if (!validMonthKeys.has(monthKey)) {
      return;
    }

    const category = String(getDisplayCategory(transaction) || transaction.category || 'Outros').trim() || 'Outros';
    const categoryKey = normalizeCategoryKey(category);
    if (!categoryLabelByKey.has(categoryKey) || categoryLabelByKey.get(categoryKey) === 'Outros') {
      categoryLabelByKey.set(categoryKey, category);
    }

    const totalsKey = `${monthKey}__${categoryKey}`;
    totalsByCategoryMonth.set(totalsKey, (totalsByCategoryMonth.get(totalsKey) || 0) + value);
    countsByCategoryMonth.set(totalsKey, (countsByCategoryMonth.get(totalsKey) || 0) + 1);

    const merchantKey = getTransactionTitleMatchKey(transaction.title || '').slice(0, 80);
    if (!merchantKey) {
      return;
    }

    const categoryMerchants = merchantTotalsByCategory.get(categoryKey) || new Map();
    const previousMerchant = categoryMerchants.get(merchantKey) || { title: String(transaction.title || '').trim(), total: 0 };
    previousMerchant.total += value;
    if (!previousMerchant.title || String(transaction.title || '').trim().length > previousMerchant.title.length) {
      previousMerchant.title = String(transaction.title || '').trim();
    }
    categoryMerchants.set(merchantKey, previousMerchant);
    merchantTotalsByCategory.set(categoryKey, categoryMerchants);
  });

  const categories = new Map();
  totalsByCategoryMonth.forEach((total, key) => {
    const [monthKey, categoryKey] = key.split('__');
    const monthIndex = monthKeys.indexOf(monthKey);
    if (monthIndex < 0) {
      return;
    }

    const current = categories.get(categoryKey) || {
      category: categoryLabelByKey.get(categoryKey) || 'Outros',
      values: monthKeys.map(() => 0),
      counts: monthKeys.map(() => 0)
    };

    current.values[monthIndex] = Number(total.toFixed(2));
    current.counts[monthIndex] = Number(countsByCategoryMonth.get(key) || 0);

    categories.set(categoryKey, current);
  });

  return {
    categories: [...categories.values()],
    merchantTotalsByCategory
  };
}

function calculateAverage(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function calculateMedian(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const sortedValues = [...values].map((value) => Number(value || 0)).sort((left, right) => left - right);
  const middleIndex = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 0) {
    return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
  }

  return sortedValues[middleIndex];
}

function selectHistoryMonthKeys(monthlyCoverage, targetMonthKey) {
  const sortedCoverage = [...monthlyCoverage].filter(Boolean).sort((left, right) => left.localeCompare(right));
  const priorMonths = sortedCoverage.filter((monthKey) => monthKey < targetMonthKey);
  if (priorMonths.length >= 3) {
    return priorMonths.slice(-3);
  }

  const fallbackMonths = [...priorMonths];
  if (sortedCoverage.includes(targetMonthKey)) {
    fallbackMonths.push(targetMonthKey);
  }

  return fallbackMonths.slice(-3);
}

function getConservativeReductionPercent(referenceValue) {
  const safeValue = Math.max(0, Number(referenceValue || 0));
  if (safeValue <= 1000) {
    return 0.1;
  }

  if (safeValue >= 5000) {
    return 0.15;
  }

  const progress = (safeValue - 1000) / 4000;
  return Number((0.1 + progress * 0.05).toFixed(4));
}

function buildSummaryForDateRange(app, transactions, startDateInput, endDateInput) {
  const startDate = String(startDateInput || '').trim();
  const endDate = String(endDateInput || '').trim();
  if (!startDate || !endDate) {
    return {
      categoryTotals: {},
      sortedCategories: []
    };
  }

  const bounds = {
    accountType: 'all',
    category: 'all',
    cycleStart: new Date(`${startDate}T00:00:00`),
    cycleEnd: new Date(`${endDate}T23:59:59`)
  };
  const visibleTransactions = app.queryService.getVisibleTransactions(transactions, bounds);
  return app.queryService.buildSummary(visibleTransactions);
}

function resolveMonthProgress(targetMonthKey, totalDays, referenceDate) {
  const safeTotalDays = Math.max(1, Number(totalDays || 1));
  const safeReferenceDate = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime()) ? referenceDate : new Date();
  const referenceMonthKey = getMonthKeyFromDate(safeReferenceDate);

  if (targetMonthKey < referenceMonthKey) {
    return {
      elapsedDays: safeTotalDays,
      remainingDays: 0
    };
  }

  if (targetMonthKey > referenceMonthKey) {
    return {
      elapsedDays: 0,
      remainingDays: safeTotalDays
    };
  }

  const elapsedDays = clamp(safeReferenceDate.getDate(), 1, safeTotalDays);
  return {
    elapsedDays,
    remainingDays: Math.max(0, safeTotalDays - elapsedDays)
  };
}

function buildGoalRationale(category, metrics, topMerchantTitle, reductionPercent, profileType = 'regular') {
  const latest = Number(metrics.values[metrics.values.length - 1] || 0);
  const average = Number(metrics.average || 0);
  const countAverage = Number(metrics.countAverage || 0);
  const latestCount = Number(metrics.counts[metrics.counts.length - 1] || 0);
  const categoryKey = normalizeCategoryKey(category);

  if (profileType === 'protected') {
    return 'Categoria de compromisso financeiro recorrente, com meta mantida próxima ao histórico para ficar realista.';
  }

  if (profileType === 'fixed') {
    return 'Categoria de custo mais fixo. A meta foi definida de forma conservadora para evitar cortes inviáveis.';
  }

  if (categoryKey.includes('alimentacao') && latestCount < countAverage - 1) {
    return 'Meta reduzida porque você já está indo menos vezes a restaurantes, mantendo um padrão sustentável.';
  }

  if (latest > average * 1.14 && reductionPercent >= 0.08) {
    return `Meta com redução gradual para corrigir o pico recente de gastos sem ser agressiva demais.`;
  }

  if (topMerchantTitle) {
    return `Baseada no seu comportamento recorrente, com foco em manter controle sobre gastos como "${topMerchantTitle}".`;
  }

  if (latestCount < countAverage) {
    return 'Meta ajustada para consolidar a redução natural de frequência observada nos últimos meses.';
  }

  return 'Meta definida pela média recente do seu comportamento, com margem saudável para reduzir excessos.';
}

function buildAutomaticGoalSuggestions(app, targetMonthKey, goalScope) {
  const activeTransactions = (app.state.transactions || []).filter(
    (transaction) => transaction.active !== false && transactionMatchesGoalScope(transaction, goalScope)
  );
  if (activeTransactions.length === 0) {
    return {
      monthKeys: [],
      suggestions: []
    };
  }

  const monthlyCoverage = new Set(
    activeTransactions.map((transaction) => getMonthKeyFromDate(transaction.date)).filter(Boolean)
  );
  const monthKeys = selectHistoryMonthKeys(monthlyCoverage, targetMonthKey);

  if (monthKeys.length < 2) {
    return {
      monthKeys,
      suggestions: []
    };
  }

  const targetMonth = getMonthBounds(targetMonthKey);
  const startDateInput = String(app?.state?.filters?.startDate || targetMonth.startDateInput).trim() || targetMonth.startDateInput;
  const endDateInput = String(app?.state?.filters?.endDate || targetMonth.endDateInput).trim() || targetMonth.endDateInput;
  const previousStartDate = shiftInputDateByMonths(startDateInput, -1);
  const previousEndDate = shiftInputDateByMonths(endDateInput, -1);

  const currentSummary = buildSummaryForDateRange(app, activeTransactions, startDateInput, endDateInput);
  const previousSummary = buildSummaryForDateRange(app, activeTransactions, previousStartDate, previousEndDate);
  const categories = [
    ...new Set([...(currentSummary.sortedCategories || []), ...(previousSummary.sortedCategories || [])])
  ];

  const parsedFilterEnd = new Date(`${endDateInput}T12:00:00`);
  const now = new Date();
  const progressReferenceDate =
    parsedFilterEnd instanceof Date && !Number.isNaN(parsedFilterEnd.getTime()) && parsedFilterEnd < now
      ? parsedFilterEnd
      : now;
  const { elapsedDays, remainingDays } = resolveMonthProgress(targetMonthKey, targetMonth.totalDays, progressReferenceDate);

  const suggestions = categories
    .map((categoryName) => {
      const category = String(categoryName || 'Outros').trim() || 'Outros';
      const previousTotal = Math.max(0, Number(previousSummary.categoryTotals?.[category] || 0));
      const currentTotal = Math.max(0, Number(currentSummary.categoryTotals?.[category] || 0));
      if (previousTotal <= 0 && currentTotal <= 0) {
        return null;
      }

      const reductionPercent = getConservativeReductionPercent(Math.max(previousTotal, currentTotal));
      let targetValue = 0;
      let rationale = '';

      if (previousTotal > currentTotal && previousTotal > 0) {
        targetValue = previousTotal * (1 - reductionPercent);
        rationale = `Meta definida ${(reductionPercent * 100).toFixed(1)}% abaixo do período anterior para consolidar uma redução sustentável.`;
      } else {
        const safeElapsedDays = Math.max(1, elapsedDays);
        const behaviorDailyAverage = currentTotal / safeElapsedDays;
        const reducedDailyAverage = behaviorDailyAverage * (1 - reductionPercent);
        const projectedRemainingSpend = reducedDailyAverage * remainingDays;
        targetValue = currentTotal + projectedRemainingSpend;

        if (remainingDays <= 0) {
          targetValue = currentTotal;
        }

        rationale = `Meta projetada com base no gasto atual e redução de ${(reductionPercent * 100).toFixed(1)}% na média diária para os ${remainingDays} dia(s) restantes.`;
      }

      if (!Number.isFinite(targetValue) || targetValue <= 0) {
        return null;
      }

      targetValue = Number(targetValue.toFixed(2));

      return {
        monthKey: targetMonthKey,
        category,
        targetValue,
        source: 'auto',
        rationale
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.targetValue - left.targetValue);

  return {
    monthKeys,
    suggestions
  };
}

function mergeMonthlyGoals(currentGoals, upsertedGoals) {
  const merged = new Map((currentGoals || []).map((goal) => [goal.docId, goal]));
  (upsertedGoals || []).forEach((goal) => {
    const normalized = normalizeMonthlyGoalRecord(goal);
    merged.set(normalized.docId, normalized);
  });
  return [...merged.values()];
}

export async function saveMonthlyGoal(app, payload = {}) {
  if (!app.state.user) {
    return false;
  }

  const category = String(payload.category || '').trim();
  const targetValue = Number(payload.targetValue || 0);
  const monthKey = String(payload.monthKey || resolveReferenceMonthKey(app)).trim();
  const goalScope = resolveGoalScope(app, payload.accountScope);

  if (!category) {
    app.authView.showMessage('Selecione uma categoria para a meta.', 'error');
    return false;
  }

  if (!Number.isFinite(targetValue) || targetValue <= 0) {
    app.authView.showMessage('Informe um valor mensal válido para a meta.', 'error');
    return false;
  }

  if (isMonthClosed(monthKey)) {
    app.authView.showMessage('Não é possível criar/editar metas para meses já encerrados.', 'error');
    return false;
  }

  try {
    const saved = await app.repository.upsertMonthlyGoal(app.state.user.uid, {
      docId: payload.docId,
      monthKey,
      category,
      accountScope: goalScope,
      targetValue,
      source: payload.source === 'auto' ? 'auto' : 'manual',
      rationale: payload.rationale || '',
      active: true
    });

    if (!app.state.userCategories.some((item) => normalizeCategoryKey(item) === normalizeCategoryKey(category))) {
      try {
        await app.repository.createCategory(app.state.user.uid, category);
      } catch (categoryError) {
        console.warn('Falha ao sincronizar categoria ao salvar meta:', categoryError);
      }
      app.state.setUserCategories([...app.state.userCategories, category]);
    }

    app.state.upsertMonthlyGoal(saved);
    app.persistTransactionsCache();
    app.refreshDashboard();
    app.authView.showMessage('Meta mensal salva com sucesso.', 'success');
    return true;
  } catch (error) {
    app.authView.showMessage(app.normalizeError(error), 'error');
    return false;
  }
}

export async function deleteMonthlyGoal(app, goalDocId) {
  if (!app.state.user) {
    return false;
  }

  const safeDocId = String(goalDocId || '').trim();
  if (!safeDocId) {
    return false;
  }

  try {
    await app.repository.deleteMonthlyGoal(app.state.user.uid, safeDocId);
    app.state.removeMonthlyGoal(safeDocId);
    app.persistTransactionsCache();
    app.refreshDashboard();
    app.authView.showMessage('Meta removida com sucesso.', 'success');
    return true;
  } catch (error) {
    app.authView.showMessage(app.normalizeError(error), 'error');
    return false;
  }
}

export async function generateAutomaticMonthlyGoals(app) {
  if (!app.state.user) {
    return false;
  }

  const targetMonthKey = resolveReferenceMonthKey(app);
  const goalScope = resolveGoalScope(app);
  const goalScopeLabel = getGoalScopeLabel(goalScope);
  if (isMonthClosed(targetMonthKey)) {
    app.authView.showMessage('A geração automática só é permitida para o mês atual ou meses futuros.', 'error');
    return false;
  }

  const generation = buildAutomaticGoalSuggestions(app, targetMonthKey, goalScope);
  if (generation.monthKeys.length < 2) {
    app.authView.showMessage('Você precisa de pelo menos 1 período anterior para gerar metas automáticas.', 'error');
    return false;
  }

  if (generation.suggestions.length === 0) {
    app.authView.showMessage('Não encontramos dados suficientes para gerar metas automáticas neste momento.', 'error');
    return false;
  }

  const existingGoalsInMonth = (app.state.monthlyGoals || []).filter(
    (goal) =>
      goal.active !== false &&
      goal.monthKey === targetMonthKey &&
      normalizeGoalScope(goal.accountScope) === goalScope
  );
  const suggestionsToPersist = generation.suggestions.map((suggestion) => ({
    ...suggestion,
    monthKey: targetMonthKey,
    accountScope: goalScope
  }));

  app.dashboardView.setBusy(true);
  app.overlayView.show('Gerando metas automáticas...');

  try {
    const existingDocIds = existingGoalsInMonth.map((goal) => String(goal.docId || '').trim()).filter(Boolean);
    if (existingDocIds.length > 0) {
      await app.repository.batchDeleteMonthlyGoals(app.state.user.uid, existingDocIds, {
        batchSize: 100,
        onProgress: (done, total) => {
          app.overlayView.log(`Limpando metas anteriores ${done}/${total}.`);
        }
      });
    }

    const upsertedGoals = await app.repository.batchUpsertMonthlyGoals(app.state.user.uid, suggestionsToPersist, {
      batchSize: 60,
      onProgress: (done, total) => {
        app.overlayView.log(`Metas automáticas ${done}/${total} aplicadas.`);
      }
    });

    const goalsOutsideTargetScope = (app.state.monthlyGoals || []).filter(
      (goal) =>
        !(goal?.active !== false && goal.monthKey === targetMonthKey && normalizeGoalScope(goal.accountScope) === goalScope)
    );
    const mergedGoals = mergeMonthlyGoals(goalsOutsideTargetScope, upsertedGoals);
    app.state.setMonthlyGoals(mergedGoals);
    app.persistTransactionsCache();
    app.refreshDashboard();
    const targetMonthLabel = getMonthBounds(targetMonthKey).label;
    app.overlayView.log(`Metas automáticas criadas para ${targetMonthLabel} (${goalScopeLabel}).`);
    app.overlayView.log(`Histórico analisado: ${generation.monthKeys.length} mês(es).`);
    setTimeout(() => app.overlayView.hide(), 900);
    app.authView.showMessage('Metas automáticas geradas com sucesso.', 'success');
    return true;
  } catch (error) {
    app.overlayView.showError(app.normalizeError(error));
    return false;
  } finally {
    app.dashboardView.setBusy(false);
  }
}

export async function deleteMonthlyGoalsForReferenceMonth(app) {
  if (!app.state.user) {
    return false;
  }

  const monthKey = resolveReferenceMonthKey(app);
  const monthLabel = getMonthBounds(monthKey).label;
  const goalScope = resolveGoalScope(app);
  const goalScopeLabel = getGoalScopeLabel(goalScope);
  const goalsInReferenceMonth = (app.state.monthlyGoals || []).filter(
    (goal) =>
      goal?.active !== false &&
      String(goal?.monthKey || '').trim() === monthKey &&
      normalizeGoalScope(goal.accountScope) === goalScope
  );
  const goalDocIds = goalsInReferenceMonth.map((goal) => String(goal.docId || '').trim()).filter(Boolean);

  if (goalDocIds.length === 0) {
    app.authView.showMessage(`Nenhuma meta encontrada para ${monthLabel} (${goalScopeLabel}).`, 'info');
    return true;
  }

  app.dashboardView.setBusy(true);
  app.overlayView.show(`Removendo metas de ${monthLabel} (${goalScopeLabel})...`);

  try {
    const result = await app.repository.batchDeleteMonthlyGoals(app.state.user.uid, goalDocIds, {
      batchSize: 100,
      onProgress: (done, total) => {
        app.overlayView.log(`Metas do mês removidas: ${done}/${total}.`);
      }
    });

    const removedCount = Number(result?.removed || 0);
    const removedDocIdSet = new Set(goalDocIds);
    const remainingGoals = (app.state.monthlyGoals || []).filter((goal) => !removedDocIdSet.has(goal.docId));
    app.state.setMonthlyGoals(remainingGoals);
    app.persistTransactionsCache();
    app.refreshDashboard();
    setTimeout(() => app.overlayView.hide(), 900);

    if (removedCount <= 0) {
      app.authView.showMessage(`Nenhuma meta encontrada para ${monthLabel}.`, 'info');
      return true;
    }

    app.authView.showMessage(
      `${removedCount} meta(s) de ${monthLabel} (${goalScopeLabel}) removida(s) com sucesso.`,
      'success'
    );
    return true;
  } catch (error) {
    app.overlayView.showError(app.normalizeError(error));
    return false;
  } finally {
    app.dashboardView.setBusy(false);
  }
}
