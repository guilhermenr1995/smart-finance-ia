const { uniqueNonEmpty } = require('../core/base');
const {
  toFiniteNumber,
  toCurrency,
  toPercent
} = require('../core/domain-utils');

function formatCurrencyBRL(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(toFiniteNumber(value));
}

function calculateGrowthPercent(currentValue, previousValue) {
  const current = toFiniteNumber(currentValue);
  const previous = toFiniteNumber(previousValue);
  if (previous <= 0) {
    return current > 0 ? 100 : 0;
  }

  return toPercent(((current - previous) / previous) * 100);
}

function parseInputDate(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return new Date();
  }

  if (raw.includes('-')) {
    const [year, month, day] = raw.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  if (raw.includes('/')) {
    const [day, month, year] = raw.split('/').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  return new Date(raw);
}

function getDaysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function formatMonthYear(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric'
  }).format(date);
}

function sanitizeCategoryMetrics(rawMetrics, fallbackBreakdown, totalPeriod) {
  if (Array.isArray(rawMetrics) && rawMetrics.length > 0) {
    return rawMetrics
      .map((metric) => {
        const category = String(metric?.category || '').trim() || 'Sem categoria';
        const total = toCurrency(metric?.total);
        const transactions = Math.max(0, Math.round(toFiniteNumber(metric?.transactions)));
        const ticketAverage = transactions > 0 ? toCurrency(total / transactions) : 0;
        const share = totalPeriod > 0 ? toPercent((total / totalPeriod) * 100) : 0;

        return {
          category,
          total,
          transactions,
          ticketAverage: toCurrency(metric?.ticketAverage || ticketAverage),
          share: toPercent(metric?.share ?? share)
        };
      })
      .sort((left, right) => right.total - left.total);
  }

  if (!Array.isArray(fallbackBreakdown)) {
    return [];
  }

  return fallbackBreakdown
    .map((item) => {
      const category = String(item?.category || '').trim() || 'Sem categoria';
      const total = toCurrency(item?.total);
      const share = totalPeriod > 0 ? toPercent((total / totalPeriod) * 100) : 0;
      return {
        category,
        total,
        transactions: 0,
        ticketAverage: 0,
        share
      };
    })
    .sort((left, right) => right.total - left.total);
}

function sanitizeTopMerchants(rawMerchants, totalPeriod) {
  if (!Array.isArray(rawMerchants)) {
    return [];
  }

  return rawMerchants
    .map((merchant) => {
      const total = toCurrency(merchant?.total);
      const transactions = Math.max(0, Math.round(toFiniteNumber(merchant?.transactions)));
      const share = totalPeriod > 0 ? toPercent((total / totalPeriod) * 100) : 0;

      return {
        merchant: String(merchant?.merchant || '').trim() || 'Sem identificação',
        total,
        transactions,
        ticketAverage: toCurrency(merchant?.ticketAverage || (transactions > 0 ? total / transactions : 0)),
        share: toPercent(merchant?.share ?? share)
      };
    })
    .sort((left, right) => right.total - left.total)
    .slice(0, 10);
}

function sanitizeTopTransactions(rawTransactions) {
  if (!Array.isArray(rawTransactions)) {
    return [];
  }

  return rawTransactions
    .map((transaction) => ({
      date: String(transaction?.date || '').trim(),
      title: String(transaction?.title || '').trim(),
      category: String(transaction?.category || '').trim() || 'Outros',
      accountType: String(transaction?.accountType || '').trim() || 'Conta',
      value: toCurrency(transaction?.value)
    }))
    .filter((transaction) => transaction.value > 0 && transaction.title)
    .sort((left, right) => right.value - left.value)
    .slice(0, 20);
}

function sanitizeOutlierTransactions(rawOutliers) {
  if (!Array.isArray(rawOutliers)) {
    return [];
  }

  return rawOutliers
    .map((transaction) => ({
      date: String(transaction?.date || '').trim(),
      title: String(transaction?.title || '').trim(),
      category: String(transaction?.category || '').trim() || 'Outros',
      value: toCurrency(transaction?.value)
    }))
    .filter((transaction) => transaction.value > 0 && transaction.title)
    .sort((left, right) => right.value - left.value)
    .slice(0, 10);
}

function normalizeDeterministicPeriod(period = {}) {
  const deterministic = period?.deterministic || {};
  const fallbackTotal = Array.isArray(period.categoryBreakdown)
    ? period.categoryBreakdown.reduce((sum, item) => sum + toFiniteNumber(item?.total), 0)
    : 0;

  const totalPeriod = toCurrency(deterministic.totalPeriod || period.total || fallbackTotal);
  const periodDays = Math.max(1, Math.round(toFiniteNumber(deterministic.periodDays, 30)));
  const totalInstallments = toCurrency(deterministic.totalInstallments);
  const newConsumption = toCurrency(
    deterministic.newConsumption !== undefined ? deterministic.newConsumption : totalPeriod - totalInstallments
  );
  const dailyAverage = toCurrency(deterministic.dailyAverage || newConsumption / Math.max(periodDays, 1));
  const behavioralAverage = toCurrency(
    deterministic.behavioralAverage || deterministic.mediaComportamental || dailyAverage
  );
  const outlierThreshold = toCurrency(deterministic.outlierThreshold);

  const categoryMetrics = sanitizeCategoryMetrics(deterministic.categoryMetrics, period.categoryBreakdown, totalPeriod);
  const topMerchants = sanitizeTopMerchants(deterministic.topMerchants, totalPeriod);
  const topTransactions = sanitizeTopTransactions(period.topTransactions);
  const outlierTransactions = sanitizeOutlierTransactions(deterministic.outlierTransactions);
  const smartAlerts = uniqueNonEmpty(Array.isArray(deterministic.smartAlerts) ? deterministic.smartAlerts : []);

  const endDate = parseInputDate(period.endDate);
  const currentMonthDays = Math.max(28, Math.round(toFiniteNumber(deterministic?.projections?.currentMonthDays, getDaysInMonth(endDate))));
  const daysRemainingInMonth = Math.max(
    0,
    Math.round(toFiniteNumber(deterministic?.projections?.daysRemainingInMonth, currentMonthDays - endDate.getDate()))
  );

  const projectedAdditionalEndOfMonth = toCurrency(
    deterministic?.projections?.projectedAdditionalEndOfMonth !== undefined
      ? deterministic.projections.projectedAdditionalEndOfMonth
      : behavioralAverage * daysRemainingInMonth
  );
  const projectedEndOfMonth = toCurrency(
    deterministic?.projections?.projectedEndOfMonth !== undefined
      ? deterministic.projections.projectedEndOfMonth
      : totalPeriod + projectedAdditionalEndOfMonth
  );

  const nextMonthDate = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 1);
  const nextMonthDays = Math.max(
    28,
    Math.round(toFiniteNumber(deterministic?.projections?.nextMonthDays, getDaysInMonth(nextMonthDate)))
  );
  const estimatedInstallmentsPerDay = toCurrency(totalInstallments / Math.max(periodDays, 1));
  const projectedNextMonthInstallments = toCurrency(
    deterministic?.projections?.projectedNextMonthInstallments !== undefined
      ? deterministic.projections.projectedNextMonthInstallments
      : estimatedInstallmentsPerDay * nextMonthDays
  );
  const projectedNextMonthConsumption = toCurrency(
    deterministic?.projections?.projectedNextMonthConsumption !== undefined
      ? deterministic.projections.projectedNextMonthConsumption
      : behavioralAverage * nextMonthDays
  );
  const projectedNextMonthTotal = toCurrency(
    deterministic?.projections?.projectedNextMonthTotal !== undefined
      ? deterministic.projections.projectedNextMonthTotal
      : projectedNextMonthInstallments + projectedNextMonthConsumption
  );

  return {
    startDate: String(period.startDate || ''),
    endDate: String(period.endDate || ''),
    totalPeriod,
    periodDays,
    transactionsConsidered: Math.max(0, Math.round(toFiniteNumber(deterministic.transactionsConsidered, period.count))),
    totalInstallments,
    newConsumption,
    dailyAverage,
    behavioralAverage,
    outlierThreshold,
    categoryMetrics,
    topMerchants,
    topTransactions,
    outlierTransactions,
    smartAlerts,
    projections: {
      currentMonthDays,
      daysRemainingInMonth,
      projectedAdditionalEndOfMonth,
      projectedEndOfMonth,
      nextMonthDays,
      projectedNextMonthInstallments,
      projectedNextMonthConsumption,
      projectedNextMonthTotal,
      currentMonthLabel: formatMonthYear(endDate),
      nextMonthLabel: formatMonthYear(nextMonthDate)
    }
  };
}


module.exports = {
  formatCurrencyBRL,
  calculateGrowthPercent,
  parseInputDate,
  getDaysInMonth,
  formatMonthYear,
  sanitizeCategoryMetrics,
  sanitizeTopMerchants,
  sanitizeTopTransactions,
  sanitizeOutlierTransactions,
  normalizeDeterministicPeriod
};
