const DEFAULT_ADMIN_EMAILS = ['guilhermenr1995@gmail.com'];
const CHART_WINDOW_DAYS = 21;
const DEFAULT_USERS_PAGE_SIZE = 10;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeSearchTerm(value) {
  return String(value || '').trim().toLowerCase();
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPercent(value, digits = 1) {
  return `${toNumber(value).toFixed(digits)}%`;
}

function formatInteger(value) {
  return Math.round(toNumber(value)).toLocaleString('pt-BR');
}

function formatDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '-';
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }

  return parsed.toLocaleString('pt-BR');
}

function parseIsoDate(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateKeyShort(dateKey) {
  const raw = String(dateKey || '').trim();
  if (!raw) {
    return '--';
  }

  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }

  return parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function getDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayDateKey() {
  return getDateKey(new Date());
}

function buildDateRangeEndingAt(endDateKey, days) {
  const parsedEnd = new Date(`${String(endDateKey || '').trim()}T00:00:00`);
  const endDate = Number.isNaN(parsedEnd.getTime()) ? new Date() : parsedEnd;
  const range = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(endDate);
    date.setDate(endDate.getDate() - offset);
    range.push(getDateKey(date));
  }

  return range;
}

function buildSeriesMap(items = []) {
  const map = new Map();
  if (!Array.isArray(items)) {
    return map;
  }

  items.forEach((item) => {
    const dateKey = String(item?.dateKey || '').trim();
    if (!dateKey) {
      return;
    }

    map.set(dateKey, Math.max(0, Math.round(toNumber(item?.count))));
  });

  return map;
}

function buildDailySeries({ seriesByKey = {}, days = CHART_WINDOW_DAYS } = {}) {
  const entries = Object.entries(seriesByKey);
  const maps = Object.fromEntries(entries.map(([key, items]) => [key, buildSeriesMap(items)]));

  const dateCandidates = entries.flatMap(([key]) => [...(maps[key]?.keys() || [])]);
  const endDateKey = dateCandidates.sort().at(-1) || getTodayDateKey();
  const range = buildDateRangeEndingAt(endDateKey, days);

  return range.map((dateKey) => {
    const point = { dateKey };
    entries.forEach(([key]) => {
      point[key] = maps[key]?.get(dateKey) || 0;
    });
    return point;
  });
}

function sumSeriesByKey(series, key) {
  return (Array.isArray(series) ? series : []).reduce((accumulator, item) => {
    return accumulator + Math.max(0, Math.round(toNumber(item?.[key])));
  }, 0);
}

function renderDailyMetricList(items = [], emptyMessage) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="text-sm font-bold text-zinc-600">${emptyMessage}</p>`;
  }

  return items
    .slice(-14)
    .reverse()
    .map(
      (item) => `
        <div class="border border-black/20 bg-zinc-50 p-2 flex items-center justify-between gap-2 rounded-sm">
          <p class="text-xs font-black uppercase">${item.dateKey}</p>
          <p class="text-sm font-black">${formatInteger(item.count || 0)} uso(s)</p>
        </div>
      `
    )
    .join('');
}

function renderDualDailyChart({
  series,
  leftKey,
  rightKey,
  leftLabel,
  rightLabel,
  leftClass,
  rightClass,
  emptyMessage
}) {
  const safeSeries = Array.isArray(series) ? series : [];
  const hasAnyUsage = safeSeries.some((item) => toNumber(item[leftKey]) > 0 || toNumber(item[rightKey]) > 0);

  if (!hasAnyUsage) {
    return `<p class="text-sm font-bold text-zinc-600">${emptyMessage}</p>`;
  }

  const maxValue = Math.max(
    ...safeSeries.map((item) => Math.max(toNumber(item[leftKey]), toNumber(item[rightKey]))),
    1
  );

  const leftTotal = sumSeriesByKey(safeSeries, leftKey);
  const rightTotal = sumSeriesByKey(safeSeries, rightKey);
  const combinedSeries = safeSeries.map((item) => ({
    dateKey: item.dateKey,
    total: toNumber(item[leftKey]) + toNumber(item[rightKey])
  }));
  const peakDay = [...combinedSeries].sort((left, right) => right.total - left.total)[0] || {
    dateKey: '-',
    total: 0
  };

  const bars = safeSeries
    .map((item, index) => {
      const leftValue = toNumber(item[leftKey]);
      const rightValue = toNumber(item[rightKey]);
      const leftHeight = Math.max(4, Math.round((leftValue / maxValue) * 100));
      const rightHeight = Math.max(4, Math.round((rightValue / maxValue) * 100));
      const labelInterval = safeSeries.length >= 18 ? 3 : 2;
      const showDateLabel = index === 0 || index === safeSeries.length - 1 || index % labelInterval === 0;

      return `
        <div class="admin-chart-column">
          <div class="admin-chart-bars-wrap">
            <div class="admin-chart-bar ${leftClass}" style="height:${leftHeight}%" title="${leftLabel}: ${formatInteger(leftValue)}"></div>
            <div class="admin-chart-bar ${rightClass}" style="height:${rightHeight}%" title="${rightLabel}: ${formatInteger(rightValue)}"></div>
          </div>
          <p class="admin-chart-date ${showDateLabel ? '' : 'admin-chart-date-muted'}">${showDateLabel ? formatDateKeyShort(item.dateKey) : '•'}</p>
        </div>
      `;
    })
    .join('');

  return `
    <div class="admin-chart-shell space-y-3">
      <div class="admin-chart-legend">
        <span><i class="admin-legend-dot ${leftClass}"></i>${leftLabel}</span>
        <span><i class="admin-legend-dot ${rightClass}"></i>${rightLabel}</span>
      </div>
      <div class="admin-chart-scroll">
        <div class="admin-chart-grid">${bars}</div>
      </div>
      <div class="admin-chart-summary-grid">
        <div class="admin-chart-summary-card">
          <p>Total ${leftLabel}</p>
          <strong>${formatInteger(leftTotal)}</strong>
        </div>
        <div class="admin-chart-summary-card">
          <p>Total ${rightLabel}</p>
          <strong>${formatInteger(rightTotal)}</strong>
        </div>
        <div class="admin-chart-summary-card">
          <p>Pico diário combinado</p>
          <strong>${formatDateKeyShort(peakDay.dateKey)} • ${formatInteger(peakDay.total)}</strong>
        </div>
      </div>
    </div>
  `;
}

function resolveAdminDashboardUrl(config) {
  const explicit = String(config?.admin?.dashboardProxyUrl || '').trim();
  if (explicit) {
    return explicit;
  }

  const consultantUrl = String(config?.ai?.consultantProxyUrl || '').trim();
  if (consultantUrl) {
    return consultantUrl.replace(/analyzespendinginsights/gi, 'getadmindashboard');
  }

  const categorizationUrl = String(config?.ai?.proxyUrl || '').trim();
  if (categorizationUrl) {
    return categorizationUrl.replace(/categorizetransactions/gi, 'getadmindashboard');
  }

  return '';
}

function resolveMaintenanceDedupUrl(config) {
  const explicit = String(config?.admin?.maintenanceProxyUrl || '').trim();
  if (explicit) {
    return explicit;
  }

  const dashboardUrl = resolveAdminDashboardUrl(config);
  if (dashboardUrl) {
    return dashboardUrl.replace(/getadmindashboard/gi, 'maintenancededuplicatetransactions');
  }

  const consultantUrl = String(config?.ai?.consultantProxyUrl || '').trim();
  if (consultantUrl) {
    return consultantUrl.replace(/analyzespendinginsights/gi, 'maintenancededuplicatetransactions');
  }

  const categorizationUrl = String(config?.ai?.proxyUrl || '').trim();
  if (categorizationUrl) {
    return categorizationUrl.replace(/categorizetransactions/gi, 'maintenancededuplicatetransactions');
  }

  return '';
}

function resolveMaintenanceResetUrl(config) {
  const explicit = String(config?.admin?.maintenanceResetProxyUrl || '').trim();
  if (explicit) {
    return explicit;
  }

  const maintenanceUrl = String(config?.admin?.maintenanceProxyUrl || '').trim();
  if (maintenanceUrl) {
    return maintenanceUrl.replace(/maintenancededuplicatetransactions/gi, 'maintenanceresetuserjourney');
  }

  const dashboardUrl = resolveAdminDashboardUrl(config);
  if (dashboardUrl) {
    return dashboardUrl.replace(/getadmindashboard/gi, 'maintenanceresetuserjourney');
  }

  const consultantUrl = String(config?.ai?.consultantProxyUrl || '').trim();
  if (consultantUrl) {
    return consultantUrl.replace(/analyzespendinginsights/gi, 'maintenanceresetuserjourney');
  }

  const categorizationUrl = String(config?.ai?.proxyUrl || '').trim();
  if (categorizationUrl) {
    return categorizationUrl.replace(/categorizetransactions/gi, 'maintenanceresetuserjourney');
  }

  return '';
}

export {
  CHART_WINDOW_DAYS,
  DEFAULT_ADMIN_EMAILS,
  DEFAULT_USERS_PAGE_SIZE,
  buildDailySeries,
  buildDateRangeEndingAt,
  buildSeriesMap,
  formatDateKeyShort,
  formatDateTime,
  formatInteger,
  formatPercent,
  getDateKey,
  getTodayDateKey,
  normalizeEmail,
  normalizeSearchTerm,
  parseIsoDate,
  renderDailyMetricList,
  renderDualDailyChart,
  resolveAdminDashboardUrl,
  resolveMaintenanceDedupUrl,
  resolveMaintenanceResetUrl,
  sumSeriesByKey,
  toNumber
};
