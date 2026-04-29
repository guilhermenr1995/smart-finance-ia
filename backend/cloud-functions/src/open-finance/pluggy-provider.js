const { sanitizeString, toCurrency } = require('../core/domain-utils');

const PLUGGY_API_BASE_URL = String(process.env.OPEN_FINANCE_PLUGGY_API_BASE_URL || 'https://api.pluggy.ai')
  .trim()
  .replace(/\/+$/g, '');
const PLUGGY_CLIENT_ID = String(process.env.OPEN_FINANCE_PLUGGY_CLIENT_ID || '').trim();
const PLUGGY_CLIENT_SECRET = String(process.env.OPEN_FINANCE_PLUGGY_CLIENT_SECRET || '').trim();
const PLUGGY_DEFAULT_ITEM_IDS = String(process.env.OPEN_FINANCE_PLUGGY_ITEM_IDS || '')
  .split(',')
  .map((value) => sanitizeString(value, 140))
  .filter(Boolean);
const PLUGGY_SYNC_FROM_DAYS = Math.max(1, Math.min(Number(process.env.OPEN_FINANCE_PLUGGY_SYNC_FROM_DAYS || 60), 365));
const PLUGGY_ACCOUNT_TYPES = String(process.env.OPEN_FINANCE_PLUGGY_ACCOUNT_TYPES || 'BANK,CREDIT')
  .split(',')
  .map((value) => String(value || '').trim().toUpperCase())
  .filter((value) => value === 'BANK' || value === 'CREDIT');

function hasPluggyDirectCredentials() {
  return Boolean(PLUGGY_CLIENT_ID && PLUGGY_CLIENT_SECRET);
}

function readJsonSafely(text) {
  try {
    const parsed = JSON.parse(String(text || '').trim());
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

function getApiErrorMessage(statusCode, payload = {}, fallback = '') {
  const message = sanitizeString(payload?.message || payload?.error || payload?.details || fallback, 400);
  if (message) {
    return message;
  }

  return `Falha Pluggy (${statusCode})`;
}

function buildIsoDateWithOffset(daysOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + Number(daysOffset || 0));
  return date.toISOString().slice(0, 10);
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

function mapPluggyItemStatus(rawStatus) {
  const normalized = String(rawStatus || '').trim().toUpperCase();
  if (!normalized) {
    return 'unknown';
  }

  if (normalized === 'DELETED') {
    return 'revoked';
  }

  if (normalized === 'OUTDATED') {
    return 'expired';
  }

  if (normalized.includes('ERROR') || normalized.includes('MFA')) {
    return 'error';
  }

  if (normalized.includes('UPDAT')) {
    return 'active';
  }

  return normalized.toLowerCase();
}

function isExpenseCandidate(transaction = {}, accountType = 'BANK') {
  const txType = String(transaction.type || '').trim().toUpperCase();
  const amount = resolveTransactionAmount(transaction);
  if (!Number.isFinite(amount) || Math.abs(amount) < 0.00001) {
    return false;
  }

  if (accountType === 'CREDIT') {
    return amount > 0;
  }

  if (txType === 'DEBIT') {
    return true;
  }
  if (txType === 'CREDIT') {
    return false;
  }

  return amount < 0;
}

function resolveTransactionAmount(transaction = {}) {
  const amountInAccountCurrency = Number(transaction.amountInAccountCurrency);
  if (Number.isFinite(amountInAccountCurrency) && Math.abs(amountInAccountCurrency) >= 0.00001) {
    return amountInAccountCurrency;
  }

  const amount = Number(transaction.amount);
  return Number.isFinite(amount) ? amount : NaN;
}

function buildTitleFromTransaction(transaction = {}, bankName = '') {
  const candidate =
    sanitizeString(transaction.description, 200) ||
    sanitizeString(transaction.descriptionRaw, 200) ||
    sanitizeString(transaction.merchant?.name, 200) ||
    sanitizeString(transaction.providerCode, 200);
  if (candidate) {
    return candidate;
  }

  return sanitizeString(`Transação ${bankName || 'Open Finance'}`, 200) || 'Transação Open Finance';
}

function mapPluggyTransaction(transaction = {}, account = {}, context = {}) {
  const accountType = String(account?.type || '').trim().toUpperCase() === 'CREDIT' ? 'CREDIT' : 'BANK';
  if (!isExpenseCandidate(transaction, accountType)) {
    return null;
  }

  const date = sanitizeString(transaction.date || transaction.createdAt, 80);
  const title = buildTitleFromTransaction(transaction, context.bankName);
  const value = Math.abs(toCurrency(resolveTransactionAmount(transaction)));
  if (!date || !title || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return {
    date,
    title,
    value,
    category: sanitizeString(transaction.category || 'Outros', 50) || 'Outros',
    accountType: accountType === 'CREDIT' ? 'Crédito' : 'Conta'
  };
}

async function requestPluggyApiKey() {
  const response = await fetch(`${PLUGGY_API_BASE_URL}/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      clientId: PLUGGY_CLIENT_ID,
      clientSecret: PLUGGY_CLIENT_SECRET
    })
  });

  const rawBody = await response.text().catch(() => '');
  const data = readJsonSafely(rawBody);
  if (!response.ok) {
    const error = new Error(getApiErrorMessage(response.status, data, 'Não foi possível autenticar na Pluggy.'));
    error.statusCode = response.status === 401 ? 401 : 502;
    throw error;
  }

  const apiKey = sanitizeString(data.apiKey || data.accessToken || data.access_token, 600);
  if (!apiKey) {
    const error = new Error('Pluggy não retornou API key na autenticação.');
    error.statusCode = 502;
    throw error;
  }

  return apiKey;
}

async function requestPluggy(path, options = {}) {
  const url = new URL(`${PLUGGY_API_BASE_URL}${path}`);
  const query = options.query && typeof options.query === 'object' ? options.query : {};
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    url.searchParams.set(key, String(value));
  });

  const response = await fetch(url.toString(), {
    method: String(options.method || 'GET').trim().toUpperCase(),
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': options.apiKey
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const rawBody = await response.text().catch(() => '');
  const data = readJsonSafely(rawBody);
  return {
    ok: response.ok,
    statusCode: response.status,
    data
  };
}

function resolvePluggyItemId(action, payload = {}) {
  const explicit = sanitizeString(payload.providerItemId || payload.itemId || payload.connectionId, 140);
  if (explicit) {
    return explicit;
  }

  if (action === 'connect-bank' && PLUGGY_DEFAULT_ITEM_IDS.length === 1) {
    return PLUGGY_DEFAULT_ITEM_IDS[0];
  }

  return '';
}

async function getPluggyItem(apiKey, itemId) {
  const response = await requestPluggy(`/items/${itemId}`, { apiKey });
  if (!response.ok) {
    const error = new Error(getApiErrorMessage(response.statusCode, response.data, 'Item Pluggy não encontrado.'));
    error.statusCode = response.statusCode === 404 ? 404 : 502;
    throw error;
  }

  return response.data || {};
}

async function triggerPluggyItemSync(apiKey, itemId) {
  const response = await requestPluggy(`/items/${itemId}`, {
    method: 'PATCH',
    apiKey,
    body: {}
  });

  if (response.ok) {
    return;
  }

  // Ignore expected sync conflicts/rate limits and continue with latest available data.
  if (response.statusCode === 400 || response.statusCode === 409 || response.statusCode === 429) {
    return;
  }

  const error = new Error(getApiErrorMessage(response.statusCode, response.data, 'Falha ao sincronizar item na Pluggy.'));
  error.statusCode = 502;
  throw error;
}

async function listPluggyAccounts(apiKey, itemId) {
  const accountTypes = PLUGGY_ACCOUNT_TYPES.length > 0 ? PLUGGY_ACCOUNT_TYPES : ['BANK', 'CREDIT'];
  const accounts = [];

  for (const type of accountTypes) {
    const response = await requestPluggy('/accounts', {
      apiKey,
      query: {
        itemId,
        type
      }
    });

    if (!response.ok) {
      const error = new Error(getApiErrorMessage(response.statusCode, response.data, 'Falha ao buscar contas na Pluggy.'));
      error.statusCode = 502;
      throw error;
    }

    accounts.push(...normalizeListResponse(response.data));
  }

  return accounts;
}

async function listPluggyTransactionsByAccount(apiKey, accountId, fromDate) {
  const transactions = [];
  let page = 1;
  let totalPages = 1;
  const maxPages = 30;

  while (page <= totalPages && page <= maxPages) {
    const response = await requestPluggy('/transactions', {
      apiKey,
      query: {
        accountId,
        from: fromDate,
        page,
        pageSize: 500
      }
    });

    if (!response.ok) {
      const error = new Error(
        getApiErrorMessage(response.statusCode, response.data, `Falha ao buscar transações da conta ${accountId}.`)
      );
      error.statusCode = 502;
      throw error;
    }

    const pageItems = normalizeListResponse(response.data);
    transactions.push(...pageItems);

    const parsedTotalPages = Number(response.data?.totalPages);
    totalPages = Number.isFinite(parsedTotalPages) && parsedTotalPages > 0 ? parsedTotalPages : 1;
    page += 1;
  }

  return transactions;
}

async function collectPluggyTransactions(apiKey, itemId, context = {}) {
  const fromDate = buildIsoDateWithOffset(-PLUGGY_SYNC_FROM_DAYS);
  const accounts = await listPluggyAccounts(apiKey, itemId);
  const collected = [];

  for (const account of accounts) {
    const accountId = sanitizeString(account?.id, 140);
    if (!accountId) {
      continue;
    }

    const accountTransactions = await listPluggyTransactionsByAccount(apiKey, accountId, fromDate);
    accountTransactions.forEach((transaction) => {
      const mapped = mapPluggyTransaction(transaction, account, context);
      if (mapped) {
        collected.push(mapped);
      }
    });
  }

  const uniqueByKey = new Map();
  collected.forEach((transaction) => {
    const dedupKey = `${transaction.date}|${transaction.title}|${transaction.value.toFixed(2)}|${transaction.accountType}`;
    if (!uniqueByKey.has(dedupKey)) {
      uniqueByKey.set(dedupKey, transaction);
    }
  });

  return [...uniqueByKey.values()];
}

function buildPluggyConnectionPayload(item = {}, context = {}) {
  const itemId = sanitizeString(item?.id || context.itemId, 140) || context.itemId;
  return {
    id: itemId,
    status: mapPluggyItemStatus(item?.status || context.status || 'active'),
    consentUrl: sanitizeString(item?.consentUrl || context.consentUrl || 'https://meu.pluggy.ai', 700),
    consentExpiresAt: sanitizeString(item?.consentExpiresAt || context.consentExpiresAt, 80)
  };
}

async function requestPluggyOpenFinance(action, payload = {}, context = {}) {
  if (!hasPluggyDirectCredentials()) {
    const error = new Error(
      'Integração Pluggy direta não configurada. Defina OPEN_FINANCE_PLUGGY_CLIENT_ID e OPEN_FINANCE_PLUGGY_CLIENT_SECRET.'
    );
    error.statusCode = 503;
    throw error;
  }

  const normalizedAction = sanitizeString(action, 50);
  const itemId = resolvePluggyItemId(normalizedAction, payload);
  if (!itemId) {
    const error = new Error(
      'Para conectar via Meu Pluggy, informe o Item ID em providerItemId (ou configure OPEN_FINANCE_PLUGGY_ITEM_IDS com um único item).'
    );
    error.statusCode = 400;
    throw error;
  }

  const apiKey = await requestPluggyApiKey();
  const bankName = sanitizeString(payload.bankName || 'Meu Pluggy', 80) || 'Meu Pluggy';

  if (normalizedAction === 'revoke-connection') {
    return {
      provider: 'pluggy-direct',
      mode: 'pluggy-direct',
      connection: buildPluggyConnectionPayload(
        {
          id: itemId,
          status: 'revoked'
        },
        {
          itemId
        }
      ),
      transactions: []
    };
  }

  if (normalizedAction === 'renew-connection') {
    const item = await getPluggyItem(apiKey, itemId);
    return {
      provider: 'pluggy-direct',
      mode: 'pluggy-direct',
      connection: buildPluggyConnectionPayload(item, {
        itemId,
        consentUrl: 'https://meu.pluggy.ai'
      }),
      transactions: []
    };
  }

  if (normalizedAction !== 'connect-bank' && normalizedAction !== 'sync-connection') {
    const error = new Error(`Ação Pluggy direta não suportada: ${normalizedAction}`);
    error.statusCode = 400;
    throw error;
  }

  if (normalizedAction === 'sync-connection') {
    await triggerPluggyItemSync(apiKey, itemId);
  }

  const item = await getPluggyItem(apiKey, itemId);
  const transactions = await collectPluggyTransactions(apiKey, itemId, {
    userId: context.userId,
    bankName
  });

  return {
    provider: 'pluggy-direct',
    mode: 'pluggy-direct',
    connection: buildPluggyConnectionPayload(item, {
      itemId,
      consentUrl: 'https://meu.pluggy.ai'
    }),
    transactions
  };
}

module.exports = {
  hasPluggyDirectCredentials,
  requestPluggyOpenFinance
};
