const {
  onRequest,
  setCorsHeaders,
  handlePreflightAndMethod,
  authenticateRequest,
  OPEN_FINANCE_BANKS,
  OPEN_FINANCE_PROVIDER
} = require('../core/base');
const {
  sanitizeString,
  toFiniteNumber
} = require('../core/domain-utils');
const {
  getOpenFinanceConnectionsCollection,
  listOpenFinanceConnections,
  normalizeBankCode,
  requestOpenFinanceUpstream,
  addDaysToIso,
  persistOpenFinanceTransactions,
  resolveProviderConnectionId
} = require('../core/external-services');

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
      const action = String(request.body?.action || '').trim();
      const appId = String(request.body?.appId || '').trim();
      const userId = decodedToken.uid;

      if (!appId) {
        response.status(400).json({
          error: 'appId is required'
        });
        return;
      }

      const connectionsCollection = getOpenFinanceConnectionsCollection(appId, userId);

      if (action === 'list-connections') {
        const connections = await listOpenFinanceConnections(appId, userId);
        response.status(200).json({
          connections
        });
        return;
      }

      if (action === 'connect-bank') {
        const bankCode = normalizeBankCode(request.body?.bankCode);
        if (!bankCode || !OPEN_FINANCE_BANKS[bankCode]) {
          response.status(400).json({
            error: 'bankCode is required and must be supported'
          });
          return;
        }

        const nowIso = new Date().toISOString();
        const connectionRef = connectionsCollection.doc(bankCode);
        const existingSnapshot = await connectionRef.get();
        const createdAt = existingSnapshot.exists ? String(existingSnapshot.data()?.createdAt || nowIso) : nowIso;

        const upstream = await requestOpenFinanceUpstream(
          'connect-bank',
          {
            appId,
            bankCode,
            bankName: OPEN_FINANCE_BANKS[bankCode]
          },
          {
            userId
          }
        );

        const upstreamConnection = upstream?.connection && typeof upstream.connection === 'object' ? upstream.connection : {};
        const providerConnectionId = sanitizeString(
          upstreamConnection.id || upstreamConnection.connectionId || bankCode,
          140
        ) || bankCode;
        const connectionStatus = sanitizeString(upstreamConnection.status || 'pending', 40) || 'pending';
        const consentExpiresAt = sanitizeString(upstreamConnection.consentExpiresAt || addDaysToIso(90), 80);

        const persisted = await persistOpenFinanceTransactions(
          appId,
          userId,
          Array.isArray(upstream?.transactions) ? upstream.transactions : [],
          {
            bankCode,
            bankName: OPEN_FINANCE_BANKS[bankCode]
          }
        );

        await connectionRef.set(
          {
            bankCode,
            bankName: OPEN_FINANCE_BANKS[bankCode],
            provider: OPEN_FINANCE_PROVIDER,
            providerConnectionId,
            status: connectionStatus,
            consentUrl: sanitizeString(upstreamConnection.consentUrl || upstream.authorizationUrl, 700),
            consentExpiresAt,
            lastSyncAt: nowIso,
            lastSyncInserted: persisted.insertedCount,
            errorMessage: '',
            createdAt,
            updatedAt: nowIso
          },
          { merge: true }
        );

        const connections = await listOpenFinanceConnections(appId, userId);
        response.status(200).json({
          connectionId: bankCode,
          providerConnectionId,
          authorizationUrl: sanitizeString(upstreamConnection.consentUrl || upstream.authorizationUrl, 700),
          insertedCount: persisted.insertedCount,
          skippedCount: persisted.skippedCount,
          transactions: persisted.insertedTransactions,
          connections
        });
        return;
      }

      if (action === 'sync-connection') {
        const connectionId = sanitizeString(request.body?.connectionId, 120);
        if (!connectionId) {
          response.status(400).json({
            error: 'connectionId is required'
          });
          return;
        }

        const connectionRef = connectionsCollection.doc(connectionId);
        const connectionSnapshot = await connectionRef.get();
        if (!connectionSnapshot.exists) {
          response.status(404).json({
            error: 'Connection not found'
          });
          return;
        }

        const connection = connectionSnapshot.data() || {};
        if (String(connection.status || '').trim() === 'revoked') {
          response.status(400).json({
            error: 'Connection is revoked'
          });
          return;
        }

        const bankCode = sanitizeString(connection.bankCode, 60);
        const bankName = sanitizeString(connection.bankName || OPEN_FINANCE_BANKS[bankCode] || bankCode, 80);
        const previousProviderConnectionId = resolveProviderConnectionId(connection);
        const shouldReconnect = !previousProviderConnectionId;
        const upstreamAction = shouldReconnect ? 'connect-bank' : 'sync-connection';

        const nowIso = new Date().toISOString();
        const upstream = await requestOpenFinanceUpstream(
          upstreamAction,
          shouldReconnect
            ? {
                appId,
                bankCode,
                bankName
              }
            : {
                appId,
                bankCode,
                connectionId: previousProviderConnectionId
              },
          {
            userId
          }
        );

        const upstreamConnection = upstream?.connection && typeof upstream.connection === 'object' ? upstream.connection : {};
        const providerConnectionId =
          resolveProviderConnectionId(upstreamConnection, previousProviderConnectionId || connectionId) || connectionId;
        const persisted = await persistOpenFinanceTransactions(
          appId,
          userId,
          Array.isArray(upstream?.transactions) ? upstream.transactions : [],
          connection
        );

        await connectionRef.set(
          {
            status: sanitizeString(upstreamConnection.status || 'active', 40) || 'active',
            providerConnectionId,
            lastSyncAt: nowIso,
            lastSyncInserted: persisted.insertedCount,
            consentUrl: sanitizeString(upstreamConnection.consentUrl || upstream.authorizationUrl, 700),
            consentExpiresAt: sanitizeString(upstreamConnection.consentExpiresAt || connection.consentExpiresAt, 80),
            errorMessage: '',
            updatedAt: nowIso
          },
          { merge: true }
        );

        const connections = await listOpenFinanceConnections(appId, userId);
        response.status(200).json({
          connectionId,
          authorizationUrl: sanitizeString(upstreamConnection.consentUrl || upstream.authorizationUrl, 700),
          insertedCount: persisted.insertedCount,
          skippedCount: persisted.skippedCount,
          transactions: persisted.insertedTransactions,
          connections
        });
        return;
      }

      if (action === 'renew-connection') {
        const connectionId = sanitizeString(request.body?.connectionId, 120);
        if (!connectionId) {
          response.status(400).json({
            error: 'connectionId is required'
          });
          return;
        }

        const connectionRef = connectionsCollection.doc(connectionId);
        const snapshot = await connectionRef.get();
        if (!snapshot.exists) {
          response.status(404).json({
            error: 'Connection not found'
          });
          return;
        }

        const connection = snapshot.data() || {};
        const upstream = await requestOpenFinanceUpstream(
          'renew-connection',
          {
            appId,
            bankCode: sanitizeString(connection.bankCode, 60),
            connectionId: sanitizeString(connection.providerConnectionId || connectionId, 140)
          },
          {
            userId
          }
        );

        const upstreamConnection = upstream?.connection && typeof upstream.connection === 'object' ? upstream.connection : {};

        await connectionRef.set(
          {
            status: sanitizeString(upstreamConnection.status || 'active', 40) || 'active',
            consentUrl: sanitizeString(upstreamConnection.consentUrl || upstream.authorizationUrl, 700),
            consentExpiresAt: sanitizeString(upstreamConnection.consentExpiresAt || addDaysToIso(90), 80),
            errorMessage: '',
            updatedAt: new Date().toISOString()
          },
          { merge: true }
        );

        const connections = await listOpenFinanceConnections(appId, userId);
        response.status(200).json({
          connectionId,
          authorizationUrl: sanitizeString(upstreamConnection.consentUrl || upstream.authorizationUrl, 700),
          connections
        });
        return;
      }

      if (action === 'revoke-connection') {
        const connectionId = sanitizeString(request.body?.connectionId, 120);
        if (!connectionId) {
          response.status(400).json({
            error: 'connectionId is required'
          });
          return;
        }

        const connectionRef = connectionsCollection.doc(connectionId);
        const snapshot = await connectionRef.get();
        if (!snapshot.exists) {
          response.status(404).json({
            error: 'Connection not found'
          });
          return;
        }

        const connection = snapshot.data() || {};
        await requestOpenFinanceUpstream(
          'revoke-connection',
          {
            appId,
            bankCode: sanitizeString(connection.bankCode, 60),
            connectionId: sanitizeString(connection.providerConnectionId || connectionId, 140)
          },
          {
            userId
          }
        );

        await connectionRef.set(
          {
            status: 'revoked',
            updatedAt: new Date().toISOString()
          },
          { merge: true }
        );

        const connections = await listOpenFinanceConnections(appId, userId);
        response.status(200).json({
          connectionId,
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
        error: 'Unexpected error while handling Open Finance',
        details: error?.message || 'unknown error'
      });
    }
  }
);

module.exports = {
  openFinanceProxy
};
