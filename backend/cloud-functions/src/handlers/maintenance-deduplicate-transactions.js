const {
  onRequest,
  setCorsHeaders,
  handlePreflightAndMethod,
  authenticateRequest,
  isAdminRequest,
  db
} = require('../core/base');
const { deduplicateUserTransactions } = require('../maintenance/dedup-legacy');

const maintenanceDeduplicateTransactions = onRequest(
  {
    invoker: 'public',
    timeoutSeconds: 540,
    memory: '1GiB'
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

    if (!isAdminRequest(decodedToken)) {
      response.status(403).json({
        error: 'Forbidden',
        message: 'Only admin accounts can run maintenance.'
      });
      return;
    }

    try {
      const appId = String(request.body?.appId || '').trim();
      if (!appId) {
        response.status(400).json({
          error: 'appId is required'
        });
        return;
      }

      const dryRun = Boolean(request.body?.dryRun);
      const targetUserId = String(request.body?.userId || '').trim();

      let userIds = [];
      if (targetUserId) {
        userIds = [targetUserId];
      } else {
        const usersSnapshot = await db.collection(`artifacts/${appId}/users`).get();
        userIds = usersSnapshot.docs.map((doc) => doc.id);
      }

      const startedAt = Date.now();
      const users = [];
      for (const userId of userIds) {
        const result = await deduplicateUserTransactions(appId, userId, { dryRun });
        users.push(result);
      }

      const summary = users.reduce(
        (accumulator, user) => {
          accumulator.usersScanned += 1;
          accumulator.transactionsScanned += Number(user.scannedTransactions || 0);
          accumulator.duplicateGroups += Number(user.duplicateGroups || 0);
          accumulator.duplicateDocs += Number(user.duplicateDocs || 0);
          accumulator.keeperUpdates += Number(user.keeperUpdates || 0);
          if (Number(user.duplicateGroups || 0) > 0) {
            accumulator.usersWithDuplicates += 1;
          }
          return accumulator;
        },
        {
          usersScanned: 0,
          usersWithDuplicates: 0,
          transactionsScanned: 0,
          duplicateGroups: 0,
          duplicateDocs: 0,
          keeperUpdates: 0
        }
      );

      response.status(200).json({
        appId,
        dryRun,
        triggeredBy: decodedToken.email || '',
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        summary,
        users: users.filter((user) => user.duplicateGroups > 0 || user.keeperUpdates > 0)
      });
    } catch (error) {
      response.status(500).json({
        error: 'Unexpected error while deduplicating transactions',
        details: error?.message || 'unknown error'
      });
    }
  }
);

module.exports = {
  maintenanceDeduplicateTransactions
};
