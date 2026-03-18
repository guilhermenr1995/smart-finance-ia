const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

initializeApp();

const ALLOWED_ORIGINS = new Set([
  'https://smart-finance-ia.web.app',
  'https://smart-finance-ia.firebaseapp.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function requestGeminiWithRetry(url, options, retryConfig = {}) {
  const maxRetries = retryConfig.maxRetries || 3;
  const baseDelayMs = retryConfig.baseDelayMs || 450;
  let lastPayload = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(url, options);
    const text = await response.text();
    lastPayload = text;

    if (response.ok) {
      return {
        ok: true,
        payload: text
      };
    }

    if (!RETRYABLE_STATUS.has(response.status) || attempt === maxRetries) {
      return {
        ok: false,
        status: response.status,
        payload: text
      };
    }

    const jitter = Math.floor(Math.random() * 350);
    const waitMs = Math.min(baseDelayMs * (2 ** attempt) + jitter, 2600);
    await sleep(waitMs);
  }

  return {
    ok: false,
    status: 500,
    payload: lastPayload || 'Unknown Gemini error'
  };
}

exports.categorizeTransactions = onRequest(
  {
    invoker: 'public',
    timeoutSeconds: 120,
    memory: '256MiB'
  },
  async (request, response) => {
    const origin = request.get('origin') || '';
    const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://smart-finance-ia.web.app';

    response.set('Access-Control-Allow-Origin', allowOrigin);
    response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.set('Vary', 'Origin');

    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    if (request.method !== 'POST') {
      response.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      const authHeader = request.get('Authorization') || '';
      const idToken = authHeader.replace(/^Bearer\s+/i, '');

      if (!idToken) {
        response.status(401).json({ error: 'Missing Authorization token' });
        return;
      }

      await getAuth().verifyIdToken(idToken);

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

      const geminiResult = await requestGeminiWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptList }] }],
            systemInstruction: {
              parts: [
                {
                  text: `Categorize each item strictly using one of these categories: ${categories.join(', ')}. Return only JSON in the format {"index": "category"}.`
                }
              ]
            },
            generationConfig: {
              temperature: 0,
              responseMimeType: 'application/json'
            }
          })
        },
        {
          maxRetries: 3,
          baseDelayMs: 450
        }
      );

      if (!geminiResult.ok) {
        response.status(geminiResult.status || 500).json({
          error: 'Gemini request failed',
          details: geminiResult.payload
        });
        return;
      }

      const payload = JSON.parse(geminiResult.payload);
      const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        response.status(502).json({ error: 'Gemini returned an empty response' });
        return;
      }

      const mapping = JSON.parse(rawText.replace(/^```json\s*/i, '').replace(/```$/, '').trim());
      response.status(200).json({ mapping });
    } catch (error) {
      response.status(500).json({
        error: 'Unexpected error while categorizing transactions',
        details: error?.message || 'unknown error'
      });
    }
  }
);
