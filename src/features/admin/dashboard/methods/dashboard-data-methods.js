import {
  CHART_WINDOW_DAYS,
  DEFAULT_USERS_PAGE_SIZE,
  buildDailySeries,
  formatDateKeyShort,
  formatDateTime,
  formatInteger,
  formatPercent,
  normalizeEmail,
  normalizeSearchTerm,
  parseIsoDate,
  renderDailyMetricList,
  renderDualDailyChart,
  resolveAdminDashboardUrl,
  resolveMaintenanceDedupUrl,
  resolveMaintenanceResetUrl,
  toNumber
} from '../shared.js';
import { applyClassMethods } from './register-methods.js';

class AdminDashboardDataMethods {
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

}

export function registerDashboardDataMethods(AdminDashboardApp) {
  applyClassMethods(AdminDashboardApp, AdminDashboardDataMethods);
}
