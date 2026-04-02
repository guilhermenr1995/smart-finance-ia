import { DEFAULT_ADMIN_EMAILS, DEFAULT_USERS_PAGE_SIZE, normalizeEmail } from './shared.js';
import { registerLifecycleMethods } from './methods/lifecycle-methods.js';
import { registerMaintenanceMethods } from './methods/maintenance-methods.js';
import { registerAuthUiMethods } from './methods/auth-ui-methods.js';
import { registerDashboardDataMethods } from './methods/dashboard-data-methods.js';
import { registerRenderDashboardMethods } from './methods/render-dashboard-methods.js';
import { registerUserListMethods } from './methods/user-list-methods.js';

export class AdminDashboardApp {
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
    this.usersMaintenanceRunning = new Set();
    this.usersMaintenanceStatusByUserId = new Map();
    this.defaultGoogleLoginLabel = this.googleLoginButton?.innerText || 'Entrar com Google';
    this.pendingGoogleLogin = false;

    if (this.usersPageSizeSelect) {
      this.usersPageSizeSelect.value = String(DEFAULT_USERS_PAGE_SIZE);
    }
  }

}

registerLifecycleMethods(AdminDashboardApp);
registerMaintenanceMethods(AdminDashboardApp);
registerAuthUiMethods(AdminDashboardApp);
registerDashboardDataMethods(AdminDashboardApp);
registerRenderDashboardMethods(AdminDashboardApp);
registerUserListMethods(AdminDashboardApp);
