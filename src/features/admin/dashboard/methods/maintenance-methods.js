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

class AdminDashboardMaintenanceMethods {
  getUserById(uid) {
    return (Array.isArray(this.usersState.allUsers) ? this.usersState.allUsers : []).find((user) => user?.uid === uid) || null;
  }

  getMaintenanceStatus(userId) {
    return (
      this.usersMaintenanceStatusByUserId.get(userId) || {
        type: 'idle',
        message: 'Nenhuma manutenção executada neste usuário nesta sessão.'
      }
    );
  }

  async onDeduplicateUser(userId) {
    if (!userId || this.usersMaintenanceRunning.has(userId)) {
      return;
    }

    const user = this.getUserById(userId);
    if (!user) {
      return;
    }

    const displayName = String(user.displayName || '').trim() || String(user.email || '').trim() || userId;
    const confirmation = window.confirm(
      `Remover duplicados do usuário ${displayName}? Esta ação mantém 1 transação por combinação descrição + data + valor.`
    );
    if (!confirmation) {
      return;
    }

    const currentUser = this.auth?.currentUser;
    if (!currentUser) {
      this.usersMaintenanceStatusByUserId.set(userId, {
        type: 'error',
        message: 'Sessão expirada. Faça login novamente para executar manutenção.'
      });
      this.renderUsersSection();
      return;
    }

    const endpoint = resolveMaintenanceDedupUrl(this.config);
    if (!endpoint) {
      this.usersMaintenanceStatusByUserId.set(userId, {
        type: 'error',
        message: 'Endpoint de manutenção não configurado. Defina admin.maintenanceProxyUrl.'
      });
      this.renderUsersSection();
      return;
    }

    this.usersMaintenanceRunning.add(userId);
    this.usersMaintenanceStatusByUserId.set(userId, {
      type: 'info',
      message: 'Processando deduplicação...'
    });
    this.renderUsersSection();

    try {
      const token = await currentUser.getIdToken(true);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          appId: this.config.appId,
          userId,
          userEmail: String(user?.email || '').trim(),
          dryRun: false
        })
      });

      let payload = {};
      try {
        payload = await response.json();
      } catch (error) {
        payload = {};
      }
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || 'Falha ao remover duplicados.');
      }

      const summary = payload?.summary || {};
      const duplicateDocs = toNumber(summary.duplicateDocs);
      const duplicateGroups = toNumber(summary.duplicateGroups);
      const keeperUpdates = toNumber(summary.keeperUpdates);

      const baseMessage =
        duplicateDocs > 0
          ? `${formatInteger(duplicateDocs)} duplicata(s) removida(s) em ${formatInteger(duplicateGroups)} grupo(s).`
          : 'Nenhuma duplicidade encontrada para este usuário.';
      const mergedMessage =
        keeperUpdates > 0 ? `${baseMessage} ${formatInteger(keeperUpdates)} registro(s) consolidados.` : baseMessage;

      this.usersMaintenanceStatusByUserId.set(userId, {
        type: 'success',
        message: mergedMessage
      });
      this.usersMaintenanceRunning.delete(userId);
      await this.loadAdminDashboard(currentUser);
      return;
    } catch (error) {
      this.usersMaintenanceStatusByUserId.set(userId, {
        type: 'error',
        message: error?.message || 'Erro ao executar deduplicação.'
      });
    } finally {
      this.usersMaintenanceRunning.delete(userId);
      this.renderUsersSection();
    }
  }

  async onResetUserJourney(userId) {
    if (!userId || this.usersMaintenanceRunning.has(userId)) {
      return;
    }

    const user = this.getUserById(userId);
    if (!user) {
      return;
    }

    const displayName = String(user.displayName || '').trim() || String(user.email || '').trim() || userId;
    const confirmation = window.confirm(
      `Resetar toda a jornada do usuário ${displayName}? Essa ação remove transações, categorias, contas bancárias, insights e métricas desse usuário.`
    );
    if (!confirmation) {
      return;
    }

    const currentUser = this.auth?.currentUser;
    if (!currentUser) {
      this.usersMaintenanceStatusByUserId.set(userId, {
        type: 'error',
        message: 'Sessão expirada. Faça login novamente para executar manutenção.'
      });
      this.renderUsersSection();
      return;
    }

    const endpoint = resolveMaintenanceResetUrl(this.config);
    if (!endpoint) {
      this.usersMaintenanceStatusByUserId.set(userId, {
        type: 'error',
        message: 'Endpoint de reset não configurado. Defina admin.maintenanceResetProxyUrl.'
      });
      this.renderUsersSection();
      return;
    }

    this.usersMaintenanceRunning.add(userId);
    this.usersMaintenanceStatusByUserId.set(userId, {
      type: 'info',
      message: 'Processando reset completo da jornada...'
    });
    this.renderUsersSection();

    try {
      const token = await currentUser.getIdToken(true);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          appId: this.config.appId,
          userId,
          userEmail: String(user?.email || '').trim(),
          dryRun: false
        })
      });

      let payload = {};
      try {
        payload = await response.json();
      } catch (error) {
        payload = {};
      }
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || 'Falha ao resetar jornada do usuário.');
      }

      const summary = payload?.summary || {};
      const deletedDocs = toNumber(summary.totalDocsDeleted);
      const matchedDocs = toNumber(summary.totalDocsMatched);
      const resolvedUserIds = Array.isArray(summary.resolvedUserIds) ? summary.resolvedUserIds : [];
      const resolvedLabel =
        resolvedUserIds.length > 1 ? ` (${formatInteger(resolvedUserIds.length)} IDs relacionados limpos)` : '';
      const message =
        deletedDocs > 0
          ? `Jornada resetada com sucesso. ${formatInteger(deletedDocs)} registro(s) removido(s)${resolvedLabel}.`
          : `Jornada resetada com sucesso. Nenhum registro para remover (${formatInteger(
              matchedDocs
            )} item(ns) analisados)${resolvedLabel}.`;

      this.usersMaintenanceStatusByUserId.set(userId, {
        type: 'success',
        message
      });
      this.usersMaintenanceRunning.delete(userId);
      await this.loadAdminDashboard(currentUser);
      return;
    } catch (error) {
      this.usersMaintenanceStatusByUserId.set(userId, {
        type: 'error',
        message: error?.message || 'Erro ao resetar jornada do usuário.'
      });
    } finally {
      this.usersMaintenanceRunning.delete(userId);
      this.renderUsersSection();
    }
  }

}

export function registerMaintenanceMethods(AdminDashboardApp) {
  applyClassMethods(AdminDashboardApp, AdminDashboardMaintenanceMethods);
}
