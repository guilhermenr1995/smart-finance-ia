const { sanitizeString, toCurrency } = require('../core/domain-utils');

const SIMULATED_CATEGORIES = [
  'Alimentação',
  'Transporte',
  'Mercado',
  'Assinaturas',
  'Lazer',
  'Saúde',
  'Serviços',
  'Moradia'
];

const SIMULATED_TITLES = [
  'Supermercado',
  'Uber',
  'Farmácia',
  'Streaming',
  'Padaria',
  'Posto',
  'Restaurante',
  'Delivery',
  'Academia',
  'Conta de Luz'
];

function toHashNumber(value) {
  const text = String(value || '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildProviderConnectionId(bankCode, userId) {
  const seed = toHashNumber(`${bankCode}:${userId}`);
  return sanitizeString(`sim-${bankCode}-${seed.toString(16)}`, 140) || `sim-${bankCode}`;
}

function toIsoDateWithOffset(daysOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + Number(daysOffset || 0));
  return date.toISOString().slice(0, 10);
}

function pickBySeed(values, seed, fallback = '') {
  if (!Array.isArray(values) || values.length === 0) {
    return fallback;
  }

  return values[Math.abs(seed) % values.length];
}

function buildSimulatedTransactions({
  appId = '',
  userId = '',
  bankCode = '',
  bankName = '',
  providerConnectionId = '',
  action = '',
  amount = 3,
  startOffset = -1
}) {
  const safeBankName = sanitizeString(bankName || bankCode || 'Banco', 80) || 'Banco';
  const count = Math.max(0, Math.min(12, Number(amount || 0)));
  const transactions = [];

  for (let index = 0; index < count; index += 1) {
    const seed = toHashNumber(
      `${appId}:${userId}:${bankCode}:${providerConnectionId}:${action}:${new Date().toISOString().slice(0, 10)}:${index}`
    );
    const rawTitle = pickBySeed(SIMULATED_TITLES, seed, 'Compra');
    const category = pickBySeed(SIMULATED_CATEGORIES, seed + 3, 'Outros');
    const centValue = 850 + (seed % 24500);
    const value = toCurrency(centValue / 100);

    transactions.push({
      date: toIsoDateWithOffset(startOffset - index),
      title: sanitizeString(`${rawTitle} ${safeBankName}`, 180),
      value,
      category,
      accountType: seed % 5 === 0 ? 'Crédito' : 'Conta'
    });
  }

  return transactions;
}

function buildConnectionPayload({
  userId = '',
  bankCode = '',
  bankName = '',
  connectionId = '',
  status = 'active'
}) {
  const providerConnectionId = sanitizeString(connectionId || buildProviderConnectionId(bankCode, userId), 140);
  return {
    id: providerConnectionId,
    status: sanitizeString(status || 'active', 40) || 'active',
    consentUrl: '',
    consentExpiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString()
  };
}

function requestEmbeddedOpenFinanceUpstream(action, payload = {}, context = {}, options = {}) {
  const bankCode = sanitizeString(payload.bankCode, 60);
  const bankName = sanitizeString(payload.bankName || bankCode || 'Banco', 80) || 'Banco';
  const userId = sanitizeString(context.userId, 160);
  const appId = sanitizeString(payload.appId, 160);
  const providerConnectionId = sanitizeString(payload.connectionId, 140);
  const safeAction = sanitizeString(action, 40);

  if (safeAction === 'connect-bank') {
    const connection = buildConnectionPayload({
      userId,
      bankCode,
      bankName,
      connectionId: providerConnectionId,
      status: 'active'
    });
    return {
      provider: sanitizeString(options.provider || 'embedded', 60),
      mode: 'embedded-fallback',
      connection,
      transactions: buildSimulatedTransactions({
        appId,
        userId,
        bankCode,
        bankName,
        providerConnectionId: connection.id,
        action: safeAction,
        amount: 8,
        startOffset: -2
      })
    };
  }

  if (safeAction === 'sync-connection') {
    const connection = buildConnectionPayload({
      userId,
      bankCode,
      bankName,
      connectionId: providerConnectionId,
      status: 'active'
    });
    return {
      provider: sanitizeString(options.provider || 'embedded', 60),
      mode: 'embedded-fallback',
      connection,
      transactions: buildSimulatedTransactions({
        appId,
        userId,
        bankCode,
        bankName,
        providerConnectionId: connection.id,
        action: safeAction,
        amount: 4,
        startOffset: 0
      })
    };
  }

  if (safeAction === 'renew-connection') {
    return {
      provider: sanitizeString(options.provider || 'embedded', 60),
      mode: 'embedded-fallback',
      connection: buildConnectionPayload({
        userId,
        bankCode,
        bankName,
        connectionId: providerConnectionId,
        status: 'active'
      }),
      transactions: []
    };
  }

  if (safeAction === 'revoke-connection') {
    return {
      provider: sanitizeString(options.provider || 'embedded', 60),
      mode: 'embedded-fallback',
      connection: buildConnectionPayload({
        userId,
        bankCode,
        bankName,
        connectionId: providerConnectionId,
        status: 'revoked'
      }),
      transactions: []
    };
  }

  const error = new Error(`Ação Open Finance não suportada no modo embedded: ${safeAction}`);
  error.statusCode = 400;
  throw error;
}

module.exports = {
  requestEmbeddedOpenFinanceUpstream
};
