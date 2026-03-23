import { parseDateFlexible, toInputDateValue } from './date-utils.js';

export const GOAL_SCOPE_ALL = 'all';
export const GOAL_SCOPE_CREDIT = 'Crédito';
export const GOAL_SCOPE_ACCOUNT = 'Conta';
export const GOAL_SCOPES = [GOAL_SCOPE_ALL, GOAL_SCOPE_CREDIT, GOAL_SCOPE_ACCOUNT];

function normalizeCategoryKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toSafeDate(value) {
  const parsed = parseDateFlexible(value);
  if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
}

export function getMonthKeyFromDate(value) {
  const date = toSafeDate(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function getMonthBounds(monthKey) {
  const raw = String(monthKey || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  const fallback = toSafeDate(new Date());

  const year = match ? Number.parseInt(match[1], 10) : fallback.getFullYear();
  const monthIndex = match ? Number.parseInt(match[2], 10) - 1 : fallback.getMonth();
  const startDate = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const endDate = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  const totalDays = endDate.getDate();

  return {
    monthKey: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`,
    startDate,
    endDate,
    totalDays,
    startDateInput: toInputDateValue(startDate),
    endDateInput: toInputDateValue(endDate),
    label: startDate.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric'
    })
  };
}

export function normalizeGoalScope(scope) {
  const raw = String(scope || '').trim();
  if (!raw) {
    return GOAL_SCOPE_ALL;
  }

  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (normalized === 'credito') {
    return GOAL_SCOPE_CREDIT;
  }

  if (normalized === 'conta' || normalized === 'debito') {
    return GOAL_SCOPE_ACCOUNT;
  }

  if (normalized === 'all' || normalized === 'tudo') {
    return GOAL_SCOPE_ALL;
  }

  return GOAL_SCOPES.includes(raw) ? raw : GOAL_SCOPE_ALL;
}

export function getGoalScopeLabel(scope) {
  const normalizedScope = normalizeGoalScope(scope);
  if (normalizedScope === GOAL_SCOPE_CREDIT) {
    return 'Crédito';
  }

  if (normalizedScope === GOAL_SCOPE_ACCOUNT) {
    return 'Conta';
  }

  return 'Tudo';
}

export function buildGoalDocId(monthKey, category, accountScope = GOAL_SCOPE_ALL) {
  const safeMonthKey = String(monthKey || '').trim();
  const safeCategory = normalizeCategoryKey(category).replace(/\s+/g, '-');
  const normalizedScope = normalizeGoalScope(accountScope);
  if (normalizedScope === GOAL_SCOPE_ALL) {
    return `${safeMonthKey}__${safeCategory || 'categoria'}`.slice(0, 160);
  }

  const safeScope = normalizeCategoryKey(normalizedScope).replace(/\s+/g, '-');
  return `${safeMonthKey}__${safeScope || 'all'}__${safeCategory || 'categoria'}`.slice(0, 160);
}

export function normalizeMonthlyGoalRecord(goal = {}) {
  const monthKey = getMonthKeyFromDate(goal.monthKey || goal.periodStart || goal.startDate);
  const monthBounds = getMonthBounds(monthKey);
  const category = String(goal.category || '').trim();
  const targetValue = Math.max(0, Number(goal.targetValue || goal.value || 0));
  const source = String(goal.source || 'manual').trim().toLowerCase() === 'auto' ? 'auto' : 'manual';
  const accountScope = normalizeGoalScope(goal.accountScope || goal.scope || goal.accountType);

  return {
    docId: String(goal.docId || buildGoalDocId(monthKey, category, accountScope)).trim(),
    monthKey,
    periodStart: String(goal.periodStart || monthBounds.startDateInput),
    periodEnd: String(goal.periodEnd || monthBounds.endDateInput),
    category,
    accountScope,
    targetValue: Number(targetValue.toFixed(2)),
    source,
    rationale: String(goal.rationale || '').trim(),
    active: goal.active !== false,
    createdAt: String(goal.createdAt || '').trim(),
    updatedAt: String(goal.updatedAt || '').trim()
  };
}

function getInclusiveOverlapDays(startA, endA, startB, endB) {
  const start = Math.max(startA.getTime(), startB.getTime());
  const end = Math.min(endA.getTime(), endB.getTime());
  if (start > end) {
    return 0;
  }

  return Math.floor((end - start) / 86400000) + 1;
}

export function computeGoalTargetForDateRange(goal, startDateInput, endDateInput) {
  if (!goal || goal.active === false) {
    return 0;
  }

  const targetValue = Math.max(0, Number(goal.targetValue || 0));
  if (targetValue <= 0) {
    return 0;
  }

  const periodStart = toSafeDate(goal.periodStart || `${goal.monthKey}-01`);
  const periodEnd = toSafeDate(goal.periodEnd || goal.periodStart);
  const filterStart = toSafeDate(startDateInput);
  const filterEnd = toSafeDate(endDateInput);

  const goalMonthDays =
    Math.floor((periodEnd.getTime() - periodStart.getTime()) / 86400000) + 1;
  if (goalMonthDays <= 0) {
    return 0;
  }

  const overlapDays = getInclusiveOverlapDays(filterStart, filterEnd, periodStart, periodEnd);
  if (overlapDays <= 0) {
    return 0;
  }

  return Number(((targetValue / goalMonthDays) * overlapDays).toFixed(2));
}

export function buildGoalTargetsByCategory(goals, startDateInput, endDateInput) {
  const totalsByCategory = {};
  (goals || []).forEach((goal) => {
    const category = String(goal?.category || '').trim();
    if (!category) {
      return;
    }

    const proratedTarget = computeGoalTargetForDateRange(goal, startDateInput, endDateInput);
    if (proratedTarget <= 0) {
      return;
    }

    totalsByCategory[category] = Number(((totalsByCategory[category] || 0) + proratedTarget).toFixed(2));
  });

  return totalsByCategory;
}

export function getGoalsForReferenceMonth(goals, monthKey, accountScope = GOAL_SCOPE_ALL) {
  const safeMonthKey = String(monthKey || '').trim();
  const normalizedScope = normalizeGoalScope(accountScope);
  return (goals || [])
    .filter(
      (goal) =>
        goal?.active !== false &&
        String(goal?.monthKey || '').trim() === safeMonthKey &&
        normalizeGoalScope(goal?.accountScope) === normalizedScope
    )
    .sort((left, right) => String(left.category || '').localeCompare(String(right.category || ''), 'pt-BR'));
}

export function getGoalByDocId(goals, docId) {
  const safeDocId = String(docId || '').trim();
  if (!safeDocId) {
    return null;
  }

  return (goals || []).find((goal) => String(goal?.docId || '').trim() === safeDocId) || null;
}
