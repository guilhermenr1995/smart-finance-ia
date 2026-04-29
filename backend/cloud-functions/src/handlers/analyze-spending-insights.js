const {
  onRequest,
  setCorsHeaders,
  handlePreflightAndMethod,
  authenticateRequest,
  resolveInsightKey,
  CONSULTANT_DAILY_LIMIT,
  getDateKeyInTimezone,
  db
} = require('../core/base');
const { askGeminiForJson } = require('../core/external-services');
const {
  buildDeterministicConsultantReport,
  mergeNarrativeWithDeterministic
} = require('../ai/report-insights');

const analyzeSpendingInsights = onRequest(
  {
    invoker: 'public',
    timeoutSeconds: 120,
    memory: '256MiB'
  },
  async (request, response) => {
    setCorsHeaders(request, response);

    if (handlePreflightAndMethod(request, response)) {
      return;
    }

    const decodedToken = await authenticateRequest(request, response);
    if (!decodedToken) {
      return;
    }

    try {
      const currentPeriod = request.body?.currentPeriod;
      const previousPeriod = request.body?.previousPeriod;
      const filters = request.body?.filters || {};
      const appId = request.body?.appId || null;
      const insightKey = resolveInsightKey(request.body?.insightKey, filters);
      const forceRefresh = Boolean(request.body?.forceRefresh);

      if (!currentPeriod || typeof currentPeriod !== 'object') {
        response.status(400).json({ error: 'currentPeriod is required' });
        return;
      }

      if (!previousPeriod || typeof previousPeriod !== 'object') {
        response.status(400).json({ error: 'previousPeriod is required' });
        return;
      }

      // Daily usage validation is temporarily disabled.
      const usage = {
        limit: CONSULTANT_DAILY_LIMIT,
        used: 0,
        remaining: CONSULTANT_DAILY_LIMIT,
        dateKey: getDateKeyInTimezone()
      };

      if (appId && insightKey && !forceRefresh) {
        const existingInsightDoc = await db
          .collection(`artifacts/${appId}/users/${decodedToken.uid}/consultor_insights`)
          .doc(insightKey)
          .get();

        if (existingInsightDoc.exists) {
          const existingInsight = existingInsightDoc.data();
          if (existingInsight?.insights && typeof existingInsight.insights === 'object') {
            response.status(200).json({
              insights: existingInsight.insights,
              usage,
              storedInsight: {
                ...existingInsight,
                key: existingInsight.key || insightKey
              },
              fromCache: true
            });
            return;
          }
        }
      }

      const geminiApiKey = process.env.GEMINI_API_KEY;
      const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      if (!geminiApiKey) {
        response.status(500).json({ error: 'Missing GEMINI_API_KEY environment variable' });
        return;
      }

      const baseReport = buildDeterministicConsultantReport(currentPeriod, previousPeriod);
      const goalContext = request.body?.goalContext && typeof request.body.goalContext === 'object' ? request.body.goalContext : null;
      const promptPayload = {
        filters,
        deterministicBase: {
          indicators: baseReport.indicators,
          increased: baseReport.increased,
          reduced: baseReport.reduced,
          increasedDrivers: baseReport.increased.map((item) => ({
            category: item.category,
            drivers: item.drivers || []
          })),
          reducedDrivers: baseReport.reduced.map((item) => ({
            category: item.category,
            drivers: item.drivers || []
          })),
          topMerchants: baseReport.topMerchants,
          topTransactions: baseReport.topTransactions,
          outlierTransactions: baseReport.outlierTransactions,
          smartAlerts: baseReport.smartAlerts
        },
        goalContext
      };

      const result = await askGeminiForJson({
        geminiApiKey,
        geminiModel,
        systemInstruction:
          'Você é um consultor financeiro pessoal para consumidor final. Sempre retorne JSON válido e somente JSON. Responda em português do Brasil. Não invente números, use apenas os dados recebidos.',
        promptText:
          'Analise os dados e retorne estritamente este JSON: ' +
          '{"overview":"...","increasedInsights":[{"category":"...","insight":"..."}],"reducedInsights":[{"category":"...","insight":"..."}],"smartAlerts":["..."]}. ' +
          'Regras: textos objetivos, simples e úteis; sem projeções futuras; destaque apenas categorias que aumentaram ou reduziram. ' +
          'Nos insights de redução, explique o provável motivo (ex.: menos idas a restaurantes, ticket médio menor, menos frequência). ' +
          'Sempre que possível cite as transações que mais influenciaram cada categoria usando os drivers recebidos. ' +
          'Se existir goalContext.hasGoals=true, use obrigatoriamente metas e comparação com período anterior nos textos, com frases diretas como: "em X, você está Y acima/abaixo da meta de R$... e variou Z vs período anterior". ' +
          'No overview, cite pelo menos uma categoria com meta estourada (se houver) e uma com melhora vs período anterior (se houver). ' +
          'No campo smartAlerts, inclua alertas de desvio de meta quando houver categorias acima da meta. Dados: ' +
          JSON.stringify(promptPayload),
        temperature: 0.25
      });

      const insights = result.ok ? mergeNarrativeWithDeterministic(baseReport, result.data) : baseReport;
      const warning =
        result.ok
          ? null
          : {
              error: 'Gemini request failed, deterministic fallback used',
              details: result.payload,
              model: result.model
            };

      const generatedAt = new Date().toISOString();
      const storedInsight = {
        key: insightKey,
        filters: {
          startDate: filters.startDate || '',
          endDate: filters.endDate || '',
          accountType: filters.accountType || 'all',
          category: filters.category || 'all'
        },
        currentPeriod: {
          startDate: currentPeriod.startDate || '',
          endDate: currentPeriod.endDate || ''
        },
        previousPeriod: {
          startDate: previousPeriod.startDate || '',
          endDate: previousPeriod.endDate || ''
        },
        goalContext,
        insights,
        model: result.model || geminiModel,
        generatedAt,
        updatedAt: generatedAt,
        warning
      };

      if (appId) {
        await db
          .collection(`artifacts/${appId}/users/${decodedToken.uid}/consultor_insights`)
          .doc(insightKey)
          .set(storedInsight, { merge: true });
      }

      response.status(200).json({
        insights,
        usage,
        storedInsight,
        warning
      });
    } catch (error) {
      response.status(500).json({
        error: 'Unexpected error while generating spending insights',
        details: error?.message || 'unknown error'
      });
    }
  }
);

module.exports = {
  analyzeSpendingInsights
};
