import { BANK_EXPORT_GUIDES, BANK_GUIDE_STORAGE_KEY, DEFAULT_BANK_ACCOUNT } from '../shared.js';
import { applyClassMethods } from './register-methods.js';

class DashboardViewInteractionMethods {
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

      if (!event.target.closest('.help-tooltip-panel')) {
        this.closeTooltip();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.closeTooltip();
      }
    });
  }

  closeTooltip() {
    if (!this.activeTooltipTrigger) {
      return;
    }

    this.activeTooltipTrigger.classList.remove('is-open');
    this.activeTooltipTrigger = null;
  }

  openBankGuideModal(bankKey) {
    const safeBankKey = String(bankKey || this.bankGuideSelect?.value || 'nubank').trim();
    const guide = BANK_EXPORT_GUIDES[safeBankKey] || BANK_EXPORT_GUIDES.nubank;
    if (!guide || !this.bankGuideModal) {
      return;
    }

    if (this.bankGuideTitle) {
      this.bankGuideTitle.innerText = `Como exportar no ${guide.label}`;
    }
    if (this.bankGuideFormat) {
      this.bankGuideFormat.innerText = `Formatos recomendados: ${guide.formats}`;
    }
    if (this.bankGuideSteps) {
      this.bankGuideSteps.innerHTML = guide.steps
        .map((step, index) => `<li><span>${index + 1}.</span><p>${step}</p></li>`)
        .join('');
    }

    this.storeBankGuideKey(safeBankKey);
    this.bankGuideModal.classList.remove('hidden');
  }

  closeBankGuideModal() {
    this.bankGuideModal?.classList.add('hidden');
  }

  getStoredBankGuideKey() {
    try {
      return String(window.localStorage.getItem(BANK_GUIDE_STORAGE_KEY) || '').trim();
    } catch (error) {
      console.warn('Não foi possível recuperar a preferência do guia bancário:', error);
      return '';
    }
  }

  storeBankGuideKey(bankKey) {
    const safeBankKey = String(bankKey || '').trim();
    if (!safeBankKey) {
      return;
    }

    try {
      window.localStorage.setItem(BANK_GUIDE_STORAGE_KEY, safeBankKey);
    } catch (error) {
      console.warn('Não foi possível salvar a preferência do guia bancário:', error);
    }
  }

  setBusy(isBusy) {
    this.isBusy = isBusy;

    if (this.startDateInput) this.startDateInput.disabled = isBusy;
    if (this.endDateInput) this.endDateInput.disabled = isBusy;
    if (this.categoryFilterSelect) this.categoryFilterSelect.disabled = isBusy;
    if (this.searchModeSelect) this.searchModeSelect.disabled = isBusy;
    if (this.searchTermInput) this.searchTermInput.disabled = isBusy;
    if (this.clearSearchButton) this.clearSearchButton.disabled = isBusy;
    if (this.searchUseGlobalBaseCheckbox) this.searchUseGlobalBaseCheckbox.disabled = isBusy;
    if (this.sourceFilterSelect) this.sourceFilterSelect.disabled = isBusy;
    if (this.creditFileInput) this.creditFileInput.disabled = isBusy;
    if (this.accountFileInput) this.accountFileInput.disabled = isBusy;
    if (this.aiButton) this.aiButton.disabled = isBusy;
    if (this.aiConsultantButton) this.aiConsultantButton.disabled = isBusy;
    if (this.importBankAccountButton) this.importBankAccountButton.disabled = isBusy;
    if (this.openBankGuideButton) this.openBankGuideButton.disabled = isBusy;
    if (this.openFinanceRefreshButton) this.openFinanceRefreshButton.disabled = isBusy;
    if (this.addGoalButton) this.addGoalButton.disabled = isBusy;
    if (this.autoGoalsButton) this.autoGoalsButton.disabled = isBusy;
    if (this.deleteGoalsByMonthButton) this.deleteGoalsByMonthButton.disabled = isBusy;
    if (this.addTransactionButton) this.addTransactionButton.disabled = isBusy;
    this.openFinanceConnectButtons.forEach((button) => {
      button.disabled = isBusy;
    });

    if (this.paginationPageSizeSelect) {
      this.paginationPageSizeSelect.disabled = isBusy;
    }
    if (this.paginationPrevButton) {
      this.paginationPrevButton.disabled = isBusy || this.pagination.page <= 1;
    }
    if (this.paginationNextButton) {
      this.paginationNextButton.disabled = isBusy || this.pagination.page >= this.pagination.totalPages;
    }
    this.aiConsultantButton.disabled = isBusy;
  }

  setAccountFilterButton(accountType) {
    Object.values(this.accountFilterButtons).forEach((button) => {
      button.classList.remove('filter-active');
    });

    const selectedButton = this.accountFilterButtons[accountType] || this.accountFilterButtons.all;
    selectedButton.classList.add('filter-active');
  }

  getActiveAccountScope() {
    const activeEntry = Object.entries(this.accountFilterButtons).find(([, button]) =>
      button.classList.contains('filter-active')
    );
    return activeEntry ? activeEntry[0] : 'all';
  }
}

export function registerInteractionMethods(DashboardView) {
  applyClassMethods(DashboardView, DashboardViewInteractionMethods);
}
