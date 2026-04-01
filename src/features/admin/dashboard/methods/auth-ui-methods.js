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

class AdminDashboardAuthUiMethods {
  isAdminUser(user) {
    return this.allowedEmails.has(normalizeEmail(user?.email));
  }

  showAuthMessage(message, type = 'info') {
    this.authMessage.classList.remove('hidden');
    this.authMessage.dataset.type = type;
    this.authMessage.innerText = message;
  }

  setGoogleLoginBusy(isBusy, message = '') {
    if (!this.googleLoginButton) {
      return;
    }

    this.googleLoginButton.disabled = isBusy;
    this.googleLoginButton.classList.toggle('admin-google-loading', isBusy);
    this.googleLoginButton.innerText = isBusy ? 'Conectando...' : this.defaultGoogleLoginLabel;

    if (isBusy) {
      this.showAuthMessage(message || 'Conectando com Google...', 'info');
    }
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
      this.pendingGoogleLogin = false;
      this.setGoogleLoginBusy(false);
      return;
    }

    this.authScreen.classList.add('hidden');
    this.appScreen.classList.remove('hidden');
    this.userEmailLabel.innerText = `Logado como: ${user.email || '-'}`;

    if (!this.isAdminUser(user)) {
      this.accessDeniedPanel.classList.remove('hidden');
      this.loadingPanel.classList.add('hidden');
      this.dashboardContent.classList.add('hidden');
      this.pendingGoogleLogin = false;
      this.setGoogleLoginBusy(false);
      return;
    }

    this.accessDeniedPanel.classList.add('hidden');
    await this.loadAdminDashboard(user);
    this.pendingGoogleLogin = false;
    this.setGoogleLoginBusy(false);
  }

}

export function registerAuthUiMethods(AdminDashboardApp) {
  applyClassMethods(AdminDashboardApp, AdminDashboardAuthUiMethods);
}
