const { uniqueNonEmpty } = require('../core/base');
const {
  toFiniteNumber,
  toCurrency,
  normalizeCategoryKey,
  normalizeTransactionTitleKey
} = require('../core/domain-utils');
const { formatCurrencyBRL } = require('./report-normalization');

function buildCategoryTransactionDrivers(category, currentTopTransactions, previousTopTransactions, direction = 'increase') {
  const normalizedCategory = normalizeCategoryKey(category);
  if (!normalizedCategory) {
    return [];
  }

  const aggregateByTitle = (transactions) => {
    const map = new Map();

    (transactions || []).forEach((transaction) => {
      if (normalizeCategoryKey(transaction?.category) !== normalizedCategory) {
        return;
      }

      const title = String(transaction?.title || '').trim();
      const key = normalizeTransactionTitleKey(title) || normalizeCategoryKey(title);
      if (!key) {
        return;
      }

      const current = map.get(key) || {
        key,
        title,
        total: 0
      };

      current.total += toFiniteNumber(transaction?.value);
      if (!current.title || title.length > current.title.length) {
        current.title = title;
      }

      map.set(key, current);
    });

    return map;
  };

  const currentMap = aggregateByTitle(currentTopTransactions);
  const previousMap = aggregateByTitle(previousTopTransactions);
  const keys = new Set([...currentMap.keys(), ...previousMap.keys()]);

  const deltas = [...keys].map((key) => {
    const current = currentMap.get(key);
    const previous = previousMap.get(key);
    const currentTotal = toCurrency(current?.total || 0);
    const previousTotal = toCurrency(previous?.total || 0);
    const delta = toCurrency(currentTotal - previousTotal);

    return {
      title: String(current?.title || previous?.title || '').trim() || 'Sem descrição',
      currentTotal,
      previousTotal,
      delta
    };
  });

  const filtered =
    direction === 'reduction'
      ? deltas.filter((item) => item.delta < -0.01).sort((left, right) => left.delta - right.delta)
      : deltas.filter((item) => item.delta > 0.01).sort((left, right) => right.delta - left.delta);

  return filtered.slice(0, 3);
}

function buildDefaultDeltaInsight(item) {
  const deltaValue = formatCurrencyBRL(Math.abs(item.delta));
  const topDriver = Array.isArray(item.drivers) && item.drivers.length > 0 ? item.drivers[0] : null;
  const transactionDelta = Number(item.transactionDelta || 0);
  const ticketAverage = Number(item.ticketAverage || 0);
  const previousTicketAverage = Number(item.previousTicketAverage || 0);
  const ticketDelta = ticketAverage - previousTicketAverage;

  if (item.delta > 0) {
    if (topDriver) {
      if (transactionDelta > 0) {
        return `Subiu ${deltaValue} no período. Você teve ${transactionDelta} compra(s) a mais e o principal impacto foi "${topDriver.title}" (${formatCurrencyBRL(topDriver.delta)}).`;
      }

      if (ticketDelta > 0.01) {
        return `Subiu ${deltaValue} no período. O ticket médio ficou maior e "${topDriver.title}" foi o principal impacto (${formatCurrencyBRL(topDriver.delta)}).`;
      }

      return `Subiu ${deltaValue} no período. Principal impacto: "${topDriver.title}" (${formatCurrencyBRL(topDriver.delta)} a mais).`;
    }

    return `Subiu ${deltaValue} no período e merece acompanhamento mais próximo.`;
  }

  if (item.delta < 0) {
    if (topDriver) {
      if (transactionDelta < 0) {
        return `Reduziu ${deltaValue} no período porque houve ${Math.abs(transactionDelta)} compra(s) a menos. Principal alívio: "${topDriver.title}" (${formatCurrencyBRL(Math.abs(topDriver.delta))} a menos).`;
      }

      if (ticketDelta < -0.01) {
        return `Reduziu ${deltaValue} no período com queda no ticket médio. Destaque para "${topDriver.title}" (${formatCurrencyBRL(Math.abs(topDriver.delta))} a menos).`;
      }

      return `Reduziu ${deltaValue} no período. Principal alívio: "${topDriver.title}" (${formatCurrencyBRL(Math.abs(topDriver.delta))} a menos).`;
    }

    if (transactionDelta < 0) {
      return `Reduziu ${deltaValue} no período com ${Math.abs(transactionDelta)} compra(s) a menos nesta categoria.`;
    }

    if (ticketDelta < -0.01) {
      return `Reduziu ${deltaValue} no período com ticket médio menor em relação ao ciclo anterior.`;
    }

    return `Reduziu ${deltaValue} no período, mantendo tendência positiva.`;
  }

  return 'Manteve padrão estável em relação ao período anterior.';
}

function buildDefaultCategoryInsight(item) {
  if (item.delta > 0) {
    return `Participação relevante no período atual, com aumento de ${formatCurrencyBRL(item.delta)}.`;
  }
  if (item.delta < 0) {
    return `Categoria segue relevante e apresentou queda de ${formatCurrencyBRL(Math.abs(item.delta))}.`;
  }

  return 'Categoria relevante e estável entre os períodos comparados.';
}

function mergeArrayInsightsByCategory(items, insightItems, fallbackBuilder = buildDefaultDeltaInsight) {
  const insightMap = new Map();
  (insightItems || []).forEach((item) => {
    const key = normalizeCategoryKey(item?.category);
    const text = String(item?.insight || '').trim();
    if (!key || !text) {
      return;
    }
    insightMap.set(key, text);
  });

  return (items || []).map((item) => {
    const key = normalizeCategoryKey(item.category);
    const insight = insightMap.get(key) || item.insight || fallbackBuilder(item);
    return {
      ...item,
      insight
    };
  });
}

function mergeNarrativeWithDeterministic(baseReport, aiNarrative) {
  const narrative = aiNarrative && typeof aiNarrative === 'object' ? aiNarrative : {};
  const criticalActions = uniqueNonEmpty([
    ...(Array.isArray(narrative.criticalActions) ? narrative.criticalActions : []),
    ...(Array.isArray(baseReport.criticalActions) ? baseReport.criticalActions : [])
  ]).slice(0, 6);

  const dispensableCuts = uniqueNonEmpty([
    ...(Array.isArray(narrative.dispensableCuts) ? narrative.dispensableCuts : []),
    ...(Array.isArray(baseReport.dispensableCuts) ? baseReport.dispensableCuts : [])
  ]).slice(0, 6);

  const smartAlerts = uniqueNonEmpty([
    ...(Array.isArray(baseReport.smartAlerts) ? baseReport.smartAlerts : []),
    ...(Array.isArray(narrative.smartAlerts) ? narrative.smartAlerts : [])
  ]).slice(0, 8);

  const merged = {
    ...baseReport,
    overview: String(narrative.overview || '').trim() || baseReport.overview,
    increased: mergeArrayInsightsByCategory(baseReport.increased, narrative.increasedInsights, buildDefaultDeltaInsight),
    reduced: mergeArrayInsightsByCategory(baseReport.reduced, narrative.reducedInsights, buildDefaultDeltaInsight),
    categoryHighlights: mergeArrayInsightsByCategory(
      baseReport.categoryHighlights,
      narrative.categoryInsights,
      buildDefaultCategoryInsight
    ),
    criticalActions,
    dispensableCuts,
    smartAlerts
  };

  return merged;
}


module.exports = {
  buildCategoryTransactionDrivers,
  buildDefaultDeltaInsight,
  buildDefaultCategoryInsight,
  mergeArrayInsightsByCategory,
  mergeNarrativeWithDeterministic
};
