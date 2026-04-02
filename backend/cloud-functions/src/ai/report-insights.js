const {
  toFiniteNumber,
  toCurrency,
  toPercent
} = require('../core/domain-utils');
const { uniqueNonEmpty } = require('../core/base');
const {
  formatCurrencyBRL,
  calculateGrowthPercent,
  normalizeDeterministicPeriod
} = require('./report-normalization');
const {
  buildCategoryTransactionDrivers,
  buildDefaultCategoryInsight,
  buildDefaultDeltaInsight,
  mergeNarrativeWithDeterministic
} = require('./report-insights-support');

function buildCategoryComparisons(currentMetrics, previousMetrics) {
  const currentMap = new Map();
  const previousMap = new Map();

  (currentMetrics || []).forEach((metric) => {
    currentMap.set(metric.category, metric);
  });
  (previousMetrics || []).forEach((metric) => {
    previousMap.set(metric.category, metric);
  });

  const categories = new Set([...currentMap.keys(), ...previousMap.keys()]);
  const deltas = [];

  categories.forEach((category) => {
    const current = currentMap.get(category) || {
      category,
      total: 0,
      transactions: 0,
      ticketAverage: 0,
      share: 0
    };
    const previous = previousMap.get(category) || {
      category,
      total: 0,
      transactions: 0,
      ticketAverage: 0,
      share: 0
    };

    const delta = toCurrency(current.total - previous.total);
    deltas.push({
      category,
      current: toCurrency(current.total),
      previous: toCurrency(previous.total),
      delta,
      deltaPercent: calculateGrowthPercent(current.total, previous.total),
      share: toPercent(current.share || 0),
      transactions: Math.max(0, Math.round(toFiniteNumber(current.transactions))),
      previousTransactions: Math.max(0, Math.round(toFiniteNumber(previous.transactions))),
      transactionDelta: Math.max(0, Math.round(toFiniteNumber(current.transactions))) - Math.max(0, Math.round(toFiniteNumber(previous.transactions))),
      ticketAverage: toCurrency(current.ticketAverage),
      previousTicketAverage: toCurrency(previous.ticketAverage)
    });
  });

  const increased = deltas
    .filter((item) => item.delta > 0.01)
    .sort((left, right) => right.delta - left.delta)
    .slice(0, 6);

  const reduced = deltas
    .filter((item) => item.delta < -0.01)
    .sort((left, right) => left.delta - right.delta)
    .slice(0, 6);

  const categoryHighlights = deltas
    .filter((item) => item.current > 0 || item.previous > 0)
    .sort((left, right) => right.current - left.current)
    .slice(0, 8);

  return {
    increased,
    reduced,
    categoryHighlights
  };
}

function buildDeterministicOverview(current, previous, totalDelta, totalDeltaPercent) {
  if (previous.totalPeriod <= 0 && current.totalPeriod > 0) {
    return `No período atual, você registrou ${formatCurrencyBRL(current.totalPeriod)} em despesas. Ainda não há base anterior equivalente para comparação direta.`;
  }

  if (Math.abs(totalDelta) <= 0.01) {
    return `Seu gasto ficou praticamente estável em ${formatCurrencyBRL(current.totalPeriod)} no período atual.`;
  }

  const direction = totalDelta > 0 ? 'acima' : 'abaixo';
  return `Você fechou o período com ${formatCurrencyBRL(current.totalPeriod)}, ${formatCurrencyBRL(Math.abs(totalDelta))} (${Math.abs(
    totalDeltaPercent
  ).toFixed(1)}%) ${direction} do período anterior.`;
}

function buildFallbackActions(baseReport) {
  const criticalActions = [];
  const dispensableCuts = [];

  if (baseReport.increased[0]) {
    criticalActions.push(
      `Defina um limite semanal para ${baseReport.increased[0].category} e acompanhe diariamente para evitar novo pico.`
    );
  }
  if (baseReport.increased[1]) {
    criticalActions.push(
      `Revise os lançamentos de ${baseReport.increased[1].category}; houve aumento de ${formatCurrencyBRL(
        baseReport.increased[1].delta
      )} no período.`
    );
  }
  if (baseReport.indicators.installmentsShare >= 35) {
    criticalActions.push(
      `Seu comprometimento com parcelas está em ${baseReport.indicators.installmentsShare.toFixed(
        1
      )}% do total. Priorize reduzir novas compras parceladas.`
    );
  }

  if (baseReport.categoryHighlights[0]) {
    dispensableCuts.push(
      `Busque reduzir em 10% os gastos de ${baseReport.categoryHighlights[0].category} para aliviar o próximo ciclo.`
    );
  }
  if (baseReport.categoryHighlights[1]) {
    dispensableCuts.push(
      `Consolide compras em ${baseReport.categoryHighlights[1].category} para diminuir gastos recorrentes pequenos.`
    );
  }
  if (baseReport.outlierTransactions[0]) {
    dispensableCuts.push(
      `Evite compras pontuais de alto valor como "${baseReport.outlierTransactions[0].title}" fora de planejamento.`
    );
  }

  return {
    criticalActions: criticalActions.slice(0, 4),
    dispensableCuts: dispensableCuts.slice(0, 4)
  };
}

function buildDeterministicConsultantReport(currentPeriod, previousPeriod) {
  const current = normalizeDeterministicPeriod(currentPeriod);
  const previous = normalizeDeterministicPeriod(previousPeriod);
  const totalDelta = toCurrency(current.totalPeriod - previous.totalPeriod);
  const totalDeltaPercent = calculateGrowthPercent(current.totalPeriod, previous.totalPeriod);
  const installmentsShare = current.totalPeriod > 0 ? toPercent((current.totalInstallments / current.totalPeriod) * 100) : 0;
  const comparisons = buildCategoryComparisons(current.categoryMetrics, previous.categoryMetrics);

  const smartAlerts = [
    ...current.smartAlerts,
    ...(totalDeltaPercent >= 20 ? ['O gasto total está acima de 20% em relação ao período anterior.'] : []),
    ...(installmentsShare >= 35
      ? ['Parcelamentos estão elevados para o período e podem reduzir a margem de consumo dos próximos meses.']
      : []),
    ...(current.outlierTransactions.length > 0
      ? [`Foram detectadas ${current.outlierTransactions.length} compra(s) fora do padrão de valor.`]
      : [])
  ];

  const report = {
    overview: buildDeterministicOverview(current, previous, totalDelta, totalDeltaPercent),
    indicators: {
      periodDays: current.periodDays,
      transactionsCount: current.transactionsConsidered,
      totalPeriod: current.totalPeriod,
      previousTotalPeriod: previous.totalPeriod,
      totalDelta,
      totalDeltaPercent,
      totalInstallments: current.totalInstallments,
      newConsumption: current.newConsumption,
      dailyAverage: current.dailyAverage,
      behavioralAverage: current.behavioralAverage,
      installmentsShare,
      outlierThreshold: current.outlierThreshold
    },
    increased: comparisons.increased.map((item) => ({
      ...item,
      insight: buildDefaultDeltaInsight(item)
    })),
    reduced: comparisons.reduced.map((item) => ({
      ...item,
      insight: buildDefaultDeltaInsight(item)
    })),
    categoryHighlights: comparisons.categoryHighlights.map((item) => ({
      ...item,
      insight: buildDefaultCategoryInsight(item)
    })),
    topMerchants: current.topMerchants,
    topTransactions: current.topTransactions,
    outlierTransactions: current.outlierTransactions,
    smartAlerts: uniqueNonEmpty(smartAlerts)
  };

  const fallbackActions = buildFallbackActions(report);
  report.criticalActions = fallbackActions.criticalActions;
  report.dispensableCuts = fallbackActions.dispensableCuts;

  report.increased = report.increased.map((item) => ({
    ...item,
    drivers: buildCategoryTransactionDrivers(item.category, current.topTransactions, previous.topTransactions, 'increase')
  }));
  report.reduced = report.reduced.map((item) => ({
    ...item,
    drivers: buildCategoryTransactionDrivers(item.category, current.topTransactions, previous.topTransactions, 'reduction')
  }));

  report.increased = report.increased.map((item) => ({
    ...item,
    insight: buildDefaultDeltaInsight(item)
  }));
  report.reduced = report.reduced.map((item) => ({
    ...item,
    insight: buildDefaultDeltaInsight(item)
  }));

  return report;
}


module.exports = {
  buildCategoryComparisons,
  buildDeterministicOverview,
  buildFallbackActions,
  buildDeterministicConsultantReport,
  mergeNarrativeWithDeterministic
};
