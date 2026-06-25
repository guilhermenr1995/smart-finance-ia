import { parseDateFlexible } from '../../utils/date-utils.js';
import { escapeHtml, formatCurrencyBRL } from '../../utils/format-utils.js';

export const FAMILY_BUDGET_COLLECTION = 'orcamentos_mensais';
export const FAMILY_BUDGET_OWNER_COLLECTION = 'donos';
export const FAMILY_BUDGET_RECORD_COLLECTION = 'registros';

export const FAMILY_BUDGET_TYPES = {
  income: 'income',
  expense: 'expense',
  reserve: 'reserve'
};

export const FAMILY_BUDGET_TYPE_LABELS = {
  income: 'Receita',
  expense: 'Despesa',
  reserve: 'Caixinha'
};

export function getCurrentMonthKey(referenceDate = new Date()) {
  const date = referenceDate instanceof Date ? referenceDate : parseDateFlexible(referenceDate);
  const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const year = String(safeDate.getFullYear()).padStart(4, '0');
  const month = String(safeDate.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function normalizeMonthKey(value) {
  const raw = String(value || '').trim();
  const isoMonth = raw.match(/^(\d{4})-(\d{2})$/);
  if (isoMonth) {
    return `${isoMonth[1]}-${isoMonth[2]}`;
  }

  const parsed = parseDateFlexible(raw);
  if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
    return getCurrentMonthKey();
  }

  return getCurrentMonthKey(parsed);
}

export function getMonthLabel(monthKey) {
  const safeMonthKey = normalizeMonthKey(monthKey);
  const monthDate = new Date(`${safeMonthKey}-01T12:00:00`);
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric'
  }).format(monthDate);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function shiftMonthKey(monthKey, deltaMonths = 0) {
  const safeMonthKey = normalizeMonthKey(monthKey);
  const parsed = parseDateFlexible(`${safeMonthKey}-01`);
  if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
    return safeMonthKey;
  }

  const months = Number.parseInt(deltaMonths, 10);
  if (!Number.isFinite(months) || months === 0) {
    return safeMonthKey;
  }

  parsed.setMonth(parsed.getMonth() + months);
  return getCurrentMonthKey(parsed);
}

export function createBudgetId(prefix = 'budget') {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
}

export function normalizeBudgetType(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized === FAMILY_BUDGET_TYPES.income) {
    return FAMILY_BUDGET_TYPES.income;
  }
  if (normalized === FAMILY_BUDGET_TYPES.reserve || normalized === 'caixinha') {
    return FAMILY_BUDGET_TYPES.reserve;
  }
  return FAMILY_BUDGET_TYPES.expense;
}

export function normalizeOwnerRecord(owner = {}, fallbackOrder = 0) {
  const ownerId = String(owner.ownerId || owner.id || '').trim() || createBudgetId('owner');
  const name = String(owner.name || '').trim();
  const order = Number.isFinite(Number(owner.order)) ? Number(owner.order) : fallbackOrder;
  return {
    ownerId,
    name,
    order,
    active: owner.active !== false,
    createdAt: String(owner.createdAt || '').trim(),
    updatedAt: String(owner.updatedAt || '').trim()
  };
}

export function normalizeBudgetWorkspace(workspace = {}, monthKey = '') {
  const normalizedMonthKey = normalizeMonthKey(workspace.monthKey || monthKey);
  return {
    monthKey: normalizedMonthKey,
    label: String(workspace.label || getMonthLabel(normalizedMonthKey)).trim(),
    sourceMonthKey: String(workspace.sourceMonthKey || '').trim(),
    status: String(workspace.status || 'active').trim() || 'active',
    notes: String(workspace.notes || '').trim(),
    createdAt: String(workspace.createdAt || '').trim(),
    updatedAt: String(workspace.updatedAt || '').trim()
  };
}

export function normalizeBudgetRecord(record = {}, fallbackOrder = 0, monthKey = '') {
  const recordId = String(record.recordId || record.id || '').trim() || createBudgetId('record');
  const normalizedMonthKey = normalizeMonthKey(record.monthKey || monthKey);
  const amountValue = Math.abs(Number(record.amount || 0));
  return {
    recordId,
    monthKey: normalizedMonthKey,
    ownerId: String(record.ownerId || '').trim(),
    type: normalizeBudgetType(record.type),
    name: String(record.name || '').trim(),
    amount: Number.isFinite(amountValue) ? Number(amountValue.toFixed(2)) : 0,
    notes: String(record.notes || '').trim(),
    order: Number.isFinite(Number(record.order)) ? Number(record.order) : fallbackOrder,
    createdAt: String(record.createdAt || '').trim(),
    updatedAt: String(record.updatedAt || '').trim()
  };
}

function createOwnerSummary(owner = {}) {
  return {
    ownerId: owner.ownerId,
    name: owner.name,
    order: Number(owner.order || 0),
    active: owner.active !== false,
    grossIncome: 0,
    expenseTotal: 0,
    reserveTotal: 0,
    netAvailable: 0,
    projectedSavings: 0,
    projectedDeficit: 0,
    records: []
  };
}

export function sortOwners(owners = []) {
  return [...owners].sort((left, right) => {
    const orderDiff = Number(left.order || 0) - Number(right.order || 0);
    if (orderDiff !== 0) {
      return orderDiff;
    }
    return String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR');
  });
}

export function sortBudgetRecords(records = []) {
  return [...records].sort((left, right) => {
    const orderDiff = Number(left.order || 0) - Number(right.order || 0);
    if (orderDiff !== 0) {
      return orderDiff;
    }

    const dateDiff = String(right.updatedAt || right.createdAt || '').localeCompare(String(left.updatedAt || left.createdAt || ''));
    if (dateDiff !== 0) {
      return dateDiff;
    }

    return String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR');
  });
}

function normalizeBudgetSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function filterBudgetRecords(records = [], { filterType = 'all', searchTerm = '', ownerNamesById = {} } = {}) {
  const safeRecords = Array.isArray(records) ? records : [];
  const normalizedFilterType = String(filterType || 'all').trim().toLowerCase();
  const normalizedSearchTerm = normalizeBudgetSearchText(searchTerm);
  const ownerLookup = ownerNamesById && typeof ownerNamesById === 'object' ? ownerNamesById : {};

  return safeRecords.filter((record) => {
    if (normalizedFilterType === 'income' || normalizedFilterType === 'expense' || normalizedFilterType === 'reserve') {
      if (String(record?.type || '').trim() !== normalizedFilterType) {
        return false;
      }
    }

    if (!normalizedSearchTerm) {
      return true;
    }

    const ownerName = ownerLookup[record?.ownerId] || '';
    const searchableFields = [
      record?.name,
      record?.notes,
      record?.type,
      getBudgetTypeLabel(record?.type),
      ownerName,
      record?.amount
    ];

    return searchableFields.some((field) => normalizeBudgetSearchText(field).includes(normalizedSearchTerm));
  });
}

export function computeBudgetSummary(owners = [], records = []) {
  const ownerSummariesById = new Map();
  const ownerSummaries = sortOwners(owners)
    .filter((owner) => owner && owner.active !== false)
    .map((owner) => {
      const summary = createOwnerSummary(owner);
      ownerSummariesById.set(summary.ownerId, summary);
      return summary;
    });

  const orphanSummary = createOwnerSummary({
    ownerId: '__orphan__',
    name: 'Sem dono',
    order: Number.MAX_SAFE_INTEGER,
    active: true
  });

  let familyGrossIncome = 0;
  let familyExpenseTotal = 0;
  let familyReserveTotal = 0;

  sortBudgetRecords(records).forEach((record) => {
    const bucket = ownerSummariesById.get(record.ownerId) || orphanSummary;
    const amount = Number(record.amount || 0);
    bucket.records.push(record);

    if (record.type === FAMILY_BUDGET_TYPES.income) {
      bucket.grossIncome += amount;
      familyGrossIncome += amount;
      return;
    }

    if (record.type === FAMILY_BUDGET_TYPES.reserve) {
      bucket.reserveTotal += amount;
      familyReserveTotal += amount;
      return;
    }

    bucket.expenseTotal += amount;
    familyExpenseTotal += amount;
  });

  [...ownerSummaries, orphanSummary].forEach((bucket) => {
    bucket.netAvailable = Number((bucket.grossIncome - bucket.expenseTotal).toFixed(2));
    bucket.projectedSavings = Math.max(bucket.netAvailable, 0);
    bucket.projectedDeficit = Math.max(-bucket.netAvailable, 0);
    bucket.records = sortBudgetRecords(bucket.records);
  });

  const ownerCards = [...ownerSummaries];
  if (orphanSummary.records.length > 0) {
    ownerCards.push(orphanSummary);
  }

  const familyNetAvailable = Number((familyGrossIncome - familyExpenseTotal).toFixed(2));

  return {
    ownerSummaries: ownerCards,
    family: {
      grossIncome: Number(familyGrossIncome.toFixed(2)),
      expenseTotal: Number(familyExpenseTotal.toFixed(2)),
      reserveTotal: Number(familyReserveTotal.toFixed(2)),
      netAvailable: familyNetAvailable,
      projectedSavings: Math.max(familyNetAvailable, 0),
      projectedDeficit: Math.max(-familyNetAvailable, 0),
      recordCount: records.length
    }
  };
}

export function escapeBudgetHtml(value) {
  return escapeHtml(value);
}

export function formatBudgetCurrency(value) {
  return formatCurrencyBRL(Number(value || 0));
}

export function getBudgetTypeLabel(type) {
  return FAMILY_BUDGET_TYPE_LABELS[normalizeBudgetType(type)] || FAMILY_BUDGET_TYPE_LABELS.expense;
}

export function getBudgetTypeTone(type) {
  const normalized = normalizeBudgetType(type);
  if (normalized === FAMILY_BUDGET_TYPES.income) {
    return 'bg-emerald-100 text-emerald-900 border-emerald-400';
  }
  if (normalized === FAMILY_BUDGET_TYPES.reserve) {
    return 'bg-yellow-100 text-zinc-900 border-yellow-400';
  }

  return 'bg-rose-100 text-rose-900 border-rose-400';
}
