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

class AdminDashboardUserListMethods {
  filterUsersByEmail(users, query) {
    const normalizedQuery = normalizeSearchTerm(query);
    if (!normalizedQuery) {
      return Array.isArray(users) ? users : [];
    }

    return (Array.isArray(users) ? users : []).filter((user) =>
      normalizeEmail(user?.email || '').includes(normalizedQuery)
    );
  }

  paginateUsers(users) {
    const safeUsers = Array.isArray(users) ? users : [];
    const totalItems = safeUsers.length;
    const pageSize = Math.max(1, Math.round(toNumber(this.usersState.pageSize || DEFAULT_USERS_PAGE_SIZE)));
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.max(1, Math.min(Math.round(toNumber(this.usersState.page || 1)), totalPages));
    const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalItems);

    this.usersState.page = currentPage;
    this.usersState.pageSize = pageSize;
    this.usersState.totalPages = totalPages;

    return {
      totalItems,
      totalPages,
      currentPage,
      pageSize,
      startIndex,
      endIndex,
      pageItems: safeUsers.slice(startIndex, endIndex),
      hasPrevious: currentPage > 1,
      hasNext: currentPage < totalPages
    };
  }

  renderUsersSection() {
    const allUsers = Array.isArray(this.usersState.allUsers) ? this.usersState.allUsers : [];
    const query = this.usersState.query || '';
    const filteredUsers = this.filterUsersByEmail(allUsers, query);
    this.usersState.filteredUsers = filteredUsers;

    const pagination = this.paginateUsers(filteredUsers);
    const totalAll = allUsers.length;
    const totalFiltered = filteredUsers.length;
    const hasQuery = normalizeSearchTerm(query).length > 0;

    this.usersCount.innerText = hasQuery
      ? `${formatInteger(totalFiltered)} de ${formatInteger(totalAll)} usuário(s)`
      : `${formatInteger(totalFiltered)} usuário(s)`;

    if (totalFiltered === 0) {
      const noResultMessage = hasQuery
        ? 'Nenhum usuário encontrado com este e-mail.'
        : 'Nenhum usuário encontrado para este appId.';
      this.usersTable.innerHTML = `<p class="text-sm font-bold text-zinc-600">${noResultMessage}</p>`;
    } else {
      this.usersTable.innerHTML = this.renderUsers(pagination.pageItems);
    }

    this.renderUsersPagination(pagination, totalFiltered);
  }

  renderUsersPagination(meta, totalFiltered) {
    if (!this.usersPaginationPanel) {
      return;
    }

    if (!meta || totalFiltered <= 0) {
      this.usersPaginationPanel.classList.add('hidden');
      this.usersPaginationRange.innerText = 'Mostrando 0-0 de 0';
      this.usersPaginationStatus.innerText = 'Página 1 de 1';
      if (this.usersPaginationPrevButton) {
        this.usersPaginationPrevButton.disabled = true;
      }
      if (this.usersPaginationNextButton) {
        this.usersPaginationNextButton.disabled = true;
      }
      return;
    }

    this.usersPaginationPanel.classList.remove('hidden');
    this.usersPaginationRange.innerText = `Mostrando ${meta.startIndex + 1}-${meta.endIndex} de ${meta.totalItems}`;
    this.usersPaginationStatus.innerText = `Página ${meta.currentPage} de ${meta.totalPages}`;

    if (this.usersPageSizeSelect && this.usersPageSizeSelect.value !== String(meta.pageSize)) {
      this.usersPageSizeSelect.value = String(meta.pageSize);
    }
    if (this.usersPaginationPrevButton) {
      this.usersPaginationPrevButton.disabled = !meta.hasPrevious;
    }
    if (this.usersPaginationNextButton) {
      this.usersPaginationNextButton.disabled = !meta.hasNext;
    }
  }

  renderTopUsers(users) {
    if (!Array.isArray(users) || users.length === 0) {
      return '<p class="text-sm font-bold text-zinc-600">Sem dados suficientes para ranking.</p>';
    }

    const maxVolume = Math.max(...users.map((user) => toNumber(user.totalTransactions)), 1);

    return users
      .slice(0, 10)
      .map((user, index) => {
        const total = toNumber(user.totalTransactions);
        const width = Math.max(6, Math.round((total / maxVolume) * 100));

        return `
          <article class="admin-ranking-card">
            <div class="flex items-center justify-between gap-2">
              <p class="admin-ranking-title">${index + 1}. ${user.email || user.uid}</p>
              <p class="admin-ranking-total">${formatInteger(total)}</p>
            </div>
            <div class="admin-ranking-track">
              <div class="admin-ranking-fill" style="width:${width}%"></div>
            </div>
            <p class="admin-ranking-helper">Importadas: ${formatInteger(user.importedTransactions || 0)} • Manuais: ${formatInteger(
              user.manualTransactions || 0
            )}</p>
          </article>
        `;
      })
      .join('');
  }

  buildOpportunityUsers(users) {
    const now = new Date();

    return (Array.isArray(users) ? users : [])
      .map((user) => {
        const transactions = user.transactions || {};
        const automation = user.automation || {};
        const issues = [];

        const pending = toNumber(transactions.pendingCategorization);
        if (pending >= 5) {
          issues.push({
            score: Math.min(40, pending),
            label: `Pendências altas (${formatInteger(pending)} transações sem categoria).`
          });
        }

        const autoCategorizedTotal = toNumber(automation.autoCategorizedTotal);
        const acceptedRate = toNumber(automation.acceptedRate);
        if (autoCategorizedTotal >= 8 && acceptedRate < 70) {
          issues.push({
            score: 35,
            label: `Baixa aderência da automação (${formatPercent(acceptedRate)} de aceite).`
          });
        }

        const lastAccess = parseIsoDate(user.lastAccessAt);
        const daysWithoutAccess = lastAccess
          ? Math.floor((now.getTime() - lastAccess.getTime()) / 86400000)
          : Number.POSITIVE_INFINITY;

        if (daysWithoutAccess >= 30 && toNumber(transactions.total) > 0) {
          issues.push({
            score: 25,
            label: `Sem acessar há ${Number.isFinite(daysWithoutAccess) ? daysWithoutAccess : 'muitos'} dias.`
          });
        }

        return {
          uid: user.uid,
          email: user.email || 'Sem e-mail',
          displayName: user.displayName || 'Sem nome',
          score: issues.reduce((accumulator, issue) => accumulator + issue.score, 0),
          issues
        };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 8);
  }

  renderOpportunityUsers(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return '<p class="text-sm font-bold text-zinc-600">Sem alertas críticos neste momento. Operação estável.</p>';
    }

    return items
      .map(
        (item) => `
          <article class="admin-opportunity-card">
            <div class="flex items-center justify-between gap-2">
              <p class="admin-opportunity-title">${item.displayName}</p>
              <span class="admin-opportunity-score">Prioridade ${Math.round(item.score)}</span>
            </div>
            <p class="admin-opportunity-email">${item.email}</p>
            <div class="space-y-1 mt-2">
              ${item.issues.map((issue) => `<p class="admin-opportunity-issue">• ${issue.label}</p>`).join('')}
            </div>
          </article>
        `
      )
      .join('');
  }

  renderUsers(users) {
    if (!Array.isArray(users) || users.length === 0) {
      return '<p class="text-sm font-bold text-zinc-600">Nenhum usuário encontrado para este appId.</p>';
    }

    return users
      .map((user) => {
        const name = String(user.displayName || '').trim() || 'Sem nome';
        const email = String(user.email || '').trim() || 'Sem e-mail';
        const transactions = user.transactions || {};
        const aiUsage = user.aiUsage || {};
        const automation = user.automation || {};
        const pending = toNumber(transactions.pendingCategorization);
        const pendingClass = pending > 0 ? 'text-amber-700' : 'text-emerald-700';
        const maintenanceStatus = this.getMaintenanceStatus(user.uid);
        const maintenanceStatusType = String(maintenanceStatus?.type || 'idle').trim();
        const maintenanceStatusClass =
          maintenanceStatusType === 'success'
            ? 'admin-user-maintenance-status-success'
            : maintenanceStatusType === 'error'
            ? 'admin-user-maintenance-status-error'
            : maintenanceStatusType === 'info'
            ? 'admin-user-maintenance-status-info'
            : 'admin-user-maintenance-status-idle';
        const isMaintenanceRunning = this.usersMaintenanceRunning.has(user.uid);

        return `
          <article class="admin-user-card">
            <div class="admin-user-header">
              <div>
                <p class="admin-user-name">${name}</p>
                <p class="admin-user-email">${email}</p>
              </div>
              <p class="admin-user-uid">UID: ${user.uid}</p>
            </div>

            <div class="admin-user-grid">
              <div>
                <p class="admin-user-label">Cadastro</p>
                <p class="admin-user-value">${formatDateTime(user.createdAt)}</p>
              </div>
              <div>
                <p class="admin-user-label">Último acesso</p>
                <p class="admin-user-value">${formatDateTime(user.lastAccessAt)}</p>
              </div>
              <div>
                <p class="admin-user-label">Transações</p>
                <p class="admin-user-value">${formatInteger(transactions.total || 0)}</p>
              </div>
              <div>
                <p class="admin-user-label">Pendências</p>
                <p class="admin-user-value ${pendingClass}">${formatInteger(pending)}</p>
              </div>
              <div>
                <p class="admin-user-label">Sync IA</p>
                <p class="admin-user-value">${formatInteger(aiUsage.categorizationRunsTotal || 0)}</p>
              </div>
              <div>
                <p class="admin-user-label">Consultor IA</p>
                <p class="admin-user-value">${formatInteger(aiUsage.consultantRunsTotal || 0)}</p>
              </div>
              <div>
                <p class="admin-user-label">Auto aceitas</p>
                <p class="admin-user-value">${formatInteger(automation.autoAcceptedTransactions || 0)}</p>
              </div>
              <div>
                <p class="admin-user-label">Auto revisadas</p>
                <p class="admin-user-value">${formatInteger(automation.autoOverriddenTransactions || 0)}</p>
              </div>
            </div>

            <div class="admin-user-footer">
              <p class="admin-user-label">Taxa de aderência da categorização automática</p>
              <div class="admin-user-progress-track">
                <div class="admin-user-progress-fill" style="width:${Math.max(
                  0,
                  Math.min(toNumber(automation.acceptedRate), 100)
                )}%"></div>
              </div>
              <p class="admin-user-value">${formatPercent(automation.acceptedRate || 0)}</p>
            </div>

            <div class="admin-user-maintenance">
              <div class="admin-user-maintenance-header">
                <p class="admin-user-label">Manutenção da base</p>
                <div class="admin-user-maintenance-actions">
                  <button
                    type="button"
                    class="admin-user-maintenance-btn ${isMaintenanceRunning ? 'is-loading' : ''}"
                    data-admin-action="dedup-user"
                    data-user-id="${user.uid}"
                    ${isMaintenanceRunning ? 'disabled' : ''}
                  >
                    ${isMaintenanceRunning ? 'Processando...' : 'Remover duplicados'}
                  </button>
                  <button
                    type="button"
                    class="admin-user-maintenance-btn ${isMaintenanceRunning ? 'is-loading' : ''}"
                    data-admin-action="delete-open-finance"
                    data-user-id="${user.uid}"
                    ${isMaintenanceRunning ? 'disabled' : ''}
                  >
                    ${isMaintenanceRunning ? 'Processando...' : 'Excluir Open Finance'}
                  </button>
                  <button
                    type="button"
                    class="admin-user-maintenance-btn admin-user-maintenance-btn-danger ${
                      isMaintenanceRunning ? 'is-loading' : ''
                    }"
                    data-admin-action="reset-user"
                    data-user-id="${user.uid}"
                    ${isMaintenanceRunning ? 'disabled' : ''}
                  >
                    ${isMaintenanceRunning ? 'Processando...' : 'Resetar jornada'}
                  </button>
                </div>
              </div>
              <p class="admin-user-maintenance-status ${maintenanceStatusClass}">
                ${maintenanceStatus?.message || ''}
              </p>
            </div>
          </article>
        `;
      })
      .join('');
  }
}

export function registerUserListMethods(AdminDashboardApp) {
  applyClassMethods(AdminDashboardApp, AdminDashboardUserListMethods);
}
