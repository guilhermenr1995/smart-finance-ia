const {
  onRequest,
  setCorsHeaders,
  handlePreflightAndMethod,
  authenticateRequest,
  isAdminRequest,
  db
} = require('../core/base');
const { sanitizeString } = require('../core/domain-utils');
const { resolveUserIdsForJourneyReset } = require('../maintenance/reset-user-journey');

function isOpenFinanceTransactionRecord(data = {}) {
  const origin = String(data.transactionOrigin || '').trim().toLowerCase();
  if (origin === 'open-finance' || origin === 'openfinance') {
    return true;
  }

  if (sanitizeString(data.providerTransactionId, 140)) {
    return true;
  }
  if (sanitizeString(data.providerItemId, 140)) {
    return true;
  }
  if (sanitizeString(data.providerAccountId, 140)) {
    return true;
  }

  const categorySource = String(data.categorySource || '').trim().toLowerCase();
  return categorySource.includes('open-finance') || categorySource.includes('openfinance');
}

async function deleteOpenFinanceTransactionsForUser(appId, userId, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const batchSize = Math.max(1, Math.min(450, Number(options.batchSize || 350)));
  const collectionRef = db.collection(`artifacts/${appId}/users/${userId}/transacoes`);
  const snapshot = await collectionRef.get();

  let scanned = 0;
  let matchedOpenFinance = 0;
  let deleted = 0;
  let pendingBatchOps = 0;
  let currentBatch = db.batch();

  const commitBatch = async () => {
    if (pendingBatchOps <= 0) {
      return;
    }
    await currentBatch.commit();
    deleted += pendingBatchOps;
    currentBatch = db.batch();
    pendingBatchOps = 0;
  };

  for (const doc of snapshot.docs) {
    scanned += 1;
    const data = doc.data() || {};
    if (!isOpenFinanceTransactionRecord(data)) {
      continue;
    }

    matchedOpenFinance += 1;
    if (dryRun) {
      continue;
    }

    currentBatch.delete(doc.ref);
    pendingBatchOps += 1;
    if (pendingBatchOps >= batchSize) {
      await commitBatch();
    }
  }

  if (!dryRun) {
    await commitBatch();
  } else {
    deleted = matchedOpenFinance;
  }

  return {
    appId,
    userId,
    scanned,
    matchedOpenFinance,
    deleted
  };
}

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

      for (const resolvedUserId of resolved.userIds) {
        const summary = await deleteOpenFinanceTransactionsForUser(appId, resolvedUserId, {
          dryRun
        });
        perUser[resolvedUserId] = summary;
        scanned += Number(summary.scanned || 0);
        matchedOpenFinance += Number(summary.matchedOpenFinance || 0);
        deleted += Number(summary.deleted || 0);
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
