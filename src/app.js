import { loadAppConfig } from './config/app-config.js';
import { AppState } from './state/app-state.js';
import { AuthService } from './services/auth-service.js';
import { AiCategorizationService } from './services/ai-categorization-service.js';
import { AiConsultantService } from './services/ai-consultant-service.js';
import { CsvImportService } from './services/csv-import-service.js';
import { FirebaseService } from './services/firebase-service.js';
import { CategoryMemoryService } from './services/category-memory-service.js';
import { LocalCacheService } from './services/local-cache-service.js';
import { PwaService } from './services/pwa-service.js';
import { TransactionRepository } from './services/transaction-repository.js';
import { AuthView } from './ui/auth-view.js';
import { DashboardView } from './ui/dashboard-view.js';
import { OverlayView } from './ui/overlay-view.js';
import { CATEGORIES } from './constants/categories.js';
import {
  handleAuthState,
  handleEmailLogin,
  handleEmailRegister,
  handleGoogleLogin,
  handlePasswordReset,
  handleLogout
} from './application/flows/auth-flow.js';
import { getVisibleTransactions, getTableTransactions, refreshDashboard } from './application/flows/dashboard-flow.js';
import { persistTransactionsCache, setTransactionsAndRefresh, syncDataFromCloud } from './application/flows/data-sync-flow.js';
import {
  importCsv,
  toggleActive,
  updateCategory,
  createAndAssignCategory,
  updateBankAccount,
  createBankAccount,
  createAndAssignBankAccount,
  createManualTransaction,
  updateTransactionDescription
} from './application/flows/transaction-flow.js';
import {
  syncCategoriesWithAi,
  buildConsultantPeriodSnapshot,
  buildConsultantInsightKey,
  runAiConsultant
} from './application/flows/ai-flow.js';
import { TransactionQueryService } from './utils/transaction-utils.js';

class SmartFinanceApplication {
  constructor(dependencies) {
    this.config = dependencies.config;
    this.state = dependencies.state;
    this.authService = dependencies.authService;
    this.repository = dependencies.repository;
    this.csvImportService = dependencies.csvImportService;
    this.aiService = dependencies.aiService;
    this.aiConsultantService = dependencies.aiConsultantService;
    this.queryService = dependencies.queryService;
    this.categoryMemoryService = dependencies.categoryMemoryService;
    this.localCacheService = dependencies.localCacheService;
    this.pwaService = dependencies.pwaService;
    this.authView = dependencies.authView;
    this.dashboardView = dependencies.dashboardView;
    this.overlayView = dependencies.overlayView;

    this.installButton = document.getElementById('btn-install-app');
  }

  async init() {
    this.dashboardView.setInitialFilters(this.state.filters, this.state.search);
    this.bindEvents();

    await this.pwaService.registerServiceWorker();
    this.pwaService.setupInstallPrompt();

    this.authService.subscribe((user) => {
      this.handleAuthState(user);
    });

    try {
      await this.authService.bootstrapSession();
    } catch (error) {
      console.warn('Session bootstrap skipped:', error);
    }

    this.refreshDashboard();
  }

  bindEvents() {
    this.authView.bindEvents({
      onLogin: (credentials) => this.handleEmailLogin(credentials),
      onRegister: (credentials) => this.handleEmailRegister(credentials),
      onGoogleLogin: () => this.handleGoogleLogin(),
      onPasswordReset: (email) => this.handlePasswordReset(email),
      onLogout: () => this.handleLogout()
    });

    this.dashboardView.bindEvents({
      onFiltersChange: (partialFilters) => {
        this.state.updateFilters(partialFilters);
        this.dashboardView.resetPagination();
        this.refreshDashboard();
      },
      onSearchChange: (partialSearch) => {
        this.state.updateSearch(partialSearch);
        this.dashboardView.resetPagination();
        this.refreshDashboard();
      },
      onPaginationChange: () => {
        this.refreshDashboard();
      },
      onImportFile: (file, accountType, bankAccountName) => this.importCsv(file, accountType, bankAccountName),
      onAiCategorization: () => this.syncCategoriesWithAi(),
      onAiConsultant: () => this.runAiConsultant(),
      onToggleActive: ({ docId, currentState }) => this.toggleActive(docId, currentState),
      onCategoryUpdate: ({ docId, category }) => this.updateCategory(docId, category),
      onCreateCategory: ({ docId, categoryName }) => this.createAndAssignCategory(docId, categoryName),
      onBankAccountUpdate: ({ docId, bankAccount }) => this.updateBankAccount(docId, bankAccount),
      onCreateBankAccount: ({ bankAccountName }) => this.createBankAccount(bankAccountName),
      onCreateAndAssignBankAccount: ({ docId, bankAccountName }) =>
        this.createAndAssignBankAccount(docId, bankAccountName),
      onCreateTransaction: (payload) => this.createManualTransaction(payload),
      onTitleUpdate: ({ docId, title }) => this.updateTransactionDescription(docId, title)
    });

    this.installButton.addEventListener('click', async () => {
      await this.pwaService.promptInstall();
    });
  }

  async handleAuthState(user) {
    return handleAuthState(this, user);
  }

  async handleEmailLogin(credentials) {
    return handleEmailLogin(this, credentials);
  }

  async handleEmailRegister(credentials) {
    return handleEmailRegister(this, credentials);
  }

  async handleGoogleLogin() {
    return handleGoogleLogin(this);
  }

  async handlePasswordReset(email) {
    return handlePasswordReset(this, email);
  }

  async handleLogout() {
    return handleLogout(this);
  }

  getVisibleTransactions() {
    return getVisibleTransactions(this);
  }

  getTableTransactions(sourceTransactions) {
    return getTableTransactions(this, sourceTransactions);
  }

  refreshDashboard() {
    return refreshDashboard(this);
  }

  persistTransactionsCache() {
    return persistTransactionsCache(this);
  }

  setTransactionsAndRefresh(transactions) {
    return setTransactionsAndRefresh(this, transactions);
  }

  async syncDataFromCloud(options = {}) {
    return syncDataFromCloud(this, options);
  }

  async importCsv(file, accountType, bankAccountName) {
    return importCsv(this, file, accountType, bankAccountName);
  }

  async toggleActive(docId, currentState) {
    return toggleActive(this, docId, currentState);
  }

  async updateCategory(docId, category) {
    return updateCategory(this, docId, category);
  }

  async createAndAssignCategory(docId, categoryName) {
    return createAndAssignCategory(this, docId, categoryName);
  }

  async updateBankAccount(docId, bankAccountName) {
    return updateBankAccount(this, docId, bankAccountName);
  }

  async createBankAccount(bankAccountName) {
    return createBankAccount(this, bankAccountName);
  }

  async createAndAssignBankAccount(docId, bankAccountName) {
    return createAndAssignBankAccount(this, docId, bankAccountName);
  }

  async createManualTransaction(payload) {
    return createManualTransaction(this, payload);
  }

  async updateTransactionDescription(docId, title) {
    return updateTransactionDescription(this, docId, title);
  }

  async syncCategoriesWithAi() {
    return syncCategoriesWithAi(this);
  }

  buildConsultantPeriodSnapshot(periodDates, summary) {
    return buildConsultantPeriodSnapshot(this, periodDates, summary);
  }

  buildConsultantInsightKey(filters) {
    return buildConsultantInsightKey(filters);
  }

  async runAiConsultant() {
    return runAiConsultant(this);
  }

  normalizeError(error) {
    if (typeof error?.details === 'string' && error.details.trim()) {
      return error.details;
    }

    return error?.message || 'Ocorreu um erro inesperado.';
  }
}

function updateInstallButtonVisibility(isVisible) {
  const button = document.getElementById('btn-install-app');
  button.classList.toggle('hidden', !isVisible);
}

function bootstrap() {
  const config = loadAppConfig();
  const state = new AppState();

  let firebaseContext;
  try {
    firebaseContext = new FirebaseService(window.firebase, config).init();
  } catch (error) {
    const message = document.getElementById('auth-message');
    message.innerText = error.message;
    message.classList.remove('hidden');
    message.dataset.type = 'error';
    return;
  }

  const dependencies = {
    config,
    state,
    authService: new AuthService(firebaseContext.auth, firebaseContext.firebase),
    repository: new TransactionRepository(firebaseContext.db, config.appId),
    csvImportService: new CsvImportService(),
    categoryMemoryService: new CategoryMemoryService(),
    localCacheService: new LocalCacheService(config.cache),
    aiService: new AiCategorizationService(
      {
        ...config.ai,
        getAuthToken: async () => {
          const user = firebaseContext.auth.currentUser;
          if (!user) {
            return '';
          }

          return user.getIdToken();
        }
      },
      CATEGORIES
    ),
    aiConsultantService: new AiConsultantService({
      ...config.ai,
      getAuthToken: async () => {
        const user = firebaseContext.auth.currentUser;
        if (!user) {
          return '';
        }

        return user.getIdToken();
      }
    }),
    queryService: new TransactionQueryService(),
    pwaService: new PwaService({ onInstallAvailabilityChanged: updateInstallButtonVisibility }),
    authView: new AuthView(),
    dashboardView: new DashboardView(),
    overlayView: new OverlayView()
  };

  const application = new SmartFinanceApplication(dependencies);
  application.init();
}

bootstrap();
