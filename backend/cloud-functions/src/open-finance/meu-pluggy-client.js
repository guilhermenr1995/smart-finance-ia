const crypto = require('crypto');
const { sanitizeString } = require('../core/domain-utils');

const RAW_API_BASE_URL = String(process.env.OPEN_FINANCE_MEU_PLUGGY_API_BASE_URL || 'https://api.pluggy.ai').trim();
const MEU_PLUGGY_CLIENT_ID = String(process.env.OPEN_FINANCE_MEU_PLUGGY_CLIENT_ID || '').trim();
const MEU_PLUGGY_CLIENT_SECRET = String(process.env.OPEN_FINANCE_MEU_PLUGGY_CLIENT_SECRET || '').trim();
const MEU_PLUGGY_ACCOUNT_TYPES = String(process.env.OPEN_FINANCE_MEU_PLUGGY_ACCOUNT_TYPES || 'BANK,CREDIT')
  .split(',')
  .map((value) => String(value || '').trim().toUpperCase())
  .filter((value) => value === 'BANK' || value === 'CREDIT');
const MEU_PLUGGY_SYNC_FROM_DAYS = Math.max(
  1,
  Math.min(365, Math.round(Number(process.env.OPEN_FINANCE_MEU_PLUGGY_SYNC_FROM_DAYS || 60)))
);
const API_KEY_TTL_MS = 1000 * 60 * 105;
const MAX_PAGE_SIZE = 500;
const MAX_PAGES = 40;

const apiBaseUrl = normalizeApiBaseUrl(RAW_API_BASE_URL);
let cachedApiKey = '';
let cachedApiKeyExpiresAt = 0;

function normalizeApiBaseUrl(rawUrl) {
  const parsed = new URL(String(rawUrl || '').trim() || 'https://api.pluggy.ai');
  return parsed.toString().replace(/\/+$/g, '');
}

function getAllowedTransactionsLinkHosts() {
  const baseHost = new URL(apiBaseUrl).host;
  return new Set([baseHost, 'api.pluggy.ai']);
}

function assertMeuPluggyCredentials() {
  if (MEU_PLUGGY_CLIENT_ID && MEU_PLUGGY_CLIENT_SECRET) {
    return;
  }

  const error = new Error(
    'Integração Meu Pluggy não configurada. Defina OPEN_FINANCE_MEU_PLUGGY_CLIENT_ID e OPEN_FINANCE_MEU_PLUGGY_CLIENT_SECRET.'
  );
  error.statusCode = 503;
  throw error;
}

function readJsonSafely(rawText) {
  try {
    const parsed = JSON.parse(String(rawText || '').trim());
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function normalizeListResponse(data) {
  if (Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data?.results)) {
    return data.results;
  }
  if (Array.isArray(data?.items)) {
    return data.items;
  }
  return [];
}

function buildPluggyError(statusCode, payload = {}, fallback = 'Falha ao comunicar com Meu Pluggy.') {
  const details = sanitizeString(
    payload?.message || payload?.error || payload?.details || payload?.codeDescription || fallback,
    600
  );
  const error = new Error(details || fallback);
  error.statusCode = statusCode;
  return error;
}

function hashPayload(payload = {}) {
  return crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 20);
}

async function authenticateMeuPluggy(options = {}) {
  assertMeuPluggyCredentials();

  const force = Boolean(options.force);
  const now = Date.now();
  if (!force && cachedApiKey && cachedApiKeyExpiresAt > now + 5000) {
    return cachedApiKey;
  }

  const response = await fetch(`${apiBaseUrl}/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      clientId: MEU_PLUGGY_CLIENT_ID,
      clientSecret: MEU_PLUGGY_CLIENT_SECRET
    })
  });

  const rawBody = await response.text().catch(() => '');
  const data = readJsonSafely(rawBody);
  if (!response.ok) {
    throw buildPluggyError(response.status, data, 'Não foi possível autenticar no Meu Pluggy.');
  }

  const apiKey = sanitizeString(data?.apiKey || data?.accessToken || data?.access_token, 800);
  if (!apiKey) {
    const error = new Error('Meu Pluggy não retornou apiKey no endpoint /auth.');
    error.statusCode = 502;
    throw error;
  }

  cachedApiKey = apiKey;
  cachedApiKeyExpiresAt = now + API_KEY_TTL_MS;
  return apiKey;
}

function appendQueryParams(url, query = {}) {
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry === undefined || entry === null || entry === '') {
          return;
        }
        url.searchParams.append(key, String(entry));
      });
      return;
    }
    url.searchParams.set(key, String(value));
  });
}

async function requestMeuPluggy(path, options = {}) {
  const method = String(options.method || 'GET').trim().toUpperCase();
  const useAbsoluteUrl = Boolean(options.absoluteUrl);
  const requestUrl = useAbsoluteUrl ? new URL(path) : new URL(`${apiBaseUrl}${path}`);

  if (options.query && typeof options.query === 'object') {
    appendQueryParams(requestUrl, options.query);
  }

  const apiKey = await authenticateMeuPluggy();
  const response = await fetch(requestUrl.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
      ...(options.headers && typeof options.headers === 'object' ? options.headers : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const rawBody = await response.text().catch(() => '');
  const data = readJsonSafely(rawBody);
  return {
    ok: response.ok,
    statusCode: response.status,
    data,
    rawBody
  };
}

function getSyncStartDateIso() {
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() - MEU_PLUGGY_SYNC_FROM_DAYS);
  return baseDate.toISOString().slice(0, 10);
}

function resolveAccountTypes() {
  return MEU_PLUGGY_ACCOUNT_TYPES.length > 0 ? [...MEU_PLUGGY_ACCOUNT_TYPES] : ['BANK', 'CREDIT'];
}

function sanitizeItemId(value) {
  return sanitizeString(value, 140);
}

async function getItemById(itemId) {
  const safeItemId = sanitizeItemId(itemId);
  if (!safeItemId) {
    const error = new Error('Item ID do Meu Pluggy é obrigatório.');
    error.statusCode = 400;
    throw error;
  }

  const response = await requestMeuPluggy(`/items/${safeItemId}`);
  if (!response.ok) {
    throw buildPluggyError(response.statusCode, response.data, `Não foi possível obter o item ${safeItemId}.`);
  }

  return response.data || {};
}

async function updateItemById(itemId, payload = {}) {
  const safeItemId = sanitizeItemId(itemId);
  if (!safeItemId) {
    const error = new Error('Item ID do Meu Pluggy é obrigatório.');
    error.statusCode = 400;
    throw error;
  }

  const response = await requestMeuPluggy(`/items/${safeItemId}`, {
    method: 'PATCH',
    body: payload && typeof payload === 'object' ? payload : {}
  });

  if (!response.ok) {
    if (response.statusCode === 409 || response.statusCode === 429) {
      return {
        accepted: true,
        deferred: true,
        item: null
      };
    }

    throw buildPluggyError(response.statusCode, response.data, `Falha ao sincronizar item ${safeItemId}.`);
  }

  return {
    accepted: true,
    deferred: false,
    item: response.data || {}
  };
}

async function listAccountsByItem(itemId) {
  const safeItemId = sanitizeItemId(itemId);
  if (!safeItemId) {
    return [];
  }

  const accountTypes = resolveAccountTypes();
  const accounts = [];
  for (const accountType of accountTypes) {
    const response = await requestMeuPluggy('/accounts', {
      query: {
        itemId: safeItemId,
        type: accountType
      }
    });

    if (!response.ok) {
      throw buildPluggyError(
        response.statusCode,
        response.data,
        `Falha ao listar contas ${accountType} do item ${safeItemId}.`
      );
    }

    accounts.push(...normalizeListResponse(response.data));
  }

  const uniqueById = new Map();
  accounts.forEach((account) => {
    const accountId = sanitizeString(account?.id, 140);
    if (!accountId || uniqueById.has(accountId)) {
      return;
    }
    uniqueById.set(accountId, account);
  });
  return [...uniqueById.values()];
}

async function listTransactionsForAccount(accountId, query = {}) {
  const safeAccountId = sanitizeString(accountId, 140);
  if (!safeAccountId) {
    return [];
  }

  const transactions = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= MAX_PAGES) {
    const response = await requestMeuPluggy('/transactions', {
      query: {
        accountId: safeAccountId,
        from: query.from,
        to: query.to,
        createdAtFrom: query.createdAtFrom,
        page,
        pageSize: MAX_PAGE_SIZE
      }
    });

    if (!response.ok) {
      throw buildPluggyError(
        response.statusCode,
        response.data,
        `Falha ao listar transações da conta ${safeAccountId}.`
      );
    }

    const pageItems = normalizeListResponse(response.data);
    transactions.push(...pageItems);

    const parsedTotalPages = Number(response.data?.totalPages);
    totalPages = Number.isFinite(parsedTotalPages) && parsedTotalPages > 0 ? parsedTotalPages : 1;
    page += 1;
  }

  return transactions;
}

async function listTransactionsByIds(accountId, transactionIds = []) {
  const safeAccountId = sanitizeString(accountId, 140);
  if (!safeAccountId) {
    return [];
  }

  const sanitizedIds = [...new Set((transactionIds || []).map((id) => sanitizeString(id, 140)).filter(Boolean))];
  if (sanitizedIds.length === 0) {
    return [];
  }

  const response = await requestMeuPluggy('/transactions', {
    query: {
      accountId: safeAccountId,
      ids: sanitizedIds
    }
  });

  if (!response.ok) {
    throw buildPluggyError(response.statusCode, response.data, 'Falha ao buscar transações por IDs.');
  }

  return normalizeListResponse(response.data);
}

async function listTransactionsByCreatedLink(createdTransactionsLink) {
  const safeLink = String(createdTransactionsLink || '').trim();
  if (!safeLink) {
    return [];
  }

  const parsed = new URL(safeLink);
  if (parsed.protocol !== 'https:') {
    const error = new Error('createdTransactionsLink inválido: somente HTTPS é permitido.');
    error.statusCode = 400;
    throw error;
  }

  const allowedHosts = getAllowedTransactionsLinkHosts();
  if (!allowedHosts.has(parsed.host)) {
    const error = new Error('createdTransactionsLink inválido: host não permitido.');
    error.statusCode = 400;
    throw error;
  }

  const response = await requestMeuPluggy(parsed.toString(), { absoluteUrl: true });
  if (!response.ok) {
    throw buildPluggyError(response.statusCode, response.data, 'Falha ao consumir createdTransactionsLink.');
  }

  return normalizeListResponse(response.data);
}

async function listWebhooks() {
  const response = await requestMeuPluggy('/webhooks');
  if (response.statusCode === 204) {
    return [];
  }
  if (!response.ok) {
    throw buildPluggyError(response.statusCode, response.data, 'Falha ao listar webhooks do Meu Pluggy.');
  }
  return normalizeListResponse(response.data);
}

async function createWebhook(payload = {}) {
  const response = await requestMeuPluggy('/webhooks', {
    method: 'POST',
    body: payload
  });
  if (!response.ok) {
    throw buildPluggyError(response.statusCode, response.data, 'Falha ao criar webhook no Meu Pluggy.');
  }
  return response.data || {};
}

async function updateWebhook(webhookId, payload = {}) {
  const safeWebhookId = sanitizeString(webhookId, 140);
  if (!safeWebhookId) {
    const error = new Error('Webhook ID é obrigatório para atualização.');
    error.statusCode = 400;
    throw error;
  }

  const response = await requestMeuPluggy(`/webhooks/${safeWebhookId}`, {
    method: 'PATCH',
    body: payload
  });
  if (!response.ok) {
    throw buildPluggyError(response.statusCode, response.data, 'Falha ao atualizar webhook do Meu Pluggy.');
  }
  return response.data || {};
}

module.exports = {
  apiBaseUrl,
  MEU_PLUGGY_SYNC_FROM_DAYS,
  assertMeuPluggyCredentials,
  readJsonSafely,
  normalizeListResponse,
  buildPluggyError,
  hashPayload,
  authenticateMeuPluggy,
  requestMeuPluggy,
  getSyncStartDateIso,
  resolveAccountTypes,
  sanitizeItemId,
  getItemById,
  updateItemById,
  listAccountsByItem,
  listTransactionsForAccount,
  listTransactionsByIds,
  listTransactionsByCreatedLink,
  listWebhooks,
  createWebhook,
  updateWebhook
};
