export function getDefaultCycleRange(referenceDate = new Date()) {
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 3, 0, 0, 0, 0);
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 2, 23, 59, 59, 999);

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

  if (value.includes('-')) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  if (value.includes('/')) {
    const [day, month, year] = value.split('/').map(Number);
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
  const shifted = new Date(date.getFullYear(), date.getMonth() + deltaMonths, date.getDate(), 12, 0, 0, 0);
  return toInputDateValue(shifted);
}
