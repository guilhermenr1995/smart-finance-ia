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
  isOpenFinanceTransaction,
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
    this.renderCategoryStats(summary, previousSummary, goalTargetsByCategory);
  }

  renderCategoryStats(summary, previousSummary, goalTargetsByCategory = {}) {
    const targetContainer = this.chartBars || this.statsList;
    if (!targetContainer) {
      return;
    }

    const categories = [
      ...new Set([...summary.sortedCategories, ...previousSummary.sortedCategories, ...Object.keys(goalTargetsByCategory || {})])
    ]
      .sort((leftCategory, rightCategory) => {
        const leftValue = Math.max(
          summary.categoryTotals[leftCategory] || 0,
          previousSummary.categoryTotals[leftCategory] || 0,
          Number(goalTargetsByCategory?.[leftCategory] || 0)
        );
        const rightValue = Math.max(
          summary.categoryTotals[rightCategory] || 0,
          previousSummary.categoryTotals[rightCategory] || 0,
          Number(goalTargetsByCategory?.[rightCategory] || 0)
        );
        return rightValue - leftValue;
      });

    if (categories.length === 0) {
      targetContainer.innerHTML = '<p class="text-[10px] font-bold text-zinc-400">Sem mix para exibir.</p>';
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

      const currentWidth = (currentValue / maxValue) * 100;
      const previousWidth = (previousValue / maxValue) * 100;
      const targetWidth = (targetValue / maxValue) * 100;
      const targetMarker = targetValue > 0 ? `<div class="mix-goal-marker" style="left: ${targetWidth}%"></div>` : '';

      return `
        <article class="mix-horizontal-row">
          <div class="mix-horizontal-row-head">
            <p class="mix-horizontal-category" title="${escapeHtml(category)}">${escapeHtml(category)}</p>
            <p class="mix-horizontal-current" title="Total gasto na categoria no período filtrado">Total atual: ${formatCurrencyBRL(currentValue)}</p>
          </div>
          <div class="mix-horizontal-tags">
            <span class="mix-mini-tag current" title="Total gasto na categoria dentro do período filtrado">Atual: ${formatCompactCurrency(currentValue)}</span>
            <span class="mix-mini-tag previous" title="Total da mesma categoria no período anterior equivalente">Anterior: ${formatCompactCurrency(previousValue)}</span>
            <span class="mix-mini-tag target" title="Meta definida para a categoria no período">Meta: ${formatCompactCurrency(targetValue)}</span>
          </div>
          <div class="mix-horizontal-track-stack">
            <div class="mix-horizontal-track-row">
              <span class="mix-horizontal-track-label">Atual</span>
              <div class="mix-horizontal-track">
                <div class="mix-horizontal-fill current" style="width: ${currentWidth}%"></div>
                ${targetMarker}
              </div>
            </div>
            <div class="mix-horizontal-track-row">
              <span class="mix-horizontal-track-label">Anterior</span>
              <div class="mix-horizontal-track">
                <div class="mix-horizontal-fill previous" style="width: ${previousWidth}%"></div>
              </div>
            </div>
          </div>
        </article>`;
    });

    targetContainer.innerHTML = chartRows.join('');
  }

  renderTransactions(transactions) {
    this.tableBody.innerHTML = transactions
      .map((transaction) => {
        const displayCategory = getDisplayCategory(transaction);
        const installmentOverride = displayCategory === 'Parcelas' && transaction.category !== 'Parcelas';
        const usageLabel = transaction.active === false ? 'Ignorado' : 'Ativo';
        const usageButtonLabel = transaction.active === false ? 'Reativar' : 'Ignorar';
        const bankAccount = escapeHtml(transaction.bankAccount || DEFAULT_BANK_ACCOUNT);
        const isOpenFinance = isOpenFinanceTransaction(transaction);
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
