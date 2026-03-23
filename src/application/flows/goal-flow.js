import {
  getGoalScopeLabel,
  getMonthBounds,
  getMonthKeyFromDate,
  normalizeGoalScope,
  normalizeMonthlyGoalRecord
} from '../../utils/goal-utils.js';
import { getTransactionTitleMatchKey } from '../../utils/transaction-utils.js';

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

function shiftMonthKey(monthKey, deltaMonths) {
  const bounds = getMonthBounds(monthKey);
  const shifted = new Date(bounds.startDate.getFullYear(), bounds.startDate.getMonth() + deltaMonths, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
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

    const category = String(transaction.category || 'Outros').trim() || 'Outros';
    const categoryKey = normalizeCategoryKey(category);

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
  totalsByCategoryMonth.forEach((_, key) => {
    const [, categoryKey] = key.split('__');
    if (!categories.has(categoryKey)) {
      categories.set(categoryKey, {
        category: '',
        values: monthKeys.map(() => 0),
        counts: monthKeys.map(() => 0)
      });
    }
  });

  totalsByCategoryMonth.forEach((total, key) => {
    const [monthKey, categoryKey] = key.split('__');
    const monthIndex = monthKeys.indexOf(monthKey);
    if (monthIndex < 0) {
      return;
    }

    const current = categories.get(categoryKey) || {
      category: '',
      values: monthKeys.map(() => 0),
      counts: monthKeys.map(() => 0)
    };

    current.values[monthIndex] = Number(total.toFixed(2));
    current.counts[monthIndex] = Number(countsByCategoryMonth.get(key) || 0);
    if (!current.category) {
      const sampleCategory = (transactions || []).find(
        (transaction) =>
          getMonthKeyFromDate(transaction.date) === monthKey &&
          normalizeCategoryKey(transaction.category || 'Outros') === categoryKey
      );
      current.category = String(sampleCategory?.category || 'Outros').trim() || 'Outros';
    }

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

function calculateStandardDeviation(values, average) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const variance =
    values.reduce((sum, value) => {
      const numericValue = Number(value || 0);
      return sum + (numericValue - average) ** 2;
    }, 0) / values.length;

  return Math.sqrt(variance);
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

  const historyMonthCandidates = [];
  for (let offset = 3; offset >= 1; offset -= 1) {
    historyMonthCandidates.push(shiftMonthKey(targetMonthKey, -offset));
  }

  let monthKeys = historyMonthCandidates;
  const monthlyCoverage = new Set(
    activeTransactions.map((transaction) => getMonthKeyFromDate(transaction.date)).filter(Boolean)
  );
  const hasCoverageForAllHistoryMonths = monthKeys.every((key) => monthlyCoverage.has(key));

  if (!hasCoverageForAllHistoryMonths) {
    const sortedMonthsWithData = [...monthlyCoverage]
      .filter((monthKey) => monthKey <= targetMonthKey)
      .sort((left, right) => left.localeCompare(right))
      .slice(-3);
    monthKeys = sortedMonthsWithData;
  }

  if (monthKeys.length < 3) {
    return {
      monthKeys,
      suggestions: []
    };
  }

  const summary = summarizeHistoryForAutoGoals(activeTransactions, monthKeys);

  const suggestions = summary.categories
    .map((metrics) => {
      const category = String(metrics.category || 'Outros').trim() || 'Outros';
      const values = (metrics.values || []).map((value) => Number(value || 0));
      const nonZeroValues = values.filter((value) => value > 0);
      if (nonZeroValues.length < 2) {
        return null;
      }

      const average = calculateAverage(nonZeroValues);
      if (!Number.isFinite(average) || average < 30) {
        return null;
      }

      const standardDeviation = calculateStandardDeviation(nonZeroValues, average);
      const volatility = average > 0 ? standardDeviation / average : 0;
      const latest = Number(values[values.length - 1] || 0);
      const latestReference = latest > 0 ? latest : Number(nonZeroValues[nonZeroValues.length - 1] || average);
      const latestCount = Number(metrics.counts[metrics.counts.length - 1] || 0);
      const countAverage = calculateAverage(metrics.counts);
      const categoryKey = normalizeCategoryKey(category);
      const profileType = resolveCategoryGoalProfile(categoryKey);
      const recurrenceRatio = nonZeroValues.length / Math.max(values.length, 1);
      const minObserved = Math.min(...nonZeroValues);

      if (recurrenceRatio < 0.67 && profileType !== 'fixed' && profileType !== 'protected') {
        return null;
      }

      let baseline = average * 0.65 + latestReference * 0.35;
      if (profileType === 'fixed') {
        baseline = Math.max(average, latestReference, minObserved * 0.98);
      }
      if (profileType === 'protected') {
        baseline = Math.max(average, latestReference);
      }

      let reductionPercent = 0.04;
      if (profileType === 'discretionary') {
        reductionPercent = 0.08;
      }
      if (profileType === 'fixed') {
        reductionPercent = 0.01;
      }
      if (profileType === 'protected') {
        reductionPercent = 0;
      }

      if (latestReference > average * 1.12 && profileType !== 'protected') {
        reductionPercent += profileType === 'discretionary' ? 0.02 : 0.01;
      }
      if (latestCount > countAverage + 1 && profileType !== 'protected') {
        reductionPercent += profileType === 'discretionary' ? 0.015 : 0.005;
      }
      if (volatility > 0.35) {
        reductionPercent -= 0.015;
      }
      if (profileType === 'fixed' && volatility <= 0.12) {
        reductionPercent = Math.min(reductionPercent, 0.02);
      }

      const maxReductionByProfile = {
        protected: 0,
        fixed: 0.03,
        regular: 0.08,
        discretionary: 0.13
      };
      reductionPercent = clamp(reductionPercent, 0, maxReductionByProfile[profileType] || 0.08);

      let targetValue = baseline * (1 - reductionPercent);

      let floor = average * 0.82;
      let ceiling = Math.max(average * 1.06, latestReference * 1.05);
      if (profileType === 'protected') {
        floor = Math.max(average * 0.96, latestReference * 0.96, minObserved * 0.95);
        ceiling = Math.max(average * 1.05, latestReference * 1.03);
      } else if (profileType === 'fixed') {
        floor = Math.max(average * 0.9, latestReference * 0.9, minObserved * 0.9);
        ceiling = Math.max(average * 1.04, latestReference * 1.03);
      } else if (profileType === 'discretionary') {
        floor = Math.max(average * 0.72, latestReference * 0.68, minObserved * 0.65);
        ceiling = Math.max(average * 1.08, latestReference * 1.06);
      } else {
        floor = Math.max(average * 0.82, latestReference * 0.8, minObserved * 0.78);
      }

      targetValue = clamp(targetValue, floor, ceiling);
      targetValue = Number(targetValue.toFixed(2));

      const topMerchant = [...(summary.merchantTotalsByCategory.get(categoryKey)?.values() || [])]
        .sort((left, right) => Number(right.total || 0) - Number(left.total || 0))
        .slice(0, 1)[0];

      return {
        monthKey: targetMonthKey,
        category,
        targetValue,
        source: 'auto',
        rationale: buildGoalRationale(
          category,
          { ...metrics, average, countAverage, values },
          topMerchant?.title,
          reductionPercent,
          profileType
        )
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.targetValue - left.targetValue)
    .slice(0, 10);

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
  if (generation.monthKeys.length < 3) {
    app.authView.showMessage('Você precisa de pelo menos 3 meses de histórico para gerar metas automáticas.', 'error');
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
      resolveGoalScope(app, goal.accountScope) === goalScope
  );
  const lockedManualCategories = new Set(
    existingGoalsInMonth
      .filter((goal) => goal.source === 'manual')
      .map((goal) => normalizeCategoryKey(goal.category))
  );

  const suggestionsToPersist = generation.suggestions
    .filter((suggestion) => !lockedManualCategories.has(normalizeCategoryKey(suggestion.category)))
    .map((suggestion) => ({
      ...suggestion,
      monthKey: targetMonthKey,
      accountScope: goalScope
    }));

  if (suggestionsToPersist.length === 0) {
    app.authView.showMessage('As categorias deste mês já possuem metas manuais. Nada para atualizar automaticamente.', 'info');
    return true;
  }

  app.dashboardView.setBusy(true);
  app.overlayView.show('Gerando metas automáticas...');

  try {
    const upsertedGoals = await app.repository.batchUpsertMonthlyGoals(app.state.user.uid, suggestionsToPersist, {
      batchSize: 60,
      onProgress: (done, total) => {
        app.overlayView.log(`Metas automáticas ${done}/${total} aplicadas.`);
      }
    });

    const mergedGoals = mergeMonthlyGoals(app.state.monthlyGoals, upsertedGoals);
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
      resolveGoalScope(app, goal.accountScope) === goalScope
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
