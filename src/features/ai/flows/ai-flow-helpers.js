import { parseDateFlexible, shiftInputDateByMonths } from '../../../utils/date-utils.js';
import { getDisplayCategory } from '../../../utils/transaction-utils.js';

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
    ? summary.considered
        .filter((transaction) => Number(transaction?.value || 0) > 0)
        .map((transaction) => ({
          ...transaction,
          category: String(getDisplayCategory(transaction) || transaction.category || 'Sem categoria').trim() || 'Sem categoria'
        }))
    : [];
  const totalPeriod = roundCurrency(considered.reduce((sum, transaction) => sum + Number(transaction.value || 0), 0));
  const periodDays = getInclusivePeriodDays(periodDates.startDate, periodDates.endDate);

  const installmentTransactions = considered.filter((transaction) => String(transaction.category || '').trim() === 'Parcelas');
  const consumptionTransactions = considered.filter((transaction) => String(transaction.category || '').trim() !== 'Parcelas');

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
    categoryMetrics,
    topMerchants,
    smartAlerts
  };
}


export {
  buildDeterministicInsights,
  roundCurrency
};
