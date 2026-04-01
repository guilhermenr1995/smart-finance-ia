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

class DashboardViewModalMethods {
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

  openGoalModal(goal = null) {
    if (!this.goalModal) {
      return;
    }

    if (!this.isGoalCreationAllowed) {
      window.alert('Metas novas só podem ser criadas/ajustadas para o mês atual ou meses futuros.');
      return;
    }

    const monthKey = getMonthKeyFromDate(this.endDateInput?.value || this.startDateInput?.value || new Date());
    const monthBounds = getMonthBounds(monthKey);
    const normalizedGoal = goal || {};

    this.activeGoalMonthKey = monthKey;
    this.activeGoalDocId = normalizedGoal?.docId || null;
    this.goalModal.dataset.source = normalizedGoal?.source || 'manual';
    this.goalModal.dataset.scope = String(normalizedGoal?.accountScope || this.getActiveAccountScope() || 'all');

    if (this.goalModalTitle) {
      this.goalModalTitle.innerText = this.activeGoalDocId ? 'Editar Meta Mensal' : 'Nova Meta Mensal';
    }
    if (this.goalModalMonthLabel) {
      this.goalModalMonthLabel.innerText = `${monthBounds.label} (${monthBounds.startDateInput} até ${monthBounds.endDateInput})`;
    }

    this.renderGoalCategoryOptions();
    const preferredCategory =
      String(normalizedGoal?.category || '').trim() ||
      (this.availableCategories.includes('Outros') ? 'Outros' : this.availableCategories[0] || '');
    if (this.goalCategorySelect) {
      this.goalCategorySelect.value = preferredCategory;
    }

    if (this.goalTargetValueInput) {
      const normalizedTarget = Number(normalizedGoal?.targetValue || 0);
      this.goalTargetValueInput.value = normalizedTarget > 0 ? normalizedTarget.toFixed(2) : '';
    }
    if (this.goalRationaleInput) {
      this.goalRationaleInput.value = String(normalizedGoal?.rationale || '');
    }

    this.goalModal.classList.remove('hidden');
    this.goalTargetValueInput?.focus();
    this.goalTargetValueInput?.select();
  }

  closeGoalModal() {
    if (!this.goalModal) {
      return;
    }

    this.goalModal.classList.add('hidden');
    this.activeGoalDocId = null;
    this.goalModal.dataset.source = 'manual';
    this.goalModal.dataset.scope = 'all';
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

}

export function registerModalMethods(DashboardView) {
  applyClassMethods(DashboardView, DashboardViewModalMethods);
}
