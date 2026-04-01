import {
  CHART_WINDOW_DAYS,
  DEFAULT_USERS_PAGE_SIZE,
  buildDailySeries,
  formatDateKeyShort,
  formatDateTime,
  formatInteger,
  formatPercent,
  normalizeEmail,
  normalizeSearchTerm,
  parseIsoDate,
  renderDailyMetricList,
  renderDualDailyChart,
  resolveAdminDashboardUrl,
  resolveMaintenanceDedupUrl,
  resolveMaintenanceResetUrl,
  toNumber
} from '../shared.js';
import { applyClassMethods } from './register-methods.js';

class AdminDashboardRenderDashboardMethods {
  renderDashboard(payload) {
    const totals = payload?.totals || {};
    const highlights = payload?.highlights || {};
    const users = Array.isArray(payload?.users) ? payload.users : [];
    const dailyUsage = payload?.dailyUsage || {};

    const aiSyncDaily = Array.isArray(dailyUsage.aiCategorizationRunsByDay)
      ? dailyUsage.aiCategorizationRunsByDay
      : [];
    const aiConsultantDaily = Array.isArray(dailyUsage.aiConsultantRunsByDay)
      ? dailyUsage.aiConsultantRunsByDay
      : [];
    const importOperationsDaily = Array.isArray(dailyUsage.importOperationsByDay)
      ? dailyUsage.importOperationsByDay
      : [];
    const importedTransactionsDaily = Array.isArray(dailyUsage.importedTransactionsByDay)
      ? dailyUsage.importedTransactionsByDay
      : [];
    const manualTransactionsDaily = Array.isArray(dailyUsage.manualTransactionsByDay)
      ? dailyUsage.manualTransactionsByDay
      : [];

    const totalUsers = toNumber(totals.users);
    const totalTransactions = toNumber(totals.transactions);
    const totalImported = toNumber(totals.importedTransactions);
    const totalManual = toNumber(totals.manualTransactions);
    const totalPending = toNumber(totals.pendingCategorization);
    const totalAiRuns = toNumber(totals.aiCategorizationRuns) + toNumber(totals.aiConsultantRuns);
    const active30d = toNumber(totals.activeUsers30d);
    const active7d = toNumber(totals.activeUsers7d);
    const acceptedRate = toNumber(totals.automationAcceptedRate);
    const overrideRate = toNumber(totals.automationOverrideRate);

    const activeRate30d = totalUsers > 0 ? (active30d / totalUsers) * 100 : 0;
    const importedShare = totalTransactions > 0 ? (totalImported / totalTransactions) * 100 : 0;
    const pendingShare = totalTransactions > 0 ? (totalPending / totalTransactions) * 100 : 0;
    const aiRunsPerActiveUser = active30d > 0 ? totalAiRuns / active30d : 0;

    const cards = [
      {
        label: 'Usuários cadastrados',
        value: formatInteger(totalUsers),
        helper: `Ativos 30d: ${formatInteger(active30d)} (${formatPercent(activeRate30d)})`
      },
      {
        label: 'Transações totais',
        value: formatInteger(totalTransactions),
        helper: `Importadas: ${formatInteger(totalImported)} • Manuais: ${formatInteger(totalManual)}`
      },
      {
        label: 'Uso IA acumulado',
        value: formatInteger(totalAiRuns),
        helper: `Sync IA: ${formatInteger(totals.aiCategorizationRuns)} • Consultor: ${formatInteger(
          totals.aiConsultantRuns
        )}`
      },
      {
        label: 'Aderência da automação',
        value: formatPercent(acceptedRate),
        helper: `Revisão manual: ${formatPercent(overrideRate)}`
      },
      {
        label: 'Pendências de categoria',
        value: formatInteger(totalPending),
        helper: `${formatPercent(pendingShare)} da base ativa`
      },
      {
        label: 'Usuários ativos 7 dias',
        value: formatInteger(active7d),
        helper: `Inativos 30d: ${formatInteger(Math.max(totalUsers - active30d, 0))}`
      },
      {
        label: 'Média transações/usuário',
        value: toNumber(totals.averageTransactionsPerUser).toFixed(1),
        helper: `Sem transações: ${formatInteger(highlights.usersWithNoTransactions || 0)}`
      },
      {
        label: 'Última atualização',
        value: formatDateTime(payload.generatedAt),
        helper: `App: ${payload.appId || '-'}`
      }
    ];

    this.summaryCards.innerHTML = cards
      .map(
        (card) => `
          <article class="admin-metric-card bg-zinc-50 border-2 border-black p-3">
            <p class="admin-metric-label">${card.label}</p>
            <p class="admin-metric-value">${card.value}</p>
            <p class="admin-metric-helper">${card.helper}</p>
          </article>
        `
      )
      .join('');

    const kpis = [
      {
        label: 'Participação de importação',
        value: formatPercent(importedShare),
        helper: 'Quanto da base veio da importação'
      },
      {
        label: 'Chamadas IA por usuário ativo (30d)',
        value: aiRunsPerActiveUser.toFixed(1),
        helper: 'Pressão operacional de IA por usuário engajado'
      },
      {
        label: 'Operações de importação (21d)',
        value: formatInteger(sumSeriesByKey(buildDailySeries({ seriesByKey: { importOps: importOperationsDaily } }), 'importOps')),
        helper: 'Volume recente de ingestão de dados'
      }
    ];

    this.kpiStrip.innerHTML = kpis
      .map(
        (kpi) => `
          <article class="admin-kpi-chip">
            <p>${kpi.label}</p>
            <strong>${kpi.value}</strong>
            <small>${kpi.helper}</small>
          </article>
        `
      )
      .join('');

    this.generatedAtLabel.innerText = `Atualizado em ${formatDateTime(payload.generatedAt)}`;

    const aiSeries = buildDailySeries({
      seriesByKey: {
        sync: aiSyncDaily,
        consultant: aiConsultantDaily
      }
    });

    this.aiUsageChart.innerHTML = renderDualDailyChart({
      series: aiSeries,
      leftKey: 'sync',
      rightKey: 'consultant',
      leftLabel: 'Sync IA',
      rightLabel: 'Consultor IA',
      leftClass: 'admin-bar-yellow',
      rightClass: 'admin-bar-indigo',
      emptyMessage: 'Sem uso de IA nos últimos dias.'
    });

    const importSeries = buildDailySeries({
      seriesByKey: {
        imported: importedTransactionsDaily,
        manual: manualTransactionsDaily
      }
    });

    this.importChart.innerHTML = renderDualDailyChart({
      series: importSeries,
      leftKey: 'imported',
      rightKey: 'manual',
      leftLabel: 'Importadas',
      rightLabel: 'Manuais',
      leftClass: 'admin-bar-emerald',
      rightClass: 'admin-bar-zinc',
      emptyMessage: 'Sem movimentação de importação/manual no período recente.'
    });

    const healthRows = [
      {
        label: 'Aderência da automação',
        value: acceptedRate,
        helper: `${formatInteger(totals.autoAcceptedTransactions)} transações aceitas automaticamente`,
        className: 'admin-health-fill-emerald'
      },
      {
        label: 'Revisão manual pós-automação',
        value: overrideRate,
        helper: `${formatInteger(totals.autoOverriddenTransactions)} transações revisadas pelo usuário`,
        className: 'admin-health-fill-rose'
      },
      {
        label: 'Pendência de categoria na base',
        value: pendingShare,
        helper: `${formatInteger(totalPending)} transações aguardando categorização`,
        className: 'admin-health-fill-amber'
      }
    ];

    this.healthBars.innerHTML = healthRows
      .map(
        (row) => `
          <div class="admin-health-row">
            <div class="flex items-end justify-between gap-2">
              <p class="admin-health-label">${row.label}</p>
              <p class="admin-health-value">${formatPercent(row.value)}</p>
            </div>
            <div class="admin-health-track">
              <div class="admin-health-fill ${row.className}" style="width:${Math.max(0, Math.min(row.value, 100))}%"></div>
            </div>
            <p class="admin-health-helper">${row.helper}</p>
          </div>
        `
      )
      .join('');

    const operationalInsights = [
      `Usuários com pendências de categoria: ${formatInteger(highlights.usersWithPendingCategorization || 0)}.`,
      `Base importada representa ${formatPercent(importedShare)} das transações totais.`,
      `Taxa de usuários ativos (30 dias): ${formatPercent(activeRate30d)}.`
    ];

    this.operationalInsights.innerHTML = operationalInsights
      .map((text) => `<p class="admin-insight-line">${text}</p>`)
      .join('');

    this.aiSyncDaily.innerHTML = renderDailyMetricList(aiSyncDaily, 'Sem uso de sincronização de IA registrado.');
    this.aiConsultantDaily.innerHTML = renderDailyMetricList(aiConsultantDaily, 'Sem uso de Consultor IA registrado.');

    const topUsersByVolume = Array.isArray(highlights.topUsersByVolume) ? highlights.topUsersByVolume : [];
    this.topUsers.innerHTML = this.renderTopUsers(topUsersByVolume);

    const opportunities = this.buildOpportunityUsers(users);
    this.opportunityUsers.innerHTML = this.renderOpportunityUsers(opportunities);

    this.usersState.allUsers = users;
    this.usersState.page = 1;
    this.renderUsersSection();
  }

}

export function registerRenderDashboardMethods(AdminDashboardApp) {
  applyClassMethods(AdminDashboardApp, AdminDashboardRenderDashboardMethods);
}
