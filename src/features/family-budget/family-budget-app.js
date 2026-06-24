import {
  escapeBudgetHtml,
  formatBudgetCurrency,
  getBudgetTypeLabel,
  getBudgetTypeTone,
  getCurrentMonthKey,
  getMonthLabel,
  normalizeMonthKey,
  shiftMonthKey
} from './shared.js';

function formatMonthInputValue(monthKey) {
  return normalizeMonthKey(monthKey);
}

function formatBudgetAmountInput(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) {
    return '';
  }

  return amount.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function parseBudgetAmountInput(value) {
  const raw = String(value || '').trim().replace(/[^\d,.-]/g, '');
  if (!raw) {
    return NaN;
  }

  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');
  let normalized = raw;

  if (hasComma && hasDot) {
    if (raw.lastIndexOf(',') > raw.lastIndexOf('.')) {
      normalized = raw.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = raw.replace(/,/g, '');
    }
  } else if (hasComma) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else if (hasDot) {
    const parts = raw.split('.');
    const lastChunk = parts[parts.length - 1] || '';
    if (parts.length > 1 && lastChunk.length === 3) {
      normalized = parts.join('');
    } else {
      normalized = raw;
    }
  } else {
    normalized = raw.replace(/,/g, '');
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : NaN;
}

function getSummaryToneClass(value) {
  return Number(value || 0) >= 0 ? 'bg-emerald-50 border-emerald-400' : 'bg-rose-50 border-rose-400';
}

function buildMetricCard(label, value, subtitle = '', extraClass = '') {
  return `
    <article class="border-2 border-black bg-white p-3 neo-brutalism ${extraClass}">
      <p class="text-[10px] font-black uppercase tracking-widest text-zinc-500">${label}</p>
      <p class="mt-1 text-lg font-black italic leading-none">${value}</p>
      ${subtitle ? `<p class="mt-1 text-[11px] font-bold text-zinc-600">${subtitle}</p>` : ''}
    </article>
  `;
}

export class FamilyBudgetApp {
  constructor(dependencies) {
    this.config = dependencies.config;
    this.state = dependencies.state;
    this.authService = dependencies.authService;
    this.repository = dependencies.repository;
    this.authView = dependencies.authView;
    this.overlayView = dependencies.overlayView;
    this.pwaService = dependencies.pwaService;
    this.serviceWorkerRegistration = null;
    this.appScreen = document.getElementById('app-screen');

    this.lastRecordOwnerId = '';
    this.lastRecordType = 'expense';

    this.installButton = document.getElementById('btn-install-app');
    this.monthInput = document.getElementById('family-budget-month-input');
    this.monthLabel = document.getElementById('family-budget-month-label');
    this.monthHint = document.getElementById('family-budget-month-hint');
    this.prevMonthButton = document.getElementById('family-budget-prev-month-button');
    this.currentMonthButton = document.getElementById('family-budget-current-month-button');
    this.nextMonthButton = document.getElementById('family-budget-next-month-button');
    this.replicateButton = document.getElementById('family-budget-replicate-button');
    this.statusBanner = document.getElementById('family-budget-status');

    this.ownerForm = document.getElementById('family-budget-owner-form');
    this.ownerNameInput = document.getElementById('family-budget-owner-name');
    this.addOwnerButton = document.getElementById('family-budget-add-owner');
    this.ownerAccordionSection = document.getElementById('family-budget-owner-section');
    this.ownerAccordionToggle = document.getElementById('family-budget-owner-accordion-toggle');
    this.ownerAccordionContent = document.getElementById('family-budget-owner-accordion-content');
    this.ownerList = document.getElementById('family-budget-owner-list');
    this.ownerSummaryList = document.getElementById('family-budget-owner-summary-list');

    this.familyIncomeValue = document.getElementById('family-budget-family-income');
    this.familyExpenseValue = document.getElementById('family-budget-family-expense');
    this.familyReserveValue = document.getElementById('family-budget-family-reserve');
    this.familyNetValue = document.getElementById('family-budget-family-net');
    this.familySavingsValue = document.getElementById('family-budget-family-savings');
    this.familyDeficitValue = document.getElementById('family-budget-family-deficit');
    this.familyRecordCountValue = document.getElementById('family-budget-family-record-count');

    this.newRecordButton = document.getElementById('family-budget-new-record');
    this.recordList = document.getElementById('family-budget-record-list');
    this.recordEmptyState = document.getElementById('family-budget-record-empty');

    this.recordModal = document.getElementById('family-budget-record-modal');
    this.recordModalTitle = document.getElementById('family-budget-record-modal-title');
    this.recordForm = document.getElementById('family-budget-record-form');
    this.recordCloseButton = document.getElementById('family-budget-record-close');
    this.recordIdInput = document.getElementById('family-budget-record-id');
    this.recordNameInput = document.getElementById('family-budget-record-name');
    this.recordAmountInput = document.getElementById('family-budget-record-amount');
    this.recordTypeSelect = document.getElementById('family-budget-record-type');
    this.recordOwnerSelect = document.getElementById('family-budget-record-owner');
    this.recordNotesInput = document.getElementById('family-budget-record-notes');
    this.recordDeleteButton = document.getElementById('family-budget-record-delete');
    this.recordSaveAndNewButton = document.getElementById('family-budget-record-save-and-new');
    this.recordFilterType = 'all';
    this.recordFilterContainer = document.getElementById('family-budget-record-filters');
    this.recordFilterButtons = Array.from(document.querySelectorAll('[data-record-filter]'));
    this.recordFilterSummary = document.getElementById('family-budget-record-filter-summary');

    this.replicateModal = document.getElementById('family-budget-replicate-modal');
    this.replicateModalTitle = document.getElementById('family-budget-replicate-modal-title');
    this.replicateForm = document.getElementById('family-budget-replicate-form');
    this.replicateCloseButton = document.getElementById('family-budget-replicate-close');
    this.replicateTargetInput = document.getElementById('family-budget-replicate-target-month');
    this.replicateConfirmButton = document.getElementById('family-budget-replicate-confirm');
    this.replicateHint = document.getElementById('family-budget-replicate-hint');
    this.recordCancelButton = document.getElementById('family-budget-record-cancel');
    this.replicateCancelButton = document.getElementById('family-budget-replicate-cancel');
  }

  async init() {
    this.authView.setAuthenticated(null);
    this.bindEvents();

    if (this.appScreen) {
      this.appScreen.classList.remove('hidden');
      this.appScreen.style.display = '';
      this.appScreen.setAttribute('aria-hidden', 'false');
    }

    this.setOwnerAccordionExpanded(false);

    this.overlayView.show('Verificando sua sessão...');

    this.serviceWorkerRegistration = await this.pwaService.registerServiceWorker();
    this.pwaService.setupInstallPrompt();

    this.authService.subscribe((user) => {
      this.handleAuthState(user);
    });

    try {
      await this.authService.bootstrapSession();
    } catch (error) {
      console.warn('Session bootstrap skipped:', error);
    }

    this.render();
  }

  getActiveUser() {
    return this.state.user || this.authService?.auth?.currentUser || null;
  }

  isOwnerAccordionExpanded() {
    return Boolean(this.ownerAccordionSection && !this.ownerAccordionSection.classList.contains('is-collapsed'));
  }

  setOwnerAccordionExpanded(isExpanded) {
    if (!this.ownerAccordionSection || !this.ownerAccordionContent || !this.ownerAccordionToggle) {
      return;
    }

    const nextExpanded = Boolean(isExpanded);
    this.ownerAccordionSection.classList.toggle('is-collapsed', !nextExpanded);
    this.ownerAccordionContent.hidden = !nextExpanded;
    this.ownerAccordionToggle.setAttribute('aria-expanded', String(nextExpanded));
  }

  toggleOwnerAccordion(forceExpanded = null) {
    const nextExpanded = typeof forceExpanded === 'boolean' ? forceExpanded : !this.isOwnerAccordionExpanded();
    this.setOwnerAccordionExpanded(nextExpanded);
  }

  requireActiveUser(message = 'Faça login no app principal para usar o controle mensal familiar.') {
    const user = this.getActiveUser();
    if (!user) {
      this.showStatus(message, 'error');
      return null;
    }

    if (!this.state.user || this.state.user.uid !== user.uid) {
      this.state.setUser(user);
    }

    return user;
  }

  bindEvents() {
    this.installButton?.addEventListener('click', async () => {
      await this.pwaService.promptInstall();
    });

    this.monthInput?.addEventListener('change', async () => {
      await this.loadMonth(this.monthInput.value);
    });

    this.prevMonthButton?.addEventListener('click', async () => {
      await this.loadMonth(shiftMonthKey(this.state.monthKey, -1));
    });

    this.currentMonthButton?.addEventListener('click', async () => {
      await this.loadMonth(getCurrentMonthKey());
    });

    this.nextMonthButton?.addEventListener('click', async () => {
      await this.loadMonth(shiftMonthKey(this.state.monthKey, 1));
    });

    this.replicateButton?.addEventListener('click', () => {
      this.openReplicateModal();
    });

    this.ownerForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      await this.createOwner();
    });

    this.ownerAccordionToggle?.addEventListener('click', () => {
      this.toggleOwnerAccordion();
    });

    const handleOwnerAction = async (event) => {
      const saveButton = event.target.closest('[data-action="save-owner"]');
      if (saveButton) {
        await this.saveOwnerFromCard(saveButton);
        return;
      }

      const newRecordButton = event.target.closest('[data-action="new-record-owner"]');
      if (newRecordButton) {
        this.openRecordModal('', {
          ownerId: newRecordButton.dataset.ownerId || '',
          type: newRecordButton.dataset.recordType || this.lastRecordType
        });
      }
    };

    this.ownerList?.addEventListener('click', handleOwnerAction);
    this.ownerSummaryList?.addEventListener('click', handleOwnerAction);

    this.recordFilterContainer?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-record-filter]');
      if (!button) {
        return;
      }

      this.setRecordFilter(button.dataset.recordFilter || 'all');
    });

    this.recordFilterButtons.forEach((button) => {
      button?.addEventListener('click', (event) => {
        event.stopPropagation();
        this.setRecordFilter(button.dataset.recordFilter || 'all');
      });
    });

    this.newRecordButton?.addEventListener('click', () => {
      this.openRecordModal();
    });

    this.recordCloseButton?.addEventListener('click', () => {
      this.closeRecordModal();
    });

    this.recordModal?.addEventListener('click', (event) => {
      if (event.target === this.recordModal) {
        this.closeRecordModal();
      }
    });

    this.recordForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      await this.saveRecord({ reopen: false });
    });

    this.recordSaveAndNewButton?.addEventListener('click', async () => {
      await this.saveRecord({ reopen: true });
    });

    this.recordDeleteButton?.addEventListener('click', async () => {
      await this.deleteActiveRecord();
    });

    this.recordCancelButton?.addEventListener('click', () => {
      this.closeRecordModal();
    });

    this.recordAmountInput?.addEventListener('blur', () => {
      const parsed = parseBudgetAmountInput(this.recordAmountInput.value);
      if (Number.isFinite(parsed) && parsed > 0) {
        this.recordAmountInput.value = formatBudgetAmountInput(parsed);
      }
    });

    this.recordList?.addEventListener('click', async (event) => {
      const editButton = event.target.closest('[data-action="edit-record"]');
      if (editButton) {
        this.openRecordModal(editButton.dataset.recordId);
        return;
      }

      const deleteButton = event.target.closest('[data-action="delete-record"]');
      if (deleteButton) {
        await this.deleteRecord(deleteButton.dataset.recordId);
      }
    });

    this.replicateCloseButton?.addEventListener('click', () => {
      this.closeReplicateModal();
    });

    this.replicateModal?.addEventListener('click', (event) => {
      if (event.target === this.replicateModal) {
        this.closeReplicateModal();
      }
    });

    this.replicateForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      await this.replicateMonth();
    });

    this.replicateCancelButton?.addEventListener('click', () => {
      this.closeReplicateModal();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') {
        return;
      }

      this.closeRecordModal();
      this.closeReplicateModal();
    });
  }

  async handleAuthState(user) {
    this.state.setUser(user);
    this.authView.setAuthenticated(user);

    if (!user) {
      this.overlayView.hide();
      this.showStatus('Faça login no app principal para usar o controle mensal familiar.', 'error');
      return;
    }

    try {
      await this.loadMonth(this.state.monthKey, { showOverlay: true });
    } catch (error) {
      const message = this.normalizeError(error);
      this.showStatus(message, 'error');
      this.overlayView.showError(message);
    } finally {
      this.overlayView.hide();
    }
  }

  resetState() {
    const currentMonthKey = getCurrentMonthKey();
    this.state.monthKey = currentMonthKey;
    this.state.workspace = {
      monthKey: currentMonthKey,
      label: getMonthLabel(currentMonthKey),
      sourceMonthKey: '',
      status: 'active',
      notes: '',
      createdAt: '',
      updatedAt: ''
    };
    this.state.owners = [];
    this.state.records = [];
    this.state.activeRecordId = '';
    this.state.activeOwnerId = '';
    this.state.replicateTargetMonthKey = shiftMonthKey(currentMonthKey, 1);
    this.state.isBusy = false;
    this.state.clearStatus();
    this.lastRecordOwnerId = '';
    this.lastRecordType = 'expense';
    this.recordFilterType = 'all';
    return this.state;
  }

  async loadMonth(monthKey, { showOverlay = false } = {}) {
    const user = this.requireActiveUser();
    if (!user) {
      return;
    }

    const safeMonthKey = normalizeMonthKey(monthKey);
    this.state.setMonthKey(safeMonthKey);
    this.state.clearStatus();

    if (showOverlay) {
      this.overlayView.show('Carregando controle mensal...');
    }

    this.setBusy(true);

    try {
      let bundle = await this.repository.fetchMonthBundle(user.uid, safeMonthKey);
      if (!bundle.exists) {
        await this.repository.ensureWorkspace(user.uid, safeMonthKey);
        bundle = await this.repository.fetchMonthBundle(user.uid, safeMonthKey);
      }

      this.state.setWorkspace(bundle.workspace, safeMonthKey);
      this.state.setOwners(bundle.owners);
      this.state.setRecords(bundle.records);
      this.state.setMonthKey(safeMonthKey);
      this.showStatus(
        bundle.records.length > 0 || bundle.owners.length > 0
          ? `Mês ${getMonthLabel(safeMonthKey)} carregado com sucesso.`
          : `Mês ${getMonthLabel(safeMonthKey)} pronto para receber dados.`,
        'success'
      );
      this.render();
    } catch (error) {
      throw error;
    } finally {
      this.setBusy(false);
      if (showOverlay) {
        this.overlayView.hide();
      }
    }
  }

  async createOwner() {
    const user = this.requireActiveUser();
    if (!user) {
      return;
    }

    const name = String(this.ownerNameInput?.value || '').trim();
    if (!name) {
      this.showStatus('Informe o nome do dono.', 'error');
      return;
    }

    const duplicate = this.state.owners.some(
      (owner) => String(owner.name || '').trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      this.showStatus('Já existe um dono com esse nome neste mês.', 'error');
      return;
    }

    this.setBusy(true);
    try {
      const savedOwner = await this.repository.saveOwner(user.uid, this.state.monthKey, {
        name,
        order: this.state.owners.length + 1,
        active: true
      });
      this.ownerNameInput.value = '';
      this.state.upsertOwner(savedOwner);
      this.render();
      this.showStatus(`Dono "${name}" criado com sucesso.`, 'success');
    } catch (error) {
      this.showStatus(this.normalizeError(error), 'error');
    } finally {
      this.setBusy(false);
    }
  }

  async saveOwnerFromCard(button) {
    const user = this.requireActiveUser();
    if (!user) {
      return;
    }

    const ownerId = String(button?.dataset?.ownerId || '').trim();
    if (!ownerId) {
      return;
    }

    const card = button.closest('[data-owner-card]');
    const input = card?.querySelector('[data-owner-name-input]');
    const owner = this.state.owners.find((item) => item.ownerId === ownerId);
    if (!input || !owner) {
      return;
    }

    const name = String(input.value || '').trim();
    if (!name) {
      this.showStatus('Informe um nome válido para o dono.', 'error');
      return;
    }

    const duplicate = this.state.owners.some(
      (item) => item.ownerId !== ownerId && String(item.name || '').trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      this.showStatus('Já existe outro dono com esse nome neste mês.', 'error');
      return;
    }

    this.setBusy(true);
    try {
      const savedOwner = await this.repository.saveOwner(user.uid, this.state.monthKey, {
        ownerId,
        name,
        order: owner.order,
        active: owner.active !== false
      });
      this.state.upsertOwner(savedOwner);
      this.render();
      this.showStatus(`Dono "${name}" atualizado.`, 'success');
    } catch (error) {
      this.showStatus(this.normalizeError(error), 'error');
    } finally {
      this.setBusy(false);
    }
  }

  getDefaultRecordOwnerId(record = null, preferredOwnerId = '') {
    if (record?.ownerId) {
      return record.ownerId;
    }

    const fromPreferred = String(preferredOwnerId || '').trim();
    if (fromPreferred) {
      return fromPreferred;
    }

    const fromState = String(this.state.activeOwnerId || this.lastRecordOwnerId || '').trim();
    if (fromState) {
      return fromState;
    }

    return this.state.owners[0]?.ownerId || '';
  }

  openRecordModal(recordId = '', options = {}) {
    if (!this.requireActiveUser()) {
      return;
    }

    if (!this.state.owners.length) {
      this.showStatus('Cadastre pelo menos um dono antes de criar registros.', 'error');
      return;
    }

    const record = recordId ? this.state.records.find((item) => item.recordId === recordId) : null;
    const ownerId = this.getDefaultRecordOwnerId(record, options.ownerId);
    const type = record?.type || options.type || this.lastRecordType || 'expense';

    this.state.activeRecordId = record?.recordId || '';
    this.state.activeOwnerId = ownerId;

    if (this.recordModalTitle) {
      const ownerName = this.state.owners.find((owner) => owner.ownerId === ownerId)?.name || '';
      const typeLabel = getBudgetTypeLabel(type).toLowerCase();
      this.recordModalTitle.innerText = record
        ? 'Editar registro'
        : ownerName
          ? `Nova ${typeLabel} para ${ownerName}`
          : `Nova ${typeLabel}`;
    }

    if (this.recordIdInput) {
      this.recordIdInput.value = record?.recordId || '';
    }
    if (this.recordNameInput) {
      this.recordNameInput.value = record?.name || '';
    }
    if (this.recordAmountInput) {
      this.recordAmountInput.value = record?.amount ? formatBudgetAmountInput(record.amount) : '';
    }
    if (this.recordTypeSelect) {
      this.recordTypeSelect.value = type;
    }
    this.renderRecordOwnerOptions(ownerId);
    if (this.recordNotesInput) {
      this.recordNotesInput.value = record?.notes || '';
    }
    if (this.recordDeleteButton) {
      this.recordDeleteButton.classList.toggle('hidden', !record);
    }
    if (this.recordSaveAndNewButton) {
      this.recordSaveAndNewButton.classList.toggle('hidden', Boolean(record));
    }
    this.recordModal?.classList.remove('hidden');
    this.recordNameInput?.focus();
  }

  closeRecordModal() {
    this.recordModal?.classList.add('hidden');
    this.state.activeRecordId = '';
  }

  async saveRecord({ reopen = false } = {}) {
    const user = this.requireActiveUser();
    if (!user) {
      return;
    }

    const recordId = String(this.recordIdInput?.value || this.state.activeRecordId || '').trim();
    const isEditing = Boolean(recordId);
    const existingRecord = isEditing ? this.state.records.find((item) => item.recordId === recordId) : null;
    const name = String(this.recordNameInput?.value || '').trim();
    const amount = parseBudgetAmountInput(this.recordAmountInput?.value);
    const ownerId = String(this.recordOwnerSelect?.value || '').trim();
    const type = String(this.recordTypeSelect?.value || 'expense').trim();
    const notes = String(this.recordNotesInput?.value || '').trim();

    if (!name) {
      this.showStatus('Informe o nome do registro.', 'error');
      return;
    }
    if (!ownerId) {
      this.showStatus('Selecione um dono.', 'error');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      this.showStatus('Informe um valor maior que zero.', 'error');
      return;
    }

    this.setBusy(true);
    try {
      const savedRecord = await this.repository.saveRecord(user.uid, this.state.monthKey, {
        recordId,
        ownerId,
        name,
        amount: Math.abs(amount),
        type,
        notes,
        order: existingRecord?.order || this.state.records.length + 1
      });

      this.lastRecordOwnerId = ownerId;
      this.lastRecordType = type;
      this.state.upsertRecord(savedRecord);
      this.render();
      this.closeRecordModal();

      if (reopen && !isEditing) {
        this.openRecordModal('', {
          ownerId,
          type,
          mode: 'save-and-new'
        });
        this.recordNameInput?.focus();
        this.showStatus('Registro salvo. Continue cadastrando se quiser.', 'success');
        return;
      }

      this.showStatus(isEditing ? 'Registro atualizado com sucesso.' : 'Registro criado com sucesso.', 'success');
    } catch (error) {
      this.showStatus(this.normalizeError(error), 'error');
    } finally {
      this.setBusy(false);
    }
  }

  async deleteActiveRecord() {
    const recordId = String(this.recordIdInput?.value || this.state.activeRecordId || '').trim();
    if (!recordId) {
      return;
    }

    await this.deleteRecord(recordId);
  }

  async deleteRecord(recordId) {
    const user = this.requireActiveUser();
    if (!user) {
      return;
    }

    const safeRecordId = String(recordId || '').trim();
    if (!safeRecordId) {
      return;
    }

    const confirmed = window.confirm('Tem certeza que deseja excluir este registro?');
    if (!confirmed) {
      return;
    }

    this.setBusy(true);
    try {
      await this.repository.deleteRecord(user.uid, this.state.monthKey, safeRecordId);
      this.state.removeRecord(safeRecordId);
      this.render();
      this.closeRecordModal();
      this.showStatus('Registro excluído.', 'success');
    } catch (error) {
      this.showStatus(this.normalizeError(error), 'error');
    } finally {
      this.setBusy(false);
    }
  }

  openReplicateModal() {
    if (!this.requireActiveUser()) {
      return;
    }

    if (this.replicateTargetInput) {
      this.replicateTargetInput.value = this.state.replicateTargetMonthKey || shiftMonthKey(this.state.monthKey, 1);
    }
    if (this.replicateModalTitle) {
      this.replicateModalTitle.innerText = `Replicar ${getMonthLabel(this.state.monthKey)}`;
    }
    if (this.replicateHint) {
      this.replicateHint.innerText =
        'Escolha o mês de destino e confirme. Se ele já tiver conteúdo, o sistema vai pedir uma segunda confirmação.';
    }
    this.replicateModal?.classList.remove('hidden');
  }

  closeReplicateModal() {
    this.replicateModal?.classList.add('hidden');
  }

  async replicateMonth() {
    const user = this.requireActiveUser();
    if (!user) {
      return;
    }

    const targetMonthKey = normalizeMonthKey(this.replicateTargetInput?.value || this.state.replicateTargetMonthKey);
    if (targetMonthKey === this.state.monthKey) {
      this.showStatus('Escolha um mês diferente para replicar.', 'error');
      return;
    }

    this.setBusy(true);
    try {
      const targetBundle = await this.repository.fetchMonthBundle(user.uid, targetMonthKey);
      const hasData = Boolean(
        (Array.isArray(targetBundle.owners) && targetBundle.owners.length > 0) ||
          (Array.isArray(targetBundle.records) && targetBundle.records.length > 0)
      );

      if (hasData) {
        const confirmed = window.confirm(
          `O mês ${getMonthLabel(targetMonthKey)} já possui dados. Deseja substituir o conteúdo atual por uma cópia do mês ${getMonthLabel(this.state.monthKey)}?`
        );
        if (!confirmed) {
          this.setBusy(false);
          return;
        }
      }

      await this.repository.replicateMonth(user.uid, this.state.monthKey, targetMonthKey);
      this.closeReplicateModal();
      await this.loadMonth(targetMonthKey, { showOverlay: false });
      this.showStatus(`Mês ${getMonthLabel(targetMonthKey)} replicado com sucesso.`, 'success');
    } catch (error) {
      this.showStatus(this.normalizeError(error), 'error');
    } finally {
      this.setBusy(false);
    }
  }

  render() {
    const monthKey = this.state.monthKey || getCurrentMonthKey();
    const summary = this.state.getSummary();
    const ownerSummaries = Array.isArray(summary.ownerSummaries) ? summary.ownerSummaries : [];
    const owners = Array.isArray(this.state.owners) ? this.state.owners : [];
    const records = Array.isArray(this.state.records) ? this.state.records : [];
    const visibleRecords = this.getVisibleRecords(records);

    if (this.monthInput && this.monthInput.value !== formatMonthInputValue(monthKey)) {
      this.monthInput.value = formatMonthInputValue(monthKey);
    }
    if (this.monthLabel) {
      this.monthLabel.innerText = getMonthLabel(monthKey);
    }
    if (this.monthHint) {
      const filterLabel = this.getRecordFilterLabel(this.recordFilterType).toLowerCase();
      this.monthHint.innerText =
        this.recordFilterType === 'all'
          ? `${owners.length} dono(s) • ${records.length} registro(s) no cenário`
          : `${owners.length} dono(s) • ${records.length} registro(s) no cenário • filtrando ${filterLabel}`;
    }
    if (this.replicateTargetInput) {
      this.replicateTargetInput.value = this.state.replicateTargetMonthKey || shiftMonthKey(monthKey, 1);
    }

    this.renderStatus();
    this.renderFamilySummary(summary);
    this.renderOwnerManagementList(owners);
    this.renderOwnerSummaryList(ownerSummaries);
    this.renderRecordFilters(records, visibleRecords);
    this.renderRecordsList(visibleRecords, ownerSummaries, records);
    this.renderRecordOwnerOptions(this.recordOwnerSelect?.value || this.state.activeOwnerId || this.lastRecordOwnerId || owners[0]?.ownerId || '');

    if (this.newRecordButton) {
      this.newRecordButton.disabled = owners.length === 0 || this.state.isBusy;
    }
    if (this.ownerNameInput) {
      this.ownerNameInput.disabled = this.state.isBusy;
    }
    if (this.addOwnerButton) {
      this.addOwnerButton.disabled = this.state.isBusy;
    }
    if (this.prevMonthButton) {
      this.prevMonthButton.disabled = this.state.isBusy;
    }
    if (this.currentMonthButton) {
      this.currentMonthButton.disabled = this.state.isBusy;
    }
    if (this.nextMonthButton) {
      this.nextMonthButton.disabled = this.state.isBusy;
    }
  }

  getRecordFilterLabel(filterType = 'all') {
    const normalized = String(filterType || 'all').trim();
    if (normalized === 'income') {
      return 'Receitas';
    }
    if (normalized === 'expense') {
      return 'Despesas';
    }
    if (normalized === 'reserve') {
      return 'Caixinhas';
    }
    return 'Todos';
  }

  getVisibleRecords(records = []) {
    const safeRecords = Array.isArray(records) ? records : [];
    const filterType = String(this.recordFilterType || 'all').trim();
    if (filterType === 'income' || filterType === 'expense' || filterType === 'reserve') {
      return safeRecords.filter((record) => record.type === filterType);
    }
    return safeRecords;
  }

  setRecordFilter(filterType = 'all') {
    const normalized = String(filterType || 'all').trim();
    this.recordFilterType = normalized === 'income' || normalized === 'expense' || normalized === 'reserve' ? normalized : 'all';
    this.render();
  }

  renderStatus() {
    if (!this.statusBanner) {
      return;
    }

    const text = String(this.state.statusMessage?.text || '').trim();
    const type = String(this.state.statusMessage?.type || 'info').trim();

    if (!text) {
      this.statusBanner.classList.add('hidden');
      this.statusBanner.innerText = '';
      return;
    }

    this.statusBanner.classList.remove('hidden');
    this.statusBanner.innerText = text;
    this.statusBanner.className = [
      'border-2',
      'border-black',
      'neo-brutalism',
      'px-4',
      'py-3',
      'text-xs',
      'font-black',
      'uppercase',
      'tracking-wide'
    ].join(' ');

    if (type === 'error') {
      this.statusBanner.classList.add('bg-rose-100', 'text-rose-900');
      return;
    }

    if (type === 'success') {
      this.statusBanner.classList.add('bg-emerald-100', 'text-emerald-900');
      return;
    }

    this.statusBanner.classList.add('bg-yellow-100', 'text-zinc-900');
  }

  renderFamilySummary(summary) {
    const family = summary.family;
    if (this.familyIncomeValue) {
      this.familyIncomeValue.innerText = formatBudgetCurrency(family.grossIncome);
    }
    if (this.familyExpenseValue) {
      this.familyExpenseValue.innerText = formatBudgetCurrency(family.expenseTotal);
    }
    if (this.familyReserveValue) {
      this.familyReserveValue.innerText = formatBudgetCurrency(family.reserveTotal);
    }
    if (this.familyNetValue) {
      this.familyNetValue.innerText = formatBudgetCurrency(family.netAvailable);
      this.familyNetValue.className = `mt-1 text-xl font-black italic leading-none ${
        family.netAvailable >= 0 ? 'text-emerald-700' : 'text-rose-700'
      }`;
    }
    if (this.familySavingsValue) {
      this.familySavingsValue.innerText = formatBudgetCurrency(family.projectedSavings);
    }
    if (this.familyDeficitValue) {
      this.familyDeficitValue.innerText = formatBudgetCurrency(family.projectedDeficit);
    }
    if (this.familyRecordCountValue) {
      this.familyRecordCountValue.innerText = `${family.recordCount} registros`;
    }
  }

  renderOwnerManagementList(owners) {
    if (!this.ownerList) {
      return;
    }

    if (!owners.length) {
      this.ownerList.innerHTML = `
        <div class="neo-brutalism border-2 border-black bg-yellow-50 p-4 text-sm font-bold text-zinc-700">
          Abra a área de Donos para cadastrar o primeiro responsável. Os lançamentos ficam nos atalhos do resumo.
        </div>
      `;
      return;
    }

    this.ownerList.innerHTML = owners
      .map((owner, index) => `
        <article
          class="neo-brutalism border-2 border-black bg-white p-3 space-y-3"
          data-owner-card
          data-owner-id="${escapeBudgetHtml(owner.ownerId)}"
        >
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-[10px] font-black uppercase tracking-widest text-zinc-500">Dono ${index + 1}</p>
              <h4 class="mt-1 text-sm font-black uppercase tracking-tight">${escapeBudgetHtml(owner.name || 'Sem nome')}</h4>
            </div>
            <span class="inline-flex items-center rounded-full border-2 border-black bg-yellow-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-zinc-900">
              Editável
            </span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label class="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Nome</label>
              <input
                data-owner-name-input
                value="${escapeBudgetHtml(owner.name || '')}"
                class="w-full border-2 border-black bg-white px-3 py-2 text-sm font-black outline-none"
                placeholder="Nome do dono"
              />
            </div>
            <button
              type="button"
              data-action="save-owner"
              data-owner-id="${escapeBudgetHtml(owner.ownerId)}"
              class="px-4 py-2 border-2 border-black bg-black text-white font-black text-xs uppercase neo-brutalism"
            >
              Salvar
            </button>
          </div>
        </article>
      `)
      .join('');
  }

  renderOwnerSummaryList(ownerSummaries) {
    if (!this.ownerSummaryList) {
      return;
    }

    if (!ownerSummaries.length) {
      this.ownerSummaryList.innerHTML = `
        <div class="neo-brutalism border-2 border-black bg-yellow-50 p-4 text-sm font-bold text-zinc-700">
          Cadastre o primeiro dono na seção "Donos" acima para liberar os atalhos de Receita, Despesa e Caixinha.
        </div>
      `;
      return;
    }

    this.ownerSummaryList.innerHTML = ownerSummaries
      .map((owner) => {
        const toneClass = getSummaryToneClass(owner.netAvailable);
        const recordsPreview = Array.isArray(owner.records) && owner.records.length > 0
          ? owner.records
              .slice(0, 4)
              .map(
                (record) => `
                  <span class="inline-flex items-center gap-1 rounded-full border-2 border-black px-2 py-1 text-[10px] font-black uppercase ${getBudgetTypeTone(record.type)}">
                    ${escapeBudgetHtml(record.name)} • ${formatBudgetCurrency(record.amount)}
                  </span>
                `
              )
              .join('')
          : '<span class="text-[11px] font-bold text-zinc-500">Sem registros neste dono.</span>';

        return `
          <article class="neo-brutalism border-2 border-black bg-white p-4 space-y-3 ${toneClass}">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-[10px] font-black uppercase tracking-widest text-zinc-500">Resumo do dono</p>
                <h3 class="mt-1 text-lg font-black italic leading-tight">${escapeBudgetHtml(owner.name || 'Sem nome')}</h3>
              </div>
              <div class="text-right space-y-2">
                <p class="text-[10px] font-black uppercase tracking-widest text-zinc-500">Saldo</p>
                <p class="mt-1 text-xl font-black italic ${owner.netAvailable >= 0 ? 'text-emerald-700' : 'text-rose-700'}">
                  ${formatBudgetCurrency(owner.netAvailable)}
                </p>
                <div class="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    data-action="new-record-owner"
                    data-owner-id="${escapeBudgetHtml(owner.ownerId)}"
                    class="px-3 py-2 border-2 border-black bg-yellow-300 font-black text-[11px] uppercase neo-brutalism"
                  >
                    Novo registro
                  </button>
                  <button
                    type="button"
                    data-action="new-record-owner"
                    data-owner-id="${escapeBudgetHtml(owner.ownerId)}"
                    data-record-type="income"
                    class="px-3 py-2 border-2 border-black bg-emerald-100 font-black text-[11px] uppercase neo-brutalism text-emerald-900"
                  >
                    Receita
                  </button>
                  <button
                    type="button"
                    data-action="new-record-owner"
                    data-owner-id="${escapeBudgetHtml(owner.ownerId)}"
                    data-record-type="expense"
                    class="px-3 py-2 border-2 border-black bg-rose-100 font-black text-[11px] uppercase neo-brutalism text-rose-900"
                  >
                    Despesa
                  </button>
                  <button
                    type="button"
                    data-action="new-record-owner"
                    data-owner-id="${escapeBudgetHtml(owner.ownerId)}"
                    data-record-type="reserve"
                    class="px-3 py-2 border-2 border-black bg-yellow-100 font-black text-[11px] uppercase neo-brutalism text-zinc-900"
                  >
                    Caixinha
                  </button>
                </div>
              </div>
            </div>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-2">
              ${buildMetricCard('Receita', formatBudgetCurrency(owner.grossIncome), 'Entradas do dono')}
              ${buildMetricCard('Despesas', formatBudgetCurrency(owner.expenseTotal), 'Saídas planejadas')}
              ${buildMetricCard('Caixinha', formatBudgetCurrency(owner.reserveTotal), 'Reserva do mês')}
              ${buildMetricCard('Saldo', formatBudgetCurrency(owner.netAvailable), 'Depois dos descontos')}
            </div>
            <div class="space-y-2">
              <p class="text-[10px] font-black uppercase tracking-widest text-zinc-500">Registros do dono</p>
              <div class="flex flex-wrap gap-2">${recordsPreview}</div>
            </div>
          </article>
        `;
      })
      .join('');
  }

  renderRecordFilters(records, visibleRecords = records) {
    const counts = {
      all: Array.isArray(records) ? records.length : 0,
      income: 0,
      expense: 0,
      reserve: 0
    };

    (Array.isArray(records) ? records : []).forEach((record) => {
      if (record?.type && Object.prototype.hasOwnProperty.call(counts, record.type)) {
        counts[record.type] += 1;
      }
    });

    this.recordFilterButtons.forEach((button) => {
      const filterType = String(button.dataset.recordFilter || 'all').trim();
      const baseLabel = String(button.dataset.recordFilterLabel || this.getRecordFilterLabel(filterType)).trim();
      const count = counts[filterType] ?? 0;
      const active = filterType === this.recordFilterType;

      button.innerText = `${baseLabel} (${count})`;
      button.setAttribute('aria-pressed', String(active));
      button.disabled = Boolean(this.state.isBusy);
      button.className = [
        'px-3',
        'py-2',
        'border-2',
        'border-black',
        'font-black',
        'text-[11px]',
        'uppercase',
        'neo-brutalism',
        'transition-colors',
        active ? 'bg-black text-white' : 'bg-white text-zinc-900'
      ].join(' ');
    });

    if (!this.recordFilterSummary) {
      return;
    }

    const visibleCount = Array.isArray(visibleRecords) ? visibleRecords.length : 0;
    const totalCount = counts.all;
    if (!totalCount) {
      this.recordFilterSummary.innerText = 'Ainda não há registros neste mês.';
      return;
    }

    if (this.recordFilterType === 'all') {
      this.recordFilterSummary.innerText = `Mostrando ${visibleCount} registro(s) deste mês.`;
      return;
    }

    this.recordFilterSummary.innerText = `Mostrando ${visibleCount} de ${totalCount} registros de ${this.getRecordFilterLabel(this.recordFilterType).toLowerCase()}.`;
  }

  renderRecordsList(records, ownerSummaries, allRecords = records) {
    if (!this.recordList) {
      return;
    }

    const ownerNameById = new Map(ownerSummaries.map((owner) => [owner.ownerId, owner.name]));

    if (!records.length) {
      if (this.recordEmptyState) {
        this.recordEmptyState.classList.remove('hidden');
        const filterLabel = this.getRecordFilterLabel(this.recordFilterType).toLowerCase();
        this.recordEmptyState.innerText = Array.isArray(allRecords) && allRecords.length > 0
          ? `Nenhum registro de ${filterLabel} neste mês. Tente outro filtro ou use os atalhos rápidos para lançar algo novo.`
          : 'Nenhum registro cadastrado ainda. Use "Novo registro" ou um atalho de dono para começar rapidinho.';
      }
      this.recordList.innerHTML = '';
      return;
    }

    if (this.recordEmptyState) {
      this.recordEmptyState.classList.add('hidden');
    }

    this.recordList.innerHTML = records
      .map((record) => {
        const ownerName = ownerNameById.get(record.ownerId) || 'Sem dono';
        return `
          <article class="neo-brutalism border-2 border-black bg-white p-4 space-y-3">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-[10px] font-black uppercase tracking-widest text-zinc-500">${escapeBudgetHtml(ownerName)}</p>
                <h3 class="mt-1 text-lg font-black italic leading-tight">${escapeBudgetHtml(record.name)}</h3>
              </div>
              <p class="text-lg font-black italic ${record.type === 'income' ? 'text-emerald-700' : 'text-zinc-900'}">
                ${formatBudgetCurrency(record.amount)}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <span class="inline-flex items-center rounded-full border-2 border-black px-2 py-1 text-[10px] font-black uppercase tracking-widest ${getBudgetTypeTone(record.type)}">
                ${getBudgetTypeLabel(record.type)}
              </span>
              <span class="inline-flex items-center rounded-full border-2 border-black bg-zinc-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-zinc-700">
                Dono: ${escapeBudgetHtml(ownerName)}
              </span>
            </div>
            ${record.notes ? `<p class="text-[11px] font-bold text-zinc-600">${escapeBudgetHtml(record.notes)}</p>` : ''}
            <div class="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                data-action="edit-record"
                data-record-id="${escapeBudgetHtml(record.recordId)}"
                class="px-3 py-2 border-2 border-black bg-yellow-300 font-black text-[11px] uppercase neo-brutalism"
              >
                Editar
              </button>
              <button
                type="button"
                data-action="delete-record"
                data-record-id="${escapeBudgetHtml(record.recordId)}"
                class="px-3 py-2 border-2 border-black bg-white font-black text-[11px] uppercase neo-brutalism"
              >
                Excluir
              </button>
            </div>
          </article>
        `;
      })
      .join('');
  }

  renderRecordOwnerOptions(selectedOwnerId = '') {
    if (!this.recordOwnerSelect) {
      return;
    }

    const owners = Array.isArray(this.state.owners) ? this.state.owners : [];
    if (!owners.length) {
      this.recordOwnerSelect.innerHTML = '<option value="">Cadastre um dono primeiro</option>';
      this.recordOwnerSelect.value = '';
      if (this.newRecordButton) {
        this.newRecordButton.disabled = true;
      }
      return;
    }

    this.recordOwnerSelect.innerHTML = owners
      .map((owner) => `<option value="${escapeBudgetHtml(owner.ownerId)}">${escapeBudgetHtml(owner.name)}</option>`)
      .join('');
    this.recordOwnerSelect.value = owners.some((owner) => owner.ownerId === selectedOwnerId)
      ? selectedOwnerId
      : owners[0].ownerId;
  }

  openReplicateModal() {
    if (!this.requireActiveUser()) {
      return;
    }

    if (this.replicateTargetInput) {
      this.replicateTargetInput.value = this.state.replicateTargetMonthKey || shiftMonthKey(this.state.monthKey, 1);
    }
    if (this.replicateModalTitle) {
      this.replicateModalTitle.innerText = `Replicar ${getMonthLabel(this.state.monthKey)}`;
    }
    if (this.replicateHint) {
      this.replicateHint.innerText =
        'Escolha o mês de destino e confirme. A cópia leva donos, registros e estrutura do mês atual; se o destino já tiver dados, o sistema vai pedir uma segunda confirmação.';
    }
    this.replicateModal?.classList.remove('hidden');
  }

  closeReplicateModal() {
    this.replicateModal?.classList.add('hidden');
  }

  showStatus(text, type = 'info') {
    this.state.setStatus(text, type);
    this.renderStatus();
  }

  setBusy(isBusy) {
    this.state.isBusy = Boolean(isBusy);
    const controls = [
      this.installButton,
      this.monthInput,
      this.prevMonthButton,
      this.currentMonthButton,
      this.nextMonthButton,
      this.replicateButton,
      this.ownerNameInput,
      this.addOwnerButton,
      this.newRecordButton,
      this.recordNameInput,
      this.recordAmountInput,
      this.recordTypeSelect,
      this.recordOwnerSelect,
      this.recordNotesInput,
      this.recordDeleteButton,
      this.recordSaveAndNewButton,
      this.recordCloseButton,
      this.recordCancelButton,
      this.replicateTargetInput,
      this.replicateConfirmButton,
      this.replicateCloseButton,
      this.replicateCancelButton
    ];

    controls.forEach((element) => {
      if (element) {
        element.disabled = isBusy;
      }
    });

    [this.ownerList, this.ownerSummaryList, this.recordList].forEach((element) => {
      if (element) {
        element.classList.toggle('pointer-events-none', isBusy);
        element.classList.toggle('opacity-75', isBusy);
      }
    });

    if (this.recordFilterContainer) {
      this.recordFilterContainer.classList.toggle('pointer-events-none', isBusy);
      this.recordFilterContainer.classList.toggle('opacity-75', isBusy);
    }

    if (this.recordSaveAndNewButton) {
      this.recordSaveAndNewButton.classList.toggle('hidden', Boolean(this.recordIdInput?.value || this.state.activeRecordId));
    }
  }

  normalizeError(error) {
    if (typeof error?.details === 'string' && error.details.trim()) {
      return error.details;
    }

    return error?.message || 'Ocorreu um erro inesperado.';
  }
}
