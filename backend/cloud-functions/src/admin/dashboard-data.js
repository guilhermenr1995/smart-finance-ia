const { toFiniteNumber } = require('../core/domain-utils');

function parseIsoDate(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function toIsoOrEmpty(value) {
  if (!value) {
    return '';
  }

  if (typeof value?.toDate === 'function') {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = parseIsoDate(value);
  return parsed ? parsed.toISOString() : String(value || '');
}

function summarizeTransactionCollection(snapshot) {
  const summary = {
    totalTransactions: 0,
    importedTransactions: 0,
    manualTransactions: 0,
    activeTransactions: 0,
    pendingCategorization: 0,
    autoAcceptedTransactions: 0,
    autoOverriddenTransactions: 0,
    autoBySource: {}
  };

  snapshot.forEach((doc) => {
    const data = doc.data() || {};
    const category = String(data.category || 'Outros').trim() || 'Outros';
    const createdBy = data.createdBy === 'manual' ? 'manual' : 'import';
    const isAutoAssigned = Boolean(data.categoryAutoAssigned);
    const isManuallyEdited = Boolean(data.categoryManuallyEdited);
    const source = String(data.categorySource || 'unknown').trim() || 'unknown';

    summary.totalTransactions += 1;
    summary.activeTransactions += data.active === false ? 0 : 1;
    summary.pendingCategorization += data.active === false ? 0 : category === 'Outros' ? 1 : 0;

    if (createdBy === 'manual') {
      summary.manualTransactions += 1;
    } else {
      summary.importedTransactions += 1;
    }

    if (isAutoAssigned && !isManuallyEdited) {
      summary.autoAcceptedTransactions += 1;
      summary.autoBySource[source] = Number(summary.autoBySource[source] || 0) + 1;
    } else if (isAutoAssigned && isManuallyEdited) {
      summary.autoOverriddenTransactions += 1;
      summary.autoBySource[source] = Number(summary.autoBySource[source] || 0) + 1;
    }
  });

  return summary;
}

function mergeDailyUsage(globalDailyUsage, perUserDailyUsage, userId, dateKey, dailyData) {
  const aiCategorizationRuns = Math.max(0, Math.round(toFiniteNumber(dailyData.aiCategorizationRuns)));
  const aiConsultantRuns = Math.max(0, Math.round(toFiniteNumber(dailyData.aiConsultantRuns)));
  const importOperations = Math.max(0, Math.round(toFiniteNumber(dailyData.importOperations)));
  const importedTransactions = Math.max(0, Math.round(toFiniteNumber(dailyData.importedTransactions)));
  const manualTransactions = Math.max(0, Math.round(toFiniteNumber(dailyData.manualTransactions)));

  if (!globalDailyUsage[dateKey]) {
    globalDailyUsage[dateKey] = {
      dateKey,
      aiCategorizationRuns: 0,
      aiConsultantRuns: 0,
      importOperations: 0,
      importedTransactions: 0,
      manualTransactions: 0
    };
  }

  globalDailyUsage[dateKey].aiCategorizationRuns += aiCategorizationRuns;
  globalDailyUsage[dateKey].aiConsultantRuns += aiConsultantRuns;
  globalDailyUsage[dateKey].importOperations += importOperations;
  globalDailyUsage[dateKey].importedTransactions += importedTransactions;
  globalDailyUsage[dateKey].manualTransactions += manualTransactions;

  if (!perUserDailyUsage[userId]) {
    perUserDailyUsage[userId] = {
      aiCategorizationRunsTotal: 0,
      aiConsultantRunsTotal: 0,
      importOperationsTotal: 0,
      importedTransactionsTotal: 0,
      manualTransactionsTotal: 0
    };
  }

  perUserDailyUsage[userId].aiCategorizationRunsTotal += aiCategorizationRuns;
  perUserDailyUsage[userId].aiConsultantRunsTotal += aiConsultantRuns;
  perUserDailyUsage[userId].importOperationsTotal += importOperations;
  perUserDailyUsage[userId].importedTransactionsTotal += importedTransactions;
  perUserDailyUsage[userId].manualTransactionsTotal += manualTransactions;
}


module.exports = {
  parseIsoDate,
  toIsoOrEmpty,
  summarizeTransactionCollection,
  mergeDailyUsage
};
