const crypto = require('crypto');
const { getMessaging } = require('firebase-admin/messaging');
const { db } = require('../core/base');
const { sanitizeString } = require('../core/domain-utils');

const PUSH_COLLECTION = 'open_finance_push_subscriptions';
const PUSH_PROVIDER = 'fcm-web';
const SUBSCRIPTION_STATUS_ACTIVE = 'active';
const SUBSCRIPTION_STATUS_DISABLED = 'disabled';
const SUBSCRIPTION_STATUS_INVALID = 'invalid';
const DEFAULT_WEB_APP_URL = 'https://smart-finance-ia.web.app';

const INVALID_TOKEN_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument'
]);

function sanitizeWebAppUrl(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return DEFAULT_WEB_APP_URL;
  }

  if (normalized.startsWith('https://')) {
    return normalized;
  }

  if (normalized.startsWith('http://localhost') || normalized.startsWith('http://127.0.0.1')) {
    return normalized;
  }

  return DEFAULT_WEB_APP_URL;
}

function getWebAppUrl() {
  return sanitizeWebAppUrl(process.env.OPEN_FINANCE_PUSH_WEB_APP_URL || DEFAULT_WEB_APP_URL);
}

function getPushSubscriptionsCollection(appId, userId) {
  return db.collection(`artifacts/${appId}/users/${userId}/${PUSH_COLLECTION}`);
}

function sanitizePushToken(value) {
  return String(value || '').trim().slice(0, 4096);
}

function buildTokenHash(token) {
  return crypto.createHash('sha1').update(token).digest('hex');
}

function sanitizePushStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === SUBSCRIPTION_STATUS_DISABLED) {
    return SUBSCRIPTION_STATUS_DISABLED;
  }
  if (normalized === SUBSCRIPTION_STATUS_INVALID) {
    return SUBSCRIPTION_STATUS_INVALID;
  }
  return SUBSCRIPTION_STATUS_ACTIVE;
}

function buildNotificationTitle(insertedCount) {
  return Number(insertedCount) === 1 ? 'Nova transação Open Finance' : 'Novas transações Open Finance';
}

function buildNotificationBody(insertedCount) {
  const safeCount = Math.max(1, Number(insertedCount) || 0);
  return safeCount === 1
    ? 'Recebemos 1 nova transação da sua conexão bancária.'
    : `Recebemos ${safeCount} novas transações da sua conexão bancária.`;
}

function toTokenPreview(token) {
  const safeToken = sanitizePushToken(token);
  if (!safeToken) {
    return '';
  }

  return safeToken.length <= 16 ? safeToken : safeToken.slice(-16);
}

async function registerOpenFinancePushSubscription(appId, userId, payload = {}) {
  const safeAppId = sanitizeString(appId, 120);
  const safeUserId = sanitizeString(userId, 200);
  const token = sanitizePushToken(payload.token);

  if (!safeAppId || !safeUserId || !token) {
    const error = new Error('appId, userId e token são obrigatórios para registrar push.');
    error.statusCode = 400;
    throw error;
  }

  const tokenHash = buildTokenHash(token);
  const collectionRef = getPushSubscriptionsCollection(safeAppId, safeUserId);
  const docRef = collectionRef.doc(tokenHash);
  const previous = await docRef.get();
  const previousData = previous.exists ? previous.data() || {} : {};
  const nowIso = new Date().toISOString();

  const payloadToPersist = {
    token,
    tokenHash,
    appId: safeAppId,
    userId: safeUserId,
    provider: PUSH_PROVIDER,
    status: SUBSCRIPTION_STATUS_ACTIVE,
    platform: sanitizeString(payload.platform || previousData.platform || 'web', 40) || 'web',
    userAgent: sanitizeString(payload.userAgent || previousData.userAgent, 320),
    language: sanitizeString(payload.language || previousData.language, 24),
    timezone: sanitizeString(payload.timezone || previousData.timezone, 60),
    lastRegisteredAt: nowIso,
    updatedAt: nowIso,
    createdAt: sanitizeString(previousData.createdAt, 80) || nowIso,
    lastError: ''
  };

  await docRef.set(payloadToPersist, { merge: true });

  return {
    tokenHash,
    tokenPreview: toTokenPreview(token),
    status: payloadToPersist.status,
    createdAt: payloadToPersist.createdAt,
    updatedAt: payloadToPersist.updatedAt
  };
}

async function unregisterOpenFinancePushSubscription(appId, userId, payload = {}) {
  const safeAppId = sanitizeString(appId, 120);
  const safeUserId = sanitizeString(userId, 200);
  const token = sanitizePushToken(payload.token);

  if (!safeAppId || !safeUserId || !token) {
    return {
      disabled: false,
      reason: 'missing-app-user-or-token'
    };
  }

  const tokenHash = buildTokenHash(token);
  const docRef = getPushSubscriptionsCollection(safeAppId, safeUserId).doc(tokenHash);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    return {
      disabled: false,
      reason: 'not-found',
      tokenHash
    };
  }

  const nowIso = new Date().toISOString();
  await docRef.set(
    {
      status: SUBSCRIPTION_STATUS_DISABLED,
      updatedAt: nowIso,
      disabledAt: nowIso,
      lastError: sanitizeString(payload.reason || 'disabled-by-user', 200)
    },
    { merge: true }
  );

  return {
    disabled: true,
    tokenHash,
    updatedAt: nowIso
  };
}

async function listActiveOpenFinancePushTokens(appId, userId) {
  const safeAppId = sanitizeString(appId, 120);
  const safeUserId = sanitizeString(userId, 200);
  if (!safeAppId || !safeUserId) {
    return [];
  }

  const snapshot = await getPushSubscriptionsCollection(safeAppId, safeUserId).get();
  const tokens = [];
  snapshot.forEach((doc) => {
    const data = doc.data() || {};
    const token = sanitizePushToken(data.token);
    const status = sanitizePushStatus(data.status);
    if (!token || status !== SUBSCRIPTION_STATUS_ACTIVE) {
      return;
    }
    tokens.push(token);
  });

  return [...new Set(tokens)];
}

function chunk(values = [], size = 500) {
  const items = [];
  for (let index = 0; index < values.length; index += size) {
    items.push(values.slice(index, index + size));
  }
  return items;
}

async function markInvalidTokens(appId, userId, invalidTokens = [], reason = '') {
  const safeAppId = sanitizeString(appId, 120);
  const safeUserId = sanitizeString(userId, 200);
  if (!safeAppId || !safeUserId || !Array.isArray(invalidTokens) || invalidTokens.length === 0) {
    return 0;
  }

  const nowIso = new Date().toISOString();
  const batch = db.batch();
  let updatedCount = 0;

  invalidTokens.forEach((token) => {
    const safeToken = sanitizePushToken(token);
    if (!safeToken) {
      return;
    }

    const tokenHash = buildTokenHash(safeToken);
    const docRef = getPushSubscriptionsCollection(safeAppId, safeUserId).doc(tokenHash);
    batch.set(
      docRef,
      {
        status: SUBSCRIPTION_STATUS_INVALID,
        updatedAt: nowIso,
        invalidatedAt: nowIso,
        lastError: sanitizeString(reason, 200)
      },
      { merge: true }
    );
    updatedCount += 1;
  });

  if (updatedCount > 0) {
    await batch.commit();
  }

  return updatedCount;
}

async function sendOpenFinanceTransactionsPushNotification(options = {}) {
  const appId = sanitizeString(options.appId, 120);
  const userId = sanitizeString(options.userId, 200);
  const insertedCount = Math.max(0, Math.round(Number(options.insertedCount || 0)));
  const eventName = sanitizeString(options.eventName, 80);

  if (!appId || !userId || insertedCount <= 0) {
    return {
      attempted: false,
      reason: 'missing-user-or-empty-batch',
      sentCount: 0,
      failureCount: 0,
      invalidatedCount: 0
    };
  }

  const tokens = await listActiveOpenFinancePushTokens(appId, userId);
  if (tokens.length === 0) {
    return {
      attempted: false,
      reason: 'no-active-subscriptions',
      sentCount: 0,
      failureCount: 0,
      invalidatedCount: 0
    };
  }

  const title = buildNotificationTitle(insertedCount);
  const body = buildNotificationBody(insertedCount);
  const link = getWebAppUrl();
  const iconUrl = `${link.replace(/\/$/, '')}/assets/icons/icon-192.svg`;
  const badgeUrl = `${link.replace(/\/$/, '')}/assets/icons/notification-badge.svg`;

  let successCount = 0;
  let failureCount = 0;
  const invalidTokens = [];

  const tokenChunks = chunk(tokens, 500);
  for (const tokenChunk of tokenChunks) {
    const response = await getMessaging().sendEachForMulticast({
      tokens: tokenChunk,
      notification: {
        title,
        body
      },
      data: {
        type: 'open-finance-transactions',
        insertedCount: String(insertedCount),
        eventName: eventName || 'open-finance-event',
        occurredAt: new Date().toISOString(),
        appId,
        userId
      },
      webpush: {
        headers: {
          Urgency: 'high'
        },
        fcmOptions: {
          link
        },
        notification: {
          title,
          body,
          icon: iconUrl,
          badge: badgeUrl,
          tag: `open-finance-${userId}`,
          renotify: true
        }
      }
    });

    successCount += Number(response.successCount || 0);
    failureCount += Number(response.failureCount || 0);

    (response.responses || []).forEach((item, index) => {
      if (!item || item.success) {
        return;
      }

      const code = sanitizeString(item.error?.code, 120);
      if (INVALID_TOKEN_ERROR_CODES.has(code)) {
        invalidTokens.push(tokenChunk[index]);
      }
    });
  }

  const invalidatedCount = await markInvalidTokens(appId, userId, invalidTokens, 'invalid-or-expired-token');

  return {
    attempted: true,
    sentCount: successCount,
    failureCount,
    invalidatedCount,
    subscribedDevices: tokens.length
  };
}

module.exports = {
  PUSH_COLLECTION,
  PUSH_PROVIDER,
  SUBSCRIPTION_STATUS_ACTIVE,
  SUBSCRIPTION_STATUS_DISABLED,
  SUBSCRIPTION_STATUS_INVALID,
  registerOpenFinancePushSubscription,
  unregisterOpenFinancePushSubscription,
  sendOpenFinanceTransactionsPushNotification
};
