import { CATEGORIES } from '../constants/categories.js';
import { toBrDate } from '../utils/date-utils.js';
import { escapeHtml, formatCompactCurrency, formatCurrencyBRL } from '../utils/format-utils.js';
import { getDisplayCategory, sortTransactionsByDateDesc } from '../utils/transaction-utils.js';

function normalizeForSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const DEFAULT_BANK_ACCOUNT = 'Padrão';
const DEFAULT_PAGE_SIZE = 30;
const BANK_GUIDE_STORAGE_KEY = 'smart-finance-bank-guide';
const BANK_EXPORT_GUIDES = {
  nubank: {
    label: 'Nubank',
    formats: 'Conta OFX | Cartão CSV',
    steps: [
      'Abra Conta ou Cartão no app.',
      'Entre em Extrato/Fatura e ajuste o período.',
      'Use Exportar/Compartilhar e salve em OFX (conta) ou CSV (fatura).'
    ]
  },
  itau: {
    label: 'Itaú',
    formats: 'Conta e Cartão em PDF | OFX no internet banking (quando disponível)',
    steps: [
      'No app: Conta > Extrato > selecione o período > Compartilhar/Salvar PDF.',
      'Para cartão: Cartões > Fatura > Baixar/Compartilhar PDF.',
      'No internet banking web, procure por Extrato com opção de exportação OFX para importação estruturada.'
    ]
  },
  bradesco: {
    label: 'Bradesco',
    formats: 'OFX ou PDF',
    steps: [
      'Acesse Extrato por período na conta desejada.',
      'Abra o menu de ações e escolha Exportar/Download.',
      'Priorize OFX; se não houver, use o PDF detalhado.'
    ]
  },
  santander: {
    label: 'Santander',
    formats: 'OFX/CSV/PDF',
    steps: [
      'Entre em Conta Corrente > Extrato no período desejado.',
      'Use Exportar/Download no extrato.',
      'Se OFX/CSV não estiver disponível no app, use o PDF detalhado.'
    ]
  },
  'banco-do-brasil': {
    label: 'Banco do Brasil',
    formats: 'OFX ou PDF',
    steps: [
      'Acesse Conta > Extratos e selecione o período.',
      'Use Download/Exportação do extrato.',
      'Priorize OFX; caso não exista, utilize o PDF detalhado.'
    ]
  },
  caixa: {
    label: 'Caixa',
    formats: 'OFX/PDF',
    steps: [
      'Abra Extrato detalhado ou Movimentações da conta.',
      'No menu do extrato, escolha Compartilhar/Exportar.',
      'Se CSV não existir, importe OFX ou PDF detalhado.'
    ]
  },
  inter: {
    label: 'Inter',
    formats: 'OFX/PDF',
    steps: [
      'Entre em Extrato/Movimentações e defina o período.',
      'Use Compartilhar/Exportar no extrato.',
      'Caso CSV não esteja disponível, use OFX ou PDF.'
    ]
  },
  outros: {
    label: 'Outros bancos',
    formats: 'CSV/OFX/PDF',
    steps: [
      'Procure por Extrato, Movimentações ou Histórico no período desejado.',
      'Use opções como Exportar, Download ou Compartilhar.',
      'Priorize OFX, depois CSV; se não houver, use PDF detalhado.'
    ]
  }
};

function normalizeBankAccountName(value) {
  const name = String(value || '').trim();
  return name || DEFAULT_BANK_ACCOUNT;
}

export class DashboardView {
  constructor() {
    this.startDateInput = document.getElementById('data-inicio');
    this.endDateInput = document.getElementById('data-fim');
    this.categoryFilterSelect = document.getElementById('filter-category');
    this.searchModeSelect = document.getElementById('search-mode');
    this.searchTermInput = document.getElementById('search-term');
    this.clearSearchButton = document.getElementById('btn-clear-search');
    this.searchUseGlobalBaseCheckbox = document.getElementById('search-use-global-base');

    this.accountFilterButtons = {
      all: document.getElementById('filter-all'),
      'Crédito': document.getElementById('filter-credit'),
      Conta: document.getElementById('filter-debit')
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

    this.totalValue = document.getElementById('total-fatura-val');
    this.ignoredValue = document.getElementById('valor-ignorado');
    this.cycleLegend = document.getElementById('legenda-ciclo');

    this.chartBars = document.getElementById('chart-bars');
    this.statsList = document.getElementById('stats-list');
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

    this.handlers = null;
    this.availableCategories = [...CATEGORIES];
    this.availableBankAccounts = [DEFAULT_BANK_ACCOUNT];
    this.selectedImportBankAccount = DEFAULT_BANK_ACCOUNT;
    this.activePickerDocId = null;
    this.activeBankAccountPickerDocId = null;
    this.activeTitleEditorDocId = null;
    this.isImportBankAccountPickerMode = false;
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
  }

  initCategoryFilter() {
    if (!this.categoryFilterSelect) {
      return;
    }

    this.categoryFilterSelect.innerHTML = [
      '<option value="all">Todas as categorias</option>',
      ...this.availableCategories.map(
        (category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`
      )
    ].join('');
  }

  setAvailableCategories(categories) {
    const merged = [...new Set([...CATEGORIES, ...(categories || [])])].sort((left, right) =>
      left.localeCompare(right, 'pt-BR')
    );

    this.availableCategories = merged;
    this.initCategoryFilter();
    this.renderTransactionCreateCategoryOptions();
  }

  setAvailableBankAccounts(bankAccounts) {
    const normalized = (bankAccounts || []).map((name) => normalizeBankAccountName(name));
    const unique = [...new Set([DEFAULT_BANK_ACCOUNT, ...normalized])].sort((left, right) => {
      if (left.toLowerCase() === DEFAULT_BANK_ACCOUNT.toLowerCase()) {
        return -1;
      }
      if (right.toLowerCase() === DEFAULT_BANK_ACCOUNT.toLowerCase()) {
        return 1;
      }

      return left.localeCompare(right, 'pt-BR');
    });

    this.availableBankAccounts = unique;
    this.renderTransactionCreateBankAccountOptions();

    if (!this.availableBankAccounts.includes(this.selectedImportBankAccount)) {
      this.setImportBankAccount(DEFAULT_BANK_ACCOUNT);
    } else {
      this.setImportBankAccount(this.selectedImportBankAccount);
    }
  }

  setImportBankAccount(bankAccountName) {
    this.selectedImportBankAccount = normalizeBankAccountName(bankAccountName);
    if (this.importBankAccountValue) {
      this.importBankAccountValue.innerText = this.selectedImportBankAccount;
    }
  }

  renderTransactionCreateCategoryOptions() {
    if (!this.transactionCreateCategorySelect) {
      return;
    }

    this.transactionCreateCategorySelect.innerHTML = this.availableCategories
      .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
      .join('');
  }

  renderTransactionCreateBankAccountOptions() {
    if (!this.transactionCreateBankAccountSelect) {
      return;
    }

    this.transactionCreateBankAccountSelect.innerHTML = this.availableBankAccounts
      .map((bankAccount) => `<option value="${escapeHtml(bankAccount)}">${escapeHtml(bankAccount)}</option>`)
      .join('');
  }

  setInitialFilters(filters, search = {}) {
    this.startDateInput.value = filters.startDate;
    this.endDateInput.value = filters.endDate;
    if (this.categoryFilterSelect) {
      this.categoryFilterSelect.value = filters.category;
    }
    this.setAccountFilterButton(filters.accountType);
    this.searchModeSelect.value = search.mode || 'description';
    this.searchTermInput.value = search.term || '';
    if (this.searchUseGlobalBaseCheckbox) {
      this.searchUseGlobalBaseCheckbox.checked = Boolean(search.useGlobalBase);
    }
    this.clearSearchButton.disabled = !this.searchTermInput.value.trim();
    this.setImportBankAccount(this.selectedImportBankAccount);
  }

  initPagination() {
    if (this.paginationPageSizeSelect) {
      this.paginationPageSizeSelect.value = String(DEFAULT_PAGE_SIZE);
    }
  }

  initBankGuide() {
    if (!this.bankGuideSelect) {
      return;
    }

    const options = Object.entries(BANK_EXPORT_GUIDES).map(
      ([key, guide]) => `<option value="${escapeHtml(key)}">${escapeHtml(guide.label)}</option>`
    );
    this.bankGuideSelect.innerHTML = options.join('');
    const lastBankGuide = this.getStoredBankGuideKey();
    this.bankGuideSelect.value = BANK_EXPORT_GUIDES[lastBankGuide] ? lastBankGuide : 'nubank';
  }

  resetPagination() {
    this.pagination.page = 1;
  }

  bindEvents(handlers) {
    this.handlers = handlers;

    this.startDateInput.addEventListener('change', () => {
      handlers.onFiltersChange({ startDate: this.startDateInput.value });
    });

    this.endDateInput.addEventListener('change', () => {
      handlers.onFiltersChange({ endDate: this.endDateInput.value });
    });

    if (this.categoryFilterSelect) {
      this.categoryFilterSelect.addEventListener('change', () => {
        handlers.onFiltersChange({ category: this.categoryFilterSelect.value });
      });
    }

    this.searchModeSelect.addEventListener('change', () => {
      handlers.onSearchChange({
        mode: this.searchModeSelect.value
      });
    });

    this.searchTermInput.addEventListener('input', () => {
      handlers.onSearchChange({
        term: this.searchTermInput.value
      });
    });

    this.searchUseGlobalBaseCheckbox?.addEventListener('change', () => {
      handlers.onSearchChange({
        useGlobalBase: this.searchUseGlobalBaseCheckbox?.checked
      });
    });

    this.clearSearchButton.addEventListener('click', () => {
      this.searchTermInput.value = '';
      handlers.onSearchChange({ term: '' });
    });

    this.paginationPageSizeSelect?.addEventListener('change', () => {
      const selectedPageSize = Number(this.paginationPageSizeSelect.value);
      if (!Number.isFinite(selectedPageSize) || selectedPageSize <= 0) {
        return;
      }

      this.pagination.pageSize = selectedPageSize;
      this.pagination.page = 1;
      handlers.onPaginationChange?.();
    });

    this.paginationPrevButton?.addEventListener('click', () => {
      if (this.pagination.page <= 1) {
        return;
      }

      this.pagination.page -= 1;
      handlers.onPaginationChange?.();
    });

    this.paginationNextButton?.addEventListener('click', () => {
      if (this.pagination.page >= this.pagination.totalPages) {
        return;
      }

      this.pagination.page += 1;
      handlers.onPaginationChange?.();
    });

    Object.entries(this.accountFilterButtons).forEach(([accountType, button]) => {
      button.addEventListener('click', () => {
        handlers.onFiltersChange({ accountType });
      });
    });

    this.creditFileInput.addEventListener('change', () => {
      const [file] = this.creditFileInput.files || [];
      handlers.onImportFile(file, 'Crédito', this.selectedImportBankAccount);
      this.creditFileInput.value = '';
    });

    this.accountFileInput.addEventListener('change', () => {
      const [file] = this.accountFileInput.files || [];
      handlers.onImportFile(file, 'Conta', this.selectedImportBankAccount);
      this.accountFileInput.value = '';
    });

    this.openBankGuideButton?.addEventListener('click', () => {
      this.openBankGuideModal(this.bankGuideSelect?.value);
    });

    this.bankGuideSelect?.addEventListener('change', () => {
      this.storeBankGuideKey(this.bankGuideSelect?.value);
    });

    this.bankGuideCloseButton?.addEventListener('click', () => {
      this.closeBankGuideModal();
    });

    this.bankGuideModal?.addEventListener('click', (event) => {
      if (event.target === this.bankGuideModal) {
        this.closeBankGuideModal();
      }
    });

    this.importBankAccountButton?.addEventListener('click', () => {
      this.openBankAccountPicker({
        forImport: true,
        currentBankAccount: this.selectedImportBankAccount
      });
    });

    this.addTransactionButton?.addEventListener('click', () => {
      this.openTransactionCreateModal();
    });

    this.aiButton.addEventListener('click', () => {
      handlers.onAiCategorization();
    });

    this.aiConsultantButton.addEventListener('click', () => {
      handlers.onAiConsultant();
    });

    this.tableBody.addEventListener('click', (event) => {
      const toggleTarget = event.target.closest('[data-action="toggle-active"]');
      if (toggleTarget) {
        handlers.onToggleActive({
          docId: toggleTarget.dataset.docId,
          currentState: toggleTarget.dataset.active === 'true'
        });
        return;
      }

      const openPickerTarget = event.target.closest('[data-action="open-category-picker"]');
      if (openPickerTarget) {
        this.openCategoryPicker(openPickerTarget.dataset.docId, openPickerTarget.dataset.currentCategory);
        return;
      }

      const openTitleEditorTarget = event.target.closest('[data-action="open-title-editor"]');
      if (openTitleEditorTarget) {
        this.openTitleEditor({
          docId: openTitleEditorTarget.dataset.docId,
          title: openTitleEditorTarget.dataset.currentTitle
        });
        return;
      }

      const openBankAccountPickerTarget = event.target.closest('[data-action="open-bank-account-picker"]');
      if (!openBankAccountPickerTarget) {
        return;
      }

      this.openBankAccountPicker({
        docId: openBankAccountPickerTarget.dataset.docId,
        currentBankAccount: openBankAccountPickerTarget.dataset.currentBankAccount
      });
    });

    this.categoryPickerCloseButton.addEventListener('click', () => {
      this.closeCategoryPicker();
    });

    this.categoryPickerModal.addEventListener('click', (event) => {
      if (event.target === this.categoryPickerModal) {
        this.closeCategoryPicker();
      }
    });

    this.categoryPickerInput.addEventListener('input', () => {
      this.renderCategoryPickerOptions();
    });

    this.categoryPickerList.addEventListener('click', async (event) => {
      const target = event.target.closest('[data-action="choose-category"]');
      if (!target || !this.activePickerDocId) {
        return;
      }

      await this.handlers.onCategoryUpdate({
        docId: this.activePickerDocId,
        category: target.dataset.category
      });

      this.closeCategoryPicker();
    });

    this.categoryPickerCreateButton.addEventListener('click', async () => {
      const name = this.categoryPickerInput.value.trim();
      if (!name || !this.activePickerDocId) {
        return;
      }

      await this.handlers.onCreateCategory({
        docId: this.activePickerDocId,
        categoryName: name
      });

      this.closeCategoryPicker();
    });

    this.bankAccountPickerCloseButton.addEventListener('click', () => {
      this.closeBankAccountPicker();
    });

    this.bankAccountPickerModal.addEventListener('click', (event) => {
      if (event.target === this.bankAccountPickerModal) {
        this.closeBankAccountPicker();
      }
    });

    this.bankAccountPickerInput.addEventListener('input', () => {
      this.renderBankAccountPickerOptions();
    });

    this.bankAccountPickerList.addEventListener('click', async (event) => {
      const target = event.target.closest('[data-action="choose-bank-account"]');
      if (!target) {
        return;
      }

      const selectedBankAccount = target.dataset.bankAccount;
      if (this.isImportBankAccountPickerMode) {
        this.setImportBankAccount(selectedBankAccount);
        this.closeBankAccountPicker();
        return;
      }

      if (!this.activeBankAccountPickerDocId) {
        return;
      }

      await this.handlers.onBankAccountUpdate({
        docId: this.activeBankAccountPickerDocId,
        bankAccount: selectedBankAccount
      });

      this.closeBankAccountPicker();
    });

    this.bankAccountPickerCreateButton.addEventListener('click', async () => {
      const name = this.bankAccountPickerInput.value.trim();
      if (!name) {
        return;
      }

      if (this.isImportBankAccountPickerMode) {
        const createdName = await this.handlers.onCreateBankAccount({
          bankAccountName: name
        });
        if (createdName) {
          this.setImportBankAccount(createdName);
        }
        this.closeBankAccountPicker();
        return;
      }

      if (!this.activeBankAccountPickerDocId) {
        return;
      }

      await this.handlers.onCreateAndAssignBankAccount({
        docId: this.activeBankAccountPickerDocId,
        bankAccountName: name
      });

      this.closeBankAccountPicker();
    });

    this.transactionCreateCloseButton?.addEventListener('click', () => {
      this.closeTransactionCreateModal();
    });

    this.transactionCreateModal?.addEventListener('click', (event) => {
      if (event.target === this.transactionCreateModal) {
        this.closeTransactionCreateModal();
      }
    });

    this.transactionCreateForm?.addEventListener('submit', async (event) => {
      event.preventDefault();

      const created = await this.handlers.onCreateTransaction({
        title: this.transactionCreateTitleInput.value,
        category: this.transactionCreateCategorySelect.value,
        bankAccount: this.transactionCreateBankAccountSelect.value,
        value: this.transactionCreateValueInput.value,
        accountType: this.transactionCreateAccountTypeSelect.value
      });

      if (created) {
        this.closeTransactionCreateModal();
      }
    });

    this.titleEditorCloseButton?.addEventListener('click', () => {
      this.closeTitleEditor();
    });

    this.titleEditorModal?.addEventListener('click', (event) => {
      if (event.target === this.titleEditorModal) {
        this.closeTitleEditor();
      }
    });

    this.titleEditorForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!this.activeTitleEditorDocId) {
        return;
      }

      const updated = await this.handlers.onTitleUpdate({
        docId: this.activeTitleEditorDocId,
        title: this.titleEditorInput.value
      });

      if (updated) {
        this.closeTitleEditor();
      }
    });
  }

  bindTooltipInteractions() {
    document.addEventListener('click', (event) => {
      const trigger = event.target.closest('.help-tooltip');
      if (trigger) {
        event.preventDefault();

        if (this.activeTooltipTrigger === trigger) {
          this.closeTooltip();
          return;
        }

        this.closeTooltip();
        trigger.classList.add('is-open');
        this.activeTooltipTrigger = trigger;
        return;
      }

      this.closeTooltip();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.closeTooltip();
        this.closeBankGuideModal();
      }
    });

    window.addEventListener(
      'scroll',
      () => {
        this.closeTooltip();
      },
      true
    );
  }

  closeTooltip() {
    if (!this.activeTooltipTrigger) {
      return;
    }

    this.activeTooltipTrigger.classList.remove('is-open');
    this.activeTooltipTrigger = null;
  }

  openBankGuideModal(bankKey) {
    if (!this.bankGuideModal || !this.bankGuideTitle || !this.bankGuideFormat || !this.bankGuideSteps) {
      return;
    }

    const normalizedKey = String(bankKey || 'nubank').trim();
    const guide = BANK_EXPORT_GUIDES[normalizedKey] || BANK_EXPORT_GUIDES.nubank;
    this.storeBankGuideKey(normalizedKey);

    this.bankGuideTitle.innerText = guide.label;
    this.bankGuideFormat.innerText = guide.formats;
    this.bankGuideSteps.innerHTML = (Array.isArray(guide.steps) ? guide.steps : [])
      .map(
        (step, index) => `
          <li class="bank-guide-step-item">
            <span class="bank-guide-step-index">${index + 1}</span>
            <p class="bank-guide-step-text">${escapeHtml(step)}</p>
          </li>
        `
      )
      .join('');
    this.bankGuideModal.classList.remove('hidden');
  }

  closeBankGuideModal() {
    this.bankGuideModal?.classList.add('hidden');
  }

  getStoredBankGuideKey() {
    try {
      return String(window.localStorage.getItem(BANK_GUIDE_STORAGE_KEY) || '').trim().toLowerCase();
    } catch (error) {
      return '';
    }
  }

  storeBankGuideKey(bankKey) {
    try {
      const normalizedKey = String(bankKey || '').trim().toLowerCase();
      if (!BANK_EXPORT_GUIDES[normalizedKey]) {
        return;
      }
      window.localStorage.setItem(BANK_GUIDE_STORAGE_KEY, normalizedKey);
    } catch (error) {
      // Local storage may be blocked in some private browsers.
    }
  }

  setBusy(isBusy) {
    this.isBusy = isBusy;
    this.aiButton.disabled = isBusy;
    this.creditFileInput.disabled = isBusy;
    this.accountFileInput.disabled = isBusy;
    if (this.importBankAccountButton) {
      this.importBankAccountButton.disabled = isBusy;
    }
    if (this.addTransactionButton) {
      this.addTransactionButton.disabled = isBusy;
    }
    if (this.paginationPageSizeSelect) {
      this.paginationPageSizeSelect.disabled = isBusy;
    }
    if (this.paginationPrevButton) {
      this.paginationPrevButton.disabled = isBusy || this.pagination.page <= 1;
    }
    if (this.paginationNextButton) {
      this.paginationNextButton.disabled = isBusy || this.pagination.page >= this.pagination.totalPages;
    }
    this.aiConsultantButton.disabled = isBusy || !this.consultantHasRemaining;
  }

  setAccountFilterButton(accountType) {
    Object.values(this.accountFilterButtons).forEach((button) => {
      button.classList.remove('filter-active');
    });

    const selectedButton = this.accountFilterButtons[accountType] || this.accountFilterButtons.all;
    selectedButton.classList.add('filter-active');
  }

  openCategoryPicker(docId, currentCategory) {
    this.activePickerDocId = docId;
    this.categoryPickerInput.value = currentCategory || '';
    this.renderCategoryPickerOptions();
    this.categoryPickerModal.classList.remove('hidden');
    this.categoryPickerInput.focus();
    this.categoryPickerInput.select();
  }

  closeCategoryPicker() {
    this.activePickerDocId = null;
    this.categoryPickerModal.classList.add('hidden');
  }

  renderCategoryPickerOptions() {
    const query = this.categoryPickerInput.value.trim();
    const normalizedQuery = normalizeForSearch(query);

    const filtered = this.availableCategories.filter((category) => {
      if (!normalizedQuery) {
        return true;
      }

      return normalizeForSearch(category).includes(normalizedQuery);
    });

    this.categoryPickerList.innerHTML = filtered
      .map(
        (category) =>
          `<button data-action="choose-category" data-category="${escapeHtml(category)}" class="w-full text-left px-3 py-2 border border-black text-xs font-black uppercase hover:bg-yellow-200">${escapeHtml(category)}</button>`
      )
      .join('');

    const hasExact = this.availableCategories.some(
      (category) => normalizeForSearch(category) === normalizeForSearch(query)
    );

    const shouldShowCreate = query.length > 0 && !hasExact;
    this.categoryPickerCreateButton.classList.toggle('hidden', !shouldShowCreate);
    this.categoryPickerCreateButton.innerText = `+ Criar "${query}"`;

    if (!this.categoryPickerList.innerHTML) {
      this.categoryPickerList.innerHTML =
        '<p class="text-[11px] font-black uppercase text-zinc-500">Nenhuma categoria encontrada.</p>';
    }
  }

  openBankAccountPicker({ docId = null, currentBankAccount = DEFAULT_BANK_ACCOUNT, forImport = false } = {}) {
    this.activeBankAccountPickerDocId = docId;
    this.isImportBankAccountPickerMode = Boolean(forImport);
    this.bankAccountPickerTitle.innerText = forImport ? 'Conta Bancária da Importação' : 'Selecionar Conta Bancária';
    this.bankAccountPickerInput.value = normalizeBankAccountName(currentBankAccount);
    this.renderBankAccountPickerOptions();
    this.bankAccountPickerModal.classList.remove('hidden');
    this.bankAccountPickerInput.focus();
    this.bankAccountPickerInput.select();
  }

  closeBankAccountPicker() {
    this.activeBankAccountPickerDocId = null;
    this.isImportBankAccountPickerMode = false;
    this.bankAccountPickerModal.classList.add('hidden');
  }

  openTransactionCreateModal() {
    this.renderTransactionCreateCategoryOptions();
    this.renderTransactionCreateBankAccountOptions();
    this.transactionCreateTitleInput.value = '';
    this.transactionCreateValueInput.value = '';
    this.transactionCreateAccountTypeSelect.value = 'Crédito';
    this.transactionCreateCategorySelect.value = this.availableCategories.includes('Outros')
      ? 'Outros'
      : this.availableCategories[0] || 'Outros';
    this.transactionCreateBankAccountSelect.value = this.selectedImportBankAccount || DEFAULT_BANK_ACCOUNT;
    this.transactionCreateModal.classList.remove('hidden');
    this.transactionCreateTitleInput.focus();
  }

  closeTransactionCreateModal() {
    this.transactionCreateModal.classList.add('hidden');
  }

  openTitleEditor({ docId, title }) {
    this.activeTitleEditorDocId = docId;
    this.titleEditorInput.value = String(title || '');
    this.titleEditorModal.classList.remove('hidden');
    this.titleEditorInput.focus();
    this.titleEditorInput.select();
  }

  closeTitleEditor() {
    this.activeTitleEditorDocId = null;
    this.titleEditorModal.classList.add('hidden');
  }

  renderBankAccountPickerOptions() {
    const query = this.bankAccountPickerInput.value.trim();
    const normalizedQuery = normalizeForSearch(query);

    const filtered = this.availableBankAccounts.filter((bankAccount) => {
      if (!normalizedQuery) {
        return true;
      }

      return normalizeForSearch(bankAccount).includes(normalizedQuery);
    });

    this.bankAccountPickerList.innerHTML = filtered
      .map(
        (bankAccount) =>
          `<button data-action="choose-bank-account" data-bank-account="${escapeHtml(bankAccount)}" class="w-full text-left px-3 py-2 border border-black text-xs font-black uppercase hover:bg-yellow-200">${escapeHtml(bankAccount)}</button>`
      )
      .join('');

    const hasExact = this.availableBankAccounts.some(
      (bankAccount) => normalizeForSearch(bankAccount) === normalizeForSearch(query)
    );
    const shouldShowCreate = query.length > 0 && !hasExact;
    this.bankAccountPickerCreateButton.classList.toggle('hidden', !shouldShowCreate);
    this.bankAccountPickerCreateButton.innerText = `+ Criar "${query}"`;

    if (!this.bankAccountPickerList.innerHTML) {
      this.bankAccountPickerList.innerHTML =
        '<p class="text-[11px] font-black uppercase text-zinc-500">Nenhuma conta bancária encontrada.</p>';
    }
  }

  render({
    filters,
    search,
    summary,
    previousSummary,
    tableTransactions,
    searchTotals,
    pendingAiCount,
    categories,
    bankAccounts,
    aiConsultant
  }) {
    this.setAvailableCategories(categories);
    this.setAvailableBankAccounts(bankAccounts);
    this.setAccountFilterButton(filters.accountType);
    if (this.categoryFilterSelect) {
      this.categoryFilterSelect.value = filters.category;
    }
    this.searchModeSelect.value = search.mode;
    this.searchTermInput.value = search.term;
    if (this.searchUseGlobalBaseCheckbox) {
      this.searchUseGlobalBaseCheckbox.checked = Boolean(search.useGlobalBase);
    }
    this.clearSearchButton.disabled = !search.term.trim();

    this.totalValue.innerText = formatCurrencyBRL(summary.total);
    this.ignoredValue.innerText = formatCurrencyBRL(summary.ignoredTotal);
    this.cycleLegend.innerText = `Período: ${toBrDate(filters.startDate)} a ${toBrDate(filters.endDate)}`;

    const orderedTableTransactions = sortTransactionsByDateDesc(tableTransactions);
    const paginationMeta = this.paginateTransactions(orderedTableTransactions);

    this.renderCategoryChart(summary, previousSummary);
    this.renderCategoryStats(summary, previousSummary);
    this.renderTransactions(paginationMeta.pageItems);
    this.renderTransactionsPagination(paginationMeta);
    this.renderSearchTotals(searchTotals);
    this.renderAiConsultant(aiConsultant);

    const baseCounterLabel = search.term.trim()
      ? `${tableTransactions.length} RESULTADOS (${search.useGlobalBase ? 'BASE TOTAL' : 'PERÍODO FILTRADO'})`
      : `${tableTransactions.length} LANÇAMENTOS`;
    this.itemsCounter.innerText =
      tableTransactions.length > 0
        ? `${baseCounterLabel} • PÁGINA ${paginationMeta.currentPage}/${paginationMeta.totalPages}`
        : baseCounterLabel;
    this.aiPendingLabel.innerText = `${pendingAiCount} Pendentes`;
  }

  paginateTransactions(orderedTransactions = []) {
    const totalItems = orderedTransactions.length;
    const safePageSize = Math.max(1, Number(this.pagination.pageSize || DEFAULT_PAGE_SIZE));
    const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
    const currentPage = Math.max(1, Math.min(Number(this.pagination.page || 1), totalPages));
    const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * safePageSize;
    const endIndex = Math.min(startIndex + safePageSize, totalItems);

    this.pagination.page = currentPage;
    this.pagination.pageSize = safePageSize;
    this.pagination.totalPages = totalPages;
    this.pagination.totalItems = totalItems;

    return {
      totalItems,
      totalPages,
      currentPage,
      pageSize: safePageSize,
      startIndex,
      endIndex,
      pageItems: orderedTransactions.slice(startIndex, endIndex),
      hasPrevious: currentPage > 1,
      hasNext: currentPage < totalPages
    };
  }

  renderTransactionsPagination(meta) {
    if (!this.transactionsPaginationPanel) {
      return;
    }

    if (!meta || meta.totalItems <= 0) {
      this.transactionsPaginationPanel.classList.add('hidden');
      this.paginationRangeLabel.innerText = 'Mostrando 0-0 de 0';
      this.paginationStatusLabel.innerText = 'Página 1 de 1';
      if (this.paginationPrevButton) {
        this.paginationPrevButton.disabled = true;
      }
      if (this.paginationNextButton) {
        this.paginationNextButton.disabled = true;
      }
      return;
    }

    this.transactionsPaginationPanel.classList.remove('hidden');
    this.paginationRangeLabel.innerText = `Mostrando ${meta.startIndex + 1}-${meta.endIndex} de ${meta.totalItems}`;
    this.paginationStatusLabel.innerText = `Página ${meta.currentPage} de ${meta.totalPages}`;
    if (this.paginationPageSizeSelect && this.paginationPageSizeSelect.value !== String(meta.pageSize)) {
      this.paginationPageSizeSelect.value = String(meta.pageSize);
    }
    if (this.paginationPrevButton) {
      this.paginationPrevButton.disabled = !meta.hasPrevious;
    }
    if (this.paginationNextButton) {
      this.paginationNextButton.disabled = !meta.hasNext;
    }
  }

  renderSearchTotals(searchTotals = {}) {
    if (!this.searchSummaryPanel) {
      return;
    }

    if (!searchTotals.hasSearch) {
      this.searchSummaryPanel.classList.add('hidden');
      return;
    }

    this.searchSummaryPanel.classList.remove('hidden');
    const modeLabelMap = {
      value: 'valor',
      category: 'categoria',
      description: 'descrição'
    };
    const modeLabel = modeLabelMap[searchTotals.mode] || 'descrição';
    this.searchSummaryTitle.innerText = `Busca por ${modeLabel}: "${searchTotals.term || ''}"`;
    this.searchSummaryBaseLabel.innerText = searchTotals.useGlobalBase ? 'Base Ativa Total' : 'Base Ativa Filtrada';
    this.searchSummaryMatchedValue.innerText = formatCurrencyBRL(Number(searchTotals.matchedTotal || 0));
    this.searchSummaryBaseValue.innerText = formatCurrencyBRL(Number(searchTotals.baseTotal || 0));
    this.searchSummaryShare.innerText = `${Number(searchTotals.percentageOfBase || 0).toFixed(2)}% da base ativa`;
  }

  renderAiConsultant(aiConsultantState = {}) {
    const usage = aiConsultantState?.usage || { limit: 3, used: 0, remaining: 3 };
    const report = aiConsultantState?.report || null;
    const limit = Number(usage.limit || 3);
    const used = Number(usage.used || 0);
    const remaining = Number.isFinite(usage.remaining) ? Number(usage.remaining) : Math.max(0, limit - used);
    this.consultantHasRemaining = remaining > 0;

    this.aiConsultantUsageLabel.innerText = `${remaining}/${limit} usos restantes hoje`;
    this.aiConsultantButton.disabled = this.isBusy || !this.consultantHasRemaining;
    this.aiConsultantButton.classList.toggle('opacity-50', remaining <= 0);
    this.aiConsultantButton.classList.toggle('cursor-not-allowed', remaining <= 0);

    if (!report) {
      this.aiConsultantStatusLabel.innerText = 'Aguardando análise';
      this.aiConsultantPlaceholder.classList.remove('hidden');
      this.aiConsultantContent.classList.add('hidden');
      this.aiConsultantContent.innerHTML = '';
      return;
    }

    const increased = Array.isArray(report.increased) ? report.increased : [];
    const reduced = Array.isArray(report.reduced) ? report.reduced : [];
    const criticalActions = Array.isArray(report.criticalActions) ? report.criticalActions : [];
    const dispensableCuts = Array.isArray(report.dispensableCuts) ? report.dispensableCuts : [];
    const categoryHighlights = Array.isArray(report.categoryHighlights) ? report.categoryHighlights : [];
    const topMerchants = Array.isArray(report.topMerchants) ? report.topMerchants : [];
    const smartAlerts = Array.isArray(report.smartAlerts) ? report.smartAlerts : [];
    const outlierTransactions = Array.isArray(report.outlierTransactions) ? report.outlierTransactions : [];

    this.aiConsultantStatusLabel.innerText = 'Análise disponível';
    this.aiConsultantPlaceholder.classList.add('hidden');
    this.aiConsultantContent.classList.remove('hidden');
    this.aiConsultantContent.innerHTML = `
      <div class="bg-zinc-50 border-2 border-black p-3">
        <p class="text-[10px] font-black uppercase text-zinc-500 mb-1">Leitura Geral</p>
        <p class="text-sm font-bold text-zinc-800">${escapeHtml(report.overview || 'Sem resumo gerado.')}</p>
      </div>
      ${this.renderIndicatorsBlock(report.indicators)}
      ${this.renderProjectionBlock(report.projections, report.projectionSummary)}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${this.renderDeltaBlock('Aumentou vs Período Anterior', increased, 'bg-red-50')}
        ${this.renderDeltaBlock('Reduziu vs Período Anterior', reduced, 'bg-emerald-50')}
      </div>
      ${this.renderCategoryHighlightsBlock(categoryHighlights)}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${this.renderTipsBlock('Ações Prioritárias', criticalActions)}
        ${this.renderTipsBlock('Cortes Dispensáveis', dispensableCuts)}
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${this.renderTopMerchantsBlock(topMerchants)}
        ${this.renderAlertsBlock(smartAlerts, outlierTransactions)}
      </div>
    `;
  }

  renderIndicatorsBlock(indicators = {}) {
    if (!indicators || typeof indicators !== 'object' || Object.keys(indicators).length === 0) {
      return '';
    }

    const totalPeriod = Number(indicators.totalPeriod || 0);
    const previousTotal = Number(indicators.previousTotalPeriod || 0);
    const totalDelta = Number(indicators.totalDelta || 0);
    const totalDeltaPercent = Number(indicators.totalDeltaPercent || 0);
    const newConsumption = Number(indicators.newConsumption || 0);
    const installments = Number(indicators.totalInstallments || 0);
    const dailyAverage = Number(indicators.dailyAverage || 0);
    const behavioralAverage = Number(indicators.behavioralAverage || 0);
    const installmentsShare = Number(indicators.installmentsShare || 0);
    const periodDays = Number(indicators.periodDays || 0);
    const transactionsCount = Number(indicators.transactionsCount || 0);

    const cards = [
      {
        label: 'Total do período',
        value: formatCurrencyBRL(totalPeriod),
        helper: `Anterior: ${formatCurrencyBRL(previousTotal)}`
      },
      {
        label: 'Variação total',
        value: `${totalDelta >= 0 ? '+' : '-'}${formatCurrencyBRL(Math.abs(totalDelta))}`,
        helper: `${Math.abs(totalDeltaPercent).toFixed(1)}% vs período anterior`
      },
      {
        label: 'Consumo novo',
        value: formatCurrencyBRL(newConsumption),
        helper: `Parcelas: ${formatCurrencyBRL(installments)}`
      },
      {
        label: 'Média diária',
        value: formatCurrencyBRL(dailyAverage),
        helper: `Média comportamental: ${formatCurrencyBRL(behavioralAverage)}`
      },
      {
        label: 'Peso das parcelas',
        value: `${installmentsShare.toFixed(1)}%`,
        helper: 'Participação no total do período'
      },
      {
        label: 'Base analisada',
        value: `${transactionsCount} lançamentos`,
        helper: `${periodDays} dias considerados`
      }
    ];

    const content = cards
      .map(
        (card) => `
          <div class="bg-white border border-black/20 p-2">
            <p class="text-[10px] font-black uppercase text-zinc-500">${escapeHtml(card.label)}</p>
            <p class="text-sm font-black text-zinc-900 mt-1">${escapeHtml(card.value)}</p>
            <p class="text-[10px] font-bold text-zinc-600 mt-1">${escapeHtml(card.helper)}</p>
          </div>
        `
      )
      .join('');

    return `
      <div class="bg-zinc-50 border-2 border-black p-3">
        <p class="text-[10px] font-black uppercase text-zinc-500 mb-2">Indicadores Financeiros</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          ${content}
        </div>
      </div>
    `;
  }

  renderProjectionBlock(projections = {}, projectionSummary = '') {
    if (!projections || typeof projections !== 'object' || Object.keys(projections).length === 0) {
      return '';
    }

    const endOfMonth = projections?.endOfMonth || {};
    const nextMonth = projections?.nextMonth || {};
    const summaryText = String(projectionSummary || '').trim();

    return `
      <div class="bg-zinc-50 border-2 border-black p-3">
        <p class="text-[10px] font-black uppercase text-zinc-500 mb-2">Projeções</p>
        ${summaryText ? `<p class="text-[11px] font-bold text-zinc-700 mb-3">${escapeHtml(summaryText)}</p>` : ''}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div class="bg-white border border-black/20 p-2">
            <p class="text-[10px] font-black uppercase text-zinc-500">Fechamento ${escapeHtml(endOfMonth.monthLabel || '')}</p>
            <p class="text-sm font-black text-zinc-900 mt-1">${formatCurrencyBRL(Number(endOfMonth.projectedTotal || 0))}</p>
            <p class="text-[10px] font-bold text-zinc-600 mt-1">
              + ${formatCurrencyBRL(Number(endOfMonth.projectedAdditional || 0))} em ${Number(endOfMonth.daysRemaining || 0)} dia(s) restantes
            </p>
          </div>
          <div class="bg-white border border-black/20 p-2">
            <p class="text-[10px] font-black uppercase text-zinc-500">Projeção ${escapeHtml(nextMonth.monthLabel || '')}</p>
            <p class="text-sm font-black text-zinc-900 mt-1">${formatCurrencyBRL(Number(nextMonth.projectedTotal || 0))}</p>
            <p class="text-[10px] font-bold text-zinc-600 mt-1">
              Parcelas: ${formatCurrencyBRL(Number(nextMonth.projectedInstallments || 0))} | Consumo: ${formatCurrencyBRL(Number(nextMonth.projectedConsumption || 0))}
            </p>
          </div>
        </div>
      </div>
    `;
  }

  renderDeltaBlock(title, items, backgroundClass) {
    if (!Array.isArray(items) || items.length === 0) {
      return `
        <div class="${backgroundClass} border-2 border-black p-3">
          <p class="text-[10px] font-black uppercase text-zinc-500 mb-2">${escapeHtml(title)}</p>
          <p class="text-[11px] font-bold text-zinc-600">Sem variações relevantes neste recorte.</p>
        </div>
      `;
    }

    const rows = items
      .slice(0, 5)
      .map((item) => {
        const category = escapeHtml(item.category || 'Sem categoria');
        const current = formatCompactCurrency(Number(item.current || 0));
        const previous = formatCompactCurrency(Number(item.previous || 0));
        const deltaValue = Number(item.delta || 0);
        const delta = formatCompactCurrency(Math.abs(deltaValue));
        const deltaPrefix = deltaValue >= 0 ? '+' : '-';
        const deltaPercent = Math.abs(Number(item.deltaPercent || 0)).toFixed(1);
        const insight = escapeHtml(item.insight || '');
        const drivers = Array.isArray(item.drivers) ? item.drivers.slice(0, 3) : [];
        const driversHtml =
          drivers.length === 0
            ? ''
            : `
              <div class="mt-2 pt-2 border-t border-black/10">
                <p class="text-[10px] font-black uppercase text-zinc-500 mb-1">Transações que mais impactaram</p>
                ${drivers
                  .map((driver) => {
                    const driverDelta = Number(driver?.delta || 0);
                    return `<p class="text-[10px] font-bold text-zinc-700">• ${escapeHtml(
                      String(driver?.title || 'Sem descrição')
                    )} (${driverDelta >= 0 ? '+' : '-'}${formatCompactCurrency(Math.abs(driverDelta))})</p>`;
                  })
                  .join('')}
              </div>
            `;

        return `
          <div class="border border-black/20 p-2 bg-white/70">
            <p class="text-[11px] font-black uppercase">${category}</p>
            <p class="text-[10px] font-bold text-zinc-700">Atual: ${current} | Anterior: ${previous} | Diferença: ${deltaPrefix}${delta} (${deltaPercent}%)</p>
            ${insight ? `<p class="text-[10px] font-bold text-zinc-600 mt-1">${insight}</p>` : ''}
            ${driversHtml}
          </div>
        `;
      })
      .join('');

    return `
      <div class="${backgroundClass} border-2 border-black p-3">
        <p class="text-[10px] font-black uppercase text-zinc-500 mb-2">${escapeHtml(title)}</p>
        <div class="space-y-2">${rows}</div>
      </div>
    `;
  }

  renderTipsBlock(title, tips) {
    const normalizedTips = Array.isArray(tips) ? tips.slice(0, 4) : [];
    const content =
      normalizedTips.length === 0
        ? '<p class="text-[11px] font-bold text-zinc-600">Sem sugestões para este recorte.</p>'
        : normalizedTips
            .map((tip) => `<p class="text-[11px] font-bold text-zinc-700">- ${escapeHtml(String(tip || ''))}</p>`)
            .join('');

    return `
      <div class="bg-zinc-50 border-2 border-black p-3">
        <p class="text-[10px] font-black uppercase text-zinc-500 mb-2">${escapeHtml(title)}</p>
        <div class="space-y-2">${content}</div>
      </div>
    `;
  }

  renderCategoryHighlightsBlock(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return `
        <div class="bg-zinc-50 border-2 border-black p-3">
          <p class="text-[10px] font-black uppercase text-zinc-500 mb-2">Categorias Dominantes</p>
          <p class="text-[11px] font-bold text-zinc-600">Sem categorias relevantes no recorte atual.</p>
        </div>
      `;
    }

    const rows = items
      .slice(0, 6)
      .map((item) => {
        const delta = Number(item.delta || 0);
        const deltaClass = delta >= 0 ? 'text-red-600' : 'text-emerald-700';
        const share = Number(item.share || 0).toFixed(1);

        return `
          <div class="border border-black/20 p-2 bg-white/80">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-[11px] font-black uppercase">${escapeHtml(item.category || 'Sem categoria')}</p>
              <p class="text-[10px] font-black">${formatCompactCurrency(Number(item.current || 0))} (${share}%)</p>
            </div>
            <p class="text-[10px] font-bold ${deltaClass}">
              Variação: ${delta >= 0 ? '+' : '-'}${formatCompactCurrency(Math.abs(delta))}
            </p>
            ${item.insight ? `<p class="text-[10px] font-bold text-zinc-600 mt-1">${escapeHtml(item.insight)}</p>` : ''}
          </div>
        `;
      })
      .join('');

    return `
      <div class="bg-zinc-50 border-2 border-black p-3">
        <p class="text-[10px] font-black uppercase text-zinc-500 mb-2">Categorias Dominantes</p>
        <div class="space-y-2">${rows}</div>
      </div>
    `;
  }

  renderTopMerchantsBlock(topMerchants) {
    if (!Array.isArray(topMerchants) || topMerchants.length === 0) {
      return `
        <div class="bg-zinc-50 border-2 border-black p-3">
          <p class="text-[10px] font-black uppercase text-zinc-500 mb-2">Top Estabelecimentos</p>
          <p class="text-[11px] font-bold text-zinc-600">Sem estabelecimentos suficientes para ranking.</p>
        </div>
      `;
    }

    const rows = topMerchants
      .slice(0, 6)
      .map(
        (item) => `
          <div class="border border-black/20 p-2 bg-white/80 flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-[11px] font-black uppercase truncate">${escapeHtml(item.merchant || 'Sem identificação')}</p>
              <p class="text-[10px] font-bold text-zinc-600">${Number(item.transactions || 0)} lançamento(s)</p>
            </div>
            <div class="text-right">
              <p class="text-[10px] font-black">${formatCompactCurrency(Number(item.total || 0))}</p>
              <p class="text-[10px] font-bold text-zinc-500">${Number(item.share || 0).toFixed(1)}%</p>
            </div>
          </div>
        `
      )
      .join('');

    return `
      <div class="bg-zinc-50 border-2 border-black p-3">
        <p class="text-[10px] font-black uppercase text-zinc-500 mb-2">Top Estabelecimentos</p>
        <div class="space-y-2">${rows}</div>
      </div>
    `;
  }

  renderAlertsBlock(alerts, outliers) {
    const normalizedAlerts = Array.isArray(alerts) ? alerts.slice(0, 5) : [];
    const normalizedOutliers = Array.isArray(outliers) ? outliers.slice(0, 3) : [];

    if (normalizedAlerts.length === 0 && normalizedOutliers.length === 0) {
      return `
        <div class="bg-zinc-50 border-2 border-black p-3">
          <p class="text-[10px] font-black uppercase text-zinc-500 mb-2">Alertas Inteligentes</p>
          <p class="text-[11px] font-bold text-zinc-600">Sem alertas relevantes neste recorte.</p>
        </div>
      `;
    }

    const alertsHtml = normalizedAlerts
      .map((alert) => `<p class="text-[11px] font-bold text-zinc-700">- ${escapeHtml(String(alert || ''))}</p>`)
      .join('');

    const outliersHtml =
      normalizedOutliers.length === 0
        ? ''
        : `
          <div class="mt-2 pt-2 border-t border-black/10">
            <p class="text-[10px] font-black uppercase text-zinc-500 mb-1">Compras Fora do Padrão</p>
            ${normalizedOutliers
              .map(
                (item) =>
                  `<p class="text-[10px] font-bold text-zinc-700">${escapeHtml(item.title || '')} • ${formatCompactCurrency(
                    Number(item.value || 0)
                  )}</p>`
              )
              .join('')}
          </div>
        `;

    return `
      <div class="bg-zinc-50 border-2 border-black p-3">
        <p class="text-[10px] font-black uppercase text-zinc-500 mb-2">Alertas Inteligentes</p>
        <div class="space-y-2">${alertsHtml}${outliersHtml}</div>
      </div>
    `;
  }

  renderCategoryChart(summary, previousSummary) {
    const categories = [...new Set([...summary.sortedCategories, ...previousSummary.sortedCategories])];
    this.chartBars.innerHTML = '';

    if (categories.length === 0) {
      this.chartBars.innerHTML = '<p class="text-[10px] font-bold text-zinc-400">Sem dados no período selecionado.</p>';
      return;
    }

    const maxValue = Math.max(
      ...categories.map((category) => Math.max(summary.categoryTotals[category] || 0, previousSummary.categoryTotals[category] || 0)),
      1
    );

    categories.forEach((category) => {
      const currentValue = summary.categoryTotals[category] || 0;
      const previousValue = previousSummary.categoryTotals[category] || 0;
      const currentHeight = (currentValue / maxValue) * 100;
      const previousHeight = (previousValue / maxValue) * 100;

      this.chartBars.innerHTML += `
        <div class="flex flex-col items-center min-w-[70px] h-full">
          <div class="flex items-end gap-1 h-full mb-2">
            <div title="Período atual: ${formatCurrencyBRL(currentValue)}" class="w-5 bg-yellow-400 border-2 border-black" style="height: ${currentHeight}%"></div>
            <div title="Período anterior: ${formatCurrencyBRL(previousValue)}" class="w-5 bg-zinc-300 border-2 border-black" style="height: ${previousHeight}%"></div>
          </div>
          <span class="text-[8px] font-bold uppercase truncate w-16 text-center">${escapeHtml(category)}</span>
        </div>`;
    });
  }

  renderCategoryStats(summary, previousSummary) {
    const categories = [...new Set([...summary.sortedCategories, ...previousSummary.sortedCategories])];
    this.statsList.innerHTML = '';

    if (categories.length === 0) {
      this.statsList.innerHTML = '<p class="text-[10px] font-bold text-zinc-400">Sem mix para exibir.</p>';
      return;
    }

    const maxValue = Math.max(
      ...categories.map((category) => Math.max(summary.categoryTotals[category] || 0, previousSummary.categoryTotals[category] || 0)),
      1
    );

    categories.forEach((category) => {
      const currentValue = summary.categoryTotals[category] || 0;
      const previousValue = previousSummary.categoryTotals[category] || 0;

      const currentWidth = (currentValue / maxValue) * 100;
      const previousWidth = (previousValue / maxValue) * 100;

      this.statsList.innerHTML += `
        <div>
          <div class="flex justify-between text-[10px] font-black uppercase mb-1">
            <span class="truncate">${escapeHtml(category)}</span>
            <span>${formatCompactCurrency(currentValue)}</span>
          </div>
          <div class="space-y-1">
            <div class="w-full h-2 bg-zinc-100 border border-zinc-200 rounded-full overflow-hidden">
              <div class="h-full bg-yellow-400" style="width: ${currentWidth}%"></div>
            </div>
            <div class="w-full h-2 bg-zinc-100 border border-zinc-200 rounded-full overflow-hidden">
              <div class="h-full bg-zinc-400" style="width: ${previousWidth}%"></div>
            </div>
          </div>
          <p class="text-[9px] font-black uppercase text-zinc-500 mt-1">Anterior: ${formatCompactCurrency(previousValue)}</p>
        </div>`;
    });
  }

  renderTransactions(transactions) {
    this.tableBody.innerHTML = transactions
      .map((transaction) => {
        const displayCategory = getDisplayCategory(transaction);
        const installmentOverride = displayCategory === 'Parcelas' && transaction.category !== 'Parcelas';
        const usageLabel = transaction.active === false ? 'Ignorado' : 'Ativo';
        const usageButtonLabel = transaction.active === false ? 'Reativar' : 'Ignorar';
        const bankAccount = escapeHtml(transaction.bankAccount || DEFAULT_BANK_ACCOUNT);

        return `
          <article class="transaction-card transition-all ${transaction.active === false ? 'row-inactive' : ''}">
            <div class="transaction-head">
              <div class="min-w-0">
                <p class="transaction-meta">${escapeHtml(toBrDate(transaction.date))} • ${escapeHtml(transaction.accountType)}</p>
                <button
                  data-action="open-title-editor"
                  data-doc-id="${escapeHtml(transaction.docId)}"
                  data-current-title="${escapeHtml(transaction.title)}"
                  class="transaction-title-btn"
                  title="Clique para editar a descrição"
                >
                  <span class="transaction-title">${escapeHtml(transaction.title)}</span>
                </button>
              </div>
              <p class="transaction-value">${formatCurrencyBRL(transaction.value)}</p>
            </div>

            <div class="transaction-foot">
              <div class="transaction-badges">
                <span class="transaction-badge">${usageLabel}</span>
                <span class="transaction-badge transaction-badge-bank">Conta: ${bankAccount}</span>
                ${
                  installmentOverride
                    ? '<span class="transaction-badge transaction-badge-neutral">Mix: Parcelas</span>'
                    : ''
                }
              </div>
              <div class="transaction-actions">
                <div class="transaction-picker-grid">
                  <button
                    data-action="open-category-picker"
                    data-doc-id="${escapeHtml(transaction.docId)}"
                    data-current-category="${escapeHtml(transaction.category)}"
                    class="transaction-category-btn"
                    title="Editar categoria deste lançamento"
                  >
                    ${escapeHtml(transaction.category)}
                  </button>
                  <button
                    data-action="open-bank-account-picker"
                    data-doc-id="${escapeHtml(transaction.docId)}"
                    data-current-bank-account="${bankAccount}"
                    class="transaction-bank-account-btn"
                    title="Editar conta bancária deste lançamento"
                  >
                    ${bankAccount}
                  </button>
                </div>
                <button
                  data-action="toggle-active"
                  data-doc-id="${escapeHtml(transaction.docId)}"
                  data-active="${transaction.active !== false}"
                  class="transaction-toggle-btn"
                  title="Ativar ou ignorar item"
                >
                  ${usageButtonLabel}
                </button>
              </div>
            </div>
          </article>`;
      })
      .join('');

    if (!this.tableBody.innerHTML) {
      this.tableBody.innerHTML =
        '<p class="text-[11px] font-black uppercase text-zinc-500 text-center py-6">Nenhuma transação encontrada para este recorte.</p>';
    }
  }
}
