export function getDefaultCycleRange(referenceDate = new Date()) {
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate(), 23, 59, 59, 999);

  return {
    startDate: toInputDateValue(start),
    endDate: toInputDateValue(end)
  };
}

export function toInputDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateFlexible(rawValue) {
  if (!rawValue) {
    return new Date();
  }

  if (rawValue instanceof Date) {
    return rawValue;
  }

  const value = String(rawValue).trim();
  if (!value) {
    return new Date();
  }

  const yearMonthLike = value.match(/^(\d{4})-(\d{1,2})$/);
  if (yearMonthLike) {
    const year = Number.parseInt(yearMonthLike[1], 10);
    const month = Number.parseInt(yearMonthLike[2], 10);
    return new Date(year, month - 1, 1, 12, 0, 0, 0);
  }

  const isoLike = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoLike) {
    const year = Number.parseInt(isoLike[1], 10);
    const month = Number.parseInt(isoLike[2], 10);
    const day = Number.parseInt(isoLike[3], 10);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  const brLike = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+.*)?$/);
  if (brLike) {
    const day = Number.parseInt(brLike[1], 10);
    const month = Number.parseInt(brLike[2], 10);
    const rawYear = Number.parseInt(brLike[3], 10);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  return new Date(value);
}

export function toBrDate(rawValue) {
  const date = parseDateFlexible(rawValue);
  return date.toLocaleDateString('pt-BR');
}

export function buildCycleBoundaries(startInput, endInput) {
  const startCandidate = startInput ? new Date(`${startInput}T00:00:00`) : new Date(0);
  const endCandidate = endInput ? new Date(`${endInput}T23:59:59`) : new Date(8640000000000000);

  const cycleStart = Number.isNaN(startCandidate.getTime()) ? new Date(0) : startCandidate;
  const cycleEnd = Number.isNaN(endCandidate.getTime()) ? new Date(8640000000000000) : endCandidate;

  return {
    cycleStart,
    cycleEnd
  };
}

export function shiftInputDateByMonths(inputDate, deltaMonths) {
  const date = parseDateFlexible(inputDate);
  const targetMonthStart = new Date(date.getFullYear(), date.getMonth() + deltaMonths, 1, 12, 0, 0, 0);
  const targetMonthLastDay = new Date(
    targetMonthStart.getFullYear(),
    targetMonthStart.getMonth() + 1,
    0,
    12,
    0,
    0,
    0
  ).getDate();
  const safeDay = Math.min(Math.max(date.getDate(), 1), targetMonthLastDay);
  const shifted = new Date(
    targetMonthStart.getFullYear(),
    targetMonthStart.getMonth(),
    safeDay,
    12,
    0,
    0,
    0
  );
  return toInputDateValue(shifted);
}

function getMonthLastDay(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function parseInputDateParts(inputDate) {
  const safe = String(inputDate || '').trim();
  const match = safe.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!year || !month || !day) {
    return null;
  }

  return { year, month, day };
}

export function buildPreviousEquivalentPeriod(startDateInput, endDateInput) {
  const startParts = parseInputDateParts(startDateInput);
  const endParts = parseInputDateParts(endDateInput);

  if (!startParts || !endParts) {
    return {
      startDate: shiftInputDateByMonths(startDateInput, -1),
      endDate: shiftInputDateByMonths(endDateInput, -1)
    };
  }

  const isSameMonth = startParts.year === endParts.year && startParts.month === endParts.month;
  const isMonthStart = startParts.day === 1;
  const currentMonthLastDay = getMonthLastDay(endParts.year, endParts.month - 1);
  const isMonthEnd = endParts.day === currentMonthLastDay;

  if (isSameMonth && isMonthStart && isMonthEnd) {
    const previousMonthDate = new Date(startParts.year, startParts.month - 2, 1, 12, 0, 0, 0);
    const previousStart = new Date(
      previousMonthDate.getFullYear(),
      previousMonthDate.getMonth(),
      1,
      12,
      0,
      0,
      0
    );
    const previousEnd = new Date(
      previousMonthDate.getFullYear(),
      previousMonthDate.getMonth() + 1,
      0,
      12,
      0,
      0,
      0
    );

    return {
      startDate: toInputDateValue(previousStart),
      endDate: toInputDateValue(previousEnd)
    };
  }

  return {
    startDate: shiftInputDateByMonths(startDateInput, -1),
    endDate: shiftInputDateByMonths(endDateInput, -1)
  };
}
