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

class DashboardViewTransactionRenderMethods {
  renderCategoryChart(summary, previousSummary, goalTargetsByCategory = {}) {
    const categories = [
      ...new Set([...summary.sortedCategories, ...previousSummary.sortedCategories, ...Object.keys(goalTargetsByCategory || {})])
    ];
    if (categories.length === 0) {
      this.chartBars.innerHTML = '<p class="text-[10px] font-bold text-zinc-400">Sem dados no período selecionado.</p>';
      return;
    }

    const maxValue = Math.max(
      ...categories.map((category) =>
        Math.max(summary.categoryTotals[category] || 0, previousSummary.categoryTotals[category] || 0, goalTargetsByCategory?.[category] || 0)
      ),
      1
    );

    const chartRows = categories.map((category) => {
      const currentValue = summary.categoryTotals[category] || 0;
      const previousValue = previousSummary.categoryTotals[category] || 0;
      const targetValue = Number(goalTargetsByCategory?.[category] || 0);
      const currentHeight = (currentValue / maxValue) * 100;
      const previousHeight = (previousValue / maxValue) * 100;
      const targetHeight = (targetValue / maxValue) * 100;

      return `
        <div class="flex flex-col items-center min-w-[70px] h-full">
          <div class="flex items-end gap-1 h-full mb-2">
            <div title="Período atual: ${formatCurrencyBRL(currentValue)}" class="w-5 bg-yellow-400 border-2 border-black" style="height: ${currentHeight}%"></div>
            <div title="Período anterior: ${formatCurrencyBRL(previousValue)}" class="w-5 bg-zinc-300 border-2 border-black" style="height: ${previousHeight}%"></div>
            <div title="Meta no período: ${formatCurrencyBRL(targetValue)}" class="mix-goal-bar" style="height: ${targetHeight}%"></div>
          </div>
          <span class="text-[8px] font-bold uppercase truncate w-16 text-center">${escapeHtml(category)}</span>
        </div>`;
    });

    this.chartBars.innerHTML = chartRows.join('');
  }

  renderCategoryStats(summary, previousSummary, goalTargetsByCategory = {}) {
    const categories = [
      ...new Set([...summary.sortedCategories, ...previousSummary.sortedCategories, ...Object.keys(goalTargetsByCategory || {})])
    ];
    if (categories.length === 0) {
      this.statsList.innerHTML = '<p class="text-[10px] font-bold text-zinc-400">Sem mix para exibir.</p>';
      return;
    }

    const maxValue = Math.max(
      ...categories.map((category) =>
        Math.max(summary.categoryTotals[category] || 0, previousSummary.categoryTotals[category] || 0, goalTargetsByCategory?.[category] || 0)
      ),
      1
    );

    const statsRows = categories.map((category) => {
      const currentValue = summary.categoryTotals[category] || 0;
      const previousValue = previousSummary.categoryTotals[category] || 0;
      const targetValue = Number(goalTargetsByCategory?.[category] || 0);

      const currentWidth = (currentValue / maxValue) * 100;
      const previousWidth = (previousValue / maxValue) * 100;
      const targetWidth = (targetValue / maxValue) * 100;

      return `
        <div>
          <div class="flex justify-between text-[10px] font-black uppercase mb-1">
            <span class="truncate">${escapeHtml(category)}</span>
            <span>${formatCompactCurrency(currentValue)} / ${formatCompactCurrency(targetValue)}</span>
          </div>
          <div class="space-y-1">
            <div class="w-full h-2 bg-zinc-100 border border-zinc-200 rounded-full overflow-hidden relative">
              <div class="h-full bg-yellow-400" style="width: ${currentWidth}%"></div>
              <div class="mix-goal-marker" style="left: ${targetWidth}%"></div>
            </div>
            <div class="w-full h-2 bg-zinc-100 border border-zinc-200 rounded-full overflow-hidden">
              <div class="h-full bg-zinc-400" style="width: ${previousWidth}%"></div>
            </div>
          </div>
          <p class="text-[9px] font-black uppercase text-zinc-500 mt-1">Anterior: ${formatCompactCurrency(previousValue)} • Meta: ${formatCompactCurrency(targetValue)}</p>
        </div>`;
    });

    this.statsList.innerHTML = statsRows.join('');
  }

  renderTransactions(transactions) {
    this.tableBody.innerHTML = transactions
      .map((transaction) => {
        const displayCategory = getDisplayCategory(transaction);
        const installmentOverride = displayCategory === 'Parcelas' && transaction.category !== 'Parcelas';
        const usageLabel = transaction.active === false ? 'Ignorado' : 'Ativo';
        const usageButtonLabel = transaction.active === false ? 'Reativar' : 'Ignorar';
        const bankAccount = escapeHtml(transaction.bankAccount || DEFAULT_BANK_ACCOUNT);
        const categorySource = String(transaction.categorySource || '').trim().toLowerCase();
        const isOpenFinance = categorySource.includes('open-finance');
        const originBadge = isOpenFinance
          ? '<span class="transaction-badge transaction-badge-neutral">Origem: Open Finance</span>'
          : '';

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
                ${originBadge}
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

export function registerTransactionRenderMethods(DashboardView) {
  applyClassMethods(DashboardView, DashboardViewTransactionRenderMethods);
}
