import {
  CATEGORIES,
  BANK_EXPORT_GUIDES,
  BANK_GUIDE_STORAGE_KEY,
  DEFAULT_BANK_ACCOUNT,
  DEFAULT_PAGE_SIZE,
  escapeHtml,
  formatCompactCurrency,
  formatCurrencyBRL,
  getDisplayCategory,
  getMonthBounds,
  getMonthKeyFromDate,
  normalizeBankAccountName,
  normalizeForSearch,
  sortTransactionsByDateDesc,
  toBrDate
} from '../shared.js';
import { applyClassMethods } from './register-methods.js';

class DashboardViewCoreMethods {
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
    this.renderGoalCategoryOptions();
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

  renderGoalCategoryOptions() {
    if (!this.goalCategorySelect) {
      return;
    }

    this.goalCategorySelect.innerHTML = this.availableCategories
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
    if (this.sourceFilterSelect) {
      this.sourceFilterSelect.value = filters.source || 'all';
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

}

export function registerCoreMethods(DashboardView) {
  applyClassMethods(DashboardView, DashboardViewCoreMethods);
}
