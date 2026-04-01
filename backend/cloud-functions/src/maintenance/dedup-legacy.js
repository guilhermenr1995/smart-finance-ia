const {
  db,
  USER_JOURNEY_RESET_COLLECTIONS
} = require('../core/base');
const {
  buildTransactionDedupKey,
  sortByPriorityWithTimestamp,
  mergeDuplicateTransactionGroup,
  shouldUpdateKeeper
} = require('../core/domain-utils');

async function deduplicateUserTransactions(appId, userId, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const collectionRef = db.collection(`artifacts/${appId}/users/${userId}/transacoes`);
  const snapshot = await collectionRef.get();
  const groups = new Map();

  snapshot.forEach((doc) => {
    const data = doc.data() || {};
    const key = String(data.dedupKey || '').trim() || buildTransactionDedupKey(data);
    if (!key) {
      return;
    }

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push({
      id: doc.id,
      ref: doc.ref,
      data
    });
  });

  const duplicateGroups = [...groups.entries()].filter(([, docs]) => docs.length > 1);
  const operations = [];
  let keeperUpdates = 0;
  let duplicateDocs = 0;
  const sampleGroups = [];

  duplicateGroups.forEach(([groupKey, docs]) => {
    const ordered = sortByPriorityWithTimestamp(docs);
    const keeperDoc = ordered[0];
    const mergedKeeper = mergeDuplicateTransactionGroup(keeperDoc, ordered);
    const docsToDelete = ordered.slice(1);

    duplicateDocs += docsToDelete.length;
    if (sampleGroups.length < 8) {
      sampleGroups.push({
        dedupKey: groupKey,
        keeperDocId: keeperDoc.id,
        duplicateDocIds: docsToDelete.map((doc) => doc.id)
      });
    }

    if (shouldUpdateKeeper(keeperDoc.data, mergedKeeper)) {
      keeperUpdates += 1;
      operations.push({
        type: 'set',
        ref: keeperDoc.ref,
        data: mergedKeeper
      });
    }

    docsToDelete.forEach((doc) => {
      operations.push({
        type: 'delete',
        ref: doc.ref
      });
    });
  });

  if (!dryRun && operations.length > 0) {
    const batchSize = 420;
    for (let index = 0; index < operations.length; index += batchSize) {
      const chunk = operations.slice(index, index + batchSize);
      const batch = db.batch();

      chunk.forEach((operation) => {
        if (operation.type === 'set') {
          batch.set(operation.ref, operation.data, { merge: true });
          return;
        }

        batch.delete(operation.ref);
      });

      await batch.commit();
    }
  }

  return {
    userId,
    scannedTransactions: snapshot.size,
    duplicateGroups: duplicateGroups.length,
    duplicateDocs,
    keeperUpdates,
    dryRun,
    sampleGroups
  };
}

async function deleteCollectionDocuments(collectionRef, options = {}) {
  const batchSize = Math.max(1, Math.min(Number(options.batchSize || 380), 420));
  let deletedCount = 0;

  while (true) {
    const snapshot = await collectionRef.limit(batchSize).get();
    if (snapshot.empty) {
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    deletedCount += snapshot.size;
    if (snapshot.size < batchSize) {
      break;
    }
  }

  return deletedCount;
}

async function deleteQueryDocuments(queryRef, options = {}) {
  const batchSize = Math.max(1, Math.min(Number(options.batchSize || 380), 420));
  let deletedCount = 0;

  while (true) {
    const snapshot = await queryRef.limit(batchSize).get();
    if (snapshot.empty) {
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    deletedCount += snapshot.size;
    if (snapshot.size < batchSize) {
      break;
    }
  }

  return deletedCount;
}

function compareResetCollectionRefs(left, right) {
  const leftName = String(left?.id || '');
  const rightName = String(right?.id || '');
  const leftPriority = USER_JOURNEY_RESET_COLLECTIONS.indexOf(leftName);
  const rightPriority = USER_JOURNEY_RESET_COLLECTIONS.indexOf(rightName);

  const normalizedLeftPriority = leftPriority === -1 ? Number.MAX_SAFE_INTEGER : leftPriority;
  const normalizedRightPriority = rightPriority === -1 ? Number.MAX_SAFE_INTEGER : rightPriority;

  if (normalizedLeftPriority !== normalizedRightPriority) {
    return normalizedLeftPriority - normalizedRightPriority;
  }

  return leftName.localeCompare(rightName);
}

async function resolveUserCollectionsForReset(userRef) {
  const collectionMap = new Map();

  const listedCollections = await userRef.listCollections();
  listedCollections.forEach((collectionRef) => {
    collectionMap.set(collectionRef.id, collectionRef);
  });

  USER_JOURNEY_RESET_COLLECTIONS.forEach((collectionName) => {
    if (!collectionMap.has(collectionName)) {
      collectionMap.set(collectionName, userRef.collection(collectionName));
    }
  });

  return [...collectionMap.values()].sort(compareResetCollectionRefs);
}

async function resolveArtifactAppIdsForReset(primaryAppId, options = {}) {
  const includeAllApps = options.includeAllApps !== false;
  const appIds = new Set();
  const normalizedPrimary = String(primaryAppId || '').trim();

  if (normalizedPrimary) {
    appIds.add(normalizedPrimary);
  }

  if (!includeAllApps) {
    return [...appIds];
  }

  try {
    const artifactRefs = await db.collection('artifacts').listDocuments();
    artifactRefs.forEach((ref) => {
      const appId = String(ref?.id || '').trim();
      if (appId) {
        appIds.add(appId);
      }
    });
  } catch (error) {
    console.warn('Unable to list app namespaces for journey reset:', error?.message || error);
  }

  return [...appIds];
}

async function resetLegacyUserJourneyData(userId, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const userRef = db.doc(`users/${userId}`);
  const deletedByCollection = {};
  let totalDocsMatched = 0;
  let totalDocsDeleted = 0;

  try {
    const collections = await resolveUserCollectionsForReset(userRef);
    for (const collectionRef of collections) {
      const collectionName = collectionRef.id;
      const snapshot = await collectionRef.get();
      const matched = snapshot.size;
      totalDocsMatched += matched;

      deletedByCollection[collectionName] = {
        matched,
        deleted: dryRun ? matched : 0
      };

      if (!dryRun && matched > 0) {
        const deleted = await deleteCollectionDocuments(collectionRef);
        deletedByCollection[collectionName].deleted = deleted;
        totalDocsDeleted += deleted;
      }
    }

    if (!dryRun) {
      await userRef.delete().catch(() => {});
    } else {
      totalDocsDeleted = totalDocsMatched;
    }
  } catch (error) {
    console.warn(`Legacy journey reset failed for user ${userId}:`, error?.message || error);
  }

  return {
    userPath: userRef.path,
    deletedByCollection,
    totalDocsMatched,
    totalDocsDeleted
  };
}


module.exports = {
  deduplicateUserTransactions,
  deleteCollectionDocuments,
  deleteQueryDocuments,
  compareResetCollectionRefs,
  resolveUserCollectionsForReset,
  resolveArtifactAppIdsForReset,
  resetLegacyUserJourneyData
};
