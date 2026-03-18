function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\b\d+\s*\/\s*\d+\b/g, ' ')
    .replace(/\bPARCELA\b/g, ' ')
    .replace(/\bCOMPRA\b/g, ' ')
    .replace(/\bDEBITO\b/g, ' ')
    .replace(/\bCREDITO\b/g, ' ')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(normalizedText) {
  return normalizedText
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !/^\d+$/.test(token));
}

function toSet(tokens) {
  return new Set(tokens);
}

function diceCoefficient(leftSet, rightSet) {
  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }

  let intersection = 0;
  leftSet.forEach((token) => {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  });

  return (2 * intersection) / (leftSet.size + rightSet.size);
}

function buildCategoryCounter(records) {
  const counts = new Map();
  for (const record of records) {
    counts.set(record.category, (counts.get(record.category) || 0) + 1);
  }
  return counts;
}

function pickDominantCategory(categoryCounts) {
  const entries = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return null;
  }

  const [topCategory, topCount] = entries[0];
  const secondCount = entries[1]?.[1] || 0;
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const dominance = topCount / total;
  const margin = topCount - secondCount;

  if (dominance < 0.6 || margin < 1) {
    return null;
  }

  return topCategory;
}

export class CategoryMemoryService {
  constructor(config = {}) {
    this.minSimilarityScore = config.minSimilarityScore || 0.82;
    this.ambiguousDelta = config.ambiguousDelta || 0.08;
    this.fallbackSimilarityScore = config.fallbackSimilarityScore || 0.74;
  }

  suggestCategories(candidates, historicalTransactions) {
    const knowledgeBase = this.buildKnowledgeBase(historicalTransactions);
    const updates = [];
    const unresolved = [];

    for (const candidate of candidates) {
      const suggestion = this.findBestCategory(candidate, knowledgeBase);
      if (!suggestion) {
        unresolved.push(candidate);
        continue;
      }

      updates.push({
        docId: candidate.docId,
        category: suggestion.category,
        source: suggestion.source,
        score: suggestion.score
      });
    }

    return {
      updates,
      unresolved
    };
  }

  applyMemoryToTransactions(transactions, historicalTransactions, options = {}) {
    const onlyOthers = options.onlyOthers !== false;
    const knowledgeBase = this.buildKnowledgeBase(historicalTransactions);
    const updates = [];

    const withMemory = transactions.map((transaction, index) => {
      if (onlyOthers && transaction.category !== 'Outros') {
        return transaction;
      }

      const suggestion = this.findBestCategory(transaction, knowledgeBase);
      if (!suggestion) {
        return transaction;
      }

      updates.push({
        index,
        category: suggestion.category,
        source: suggestion.source,
        score: suggestion.score
      });

      return {
        ...transaction,
        category: suggestion.category
      };
    });

    return {
      transactions: withMemory,
      updates
    };
  }

  buildKnowledgeBase(transactions) {
    const references = transactions
      .filter((transaction) => transaction.category && transaction.category !== 'Outros')
      .map((transaction) => {
        const normalizedTitle = normalizeText(transaction.title);
        const tokens = tokenize(normalizedTitle);
        return {
          category: transaction.category,
          normalizedTitle,
          tokens,
          tokenSet: toSet(tokens)
        };
      })
      .filter((record) => record.normalizedTitle.length > 0);

    const exactMap = new Map();
    for (const reference of references) {
      if (!exactMap.has(reference.normalizedTitle)) {
        exactMap.set(reference.normalizedTitle, []);
      }
      exactMap.get(reference.normalizedTitle).push(reference);
    }

    return {
      references,
      exactMap
    };
  }

  findBestCategory(candidate, knowledgeBase) {
    const normalizedTitle = normalizeText(candidate.title);
    if (!normalizedTitle) {
      return null;
    }

    const exactMatch = this.findExactMatch(normalizedTitle, knowledgeBase.exactMap);
    if (exactMatch) {
      return {
        category: exactMatch,
        source: 'memory-exact',
        score: 1
      };
    }

    const candidateTokens = tokenize(normalizedTitle);
    const candidateTokenSet = toSet(candidateTokens);
    if (candidateTokenSet.size === 0) {
      return null;
    }

    const ranked = [];
    for (const reference of knowledgeBase.references) {
      let score = diceCoefficient(candidateTokenSet, reference.tokenSet);
      if (score <= 0) {
        continue;
      }

      if (
        normalizedTitle.includes(reference.normalizedTitle) ||
        reference.normalizedTitle.includes(normalizedTitle)
      ) {
        score += 0.08;
      }

      ranked.push({
        score,
        category: reference.category,
        startsWithSameToken: reference.tokens[0] && candidateTokens[0] && reference.tokens[0] === candidateTokens[0]
      });
    }

    if (ranked.length === 0) {
      return null;
    }

    ranked.sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const second = ranked[1];

    const minScore = best.startsWithSameToken ? this.fallbackSimilarityScore : this.minSimilarityScore;
    if (best.score < minScore) {
      return null;
    }

    if (second && Math.abs(best.score - second.score) < this.ambiguousDelta && second.category !== best.category) {
      return null;
    }

    return {
      category: best.category,
      source: 'memory-similar',
      score: Number(best.score.toFixed(3))
    };
  }

  findExactMatch(normalizedTitle, exactMap) {
    const matches = exactMap.get(normalizedTitle);
    if (!matches || matches.length === 0) {
      return null;
    }

    const categoryCounts = buildCategoryCounter(matches);
    return pickDominantCategory(categoryCounts);
  }
}
