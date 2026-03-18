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

export class DashboardView {
  constructor() {
    this.startDateInput = document.getElementById('data-inicio');
    this.endDateInput = document.getElementById('data-fim');
    this.categoryFilterSelect = document.getElementById('filter-category');

    this.accountFilterButtons = {
      all: document.getElementById('filter-all'),
      'Crédito': document.getElementById('filter-credit'),
      Conta: document.getElementById('filter-debit')
    };

    this.creditFileInput = document.getElementById('file-credit');
    this.accountFileInput = document.getElementById('file-account');
    this.aiButton = document.getElementById('btn-ai-sync');

    this.totalValue = document.getElementById('total-fatura-val');
    this.ignoredValue = document.getElementById('valor-ignorado');
    this.cycleLegend = document.getElementById('legenda-ciclo');

    this.chartBars = document.getElementById('chart-bars');
    this.statsList = document.getElementById('stats-list');
    this.itemsCounter = document.getElementById('contador-itens');
    this.tableBody = document.getElementById('tabela-corpo');
    this.aiPendingLabel = document.getElementById('label-ia-count');

    this.categoryPickerModal = document.getElementById('category-picker-modal');
    this.categoryPickerInput = document.getElementById('category-picker-input');
    this.categoryPickerList = document.getElementById('category-picker-list');
    this.categoryPickerCreateButton = document.getElementById('category-picker-create');
    this.categoryPickerCloseButton = document.getElementById('category-picker-close');

    this.handlers = null;
    this.availableCategories = [...CATEGORIES];
    this.activePickerDocId = null;

    this.initCategoryFilter();
  }

  initCategoryFilter() {
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

  setInitialFilters(filters) {
    this.startDateInput.value = filters.startDate;
    this.endDateInput.value = filters.endDate;
    this.categoryFilterSelect.value = filters.category;
    this.setAccountFilterButton(filters.accountType);
  }

  bindEvents(handlers) {
    this.handlers = handlers;

    this.startDateInput.addEventListener('change', () => {
      handlers.onFiltersChange({ startDate: this.startDateInput.value });
    });

    this.endDateInput.addEventListener('change', () => {
      handlers.onFiltersChange({ endDate: this.endDateInput.value });
    });

    this.categoryFilterSelect.addEventListener('change', () => {
      handlers.onFiltersChange({ category: this.categoryFilterSelect.value });
    });

    Object.entries(this.accountFilterButtons).forEach(([accountType, button]) => {
      button.addEventListener('click', () => {
        handlers.onFiltersChange({ accountType });
      });
    });

    this.creditFileInput.addEventListener('change', () => {
      const [file] = this.creditFileInput.files || [];
      handlers.onImportFile(file, 'Crédito');
      this.creditFileInput.value = '';
    });

    this.accountFileInput.addEventListener('change', () => {
      const [file] = this.accountFileInput.files || [];
      handlers.onImportFile(file, 'Conta');
      this.accountFileInput.value = '';
    });

    this.aiButton.addEventListener('click', () => {
      handlers.onAiCategorization();
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
      if (!openPickerTarget) {
        return;
      }

      this.openCategoryPicker(openPickerTarget.dataset.docId, openPickerTarget.dataset.currentCategory);
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
  }

  setBusy(isBusy) {
    this.aiButton.disabled = isBusy;
    this.creditFileInput.disabled = isBusy;
    this.accountFileInput.disabled = isBusy;
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

  render({ filters, summary, previousSummary, visibleTransactions, pendingAiCount, categories }) {
    this.setAvailableCategories(categories);
    this.setAccountFilterButton(filters.accountType);
    this.categoryFilterSelect.value = filters.category;

    this.totalValue.innerText = formatCurrencyBRL(summary.total);
    this.ignoredValue.innerText = formatCurrencyBRL(summary.ignoredTotal);
    this.cycleLegend.innerText = `Período: ${toBrDate(filters.startDate)} a ${toBrDate(filters.endDate)}`;

    this.renderCategoryChart(summary, previousSummary);
    this.renderCategoryStats(summary, previousSummary);
    this.renderTransactions(visibleTransactions);

    this.itemsCounter.innerText = `${visibleTransactions.length} LANÇAMENTOS`;
    this.aiPendingLabel.innerText = `${pendingAiCount} Pendentes`;
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

        return `
          <tr class="transition-all ${transaction.active === false ? 'row-inactive' : ''}">
            <td class="px-3 py-3 text-zinc-400 font-mono text-[10px]">${escapeHtml(toBrDate(transaction.date))}</td>
            <td class="px-3 py-3 font-bold text-[10px] uppercase opacity-60">${escapeHtml(transaction.accountType)}</td>
            <td class="px-1 py-3 text-center">
              <button
                data-action="toggle-active"
                data-doc-id="${escapeHtml(transaction.docId)}"
                data-active="${transaction.active !== false}"
                class="text-lg hover:scale-110 transition-transform"
                title="Ativar ou ignorar item"
              >
                ${transaction.active === false ? '👁️‍🗨️' : '👁️'}
              </button>
            </td>
            <td class="px-3 py-3 font-bold text-zinc-900">${escapeHtml(transaction.title)}</td>
            <td class="px-3 py-3">
              <div class="flex flex-col gap-1">
                <button data-action="open-category-picker" data-doc-id="${escapeHtml(transaction.docId)}" data-current-category="${escapeHtml(transaction.category)}" class="edit-mode text-left">
                  ${escapeHtml(transaction.category)}
                </button>
                ${
                  installmentOverride
                    ? '<span class="text-[9px] font-black uppercase italic text-zinc-500">Exibido no mix como Parcelas</span>'
                    : ''
                }
              </div>
            </td>
            <td class="px-3 py-3 text-right font-black">${formatCurrencyBRL(transaction.value)}</td>
          </tr>`;
      })
      .join('');
  }
}
