const {
  onRequest,
  setCorsHeaders,
  handlePreflightAndMethod,
  authenticateRequest,
  isAdminRequest,
  db
} = require('../core/base');
const {
  toCurrency,
  toPercent
} = require('../core/domain-utils');
const { listAllProjectAuthUsers } = require('../core/external-services');
const {
  parseIsoDate,
  toIsoOrEmpty,
  summarizeTransactionCollection,
  mergeDailyUsage
} = require('../admin/dashboard-data');

const getAdminDashboard = onRequest(
  {
    invoker: 'public',
    timeoutSeconds: 120,
    memory: '512MiB'
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
        message: 'Only admin accounts can access this endpoint.'
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

      const usersSnapshot = await db.collection(`artifacts/${appId}/users`).get();
      const userProfiles = new Map();
      usersSnapshot.forEach((doc) => {
        userProfiles.set(doc.id, {
          uid: doc.id,
          ...(doc.data() || {})
        });
      });

      const authUsers = await listAllProjectAuthUsers();
      authUsers.forEach((authUser) => {
        if (authUser.disabled) {
          return;
        }

        const providerIds = (authUser.providerData || [])
          .map((provider) => String(provider?.providerId || '').trim())
          .filter(Boolean);

        if (providerIds.length === 0) {
          return;
        }

        const existingProfile = userProfiles.get(authUser.uid) || { uid: authUser.uid };
        userProfiles.set(authUser.uid, {
          ...existingProfile,
          uid: authUser.uid,
          email: String(existingProfile.email || authUser.email || '').trim(),
          displayName: String(existingProfile.displayName || authUser.displayName || '').trim(),
          providerIds: providerIds.length > 0 ? providerIds : existingProfile.providerIds || [],
          createdAt: toIsoOrEmpty(existingProfile.createdAt || authUser.metadata?.creationTime),
          lastAccessAt: toIsoOrEmpty(existingProfile.lastAccessAt || authUser.metadata?.lastSignInTime)
        });
      });

      const globalDailyUsage = {};
      const perUserDailyUsage = {};
      const dailySnapshot = await db.collectionGroup('metrics_daily').get();

      dailySnapshot.forEach((doc) => {
        const pathSegments = doc.ref.path.split('/');
        if (
          pathSegments.length < 6 ||
          pathSegments[0] !== 'artifacts' ||
          pathSegments[1] !== appId ||
          pathSegments[2] !== 'users' ||
          pathSegments[4] !== 'metrics_daily'
        ) {
          return;
        }

        const userId = pathSegments[3];
        const dateKey = pathSegments[5];
        const dailyData = doc.data() || {};
        mergeDailyUsage(globalDailyUsage, perUserDailyUsage, userId, dateKey, dailyData);

        if (!userProfiles.has(userId)) {
          userProfiles.set(userId, { uid: userId });
        }
      });

      const userIds = [...userProfiles.keys()];
      const transactionStatsEntries = await Promise.all(
        userIds.map(async (userId) => {
          const transactionSnapshot = await db.collection(`artifacts/${appId}/users/${userId}/transacoes`).get();
          return [userId, summarizeTransactionCollection(transactionSnapshot)];
        })
      );

      const transactionStatsByUser = Object.fromEntries(transactionStatsEntries);
      const now = new Date();
      const cutoff7Days = new Date(now.getTime() - 7 * 86400000);
      const cutoff30Days = new Date(now.getTime() - 30 * 86400000);

      const users = userIds
        .map((userId) => {
          const profile = userProfiles.get(userId) || {};
          const usage = perUserDailyUsage[userId] || {
            aiCategorizationRunsTotal: 0,
            aiConsultantRunsTotal: 0,
            importOperationsTotal: 0,
            importedTransactionsTotal: 0,
            manualTransactionsTotal: 0
          };
          const transactionStats = transactionStatsByUser[userId] || summarizeTransactionCollection({ forEach: () => {} });

          const createdAt = toIsoOrEmpty(profile.createdAt);
          const lastAccessAt = toIsoOrEmpty(profile.lastAccessAt);
          const autoCategorizedTotal =
            transactionStats.autoAcceptedTransactions + transactionStats.autoOverriddenTransactions;
          const automationAcceptedRate =
            autoCategorizedTotal > 0 ? toPercent((transactionStats.autoAcceptedTransactions / autoCategorizedTotal) * 100) : 0;

          return {
            uid: userId,
            email: String(profile.email || '').trim(),
            displayName: String(profile.displayName || '').trim(),
            createdAt,
            lastAccessAt,
            transactions: {
              total: transactionStats.totalTransactions,
              imported: transactionStats.importedTransactions,
              manual: transactionStats.manualTransactions,
              active: transactionStats.activeTransactions,
              pendingCategorization: transactionStats.pendingCategorization
            },
            aiUsage: {
              categorizationRunsTotal: usage.aiCategorizationRunsTotal,
              consultantRunsTotal: usage.aiConsultantRunsTotal
            },
            automation: {
              autoAcceptedTransactions: transactionStats.autoAcceptedTransactions,
              autoOverriddenTransactions: transactionStats.autoOverriddenTransactions,
              autoCategorizedTotal,
              acceptedRate: automationAcceptedRate,
              bySource: transactionStats.autoBySource
            }
          };
        })
        .sort((left, right) => String(right.lastAccessAt || '').localeCompare(String(left.lastAccessAt || '')));

      const totals = users.reduce(
        (accumulator, user) => {
          accumulator.users += 1;
          accumulator.transactions += user.transactions.total;
          accumulator.importedTransactions += user.transactions.imported;
          accumulator.manualTransactions += user.transactions.manual;
          accumulator.pendingCategorization += user.transactions.pendingCategorization;
          accumulator.aiCategorizationRuns += user.aiUsage.categorizationRunsTotal;
          accumulator.aiConsultantRuns += user.aiUsage.consultantRunsTotal;
          accumulator.autoAcceptedTransactions += user.automation.autoAcceptedTransactions;
          accumulator.autoOverriddenTransactions += user.automation.autoOverriddenTransactions;

          const lastAccessDate = parseIsoDate(user.lastAccessAt);
          if (lastAccessDate && lastAccessDate >= cutoff7Days) {
            accumulator.activeUsers7d += 1;
          }
          if (lastAccessDate && lastAccessDate >= cutoff30Days) {
            accumulator.activeUsers30d += 1;
          }

          return accumulator;
        },
        {
          users: 0,
          activeUsers7d: 0,
          activeUsers30d: 0,
          transactions: 0,
          importedTransactions: 0,
          manualTransactions: 0,
          pendingCategorization: 0,
          aiCategorizationRuns: 0,
          aiConsultantRuns: 0,
          autoAcceptedTransactions: 0,
          autoOverriddenTransactions: 0
        }
      );

      const autoTotal = totals.autoAcceptedTransactions + totals.autoOverriddenTransactions;
      const dailyRecords = Object.values(globalDailyUsage).sort((left, right) => String(left.dateKey).localeCompare(right.dateKey));
      const aiCategorizationRunsByDay = dailyRecords.map((record) => ({
        dateKey: record.dateKey,
        count: record.aiCategorizationRuns
      }));
      const aiConsultantRunsByDay = dailyRecords.map((record) => ({
        dateKey: record.dateKey,
        count: record.aiConsultantRuns
      }));
      const importOperationsByDay = dailyRecords.map((record) => ({
        dateKey: record.dateKey,
        count: record.importOperations
      }));
      const importedTransactionsByDay = dailyRecords.map((record) => ({
        dateKey: record.dateKey,
        count: record.importedTransactions
      }));
      const manualTransactionsByDay = dailyRecords.map((record) => ({
        dateKey: record.dateKey,
        count: record.manualTransactions
      }));

      const topUsersByVolume = [...users]
        .sort((left, right) => right.transactions.total - left.transactions.total)
        .slice(0, 10)
        .map((user) => ({
          uid: user.uid,
          email: user.email,
          totalTransactions: user.transactions.total,
          importedTransactions: user.transactions.imported,
          manualTransactions: user.transactions.manual
        }));

      response.status(200).json({
        generatedAt: new Date().toISOString(),
        appId,
        admin: {
          email: decodedToken.email || ''
        },
        totals: {
          ...totals,
          averageTransactionsPerUser: totals.users > 0 ? toCurrency(totals.transactions / totals.users) : 0,
          automationAcceptedRate: autoTotal > 0 ? toPercent((totals.autoAcceptedTransactions / autoTotal) * 100) : 0,
          automationOverrideRate: autoTotal > 0 ? toPercent((totals.autoOverriddenTransactions / autoTotal) * 100) : 0
        },
        dailyUsage: {
          aiCategorizationRunsByDay,
          aiConsultantRunsByDay,
          importOperationsByDay,
          importedTransactionsByDay,
          manualTransactionsByDay
        },
        highlights: {
          usersWithNoTransactions: users.filter((user) => user.transactions.total === 0).length,
          usersWithPendingCategorization: users.filter((user) => user.transactions.pendingCategorization > 0).length,
          topUsersByVolume
        },
        users
      });
    } catch (error) {
      response.status(500).json({
        error: 'Unexpected error while loading admin dashboard',
        details: error?.message || 'unknown error'
      });
    }
  }
);

module.exports = {
  getAdminDashboard
};
