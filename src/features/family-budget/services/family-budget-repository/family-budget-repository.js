import {
  FAMILY_BUDGET_COLLECTION,
  FAMILY_BUDGET_OWNER_COLLECTION,
  FAMILY_BUDGET_RECORD_COLLECTION,
  createBudgetId,
  normalizeBudgetRecord,
  normalizeBudgetWorkspace,
  normalizeOwnerRecord
} from '../../shared.js';

function chunkItems(items = [], size = 200) {
  const safeSize = Math.max(1, Number(size || 200));
  const chunks = [];
  for (let index = 0; index < items.length; index += safeSize) {
    chunks.push(items.slice(index, index + safeSize));
  }
  return chunks;
}

export class FamilyBudgetRepository {
  constructor(db, appId) {
    this.db = db;
    this.appId = appId;
  }

  getWorkspacesCollection(userId) {
    return this.db.collection(`artifacts/${this.appId}/users/${userId}/${FAMILY_BUDGET_COLLECTION}`);
  }

  getWorkspaceDoc(userId, monthKey) {
    return this.getWorkspacesCollection(userId).doc(monthKey);
  }

  getOwnersCollection(userId, monthKey) {
    return this.getWorkspaceDoc(userId, monthKey).collection(FAMILY_BUDGET_OWNER_COLLECTION);
  }

  getRecordsCollection(userId, monthKey) {
    return this.getWorkspaceDoc(userId, monthKey).collection(FAMILY_BUDGET_RECORD_COLLECTION);
  }

  async fetchMonthBundle(userId, monthKey) {
    const workspaceRef = this.getWorkspaceDoc(userId, monthKey);
    const [workspaceSnapshot, ownersSnapshot, recordsSnapshot] = await Promise.all([
      workspaceRef.get(),
      this.getOwnersCollection(userId, monthKey).get(),
      this.getRecordsCollection(userId, monthKey).get()
    ]);

    const workspace = normalizeBudgetWorkspace(
      workspaceSnapshot.exists ? workspaceSnapshot.data() || {} : {},
      monthKey
    );
    const owners = [];
    ownersSnapshot.forEach((doc, index) => {
      owners.push({
        ...normalizeOwnerRecord(
          {
            ...(doc.data() || {}),
            ownerId: doc.id
          },
          index + 1
        ),
        ownerId: doc.id
      });
    });

    const records = [];
    recordsSnapshot.forEach((doc, index) => {
      records.push({
        ...normalizeBudgetRecord(
          {
            ...(doc.data() || {}),
            recordId: doc.id,
            monthKey
          },
          index + 1,
          monthKey
        ),
        recordId: doc.id
      });
    });

    return {
      workspace: {
        ...workspace,
        monthKey
      },
      exists: workspaceSnapshot.exists,
      owners,
      records
    };
  }

  async ensureWorkspace(userId, monthKey) {
    const workspaceRef = this.getWorkspaceDoc(userId, monthKey);
    const snapshot = await workspaceRef.get();
    if (snapshot.exists) {
      return normalizeBudgetWorkspace(snapshot.data() || {}, monthKey);
    }

    const nowIso = new Date().toISOString();
    const payload = normalizeBudgetWorkspace(
      {
        monthKey,
        status: 'active',
        createdAt: nowIso,
        updatedAt: nowIso
      },
      monthKey
    );
    await workspaceRef.set(payload, { merge: true });
    return payload;
  }

  async saveWorkspace(userId, monthKey, workspace = {}) {
    const nowIso = new Date().toISOString();
    const payload = normalizeBudgetWorkspace(
      {
        ...workspace,
        monthKey,
        updatedAt: nowIso,
        createdAt: workspace.createdAt || nowIso
      },
      monthKey
    );
    await this.getWorkspaceDoc(userId, monthKey).set(payload, { merge: true });
    return payload;
  }

  async saveOwner(userId, monthKey, owner = {}) {
    const normalized = normalizeOwnerRecord(owner);
    const ownerId = normalized.ownerId || createBudgetId('owner');
    const nowIso = new Date().toISOString();
    const docRef = this.getOwnersCollection(userId, monthKey).doc(ownerId);
    const snapshot = await docRef.get();
    const payload = {
      ownerId,
      name: normalized.name,
      order: Number.isFinite(Number(normalized.order)) ? Number(normalized.order) : 1,
      active: normalized.active !== false,
      createdAt: snapshot.exists ? String(snapshot.data()?.createdAt || nowIso) : nowIso,
      updatedAt: nowIso
    };

    await docRef.set(payload, { merge: true });
    return payload;
  }

  async deleteOwner(userId, monthKey, ownerId) {
    const safeOwnerId = String(ownerId || '').trim();
    if (!safeOwnerId) {
      return;
    }

    await this.getOwnersCollection(userId, monthKey).doc(safeOwnerId).delete();
  }

  async saveRecord(userId, monthKey, record = {}) {
    const normalized = normalizeBudgetRecord(record, 1, monthKey);
    const recordId = normalized.recordId || createBudgetId('record');
    const nowIso = new Date().toISOString();
    const docRef = this.getRecordsCollection(userId, monthKey).doc(recordId);
    const snapshot = await docRef.get();
    const payload = {
      recordId,
      monthKey,
      ownerId: String(normalized.ownerId || '').trim(),
      type: normalized.type,
      name: normalized.name,
      amount: Number(normalized.amount || 0),
      notes: normalized.notes || '',
      order: Number.isFinite(Number(normalized.order)) ? Number(normalized.order) : 1,
      createdAt: snapshot.exists ? String(snapshot.data()?.createdAt || nowIso) : nowIso,
      updatedAt: nowIso
    };

    await docRef.set(payload, { merge: true });
    return payload;
  }

  async deleteRecord(userId, monthKey, recordId) {
    const safeRecordId = String(recordId || '').trim();
    if (!safeRecordId) {
      return;
    }

    await this.getRecordsCollection(userId, monthKey).doc(safeRecordId).delete();
  }

  async clearMonth(userId, monthKey) {
    const [ownersSnapshot, recordsSnapshot] = await Promise.all([
      this.getOwnersCollection(userId, monthKey).get(),
      this.getRecordsCollection(userId, monthKey).get()
    ]);

    const batch = this.db.batch();
    ownersSnapshot.forEach((doc) => batch.delete(doc.ref));
    recordsSnapshot.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  async replicateMonth(userId, sourceMonthKey, targetMonthKey) {
    const sourceBundle = await this.fetchMonthBundle(userId, sourceMonthKey);
    const targetBundle = await this.fetchMonthBundle(userId, targetMonthKey);
    const targetHasData = Boolean(
      (Array.isArray(targetBundle.owners) && targetBundle.owners.length > 0) ||
        (Array.isArray(targetBundle.records) && targetBundle.records.length > 0)
    );

    if (targetHasData) {
      await this.clearMonth(userId, targetMonthKey);
    }

    const nowIso = new Date().toISOString();
    const workspacePayload = {
      ...sourceBundle.workspace,
      monthKey: targetMonthKey,
      sourceMonthKey,
      status: 'replicated',
      createdAt: targetBundle.exists ? String(targetBundle.workspace?.createdAt || nowIso) : nowIso,
      updatedAt: nowIso
    };

    await this.saveWorkspace(userId, targetMonthKey, workspacePayload);

    const batch = this.db.batch();
    chunkItems(sourceBundle.owners).forEach((ownersChunk) => {
      ownersChunk.forEach((owner, index) => {
        const ownerId = String(owner.ownerId || owner.id || createBudgetId('owner')).trim();
        const ownerRef = this.getOwnersCollection(userId, targetMonthKey).doc(ownerId);
        batch.set(ownerRef, {
          ownerId,
          name: String(owner.name || '').trim(),
          order: Number.isFinite(Number(owner.order)) ? Number(owner.order) : index + 1,
          active: owner.active !== false,
          createdAt: owner.createdAt || nowIso,
          updatedAt: nowIso
        });
      });
    });

    chunkItems(sourceBundle.records).forEach((recordsChunk) => {
      recordsChunk.forEach((record, index) => {
        const recordId = String(record.recordId || record.id || createBudgetId('record')).trim();
        const recordRef = this.getRecordsCollection(userId, targetMonthKey).doc(recordId);
        batch.set(recordRef, {
          recordId,
          monthKey: targetMonthKey,
          ownerId: String(record.ownerId || '').trim(),
          type: String(record.type || 'expense').trim(),
          name: String(record.name || '').trim(),
          amount: Number(record.amount || 0),
          notes: String(record.notes || '').trim(),
          order: Number.isFinite(Number(record.order)) ? Number(record.order) : index + 1,
          createdAt: record.createdAt || nowIso,
          updatedAt: nowIso
        });
      });
    });

    await batch.commit();
    return {
      targetHasData,
      ownersCopied: sourceBundle.owners.length,
      recordsCopied: sourceBundle.records.length
    };
  }
}
