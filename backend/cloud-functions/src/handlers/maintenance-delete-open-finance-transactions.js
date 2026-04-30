const {
  onRequest,
  setCorsHeaders,
  handlePreflightAndMethod,
  authenticateRequest,
  isAdminRequest
} = require('../core/base');
const { deleteOpenFinanceDataForUser } = require('../open-finance/open-finance-cleanup');
const { resolveUserIdsForJourneyReset } = require('../maintenance/reset-user-journey');

const maintenanceDeleteOpenFinanceTransactions = onRequest(
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

      const userId = String(request.body?.userId || '').trim();
      const userEmail = String(request.body?.userEmail || '').trim();
      if (!userId && !userEmail) {
        response.status(400).json({
          error: 'userId or userEmail is required'
        });
        return;
      }

      const dryRun = Boolean(request.body?.dryRun);
      const startedAt = Date.now();
      const resolved = await resolveUserIdsForJourneyReset(appId, userId, userEmail, {
        includeAllApps: false,
        targetAppIds: [appId]
      });

      if (resolved.userIds.length === 0) {
        response.status(404).json({
          error: 'User not found',
          message: 'No user matched the provided userId/userEmail.'
        });
        return;
      }

      const perUser = {};
      let scanned = 0;
      let matchedOpenFinance = 0;
      let deleted = 0;
      let matchedCategories = 0;
      let deletedCategories = 0;
      const deletedCategoryNames = new Set();

      for (const resolvedUserId of resolved.userIds) {
        const summary = await deleteOpenFinanceDataForUser(appId, resolvedUserId, {
          dryRun,
          deleteAllOpenFinance: true
        });
        perUser[resolvedUserId] = summary;
        scanned += Number(summary.scanned || 0);
        matchedOpenFinance += Number(summary.matchedOpenFinance || 0);
        deleted += Number(summary.deletedTransactions || 0);
        matchedCategories += Number(summary.matchedCategoryDocs || 0);
        deletedCategories += Number(summary.deletedCategoryDocs || 0);
        (Array.isArray(summary.deletedCategories) ? summary.deletedCategories : []).forEach((category) => {
          const safe = String(category || '').trim();
          if (safe) {
            deletedCategoryNames.add(safe);
          }
        });
      }

      response.status(200).json({
        appId,
        userId: userId || resolved.userIds[0] || '',
        userEmail,
        dryRun,
        triggeredBy: decodedToken.email || '',
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        summary: {
          resolvedUserIds: resolved.userIds,
          scanned,
          matchedOpenFinance,
          deleted,
          matchedCategories,
          deletedCategories,
          deletedCategoryNames: [...deletedCategoryNames].sort((left, right) => left.localeCompare(right, 'pt-BR')),
          perUser
        }
      });
    } catch (error) {
      response.status(500).json({
        error: 'Unexpected error while deleting Open Finance transactions',
        details: error?.message || 'unknown error'
      });
    }
  }
);

module.exports = {
  maintenanceDeleteOpenFinanceTransactions
};
