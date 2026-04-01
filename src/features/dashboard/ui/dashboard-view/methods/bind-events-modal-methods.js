import { applyClassMethods } from './register-methods.js';

class DashboardViewBindEventsModalMethods {
  bindCategoryPickerInteractions() {
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
  }

  bindBankAccountPickerInteractions() {
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

  bindTransactionCreateInteractions() {
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
  }

  bindTitleEditorInteractions() {
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

  bindGoalModalInteractions(handlers) {
    this.goalCloseButton?.addEventListener('click', () => {
      this.closeGoalModal();
    });

    this.goalModal?.addEventListener('click', (event) => {
      if (event.target === this.goalModal) {
        this.closeGoalModal();
      }
    });

    this.goalForm?.addEventListener('submit', async (event) => {
      event.preventDefault();

      const saved = await handlers.onSaveGoal?.({
        docId: this.activeGoalDocId,
        monthKey: this.activeGoalMonthKey,
        category: this.goalCategorySelect?.value,
        targetValue: this.goalTargetValueInput?.value,
        rationale: this.goalRationaleInput?.value,
        accountScope: this.goalModal?.dataset?.scope || this.getActiveAccountScope(),
        source: this.goalModal?.dataset?.source || 'manual'
      });

      if (saved) {
        this.closeGoalModal();
      }
    });
  }
}

export function registerBindEventsModalMethods(DashboardView) {
  applyClassMethods(DashboardView, DashboardViewBindEventsModalMethods);
}
