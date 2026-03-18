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
  TransactionQueryService,
  getInstallmentGroupKey,
  getInstallmentInfo,
  matchesTransactionSearch,
  getTransactionTitleMatchKey
} from './utils/transaction-utils.js';
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
        this.refreshDashboard();
      },
      onSearchChange: (partialSearch) => {
        this.state.updateSearch(partialSearch);
        this.refreshDashboard();
      },
      onImportFile: (file, accountType) => this.importCsv(file, accountType),
      onAiCategorization: () => this.syncCategoriesWithAi(),
      onAiConsultant: () => this.runAiConsultant(),
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
      this.state.updateSearch({ mode: 'description', term: '', useGlobalBase: false });
      this.state.setAiConsultantReport(null);
      this.state.setAiConsultantUsage({ limit: 3, used: 0, remaining: 3, dateKey: '' });
      this.state.setAiConsultantHistory([]);
      this.refreshDashboard();
      return;
    }

    const cached = this.localCacheService.load(user.uid);
    if (cached.transactions.length > 0) {
      this.state.setTransactions(cached.transactions);
      this.state.setUserCategories(cached.categories || []);
      this.state.setAiConsultantHistory(cached.consultantInsights || []);
      this.refreshDashboard();
    }

    const shouldSyncCloud = !this.localCacheService.isFresh(cached.lastSyncedAt);
    await this.syncDataFromCloud({ force: shouldSyncCloud, showOverlay: shouldSyncCloud });
  }

  getVisibleTransactions() {
    return this.queryService.getVisibleTransactions(this.state.transactions, this.state.getFilterBoundaries());
  }

  getTableTransactions(sourceTransactions) {
    const term = this.state.search.term.trim();
    if (!term) {
      return sourceTransactions;
    }

    return sourceTransactions.filter((transaction) =>
      matchesTransactionSearch(transaction, this.state.search.mode, term)
    );
  }

  refreshDashboard() {
    const visibleTransactions = this.getVisibleTransactions();
    const trimmedSearchTerm = this.state.search.term.trim();
    const useGlobalBase = Boolean(this.state.search.useGlobalBase) && trimmedSearchTerm.length > 0;
    const searchSourceTransactions = useGlobalBase ? this.state.transactions : visibleTransactions;
    const tableTransactions = this.getTableTransactions(searchSourceTransactions);
    const summary = this.queryService.buildSummary(visibleTransactions);
    const pendingAiCount = this.queryService.getAiCandidates(visibleTransactions).length;
    const activeInsight = this.state.getAiConsultantHistory(this.buildConsultantInsightKey(this.state.filters));
    const activeTableTransactions = tableTransactions.filter((transaction) => transaction.active !== false);
    const matchedTotal = activeTableTransactions.reduce((sum, transaction) => sum + Number(transaction.value || 0), 0);
    const baseTotal = searchSourceTransactions.reduce((sum, transaction) => {
      if (transaction.active === false) {
        return sum;
      }

      return sum + Number(transaction.value || 0);
    }, 0);
    const percentageOfBase = baseTotal > 0 ? (matchedTotal / baseTotal) * 100 : 0;

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
      search: this.state.search,
      summary,
      previousSummary,
      tableTransactions,
      searchTotals: {
        hasSearch: trimmedSearchTerm.length > 0,
        mode: this.state.search.mode,
        term: trimmedSearchTerm,
        useGlobalBase,
        matchedCount: tableTransactions.length,
        matchedTotal,
        baseTotal,
        percentageOfBase
      },
      pendingAiCount,
      categories: availableCategories,
      aiConsultant: {
        ...this.state.aiConsultant,
        report: activeInsight?.insights || null
      }
    });
  }

  persistTransactionsCache() {
    if (!this.state.user) {
      return;
    }

    this.localCacheService.save(this.state.user.uid, {
      transactions: this.state.transactions,
      categories: this.state.userCategories,
      consultantInsights: Object.values(this.state.aiConsultant.historyByKey || {})
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
      const consultantInsightsPromise = this.repository
        .fetchConsultantInsights(this.state.user.uid)
        .catch((error) => {
          console.warn('Consultant insights sync skipped:', error);
          return [];
        });

      const [transactions, categories, consultantInsights] = await Promise.all([
        this.repository.fetchAll(this.state.user.uid),
        this.repository.fetchCategories(this.state.user.uid),
        consultantInsightsPromise
      ]);
      this.state.setUserCategories(categories);
      this.state.setAiConsultantHistory(consultantInsights);
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
      await this.syncDataFromCloud({ force: false, showOverlay: false });

      const fileContent = await file.text();
      const existingHashes = new Set(this.state.transactions.map((transaction) => transaction.hash));
      const parseResult = this.csvImportService.parseFileContent(
        file.name,
        fileContent,
        accountType,
        existingHashes
      );

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
        const targetTitleKey = getTransactionTitleMatchKey(targetTransaction.title);
        const targetGroupKey = getInstallmentGroupKey(targetTransaction.title);
        const targetInstallmentInfo = getInstallmentInfo(targetTransaction.title);

        this.state.transactions.forEach((transaction) => {
          if (transaction.docId === docId) {
            return;
          }

          const isSameAccountType = transaction.accountType === targetTransaction.accountType;
          const transactionGroupKey = getInstallmentGroupKey(transaction.title);
          const transactionInstallmentInfo = getInstallmentInfo(transaction.title);
          const isSameInstallmentSeries =
            Boolean(targetGroupKey) &&
            Boolean(targetInstallmentInfo) &&
            isSameAccountType &&
            Boolean(transactionGroupKey) &&
            Boolean(transactionInstallmentInfo) &&
            transactionGroupKey === targetGroupKey &&
            transactionInstallmentInfo.total === targetInstallmentInfo.total;

          if (isSameInstallmentSeries) {
            updatesByDocId.set(transaction.docId, normalizedCategory);
            return;
          }

          if (transaction.category !== 'Outros') {
            return;
          }

          const transactionTitleKey = getTransactionTitleMatchKey(transaction.title);
          const isSameTitle = Boolean(targetTitleKey) && transactionTitleKey === targetTitleKey;
          if (isSameTitle) {
            updatesByDocId.set(transaction.docId, normalizedCategory);
          }
        });
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

  buildConsultantPeriodSnapshot(periodDates, summary) {
    const categoryBreakdown = Object.entries(summary.categoryTotals)
      .sort((left, right) => right[1] - left[1])
      .map(([category, total]) => ({
        category,
        total: Number(total.toFixed(2))
      }));

    const topTransactions = [...summary.considered]
      .sort((left, right) => right.value - left.value)
      .slice(0, 20)
      .map((transaction) => ({
        date: transaction.date,
        title: transaction.title,
        category: transaction.category,
        value: Number(transaction.value.toFixed(2)),
        accountType: transaction.accountType
      }));

    return {
      ...periodDates,
      total: Number(summary.total.toFixed(2)),
      count: summary.considered.length,
      ignoredTotal: Number(summary.ignoredTotal.toFixed(2)),
      ignoredCount: summary.ignored.length,
      categoryBreakdown,
      topTransactions
    };
  }

  buildConsultantInsightKey(filters) {
    const payload = JSON.stringify({
      startDate: filters.startDate,
      endDate: filters.endDate,
      accountType: filters.accountType,
      category: filters.category
    });
    return btoa(unescape(encodeURIComponent(payload)))
      .replace(/=+$/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  async runAiConsultant() {
    if (!this.state.user) {
      this.authView.showMessage('Faça login para usar o Consultor IA.', 'error');
      return;
    }

    const currentVisibleTransactions = this.getVisibleTransactions();
    const currentSummary = this.queryService.buildSummary(currentVisibleTransactions);

    const previousStartDate = shiftInputDateByMonths(this.state.filters.startDate, -1);
    const previousEndDate = shiftInputDateByMonths(this.state.filters.endDate, -1);
    const previousBounds = {
      ...this.state.getFilterBoundaries(),
      cycleStart: new Date(`${previousStartDate}T00:00:00`),
      cycleEnd: new Date(`${previousEndDate}T23:59:59`)
    };
    const previousVisibleTransactions = this.queryService.getVisibleTransactions(this.state.transactions, previousBounds);
    const previousSummary = this.queryService.buildSummary(previousVisibleTransactions);

    if (currentSummary.considered.length === 0 && previousSummary.considered.length === 0) {
      window.alert('Sem gastos suficientes no período atual e anterior para gerar insights.');
      return;
    }

    const insightKey = this.buildConsultantInsightKey(this.state.filters);
    const existingInsight = this.state.getAiConsultantHistory(insightKey);
    if (existingInsight?.insights) {
      this.state.setAiConsultantReport(existingInsight.insights);
      this.refreshDashboard();
      this.overlayView.show('Consultor IA: carregando insight salvo...');
      this.overlayView.log('Insight encontrado na base para este período. Nenhuma nova consulta foi necessária.');
      setTimeout(() => this.overlayView.hide(), 800);
      return;
    }

    const payload = {
      appId: this.config.appId,
      insightKey,
      filters: {
        startDate: this.state.filters.startDate,
        endDate: this.state.filters.endDate,
        accountType: this.state.filters.accountType,
        category: this.state.filters.category
      },
      currentPeriod: this.buildConsultantPeriodSnapshot(
        { startDate: this.state.filters.startDate, endDate: this.state.filters.endDate },
        currentSummary
      ),
      previousPeriod: this.buildConsultantPeriodSnapshot(
        { startDate: previousStartDate, endDate: previousEndDate },
        previousSummary
      )
    };

    this.dashboardView.setBusy(true);
    this.overlayView.show('Consultor IA: analisando o comportamento de gastos...');

    try {
      const result = await this.aiConsultantService.analyzeSpending(payload);
      const storedInsight = result.storedInsight || {
        key: insightKey,
        filters: payload.filters,
        currentPeriod: {
          startDate: payload.currentPeriod.startDate,
          endDate: payload.currentPeriod.endDate
        },
        previousPeriod: {
          startDate: payload.previousPeriod.startDate,
          endDate: payload.previousPeriod.endDate
        },
        generatedAt: new Date().toISOString(),
        insights: result.insights
      };

      this.state.setAiConsultantReport(storedInsight.insights);
      this.state.upsertAiConsultantHistory(storedInsight);
      this.persistTransactionsCache();
      if (result.usage) {
        this.state.setAiConsultantUsage(result.usage);
      }

      this.refreshDashboard();
      this.overlayView.log('Insights gerados com sucesso.');
      setTimeout(() => this.overlayView.hide(), 900);
    } catch (error) {
      if (Number(error?.status) === 429 || error?.details?.dailyLimitReached) {
        this.state.setAiConsultantUsage(error?.details?.usage || { limit: 3, used: 3, remaining: 0 });
        this.refreshDashboard();
        this.overlayView.showError('Limite diário do Consultor IA atingido (3 análises por dia).');
      } else {
        this.overlayView.showError(this.normalizeError(error));
      }
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
