import {
  escapeBudgetHtml,
  formatBudgetCurrency,
  getCurrentMonthKey,
  getMonthLabel,
  normalizeMonthKey,
  shiftMonthKey
} from './shared.js';

function formatMonthInputValue(monthKey) {
  return normalizeMonthKey(monthKey);
}

function getRecordTypeLabel(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized === 'income') {
    return 'Receita';
  }
  if (normalized === 'reserve') {
    return 'Caixinha';
  }

  return 'Despesa';
}

function getRecordToneClass(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized === 'income') {
    return 'bg-emerald-100 text-emerald-900 border-emerald-500';
  }
  if (normalized === 'reserve') {
    return 'bg-yellow-100 text-zinc-900 border-yellow-500';
  }

  return 'bg-rose-100 text-rose-900 border-rose-500';
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

    this.installButton = document.getElementById('btn-install-app');
    this.monthInput = document.getElementById('family-budget-month-input');
    this.monthLabel = document.getElementById('family-budget-month-label');
    this.monthHint = document.getElementById('family-budget-month-hint');
    this.currentMonthButton = document.getElementById('family-budget-current-month-button');
    this.replicateButton = document.getElementById('family-budget-replicate-button');
    this.statusBanner = document.getElementById('family-budget-status');

    this.ownerForm = document.getElementById('family-budget-owner-form');
    this.ownerNameInput = document.getElementById('family-budget-owner-name');
    this.addOwnerButton = document.getElementById('family-budget-add-owner');
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

    this.replicateModal = document.getElementById('family-budget-replicate-modal');
    this.replicateModalTitle = document.getElementById('family-budget-replicate-modal-title');
    this.replicateForm = document.getElementById('family-budget-replicate-form');
    this.replicateCloseButton = document.getElementById('family-budget-replicate-close');
    this.replicateTargetInput = document.getElementById('family-budget-replicate-target-month');
    this.replicateConfirmButton = document.getElementById('family-budget-replicate-confirm');
    this.replicateHint = document.getElementById('family-budget-replicate-hint');

    this.isInitialLoad = true;
  }

  async init() {
    this.authView.setAuthenticated(null);
    this.bindEvents();

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

  bindEvents() {
    this.installButton?.addEventListener('click', async () => {
      await this.pwaService.promptInstall();
    });

    this.monthInput?.addEventListener('change', async () => {
      await this.loadMonth(this.monthInput.value);
    });

    this.currentMonthButton?.addEventListener('click', async () => {
      await this.loadMonth(getCurrentMonthKey());
    });

    this.replicateButton?.addEventListener('click', () => {
      this.openReplicateModal();
    });

    this.ownerForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      await this.createOwner();
    });

    this.ownerList?.addEventListener('click', async (event) => {
      const saveButton = event.target.closest('[data-action="save-owner"]');
      if (saveButton) {
        await this.saveOwnerFromCard(saveButton);
      }
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
      await this.saveRecord();
    });

    this.recordDeleteButton?.addEventListener('click', async () => {
      await this.deleteActiveRecord();
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
      this.state = this.resetState();
      this.render();
      return;
    }

    try {
      await this.loadMonth(this.state.monthKey, { showOverlay: true });
    } catch (error) {
      this.showStatus(this.normalizeError(error), 'error');
      this.overlayView.showError(this.normalizeError(error));
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
    return this.state;
  }

  async loadMonth(monthKey, { showOverlay = false } = {}) {
    if (!this.state.user) {
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
      let bundle = await this.repository.fetchMonthBundle(this.state.user.uid, safeMonthKey);
      if (!bundle.exists) {
        await this.repository.ensureWorkspace(this.state.user.uid, safeMonthKey);
        bundle = await this.repository.fetchMonthBundle(this.state.user.uid, safeMonthKey);
      }

      this.state.setWorkspace(bundle.workspace, safeMonthKey);
      this.state.setOwners(bundle.owners);
      this.state.setRecords(bundle.records);
      this.state.setMonthKey(safeMonthKey);
      this.showStatus(bundle.records.length > 0 || bundle.owners.length > 0
        ? `Mês ${getMonthLabel(safeMonthKey)} carregado com sucesso.`
        : `Mês ${getMonthLabel(safeMonthKey)} pronto para receber dados.`,
      'success');
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
    if (!this.state.user) {
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
      await this.repository.saveOwner(this.state.user.uid, this.state.monthKey, {
        name,
        order: this.state.owners.length + 1,
        active: true
      });
      this.ownerNameInput.value = '';
      await this.loadMonth(this.state.monthKey, { showOverlay: false });
      this.showStatus(`Dono "${name}" criado com sucesso.`, 'success');
    } catch (error) {
      this.showStatus(this.normalizeError(error), 'error');
    } finally {
      this.setBusy(false);
    }
  }

  async saveOwnerFromCard(button) {
    if (!this.state.user) {
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
      await this.repository.saveOwner(this.state.user.uid, this.state.monthKey, {
        ownerId,
        name,
        order: owner.order,
        active: owner.active !== false
      });
      await this.loadMonth(this.state.monthKey, { showOverlay: false });
      this.showStatus(`Dono "${name}" atualizado.`, 'success');
    } catch (error) {
      this.showStatus(this.normalizeError(error), 'error');
    } finally {
      this.setBusy(false);
    }
  }

  openRecordModal(recordId = '') {
    if (!this.state.owners.length) {
      this.showStatus('Cadastre pelo menos um dono antes de criar registros.', 'error');
      return;
    }

    const record = recordId
      ? this.state.records.find((item) => item.recordId === recordId)
      : null;

    this.state.activeRecordId = record?.recordId || '';
    if (this.recordModalTitle) {
      this.recordModalTitle.innerText = record ? 'Editar registro' : 'Novo registro';
    }
    if (this.recordIdInput) {
      this.recordIdInput.value = record?.recordId || '';
    }
    if (this.recordNameInput) {
      this.recordNameInput.value = record?.name || '';
    }
    if (this.recordAmountInput) {
      this.recordAmountInput.value = record?.amount ? String(record.amount) : '';
    }
    if (this.recordTypeSelect) {
      this.recordTypeSelect.value = record?.type || 'expense';
    }
    this.renderRecordOwnerOptions(record?.ownerId || this.state.owners[0]?.ownerId || '');
    if (this.recordNotesInput) {
      this.recordNotesInput.value = record?.notes || '';
    }
    if (this.recordDeleteButton) {
      this.recordDeleteButton.classList.toggle('hidden', !record);
    }
    this.recordModal.classList.remove('hidden');
    this.recordNameInput?.focus();
  }

  closeRecordModal() {
    this.recordModal?.classList.add('hidden');
    this.state.activeRecordId = '';
  }

  async saveRecord() {
    if (!this.state.user) {
      return;
    }

    const recordId = String(this.recordIdInput?.value || this.state.activeRecordId || '').trim();
    const isEditing = Boolean(recordId);
    const existingRecord = isEditing ? this.state.records.find((item) => item.recordId === recordId) : null;
    const name = String(this.recordNameInput?.value || '').trim();
    const amount = Number(String(this.recordAmountInput?.value || '').replace(',', '.'));
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
      await this.repository.saveRecord(this.state.user.uid, this.state.monthKey, {
        recordId,
        ownerId,
        name,
        amount: Math.abs(amount),
        type,
        notes,
        order: existingRecord?.order || this.state.records.length + 1
      });
      this.closeRecordModal();
      await this.loadMonth(this.state.monthKey, { showOverlay: false });
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
    if (!this.state.user) {
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
      await this.repository.deleteRecord(this.state.user.uid, this.state.monthKey, safeRecordId);
      this.closeRecordModal();
      await this.loadMonth(this.state.monthKey, { showOverlay: false });
      this.showStatus('Registro excluído.', 'success');
    } catch (error) {
      this.showStatus(this.normalizeError(error), 'error');
    } finally {
      this.setBusy(false);
    }
  }

  openReplicateModal() {
    if (this.replicateTargetInput) {
      this.replicateTargetInput.value = this.state.replicateTargetMonthKey || shiftMonthKey(this.state.monthKey, 1);
    }
    if (this.replicateModalTitle) {
      this.replicateModalTitle.innerText = `Replicar ${getMonthLabel(this.state.monthKey)}`;
    }
    if (this.replicateHint) {
      this.replicateHint.innerText =
        'Escolha o mês de destino. Se ele já tiver conteúdo, o sistema pedirá confirmação antes de substituir.';
    }
    this.replicateModal.classList.remove('hidden');
    this.replicateTargetInput?.focus();
  }

  closeReplicateModal() {
    this.replicateModal?.classList.add('hidden');
  }

  async replicateMonth() {
    if (!this.state.user) {
      return;
    }

    const targetMonthKey = normalizeMonthKey(this.replicateTargetInput?.value || this.state.replicateTargetMonthKey);
    if (targetMonthKey === this.state.monthKey) {
      this.showStatus('Escolha um mês diferente para replicar.', 'error');
      return;
    }

    this.setBusy(true);
    try {
      const targetBundle = await this.repository.fetchMonthBundle(this.state.user.uid, targetMonthKey);
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

      await this.repository.replicateMonth(this.state.user.uid, this.state.monthKey, targetMonthKey);
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

    if (this.monthInput && this.monthInput.value !== formatMonthInputValue(monthKey)) {
      this.monthInput.value = formatMonthInputValue(monthKey);
    }
    if (this.monthLabel) {
      this.monthLabel.innerText = getMonthLabel(monthKey);
    }
    if (this.monthHint) {
      this.monthHint.innerText = `${owners.length} dono(s) • ${records.length} registro(s) no cenário`;
    }
    if (this.replicateTargetInput) {
      this.replicateTargetInput.value = this.state.replicateTargetMonthKey || shiftMonthKey(monthKey, 1);
    }

    this.renderStatus();
    this.renderFamilySummary(summary);
    this.renderOwnerManagementList(owners);
    this.renderOwnerSummaryList(ownerSummaries);
    this.renderRecordsList(records, ownerSummaries);
    this.renderRecordOwnerOptions(this.recordOwnerSelect?.value || owners[0]?.ownerId || '');

    if (this.newRecordButton) {
      this.newRecordButton.disabled = owners.length === 0 || this.state.isBusy;
    }
    if (this.ownerNameInput) {
      this.ownerNameInput.disabled = this.state.isBusy;
    }
    if (this.addOwnerButton) {
      this.addOwnerButton.disabled = this.state.isBusy;
    }
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
    if (this.familyIncomeValue) {
      this.familyIncomeValue.innerText = summary.family.grossIncome.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
    }
    if (this.familyExpenseValue) {
      this.familyExpenseValue.innerText = summary.family.expenseTotal.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
    }
    if (this.familyReserveValue) {
      this.familyReserveValue.innerText = summary.family.reserveTotal.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
    }
    if (this.familyNetValue) {
      this.familyNetValue.innerText = summary.family.netAvailable.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
      this.familyNetValue.className = `mt-1 text-xl font-black italic leading-none ${
        summary.family.netAvailable >= 0 ? 'text-emerald-700' : 'text-rose-700'
      }`;
    }
    if (this.familySavingsValue) {
      this.familySavingsValue.innerText = summary.family.projectedSavings.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
    }
    if (this.familyDeficitValue) {
      this.familyDeficitValue.innerText = summary.family.projectedDeficit.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
    }
    if (this.familyRecordCountValue) {
      this.familyRecordCountValue.innerText = `${summary.family.recordCount} registros`;
    }
  }

  renderOwnerManagementList(owners) {
    if (!this.ownerList) {
      return;
    }

    if (!owners.length) {
      this.ownerList.innerHTML =
        '<p class="text-[11px] font-bold text-zinc-600">Cadastre o primeiro dono para começar a montar o orçamento mensal.</p>';
      return;
    }

    this.ownerList.innerHTML = owners
      .map((owner, index) => {
        const safeName = String(owner.name || '').trim();
        return `
          <article
            class="neo-brutalism border-2 border-black bg-white p-4 space-y-3"
            data-owner-card
            data-owner-id="${escapeBudgetHtml(owner.ownerId)}"
          >
            <div class="flex flex-col md:flex-row md:items-end gap-3">
              <div class="flex-1">
                <label class="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Dono ${index + 1}</label>
                <input
                  data-owner-name-input
                  value="${escapeBudgetHtml(safeName)}"
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
        `;
      })
      .join('');
  }

  renderOwnerSummaryList(ownerSummaries) {
    if (!this.ownerSummaryList) {
      return;
    }

    if (!ownerSummaries.length) {
      this.ownerSummaryList.innerHTML =
        '<p class="text-[11px] font-bold text-zinc-600">Ainda não há resumo por dono. Depois de criar um dono e alguns registros, ele aparece aqui automaticamente.</p>';
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
                  <span class="inline-flex items-center gap-1 rounded-full border-2 border-black px-2 py-1 text-[10px] font-black uppercase ${getRecordToneClass(record.type)}">
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
              <div class="text-right">
                <p class="text-[10px] font-black uppercase tracking-widest text-zinc-500">Saldo</p>
                <p class="mt-1 text-xl font-black italic ${owner.netAvailable >= 0 ? 'text-emerald-700' : 'text-rose-700'}">
                  ${formatBudgetCurrency(owner.netAvailable)}
                </p>
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

  renderRecordsList(records, ownerSummaries) {
    if (!this.recordList) {
      return;
    }

    const ownerNameById = new Map(ownerSummaries.map((owner) => [owner.ownerId, owner.name]));

    if (!records.length) {
      if (this.recordEmptyState) {
        this.recordEmptyState.classList.remove('hidden');
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
              <span class="inline-flex items-center rounded-full border-2 border-black px-2 py-1 text-[10px] font-black uppercase tracking-widest ${getRecordToneClass(record.type)}">
                ${getRecordTypeLabel(record.type)}
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
    if (!this.state.user) {
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
        'Escolha o mês de destino e confirme. Se já existir conteúdo, o sistema vai pedir uma segunda confirmação.';
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
    if (this.monthInput) {
      this.monthInput.disabled = isBusy;
    }
    if (this.currentMonthButton) {
      this.currentMonthButton.disabled = isBusy;
    }
    if (this.replicateButton) {
      this.replicateButton.disabled = isBusy;
    }
    if (this.ownerNameInput) {
      this.ownerNameInput.disabled = isBusy;
    }
    if (this.addOwnerButton) {
      this.addOwnerButton.disabled = isBusy;
    }
    if (this.newRecordButton) {
      this.newRecordButton.disabled = isBusy || !this.state.owners.length;
    }
    if (this.recordForm) {
      [...this.recordForm.querySelectorAll('input, select, textarea, button')].forEach((element) => {
        element.disabled = isBusy;
      });
    }
    if (this.replicateForm) {
      [...this.replicateForm.querySelectorAll('input, select, textarea, button')].forEach((element) => {
        element.disabled = isBusy;
      });
    }
  }

  normalizeError(error) {
    if (typeof error?.details === 'string' && error.details.trim()) {
      return error.details;
    }

    return error?.message || 'Ocorreu um erro inesperado.';
  }
}
