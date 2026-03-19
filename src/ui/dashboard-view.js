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
    this.aiPendingLabel = document.getElementById('label-ia-count');

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

    this.handlers = null;
    this.availableCategories = [...CATEGORIES];
    this.availableBankAccounts = [DEFAULT_BANK_ACCOUNT];
    this.selectedImportBankAccount = DEFAULT_BANK_ACCOUNT;
    this.activePickerDocId = null;
    this.activeBankAccountPickerDocId = null;
    this.isImportBankAccountPickerMode = false;
    this.activeTooltipTrigger = null;
    this.isBusy = false;
    this.consultantHasRemaining = true;

    this.initCategoryFilter();
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

    this.importBankAccountButton?.addEventListener('click', () => {
      this.openBankAccountPicker({
        forImport: true,
        currentBankAccount: this.selectedImportBankAccount
      });
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

  setBusy(isBusy) {
    this.isBusy = isBusy;
    this.aiButton.disabled = isBusy;
    this.creditFileInput.disabled = isBusy;
    this.accountFileInput.disabled = isBusy;
    if (this.importBankAccountButton) {
      this.importBankAccountButton.disabled = isBusy;
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

    this.renderCategoryChart(summary, previousSummary);
    this.renderCategoryStats(summary, previousSummary);
    this.renderTransactions(tableTransactions);
    this.renderSearchTotals(searchTotals);
    this.renderAiConsultant(aiConsultant);

    this.itemsCounter.innerText = search.term.trim()
      ? `${tableTransactions.length} RESULTADOS (${search.useGlobalBase ? 'BASE TOTAL' : 'PERÍODO FILTRADO'})`
      : `${tableTransactions.length} LANÇAMENTOS`;
    this.aiPendingLabel.innerText = `${pendingAiCount} Pendentes`;
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

    this.aiConsultantStatusLabel.innerText = 'Análise disponível';
    this.aiConsultantPlaceholder.classList.add('hidden');
    this.aiConsultantContent.classList.remove('hidden');
    this.aiConsultantContent.innerHTML = `
      <div class="bg-zinc-50 border-2 border-black p-3">
        <p class="text-[10px] font-black uppercase text-zinc-500 mb-1">Leitura Geral</p>
        <p class="text-sm font-bold text-zinc-800">${escapeHtml(report.overview || 'Sem resumo gerado.')}</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${this.renderDeltaBlock('Aumentou vs Período Anterior', increased, 'bg-red-50')}
        ${this.renderDeltaBlock('Reduziu vs Período Anterior', reduced, 'bg-emerald-50')}
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${this.renderTipsBlock('Ações Prioritárias', criticalActions)}
        ${this.renderTipsBlock('Cortes Dispensáveis', dispensableCuts)}
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
        const delta = formatCompactCurrency(Number(item.delta || 0));
        const insight = escapeHtml(item.insight || '');

        return `
          <div class="border border-black/20 p-2 bg-white/70">
            <p class="text-[11px] font-black uppercase">${category}</p>
            <p class="text-[10px] font-bold text-zinc-700">Atual: ${current} | Anterior: ${previous} | Diferença: ${delta}</p>
            ${insight ? `<p class="text-[10px] font-bold text-zinc-600 mt-1">${insight}</p>` : ''}
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
    const ordered = sortTransactionsByDateDesc(transactions);

    this.tableBody.innerHTML = ordered
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
                <h4 class="transaction-title">${escapeHtml(transaction.title)}</h4>
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
