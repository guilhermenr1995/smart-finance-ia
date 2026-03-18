const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

initializeApp();

const db = getFirestore();
const DEFAULT_ALLOWED_ORIGIN = 'https://smart-finance-ia.web.app';
const CONSULTANT_DAILY_LIMIT = 3;
const APP_TIMEZONE = 'America/Sao_Paulo';

const ALLOWED_ORIGINS = new Set([
  'https://smart-finance-ia.web.app',
  'https://smart-finance-ia.firebaseapp.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const DEFAULT_FALLBACK_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function setCorsHeaders(request, response) {
  const origin = request.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : DEFAULT_ALLOWED_ORIGIN;

  response.set('Access-Control-Allow-Origin', allowOrigin);
  response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.set('Vary', 'Origin');
}

function handlePreflightAndMethod(request, response) {
  if (request.method === 'OPTIONS') {
    response.status(204).send('');
    return true;
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return true;
  }

  return false;
}

async function authenticateRequest(request, response) {
  const authHeader = request.get('Authorization') || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '');

  if (!idToken) {
    response.status(401).json({ error: 'Missing Authorization token' });
    return null;
  }

  try {
    return await getAuth().verifyIdToken(idToken);
  } catch (error) {
    response.status(401).json({ error: 'Invalid or expired Authorization token' });
    return null;
  }
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

function uniqueNonEmpty(values) {
  const seen = new Set();
  const output = [];

  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function buildModelCandidates(primaryModel) {
  const envFallback = String(process.env.GEMINI_FALLBACK_MODELS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return uniqueNonEmpty([primaryModel, ...envFallback, ...DEFAULT_FALLBACK_MODELS]);
}

function isNotFoundModelError(status, payload) {
  if (status === 404) {
    return true;
  }

  const raw = String(payload || '');
  return /NOT_FOUND|is not found|unsupported for generateContent/i.test(raw);
}

function safeParseJson(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return null;
  }

  try {
    return JSON.parse(rawText.replace(/^```json\s*/i, '').replace(/```$/, '').trim());
  } catch (error) {
    return null;
  }
}

function toSafeKey(value) {
  return String(value || '')
    .trim()
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/[^A-Za-z0-9_-]/g, '');
}

function buildInsightKeyFromFilters(filters = {}) {
  const payload = JSON.stringify({
    startDate: filters.startDate || '',
    endDate: filters.endDate || '',
    accountType: filters.accountType || 'all',
    category: filters.category || 'all'
  });

  return toSafeKey(Buffer.from(payload, 'utf8').toString('base64'));
}

function resolveInsightKey(rawKey, filters) {
  const safeRawKey = toSafeKey(rawKey);
  if (safeRawKey.length >= 12) {
    return safeRawKey;
  }

  return buildInsightKeyFromFilters(filters);
}

function getDateKeyInTimezone() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

async function reserveConsultantUsage(userId, appId) {
  const dateKey = getDateKeyInTimezone();
  const usageRef = db.collection('ai_consultant_usage').doc(`${userId}_${dateKey}`);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(usageRef);
    const usedCount = Number(snapshot.data()?.count || 0);

    if (usedCount >= CONSULTANT_DAILY_LIMIT) {
      const limitError = new Error('Daily consultant limit reached');
      limitError.code = 'DAILY_LIMIT_REACHED';
      limitError.usage = {
        limit: CONSULTANT_DAILY_LIMIT,
        used: usedCount,
        remaining: 0,
        dateKey
      };
      throw limitError;
    }

    const nextCount = usedCount + 1;
    const payload = {
      userId,
      appId: appId || null,
      dateKey,
      count: nextCount,
      updatedAt: FieldValue.serverTimestamp()
    };

    if (!snapshot.exists) {
      payload.createdAt = FieldValue.serverTimestamp();
    }

    transaction.set(usageRef, payload, { merge: true });

    return {
      limit: CONSULTANT_DAILY_LIMIT,
      used: nextCount,
      remaining: Math.max(0, CONSULTANT_DAILY_LIMIT - nextCount),
      dateKey
    };
  });
}

async function askGeminiForJson({
  geminiApiKey,
  geminiModel,
  systemInstruction,
  promptText,
  temperature = 0
}) {
  const modelCandidates = buildModelCandidates(geminiModel);
  let lastError = null;

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const candidateModel = modelCandidates[index];
    const geminiResult = await requestGeminiWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          generationConfig: {
            temperature,
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
      const shouldTryNextModel =
        isNotFoundModelError(geminiResult.status, geminiResult.payload) && index < modelCandidates.length - 1;
      if (shouldTryNextModel) {
        continue;
      }

      lastError = {
        ok: false,
        status: geminiResult.status || 500,
        payload: geminiResult.payload,
        model: candidateModel
      };
      break;
    }

    const envelope = safeParseJson(geminiResult.payload);
    const rawText = envelope?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return {
        ok: false,
        status: 502,
        payload: 'Gemini returned an empty response',
        model: candidateModel
      };
    }

    const parsed = safeParseJson(rawText);
    if (!parsed) {
      return {
        ok: false,
        status: 502,
        payload: 'Gemini returned invalid JSON',
        model: candidateModel
      };
    }

    return {
      ok: true,
      data: parsed,
      model: candidateModel
    };
  }

  return (
    lastError || {
      ok: false,
      status: 500,
      payload: 'Gemini request failed on all candidate models',
      model: modelCandidates[0] || geminiModel
    }
  );
}

exports.categorizeTransactions = onRequest(
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

exports.analyzeSpendingInsights = onRequest(
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

      const geminiApiKey = process.env.GEMINI_API_KEY;
      const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      if (!geminiApiKey) {
        response.status(500).json({ error: 'Missing GEMINI_API_KEY environment variable' });
        return;
      }

      const promptPayload = {
        filters,
        currentPeriod,
        previousPeriod
      };

      const result = await askGeminiForJson({
        geminiApiKey,
        geminiModel,
        systemInstruction:
          'You are a personal finance consultant. Always return valid JSON and only JSON. Answer in Brazilian Portuguese. Compare current period versus previous period and provide practical, realistic suggestions.',
        promptText:
          'Analyze this spending data and return strictly this JSON structure: ' +
          '{"overview":"...","increased":[{"category":"...","current":0,"previous":0,"delta":0,"insight":"..."}],"reduced":[{"category":"...","current":0,"previous":0,"delta":0,"insight":"..."}],"criticalActions":["..."],"dispensableCuts":["..."]}. ' +
          'Rules: bring useful insights, avoid generic advice, focus on what increased, what reduced, and practical next actions. Data: ' +
          JSON.stringify(promptPayload),
        temperature: 0.2
      });

      if (!result.ok) {
        response.status(result.status || 500).json({
          error: 'Gemini request failed',
          details: result.payload,
          model: result.model
        });
        return;
      }

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
        insights: result.data,
        model: result.model || geminiModel,
        generatedAt,
        updatedAt: generatedAt
      };

      if (appId) {
        await db
          .collection(`artifacts/${appId}/users/${decodedToken.uid}/consultor_insights`)
          .doc(insightKey)
          .set(storedInsight, { merge: true });
      }

      response.status(200).json({
        insights: result.data,
        usage,
        storedInsight
      });
    } catch (error) {
      response.status(500).json({
        error: 'Unexpected error while generating spending insights',
        details: error?.message || 'unknown error'
      });
    }
  }
);
