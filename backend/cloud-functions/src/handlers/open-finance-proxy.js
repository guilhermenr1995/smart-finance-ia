const {
  onRequest,
  setCorsHeaders,
  handlePreflightAndMethod,
  authenticateRequest
} = require('../core/base');
const { sanitizeString } = require('../core/domain-utils');
const { assertMeuPluggyCredentials } = require('../open-finance/meu-pluggy-client');
const {
  MEU_PLUGGY_BANK_CODE,
  listConnections,
  getConnectionById,
  deleteConnectionById,
  syncItem,
  revokeItemConnection,
  ensureWebhooksConfigured
} = require('../open-finance/meu-pluggy-sync');
const {
  registerOpenFinancePushSubscription,
  unregisterOpenFinancePushSubscription
} = require('../open-finance/meu-pluggy-push');

const openFinanceProxy = onRequest(
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
      const action = sanitizeString(request.body?.action, 60);
      const appId = sanitizeString(request.body?.appId, 120);
      const userId = sanitizeString(decodedToken.uid, 200);

      if (!appId) {
        response.status(400).json({
          error: 'appId is required'
        });
        return;
      }

      if (action === 'list-connections') {
        const connections = await listConnections(appId, userId);
        response.status(200).json({ connections });
        return;
      }

      if (action === 'setup-webhooks') {
        assertMeuPluggyCredentials();
        const webhookSetup = await ensureWebhooksConfigured();
        response.status(200).json({
          webhookSetup
        });
        return;
      }

      if (action === 'register-push-subscription') {
        const subscription = await registerOpenFinancePushSubscription(appId, userId, {
          token: sanitizeString(request.body?.token, 4096),
          platform: sanitizeString(request.body?.platform, 40),
          userAgent: sanitizeString(request.body?.userAgent, 320),
          language: sanitizeString(request.body?.language, 24),
          timezone: sanitizeString(request.body?.timezone, 60)
        });
        response.status(200).json({
          registered: true,
          subscription
        });
        return;
      }

      if (action === 'unregister-push-subscription') {
        const result = await unregisterOpenFinancePushSubscription(appId, userId, {
          token: sanitizeString(request.body?.token, 4096),
          reason: sanitizeString(request.body?.reason, 200)
        });
        response.status(200).json({
          registered: false,
          ...result
        });
        return;
      }

      if (action === 'connect-bank') {
        assertMeuPluggyCredentials();
        const bankCode = sanitizeString(request.body?.bankCode, 60).toLowerCase();
        if (bankCode !== MEU_PLUGGY_BANK_CODE) {
          response.status(400).json({
            error: 'Somente banco "meu-pluggy" é suportado nesta integração.'
          });
          return;
        }

        const providerItemId = sanitizeString(request.body?.providerItemId, 140);
        if (!providerItemId) {
          response.status(400).json({
            error: 'providerItemId é obrigatório para conectar via Meu Pluggy.'
          });
          return;
        }

        const webhookUrl = sanitizeString(request.body?.webhookUrl, 700);
        const syncResult = await syncItem(appId, userId, providerItemId, { webhookUrl });
        const connections = await listConnections(appId, userId);
        const webhookSetup = await ensureWebhooksConfigured().catch((_error) => ({
          configured: false,
          reason: 'autoconfig-error'
        }));

        response.status(200).json({
          connectionId: syncResult.connection.id,
          providerConnectionId: syncResult.connection.providerConnectionId,
          providerItemId: syncResult.connection.providerItemId,
          insertedCount: syncResult.insertedCount,
          skippedCount: syncResult.skippedCount,
          transactions: syncResult.transactions,
          connections,
          webhookSetup
        });
        return;
      }

      if (action === 'sync-connection' || action === 'renew-connection') {
        assertMeuPluggyCredentials();
        const connectionId = sanitizeString(request.body?.connectionId, 140);
        if (!connectionId) {
          response.status(400).json({
            error: 'connectionId is required'
          });
          return;
        }

        const connection = await getConnectionById(appId, userId, connectionId);
        if (!connection) {
          response.status(404).json({
            error: 'Connection not found'
          });
          return;
        }

        const itemId = sanitizeString(connection.providerItemId || connection.providerConnectionId || connection.id, 140);
        const webhookUrl = sanitizeString(request.body?.webhookUrl, 700);
        const syncResult = await syncItem(appId, userId, itemId, { webhookUrl });
        const connections = await listConnections(appId, userId);

        response.status(200).json({
          connectionId: syncResult.connection.id,
          insertedCount: syncResult.insertedCount,
          skippedCount: syncResult.skippedCount,
          transactions: syncResult.transactions,
          connections
        });
        return;
      }

      if (action === 'revoke-connection') {
        const connectionId = sanitizeString(request.body?.connectionId, 140);
        if (!connectionId) {
          response.status(400).json({
            error: 'connectionId is required'
          });
          return;
        }

        const connection = await getConnectionById(appId, userId, connectionId);
        if (!connection) {
          response.status(404).json({
            error: 'Connection not found'
          });
          return;
        }

        const itemId = sanitizeString(connection.providerItemId || connection.providerConnectionId || connection.id, 140);
        await revokeItemConnection(appId, userId, itemId);
        const connections = await listConnections(appId, userId);
        response.status(200).json({
          connectionId: itemId,
          connections
        });
        return;
      }

      if (action === 'delete-connection') {
        const connectionId = sanitizeString(request.body?.connectionId, 140);
        if (!connectionId) {
          response.status(400).json({
            error: 'connectionId is required'
          });
          return;
        }

        const deleted = await deleteConnectionById(appId, userId, connectionId);
        const connections = await listConnections(appId, userId);
        response.status(200).json({
          connectionId: deleted.connectionId,
          deleted: true,
          deletedTransactions: Number(deleted.deletedTransactions || 0),
          matchedOpenFinanceTransactions: Number(deleted.matchedOpenFinanceTransactions || 0),
          deletedCategories: Number(deleted.deletedCategories || 0),
          matchedCategories: Number(deleted.matchedCategories || 0),
          deletedCategoryNames: Array.isArray(deleted.deletedCategoryNames) ? deleted.deletedCategoryNames : [],
          deleteAllOpenFinance: Boolean(deleted.deleteAllOpenFinance),
          connections
        });
        return;
      }

      response.status(400).json({
        error: 'Unsupported action'
      });
    } catch (error) {
      const statusCode = Math.max(400, Math.min(599, Number(error?.statusCode || 500)));
      response.status(statusCode).json({
        error: 'Unexpected error while handling Meu Pluggy Open Finance',
        details: error?.message || 'unknown error'
      });
    }
  }
);

module.exports = {
  openFinanceProxy
};
