import { shiftInputDateByMonths } from '../../../utils/date-utils.js';
import { buildDeterministicInsights, roundCurrency } from './ai-flow-helpers.js';

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
  ).map((transaction) => ({
    ...transaction,
    category: String(getDisplayCategory(transaction) || transaction.category || 'Sem categoria').trim() || 'Sem categoria'
  }));
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

  const payload = {
    appId: app.config.appId,
    insightKey,
    forceRefresh: true,
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
    app.overlayView.showError(app.normalizeError(error));
  } finally {
    app.dashboardView.setBusy(false);
  }
}
