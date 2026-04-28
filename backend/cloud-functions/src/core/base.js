const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldPath, FieldValue, getFirestore } = require('firebase-admin/firestore');

initializeApp();

const db = getFirestore();
const DEFAULT_ALLOWED_ORIGIN = 'https://smart-finance-ia.web.app';
const CONSULTANT_DAILY_LIMIT = 3;
const APP_TIMEZONE = 'America/Sao_Paulo';
const DEFAULT_BANK_ACCOUNT = 'Padrão';

const ALLOWED_ORIGINS = new Set([
  'https://smart-finance-ia.web.app',
  'https://smart-finance-ia.firebaseapp.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const DEFAULT_FALLBACK_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
const DEFAULT_ADMIN_EMAILS = ['guilhermenr1995@gmail.com'];
const USER_JOURNEY_RESET_COLLECTIONS = [
  'transacoes',
  'categorias',
  'contas_bancarias',
  'open_finance_conexoes',
  'metas_mensais',
  'consultor_insights',
  'metrics_daily'
];

const OPEN_FINANCE_BANKS = {
  'meu-pluggy': 'Meu Pluggy',
  nubank: 'Nubank',
  itau: 'Itaú',
  bradesco: 'Bradesco',
  'banco-do-brasil': 'Banco do Brasil'
};
const OPEN_FINANCE_REAL_PROVIDERS = new Set(['pluggy', 'belvo']);
const OPEN_FINANCE_PROVIDER = String(process.env.OPEN_FINANCE_PROVIDER || 'pluggy').trim().toLowerCase();
const OPEN_FINANCE_UPSTREAM_URL = String(process.env.OPEN_FINANCE_UPSTREAM_URL || '').trim();
const OPEN_FINANCE_UPSTREAM_API_KEY = String(process.env.OPEN_FINANCE_UPSTREAM_API_KEY || '').trim();

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

function toNormalizedEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getAllowedAdminEmails() {
  const envEmails = String(process.env.ADMIN_ALLOWED_EMAILS || '')
    .split(',')
    .map((item) => toNormalizedEmail(item))
    .filter(Boolean);

  return new Set(uniqueNonEmpty([...DEFAULT_ADMIN_EMAILS, ...envEmails]).map((item) => toNormalizedEmail(item)));
}

function isAdminRequest(decodedToken) {
  const email = toNormalizedEmail(decodedToken?.email);
  if (!email) {
    return false;
  }

  const provider = String(decodedToken?.firebase?.sign_in_provider || '').trim().toLowerCase();
  if (provider !== 'google.com') {
    return false;
  }

  return getAllowedAdminEmails().has(email);
}

module.exports = {
  onRequest,
  getAuth,
  FieldPath,
  FieldValue,
  db,
  DEFAULT_ALLOWED_ORIGIN,
  CONSULTANT_DAILY_LIMIT,
  APP_TIMEZONE,
  DEFAULT_BANK_ACCOUNT,
  ALLOWED_ORIGINS,
  RETRYABLE_STATUS,
  DEFAULT_FALLBACK_MODELS,
  DEFAULT_ADMIN_EMAILS,
  USER_JOURNEY_RESET_COLLECTIONS,
  OPEN_FINANCE_BANKS,
  OPEN_FINANCE_REAL_PROVIDERS,
  OPEN_FINANCE_PROVIDER,
  OPEN_FINANCE_UPSTREAM_URL,
  OPEN_FINANCE_UPSTREAM_API_KEY,
  sleep,
  setCorsHeaders,
  handlePreflightAndMethod,
  authenticateRequest,
  requestGeminiWithRetry,
  uniqueNonEmpty,
  buildModelCandidates,
  isNotFoundModelError,
  safeParseJson,
  toSafeKey,
  buildInsightKeyFromFilters,
  resolveInsightKey,
  getDateKeyInTimezone,
  toNormalizedEmail,
  getAllowedAdminEmails,
  isAdminRequest
};
