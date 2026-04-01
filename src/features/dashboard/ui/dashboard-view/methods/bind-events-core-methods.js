import { applyClassMethods } from './register-methods.js';

class DashboardViewBindEventsCoreMethods {
  bindEvents(handlers) {
    this.handlers = handlers;

    this.bindFiltersAndPaginationEvents(handlers);
    this.bindImportAndActionButtons(handlers);
    this.bindOpenFinanceActions(handlers);
    this.bindTableInteractions(handlers);
    this.bindGoalListInteractions(handlers);
    this.bindCategoryPickerInteractions();
    this.bindBankAccountPickerInteractions();
    this.bindTransactionCreateInteractions();
    this.bindTitleEditorInteractions();
    this.bindGoalModalInteractions(handlers);
  }

  bindFiltersAndPaginationEvents(handlers) {
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

    if (this.sourceFilterSelect) {
      this.sourceFilterSelect.addEventListener('change', () => {
        handlers.onFiltersChange({ source: this.sourceFilterSelect.value });
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
  }

  bindImportAndActionButtons(handlers) {
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

    this.addGoalButton?.addEventListener('click', () => {
      this.openGoalModal();
    });

    this.autoGoalsButton?.addEventListener('click', () => {
      handlers.onGenerateAutomaticGoals?.();
    });

    this.deleteGoalsByMonthButton?.addEventListener('click', async () => {
      const monthLabel = this.goalsReferenceMonthLabel?.innerText || 'o mês selecionado';
      const confirmed = window.confirm(`Deseja remover todas as metas de ${monthLabel}?`);
      if (!confirmed) {
        return;
      }

      await handlers.onDeleteGoalsByMonth?.();
    });

    this.aiButton.addEventListener('click', () => {
      handlers.onAiCategorization();
    });

    this.aiConsultantButton.addEventListener('click', () => {
      handlers.onAiConsultant();
    });

    this.openFinanceRefreshButton?.addEventListener('click', () => {
      handlers.onRefreshOpenFinanceConnections?.();
    });
  }

  bindOpenFinanceActions(handlers) {
    this.openFinanceConnectButtons.forEach((button) => {
      button.addEventListener('click', () => {
        handlers.onConnectOpenFinanceBank?.(button.dataset.bankCode);
      });
    });

    this.openFinanceConnectionsContainer?.addEventListener('click', (event) => {
      const actionButton = event.target.closest('[data-open-finance-action]');
      if (!actionButton) {
        return;
      }

      const action = actionButton.dataset.openFinanceAction;
      const connectionId = actionButton.dataset.connectionId;
      if (!connectionId) {
        return;
      }

      if (action === 'sync') {
        handlers.onSyncOpenFinanceConnection?.(connectionId);
        return;
      }
      if (action === 'renew') {
        handlers.onRenewOpenFinanceConnection?.(connectionId);
        return;
      }
      if (action === 'revoke') {
        handlers.onRevokeOpenFinanceConnection?.(connectionId);
      }
    });
  }

  bindTableInteractions(handlers) {
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
  }

  bindGoalListInteractions(handlers) {
    this.goalsList?.addEventListener('click', async (event) => {
      const editTarget = event.target.closest('[data-action="edit-goal"]');
      if (editTarget) {
        this.openGoalModal({
          docId: editTarget.dataset.docId,
          category: editTarget.dataset.category,
          targetValue: editTarget.dataset.targetValue,
          rationale: editTarget.dataset.rationale,
          source: editTarget.dataset.source,
          accountScope: editTarget.dataset.accountScope
        });
        return;
      }

      const deleteTarget = event.target.closest('[data-action="delete-goal"]');
      if (!deleteTarget) {
        return;
      }

      const confirmed = window.confirm('Deseja remover esta meta mensal?');
      if (!confirmed) {
        return;
      }

      await handlers.onDeleteGoal?.(deleteTarget.dataset.docId);
    });
  }
}

export function registerBindEventsCoreMethods(DashboardView) {
  applyClassMethods(DashboardView, DashboardViewBindEventsCoreMethods);
}
