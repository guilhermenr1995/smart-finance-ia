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
      expired: 'Expirada',
      error: 'Erro',
      revoked: 'Revogada'
    };

    this.openFinanceConnectionsContainer.innerHTML = connections
      .map((connection) => {
        const status = String(connection.status || 'unknown').trim();
        const label = statusLabelMap[status] || status || 'Desconhecido';
        const syncLabel = connection.lastSyncAt ? `Última sync: ${escapeHtml(connection.lastSyncAt)}` : 'Sem sincronização';
        return `
          <article class="border-2 border-black p-3 bg-zinc-50">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-xs font-black uppercase">${escapeHtml(connection.bankName || connection.bankCode || 'Banco')}</p>
              <span class="text-[10px] font-black uppercase px-2 py-1 border border-black bg-white">${escapeHtml(label)}</span>
            </div>
            <p class="text-[11px] font-bold text-zinc-600 mt-2">${syncLabel}</p>
            <div class="grid grid-cols-3 gap-2 mt-3">
              <button data-open-finance-action="sync" data-connection-id="${escapeHtml(connection.id)}" class="border-2 border-black px-2 py-1 text-[10px] font-black uppercase bg-white">Sync</button>
              <button data-open-finance-action="renew" data-connection-id="${escapeHtml(connection.id)}" class="border-2 border-black px-2 py-1 text-[10px] font-black uppercase bg-white">Renovar</button>
              <button data-open-finance-action="revoke" data-connection-id="${escapeHtml(connection.id)}" class="border-2 border-black px-2 py-1 text-[10px] font-black uppercase bg-red-100">Revogar</button>
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
    if (!this.ritmoStatusPill || !this.ritmoDailyChart) {
      return;
    }

    const riskLevel = String(ritmoState?.riskLevel || 'verde').toLowerCase();
    const riskLabelMap = {
      verde: 'Verde',
      amarelo: 'Amarelo',
      vermelho: 'Vermelho'
    };
    const riskClassMap = {
      verde: 'bg-emerald-100',
      amarelo: 'bg-yellow-100',
      vermelho: 'bg-red-100'
    };
    this.ritmoStatusPill.classList.remove('bg-emerald-100', 'bg-yellow-100', 'bg-red-100');
    this.ritmoStatusPill.classList.add(riskClassMap[riskLevel] || 'bg-emerald-100');
    this.ritmoStatusPill.innerText = riskLabelMap[riskLevel] || 'Verde';

    if (this.ritmoBudgetValue) {
      this.ritmoBudgetValue.innerText = formatCurrencyBRL(Number(ritmoState?.monthlyBudget || 0));
    }
    if (this.ritmoRealizedValue) {
      this.ritmoRealizedValue.innerText = formatCurrencyBRL(Number(ritmoState?.realized || 0));
    }
    if (this.ritmoExpectedValue) {
      this.ritmoExpectedValue.innerText = formatCurrencyBRL(Number(ritmoState?.expectedUntilToday || 0));
    }

    const recommendationGap = Number(ritmoState?.recommendationGap || 0);
    const daysRemaining = Number(ritmoState?.daysRemaining || 0);
    if (this.ritmoRecommendation) {
      this.ritmoRecommendation.innerText = `Para fechar no alvo, reduza ${formatCurrencyBRL(recommendationGap)} em ${daysRemaining} dias.`;
    }

    const daily = ritmoState?.daily || {};
    const days = Array.isArray(daily.days) ? daily.days : [];
    const series = Array.isArray(daily.series) ? daily.series : [];

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

    const buildDayTooltipHtml = (day, detail) => {
      if (!detail) {
        return '<p class="text-[10px] font-bold text-zinc-500">Passe o mouse em um dia para ver o detalhamento por categoria.</p>';
      }

      const rankingRows = (detail.ranking || [])
        .map((item) => {
          const category = String(item?.category || 'Outros').trim() || 'Outros';
          const value = Number(item?.value || 0);
          const percent = Number(item?.percent || 0);
          return `
            <div class="flex items-center justify-between gap-2 text-[10px] font-bold text-zinc-700">
              <span class="truncate">${escapeHtml(category)}</span>
              <span class="whitespace-nowrap">${formatCurrencyBRL(value)} · ${percent.toFixed(1)}%</span>
            </div>
          `;
        })
        .join('');

      return `
        <div class="space-y-1 text-[10px]">
          <p class="font-black uppercase text-zinc-600">Dia ${formatDayLabelPtBr(day)}</p>
          <p class="font-black text-zinc-900">Total: ${formatCurrencyBRL(Number(detail.total || 0))}</p>
          <div class="border-t border-zinc-200 pt-1 space-y-1">
            ${
              rankingRows ||
              '<p class="text-[10px] font-bold text-zinc-500">Sem categorias com gasto neste dia.</p>'
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
        '<p class="text-[10px] font-bold text-zinc-500">Passe o mouse em um dia para ver o detalhamento por categoria.</p>';
    }

    const categories = series.map((item) => String(item.category || '').trim()).filter(Boolean);
    const selectedCategory = String(ritmoState?.selectedCategory || 'all').trim();
    const activeLegendCategory =
      selectedCategory && selectedCategory !== 'all' && categories.includes(selectedCategory)
        ? selectedCategory
        : null;
    const colorMap = new Map(categories.map((category, index) => [category, this.getCategoryColor(category, index)]));

    const getActiveCategories = () => (activeLegendCategory ? [activeLegendCategory] : categories);

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
        <div class="flex items-end gap-2 overflow-x-auto no-scrollbar min-h-[180px]">
          ${days
            .map((day, dayIndex) => {
              const stacks = activeCategories.map((category) => {
                const row = series.find((item) => item.category === category);
                const value = Number(row?.values?.[dayIndex] || 0);
                const percent = (value / maxTotal) * 100;
                if (value <= 0) {
                  return '';
                }
                return `<div class="w-8" style="height:${Math.max(2, percent)}%;background:${colorMap.get(category)}" title="${escapeHtml(
                  `${category}: ${formatCurrencyBRL(value)}`
                )}"></div>`;
              });

              const detail = (daily.details || []).find((item) => item.day === day);
              const rankingText = (detail?.ranking || [])
                .slice(0, 3)
                .map((item) => `${item.category}: ${formatCurrencyBRL(item.value)} (${Number(item.percent || 0).toFixed(1)}%)`)
                .join(' • ');

              return `
                <button data-day="${escapeHtml(day)}" class="ritmo-day-column flex flex-col items-center justify-end min-w-[52px] h-[180px] border border-zinc-200 bg-white p-1" title="${escapeHtml(
                  rankingText
                )}">
                  <div class="flex flex-col-reverse items-center justify-end h-[140px] gap-[1px]">${stacks.join('')}</div>
                  <span class="text-[10px] font-black uppercase mt-1">${escapeHtml(day.slice(8, 10))}</span>
                </button>
              `;
            })
            .join('')}
        </div>
      `;

      this.ritmoDailyChart.querySelectorAll('.ritmo-day-column').forEach((button) => {
        button.addEventListener('mouseenter', () => {
          const day = button.dataset.day;
          const detail = (daily.details || []).find((item) => item.day === day);
          if (this.ritmoDailyTooltip) {
            this.ritmoDailyTooltip.innerHTML = buildDayTooltipHtml(day, detail);
          }
        });

        button.addEventListener('click', () => {
          const day = String(button.dataset.day || '').trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
            return;
          }

          const detail = (daily.details || []).find((item) => item.day === day);
          if (this.ritmoDailyTooltip) {
            this.ritmoDailyTooltip.innerHTML = buildDayTooltipHtml(day, detail);
          }

          this.handlers?.onFiltersChange?.({
            startDate: day,
            endDate: day
          });
        });
      });
    };

    this.ritmoLegend.innerHTML = categories
      .map((category) => {
        const color = colorMap.get(category);
        return `
          <button data-category-legend="${escapeHtml(category)}" class="inline-flex items-center gap-1 border border-black px-2 py-1 text-[10px] font-black uppercase bg-white">
            <span style="width:10px;height:10px;background:${color};border:1px solid #111;"></span>
            ${escapeHtml(category)}
          </button>
        `;
      })
      .join('');

    this.ritmoLegend.querySelectorAll('[data-category-legend]').forEach((button) => {
      const buttonCategory = button.dataset.categoryLegend;
      const isActive = Boolean(activeLegendCategory) && buttonCategory === activeLegendCategory;
      button.classList.toggle('bg-yellow-200', isActive);

      button.addEventListener('click', () => {
        const category = button.dataset.categoryLegend;
        if (!category) {
          return;
        }

        const shouldClearSelection = activeLegendCategory === category;

        if (this.handlers?.onFiltersChange) {
          this.handlers.onFiltersChange({ category: shouldClearSelection ? 'all' : category });
          return;
        }

        // Fallback local caso não exista handler global.
        const fallbackActiveCategories = shouldClearSelection ? categories : [category];
        const fallbackTotalsByDay = days.map((_, dayIndex) => {
          return fallbackActiveCategories.reduce((sum, activeCategory) => {
            const row = series.find((item) => item.category === activeCategory);
            return sum + Number(row?.values?.[dayIndex] || 0);
          }, 0);
        });
        const fallbackMaxTotal = Math.max(...fallbackTotalsByDay, 1);
        this.ritmoDailyChart.querySelectorAll('.ritmo-day-column').forEach((column, dayIndex) => {
          const stacksContainer = column.querySelector('div');
          if (!stacksContainer) {
            return;
          }

          const stacks = fallbackActiveCategories
            .map((activeCategory) => {
              const row = series.find((item) => item.category === activeCategory);
              const value = Number(row?.values?.[dayIndex] || 0);
              if (value <= 0) {
                return '';
              }
              const percent = (value / fallbackMaxTotal) * 100;
              return `<div class="w-8" style="height:${Math.max(2, percent)}%;background:${colorMap.get(activeCategory)}"></div>`;
            })
            .join('');

          stacksContainer.innerHTML = stacks;
        });
      });
    });

    renderChart();
  }

}

export function registerRenderEngagementMethods(DashboardView) {
  applyClassMethods(DashboardView, DashboardViewRenderEngagementMethods);
}
