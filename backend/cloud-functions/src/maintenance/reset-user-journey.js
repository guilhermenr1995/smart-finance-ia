const {
  db,
  getAuth,
  FieldPath,
  toNormalizedEmail,
  uniqueNonEmpty
} = require('../core/base');
const {
  sanitizeString,
  buildResetUserProfilePayload
} = require('../core/domain-utils');
const {
  resolveArtifactAppIdsForReset,
  resolveUserCollectionsForReset,
  deleteCollectionDocuments,
  deleteQueryDocuments,
  resetLegacyUserJourneyData
} = require('./dedup-legacy');

async function resolveUserIdsForJourneyReset(appId, rawUserId, rawEmail, options = {}) {
  const resolvedUserIds = new Set();
  const candidateUserId = sanitizeString(rawUserId, 180);
  if (candidateUserId) {
    resolvedUserIds.add(candidateUserId);
  }

  const targetAppIds = Array.isArray(options.targetAppIds) && options.targetAppIds.length > 0
    ? [...new Set(options.targetAppIds.map((item) => String(item || '').trim()).filter(Boolean))]
    : await resolveArtifactAppIdsForReset(appId, {
        includeAllApps: options.includeAllApps
      });

  const rawEmailCandidate = sanitizeString(rawEmail, 220);
  const normalizedEmailCandidate = toNormalizedEmail(rawEmailCandidate);
  const candidateEmails = uniqueNonEmpty([rawEmailCandidate, normalizedEmailCandidate]);

  if (normalizedEmailCandidate) {
    try {
      const authUser = await getAuth().getUserByEmail(normalizedEmailCandidate);
      const authUid = sanitizeString(authUser?.uid, 180);
      if (authUid) {
        resolvedUserIds.add(authUid);
      }
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') {
        console.warn('Unable to resolve auth uid for journey reset by email:', error?.message || error);
      }
    }
  }

  if (candidateEmails.length > 0 && targetAppIds.length > 0) {
    for (const targetAppId of targetAppIds) {
      const usersCollection = db.collection(`artifacts/${targetAppId}/users`);
      for (const candidateEmail of candidateEmails) {
        try {
          const snapshot = await usersCollection.where('email', '==', candidateEmail).get();
          snapshot.forEach((doc) => {
            const uid = sanitizeString(doc?.id, 180);
            if (uid) {
              resolvedUserIds.add(uid);
            }
          });
        } catch (error) {
          console.warn(
            `Unable to resolve user docs by email for journey reset in app ${targetAppId}:`,
            error?.message || error
          );
        }
      }
    }
  }

  // Fallback for legacy docs where e-mail case differs from current auth profile.
  // This avoids false negatives when only exact `where('email', '==', ...)` is used.
  if (normalizedEmailCandidate && targetAppIds.length > 0) {
    for (const targetAppId of targetAppIds) {
      try {
        const usersSnapshot = await db.collection(`artifacts/${targetAppId}/users`).select('email').get();
        usersSnapshot.forEach((doc) => {
          const docEmail = toNormalizedEmail(doc.data()?.email);
          if (docEmail && docEmail === normalizedEmailCandidate) {
            const uid = sanitizeString(doc.id, 180);
            if (uid) {
              resolvedUserIds.add(uid);
            }
          }
        });
      } catch (error) {
        console.warn(
          `Unable to resolve user docs by normalized email scan for journey reset in app ${targetAppId}:`,
          error?.message || error
        );
      }
    }
  }

  return {
    targetAppIds,
    userIds: [...resolvedUserIds]
  };
}

async function resetUserJourneyDataForApp(appId, userId, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const userRef = db.doc(`artifacts/${appId}/users/${userId}`);
  const deletedByCollection = {};
  let totalDocsMatched = 0;
  let totalDocsDeleted = 0;
  let resetMode = 'dry-run';
  let postResetCollectionsWithDocs = 0;

  const collectionsForReset = await resolveUserCollectionsForReset(userRef);
  for (const collectionRef of collectionsForReset) {
    const collectionName = collectionRef.id;
    const snapshot = await collectionRef.get();
    const matched = snapshot.size;
    totalDocsMatched += matched;

    let deleted = dryRun ? matched : 0;

    deletedByCollection[collectionName] = {
      matched,
      deleted
    };
  }

  if (!dryRun) {
    const userSnapshot = await userRef.get();
    const existingData = userSnapshot.exists ? userSnapshot.data() || {} : {};
    const restoredProfile = buildResetUserProfilePayload(userId, existingData);

    if (typeof db.recursiveDelete === 'function') {
      resetMode = 'recursive-delete';
      await db.recursiveDelete(userRef);
    } else {
      resetMode = 'manual-delete';
      for (const collectionRef of collectionsForReset) {
        await deleteCollectionDocuments(collectionRef);
      }
      await userRef.delete().catch(() => {});
    }

    // Defensive cleanup: if anything remains, remove it explicitly.
    const remainingCollections = await userRef.listCollections();
    for (const collectionRef of remainingCollections) {
      const probe = await collectionRef.limit(1).get();
      if (!probe.empty) {
        postResetCollectionsWithDocs += 1;
      }
      await deleteCollectionDocuments(collectionRef);
    }

    await userRef.set(restoredProfile, { merge: false });
    totalDocsDeleted = totalDocsMatched;
    Object.keys(deletedByCollection).forEach((collectionName) => {
      deletedByCollection[collectionName].deleted = deletedByCollection[collectionName].matched;
    });
  } else {
    totalDocsDeleted = totalDocsMatched;
  }

  return {
    appId,
    userId,
    userPath: userRef.path,
    dryRun,
    resetMode,
    postResetCollectionsWithDocs,
    deletedByCollection,
    totalDocsMatched,
    totalDocsDeleted
  };
}

async function resetUserJourneyData(appId, userId, options = {}) {
  const targetAppIds =
    Array.isArray(options.targetAppIds) && options.targetAppIds.length > 0
      ? [...new Set(options.targetAppIds.map((item) => String(item || '').trim()).filter(Boolean))]
      : await resolveArtifactAppIdsForReset(appId, {
          includeAllApps: options.includeAllApps
        });
  const perApp = {};
  let totalDocsMatched = 0;
  let totalDocsDeleted = 0;

  for (const targetAppId of targetAppIds) {
    const appSummary = await resetUserJourneyDataForApp(targetAppId, userId, options);
    perApp[targetAppId] = appSummary;
    totalDocsMatched += Number(appSummary.totalDocsMatched || 0);
    totalDocsDeleted += Number(appSummary.totalDocsDeleted || 0);
  }

  const consultantUsageByFieldQuery = db.collection('ai_consultant_usage').where('userId', '==', userId);
  const consultantUsageByFieldSnapshot = await consultantUsageByFieldQuery.get();
  const consultantUsageByFieldMatched = consultantUsageByFieldSnapshot.size;
  const consultantUsageByFieldDeleted = Boolean(options.dryRun)
    ? consultantUsageByFieldMatched
    : consultantUsageByFieldMatched > 0
    ? await deleteQueryDocuments(consultantUsageByFieldQuery)
    : 0;

  let consultantUsageByDocIdMatched = 0;
  let consultantUsageByDocIdDeleted = 0;
  try {
    const docIdPrefix = `${sanitizeString(userId, 200)}_`;
    const consultantUsageByDocIdQuery = db
      .collection('ai_consultant_usage')
      .where(FieldPath.documentId(), '>=', docIdPrefix)
      .where(FieldPath.documentId(), '<', `${docIdPrefix}\uf8ff`);
    const consultantUsageByDocIdSnapshot = await consultantUsageByDocIdQuery.get();
    consultantUsageByDocIdMatched = consultantUsageByDocIdSnapshot.docs.filter(
      (doc) => !consultantUsageByFieldSnapshot.docs.some((existingDoc) => existingDoc.id === doc.id)
    ).length;

    if (!Boolean(options.dryRun) && consultantUsageByDocIdMatched > 0) {
      const docIdsAlreadyHandled = new Set(consultantUsageByFieldSnapshot.docs.map((doc) => doc.id));
      const extraDocRefs = consultantUsageByDocIdSnapshot.docs
        .filter((doc) => !docIdsAlreadyHandled.has(doc.id))
        .map((doc) => doc.ref);

      const chunkSize = 400;
      for (let index = 0; index < extraDocRefs.length; index += chunkSize) {
        const chunk = extraDocRefs.slice(index, index + chunkSize);
        const batch = db.batch();
        chunk.forEach((ref) => batch.delete(ref));
        await batch.commit();
      }

      consultantUsageByDocIdDeleted = extraDocRefs.length;
    } else if (Boolean(options.dryRun)) {
      consultantUsageByDocIdDeleted = consultantUsageByDocIdMatched;
    }
  } catch (error) {
    console.warn('Unable to cleanup ai_consultant_usage by document id prefix:', error?.message || error);
  }

  const legacySummary = await resetLegacyUserJourneyData(userId, options);

  const consultantUsageMatched = consultantUsageByFieldMatched + consultantUsageByDocIdMatched;
  const consultantUsageDeleted = consultantUsageByFieldDeleted + consultantUsageByDocIdDeleted;
  totalDocsMatched += consultantUsageMatched + Number(legacySummary.totalDocsMatched || 0);
  totalDocsDeleted += consultantUsageDeleted + Number(legacySummary.totalDocsDeleted || 0);

  return {
    userId,
    dryRun: Boolean(options.dryRun),
    targetAppIds,
    perApp,
    consultantUsage: {
      matched: consultantUsageMatched,
      deleted: consultantUsageDeleted,
      byField: {
        matched: consultantUsageByFieldMatched,
        deleted: consultantUsageByFieldDeleted
      },
      byDocIdPrefix: {
        matched: consultantUsageByDocIdMatched,
        deleted: consultantUsageByDocIdDeleted
      }
    },
    legacy: legacySummary,
    totalDocsMatched,
    totalDocsDeleted
  };
}

module.exports = {
  resolveUserIdsForJourneyReset,
  resetUserJourneyDataForApp,
  resetUserJourneyData
};
