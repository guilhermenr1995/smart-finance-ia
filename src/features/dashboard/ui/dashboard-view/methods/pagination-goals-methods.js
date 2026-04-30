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

class DashboardViewPaginationGoalsMethods {
  paginateTransactions(orderedTransactions = []) {
    const totalItems = orderedTransactions.length;
    const safePageSize = Math.max(1, Number(this.pagination.pageSize || DEFAULT_PAGE_SIZE));
    const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
    const currentPage = Math.max(1, Math.min(Number(this.pagination.page || 1), totalPages));
    const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * safePageSize;
    const endIndex = Math.min(startIndex + safePageSize, totalItems);

    this.pagination.page = currentPage;
    this.pagination.pageSize = safePageSize;
    this.pagination.totalPages = totalPages;
    this.pagination.totalItems = totalItems;

    return {
      totalItems,
      totalPages,
      currentPage,
      pageSize: safePageSize,
      startIndex,
      endIndex,
      pageItems: orderedTransactions.slice(startIndex, endIndex),
      hasPrevious: currentPage > 1,
      hasNext: currentPage < totalPages
    };
  }

  renderTransactionsPagination(meta) {
    if (!this.transactionsPaginationPanel) {
      return;
    }

    if (!meta || meta.totalItems <= 0) {
      this.transactionsPaginationPanel.classList.add('hidden');
      this.paginationRangeLabel.innerText = 'Mostrando 0-0 de 0';
      this.paginationStatusLabel.innerText = 'Página 1 de 1';
      if (this.paginationPrevButton) {
        this.paginationPrevButton.disabled = true;
      }
      if (this.paginationNextButton) {
        this.paginationNextButton.disabled = true;
      }
      return;
    }

    this.transactionsPaginationPanel.classList.remove('hidden');
    this.paginationRangeLabel.innerText = `Mostrando ${meta.startIndex + 1}-${meta.endIndex} de ${meta.totalItems}`;
    this.paginationStatusLabel.innerText = `Página ${meta.currentPage} de ${meta.totalPages}`;
    if (this.paginationPageSizeSelect && this.paginationPageSizeSelect.value !== String(meta.pageSize)) {
      this.paginationPageSizeSelect.value = String(meta.pageSize);
    }
    if (this.paginationPrevButton) {
      this.paginationPrevButton.disabled = !meta.hasPrevious;
    }
    if (this.paginationNextButton) {
      this.paginationNextButton.disabled = !meta.hasNext;
    }
  }

  renderSearchTotals(searchTotals = {}) {
    if (!this.searchSummaryPanel) {
      return;
    }

    if (!searchTotals.hasSearch) {
      this.searchSummaryPanel.classList.add('hidden');
      return;
    }

    this.searchSummaryPanel.classList.remove('hidden');
    const modeLabelMap = {
      value: 'valor',
      category: 'categoria',
      description: 'descrição',
      origin: 'origem'
    };
    const modeLabel = modeLabelMap[searchTotals.mode] || 'descrição';
    this.searchSummaryTitle.innerText = `Busca por ${modeLabel}: "${searchTotals.term || ''}"`;
    this.searchSummaryBaseLabel.innerText = searchTotals.useGlobalBase ? 'Base Ativa Total' : 'Base Ativa Filtrada';
    this.searchSummaryMatchedValue.innerText = formatCurrencyBRL(Number(searchTotals.matchedTotal || 0));
    this.searchSummaryBaseValue.innerText = formatCurrencyBRL(Number(searchTotals.baseTotal || 0));
    this.searchSummaryShare.innerText = `${Number(searchTotals.percentageOfBase || 0).toFixed(2)}% da base ativa`;
  }

  renderGoals(goalsState = {}, summary = {}) {
    if (!this.goalsList) {
      return;
    }

    const referenceMonthKey = String(goalsState?.referenceMonthKey || '').trim();
    const currentMonthKey = getMonthKeyFromDate(new Date());
    const isPastReferenceMonth = Boolean(referenceMonthKey) && referenceMonthKey < currentMonthKey;
    this.isGoalCreationAllowed = !isPastReferenceMonth;

    if (this.addGoalButton) {
      this.addGoalButton.disabled = this.isBusy || isPastReferenceMonth;
      this.addGoalButton.classList.toggle('opacity-50', isPastReferenceMonth);
      this.addGoalButton.classList.toggle('cursor-not-allowed', isPastReferenceMonth);
      this.addGoalButton.title = isPastReferenceMonth
        ? 'Mês encerrado: metas apenas para consulta histórica.'
        : 'Criar nova meta mensal';
    }

    if (this.autoGoalsButton) {
      this.autoGoalsButton.disabled = this.isBusy || isPastReferenceMonth;
      this.autoGoalsButton.classList.toggle('opacity-50', isPastReferenceMonth);
      this.autoGoalsButton.classList.toggle('cursor-not-allowed', isPastReferenceMonth);
      this.autoGoalsButton.title = isPastReferenceMonth
        ? 'Mês encerrado: geração automática indisponível.'
        : 'Gerar metas automáticas com base no histórico';
    }

    if (this.deleteGoalsByMonthButton) {
      this.deleteGoalsByMonthButton.disabled = this.isBusy;
      this.deleteGoalsByMonthButton.classList.remove('opacity-50', 'cursor-not-allowed');
      this.deleteGoalsByMonthButton.title = 'Excluir todas as metas do mês em exibição';
    }

    const referenceMonthLabel = String(goalsState?.referenceMonthLabel || '').trim();
    if (this.goalsReferenceMonthLabel) {
      this.goalsReferenceMonthLabel.innerText = isPastReferenceMonth
        ? `${referenceMonthLabel || 'Mês antigo'} · Histórico`
        : referenceMonthLabel || 'Sem mês de referência';
    }

    const goals = Array.isArray(goalsState?.items) ? goalsState.items : [];
    if (this.deleteGoalsByMonthButton) {
      this.deleteGoalsByMonthButton.disabled = this.isBusy || goals.length === 0;
      this.deleteGoalsByMonthButton.classList.toggle('opacity-50', goals.length === 0);
      this.deleteGoalsByMonthButton.classList.toggle('cursor-not-allowed', goals.length === 0);
    }

    if (goals.length === 0) {
      this.goalsList.innerHTML =
        isPastReferenceMonth
          ? '<p class="text-[11px] font-bold text-zinc-600">Não há metas históricas salvas para este mês.</p>'
          : '<p class="text-[11px] font-bold text-zinc-600">Sem metas cadastradas para este mês. Use "+ Nova Meta" ou "Gerar Metas".</p>';
      return;
    }

    const rows = goals
      .map((goal) => {
        const category = String(goal.category || 'Sem categoria').trim();
        const targetValue = Number(goal.targetValue || 0);
        const targetForPeriod = Number(goal.targetForPeriod || 0);
        const currentValue = Number(goal.currentValue || summary?.categoryTotals?.[category] || 0);
        const progressPercent = targetForPeriod > 0 ? (currentValue / targetForPeriod) * 100 : 0;
        const cappedProgress = Math.max(0, Math.min(progressPercent, 180));
        const progressClass =
          progressPercent > 110 ? 'goal-progress-fill-danger' : progressPercent > 90 ? 'goal-progress-fill-warning' : 'goal-progress-fill-safe';
        const sourceLabel = String(goal.source || 'manual') === 'auto' ? 'Automática' : 'Manual';

        return `
          <article class="goal-item-card">
            <div class="goal-item-head">
              <p class="goal-item-category">${escapeHtml(category)}</p>
              <div class="goal-item-head-actions">
                <span class="goal-item-source">${escapeHtml(sourceLabel)}</span>
                ${
                  isPastReferenceMonth
                    ? '<span class="goal-item-historical-pill">Histórico</span>'
                    : `
                      <button
                        type="button"
                        data-action="edit-goal"
                        data-doc-id="${escapeHtml(goal.docId || '')}"
                        data-category="${escapeHtml(category)}"
                        data-target-value="${escapeHtml(targetValue)}"
                        data-rationale="${escapeHtml(goal.rationale || '')}"
                        data-source="${escapeHtml(goal.source || 'manual')}"
                        data-account-scope="${escapeHtml(goal.accountScope || 'all')}"
                        class="goal-inline-action"
                        title="Editar meta"
                      >
                        Editar
                      </button>
                    `
                }
              </div>
            </div>
            <p class="goal-item-values">
              Meta mensal: <strong>${formatCurrencyBRL(targetValue)}</strong> | Meta no período: <strong>${formatCurrencyBRL(targetForPeriod)}</strong>
            </p>
            <p class="goal-item-values">Gasto atual no período: <strong>${formatCurrencyBRL(currentValue)}</strong></p>
            <div class="goal-progress-track">
              <div class="goal-progress-fill ${progressClass}" style="width: ${cappedProgress}%"></div>
            </div>
            <p class="goal-progress-label">${progressPercent.toFixed(1)}% da meta do período</p>
            ${isPastReferenceMonth ? '<p class="goal-progress-label">Meta histórica (mês encerrado).</p>' : ''}
            <div class="goal-item-actions goal-item-actions-compact">
              <button
                type="button"
                data-action="delete-goal"
                data-doc-id="${escapeHtml(goal.docId || '')}"
                class="goal-inline-action goal-inline-action-danger"
              >
                Excluir meta
              </button>
            </div>
          </article>
        `;
      })
      .join('');

    this.goalsList.innerHTML = rows;
  }

}

export function registerPaginationGoalsMethods(DashboardView) {
  applyClassMethods(DashboardView, DashboardViewPaginationGoalsMethods);
}
