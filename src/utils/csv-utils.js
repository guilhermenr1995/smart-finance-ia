export function splitCsvLines(csvText) {
  return String(csvText)
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
}

function countDelimiterOutsideQuotes(line, delimiter) {
  let inQuotes = false;
  let count = 0;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === delimiter) {
      count += 1;
    }
  }

  return count;
}

export function detectCsvDelimiter(lines = []) {
  const sampleLines = (Array.isArray(lines) ? lines : [])
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .slice(0, 6);

  const candidates = [',', ';', '\t', '|'];
  let selectedDelimiter = ',';
  let selectedScore = -1;

  candidates.forEach((candidate) => {
    const score = sampleLines.reduce((accumulator, line) => {
      return accumulator + countDelimiterOutsideQuotes(line, candidate);
    }, 0);

    if (score > selectedScore) {
      selectedScore = score;
      selectedDelimiter = candidate;
    }
  });

  return selectedScore > 0 ? selectedDelimiter : ',';
}

export function parseCsvLine(line, delimiter = ',') {
  const cells = [];
  let current = '';
  let inQuotes = false;
  const normalizedDelimiter = typeof delimiter === 'string' && delimiter.length > 0 ? delimiter[0] : ',';

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === normalizedDelimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

export function normalizeCsvHeader(headerLine) {
  return headerLine
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function parseLocaleNumber(rawValue) {
  if (typeof rawValue === 'number') {
    return rawValue;
  }

  const value = String(rawValue || '').trim();
  if (!value) {
    return Number.NaN;
  }

  let normalizedValue = value;
  let isNegative = false;

  if (/^\(.*\)$/.test(normalizedValue)) {
    isNegative = true;
    normalizedValue = normalizedValue.slice(1, -1);
  }

  if (/^-/.test(normalizedValue)) {
    isNegative = true;
  }
  if (/-$/.test(normalizedValue)) {
    isNegative = true;
  }

  normalizedValue = normalizedValue.replace(/^-/, '').replace(/-$/, '').trim();

  const sanitized = normalizedValue
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');

  const parsed = Number.parseFloat(sanitized);
  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }

  return isNegative ? -Math.abs(parsed) : parsed;
}
