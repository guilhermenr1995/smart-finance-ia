import {
  computeBudgetSummary,
  getCurrentMonthKey,
  normalizeBudgetRecord,
  normalizeBudgetWorkspace,
  normalizeOwnerRecord,
  shiftMonthKey,
  sortBudgetRecords,
  sortOwners
} from '../features/family-budget/shared.js';

export class FamilyBudgetState {
  constructor() {
    const currentMonthKey = getCurrentMonthKey();

    this.user = null;
    this.monthKey = currentMonthKey;
    this.workspace = normalizeBudgetWorkspace({}, currentMonthKey);
    this.owners = [];
    this.records = [];
    this.activeRecordId = '';
    this.activeOwnerId = '';
    this.replicateTargetMonthKey = shiftMonthKey(currentMonthKey, 1);
    this.isBusy = false;
    this.statusMessage = {
      text: '',
      type: 'info'
    };
  }

  setUser(user) {
    this.user = user;
  }

  setMonthKey(monthKey) {
    this.monthKey = normalizeBudgetWorkspace({ monthKey }).monthKey;
    this.workspace = normalizeBudgetWorkspace(this.workspace, this.monthKey);
    this.replicateTargetMonthKey = shiftMonthKey(this.monthKey, 1);
  }

  setWorkspace(workspace, monthKey = this.monthKey) {
    this.workspace = normalizeBudgetWorkspace(workspace, monthKey);
    this.monthKey = this.workspace.monthKey;
    this.replicateTargetMonthKey = shiftMonthKey(this.monthKey, 1);
  }

  setOwners(owners) {
    this.owners = sortOwners((owners || []).map((owner, index) => normalizeOwnerRecord(owner, index + 1)));
  }

  setRecords(records) {
    this.records = sortBudgetRecords((records || []).map((record, index) => normalizeBudgetRecord(record, index + 1, this.monthKey)));
  }

  upsertOwner(owner) {
    const normalized = normalizeOwnerRecord(owner, this.owners.length + 1);
    const next = [...this.owners];
    const index = next.findIndex((item) => item.ownerId === normalized.ownerId);
    if (index >= 0) {
      next[index] = {
        ...next[index],
        ...normalized
      };
    } else {
      next.push(normalized);
    }

    this.setOwners(next);
  }

  removeOwner(ownerId) {
    const safeOwnerId = String(ownerId || '').trim();
    if (!safeOwnerId) {
      return;
    }

    this.setOwners(this.owners.filter((owner) => owner.ownerId !== safeOwnerId));
  }

  upsertRecord(record) {
    const normalized = normalizeBudgetRecord(record, this.records.length + 1, this.monthKey);
    const next = [...this.records];
    const index = next.findIndex((item) => item.recordId === normalized.recordId);
    if (index >= 0) {
      next[index] = {
        ...next[index],
        ...normalized
      };
    } else {
      next.push(normalized);
    }

    this.setRecords(next);
  }

  removeRecord(recordId) {
    const safeRecordId = String(recordId || '').trim();
    if (!safeRecordId) {
      return;
    }

    this.setRecords(this.records.filter((record) => record.recordId !== safeRecordId));
  }

  setStatus(text, type = 'info') {
    this.statusMessage = {
      text: String(text || '').trim(),
      type
    };
  }

  clearStatus() {
    this.setStatus('', 'info');
  }

  getSummary() {
    return computeBudgetSummary(this.owners, this.records);
  }
}
