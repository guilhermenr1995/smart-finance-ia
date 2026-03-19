import { parseDateFlexible, shiftInputDateByMonths } from '../../utils/date-utils.js';
import { getInstallmentInfo } from '../../utils/transaction-utils.js';

function roundCurrency(value) {
  return Number(Number(value || 0).toFixed(2));
}

function roundPercent(value) {
  return Number(Number(value || 0).toFixed(2));
}

function getInclusivePeriodDays(startDate, endDate) {
  const start = parseDateFlexible(startDate);
  const end = parseDateFlexible(endDate);
  const rawDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  return Math.max(1, rawDays);
}

function getDaysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function calculateQuantile(sortedValues, percentile) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) {
    return 0;
  }

  const index = (sortedValues.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sortedValues[lower];
  }

  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function normalizeMerchantName(title) {
  return String(title || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\bPARCELA(?:S)?\b/g, ' ')
    .replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/g, ' ')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 4)
    .join(' ')
    .trim();
}

function buildCategoryMetrics(transactions, totalPeriod) {
  if (!Array.isArray(transactions) || transactions.length === 0 || totalPeriod <= 0) {
    return [];
  }

  const grouped = new Map();
  transactions.forEach((transaction) => {
    const category = transaction.category || 'Sem categoria';
    if (!grouped.has(category)) {
      grouped.set(category, { total: 0, count: 0 });
    }

    const current = grouped.get(category);
    current.total += Number(transaction.value || 0);
    current.count += 1;
  });

  return [...grouped.entries()]
    .map(([category, metric]) => ({
      category,
      total: roundCurrency(metric.total),
      transactions: metric.count,
      ticketAverage: roundCurrency(metric.total / Math.max(metric.count, 1)),
      share: roundPercent((metric.total / totalPeriod) * 100)
    }))
    .sort((left, right) => right.total - left.total);
}

function buildTopMerchants(transactions, totalPeriod) {
  if (!Array.isArray(transactions) || transactions.length === 0 || totalPeriod <= 0) {
    return [];
  }

  const grouped = new Map();
  transactions.forEach((transaction) => {
    const merchant = normalizeMerchantName(transaction.title) || 'SEM IDENTIFICACAO';
    if (!grouped.has(merchant)) {
      grouped.set(merchant, { total: 0, count: 0 });
    }

    const current = grouped.get(merchant);
    current.total += Number(transaction.value || 0);
    current.count += 1;
  });

  return [...grouped.entries()]
    .map(([merchant, metric]) => ({
      merchant,
      total: roundCurrency(metric.total),
      transactions: metric.count,
      ticketAverage: roundCurrency(metric.total / Math.max(metric.count, 1)),
      share: roundPercent((metric.total / totalPeriod) * 100)
    }))
    .sort((left, right) => right.total - left.total)
    .slice(0, 10);
}

function buildOutlierStats(consumptionTransactions) {
  if (!Array.isArray(consumptionTransactions) || consumptionTransactions.length < 4) {
    return {
      outlierThreshold: 0,
      outliers: [],
      nonOutliers: consumptionTransactions || []
    };
  }

  const sortedValues = consumptionTransactions
    .map((transaction) => Number(transaction.value || 0))
    .sort((left, right) => left - right);

  const q1 = calculateQuantile(sortedValues, 0.25);
  const q3 = calculateQuantile(sortedValues, 0.75);
  const iqr = q3 - q1;
  const threshold = q3 + iqr * 1.5;

  const outliers = consumptionTransactions.filter((transaction) => Number(transaction.value || 0) > threshold);
  const nonOutliers = consumptionTransactions.filter((transaction) => Number(transaction.value || 0) <= threshold);

  return {
    outlierThreshold: roundCurrency(threshold),
    outliers,
    nonOutliers: nonOutliers.length > 0 ? nonOutliers : consumptionTransactions
  };
}

function buildDeterministicInsights(periodDates, summary) {
  const considered = Array.isArray(summary?.considered)
    ? summary.considered.filter((transaction) => Number(transaction?.value || 0) > 0)
    : [];
  const totalPeriod = roundCurrency(considered.reduce((sum, transaction) => sum + Number(transaction.value || 0), 0));
  const periodDays = getInclusivePeriodDays(periodDates.startDate, periodDates.endDate);

  const installmentTransactions = considered.filter((transaction) => Boolean(getInstallmentInfo(transaction.title)));
  const consumptionTransactions = considered.filter((transaction) => !getInstallmentInfo(transaction.title));

  const totalInstallments = roundCurrency(
    installmentTransactions.reduce((sum, transaction) => sum + Number(transaction.value || 0), 0)
  );
  const newConsumption = roundCurrency(
    consumptionTransactions.reduce((sum, transaction) => sum + Number(transaction.value || 0), 0)
  );

  const dailyAverage = roundCurrency(newConsumption / Math.max(periodDays, 1));

  const outlierStats = buildOutlierStats(consumptionTransactions);
  const behavioralAverage = roundCurrency(
    outlierStats.nonOutliers.reduce((sum, transaction) => sum + Number(transaction.value || 0), 0) /
      Math.max(periodDays, 1)
  );

  const periodEnd = parseDateFlexible(periodDates.endDate);
  const currentMonthDays = getDaysInMonth(periodEnd);
  const daysRemainingInMonth = Math.max(0, currentMonthDays - periodEnd.getDate());
  const projectedAdditionalEndOfMonth = roundCurrency(behavioralAverage * daysRemainingInMonth);
  const projectedEndOfMonth = roundCurrency(totalPeriod + projectedAdditionalEndOfMonth);

  const nextMonthDate = new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 1);
  const nextMonthDays = getDaysInMonth(nextMonthDate);
  const dailyInstallmentCommitment = roundCurrency(totalInstallments / Math.max(periodDays, 1));
  const projectedNextMonthInstallments = roundCurrency(dailyInstallmentCommitment * nextMonthDays);
  const projectedNextMonthConsumption = roundCurrency(behavioralAverage * nextMonthDays);
  const projectedNextMonthTotal = roundCurrency(projectedNextMonthInstallments + projectedNextMonthConsumption);

  const categoryMetrics = buildCategoryMetrics(considered, Math.max(totalPeriod, 0.01));
  const topMerchants = buildTopMerchants(considered, Math.max(totalPeriod, 0.01));

  const smartAlerts = [];
  if (totalPeriod > 0 && totalInstallments / totalPeriod >= 0.35) {
    smartAlerts.push('Parcelas representam parcela relevante do período e podem pressionar o caixa dos próximos ciclos.');
  }
  if (categoryMetrics[0]?.share >= 40) {
    smartAlerts.push(
      `A categoria ${categoryMetrics[0].category} concentrou ${categoryMetrics[0].share.toFixed(1)}% dos gastos no período.`
    );
  }
  if (outlierStats.outliers.length > 0) {
    smartAlerts.push(
      `Foram identificadas ${outlierStats.outliers.length} compra(s) acima do padrão comportamental (outliers).`
    );
  }

  return {
    periodDays,
    transactionsConsidered: considered.length,
    totalPeriod,
    totalInstallments,
    newConsumption,
    dailyAverage,
    behavioralAverage,
    outlierThreshold: outlierStats.outlierThreshold,
    outlierTransactions: outlierStats.outliers
      .sort((left, right) => right.value - left.value)
      .slice(0, 10)
      .map((transaction) => ({
        date: transaction.date,
        title: transaction.title,
        value: roundCurrency(transaction.value),
        category: transaction.category
      })),
    projections: {
      currentMonthDays,
      daysRemainingInMonth,
      projectedAdditionalEndOfMonth,
      projectedEndOfMonth,
      nextMonthDays,
      projectedNextMonthInstallments,
      projectedNextMonthConsumption,
      projectedNextMonthTotal
    },
    categoryMetrics,
    topMerchants,
    smartAlerts
  };
}

export async function syncCategoriesWithAi(app) {
  if (!app.state.user) {
    app.authView.showMessage('Faça login para usar a IA.', 'error');
    return;
  }

  const visibleTransactions = app.getVisibleTransactions();
  const candidates = app.queryService.getAiCandidates(visibleTransactions);

  if (candidates.length === 0) {
    window.alert('Nada para categorizar no período filtrado.');
    return;
  }

  app.dashboardView.setBusy(true);
  app.overlayView.show('Inteligência Artificial: categorizando ciclo...');

  try {
    try {
      await app.repository.recordUsageMetrics(app.state.user.uid, {
        aiCategorizationRuns: 1
      });
    } catch (usageError) {
      console.warn('Falha ao registrar uso da sincronização de IA:', usageError);
    }

    const updateTimestamp = new Date().toISOString();
    const memoryResult = app.categoryMemoryService.suggestCategories(candidates, app.state.transactions);
    const memoryUpdates = memoryResult.updates.map((item) => ({
      docId: item.docId,
      category: item.category,
      metadata: {
        categorySource: `platform-${String(item.source || 'memory').toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`,
        categoryAutoAssigned: true,
        categoryManuallyEdited: false,
        lastCategoryUpdateAt: updateTimestamp
      }
    }));
    const unresolvedCandidates = memoryResult.unresolved;

    app.overlayView.log(
      `Memória interna: ${memoryUpdates.length} categorizadas sem IA, ${unresolvedCandidates.length} pendentes para IA.`
    );

    let aiUpdates = [];
    let failedChunks = [];

    if (unresolvedCandidates.length > 0) {
      const result = await app.aiService.categorizeTransactions(unresolvedCandidates, {
        onChunkProgress: (done, total) => {
          app.overlayView.log(`IA processou ${done}/${total} itens pendentes.`);
        },
        onChunkError: (error, index) => {
          app.overlayView.log(`Falha no lote ${index / app.aiService.chunkSize + 1}: ${app.normalizeError(error)}`);
        }
      });
      aiUpdates = result.updates.map((item) => ({
        docId: item.docId,
        category: item.category,
        metadata: {
          categorySource: 'platform-ai',
          categoryAutoAssigned: true,
          categoryManuallyEdited: false,
          lastCategoryUpdateAt: updateTimestamp
        }
      }));
      failedChunks = result.failedChunks;
    }

    const updates = [...memoryUpdates, ...aiUpdates];

    if (updates.length === 0) {
      app.overlayView.log('Nenhuma atualização de categoria foi aplicada.');
      if (failedChunks.length > 0) {
        app.overlayView.log(`${failedChunks.length} lote(s) falharam por indisponibilidade temporária da IA.`);
      }
      setTimeout(() => app.overlayView.hide(), 1000);
      return;
    }

    await app.repository.batchUpdateCategories(app.state.user.uid, updates, {
      batchSize: 100,
      onProgress: (done, total) => {
        app.overlayView.log(`Atualizações aplicadas ${done}/${total}.`);
      }
    });

    const updateMap = new Map(updates.map((item) => [item.docId, item]));
    app.setTransactionsAndRefresh(
      app.state.transactions.map((transaction) => {
        const update = updateMap.get(transaction.docId);
        if (!update) {
          return transaction;
        }

        return {
          ...transaction,
          category: update.category,
          ...(update.metadata || {})
        };
      })
    );

    if (failedChunks.length > 0) {
      app.overlayView.log(`Concluído com alerta: ${failedChunks.length} lote(s) não foram processados e podem ser reenviados.`);
    }

    app.overlayView.log('Categorização concluída.');
    setTimeout(() => app.overlayView.hide(), 900);
  } catch (error) {
    app.overlayView.showError(app.normalizeError(error));
  } finally {
    app.dashboardView.setBusy(false);
  }
}

export function buildConsultantPeriodSnapshot(app, periodDates, summary) {
  const consideredTransactions = (Array.isArray(summary?.considered) ? summary.considered : []).filter(
    (transaction) => Number(transaction?.value || 0) > 0
  );
  const deterministic = buildDeterministicInsights(periodDates, {
    ...summary,
    considered: consideredTransactions
  });

  const categoryTotals = {};
  consideredTransactions.forEach((transaction) => {
    const category = transaction.category || 'Sem categoria';
    categoryTotals[category] = (categoryTotals[category] || 0) + Number(transaction.value || 0);
  });

  const categoryBreakdown = Object.entries(categoryTotals)
    .sort((left, right) => right[1] - left[1])
    .map(([category, total]) => ({
      category,
      total: Number(total.toFixed(2))
    }));

  const topTransactions = [...consideredTransactions]
    .sort((left, right) => right.value - left.value)
    .slice(0, 20)
    .map((transaction) => ({
      date: transaction.date,
      title: transaction.title,
      category: transaction.category,
      value: Number(transaction.value.toFixed(2)),
      accountType: transaction.accountType
    }));

  return {
    ...periodDates,
    total: Number(deterministic.totalPeriod.toFixed(2)),
    count: consideredTransactions.length,
    ignoredTotal: Number(summary.ignoredTotal.toFixed(2)),
    ignoredCount: summary.ignored.length,
    categoryBreakdown,
    topTransactions,
    deterministic
  };
}

export function buildConsultantInsightKey(filters) {
  const payload = JSON.stringify({
    startDate: filters.startDate,
    endDate: filters.endDate,
    accountType: filters.accountType,
    category: filters.category
  });
  return btoa(unescape(encodeURIComponent(payload)))
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export async function runAiConsultant(app) {
  if (!app.state.user) {
    app.authView.showMessage('Faça login para usar o Consultor IA.', 'error');
    return;
  }

  const currentVisibleTransactions = app.getVisibleTransactions();
  const currentSummary = app.queryService.buildSummary(currentVisibleTransactions);

  const previousStartDate = shiftInputDateByMonths(app.state.filters.startDate, -1);
  const previousEndDate = shiftInputDateByMonths(app.state.filters.endDate, -1);
  const previousBounds = {
    ...app.state.getFilterBoundaries(),
    cycleStart: new Date(`${previousStartDate}T00:00:00`),
    cycleEnd: new Date(`${previousEndDate}T23:59:59`)
  };
  const previousVisibleTransactions = app.queryService.getVisibleTransactions(app.state.transactions, previousBounds);
  const previousSummary = app.queryService.buildSummary(previousVisibleTransactions);

  if (currentSummary.considered.length === 0 && previousSummary.considered.length === 0) {
    window.alert('Sem gastos suficientes no período atual e anterior para gerar insights.');
    return;
  }

  try {
    await app.repository.recordUsageMetrics(app.state.user.uid, {
      aiConsultantRuns: 1
    });
  } catch (usageError) {
    console.warn('Falha ao registrar uso do Consultor IA:', usageError);
  }

  const insightKey = buildConsultantInsightKey(app.state.filters);
  const existingInsight = app.state.getAiConsultantHistory(insightKey);
  if (existingInsight?.insights) {
    app.state.setAiConsultantReport(existingInsight.insights);
    app.refreshDashboard();
    app.overlayView.show('Consultor IA: carregando insight salvo...');
    app.overlayView.log('Insight encontrado na base para este período. Nenhuma nova consulta foi necessária.');
    setTimeout(() => app.overlayView.hide(), 800);
    return;
  }

  let cloudInsight = null;
  try {
    cloudInsight = await app.repository.fetchConsultantInsightByKey(app.state.user.uid, insightKey);
  } catch (error) {
    console.warn('Consultor IA: falha ao consultar insight salvo no Firestore:', error);
  }

  if (cloudInsight?.insights) {
    app.state.upsertAiConsultantHistory(cloudInsight);
    app.state.setAiConsultantReport(cloudInsight.insights);
    app.persistTransactionsCache();
    app.refreshDashboard();
    app.overlayView.show('Consultor IA: carregando insight salvo no banco...');
    app.overlayView.log('Insight encontrado no Firestore para este período. Nenhuma nova chamada de IA foi feita.');
    setTimeout(() => app.overlayView.hide(), 800);
    return;
  }

  const payload = {
    appId: app.config.appId,
    insightKey,
    filters: {
      startDate: app.state.filters.startDate,
      endDate: app.state.filters.endDate,
      accountType: app.state.filters.accountType,
      category: app.state.filters.category
    },
    currentPeriod: buildConsultantPeriodSnapshot(
      app,
      { startDate: app.state.filters.startDate, endDate: app.state.filters.endDate },
      currentSummary
    ),
    previousPeriod: buildConsultantPeriodSnapshot(app, { startDate: previousStartDate, endDate: previousEndDate }, previousSummary)
  };

  app.dashboardView.setBusy(true);
  app.overlayView.show('Consultor IA: analisando o comportamento de gastos...');

  try {
    const result = await app.aiConsultantService.analyzeSpending(payload);
    const storedInsight = result.storedInsight || {
      key: insightKey,
      filters: payload.filters,
      currentPeriod: {
        startDate: payload.currentPeriod.startDate,
        endDate: payload.currentPeriod.endDate
      },
      previousPeriod: {
        startDate: payload.previousPeriod.startDate,
        endDate: payload.previousPeriod.endDate
      },
      generatedAt: new Date().toISOString(),
      insights: result.insights
    };

    app.state.setAiConsultantReport(storedInsight.insights);
    app.state.upsertAiConsultantHistory(storedInsight);
    app.persistTransactionsCache();
    if (result.usage) {
      app.state.setAiConsultantUsage(result.usage);
    }

    app.refreshDashboard();
    if (result.warning?.error) {
      app.overlayView.log('Insights gerados com fallback determinístico (IA indisponível no momento).');
    } else {
      app.overlayView.log('Insights gerados com sucesso.');
    }
    setTimeout(() => app.overlayView.hide(), 900);
  } catch (error) {
    if (Number(error?.status) === 429 || error?.details?.dailyLimitReached) {
      app.state.setAiConsultantUsage(error?.details?.usage || { limit: 3, used: 3, remaining: 0 });
      app.refreshDashboard();
      app.overlayView.showError('Limite diário do Consultor IA atingido (3 análises por dia).');
    } else {
      app.overlayView.showError(app.normalizeError(error));
    }
  } finally {
    app.dashboardView.setBusy(false);
  }
}
