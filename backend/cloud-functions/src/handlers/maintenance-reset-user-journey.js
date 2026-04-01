const {
  onRequest,
  setCorsHeaders,
  handlePreflightAndMethod,
  authenticateRequest,
  isAdminRequest
} = require('../core/base');
const {
  resolveUserIdsForJourneyReset,
  resetUserJourneyData
} = require('../maintenance/reset-user-journey');

const maintenanceResetUserJourney = onRequest(
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
        includeAllApps: true
      });
      if (resolved.userIds.length === 0) {
        response.status(404).json({
          error: 'User not found',
          message: 'No user matched the provided userId/userEmail.'
        });
        return;
      }

      const perUser = {};
      let totalDocsMatched = 0;
      let totalDocsDeleted = 0;
      for (const resolvedUserId of resolved.userIds) {
        const userSummary = await resetUserJourneyData(appId, resolvedUserId, {
          dryRun,
          resetBy: decodedToken.email || '',
          includeAllApps: true,
          targetAppIds: resolved.targetAppIds
        });
        perUser[resolvedUserId] = userSummary;
        totalDocsMatched += Number(userSummary.totalDocsMatched || 0);
        totalDocsDeleted += Number(userSummary.totalDocsDeleted || 0);
      }

      const summary = {
        inputUserId: userId,
        inputUserEmail: userEmail,
        resolvedUserIds: resolved.userIds,
        targetAppIds: resolved.targetAppIds,
        perUser,
        totalDocsMatched,
        totalDocsDeleted
      };

      response.status(200).json({
        appId,
        userId: userId || resolved.userIds[0] || '',
        userEmail,
        dryRun,
        triggeredBy: decodedToken.email || '',
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        summary
      });
    } catch (error) {
      response.status(500).json({
        error: 'Unexpected error while resetting user journey',
        details: error?.message || 'unknown error'
      });
    }
  }
);

module.exports = {
  maintenanceResetUserJourney
};
