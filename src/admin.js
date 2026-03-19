import { loadAppConfig } from './config/app-config.js';

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

class AdminDashboardApp {
  constructor(config) {
    this.config = config;
    this.firebase = window.firebase;
    this.auth = null;
    this.allowedEmails = new Set(
      [...DEFAULT_ADMIN_EMAILS, ...(Array.isArray(config?.admin?.allowedEmails) ? config.admin.allowedEmails : [])].map(
        normalizeEmail
      )
    );

    this.authScreen = document.getElementById('admin-auth-screen');
    this.appScreen = document.getElementById('admin-app-screen');
    this.authMessage = document.getElementById('admin-auth-message');
    this.userEmailLabel = document.getElementById('admin-user-email');
    this.loadingPanel = document.getElementById('admin-loading');
    this.accessDeniedPanel = document.getElementById('admin-access-denied');
    this.dashboardContent = document.getElementById('admin-dashboard-content');

    this.generatedAtLabel = document.getElementById('admin-generated-at');
    this.summaryCards = document.getElementById('admin-summary-cards');
    this.kpiStrip = document.getElementById('admin-kpi-strip');
    this.aiUsageChart = document.getElementById('admin-ai-usage-chart');
    this.importChart = document.getElementById('admin-import-chart');
    this.healthBars = document.getElementById('admin-health-bars');
    this.operationalInsights = document.getElementById('admin-operational-insights');
    this.opportunityUsers = document.getElementById('admin-opportunity-users');

    this.aiSyncDaily = document.getElementById('admin-ai-sync-daily');
    this.aiConsultantDaily = document.getElementById('admin-ai-consultant-daily');
    this.topUsers = document.getElementById('admin-top-users');
    this.usersCount = document.getElementById('admin-users-count');
    this.usersTable = document.getElementById('admin-users-table');
    this.usersSearchInput = document.getElementById('admin-users-search');
    this.usersSearchClearButton = document.getElementById('admin-users-search-clear');
    this.usersPageSizeSelect = document.getElementById('admin-users-page-size');
    this.usersPaginationPanel = document.getElementById('admin-users-pagination');
    this.usersPaginationRange = document.getElementById('admin-users-pagination-range');
    this.usersPaginationStatus = document.getElementById('admin-users-pagination-status');
    this.usersPaginationPrevButton = document.getElementById('admin-users-pagination-prev');
    this.usersPaginationNextButton = document.getElementById('admin-users-pagination-next');

    this.googleLoginButton = document.getElementById('admin-btn-google-login');
    this.refreshButton = document.getElementById('admin-btn-refresh');
    this.logoutButton = document.getElementById('admin-btn-logout');

    this.usersState = {
      allUsers: [],
      filteredUsers: [],
      query: '',
      page: 1,
      pageSize: DEFAULT_USERS_PAGE_SIZE,
      totalPages: 1
    };

    if (this.usersPageSizeSelect) {
      this.usersPageSizeSelect.value = String(DEFAULT_USERS_PAGE_SIZE);
    }
  }

  async init() {
    if (!this.firebase || !this.config.firebase?.apiKey) {
      this.showAuthMessage('Configuração Firebase ausente no runtime-config.js.', 'error');
      this.googleLoginButton.disabled = true;
      return;
    }

    if (!this.firebase.apps.length) {
      this.firebase.initializeApp(this.config.firebase);
    }

    this.auth = this.firebase.auth();
    this.bindEvents();
    this.auth.onAuthStateChanged((user) => {
      this.handleAuthState(user);
    });
  }

  bindEvents() {
    this.googleLoginButton.addEventListener('click', async () => {
      this.googleLoginButton.disabled = true;
      this.showAuthMessage('Abrindo login Google...', 'info');
      try {
        const provider = new this.firebase.auth.GoogleAuthProvider();
        await this.auth.signInWithPopup(provider);
      } catch (error) {
        this.showAuthMessage(error?.message || 'Falha ao autenticar com Google.', 'error');
      } finally {
        this.googleLoginButton.disabled = false;
      }
    });

    this.logoutButton.addEventListener('click', async () => {
      await this.auth.signOut();
    });

    this.refreshButton.addEventListener('click', async () => {
      const user = this.auth.currentUser;
      if (!user) {
        return;
      }
      await this.loadAdminDashboard(user);
    });

    this.usersSearchInput?.addEventListener('input', () => {
      this.usersState.query = this.usersSearchInput.value;
      this.usersState.page = 1;
      this.renderUsersSection();
    });

    this.usersSearchClearButton?.addEventListener('click', () => {
      if (this.usersSearchInput) {
        this.usersSearchInput.value = '';
      }
      this.usersState.query = '';
      this.usersState.page = 1;
      this.renderUsersSection();
    });

    this.usersPageSizeSelect?.addEventListener('change', () => {
      const selectedPageSize = Number(this.usersPageSizeSelect.value);
      if (!Number.isFinite(selectedPageSize) || selectedPageSize <= 0) {
        return;
      }

      this.usersState.pageSize = selectedPageSize;
      this.usersState.page = 1;
      this.renderUsersSection();
    });

    this.usersPaginationPrevButton?.addEventListener('click', () => {
      if (this.usersState.page <= 1) {
        return;
      }

      this.usersState.page -= 1;
      this.renderUsersSection();
    });

    this.usersPaginationNextButton?.addEventListener('click', () => {
      if (this.usersState.page >= this.usersState.totalPages) {
        return;
      }

      this.usersState.page += 1;
      this.renderUsersSection();
    });
  }

  isAdminUser(user) {
    return this.allowedEmails.has(normalizeEmail(user?.email));
  }

  showAuthMessage(message, type = 'info') {
    this.authMessage.classList.remove('hidden');
    this.authMessage.dataset.type = type;
    this.authMessage.innerText = message;
  }

  clearAuthMessage() {
    this.authMessage.innerText = '';
    this.authMessage.dataset.type = '';
    this.authMessage.classList.add('hidden');
  }

  async handleAuthState(user) {
    if (!user) {
      this.authScreen.classList.remove('hidden');
      this.appScreen.classList.add('hidden');
      this.clearAuthMessage();
      return;
    }

    this.authScreen.classList.add('hidden');
    this.appScreen.classList.remove('hidden');
    this.userEmailLabel.innerText = `Logado como: ${user.email || '-'}`;

    if (!this.isAdminUser(user)) {
      this.accessDeniedPanel.classList.remove('hidden');
      this.loadingPanel.classList.add('hidden');
      this.dashboardContent.classList.add('hidden');
      return;
    }

    this.accessDeniedPanel.classList.add('hidden');
    await this.loadAdminDashboard(user);
  }

  async loadAdminDashboard(user) {
    this.loadingPanel.classList.remove('hidden');
    this.dashboardContent.classList.add('hidden');

    try {
      const endpoint = resolveAdminDashboardUrl(this.config);
      if (!endpoint) {
        throw new Error(
          'Configure SMART_FINANCE_CONFIG.admin.dashboardProxyUrl (ou ai.consultantProxyUrl/proxyUrl) para o painel gerencial.'
        );
      }

      const token = await user.getIdToken();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          appId: this.config.appId
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || 'Falha ao carregar painel gerencial.');
      }

      this.renderDashboard(payload);
    } catch (error) {
      const errorMessage = `<p class="text-sm font-black text-red-700">${error?.message || 'Erro ao carregar painel.'}</p>`;

      this.summaryCards.innerHTML = errorMessage;
      this.kpiStrip.innerHTML = '';
      this.generatedAtLabel.innerText = '';
      this.aiUsageChart.innerHTML = '';
      this.importChart.innerHTML = '';
      this.healthBars.innerHTML = '';
      this.operationalInsights.innerHTML = '';
      this.opportunityUsers.innerHTML = '';
      this.aiSyncDaily.innerHTML = '';
      this.aiConsultantDaily.innerHTML = '';
      this.topUsers.innerHTML = '';
      this.usersTable.innerHTML = '';
      this.usersCount.innerText = '0 usuários';
      this.usersState.allUsers = [];
      this.usersState.filteredUsers = [];
      this.usersState.totalPages = 1;
      if (this.usersPaginationPanel) {
        this.usersPaginationPanel.classList.add('hidden');
      }
    } finally {
      this.loadingPanel.classList.add('hidden');
      this.dashboardContent.classList.remove('hidden');
    }
  }

  renderDashboard(payload) {
    const totals = payload?.totals || {};
    const highlights = payload?.highlights || {};
    const users = Array.isArray(payload?.users) ? payload.users : [];
    const dailyUsage = payload?.dailyUsage || {};

    const aiSyncDaily = Array.isArray(dailyUsage.aiCategorizationRunsByDay)
      ? dailyUsage.aiCategorizationRunsByDay
      : [];
    const aiConsultantDaily = Array.isArray(dailyUsage.aiConsultantRunsByDay)
      ? dailyUsage.aiConsultantRunsByDay
      : [];
    const importOperationsDaily = Array.isArray(dailyUsage.importOperationsByDay)
      ? dailyUsage.importOperationsByDay
      : [];
    const importedTransactionsDaily = Array.isArray(dailyUsage.importedTransactionsByDay)
      ? dailyUsage.importedTransactionsByDay
      : [];
    const manualTransactionsDaily = Array.isArray(dailyUsage.manualTransactionsByDay)
      ? dailyUsage.manualTransactionsByDay
      : [];

    const totalUsers = toNumber(totals.users);
    const totalTransactions = toNumber(totals.transactions);
    const totalImported = toNumber(totals.importedTransactions);
    const totalManual = toNumber(totals.manualTransactions);
    const totalPending = toNumber(totals.pendingCategorization);
    const totalAiRuns = toNumber(totals.aiCategorizationRuns) + toNumber(totals.aiConsultantRuns);
    const active30d = toNumber(totals.activeUsers30d);
    const active7d = toNumber(totals.activeUsers7d);
    const acceptedRate = toNumber(totals.automationAcceptedRate);
    const overrideRate = toNumber(totals.automationOverrideRate);

    const activeRate30d = totalUsers > 0 ? (active30d / totalUsers) * 100 : 0;
    const importedShare = totalTransactions > 0 ? (totalImported / totalTransactions) * 100 : 0;
    const pendingShare = totalTransactions > 0 ? (totalPending / totalTransactions) * 100 : 0;
    const aiRunsPerActiveUser = active30d > 0 ? totalAiRuns / active30d : 0;

    const cards = [
      {
        label: 'Usuários cadastrados',
        value: formatInteger(totalUsers),
        helper: `Ativos 30d: ${formatInteger(active30d)} (${formatPercent(activeRate30d)})`
      },
      {
        label: 'Transações totais',
        value: formatInteger(totalTransactions),
        helper: `Importadas: ${formatInteger(totalImported)} • Manuais: ${formatInteger(totalManual)}`
      },
      {
        label: 'Uso IA acumulado',
        value: formatInteger(totalAiRuns),
        helper: `Sync IA: ${formatInteger(totals.aiCategorizationRuns)} • Consultor: ${formatInteger(
          totals.aiConsultantRuns
        )}`
      },
      {
        label: 'Aderência da automação',
        value: formatPercent(acceptedRate),
        helper: `Revisão manual: ${formatPercent(overrideRate)}`
      },
      {
        label: 'Pendências de categoria',
        value: formatInteger(totalPending),
        helper: `${formatPercent(pendingShare)} da base ativa`
      },
      {
        label: 'Usuários ativos 7 dias',
        value: formatInteger(active7d),
        helper: `Inativos 30d: ${formatInteger(Math.max(totalUsers - active30d, 0))}`
      },
      {
        label: 'Média transações/usuário',
        value: toNumber(totals.averageTransactionsPerUser).toFixed(1),
        helper: `Sem transações: ${formatInteger(highlights.usersWithNoTransactions || 0)}`
      },
      {
        label: 'Última atualização',
        value: formatDateTime(payload.generatedAt),
        helper: `App: ${payload.appId || '-'}`
      }
    ];

    this.summaryCards.innerHTML = cards
      .map(
        (card) => `
          <article class="admin-metric-card bg-zinc-50 border-2 border-black p-3">
            <p class="admin-metric-label">${card.label}</p>
            <p class="admin-metric-value">${card.value}</p>
            <p class="admin-metric-helper">${card.helper}</p>
          </article>
        `
      )
      .join('');

    const kpis = [
      {
        label: 'Participação de importação',
        value: formatPercent(importedShare),
        helper: 'Quanto da base veio da importação'
      },
      {
        label: 'Chamadas IA por usuário ativo (30d)',
        value: aiRunsPerActiveUser.toFixed(1),
        helper: 'Pressão operacional de IA por usuário engajado'
      },
      {
        label: 'Operações de importação (21d)',
        value: formatInteger(sumSeriesByKey(buildDailySeries({ seriesByKey: { importOps: importOperationsDaily } }), 'importOps')),
        helper: 'Volume recente de ingestão de dados'
      }
    ];

    this.kpiStrip.innerHTML = kpis
      .map(
        (kpi) => `
          <article class="admin-kpi-chip">
            <p>${kpi.label}</p>
            <strong>${kpi.value}</strong>
            <small>${kpi.helper}</small>
          </article>
        `
      )
      .join('');

    this.generatedAtLabel.innerText = `Atualizado em ${formatDateTime(payload.generatedAt)}`;

    const aiSeries = buildDailySeries({
      seriesByKey: {
        sync: aiSyncDaily,
        consultant: aiConsultantDaily
      }
    });

    this.aiUsageChart.innerHTML = renderDualDailyChart({
      series: aiSeries,
      leftKey: 'sync',
      rightKey: 'consultant',
      leftLabel: 'Sync IA',
      rightLabel: 'Consultor IA',
      leftClass: 'admin-bar-yellow',
      rightClass: 'admin-bar-indigo',
      emptyMessage: 'Sem uso de IA nos últimos dias.'
    });

    const importSeries = buildDailySeries({
      seriesByKey: {
        imported: importedTransactionsDaily,
        manual: manualTransactionsDaily
      }
    });

    this.importChart.innerHTML = renderDualDailyChart({
      series: importSeries,
      leftKey: 'imported',
      rightKey: 'manual',
      leftLabel: 'Importadas',
      rightLabel: 'Manuais',
      leftClass: 'admin-bar-emerald',
      rightClass: 'admin-bar-zinc',
      emptyMessage: 'Sem movimentação de importação/manual no período recente.'
    });

    const healthRows = [
      {
        label: 'Aderência da automação',
        value: acceptedRate,
        helper: `${formatInteger(totals.autoAcceptedTransactions)} transações aceitas automaticamente`,
        className: 'admin-health-fill-emerald'
      },
      {
        label: 'Revisão manual pós-automação',
        value: overrideRate,
        helper: `${formatInteger(totals.autoOverriddenTransactions)} transações revisadas pelo usuário`,
        className: 'admin-health-fill-rose'
      },
      {
        label: 'Pendência de categoria na base',
        value: pendingShare,
        helper: `${formatInteger(totalPending)} transações aguardando categorização`,
        className: 'admin-health-fill-amber'
      }
    ];

    this.healthBars.innerHTML = healthRows
      .map(
        (row) => `
          <div class="admin-health-row">
            <div class="flex items-end justify-between gap-2">
              <p class="admin-health-label">${row.label}</p>
              <p class="admin-health-value">${formatPercent(row.value)}</p>
            </div>
            <div class="admin-health-track">
              <div class="admin-health-fill ${row.className}" style="width:${Math.max(0, Math.min(row.value, 100))}%"></div>
            </div>
            <p class="admin-health-helper">${row.helper}</p>
          </div>
        `
      )
      .join('');

    const operationalInsights = [
      `Usuários com pendências de categoria: ${formatInteger(highlights.usersWithPendingCategorization || 0)}.`,
      `Base importada representa ${formatPercent(importedShare)} das transações totais.`,
      `Taxa de usuários ativos (30 dias): ${formatPercent(activeRate30d)}.`
    ];

    this.operationalInsights.innerHTML = operationalInsights
      .map((text) => `<p class="admin-insight-line">${text}</p>`)
      .join('');

    this.aiSyncDaily.innerHTML = renderDailyMetricList(aiSyncDaily, 'Sem uso de sincronização de IA registrado.');
    this.aiConsultantDaily.innerHTML = renderDailyMetricList(aiConsultantDaily, 'Sem uso de Consultor IA registrado.');

    const topUsersByVolume = Array.isArray(highlights.topUsersByVolume) ? highlights.topUsersByVolume : [];
    this.topUsers.innerHTML = this.renderTopUsers(topUsersByVolume);

    const opportunities = this.buildOpportunityUsers(users);
    this.opportunityUsers.innerHTML = this.renderOpportunityUsers(opportunities);

    this.usersState.allUsers = users;
    this.usersState.page = 1;
    this.renderUsersSection();
  }

  filterUsersByEmail(users, query) {
    const normalizedQuery = normalizeSearchTerm(query);
    if (!normalizedQuery) {
      return Array.isArray(users) ? users : [];
    }

    return (Array.isArray(users) ? users : []).filter((user) =>
      normalizeEmail(user?.email || '').includes(normalizedQuery)
    );
  }

  paginateUsers(users) {
    const safeUsers = Array.isArray(users) ? users : [];
    const totalItems = safeUsers.length;
    const pageSize = Math.max(1, Math.round(toNumber(this.usersState.pageSize || DEFAULT_USERS_PAGE_SIZE)));
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.max(1, Math.min(Math.round(toNumber(this.usersState.page || 1)), totalPages));
    const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalItems);

    this.usersState.page = currentPage;
    this.usersState.pageSize = pageSize;
    this.usersState.totalPages = totalPages;

    return {
      totalItems,
      totalPages,
      currentPage,
      pageSize,
      startIndex,
      endIndex,
      pageItems: safeUsers.slice(startIndex, endIndex),
      hasPrevious: currentPage > 1,
      hasNext: currentPage < totalPages
    };
  }

  renderUsersSection() {
    const allUsers = Array.isArray(this.usersState.allUsers) ? this.usersState.allUsers : [];
    const query = this.usersState.query || '';
    const filteredUsers = this.filterUsersByEmail(allUsers, query);
    this.usersState.filteredUsers = filteredUsers;

    const pagination = this.paginateUsers(filteredUsers);
    const totalAll = allUsers.length;
    const totalFiltered = filteredUsers.length;
    const hasQuery = normalizeSearchTerm(query).length > 0;

    this.usersCount.innerText = hasQuery
      ? `${formatInteger(totalFiltered)} de ${formatInteger(totalAll)} usuário(s)`
      : `${formatInteger(totalFiltered)} usuário(s)`;

    if (totalFiltered === 0) {
      const noResultMessage = hasQuery
        ? 'Nenhum usuário encontrado com este e-mail.'
        : 'Nenhum usuário encontrado para este appId.';
      this.usersTable.innerHTML = `<p class="text-sm font-bold text-zinc-600">${noResultMessage}</p>`;
    } else {
      this.usersTable.innerHTML = this.renderUsers(pagination.pageItems);
    }

    this.renderUsersPagination(pagination, totalFiltered);
  }

  renderUsersPagination(meta, totalFiltered) {
    if (!this.usersPaginationPanel) {
      return;
    }

    if (!meta || totalFiltered <= 0) {
      this.usersPaginationPanel.classList.add('hidden');
      this.usersPaginationRange.innerText = 'Mostrando 0-0 de 0';
      this.usersPaginationStatus.innerText = 'Página 1 de 1';
      if (this.usersPaginationPrevButton) {
        this.usersPaginationPrevButton.disabled = true;
      }
      if (this.usersPaginationNextButton) {
        this.usersPaginationNextButton.disabled = true;
      }
      return;
    }

    this.usersPaginationPanel.classList.remove('hidden');
    this.usersPaginationRange.innerText = `Mostrando ${meta.startIndex + 1}-${meta.endIndex} de ${meta.totalItems}`;
    this.usersPaginationStatus.innerText = `Página ${meta.currentPage} de ${meta.totalPages}`;

    if (this.usersPageSizeSelect && this.usersPageSizeSelect.value !== String(meta.pageSize)) {
      this.usersPageSizeSelect.value = String(meta.pageSize);
    }
    if (this.usersPaginationPrevButton) {
      this.usersPaginationPrevButton.disabled = !meta.hasPrevious;
    }
    if (this.usersPaginationNextButton) {
      this.usersPaginationNextButton.disabled = !meta.hasNext;
    }
  }

  renderTopUsers(users) {
    if (!Array.isArray(users) || users.length === 0) {
      return '<p class="text-sm font-bold text-zinc-600">Sem dados suficientes para ranking.</p>';
    }

    const maxVolume = Math.max(...users.map((user) => toNumber(user.totalTransactions)), 1);

    return users
      .slice(0, 10)
      .map((user, index) => {
        const total = toNumber(user.totalTransactions);
        const width = Math.max(6, Math.round((total / maxVolume) * 100));

        return `
          <article class="admin-ranking-card">
            <div class="flex items-center justify-between gap-2">
              <p class="admin-ranking-title">${index + 1}. ${user.email || user.uid}</p>
              <p class="admin-ranking-total">${formatInteger(total)}</p>
            </div>
            <div class="admin-ranking-track">
              <div class="admin-ranking-fill" style="width:${width}%"></div>
            </div>
            <p class="admin-ranking-helper">Importadas: ${formatInteger(user.importedTransactions || 0)} • Manuais: ${formatInteger(
              user.manualTransactions || 0
            )}</p>
          </article>
        `;
      })
      .join('');
  }

  buildOpportunityUsers(users) {
    const now = new Date();

    return (Array.isArray(users) ? users : [])
      .map((user) => {
        const transactions = user.transactions || {};
        const automation = user.automation || {};
        const issues = [];

        const pending = toNumber(transactions.pendingCategorization);
        if (pending >= 5) {
          issues.push({
            score: Math.min(40, pending),
            label: `Pendências altas (${formatInteger(pending)} transações sem categoria).`
          });
        }

        const autoCategorizedTotal = toNumber(automation.autoCategorizedTotal);
        const acceptedRate = toNumber(automation.acceptedRate);
        if (autoCategorizedTotal >= 8 && acceptedRate < 70) {
          issues.push({
            score: 35,
            label: `Baixa aderência da automação (${formatPercent(acceptedRate)} de aceite).`
          });
        }

        const lastAccess = parseIsoDate(user.lastAccessAt);
        const daysWithoutAccess = lastAccess
          ? Math.floor((now.getTime() - lastAccess.getTime()) / 86400000)
          : Number.POSITIVE_INFINITY;

        if (daysWithoutAccess >= 30 && toNumber(transactions.total) > 0) {
          issues.push({
            score: 25,
            label: `Sem acessar há ${Number.isFinite(daysWithoutAccess) ? daysWithoutAccess : 'muitos'} dias.`
          });
        }

        return {
          uid: user.uid,
          email: user.email || 'Sem e-mail',
          displayName: user.displayName || 'Sem nome',
          score: issues.reduce((accumulator, issue) => accumulator + issue.score, 0),
          issues
        };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 8);
  }

  renderOpportunityUsers(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return '<p class="text-sm font-bold text-zinc-600">Sem alertas críticos neste momento. Operação estável.</p>';
    }

    return items
      .map(
        (item) => `
          <article class="admin-opportunity-card">
            <div class="flex items-center justify-between gap-2">
              <p class="admin-opportunity-title">${item.displayName}</p>
              <span class="admin-opportunity-score">Prioridade ${Math.round(item.score)}</span>
            </div>
            <p class="admin-opportunity-email">${item.email}</p>
            <div class="space-y-1 mt-2">
              ${item.issues.map((issue) => `<p class="admin-opportunity-issue">• ${issue.label}</p>`).join('')}
            </div>
          </article>
        `
      )
      .join('');
  }

  renderUsers(users) {
    if (!Array.isArray(users) || users.length === 0) {
      return '<p class="text-sm font-bold text-zinc-600">Nenhum usuário encontrado para este appId.</p>';
    }

    return users
      .map((user) => {
        const name = String(user.displayName || '').trim() || 'Sem nome';
        const email = String(user.email || '').trim() || 'Sem e-mail';
        const transactions = user.transactions || {};
        const aiUsage = user.aiUsage || {};
        const automation = user.automation || {};
        const pending = toNumber(transactions.pendingCategorization);
        const pendingClass = pending > 0 ? 'text-amber-700' : 'text-emerald-700';

        return `
          <article class="admin-user-card">
            <div class="admin-user-header">
              <div>
                <p class="admin-user-name">${name}</p>
                <p class="admin-user-email">${email}</p>
              </div>
              <p class="admin-user-uid">UID: ${user.uid}</p>
            </div>

            <div class="admin-user-grid">
              <div>
                <p class="admin-user-label">Cadastro</p>
                <p class="admin-user-value">${formatDateTime(user.createdAt)}</p>
              </div>
              <div>
                <p class="admin-user-label">Último acesso</p>
                <p class="admin-user-value">${formatDateTime(user.lastAccessAt)}</p>
              </div>
              <div>
                <p class="admin-user-label">Transações</p>
                <p class="admin-user-value">${formatInteger(transactions.total || 0)}</p>
              </div>
              <div>
                <p class="admin-user-label">Pendências</p>
                <p class="admin-user-value ${pendingClass}">${formatInteger(pending)}</p>
              </div>
              <div>
                <p class="admin-user-label">Sync IA</p>
                <p class="admin-user-value">${formatInteger(aiUsage.categorizationRunsTotal || 0)}</p>
              </div>
              <div>
                <p class="admin-user-label">Consultor IA</p>
                <p class="admin-user-value">${formatInteger(aiUsage.consultantRunsTotal || 0)}</p>
              </div>
              <div>
                <p class="admin-user-label">Auto aceitas</p>
                <p class="admin-user-value">${formatInteger(automation.autoAcceptedTransactions || 0)}</p>
              </div>
              <div>
                <p class="admin-user-label">Auto revisadas</p>
                <p class="admin-user-value">${formatInteger(automation.autoOverriddenTransactions || 0)}</p>
              </div>
            </div>

            <div class="admin-user-footer">
              <p class="admin-user-label">Taxa de aderência da categorização automática</p>
              <div class="admin-user-progress-track">
                <div class="admin-user-progress-fill" style="width:${Math.max(
                  0,
                  Math.min(toNumber(automation.acceptedRate), 100)
                )}%"></div>
              </div>
              <p class="admin-user-value">${formatPercent(automation.acceptedRate || 0)}</p>
            </div>
          </article>
        `;
      })
      .join('');
  }
}

function bootstrapAdmin() {
  const config = loadAppConfig();
  const app = new AdminDashboardApp(config);
  app.init();
}

bootstrapAdmin();
