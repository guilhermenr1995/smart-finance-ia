import { loadAppConfig } from './config/app-config.js';
import { AppState } from './state/app-state.js';
import { AuthService } from './services/auth-service.js';
import { AiCategorizationService } from './services/ai-categorization-service.js';
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
import { TransactionQueryService, getInstallmentGroupKey, getInstallmentInfo } from './utils/transaction-utils.js';
import { shiftInputDateByMonths } from './utils/date-utils.js';

const AUTH_ERROR_MESSAGES = {
  'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/user-not-found': 'Usuário não encontrado.',
  'auth/wrong-password': 'Senha incorreta.',
  'auth/weak-password': 'A senha deve ter pelo menos 6 caracteres.',
  'auth/popup-closed-by-user': 'Login com Google cancelado.',
  'auth/popup-blocked': 'O navegador bloqueou o popup de login. Tente novamente.',
  'auth/operation-not-supported-in-this-environment': 'Este ambiente não suporta popup. Redirecionando para login...',
  'auth/network-request-failed': 'Falha de rede. Verifique sua conexão.'
};

class SmartFinanceApplication {
  constructor(dependencies) {
    this.config = dependencies.config;
    this.state = dependencies.state;
    this.authService = dependencies.authService;
    this.repository = dependencies.repository;
    this.csvImportService = dependencies.csvImportService;
    this.aiService = dependencies.aiService;
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
    this.dashboardView.setInitialFilters(this.state.filters);
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
        this.refreshDashboard();
      },
      onImportFile: (file, accountType) => this.importCsv(file, accountType),
      onAiCategorization: () => this.syncCategoriesWithAi(),
      onToggleActive: ({ docId, currentState }) => this.toggleActive(docId, currentState),
      onCategoryUpdate: ({ docId, category }) => this.updateCategory(docId, category),
      onCreateCategory: ({ docId, categoryName }) => this.createAndAssignCategory(docId, categoryName)
    });

    this.installButton.addEventListener('click', async () => {
      await this.pwaService.promptInstall();
    });
  }

  async handleAuthState(user) {
    this.state.setUser(user);
    this.authView.setAuthenticated(user);

    if (!user) {
      this.state.setTransactions([]);
      this.state.setUserCategories([]);
      this.refreshDashboard();
      return;
    }

    const cached = this.localCacheService.load(user.uid);
    if (cached.transactions.length > 0) {
      this.state.setTransactions(cached.transactions);
      this.state.setUserCategories(cached.categories || []);
      this.refreshDashboard();
    }

    const shouldSyncCloud = !this.localCacheService.isFresh(cached.lastSyncedAt);
    await this.syncDataFromCloud({ force: shouldSyncCloud, showOverlay: shouldSyncCloud });
  }

  getVisibleTransactions() {
    return this.queryService.getVisibleTransactions(this.state.transactions, this.state.getFilterBoundaries());
  }

  refreshDashboard() {
    const visibleTransactions = this.getVisibleTransactions();
    const summary = this.queryService.buildSummary(visibleTransactions);
    const pendingAiCount = this.queryService.getAiCandidates(visibleTransactions).length;

    const previousStartDate = shiftInputDateByMonths(this.state.filters.startDate, -1);
    const previousEndDate = shiftInputDateByMonths(this.state.filters.endDate, -1);
    const previousBounds = {
      ...this.state.getFilterBoundaries(),
      cycleStart: new Date(`${previousStartDate}T00:00:00`),
      cycleEnd: new Date(`${previousEndDate}T23:59:59`)
    };
    const previousVisibleTransactions = this.queryService.getVisibleTransactions(this.state.transactions, previousBounds);
    const previousSummary = this.queryService.buildSummary(previousVisibleTransactions);

    const availableCategories = [...new Set([...CATEGORIES, ...this.state.userCategories])];

    this.dashboardView.render({
      filters: this.state.filters,
      summary,
      previousSummary,
      visibleTransactions,
      pendingAiCount,
      categories: availableCategories
    });
  }

  persistTransactionsCache() {
    if (!this.state.user) {
      return;
    }

    this.localCacheService.save(this.state.user.uid, {
      transactions: this.state.transactions,
      categories: this.state.userCategories
    });
  }

  setTransactionsAndRefresh(transactions) {
    this.state.setTransactions(transactions);
    this.persistTransactionsCache();
    this.refreshDashboard();
  }

  async syncDataFromCloud(options = {}) {
    if (!this.state.user) {
      return false;
    }

    const force = Boolean(options.force);
    const showOverlay = Boolean(options.showOverlay);

    const cached = this.localCacheService.load(this.state.user.uid);
    if (!force && this.localCacheService.isFresh(cached.lastSyncedAt)) {
      return false;
    }

    if (showOverlay) {
      this.overlayView.show('Sincronizando dados...');
    }

    try {
      const [transactions, categories] = await Promise.all([
        this.repository.fetchAll(this.state.user.uid),
        this.repository.fetchCategories(this.state.user.uid)
      ]);
      this.state.setUserCategories(categories);
      this.setTransactionsAndRefresh(transactions);
      if (showOverlay) {
        this.overlayView.hide();
      }
      return true;
    } catch (error) {
      if (showOverlay) {
        this.overlayView.showError(this.normalizeError(error));
      } else {
        this.authView.showMessage(this.normalizeError(error), 'error');
      }
      return false;
    }
  }

  async runAuthOperation(action) {
    this.authView.setBusy(true);
    try {
      await action();
      this.authView.clearMessage();
    } catch (error) {
      this.authView.showMessage(this.normalizeAuthError(error), 'error');
    } finally {
      this.authView.setBusy(false);
    }
  }

  async handleEmailLogin({ email, password }) {
    await this.runAuthOperation(async () => {
      this.assertEmailAndPassword(email, password);
      await this.authService.signInWithEmail(email, password);
    });
  }

  async handleEmailRegister({ email, password }) {
    await this.runAuthOperation(async () => {
      this.assertEmailAndPassword(email, password);
      await this.authService.registerWithEmail(email, password);
      this.authView.showMessage('Conta criada com sucesso.', 'success');
    });
  }

  async handleGoogleLogin() {
    await this.runAuthOperation(async () => {
      await this.authService.signInWithGoogle();
    });
  }

  async handlePasswordReset(email) {
    await this.runAuthOperation(async () => {
      if (!email) {
        throw new Error('Informe seu e-mail para redefinir a senha.');
      }

      await this.authService.sendPasswordReset(email);
      this.authView.showMessage('E-mail de redefinição enviado.', 'success');
    });
  }

  async handleLogout() {
    await this.runAuthOperation(async () => {
      await this.authService.signOut();
    });
  }

  async importCsv(file, accountType) {
    if (!file) {
      return;
    }

    if (!this.state.user) {
      this.authView.showMessage('Faça login para importar arquivos.', 'error');
      return;
    }

    this.dashboardView.setBusy(true);
    this.overlayView.show(`Importando ${accountType}...`);

    try {
      const csvText = await file.text();
      const existingHashes = new Set(this.state.transactions.map((transaction) => transaction.hash));
      const parseResult = this.csvImportService.parseContent(csvText, accountType, existingHashes);

      if (parseResult.transactions.length === 0) {
        this.overlayView.log('Nenhuma transação nova foi identificada.');
        this.overlayView.log(`Itens ignorados: ${parseResult.skipped}`);
        setTimeout(() => this.overlayView.hide(), 1000);
        return;
      }

      const memoryApplied = this.categoryMemoryService.applyMemoryToTransactions(
        parseResult.transactions,
        this.state.transactions,
        { onlyOthers: true }
      );
      const transactionsToInsert = memoryApplied.transactions;

      if (memoryApplied.updates.length > 0) {
        this.overlayView.log(
          `Memória interna aplicou ${memoryApplied.updates.length} categoria(s) automaticamente no momento da importação.`
        );
      }

      const insertedTransactions = await this.repository.bulkInsert(this.state.user.uid, transactionsToInsert, {
        batchSize: 100,
        onProgress: (done, total) => {
          this.overlayView.log(`Importados ${done}/${total} lançamentos.`);
        }
      });

      this.setTransactionsAndRefresh([...this.state.transactions, ...insertedTransactions]);

      this.overlayView.log(
        `Importação concluída: ${transactionsToInsert.length} novos lançamentos, ${parseResult.skipped} ignorados.`
      );
      setTimeout(() => this.overlayView.hide(), 900);
    } catch (error) {
      this.overlayView.showError(this.normalizeError(error));
    } finally {
      this.dashboardView.setBusy(false);
    }
  }

  async toggleActive(docId, currentState) {
    if (!this.state.user) {
      return;
    }

    try {
      await this.repository.toggleActive(this.state.user.uid, docId, currentState);
      const nextState = !currentState;
      this.setTransactionsAndRefresh(
        this.state.transactions.map((transaction) =>
          transaction.docId === docId ? { ...transaction, active: nextState } : transaction
        )
      );
    } catch (error) {
      this.authView.showMessage(this.normalizeError(error), 'error');
    }
  }

  async updateCategory(docId, category) {
    if (!this.state.user) {
      return;
    }

    const normalizedCategory = String(category || '').trim();
    if (!normalizedCategory) {
      this.authView.showMessage('Categoria inválida.', 'error');
      return;
    }

    try {
      const targetTransaction = this.state.transactions.find((transaction) => transaction.docId === docId);
      const updatesByDocId = new Map([[docId, normalizedCategory]]);

      if (targetTransaction) {
        const targetGroupKey = getInstallmentGroupKey(targetTransaction.title);
        const targetInstallmentInfo = getInstallmentInfo(targetTransaction.title);

        if (targetGroupKey && targetInstallmentInfo) {
          this.state.transactions.forEach((transaction) => {
            if (transaction.docId === docId || transaction.accountType !== targetTransaction.accountType) {
              return;
            }

            const transactionGroupKey = getInstallmentGroupKey(transaction.title);
            const transactionInstallmentInfo = getInstallmentInfo(transaction.title);
            if (!transactionGroupKey || !transactionInstallmentInfo) {
              return;
            }

            const isSameInstallmentSeries =
              transactionGroupKey === targetGroupKey && transactionInstallmentInfo.total === targetInstallmentInfo.total;

            if (isSameInstallmentSeries) {
              updatesByDocId.set(transaction.docId, normalizedCategory);
            }
          });
        }
      }

      const updates = [...updatesByDocId].map(([nextDocId, nextCategory]) => ({
        docId: nextDocId,
        category: nextCategory
      }));

      if (updates.length === 1) {
        await this.repository.updateCategory(this.state.user.uid, docId, normalizedCategory);
      } else {
        await this.repository.batchUpdateCategories(this.state.user.uid, updates, { batchSize: 100 });
      }

      this.setTransactionsAndRefresh(
        this.state.transactions.map((transaction) =>
          updatesByDocId.has(transaction.docId)
            ? { ...transaction, category: updatesByDocId.get(transaction.docId) }
            : transaction
        )
      );
    } catch (error) {
      this.authView.showMessage(this.normalizeError(error), 'error');
    }
  }

  async createAndAssignCategory(docId, categoryName) {
    if (!this.state.user) {
      return;
    }

    const name = String(categoryName || '').trim();
    if (!name) {
      this.authView.showMessage('Informe um nome para a categoria.', 'error');
      return;
    }

    try {
      const createdName = await this.repository.createCategory(this.state.user.uid, name);
      if (!this.state.userCategories.some((category) => category.toLowerCase() === createdName.toLowerCase())) {
        this.state.setUserCategories([...this.state.userCategories, createdName]);
      }

      await this.updateCategory(docId, createdName);
    } catch (error) {
      this.authView.showMessage(this.normalizeError(error), 'error');
    }
  }

  async syncCategoriesWithAi() {
    if (!this.state.user) {
      this.authView.showMessage('Faça login para usar a IA.', 'error');
      return;
    }

    const visibleTransactions = this.getVisibleTransactions();
    const candidates = this.queryService.getAiCandidates(visibleTransactions);

    if (candidates.length === 0) {
      window.alert('Nada para categorizar no período filtrado.');
      return;
    }

    this.dashboardView.setBusy(true);
    this.overlayView.show('Inteligência Artificial: categorizando ciclo...');

    try {
      const memoryResult = this.categoryMemoryService.suggestCategories(candidates, this.state.transactions);
      const memoryUpdates = memoryResult.updates.map((item) => ({ docId: item.docId, category: item.category }));
      const unresolvedCandidates = memoryResult.unresolved;

      this.overlayView.log(
        `Memória interna: ${memoryUpdates.length} categorizadas sem IA, ${unresolvedCandidates.length} pendentes para IA.`
      );

      let aiUpdates = [];
      let failedChunks = [];

      if (unresolvedCandidates.length > 0) {
        const result = await this.aiService.categorizeTransactions(unresolvedCandidates, {
          onChunkProgress: (done, total) => {
            this.overlayView.log(`IA processou ${done}/${total} itens pendentes.`);
          },
          onChunkError: (error, index) => {
            this.overlayView.log(`Falha no lote ${index / this.aiService.chunkSize + 1}: ${this.normalizeError(error)}`);
          }
        });
        aiUpdates = result.updates;
        failedChunks = result.failedChunks;
      }

      const updates = [...memoryUpdates, ...aiUpdates];

      if (updates.length === 0) {
        this.overlayView.log('Nenhuma atualização de categoria foi aplicada.');
        if (failedChunks.length > 0) {
          this.overlayView.log(`${failedChunks.length} lote(s) falharam por indisponibilidade temporária da IA.`);
        }
        setTimeout(() => this.overlayView.hide(), 1000);
        return;
      }

      await this.repository.batchUpdateCategories(this.state.user.uid, updates, {
        batchSize: 100,
        onProgress: (done, total) => {
          this.overlayView.log(`Atualizações aplicadas ${done}/${total}.`);
        }
      });

      const updateMap = new Map(updates.map((item) => [item.docId, item.category]));
      this.setTransactionsAndRefresh(
        this.state.transactions.map((transaction) =>
          updateMap.has(transaction.docId) ? { ...transaction, category: updateMap.get(transaction.docId) } : transaction
        )
      );

      if (failedChunks.length > 0) {
        this.overlayView.log(
          `Concluído com alerta: ${failedChunks.length} lote(s) não foram processados e podem ser reenviados.`
        );
      }

      this.overlayView.log('Categorização concluída.');
      setTimeout(() => this.overlayView.hide(), 900);
    } catch (error) {
      this.overlayView.showError(this.normalizeError(error));
    } finally {
      this.dashboardView.setBusy(false);
    }
  }

  assertEmailAndPassword(email, password) {
    if (!email || !password) {
      throw new Error('Informe e-mail e senha.');
    }

    if (password.length < 6) {
      throw new Error('A senha deve ter no mínimo 6 caracteres.');
    }
  }

  normalizeAuthError(error) {
    if (error?.message && !error?.code) {
      return error.message;
    }

    return AUTH_ERROR_MESSAGES[error?.code] || this.normalizeError(error);
  }

  normalizeError(error) {
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
