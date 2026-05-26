import { buildPreviousEquivalentPeriod } from '../../../utils/date-utils.js';
import { getDisplayCategory } from '../../../utils/transaction-utils.js';
import { buildGoalTargetsByCategory, GOAL_SCOPE_ALL, normalizeGoalScope } from '../../../utils/goal-utils.js';
import { buildDeterministicInsights } from './ai-flow-helpers.js';

const AI_FINANCE_QUESTION_MIN_LENGTH = 8;
const AI_FINANCE_QUESTION_MAX_LENGTH = 320;
const AI_FINANCE_MAX_TRANSACTIONS = 500;
const AI_FINANCE_DOMAIN_KEYWORDS = [
  'gasto',
  'gastos',
  'despesa',
  'despesas',
  'compra',
  'compras',
  'transacao',
  'transacoes',
  'lancamento',
  'lancamentos',
  'categoria',
  'categorias',
  'restaurante',
  'restaurantes',
  'estabelecimento',
  'loja',
  'mercado',
  'mercadolivre',
  'abaste',
  'abasteci',
  'combustivel',
  'frequencia',
  'recorrente',
  'recorrencia',
  'uber',
  'ifood',
  'fatura',
  'cartao',
  'credito',
  'debito',
  'conta',
  'contas',
  'dinheiro',
  'finance',
  'orcamento',
  'meta',
  'metas',
  'periodo',
  'mes',
  'ticket',
  'pix',
  'impacto',
  'total',
  'ranking'
];

const AI_FINANCE_MALICIOUS_PATTERNS = [
  /ignore\s+(all|any|the)\s+(previous|prior)\s+instructions/i,
  /system\s+prompt/i,
  /developer\s+mode/i,
  /jailbreak/i,
  /\b(prompt\s*injection|injection)\b/i,
  /<script\b/i,
  /\b(select|insert|update|delete|drop)\s+.*\b(from|table)\b/i,
  /\b(rm\s+-rf|sudo|chmod|curl\s+http|wget\s+http)\b/i
];

function normalizeQuestion(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasFinanceKeyword(question) {
  const normalized = String(question || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return AI_FINANCE_DOMAIN_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function hasMaliciousPattern(question) {
  return AI_FINANCE_MALICIOUS_PATTERNS.some((pattern) => pattern.test(question));
}

function validateAiFinanceQuestion(question) {
  const normalizedQuestion = normalizeQuestion(question);

  if (!normalizedQuestion) {
    return {
      ok: false,
      reasonCode: 'INVALID_QUESTION',
      question: ''
    };
  }

  if (normalizedQuestion.length < AI_FINANCE_QUESTION_MIN_LENGTH) {
    return {
      ok: false,
      reasonCode: 'QUESTION_TOO_SHORT',
      question: normalizedQuestion
    };
  }

  if (normalizedQuestion.length > AI_FINANCE_QUESTION_MAX_LENGTH) {
    return {
      ok: false,
      reasonCode: 'QUESTION_TOO_LONG',
      question: normalizedQuestion
    };
  }

  if (hasMaliciousPattern(normalizedQuestion)) {
    return {
      ok: false,
      reasonCode: 'QUESTION_MALICIOUS',
      question: normalizedQuestion
    };
  }

  if (!hasFinanceKeyword(normalizedQuestion)) {
    return {
      ok: false,
      reasonCode: 'QUESTION_OUT_OF_SCOPE',
      question: normalizedQuestion
    };
  }

  return {
    ok: true,
    reasonCode: '',
    question: normalizedQuestion
  };
}

function mapAiFinanceQuestionReasonToMessage(reasonCode) {
  const messages = {
    QUESTION_TOO_SHORT: 'Sua pergunta está curta demais. Explique melhor o que deseja analisar.',
    QUESTION_TOO_LONG: 'Sua pergunta está longa demais. Reduza para até 320 caracteres.',
    QUESTION_MALICIOUS: 'Pergunta bloqueada por segurança. Reformule no contexto financeiro.',
    QUESTION_OUT_OF_SCOPE: 'Pergunte apenas sobre suas finanças no período filtrado.',
    INVALID_QUESTION: 'Pergunta inválida. Tente novamente com uma frase objetiva.',
    NO_DATA: 'Não há transações ativas no filtro atual para responder.',
    TOO_MANY_TRANSACTIONS: `Refine os filtros: o recorte atual excede ${AI_FINANCE_MAX_TRANSACTIONS} transações ativas.`,
    AI_UNAVAILABLE: 'A IA está indisponível no momento. Tente novamente em instantes.'
  };

  return messages[reasonCode] || 'Pergunta bloqueada pelos guardrails de segurança.';
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

function mapFilterAccountTypeToGoalScope(accountType) {
  const safeAccountType = String(accountType || '').trim();
  if (!safeAccountType || safeAccountType.toLowerCase() === 'all') {
    return GOAL_SCOPE_ALL;
  }
  return normalizeGoalScope(safeAccountType);
}

function buildConsultantGoalContext(app, currentPeriodSnapshot, previousPeriodSnapshot) {
  const accountScope = mapFilterAccountTypeToGoalScope(app.state.filters.accountType);
  const activeGoals = (app.state.monthlyGoals || []).filter(
    (goal) => goal?.active !== false && normalizeGoalScope(goal?.accountScope) === accountScope
  );

  const currentTargetsByCategory = buildGoalTargetsByCategory(
    activeGoals,
    currentPeriodSnapshot.startDate,
    currentPeriodSnapshot.endDate
  );
  const currentTotalsByCategory = {};
  (currentPeriodSnapshot.categoryBreakdown || []).forEach((item) => {
    const category = String(item?.category || '').trim();
    if (!category) {
      return;
    }
    currentTotalsByCategory[category] = Number(item?.total || 0);
  });

  const previousTotalsByCategory = {};
  (previousPeriodSnapshot.categoryBreakdown || []).forEach((item) => {
    const category = String(item?.category || '').trim();
    if (!category) {
      return;
    }
    previousTotalsByCategory[category] = Number(item?.total || 0);
  });

  const categoriesWithGoals = Object.keys(currentTargetsByCategory);
  const goalPerformance = categoriesWithGoals
    .map((category) => {
      const target = Number(currentTargetsByCategory[category] || 0);
      const currentSpent = Number(currentTotalsByCategory[category] || 0);
      const previousSpent = Number(previousTotalsByCategory[category] || 0);
      const deltaToTarget = Number((currentSpent - target).toFixed(2));
      const targetUsagePercent = target > 0 ? Number(((currentSpent / target) * 100).toFixed(1)) : 0;
      const monthOverMonthDelta = Number((currentSpent - previousSpent).toFixed(2));
      const monthOverMonthPercent =
        previousSpent > 0 ? Number((((currentSpent - previousSpent) / previousSpent) * 100).toFixed(1)) : currentSpent > 0 ? 100 : 0;

      return {
        category,
        targetValue: Number(target.toFixed(2)),
        currentSpent: Number(currentSpent.toFixed(2)),
        previousSpent: Number(previousSpent.toFixed(2)),
        deltaToTarget,
        targetUsagePercent,
        monthOverMonthDelta,
        monthOverMonthPercent,
        status: deltaToTarget > 0.01 ? 'above_target' : deltaToTarget < -0.01 ? 'below_target' : 'on_target'
      };
    })
    .sort((left, right) => Math.abs(right.deltaToTarget) - Math.abs(left.deltaToTarget));

  return {
    accountScope,
    hasGoals: goalPerformance.length > 0,
    goalPerformance
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

export async function askAiFinanceQuestion(app, payload = {}) {
  if (!app.state.user) {
    app.authView.showMessage('Faça login para perguntar para a IA.', 'error');
    return;
  }

  const rawQuestion = String(payload?.question || '');
  const validation = validateAiFinanceQuestion(rawQuestion);
  const visibleTransactions = app.getVisibleTransactions();
  const visibleSummary = app.queryService.buildSummary(visibleTransactions);
  const filteredActiveCount = Array.isArray(visibleSummary?.considered) ? visibleSummary.considered.length : 0;
  const filteredActiveTotal = Number(visibleSummary?.total || 0);
  const activeDatasetMeta = {
    count: filteredActiveCount,
    total: Number(filteredActiveTotal.toFixed(2))
  };

  const blockedByClientReasonCode =
    !validation.ok
      ? validation.reasonCode
      : filteredActiveCount === 0
        ? 'NO_DATA'
        : filteredActiveCount > AI_FINANCE_MAX_TRANSACTIONS
          ? 'TOO_MANY_TRANSACTIONS'
          : '';

  if (blockedByClientReasonCode) {
    app.state.setAiFinanceQuestionResult({
      question: validation.question || normalizeQuestion(rawQuestion),
      blocked: true,
      reasonCode: blockedByClientReasonCode,
      answer: '',
      evidence: [],
      datasetMeta: activeDatasetMeta,
      filters: {
        startDate: app.state.filters.startDate,
        endDate: app.state.filters.endDate,
        accountType: app.state.filters.accountType,
        category: app.state.filters.category,
        source: app.state.filters.source || 'all'
      }
    });
    app.refreshDashboard();
    app.authView.showMessage(mapAiFinanceQuestionReasonToMessage(blockedByClientReasonCode), 'error');
    return;
  }

  app.dashboardView.setBusy(true);
  app.overlayView.show('Pergunta livre: consultando sua base filtrada...');

  try {
    const result = await app.aiConsultantService.answerFinanceQuestion({
      appId: app.config.appId,
      filters: {
        startDate: app.state.filters.startDate,
        endDate: app.state.filters.endDate,
        accountType: app.state.filters.accountType,
        category: app.state.filters.category,
        source: app.state.filters.source || 'all'
      },
      question: validation.question
    });

    app.state.setAiFinanceQuestionResult({
      question: validation.question,
      blocked: Boolean(result?.blocked),
      reasonCode: String(result?.reasonCode || '').trim(),
      answer: String(result?.answer || '').trim(),
      evidence: Array.isArray(result?.evidence) ? result.evidence : [],
      datasetMeta:
        result?.datasetMeta && typeof result.datasetMeta === 'object'
          ? result.datasetMeta
          : activeDatasetMeta,
      filters: {
        startDate: app.state.filters.startDate,
        endDate: app.state.filters.endDate,
        accountType: app.state.filters.accountType,
        category: app.state.filters.category,
        source: app.state.filters.source || 'all'
      }
    });

    app.refreshDashboard();
    if (result?.blocked) {
      const reasonCode = String(result?.reasonCode || '').trim();
      app.overlayView.log('Pergunta bloqueada pelos guardrails da IA.');
      if (reasonCode) {
        app.overlayView.log(`Motivo: ${reasonCode}`);
      }
    } else {
      app.overlayView.log('Resposta da pergunta livre gerada com sucesso.');
    }
    setTimeout(() => app.overlayView.hide(), 900);
  } catch (error) {
    app.overlayView.showError(app.normalizeError(error));
  } finally {
    app.dashboardView.setBusy(false);
  }
}

export async function runAiConsultant(app) {
  if (!app.state.user) {
    app.authView.showMessage('Faça login para usar o Consultor IA.', 'error');
    return;
  }

  const currentVisibleTransactions = app.getVisibleTransactions();
  const currentSummary = app.queryService.buildSummary(currentVisibleTransactions);

  const previousPeriod = buildPreviousEquivalentPeriod(app.state.filters.startDate, app.state.filters.endDate);
  const previousStartDate = previousPeriod.startDate;
  const previousEndDate = previousPeriod.endDate;
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
  payload.goalContext = buildConsultantGoalContext(app, payload.currentPeriod, payload.previousPeriod);

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
