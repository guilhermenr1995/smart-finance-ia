const {
  onRequest,
  setCorsHeaders,
  handlePreflightAndMethod,
  authenticateRequest
} = require('../core/base');
const { askGeminiForJson } = require('../core/external-services');

const categorizeTransactions = onRequest(
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
      const items = request.body?.items;
      const categories = request.body?.categories;

      if (!Array.isArray(items) || items.length === 0) {
        response.status(400).json({ error: 'items is required and must be a non-empty array' });
        return;
      }

      if (!Array.isArray(categories) || categories.length === 0) {
        response.status(400).json({ error: 'categories is required and must be a non-empty array' });
        return;
      }

      const geminiApiKey = process.env.GEMINI_API_KEY;
      const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

      if (!geminiApiKey) {
        response.status(500).json({ error: 'Missing GEMINI_API_KEY environment variable' });
        return;
      }

      const promptList = items.map((item) => `${item.index}: "${item.title}"`).join('\n');
      const result = await askGeminiForJson({
        geminiApiKey,
        geminiModel,
        systemInstruction: `Categorize each item strictly using one of these categories: ${categories.join(', ')}. Return only JSON in the format {"index": "category"}.`,
        promptText: promptList,
        temperature: 0
      });

      if (!result.ok) {
        response.status(result.status || 500).json({
          error: 'Gemini request failed',
          details: result.payload,
          model: result.model
        });
        return;
      }

      response.status(200).json({ mapping: result.data });
    } catch (error) {
      response.status(500).json({
        error: 'Unexpected error while categorizing transactions',
        details: error?.message || 'unknown error'
      });
    }
  }
);

module.exports = {
  categorizeTransactions
};
