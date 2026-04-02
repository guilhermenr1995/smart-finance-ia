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

class DashboardViewRenderSummaryMethods {
  render({
    filters,
    search,
    summary,
    previousSummary,
    tableTransactions,
    searchTotals,
    pendingAiCount,
    categories,
    bankAccounts,
    aiConsultant,
    goals
    ,openFinance
    ,ritmoDoMes
  }) {
    this.setAvailableCategories(categories);
    this.setAvailableBankAccounts(bankAccounts);
    this.startDateInput.value = filters.startDate;
    this.endDateInput.value = filters.endDate;
    this.setAccountFilterButton(filters.accountType);
    if (this.categoryFilterSelect) {
      this.categoryFilterSelect.value = filters.category;
    }
    if (this.sourceFilterSelect) {
      this.sourceFilterSelect.value = filters.source || 'all';
    }
    this.searchModeSelect.value = search.mode;
    this.searchTermInput.value = search.term;
    if (this.searchUseGlobalBaseCheckbox) {
      this.searchUseGlobalBaseCheckbox.checked = Boolean(search.useGlobalBase);
    }
    this.clearSearchButton.disabled = !search.term.trim();

    this.totalValue.innerText = formatCurrencyBRL(summary.total);
    if (this.floatingTotalValue) {
      this.floatingTotalValue.innerText = formatCurrencyBRL(summary.total);
    }
    this.ignoredValue.innerText = formatCurrencyBRL(summary.ignoredTotal);
    this.cycleLegend.innerText = `Período: ${toBrDate(filters.startDate)} a ${toBrDate(filters.endDate)}`;
    this.renderCategoryPie(summary, filters);

    const orderedTableTransactions = sortTransactionsByDateDesc(tableTransactions);
    const paginationMeta = this.paginateTransactions(orderedTableTransactions);

    this.renderCategoryChart(summary, previousSummary, goals?.targetsByCategory || {});
    this.renderCategoryStats(summary, previousSummary, goals?.targetsByCategory || {});
    this.renderGoals(goals, summary);
    this.renderTransactions(paginationMeta.pageItems);
    this.renderTransactionsPagination(paginationMeta);
    this.renderSearchTotals(searchTotals);
    this.renderAiConsultant(aiConsultant);
    this.renderOpenFinance(openFinance);
    this.renderRitmoDoMes(ritmoDoMes);

    const baseCounterLabel = search.term.trim()
      ? `${tableTransactions.length} RESULTADOS (${search.useGlobalBase ? 'BASE TOTAL' : 'PERÍODO FILTRADO'})`
      : `${tableTransactions.length} LANÇAMENTOS`;
    this.itemsCounter.innerText =
      tableTransactions.length > 0
        ? `${baseCounterLabel} • PÁGINA ${paginationMeta.currentPage}/${paginationMeta.totalPages}`
        : baseCounterLabel;
    this.aiPendingLabel.innerText = `${pendingAiCount} Pendentes`;
  }

  renderCategoryPie(summary = {}, filters = {}) {
    if (
      !this.categoryPieChart ||
      !this.categoryPieLegend ||
      !this.categoryPieTotal ||
      !this.categoryPiePeriodLabel ||
      !this.categoryPieCenterLabel
    ) {
      return;
    }

    this.categoryPiePeriodLabel.innerText = `${toBrDate(filters.startDate)} • ${toBrDate(filters.endDate)}`;
    const selectedCategory = String(filters?.category || 'all').trim();
    const categoryEntries = Object.entries(summary?.categoryTotals || {})
      .map(([category, value]) => [category, Number(value || 0)])
      .filter(([, value]) => value > 0)
      .sort((left, right) => right[1] - left[1]);

    const applyCenterValue = ({ label = 'Total', value = 0, isCategorySelected = false } = {}) => {
      this.categoryPieCenterLabel.innerText = String(label || 'Total').trim() || 'Total';
      this.categoryPieTotal.innerText = formatCurrencyBRL(Number(value || 0));
      this.categoryPieTotal.classList.toggle('is-slice-selected', Boolean(isCategorySelected));
      this.categoryPieChart.classList.toggle('is-slice-active', Boolean(isCategorySelected));
      this.categoryPieChart.setAttribute('aria-pressed', isCategorySelected ? 'true' : 'false');
    };

    const clearPieInteraction = () => {
      this.categoryPieChart.onclick = null;
      this.categoryPieChart.onkeydown = null;
    };

    const applyCategoryFilter = (category) => {
      const normalizedCategory = String(category || '').trim();
      if (!normalizedCategory || !this.handlers?.onFiltersChange) {
        return;
      }

      const shouldClearFilter = selectedCategory === normalizedCategory;
      this.handlers.onFiltersChange({
        category: shouldClearFilter ? 'all' : normalizedCategory
      });
    };

    if (categoryEntries.length === 0) {
      this.categoryPieChart.style.background = 'conic-gradient(#e4e4e7 0deg 360deg)';
      this.categoryPieChart.setAttribute(
        'aria-label',
        'Sem gastos no período selecionado. Ajuste o filtro de data ou categoria para visualizar o gráfico de pizza.'
      );
      applyCenterValue({
        label: selectedCategory !== 'all' ? selectedCategory : 'Total',
        value: 0,
        isCategorySelected: selectedCategory !== 'all'
      });
      this.categoryPieLegend.innerHTML =
        '<p class="text-[11px] font-black uppercase text-zinc-500">Sem gastos no período selecionado.</p>';
      clearPieInteraction();
      return;
    }

    const hashCategory = (value) => {
      const key = normalizeForSearch(value);
      let hash = 0;
      for (let index = 0; index < key.length; index += 1) {
        hash = (hash * 33 + key.charCodeAt(index)) % 1543;
      }
      return Math.abs(hash);
    };

    const buildColorVariant = (category, attempt = 0) => {
      const seed = hashCategory(`${category}-${attempt}`);
      const hue = seed % 360;
      const saturation = 68 + (seed % 10);
      const lightness = 42 + (seed % 14);
      return `hsl(${hue}deg ${saturation}% ${lightness}%)`;
    };

    const MAX_VISIBLE_SLICES = 7;
    const visibleEntries = categoryEntries.slice(0, MAX_VISIBLE_SLICES).map(([category, value]) => ({
      key: category,
      label: category,
      value,
      filterCategory: category,
      synthetic: false
    }));
    const hiddenEntries = categoryEntries.slice(MAX_VISIBLE_SLICES);
    if (hiddenEntries.length > 0) {
      const hiddenTotal = hiddenEntries.reduce((accumulator, [, value]) => accumulator + value, 0);
      visibleEntries.push({
        key: '__others__',
        label: 'Outras categorias',
        value: hiddenTotal,
        filterCategory: null,
        synthetic: true
      });
    }

    const total = visibleEntries.reduce((accumulator, item) => accumulator + Number(item.value || 0), 0);
    if (total <= 0) {
      this.categoryPieChart.style.background = 'conic-gradient(#e4e4e7 0deg 360deg)';
      applyCenterValue({
        label: 'Total',
        value: 0,
        isCategorySelected: false
      });
      this.categoryPieLegend.innerHTML =
        '<p class="text-[11px] font-black uppercase text-zinc-500">Sem gastos no período selecionado.</p>';
      clearPieInteraction();
      return;
    }

    let angleCursor = 0;
    const usedColors = new Set();
    const slices = visibleEntries.map((entry, index) => {
      const value = Number(entry.value || 0);
      const angle = (value / total) * 360;
      const startAngle = angleCursor;
      angleCursor += angle;
      let color = this.getCategoryColor(entry.label, index);
      let attempt = 0;
      while (usedColors.has(color) && attempt < 12) {
        attempt += 1;
        color = buildColorVariant(entry.label, attempt);
      }
      usedColors.add(color);

      return {
        key: entry.key,
        label: entry.label,
        filterCategory: entry.filterCategory,
        synthetic: entry.synthetic,
        value,
        percent: (value / total) * 100,
        color,
        startAngle,
        endAngle: angleCursor
      };
    });

    const gradient = slices
      .map((slice) => `${slice.color} ${slice.startAngle.toFixed(2)}deg ${slice.endAngle.toFixed(2)}deg`)
      .join(', ');

    this.categoryPieChart.style.background = `conic-gradient(${gradient})`;
    const selectedSlice =
      selectedCategory && selectedCategory !== 'all'
        ? slices.find((slice) => slice.filterCategory === selectedCategory) || null
        : null;

    applyCenterValue({
      label: selectedSlice?.label || 'Total',
      value: selectedSlice?.value ?? total,
      isCategorySelected: Boolean(selectedSlice)
    });

    this.categoryPieChart.setAttribute(
      'aria-label',
      [
        slices
          .map((slice) => `${slice.label}: ${slice.percent.toFixed(1)}% (${formatCurrencyBRL(slice.value)})`)
          .join(' | '),
        selectedSlice
          ? `Categoria selecionada: ${selectedSlice.label}, valor ${formatCurrencyBRL(selectedSlice.value)}.`
          : 'Nenhuma categoria selecionada no momento. Clique em uma fatia para ver o valor direto no gráfico.'
      ].join(' ')
    );

    const resolveSliceByAngle = (angle) => {
      const normalizedAngle = Number(angle || 0);
      return (
        slices.find((slice, index) => {
          const isLast = index === slices.length - 1;
          if (isLast) {
            return normalizedAngle >= slice.startAngle && normalizedAngle <= slice.endAngle + 0.01;
          }

          return normalizedAngle >= slice.startAngle && normalizedAngle < slice.endAngle;
        }) || null
      );
    };

    this.categoryPieChart.onclick = (event) => {
      if (!this.handlers?.onFiltersChange) {
        return;
      }

      const bounds = this.categoryPieChart.getBoundingClientRect();
      if (!bounds.width || !bounds.height) {
        return;
      }

      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const centerX = bounds.width / 2;
      const centerY = bounds.height / 2;
      const radius = Math.min(bounds.width, bounds.height) / 2;
      const innerRadius = radius * 0.52;
      const distanceFromCenter = Math.hypot(x - centerX, y - centerY);
      if (distanceFromCenter > radius) {
        return;
      }
      if (distanceFromCenter < innerRadius) {
        if (selectedCategory !== 'all' && this.handlers?.onFiltersChange) {
          this.handlers.onFiltersChange({ category: 'all' });
        }
        return;
      }

      const angle = ((Math.atan2(y - centerY, x - centerX) * 180) / Math.PI + 450) % 360;
      const clickedSlice = resolveSliceByAngle(angle);
      if (!clickedSlice?.filterCategory) {
        return;
      }

      applyCategoryFilter(clickedSlice.filterCategory);
    };

    this.categoryPieChart.onkeydown = (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      event.preventDefault();

      if (selectedSlice) {
        applyCategoryFilter(selectedSlice.filterCategory);
        return;
      }

      const firstSlice = slices.find((slice) => Boolean(slice.filterCategory));
      if (!firstSlice?.filterCategory) {
        return;
      }

      applyCategoryFilter(firstSlice.filterCategory);
    };

    this.categoryPieLegend.innerHTML = slices
      .map((slice) => {
        const isActive = selectedCategory !== 'all' && selectedCategory === slice.filterCategory;
        const canFilter = Boolean(slice.filterCategory);
        return `
          <button
            type="button"
            ${canFilter ? `data-category-pie="${escapeHtml(slice.filterCategory)}"` : ''}
            class="category-pie-legend-item ${isActive ? 'is-active' : ''} ${!canFilter ? 'is-static' : ''}"
            ${canFilter ? '' : 'disabled'}
          >
            <span class="category-pie-legend-dot" style="background:${slice.color}"></span>
            <span class="category-pie-legend-text">
              <strong>${escapeHtml(slice.label)}</strong>
              <small>${slice.percent.toFixed(1)}% • ${formatCurrencyBRL(slice.value)}${!canFilter ? ' • agregado' : ''}</small>
            </span>
          </button>
        `;
      })
      .join('');

    this.categoryPieLegend.querySelectorAll('[data-category-pie]').forEach((button) => {
      button.addEventListener('click', () => {
        const category = String(button.dataset.categoryPie || '').trim();
        applyCategoryFilter(category);
      });
    });
  }

}

export function registerRenderSummaryMethods(DashboardView) {
  applyClassMethods(DashboardView, DashboardViewRenderSummaryMethods);
}
