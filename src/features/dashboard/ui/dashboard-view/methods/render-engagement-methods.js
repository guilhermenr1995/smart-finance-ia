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

class DashboardViewRenderEngagementMethods {
  renderOpenFinance(openFinanceState = {}) {
    if (!this.openFinanceConnectionsContainer) {
      return;
    }

    const connections = Array.isArray(openFinanceState?.connections) ? openFinanceState.connections : [];
    if (connections.length === 0) {
      this.openFinanceConnectionsContainer.innerHTML =
        '<p class="text-[11px] font-bold text-zinc-500">Nenhuma conexão ativa.</p>';
      return;
    }

    const statusLabelMap = {
      active: 'Ativa',
      syncing: 'Sincronizando',
      pending: 'Pendente',
      expired: 'Expirada',
      error: 'Erro',
      revoked: 'Revogada'
    };

    this.openFinanceConnectionsContainer.innerHTML = connections
      .map((connection) => {
        const status = String(connection.status || 'unknown').trim();
        const label = statusLabelMap[status] || status || 'Desconhecido';
        const syncLabel = connection.lastSyncAt ? `Última sync: ${escapeHtml(connection.lastSyncAt)}` : 'Sem sincronização';
        const webhookLabel = connection.lastWebhookAt
          ? `Último webhook: ${escapeHtml(connection.lastWebhookEvent || 'evento')} em ${escapeHtml(connection.lastWebhookAt)}`
          : 'Webhook ainda não recebido';
        const providerItemId = escapeHtml(
          connection.providerItemId || connection.providerConnectionId || connection.id || '-'
        );
        const consentLink = String(connection.consentUrl || '').trim();
        return `
          <article class="border-2 border-black p-3 bg-zinc-50">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-xs font-black uppercase">${escapeHtml(connection.bankName || connection.bankCode || 'Banco')}</p>
              <span class="text-[10px] font-black uppercase px-2 py-1 border border-black bg-white">${escapeHtml(label)}</span>
            </div>
            <p class="text-[10px] font-bold text-zinc-500 mt-2">Item ID Pluggy: <strong class="text-zinc-700">${providerItemId}</strong></p>
            <p class="text-[11px] font-bold text-zinc-600 mt-2">${syncLabel}</p>
            <p class="text-[10px] font-bold text-zinc-500 mt-1">${webhookLabel}</p>
            ${
              consentLink
                ? `<a href="${escapeHtml(consentLink)}" target="_blank" rel="noopener noreferrer" class="inline-block mt-2 text-[10px] font-black uppercase underline">Abrir consentimento</a>`
                : ''
            }
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
              <button data-open-finance-action="sync" data-connection-id="${escapeHtml(connection.id)}" class="border-2 border-black px-2 py-1 text-[10px] font-black uppercase bg-white">Sync</button>
              <button data-open-finance-action="renew" data-connection-id="${escapeHtml(connection.id)}" class="border-2 border-black px-2 py-1 text-[10px] font-black uppercase bg-white">Renovar</button>
              <button data-open-finance-action="revoke" data-connection-id="${escapeHtml(connection.id)}" class="border-2 border-black px-2 py-1 text-[10px] font-black uppercase bg-red-100">Revogar</button>
              <button data-open-finance-action="delete" data-connection-id="${escapeHtml(connection.id)}" class="border-2 border-black px-2 py-1 text-[10px] font-black uppercase bg-red-200 text-red-900">Excluir</button>
            </div>
          </article>
        `;
      })
      .join('');
  }

  getCategoryColor(category, index) {
    const key = normalizeForSearch(category);

    const fixedCategoryColors = {
      alimentacao: '#fb7185',
      transporte: '#60a5fa',
      mercado: '#34d399',
      saude: '#22d3ee',
      educacao: '#818cf8',
      moradia: '#f59e0b',
      lazer: '#f472b6',
      assinaturas: '#a78bfa',
      transferencia: '#64748b',
      parcelas: '#f97316',
      outros: '#94a3b8'
    };

    if (fixedCategoryColors[key]) {
      return fixedCategoryColors[key];
    }

    let hash = 0;
    for (let i = 0; i < key.length; i += 1) {
      hash = (hash * 37 + key.charCodeAt(i)) % 1999;
    }

    const hue = hash % 360;
    const saturation = 68 + (hash % 8);
    const lightness = 42 + (hash % 10);
    return `hsl(${hue}deg ${saturation}% ${lightness}%)`;
  }

  renderRitmoDoMes(ritmoState = {}) {
    if (!this.ritmoDailyChart || !this.ritmoLegend) {
      return;
    }

    const daily = ritmoState?.daily || {};
    const days = Array.isArray(daily.days) ? daily.days : [];
    const series = Array.isArray(daily.series) ? daily.series : [];
    const currentCategoryTotals = ritmoState?.categoryTotals || {};
    const previousCategoryTotals = ritmoState?.previousCategoryTotals || {};

    const formatDayLabelPtBr = (day) => {
      const raw = String(day || '').trim();
      const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) {
        return escapeHtml(raw);
      }

      const year = Number(match[1]);
      const month = Number(match[2]);
      const dayOfMonth = Number(match[3]);
      const date = new Date(year, month - 1, dayOfMonth, 12, 0, 0);
      const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(date);
      const formattedDate = `${String(dayOfMonth).padStart(2, '0')}/${String(month).padStart(2, '0')}/${String(year).padStart(4, '0')}`;
      return `${escapeHtml(formattedDate)} (${escapeHtml(weekday)})`;
    };

    const formatDeltaCurrency = (value) => {
      const numericValue = Number(value || 0);
      if (Math.abs(numericValue) < 0.005) {
        return 'R$ 0,00';
      }

      const signal = numericValue > 0 ? '+' : '-';
      return `${signal}${formatCurrencyBRL(Math.abs(numericValue))}`;
    };

    const buildDayTooltipHtml = (day, detail, activeCategory = null) => {
      if (!detail) {
        return '<p class="text-[10px] font-bold text-zinc-500">Selecione um dia para ver os lançamentos que compõem o total.</p>';
      }

      const normalizedActiveCategory = String(activeCategory || '').trim();
      const resolveCategoryLabel = (category, title = '') => {
        const rawCategory = String(category || '').trim() || 'Outros';
        const displayFromTransaction = getDisplayCategory({ category: rawCategory, title });
        return String(displayFromTransaction || rawCategory || 'Outros').trim() || 'Outros';
      };

      const transactions = (detail.transactions || [])
        .filter((transaction) =>
          normalizedActiveCategory
            ? String(transaction?.category || '').trim() === normalizedActiveCategory
            : true
        )
        .map((transaction) => ({
          category: String(transaction?.category || 'Outros').trim() || 'Outros',
          categoryLabel: resolveCategoryLabel(transaction?.category, transaction?.title),
          title: String(transaction?.title || '').trim() || 'Transação sem descrição',
          value: Number(transaction?.value || 0)
        }))
        .sort((left, right) => right.value - left.value);

      const groupsMap = new Map();
      transactions.forEach((transaction) => {
        const groupKey = String(transaction.categoryLabel || 'Outros').trim() || 'Outros';
        if (!groupsMap.has(groupKey)) {
          groupsMap.set(groupKey, {
            label: groupKey,
            total: 0,
            items: []
          });
        }

        const current = groupsMap.get(groupKey);
        current.total += Number(transaction.value || 0);
        current.items.push({
          title: transaction.title,
          value: Number(transaction.value || 0)
        });
      });

      const groupedTransactions = [...groupsMap.values()]
        .map((group) => ({
          ...group,
          items: group.items.sort((left, right) => right.value - left.value)
        }))
        .sort((left, right) => right.total - left.total);

      const groupedListMarkup = groupedTransactions
        .map((group) => {
          const rowsMarkup = group.items
            .map(
              (item) => `
                <li class="ritmo-transaction-row">
                  <span class="ritmo-transaction-row-value">${formatCurrencyBRL(item.value)}</span>
                  <span class="ritmo-transaction-row-title">${escapeHtml(item.title)}</span>
                </li>
              `
            )
            .join('');

          return `
            <article class="ritmo-transaction-group">
              <div class="ritmo-transaction-group-head">
                <span class="ritmo-transaction-group-title">${escapeHtml(group.label)}</span>
                <span class="ritmo-transaction-group-total">${formatCurrencyBRL(group.total)}</span>
              </div>
              <ul class="ritmo-transaction-group-items">
                ${rowsMarkup}
              </ul>
            </article>
          `;
        })
        .join('');

      const selectedCategoryLabel = normalizedActiveCategory
        ? resolveCategoryLabel(normalizedActiveCategory, '')
        : '';
      const categoryLabel = normalizedActiveCategory
        ? `Categoria selecionada: ${escapeHtml(selectedCategoryLabel)}`
        : 'Todas as categorias do dia';
      const periodComparisonMarkup = normalizedActiveCategory
        ? (() => {
            const currentCategoryPeriodTotal = Number(currentCategoryTotals?.[normalizedActiveCategory] || 0);
            const previousCategoryPeriodTotal = Number(previousCategoryTotals?.[normalizedActiveCategory] || 0);
            const periodDelta = currentCategoryPeriodTotal - previousCategoryPeriodTotal;
            return `
              <p class="text-[10px] font-bold text-zinc-700">
                Atual no período: <strong>${formatCurrencyBRL(currentCategoryPeriodTotal)}</strong> |
                Anterior no período: <strong>${formatCurrencyBRL(previousCategoryPeriodTotal)}</strong> |
                Diferença: <strong>${formatDeltaCurrency(periodDelta)}</strong>
              </p>
            `;
          })()
        : '';

      return `
        <div class="space-y-2 text-[10px]">
          <p class="font-black uppercase text-zinc-600">Dia ${formatDayLabelPtBr(day)}</p>
          <p class="font-black text-zinc-900">Total: ${formatCurrencyBRL(Number(detail.total || 0))}</p>
          <p class="text-[10px] font-bold text-zinc-600">${categoryLabel}</p>
          ${periodComparisonMarkup}
          <div class="ritmo-transaction-list">
            ${
              groupedListMarkup ||
              '<span class="ritmo-transaction-item">Sem lançamentos para este recorte.</span>'
            }
          </div>
        </div>
      `;
    };

    if (days.length === 0 || series.length === 0) {
      this.ritmoLegend.innerHTML = '<span class="text-[10px] font-black uppercase text-zinc-400">Sem dados diários para o período.</span>';
      this.ritmoDailyChart.innerHTML = '<p class="text-[10px] font-bold text-zinc-400">Sem dias com transação.</p>';
      if (this.ritmoDailyTooltip) {
        this.ritmoDailyTooltip.innerHTML = '';
      }
      return;
    }

    if (this.ritmoDailyTooltip) {
      this.ritmoDailyTooltip.innerHTML =
        '<p class="text-[10px] font-bold text-zinc-500">Selecione um dia para ver os lançamentos que compõem o total.</p>';
    }

    const categories = series.map((item) => String(item.category || '').trim()).filter(Boolean);
    const stateSelectedCategory = String(ritmoState?.selectedCategory || 'all').trim();
    const localSelectedCategory = String(this.ritmoLegendCategory || '').trim();
    let activeLegendCategory = null;

    if (localSelectedCategory && categories.includes(localSelectedCategory)) {
      activeLegendCategory = localSelectedCategory;
    } else if (
      stateSelectedCategory &&
      stateSelectedCategory !== 'all' &&
      categories.includes(stateSelectedCategory)
    ) {
      activeLegendCategory = stateSelectedCategory;
    }

    this.ritmoLegendCategory = activeLegendCategory;
    const colorMap = new Map(categories.map((category, index) => [category, this.getCategoryColor(category, index)]));

    const getActiveCategories = () => (activeLegendCategory ? [activeLegendCategory] : categories);
    const getDetailByDay = (day) => (daily.details || []).find((item) => item.day === day);
    const resolveInteractionCategory = (event) => {
      const target = event?.target;
      if (!target || typeof target.closest !== 'function') {
        return '';
      }

      const segment = target.closest('.ritmo-day-segment');
      if (!segment) {
        return '';
      }

      const category = String(segment.dataset.segmentCategory || '').trim();
      return categories.includes(category) ? category : '';
    };
    const renderTooltipForDay = (day, interactionCategory = '') => {
      if (!this.ritmoDailyTooltip) {
        return;
      }

      const detail = getDetailByDay(day);
      const selectedCategory = activeLegendCategory || String(interactionCategory || '').trim();
      this.ritmoDailyTooltip.innerHTML = buildDayTooltipHtml(day, detail, selectedCategory);
    };

    const renderChart = () => {
      const activeCategories = getActiveCategories();
      const totalsByDay = days.map((_, dayIndex) => {
        return activeCategories.reduce((sum, category) => {
          const row = series.find((item) => item.category === category);
          return sum + Number(row?.values?.[dayIndex] || 0);
        }, 0);
      });
      const maxTotal = Math.max(...totalsByDay, 1);

      this.ritmoDailyChart.innerHTML = `
        <div class="ritmo-daily-grid" style="grid-template-columns: repeat(${Math.max(days.length, 1)}, minmax(0, 1fr));">
          ${days
            .map((day, dayIndex) => {
              const stacks = activeCategories.map((category) => {
                const row = series.find((item) => item.category === category);
                const value = Number(row?.values?.[dayIndex] || 0);
                const percent = (value / maxTotal) * 100;
                if (value <= 0) {
                  return '';
                }
                return `<div class="ritmo-day-segment" data-segment-category="${escapeHtml(
                  category
                )}" style="height:${Math.max(2, percent)}%;background:${colorMap.get(category)}" title="${escapeHtml(
                  `${category}: ${formatCurrencyBRL(value)}`
                )}"></div>`;
              });

              const detail = (daily.details || []).find((item) => item.day === day);
              const rankingText = (detail?.ranking || [])
                .slice(0, 3)
                .map((item) => `${item.category}: ${formatCurrencyBRL(item.value)} (${Number(item.percent || 0).toFixed(1)}%)`)
                .join(' • ');

              return `
                <button data-day="${escapeHtml(day)}" class="ritmo-day-column" title="${escapeHtml(
                  rankingText
                )}">
                  <div class="ritmo-day-stack">${stacks.join('')}</div>
                  <span class="ritmo-day-label">${escapeHtml(day.slice(8, 10))}</span>
                </button>
              `;
            })
            .join('')}
        </div>
      `;

      this.ritmoDailyChart.querySelectorAll('.ritmo-day-column').forEach((button) => {
        button.addEventListener('mouseenter', (event) => {
          const day = String(button.dataset.day || '').trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
            return;
          }

          this.ritmoSelectedDay = day;
          renderTooltipForDay(day, resolveInteractionCategory(event));
        });

        button.addEventListener('focus', (event) => {
          const day = String(button.dataset.day || '').trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
            return;
          }

          this.ritmoSelectedDay = day;
          renderTooltipForDay(day, resolveInteractionCategory(event));
        });

        button.addEventListener('click', (event) => {
          const day = String(button.dataset.day || '').trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
            return;
          }

          this.ritmoSelectedDay = day;
          renderTooltipForDay(day, resolveInteractionCategory(event));
        });
      });

      const persistedDay = String(this.ritmoSelectedDay || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(persistedDay) && days.includes(persistedDay) && this.ritmoDailyTooltip) {
        renderTooltipForDay(persistedDay);
      }
    };

    const renderLegend = () => {
      this.ritmoLegend.innerHTML = categories
        .map((category) => {
          const color = colorMap.get(category);
          const isActive = Boolean(activeLegendCategory) && category === activeLegendCategory;
          return `
            <button data-category-legend="${escapeHtml(
              category
            )}" class="ritmo-legend-filter-btn inline-flex items-center gap-1 border border-black px-2 py-1 text-[10px] font-black uppercase bg-white ${
              isActive ? 'bg-yellow-200' : ''
            }">
              <span style="width:10px;height:10px;background:${color};border:1px solid #111;"></span>
              <span class="ritmo-legend-label">${escapeHtml(category)}</span>
            </button>
          `;
        })
        .join('');

      this.ritmoLegend.querySelectorAll('[data-category-legend]').forEach((button) => {
        button.addEventListener('click', () => {
          const category = String(button.dataset.categoryLegend || '').trim();
          if (!category) {
            return;
          }

          activeLegendCategory = activeLegendCategory === category ? null : category;
          this.ritmoLegendCategory = activeLegendCategory;
          renderLegend();
          renderChart();

          const persistedDay = String(this.ritmoSelectedDay || '').trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(persistedDay) && days.includes(persistedDay)) {
            renderTooltipForDay(persistedDay);
          }
        });
      });
    };

    renderLegend();
    renderChart();
  }

}

export function registerRenderEngagementMethods(DashboardView) {
  applyClassMethods(DashboardView, DashboardViewRenderEngagementMethods);
}
