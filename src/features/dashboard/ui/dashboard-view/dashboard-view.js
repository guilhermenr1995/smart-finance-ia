import { CATEGORIES, DEFAULT_BANK_ACCOUNT, DEFAULT_PAGE_SIZE, getMonthKeyFromDate } from './shared.js';
import { registerCoreMethods } from './methods/core-methods.js';
import { registerBindEventsCoreMethods } from './methods/bind-events-core-methods.js';
import { registerBindEventsModalMethods } from './methods/bind-events-modal-methods.js';
import { registerInteractionMethods } from './methods/interaction-methods.js';
import { registerModalMethods } from './methods/modal-methods.js';
import { registerRenderSummaryMethods } from './methods/render-summary-methods.js';
import { registerRenderEngagementMethods } from './methods/render-engagement-methods.js';
import { registerPaginationGoalsMethods } from './methods/pagination-goals-methods.js';
import { registerAiMethods } from './methods/ai-methods.js';
import { registerTransactionRenderMethods } from './methods/transaction-render-methods.js';

export class DashboardView {
  constructor() {
    this.startDateInput = document.getElementById('data-inicio');
    this.endDateInput = document.getElementById('data-fim');
    this.categoryFilterSelect = document.getElementById('filter-category');
    this.searchModeSelect = document.getElementById('search-mode');
    this.searchTermInput = document.getElementById('search-term');
    this.clearSearchButton = document.getElementById('btn-clear-search');
    this.searchUseGlobalBaseCheckbox = document.getElementById('search-use-global-base');
    this.sourceFilterSelect = document.getElementById('filter-source');
    this.sectionsContainer = document.getElementById('dashboard-sections');
    this.floatingFiltersBar = document.getElementById('dashboard-floating-filters');
    this.floatingTotalValue = document.getElementById('floating-total-value');

    this.accountFilterButtons = {
      all: Array.from(document.querySelectorAll('[data-account-filter="all"]')),
      'Crédito': Array.from(document.querySelectorAll('[data-account-filter="Crédito"]')),
      Conta: Array.from(document.querySelectorAll('[data-account-filter="Conta"]'))
    };

    this.creditFileInput = document.getElementById('file-credit');
    this.accountFileInput = document.getElementById('file-account');
    this.bankGuideSelect = document.getElementById('bank-guide-select');
    this.openBankGuideButton = document.getElementById('btn-open-bank-guide');
    this.bankGuideModal = document.getElementById('bank-guide-modal');
    this.bankGuideTitle = document.getElementById('bank-guide-title');
    this.bankGuideFormat = document.getElementById('bank-guide-format');
    this.bankGuideSteps = document.getElementById('bank-guide-steps');
    this.bankGuideCloseButton = document.getElementById('bank-guide-close');
    this.importBankAccountButton = document.getElementById('import-bank-account-button');
    this.importBankAccountValue = document.getElementById('import-bank-account-value');
    this.aiButton = document.getElementById('btn-ai-sync');
    this.aiConsultantButton = document.getElementById('btn-ai-consultant');
    this.aiConsultantUsageLabel = document.getElementById('label-ai-consultant-usage');
    this.aiConsultantStatusLabel = document.getElementById('ai-consultant-status');
    this.aiConsultantPlaceholder = document.getElementById('ai-consultant-placeholder');
    this.aiConsultantContent = document.getElementById('ai-consultant-content');
    this.openFinanceRefreshButton = document.getElementById('btn-open-finance-refresh');
    this.openFinanceConnectionsContainer = document.getElementById('open-finance-connections');
    this.openFinanceConnectButtons = Array.from(document.querySelectorAll('.open-finance-connect-btn'));

    this.ritmoStatusPill = document.getElementById('ritmo-status-pill');
    this.ritmoBudgetValue = document.getElementById('ritmo-budget');
    this.ritmoRealizedValue = document.getElementById('ritmo-realized');
    this.ritmoExpectedValue = document.getElementById('ritmo-expected');
    this.ritmoRecommendation = document.getElementById('ritmo-recommendation');
    this.ritmoLegend = document.getElementById('ritmo-legend');
    this.ritmoDailyChart = document.getElementById('ritmo-daily-chart');
    this.ritmoDailyTooltip = document.getElementById('ritmo-daily-tooltip');

    this.totalValue = document.getElementById('total-fatura-val');
    this.ignoredValue = document.getElementById('valor-ignorado');
    this.cycleLegend = document.getElementById('legenda-ciclo');
    this.categoryPiePeriodLabel = document.getElementById('category-pie-period');
    this.categoryPieChart = document.getElementById('category-pie-chart');
    this.categoryPieCenterLabel = document.getElementById('category-pie-center-label');
    this.categoryPieTotal = document.getElementById('category-pie-total');
    this.categoryPieLegend = document.getElementById('category-pie-legend');
    this.categoryPieTooltip = document.getElementById('category-pie-tooltip');

    this.chartBars = document.getElementById('chart-bars');
    this.statsList = document.getElementById('stats-list');
    this.goalsReferenceMonthLabel = document.getElementById('goals-reference-month');
    this.goalsList = document.getElementById('goals-list');
    this.addGoalButton = document.getElementById('btn-goals-add');
    this.autoGoalsButton = document.getElementById('btn-goals-auto');
    this.deleteGoalsByMonthButton = document.getElementById('btn-goals-delete-month');
    this.itemsCounter = document.getElementById('contador-itens');
    this.tableBody = document.getElementById('tabela-corpo');
    this.searchSummaryPanel = document.getElementById('search-summary-panel');
    this.searchSummaryTitle = document.getElementById('search-summary-title');
    this.searchSummaryBaseLabel = document.getElementById('search-summary-base-label');
    this.searchSummaryMatchedValue = document.getElementById('search-summary-matched-value');
    this.searchSummaryBaseValue = document.getElementById('search-summary-base-value');
    this.searchSummaryShare = document.getElementById('search-summary-share');
    this.transactionsPaginationPanel = document.getElementById('transactions-pagination');
    this.paginationRangeLabel = document.getElementById('pagination-range');
    this.paginationStatusLabel = document.getElementById('pagination-status');
    this.paginationPrevButton = document.getElementById('pagination-prev');
    this.paginationNextButton = document.getElementById('pagination-next');
    this.paginationPageSizeSelect = document.getElementById('pagination-page-size');
    this.aiPendingLabel = document.getElementById('label-ia-count');
    this.addTransactionButton = document.getElementById('btn-add-transaction');

    this.categoryPickerModal = document.getElementById('category-picker-modal');
    this.categoryPickerInput = document.getElementById('category-picker-input');
    this.categoryPickerList = document.getElementById('category-picker-list');
    this.categoryPickerCreateButton = document.getElementById('category-picker-create');
    this.categoryPickerCloseButton = document.getElementById('category-picker-close');
    this.bankAccountPickerModal = document.getElementById('bank-account-picker-modal');
    this.bankAccountPickerTitle = document.getElementById('bank-account-picker-title');
    this.bankAccountPickerInput = document.getElementById('bank-account-picker-input');
    this.bankAccountPickerList = document.getElementById('bank-account-picker-list');
    this.bankAccountPickerCreateButton = document.getElementById('bank-account-picker-create');
    this.bankAccountPickerCloseButton = document.getElementById('bank-account-picker-close');
    this.transactionCreateModal = document.getElementById('transaction-create-modal');
    this.transactionCreateForm = document.getElementById('transaction-create-form');
    this.transactionCreateCloseButton = document.getElementById('transaction-create-close');
    this.transactionCreateTitleInput = document.getElementById('transaction-create-title');
    this.transactionCreateCategorySelect = document.getElementById('transaction-create-category');
    this.transactionCreateBankAccountSelect = document.getElementById('transaction-create-bank-account');
    this.transactionCreateValueInput = document.getElementById('transaction-create-value');
    this.transactionCreateAccountTypeSelect = document.getElementById('transaction-create-account-type');
    this.titleEditorModal = document.getElementById('title-editor-modal');
    this.titleEditorForm = document.getElementById('title-editor-form');
    this.titleEditorCloseButton = document.getElementById('title-editor-close');
    this.titleEditorInput = document.getElementById('title-editor-input');
    this.goalModal = document.getElementById('goal-modal');
    this.goalModalTitle = document.getElementById('goal-modal-title');
    this.goalModalMonthLabel = document.getElementById('goal-modal-month');
    this.goalForm = document.getElementById('goal-form');
    this.goalCloseButton = document.getElementById('goal-close');
    this.goalCategorySelect = document.getElementById('goal-category');
    this.goalTargetValueInput = document.getElementById('goal-target-value');
    this.goalRationaleInput = document.getElementById('goal-rationale');

    this.handlers = null;
    this.availableCategories = [...CATEGORIES];
    this.availableBankAccounts = [DEFAULT_BANK_ACCOUNT];
    this.selectedImportBankAccount = DEFAULT_BANK_ACCOUNT;
    this.activePickerDocId = null;
    this.activeBankAccountPickerDocId = null;
    this.activeTitleEditorDocId = null;
    this.isImportBankAccountPickerMode = false;
    this.activeGoalDocId = null;
    this.activeGoalMonthKey = getMonthKeyFromDate(new Date());
    this.isGoalCreationAllowed = true;
    this.activeTooltipTrigger = null;
    this.isBusy = false;
    this.consultantHasRemaining = true;
    this.pagination = {
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      totalPages: 1,
      totalItems: 0
    };

    this.initCategoryFilter();
    this.initPagination();
    this.initBankGuide();
    this.bindTooltipInteractions();
    this.initSectionAccordions();
  }
}

registerCoreMethods(DashboardView);
registerBindEventsCoreMethods(DashboardView);
registerBindEventsModalMethods(DashboardView);
registerInteractionMethods(DashboardView);
registerModalMethods(DashboardView);
registerRenderSummaryMethods(DashboardView);
registerRenderEngagementMethods(DashboardView);
registerPaginationGoalsMethods(DashboardView);
registerAiMethods(DashboardView);
registerTransactionRenderMethods(DashboardView);
