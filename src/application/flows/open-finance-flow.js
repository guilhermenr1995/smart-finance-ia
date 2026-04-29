const MEU_PLUGGY_ITEM_STORAGE_KEY = 'smart-finance-open-finance-meu-pluggy-item-id';
const MEU_PLUGGY_INPUT_ID = 'open-finance-meu-pluggy-item-id';

function getErrorMessage(error) {
  return error?.message || 'Falha na operação de Open Finance com Meu Pluggy.';
}

function getMeuPluggyItemInput() {
  return document.getElementById(MEU_PLUGGY_INPUT_ID);
}

function hydrateMeuPluggyItemInput() {
  const input = getMeuPluggyItemInput();
  if (!input) {
    return '';
  }

  const storedValue = String(window.localStorage.getItem(MEU_PLUGGY_ITEM_STORAGE_KEY) || '').trim();
  if (!input.value.trim() && storedValue) {
    input.value = storedValue;
  }
  return String(input.value || '').trim();
}

function resolveMeuPluggyItemId() {
  const input = getMeuPluggyItemInput();
  const typedValue = String(input?.value || '').trim();
  if (typedValue) {
    window.localStorage.setItem(MEU_PLUGGY_ITEM_STORAGE_KEY, typedValue);
    return typedValue;
  }

  const previous = String(window.localStorage.getItem(MEU_PLUGGY_ITEM_STORAGE_KEY) || '').trim();
  if (previous && input) {
    input.value = previous;
    return previous;
  }

  return '';
}

async function trySetupWebhooks(app) {
  if (!app.openFinanceService || !app.state.user) {
    return null;
  }

  try {
    return await app.openFinanceService.setupWebhooks(app.config.appId);
  } catch (_error) {
    return null;
  }
}

export async function loadOpenFinanceConnections(app, options = {}) {
  if (!app.state.user || !app.openFinanceService) {
    return;
  }

  hydrateMeuPluggyItemInput();
  const showFeedback = Boolean(options.showFeedback);

  try {
    const [connectionsResult, webhookSetupResult] = await Promise.all([
      app.openFinanceService.listConnections(app.config.appId),
      trySetupWebhooks(app)
    ]);

    app.state.setOpenFinanceConnections(connectionsResult?.connections || []);
    app.persistTransactionsCache();
    app.refreshDashboard();

    if (showFeedback) {
      const webhookConfigured = Boolean(webhookSetupResult?.webhookSetup?.configured);
      const message = webhookConfigured
        ? 'Conexões atualizadas e webhooks verificados.'
        : 'Conexões atualizadas.';
      app.authView.showMessage(message, 'success');
    }
  } catch (error) {
    if (showFeedback) {
      app.authView.showMessage(getErrorMessage(error), 'error');
    }
  }
}

export async function connectOpenFinanceBank(app, bankCode) {
  if (!app.state.user || !app.openFinanceService) {
    return;
  }

  const normalizedBankCode = String(bankCode || '').trim().toLowerCase();
  if (normalizedBankCode !== 'meu-pluggy') {
    app.authView.showMessage('A integração Open Finance suporta apenas Meu Pluggy.', 'error');
    return;
  }

  const itemId = resolveMeuPluggyItemId();
  if (!itemId) {
    app.authView.showMessage('Informe o Item ID da conexão no Meu Pluggy para continuar.', 'error');
    return;
  }

  app.dashboardView.setBusy(true);
  app.overlayView.show('Conectando item Meu Pluggy e sincronizando transações...');

  try {
    const result = await app.openFinanceService.connectBank(app.config.appId, normalizedBankCode, {
      providerItemId: itemId,
      webhookUrl: String(app.config?.openFinance?.webhookUrl || '').trim()
    });

    app.state.setOpenFinanceConnections(result?.connections || []);

    if (Array.isArray(result?.transactions) && result.transactions.length > 0) {
      app.setTransactionsAndRefresh([...app.state.transactions, ...result.transactions]);
    } else {
      app.refreshDashboard();
    }

    app.persistTransactionsCache();
    app.overlayView.log(`Conexão Meu Pluggy salva. Novas transações: ${Number(result?.insertedCount || 0)}.`);
    app.overlayView.log('Webhook de atualização será usado quando configurado no dashboard da Pluggy.');
    setTimeout(() => app.overlayView.hide(), 900);
  } catch (error) {
    app.overlayView.showError(getErrorMessage(error));
  } finally {
    app.dashboardView.setBusy(false);
  }
}

export async function syncOpenFinanceConnection(app, connectionId) {
  if (!app.state.user || !app.openFinanceService) {
    return;
  }

  const safeConnectionId = String(connectionId || '').trim();
  if (!safeConnectionId) {
    return;
  }

  app.dashboardView.setBusy(true);
  app.overlayView.show('Sincronizando transações do item Meu Pluggy...');

  try {
    const result = await app.openFinanceService.syncConnection(app.config.appId, safeConnectionId, {
      webhookUrl: String(app.config?.openFinance?.webhookUrl || '').trim()
    });
    app.state.setOpenFinanceConnections(result?.connections || []);

    if (Array.isArray(result?.transactions) && result.transactions.length > 0) {
      app.setTransactionsAndRefresh([...app.state.transactions, ...result.transactions]);
    } else {
      app.refreshDashboard();
    }

    app.persistTransactionsCache();
    app.overlayView.log(`Sincronização concluída. Novas transações: ${Number(result?.insertedCount || 0)}.`);
    setTimeout(() => app.overlayView.hide(), 900);
  } catch (error) {
    app.overlayView.showError(getErrorMessage(error));
  } finally {
    app.dashboardView.setBusy(false);
  }
}

export async function renewOpenFinanceConnection(app, connectionId) {
  return syncOpenFinanceConnection(app, connectionId);
}

export async function revokeOpenFinanceConnection(app, connectionId) {
  if (!app.state.user || !app.openFinanceService) {
    return;
  }

  const confirmed = window.confirm('Deseja marcar esta conexão como revogada no Smart Finance?');
  if (!confirmed) {
    return;
  }

  try {
    const result = await app.openFinanceService.revokeConnection(app.config.appId, connectionId);
    app.state.setOpenFinanceConnections(result?.connections || []);
    app.persistTransactionsCache();
    app.refreshDashboard();
    app.authView.showMessage('Conexão revogada no Smart Finance.', 'success');
  } catch (error) {
    app.authView.showMessage(getErrorMessage(error), 'error');
  }
}
