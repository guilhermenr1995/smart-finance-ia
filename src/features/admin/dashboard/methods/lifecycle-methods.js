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

class AdminDashboardLifecycleMethods {
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
    try {
      await this.auth.setPersistence(this.firebase.auth.Auth.Persistence.LOCAL);
    } catch (error) {
      console.warn('Unable to enforce local auth persistence on admin:', error);
    }

    await this.auth.getRedirectResult().catch(() => null);
    this.bindEvents();
    this.auth.onAuthStateChanged((user) => {
      this.handleAuthState(user);
    });
  }

  bindEvents() {
    this.googleLoginButton.addEventListener('click', async () => {
      this.pendingGoogleLogin = true;
      this.setGoogleLoginBusy(true, 'Abrindo login Google...');
      try {
        const provider = new this.firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await this.auth.signInWithPopup(provider);
      } catch (error) {
        if (error?.code === 'auth/popup-blocked' || error?.code === 'auth/operation-not-supported-in-this-environment') {
          try {
            await this.auth.signInWithRedirect(new this.firebase.auth.GoogleAuthProvider());
            return;
          } catch (redirectError) {
            this.showAuthMessage(redirectError?.message || 'Falha ao autenticar com Google.', 'error');
          }
        } else {
          this.showAuthMessage(error?.message || 'Falha ao autenticar com Google.', 'error');
        }

        this.pendingGoogleLogin = false;
        this.setGoogleLoginBusy(false);
      }
    });

    this.logoutButton.addEventListener('click', async () => {
      await this.auth.signOut();
      this.pendingGoogleLogin = false;
      this.setGoogleLoginBusy(false);
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

    this.usersTable?.addEventListener('click', (event) => {
      const target = event.target;
      if (!target || typeof target.closest !== 'function') {
        return;
      }

      const actionButton = target.closest('[data-admin-action]');
      if (!actionButton) {
        return;
      }

      const userId = String(actionButton.getAttribute('data-user-id') || '').trim();
      if (!userId) {
        return;
      }

      const action = String(actionButton.getAttribute('data-admin-action') || '').trim();
      if (action === 'dedup-user') {
        void this.onDeduplicateUser(userId);
        return;
      }

      if (action === 'reset-user') {
        void this.onResetUserJourney(userId);
      }
    });
  }

}

export function registerLifecycleMethods(AdminDashboardApp) {
  applyClassMethods(AdminDashboardApp, AdminDashboardLifecycleMethods);
}
