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

class DashboardViewAiMethods {
  renderAiConsultant(aiConsultantState = {}) {
    const report = aiConsultantState?.report || null;
    this.consultantHasRemaining = true;
    if (this.aiConsultantUsageLabel) {
      this.aiConsultantUsageLabel.innerText = 'Atualize quando quiser';
    }
    this.aiConsultantButton.disabled = this.isBusy;
    this.aiConsultantButton.classList.remove('opacity-50', 'cursor-not-allowed');

    if (!report) {
      this.aiConsultantStatusLabel.innerText = 'Aguardando análise';
      this.aiConsultantPlaceholder.classList.remove('hidden');
      this.aiConsultantContent.classList.add('hidden');
      this.aiConsultantContent.innerHTML = '';
      return;
    }

    const increased = Array.isArray(report.increased) ? report.increased : [];
    const reduced = Array.isArray(report.reduced) ? report.reduced : [];
    const smartAlerts = Array.isArray(report.smartAlerts) ? report.smartAlerts : [];

    this.aiConsultantStatusLabel.innerText = 'Análise disponível';
    this.aiConsultantPlaceholder.classList.add('hidden');
    this.aiConsultantContent.classList.remove('hidden');
    this.aiConsultantContent.innerHTML = `
      <div class="bg-zinc-50 border-2 border-black p-3">
        <p class="text-[10px] font-black uppercase text-zinc-500 mb-1">Resumo do comportamento</p>
        <p class="text-sm font-bold text-zinc-800">${escapeHtml(report.overview || 'Sem resumo gerado.')}</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${this.renderDeltaBlock('Aumentou vs Período Anterior', increased, 'bg-red-50')}
        ${this.renderDeltaBlock('Reduziu vs Período Anterior', reduced, 'bg-emerald-50')}
      </div>
      ${this.renderAlertsBlock(smartAlerts, [])}
    `;
  }

  resolveAiFinanceBlockReason(reasonCode = '') {
    const map = {
      QUESTION_TOO_SHORT: 'Pergunta muito curta. Escreva pelo menos 4 caracteres e inclua o contexto financeiro.',
      QUESTION_TOO_LONG: 'Pergunta muito longa. Resuma para até 320 caracteres.',
      QUESTION_MALICIOUS: 'Pergunta bloqueada por padrão suspeito. Reformule no contexto financeiro.',
      QUESTION_OUT_OF_SCOPE: 'A pergunta precisa ser sobre suas finanças neste período filtrado.',
      MALICIOUS_CONTENT: 'Pergunta bloqueada por padrão suspeito. Reformule no contexto financeiro.',
      OUT_OF_SCOPE: 'A pergunta precisa ser sobre suas finanças neste período filtrado.',
      NO_DATA: 'Não há transações ativas no filtro atual para responder.',
      TOO_MANY_TRANSACTIONS: 'Muitos dados no filtro atual. Refine período/categoria para continuar.',
      DAILY_LIMIT_REACHED: 'Você atingiu o limite diário de 10 perguntas para a IA. Tente novamente amanhã.',
      CANNOT_ANSWER_FROM_DATA: 'Não foi possível concluir com segurança usando apenas os dados filtrados.',
      AI_UNAVAILABLE: 'A IA está indisponível no momento. Tente novamente em instantes.',
      INVALID_FILTERS: 'Filtros inválidos para esta consulta. Ajuste o período e tente de novo.',
      INVALID_QUESTION: 'Pergunta inválida. Reescreva de forma objetiva sobre seus gastos.'
    };

    return map[reasonCode] || 'Pergunta bloqueada pelos guardrails de segurança.';
  }

  isSameAiFinanceFilter(baseFilters = {}, responseFilters = {}) {
    return (
      String(baseFilters.startDate || '') === String(responseFilters.startDate || '') &&
      String(baseFilters.endDate || '') === String(responseFilters.endDate || '') &&
      String(baseFilters.accountType || 'all') === String(responseFilters.accountType || 'all') &&
      String(baseFilters.category || 'all') === String(responseFilters.category || 'all') &&
      String(baseFilters.source || 'all') === String(responseFilters.source || 'all')
    );
  }

  extractAiFinanceSection(answer = '', sectionPattern = '') {
    const safeAnswer = String(answer || '');
    if (!safeAnswer || !sectionPattern) {
      return '';
    }

    const allSectionsPattern = '(?:Resumo|Mudan(?:ç|c)as principais|Refer(?:ê|e)ncias|Dica pr(?:á|a)tica)';
    const regex = new RegExp(
      `(?:^|\\n)\\s*${sectionPattern}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*${allSectionsPattern}\\s*:|$)`,
      'i'
    );
    const match = safeAnswer.match(regex);
    return String(match?.[1] || '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  parseAiFinanceSections(answer = '') {
    const safeAnswer = String(answer || '').trim();
    if (!safeAnswer) {
      return {
        summary: '',
        changes: '',
        references: '',
        tip: ''
      };
    }

    const summary = this.extractAiFinanceSection(safeAnswer, 'Resumo');
    const changes = this.extractAiFinanceSection(safeAnswer, 'Mudan(?:ç|c)as principais');
    const references = this.extractAiFinanceSection(safeAnswer, 'Refer(?:ê|e)ncias');
    const tip = this.extractAiFinanceSection(safeAnswer, 'Dica pr(?:á|a)tica');

    if (!summary && !changes && !references && !tip) {
      return {
        summary: safeAnswer,
        changes: '',
        references: '',
        tip: ''
      };
    }

    return {
      summary,
      changes,
      references,
      tip
    };
  }

  splitAiFinanceParagraphs(text = '') {
    return String(text || '')
      .split(/\n{2,}/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  splitAiFinanceListItems(text = '') {
    const safe = String(text || '').trim();
    if (!safe) {
      return [];
    }

    const normalized = safe
      .replace(/\n/g, '\n')
      .replace(/\s+\|\s+/g, '\n')
      .replace(/\s*[•]\s*/g, '\n')
      .replace(/\s*-\s+/g, '\n');

    let items = normalized
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (items.length <= 1) {
      items = safe
        .split(/\s*;\s+/)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return items.slice(0, 8);
  }

  renderAiFinanceParagraphs(text = '', className = 'text-[13px] font-semibold text-zinc-800 leading-relaxed') {
    const paragraphs = this.splitAiFinanceParagraphs(text);
    if (paragraphs.length === 0) {
      return '';
    }

    return paragraphs.map((item) => `<p class="${className}">${escapeHtml(item)}</p>`).join('');
  }

  renderAiFinanceList(items = []) {
    const safeItems = Array.isArray(items)
      ? items
          .map((item) => String(item || '').trim())
          .filter(Boolean)
          .slice(0, 8)
      : [];

    if (safeItems.length === 0) {
      return '';
    }

    const rows = safeItems
      .map(
        (item) => `
          <li class="flex items-start gap-2 border border-black/15 bg-white px-2 py-2">
            <span class="mt-[5px] inline-block h-1.5 w-1.5 rounded-full bg-zinc-900"></span>
            <span class="text-[12px] font-bold text-zinc-800 leading-relaxed">${escapeHtml(item)}</span>
          </li>
        `
      )
      .join('');

    return `<ul class="space-y-2">${rows}</ul>`;
  }

  renderAiFinanceQuestion(aiFinanceQuestionState = {}, filters = {}) {
    if (
      !this.aiFinanceQuestionStatusLabel ||
      !this.aiFinanceQuestionPlaceholder ||
      !this.aiFinanceQuestionContent
    ) {
      return;
    }

    const hasQuestion = String(aiFinanceQuestionState?.question || '').trim().length > 0;
    const isSameFilter = this.isSameAiFinanceFilter(filters, aiFinanceQuestionState?.filters || {});
    const shouldShowResult = hasQuestion && isSameFilter;
    const blocked = Boolean(aiFinanceQuestionState?.blocked);
    const answer = String(aiFinanceQuestionState?.answer || '').trim();
    const evidence = Array.isArray(aiFinanceQuestionState?.evidence) ? aiFinanceQuestionState.evidence : [];
    const datasetMeta = aiFinanceQuestionState?.datasetMeta || null;
    const reasonCode = String(aiFinanceQuestionState?.reasonCode || '').trim();

    if (this.aiFinanceQuestionButton) {
      this.aiFinanceQuestionButton.disabled = this.isBusy;
    }

    if (!shouldShowResult) {
      this.aiFinanceQuestionStatusLabel.innerText = 'Aguardando pergunta';
      this.aiFinanceQuestionPlaceholder.classList.remove('hidden');
      this.aiFinanceQuestionContent.classList.add('hidden');
      this.aiFinanceQuestionContent.innerHTML = '';
      return;
    }

    this.aiFinanceQuestionPlaceholder.classList.add('hidden');
    this.aiFinanceQuestionContent.classList.remove('hidden');

    if (blocked) {
      this.aiFinanceQuestionStatusLabel.innerText = 'Pergunta bloqueada';
      this.aiFinanceQuestionContent.innerHTML = `
        <div class="bg-red-50 border-2 border-black p-3 space-y-2">
          <p class="text-[10px] font-black uppercase text-red-700">Guardrail de segurança</p>
          <p class="text-sm font-bold text-zinc-800">${escapeHtml(this.resolveAiFinanceBlockReason(reasonCode))}</p>
          ${datasetMeta ? `<p class="text-[10px] font-bold text-zinc-600">Base filtrada: ${Number(datasetMeta.count || 0)} transação(ões) ativas.</p>` : ''}
        </div>
      `;
      return;
    }

    this.aiFinanceQuestionStatusLabel.innerText = 'Resposta disponível';
    const sections = this.parseAiFinanceSections(answer || 'Sem resposta disponível.');
    const summaryParagraphs = this.renderAiFinanceParagraphs(sections.summary || answer || 'Sem resposta disponível.');
    const changeItems = this.splitAiFinanceListItems(sections.changes);
    const changesList = this.renderAiFinanceList(changeItems);
    const referencesParagraphs = this.renderAiFinanceParagraphs(
      sections.references,
      'text-[12px] font-semibold text-zinc-700 leading-relaxed'
    );
    const referencesList = this.renderAiFinanceList(
      evidence.length > 0 ? evidence.slice(0, 6) : this.splitAiFinanceListItems(sections.references)
    );
    const tipParagraphs = this.renderAiFinanceParagraphs(
      sections.tip,
      'text-[13px] font-black text-zinc-800 leading-relaxed'
    );
    const isContextualMeta = datasetMeta && String(datasetMeta.scopeMode || '').toLowerCase() === 'contextual';
    const baseLabel = datasetMeta
      ? `${Number(datasetMeta.count || 0)} transação(ões) ativas • total ${formatCurrencyBRL(Number(datasetMeta.total || 0))}`
      : 'Base filtrada ativa';
    const previousDateLabel =
      datasetMeta?.previousStartDate && datasetMeta?.previousEndDate
        ? ` (${toBrDate(datasetMeta.previousStartDate)} a ${toBrDate(datasetMeta.previousEndDate)})`
        : '';
    const previousBaseLabel =
      datasetMeta && Number(datasetMeta.previousCount || 0) > 0
        ? `${isContextualMeta ? 'Período anterior considerado na resposta' : 'Período anterior equivalente'}${previousDateLabel}: ${Number(datasetMeta.previousCount || 0)} transação(ões) ativas • total ${formatCurrencyBRL(Number(datasetMeta.previousTotal || 0))}`
        : '';

    this.aiFinanceQuestionContent.innerHTML = `
      <div class="bg-zinc-50 border-2 border-black p-4 space-y-4">
        <p class="text-[10px] font-black uppercase text-zinc-500">Resposta da IA</p>
        <div class="space-y-3">
          <div class="bg-white border border-black/20 p-3 space-y-2">
            <p class="text-[10px] font-black uppercase text-zinc-500">Resumo</p>
            <div class="space-y-2">${summaryParagraphs || '<p class="text-[13px] font-semibold text-zinc-800">Sem resumo disponível.</p>'}</div>
          </div>
          <div class="bg-white border border-black/20 p-3 space-y-2">
            <p class="text-[10px] font-black uppercase text-zinc-500">Mudanças principais</p>
            ${changesList || '<p class="text-[12px] font-semibold text-zinc-700 leading-relaxed">Sem mudanças relevantes identificadas.</p>'}
          </div>
          <div class="bg-white border border-black/20 p-3 space-y-2">
            <p class="text-[10px] font-black uppercase text-zinc-500">Referências</p>
            ${referencesParagraphs ? `<div class="space-y-2">${referencesParagraphs}</div>` : ''}
            ${referencesList || '<p class="text-[12px] font-semibold text-zinc-700 leading-relaxed">Sem referências disponíveis.</p>'}
          </div>
          <div class="bg-emerald-50 border border-black/20 p-3 space-y-2">
            <p class="text-[10px] font-black uppercase text-emerald-700">Dica prática</p>
            <div class="space-y-2">${tipParagraphs || '<p class="text-[13px] font-black text-zinc-800 leading-relaxed">Sem dica prática disponível.</p>'}</div>
          </div>
        </div>
        <p class="text-[10px] font-bold text-zinc-600">${escapeHtml(`${isContextualMeta ? 'Base considerada na resposta' : 'Base filtrada ativa'}: ${baseLabel}`)}</p>
        ${previousBaseLabel ? `<p class="text-[10px] font-bold text-zinc-600">${escapeHtml(previousBaseLabel)}</p>` : ''}
      </div>
    `;
  }

  renderIndicatorsBlock(indicators = {}) {
    if (!indicators || typeof indicators !== 'object' || Object.keys(indicators).length === 0) {
      return '';
    }

    const totalPeriod = Number(indicators.totalPeriod || 0);
    const previousTotal = Number(indicators.previousTotalPeriod || 0);
    const totalDelta = Number(indicators.totalDelta || 0);
    const totalDeltaPercent = Number(indicators.totalDeltaPercent || 0);
    const newConsumption = Number(indicators.newConsumption || 0);
    const installments = Number(indicators.totalInstallments || 0);
    const dailyAverage = Number(indicators.dailyAverage || 0);
    const behavioralAverage = Number(indicators.behavioralAverage || 0);
    const installmentsShare = Number(indicators.installmentsShare || 0);
    const periodDays = Number(indicators.periodDays || 0);
    const transactionsCount = Number(indicators.transactionsCount || 0);

    const cards = [
      {
        label: 'Total do período',
        value: formatCurrencyBRL(totalPeriod),
        helper: `Anterior: ${formatCurrencyBRL(previousTotal)}`
      },
      {
        label: 'Variação total',
        value: `${totalDelta >= 0 ? '+' : '-'}${formatCurrencyBRL(Math.abs(totalDelta))}`,
        helper: `${Math.abs(totalDeltaPercent).toFixed(1)}% vs período anterior`
      },
      {
        label: 'Consumo novo',
        value: formatCurrencyBRL(newConsumption),
        helper: `Parcelas: ${formatCurrencyBRL(installments)}`
      },
      {
        label: 'Média diária',
        value: formatCurrencyBRL(dailyAverage),
        helper: `Média comportamental: ${formatCurrencyBRL(behavioralAverage)}`
      },
      {
        label: 'Peso das parcelas',
        value: `${installmentsShare.toFixed(1)}%`,
        helper: 'Participação no total do período'
      },
      {
        label: 'Base analisada',
        value: `${transactionsCount} lançamentos`,
        helper: `${periodDays} dias considerados`
      }
    ];

    const content = cards
      .map(
        (card) => `
          <div class="bg-white border border-black/20 p-2">
            <p class="text-[10px] font-black uppercase text-zinc-500">${escapeHtml(card.label)}</p>
            <p class="text-sm font-black text-zinc-900 mt-1">${escapeHtml(card.value)}</p>
            <p class="text-[10px] font-bold text-zinc-600 mt-1">${escapeHtml(card.helper)}</p>
          </div>
        `
      )
      .join('');

    return `
      <div class="bg-zinc-50 border-2 border-black p-3">
        <p class="text-[10px] font-black uppercase text-zinc-500 mb-2">Indicadores Financeiros</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          ${content}
        </div>
      </div>
    `;
  }

  renderProjectionBlock(projections = {}, projectionSummary = '') {
    if (!projections || typeof projections !== 'object' || Object.keys(projections).length === 0) {
      return '';
    }

    const endOfMonth = projections?.endOfMonth || {};
    const nextMonth = projections?.nextMonth || {};
    const summaryText = String(projectionSummary || '').trim();

    return `
      <div class="bg-zinc-50 border-2 border-black p-3">
        <p class="text-[10px] font-black uppercase text-zinc-500 mb-2">Projeções</p>
        ${summaryText ? `<p class="text-[11px] font-bold text-zinc-700 mb-3">${escapeHtml(summaryText)}</p>` : ''}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div class="bg-white border border-black/20 p-2">
            <p class="text-[10px] font-black uppercase text-zinc-500">Fechamento ${escapeHtml(endOfMonth.monthLabel || '')}</p>
            <p class="text-sm font-black text-zinc-900 mt-1">${formatCurrencyBRL(Number(endOfMonth.projectedTotal || 0))}</p>
            <p class="text-[10px] font-bold text-zinc-600 mt-1">
              + ${formatCurrencyBRL(Number(endOfMonth.projectedAdditional || 0))} em ${Number(endOfMonth.daysRemaining || 0)} dia(s) restantes
            </p>
          </div>
          <div class="bg-white border border-black/20 p-2">
            <p class="text-[10px] font-black uppercase text-zinc-500">Projeção ${escapeHtml(nextMonth.monthLabel || '')}</p>
            <p class="text-sm font-black text-zinc-900 mt-1">${formatCurrencyBRL(Number(nextMonth.projectedTotal || 0))}</p>
            <p class="text-[10px] font-bold text-zinc-600 mt-1">
              Parcelas: ${formatCurrencyBRL(Number(nextMonth.projectedInstallments || 0))} | Consumo: ${formatCurrencyBRL(Number(nextMonth.projectedConsumption || 0))}
            </p>
          </div>
        </div>
      </div>
    `;
  }

  renderDeltaBlock(title, items, backgroundClass) {
    if (!Array.isArray(items) || items.length === 0) {
      return `
        <div class="${backgroundClass} border-2 border-black p-3">
          <p class="text-[10px] font-black uppercase text-zinc-500 mb-2">${escapeHtml(title)}</p>
          <p class="text-[11px] font-bold text-zinc-600">Sem variações relevantes neste recorte.</p>
        </div>
      `;
    }

    const rows = items
      .slice(0, 5)
      .map((item) => {
        const category = escapeHtml(item.category || 'Sem categoria');
        const current = formatCompactCurrency(Number(item.current || 0));
        const previous = formatCompactCurrency(Number(item.previous || 0));
        const deltaValue = Number(item.delta || 0);
        const delta = formatCompactCurrency(Math.abs(deltaValue));
        const deltaPrefix = deltaValue >= 0 ? '+' : '-';
        const deltaPercent = Math.abs(Number(item.deltaPercent || 0)).toFixed(1);
        const insight = escapeHtml(item.insight || '');
        const drivers = Array.isArray(item.drivers) ? item.drivers.slice(0, 3) : [];
        const driversHtml =
          drivers.length === 0
            ? ''
            : `
              <div class="mt-2 pt-2 border-t border-black/10">
                <p class="text-[10px] font-black uppercase text-zinc-500 mb-1">Transações que mais impactaram</p>
                ${drivers
                  .map((driver) => {
                    const driverDelta = Number(driver?.delta || 0);
                    return `<p class="text-[10px] font-bold text-zinc-700">• ${escapeHtml(
                      String(driver?.title || 'Sem descrição')
                    )} (${driverDelta >= 0 ? '+' : '-'}${formatCompactCurrency(Math.abs(driverDelta))})</p>`;
                  })
                  .join('')}
              </div>
            `;

        return `
          <div class="border border-black/20 p-2 bg-white/70">
            <p class="text-[11px] font-black uppercase">${category}</p>
            <p class="text-[10px] font-bold text-zinc-700">Atual: ${current} | Anterior: ${previous} | Diferença: ${deltaPrefix}${delta} (${deltaPercent}%)</p>
            ${insight ? `<p class="text-[10px] font-bold text-zinc-600 mt-1">${insight}</p>` : ''}
            ${driversHtml}
          </div>
        `;
      })
      .join('');

    return `
      <div class="${backgroundClass} border-2 border-black p-3">
        <p class="text-[10px] font-black uppercase text-zinc-500 mb-2">${escapeHtml(title)}</p>
        <div class="space-y-2">${rows}</div>
      </div>
    `;
  }

  renderTipsBlock(title, tips) {
    const normalizedTips = Array.isArray(tips) ? tips.slice(0, 4) : [];
    const content =
      normalizedTips.length === 0
        ? '<p class="text-[11px] font-bold text-zinc-600">Sem sugestões para este recorte.</p>'
        : normalizedTips
            .map((tip) => `<p class="text-[11px] font-bold text-zinc-700">- ${escapeHtml(String(tip || ''))}</p>`)
            .join('');

    return `
      <div class="bg-zinc-50 border-2 border-black p-3">
        <p class="text-[10px] font-black uppercase text-zinc-500 mb-2">${escapeHtml(title)}</p>
        <div class="space-y-2">${content}</div>
      </div>
    `;
  }

  renderCategoryHighlightsBlock(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return `
        <div class="bg-zinc-50 border-2 border-black p-3">
          <p class="text-[10px] font-black uppercase text-zinc-500 mb-2">Categorias Dominantes</p>
          <p class="text-[11px] font-bold text-zinc-600">Sem categorias relevantes no recorte atual.</p>
        </div>
      `;
    }

    const rows = items
      .slice(0, 6)
      .map((item) => {
        const delta = Number(item.delta || 0);
        const deltaClass = delta >= 0 ? 'text-red-600' : 'text-emerald-700';
        const share = Number(item.share || 0).toFixed(1);

        return `
          <div class="border border-black/20 p-2 bg-white/80">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-[11px] font-black uppercase">${escapeHtml(item.category || 'Sem categoria')}</p>
              <p class="text-[10px] font-black">${formatCompactCurrency(Number(item.current || 0))} (${share}%)</p>
            </div>
            <p class="text-[10px] font-bold ${deltaClass}">
              Variação: ${delta >= 0 ? '+' : '-'}${formatCompactCurrency(Math.abs(delta))}
            </p>
            ${item.insight ? `<p class="text-[10px] font-bold text-zinc-600 mt-1">${escapeHtml(item.insight)}</p>` : ''}
          </div>
        `;
      })
      .join('');

    return `
      <div class="bg-zinc-50 border-2 border-black p-3">
        <p class="text-[10px] font-black uppercase text-zinc-500 mb-2">Categorias Dominantes</p>
        <div class="space-y-2">${rows}</div>
      </div>
    `;
  }

  renderTopMerchantsBlock(topMerchants) {
    if (!Array.isArray(topMerchants) || topMerchants.length === 0) {
      return `
        <div class="bg-zinc-50 border-2 border-black p-3">
          <p class="text-[10px] font-black uppercase text-zinc-500 mb-2">Top Estabelecimentos</p>
          <p class="text-[11px] font-bold text-zinc-600">Sem estabelecimentos suficientes para ranking.</p>
        </div>
      `;
    }

    const rows = topMerchants
      .slice(0, 6)
      .map(
        (item) => `
          <div class="border border-black/20 p-2 bg-white/80 flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-[11px] font-black uppercase truncate">${escapeHtml(item.merchant || 'Sem identificação')}</p>
              <p class="text-[10px] font-bold text-zinc-600">${Number(item.transactions || 0)} lançamento(s)</p>
            </div>
            <div class="text-right">
              <p class="text-[10px] font-black">${formatCompactCurrency(Number(item.total || 0))}</p>
              <p class="text-[10px] font-bold text-zinc-500">${Number(item.share || 0).toFixed(1)}%</p>
            </div>
          </div>
        `
      )
      .join('');

    return `
      <div class="bg-zinc-50 border-2 border-black p-3">
        <p class="text-[10px] font-black uppercase text-zinc-500 mb-2">Top Estabelecimentos</p>
        <div class="space-y-2">${rows}</div>
      </div>
    `;
  }

  renderAlertsBlock(alerts, outliers) {
    const normalizedAlerts = Array.isArray(alerts) ? alerts.slice(0, 5) : [];
    const normalizedOutliers = Array.isArray(outliers) ? outliers.slice(0, 3) : [];

    if (normalizedAlerts.length === 0 && normalizedOutliers.length === 0) {
      return `
        <div class="bg-zinc-50 border-2 border-black p-3">
          <p class="text-[10px] font-black uppercase text-zinc-500 mb-2">Alertas Inteligentes</p>
          <p class="text-[11px] font-bold text-zinc-600">Sem alertas relevantes neste recorte.</p>
        </div>
      `;
    }

    const alertsHtml = normalizedAlerts
      .map((alert) => `<p class="text-[11px] font-bold text-zinc-700">- ${escapeHtml(String(alert || ''))}</p>`)
      .join('');

    const outliersHtml =
      normalizedOutliers.length === 0
        ? ''
        : `
          <div class="mt-2 pt-2 border-t border-black/10">
            <p class="text-[10px] font-black uppercase text-zinc-500 mb-1">Compras Fora do Padrão</p>
            ${normalizedOutliers
              .map(
                (item) =>
                  `<p class="text-[10px] font-bold text-zinc-700">${escapeHtml(item.title || '')} • ${formatCompactCurrency(
                    Number(item.value || 0)
                  )}</p>`
              )
              .join('')}
          </div>
        `;

    return `
      <div class="bg-zinc-50 border-2 border-black p-3">
        <p class="text-[10px] font-black uppercase text-zinc-500 mb-2">Alertas Inteligentes</p>
        <div class="space-y-2">${alertsHtml}${outliersHtml}</div>
      </div>
    `;
  }

}

export function registerAiMethods(DashboardView) {
  applyClassMethods(DashboardView, DashboardViewAiMethods);
}
