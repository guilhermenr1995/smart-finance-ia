const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { sanitizeString } = require('../core/domain-utils');
const { hashPayload } = require('../open-finance/meu-pluggy-client');
const {
  WEBHOOK_COLLECTION,
  WEBHOOK_ENABLED,
  WEBHOOK_ALLOW_UNSIGNED,
  WEBHOOK_EVENTS_TO_MANAGE,
  parseWebhookHeaderSecret,
  queueWebhookEvent,
  processQueuedWebhookEvent
} = require('../open-finance/meu-pluggy-sync');

const openFinanceWebhook = onRequest(
  {
    invoker: 'public',
    timeoutSeconds: 30,
    memory: '256MiB'
  },
  async (request, response) => {
    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      response.status(200).json({ ok: true });
      return;
    }

    if (request.method !== 'POST') {
      response.status(202).json({ accepted: false, ignored: true, reason: 'method-not-supported' });
      return;
    }

    if (!WEBHOOK_ENABLED) {
      response.status(202).json({ accepted: false, reason: 'webhook-disabled' });
      return;
    }

    const secretCheck = parseWebhookHeaderSecret(request);
    if (!secretCheck.valid) {
      response.status(401).json({
        error: `Webhook secret inválido no header ${secretCheck.enabled ? 'configurado' : 'padrão'}.`
      });
      return;
    }

    const payload = request.body && typeof request.body === 'object' ? request.body : {};
    const eventName = sanitizeString(payload.event, 80);
    if (!eventName) {
      response.status(202).json({
        accepted: true,
        ignored: true,
        reason: 'missing-event',
        permissiveMode: WEBHOOK_ALLOW_UNSIGNED
      });
      return;
    }

    const shouldProcess = WEBHOOK_EVENTS_TO_MANAGE.includes(eventName);
    if (!shouldProcess) {
      response.status(202).json({
        accepted: true,
        ignored: true,
        reason: 'unsupported-event',
        event: eventName
      });
      return;
    }

    const payloadHash = hashPayload(payload);
    const sourceIp = sanitizeString(request.headers['x-forwarded-for'] || request.ip, 80);
    const queued = await queueWebhookEvent(payload, {
      payloadHash,
      sourceIp
    });

    response.status(202).json({
      accepted: queued.accepted,
      duplicate: queued.duplicate,
      eventDocId: queued.eventId
    });
  }
);

const openFinanceWebhookWorker = onDocumentCreated(
  {
    document: `${WEBHOOK_COLLECTION}/{eventDocId}`,
    timeoutSeconds: 540,
    memory: '512MiB'
  },
  async (event) => {
    const eventDocId = sanitizeString(event.params?.eventDocId, 80);
    if (!eventDocId) {
      return;
    }

    const snapshot = event.data;
    if (!snapshot || !snapshot.exists) {
      return;
    }

    const payload = snapshot.data() || {};
    if (String(payload.status || '').trim() !== 'queued') {
      return;
    }

    try {
      await processQueuedWebhookEvent(eventDocId);
    } catch (error) {
      console.error('Erro ao processar evento de webhook Meu Pluggy:', {
        eventDocId,
        message: error?.message || 'unknown error'
      });
    }
  }
);

module.exports = {
  openFinanceWebhook,
  openFinanceWebhookWorker
};
