import { loadAppConfig } from './config/app-config.js';

const DEFAULT_ADMIN_EMAILS = ['guilhermenr1995@gmail.com'];

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
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

function renderDailyMetricList(items = [], emptyMessage) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="text-[11px] font-bold text-zinc-600">${emptyMessage}</p>`;
  }

  return items
    .slice(-45)
    .reverse()
    .map(
      (item) => `
        <div class="border border-black/20 bg-zinc-50 p-2 flex items-center justify-between gap-2">
          <p class="text-[11px] font-black uppercase">${item.dateKey}</p>
          <p class="text-[11px] font-black">${Number(item.count || 0)} uso(s)</p>
        </div>
      `
    )
    .join('');
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
    this.summaryCards = document.getElementById('admin-summary-cards');
    this.aiSyncDaily = document.getElementById('admin-ai-sync-daily');
    this.aiConsultantDaily = document.getElementById('admin-ai-consultant-daily');
    this.topUsers = document.getElementById('admin-top-users');
    this.usersCount = document.getElementById('admin-users-count');
    this.usersTable = document.getElementById('admin-users-table');

    this.googleLoginButton = document.getElementById('admin-btn-google-login');
    this.refreshButton = document.getElementById('admin-btn-refresh');
    this.logoutButton = document.getElementById('admin-btn-logout');
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
      this.summaryCards.innerHTML = `<p class="text-sm font-black text-red-700">${error?.message || 'Erro ao carregar painel.'}</p>`;
      this.aiSyncDaily.innerHTML = '';
      this.aiConsultantDaily.innerHTML = '';
      this.topUsers.innerHTML = '';
      this.usersTable.innerHTML = '';
      this.usersCount.innerText = '0 usuários';
    } finally {
      this.loadingPanel.classList.add('hidden');
      this.dashboardContent.classList.remove('hidden');
    }
  }

  renderDashboard(payload) {
    const totals = payload?.totals || {};
    const highlights = payload?.highlights || {};
    const users = Array.isArray(payload?.users) ? payload.users : [];
    const aiSyncDaily = payload?.dailyUsage?.aiCategorizationRunsByDay || [];
    const aiConsultantDaily = payload?.dailyUsage?.aiConsultantRunsByDay || [];
    const topUsersByVolume = Array.isArray(highlights.topUsersByVolume) ? highlights.topUsersByVolume : [];

    const cards = [
      {
        label: 'Usuários cadastrados',
        value: Number(totals.users || 0),
        helper: `Ativos 7d: ${Number(totals.activeUsers7d || 0)}`
      },
      {
        label: 'Transações importadas',
        value: Number(totals.importedTransactions || 0),
        helper: `Manuais: ${Number(totals.manualTransactions || 0)}`
      },
      {
        label: 'Sincronizações IA',
        value: Number(totals.aiCategorizationRuns || 0),
        helper: `Consultor IA: ${Number(totals.aiConsultantRuns || 0)}`
      },
      {
        label: 'Aderência automação',
        value: formatPercent(totals.automationAcceptedRate || 0),
        helper: `Revisão manual: ${formatPercent(totals.automationOverrideRate || 0)}`
      },
      {
        label: 'Pendentes categoria',
        value: Number(totals.pendingCategorization || 0),
        helper: `Usuários afetados: ${Number(highlights.usersWithPendingCategorization || 0)}`
      },
      {
        label: 'Média transações/usuário',
        value: Number(totals.averageTransactionsPerUser || 0).toFixed(1),
        helper: `Total base: ${Number(totals.transactions || 0)}`
      },
      {
        label: 'Usuários ativos 30d',
        value: Number(totals.activeUsers30d || 0),
        helper: `Sem transações: ${Number(highlights.usersWithNoTransactions || 0)}`
      },
      {
        label: 'Última geração',
        value: formatDateTime(payload.generatedAt),
        helper: `App: ${payload.appId || '-'}`
      }
    ];

    this.summaryCards.innerHTML = cards
      .map(
        (card) => `
          <div class="bg-zinc-50 border-2 border-black p-3">
            <p class="text-[10px] font-black uppercase text-zinc-500">${card.label}</p>
            <p class="text-2xl font-black mt-2">${card.value}</p>
            <p class="text-[10px] font-bold text-zinc-600 mt-1">${card.helper}</p>
          </div>
        `
      )
      .join('');

    this.aiSyncDaily.innerHTML = renderDailyMetricList(aiSyncDaily, 'Sem uso de sincronização de IA registrado.');
    this.aiConsultantDaily.innerHTML = renderDailyMetricList(aiConsultantDaily, 'Sem uso de Consultor IA registrado.');
    this.topUsers.innerHTML = this.renderTopUsers(topUsersByVolume);

    this.usersCount.innerText = `${users.length} usuário(s)`;
    this.usersTable.innerHTML = this.renderUsers(users);
  }

  renderTopUsers(users) {
    if (!Array.isArray(users) || users.length === 0) {
      return '<p class="text-[11px] font-bold text-zinc-600">Sem dados suficientes para ranking.</p>';
    }

    return users
      .slice(0, 10)
      .map(
        (user, index) => `
          <div class="border border-black/20 bg-zinc-50 p-2 flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-[11px] font-black uppercase">${index + 1}. ${user.email || user.uid}</p>
              <p class="text-[10px] font-bold text-zinc-600">Importadas: ${Number(user.importedTransactions || 0)} | Manuais: ${Number(user.manualTransactions || 0)}</p>
            </div>
            <p class="text-[11px] font-black">${Number(user.totalTransactions || 0)} lançamentos</p>
          </div>
        `
      )
      .join('');
  }

  renderUsers(users) {
    if (!Array.isArray(users) || users.length === 0) {
      return '<p class="text-[11px] font-bold text-zinc-600">Nenhum usuário encontrado para este appId.</p>';
    }

    return users
      .map((user) => {
        const name = String(user.displayName || '').trim() || 'Sem nome';
        const email = String(user.email || '').trim() || 'Sem e-mail';
        const transactions = user.transactions || {};
        const aiUsage = user.aiUsage || {};
        const automation = user.automation || {};

        return `
          <article class="border-2 border-black bg-zinc-50 p-3 space-y-2">
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <p class="text-[12px] font-black uppercase">${name}</p>
                <p class="text-[10px] font-bold text-zinc-600">${email}</p>
              </div>
              <p class="text-[10px] font-black uppercase text-zinc-500">UID: ${user.uid}</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[10px] font-bold">
              <p><span class="text-zinc-500 uppercase font-black">Cadastro:</span> ${formatDateTime(user.createdAt)}</p>
              <p><span class="text-zinc-500 uppercase font-black">Último acesso:</span> ${formatDateTime(user.lastAccessAt)}</p>
              <p><span class="text-zinc-500 uppercase font-black">Importadas:</span> ${Number(transactions.imported || 0)}</p>
              <p><span class="text-zinc-500 uppercase font-black">Totais base:</span> ${Number(transactions.total || 0)}</p>
              <p><span class="text-zinc-500 uppercase font-black">Sync IA:</span> ${Number(aiUsage.categorizationRunsTotal || 0)}</p>
              <p><span class="text-zinc-500 uppercase font-black">Consultor IA:</span> ${Number(aiUsage.consultantRunsTotal || 0)}</p>
              <p>
                <span class="text-zinc-500 uppercase font-black">Auto aceitas:</span>
                ${Number(automation.autoAcceptedTransactions || 0)}
              </p>
              <p>
                <span class="text-zinc-500 uppercase font-black">Auto revisadas:</span>
                ${Number(automation.autoOverriddenTransactions || 0)}
              </p>
            </div>
            <div class="bg-white border border-black/20 p-2 text-[10px] font-bold">
              <p class="uppercase font-black text-zinc-500 mb-1">Taxa de aderência da categorização automática</p>
              <p>${formatPercent(automation.acceptedRate || 0)}</p>
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
