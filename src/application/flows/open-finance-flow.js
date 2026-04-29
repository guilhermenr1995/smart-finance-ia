function getErrorMessage(error) {
  return error?.message || 'Falha na operação de Open Finance.';
}

const MEU_PLUGGY_ITEM_STORAGE_KEY = 'smart-finance-open-finance-meu-pluggy-item-id';
const MEU_PLUGGY_INPUT_ID = 'open-finance-meu-pluggy-item-id';

function getMeuPluggyItemInput() {
  return document.getElementById(MEU_PLUGGY_INPUT_ID);
}

function hydrateMeuPluggyItemInput() {
  const input = getMeuPluggyItemInput();
  if (!input) {
    return;
  }

  const previous = String(localStorage.getItem(MEU_PLUGGY_ITEM_STORAGE_KEY) || '').trim();
  if (!input.value.trim() && previous) {
    input.value = previous;
  }
}

function resolveMeuPluggyItemId() {
  const input = getMeuPluggyItemInput();
  const currentInputValue = String(input?.value || '').trim();
  if (currentInputValue) {
    localStorage.setItem(MEU_PLUGGY_ITEM_STORAGE_KEY, currentInputValue);
    return currentInputValue;
  }

  const previous = String(localStorage.getItem(MEU_PLUGGY_ITEM_STORAGE_KEY) || '').trim();
  if (previous && input) {
    input.value = previous;
    return previous;
  }

  const typed = window.prompt(
    'Informe o Item ID do Meu Pluggy (uuid da conexão autorizada no meu.pluggy.ai).',
    previous
  );

  if (typed === null) {
    return null;
  }

  const itemId = String(typed || '').trim();
  if (!itemId) {
    return '';
  }

  localStorage.setItem(MEU_PLUGGY_ITEM_STORAGE_KEY, itemId);
  if (input) {
    input.value = itemId;
  }
  return itemId;
}

function handleAuthorizationUrl(app, authorizationUrl) {
  const url = String(authorizationUrl || '').trim();
  if (!url) {
    return;
  }

  app.overlayView?.log?.('Aguardando consentimento no banco. Abrindo fluxo de autorização...');
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (error) {
    app.overlayView?.log?.(`Abra manualmente o link de autorização: ${url}`);
  }
}

export async function loadOpenFinanceConnections(app, options = {}) {
  if (!app.state.user || !app.openFinanceService) {
    return;
  }

  hydrateMeuPluggyItemInput();
  const showFeedback = Boolean(options.showFeedback);
  try {
    const result = await app.openFinanceService.listConnections(app.config.appId);
    app.state.setOpenFinanceConnections(result?.connections || []);
    app.persistTransactionsCache();
    if (showFeedback) {
      app.authView.showMessage('Conexões Open Finance atualizadas.', 'success');
    }
    app.refreshDashboard();
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

  hydrateMeuPluggyItemInput();
  const connectOptions = {};
  if (String(bankCode || '').trim() === 'meu-pluggy') {
    const itemId = resolveMeuPluggyItemId();
    if (itemId === null) {
      return;
    }
    if (!itemId) {
      app.authView.showMessage('Para conectar via Meu Pluggy, informe um Item ID válido.', 'error');
      return;
    }
    connectOptions.providerItemId = itemId;
  }

  app.dashboardView.setBusy(true);
  app.overlayView.show('Conectando banco via Open Finance...');
  try {
    const result = await app.openFinanceService.connectBank(app.config.appId, bankCode, connectOptions);
    app.state.setOpenFinanceConnections(result?.connections || []);
    handleAuthorizationUrl(app, result?.authorizationUrl);
    if (Array.isArray(result?.transactions) && result.transactions.length > 0) {
      app.setTransactionsAndRefresh([...app.state.transactions, ...result.transactions]);
    } else {
      app.refreshDashboard();
    }
    app.persistTransactionsCache();
    app.overlayView.log('Conexão criada com sucesso.');
    if (String(bankCode || '').trim() === 'meu-pluggy') {
      app.overlayView.log('Dica: gerencie consentimentos e conexões direto no Meu Pluggy.');
    }
    app.overlayView.log(`Transações sincronizadas: ${Number(result?.insertedCount || 0)}.`);
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

  app.dashboardView.setBusy(true);
  app.overlayView.show('Sincronizando conexão Open Finance...');
  try {
    const result = await app.openFinanceService.syncConnection(app.config.appId, connectionId);
    app.state.setOpenFinanceConnections(result?.connections || []);
    handleAuthorizationUrl(app, result?.authorizationUrl);
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
  if (!app.state.user || !app.openFinanceService) {
    return;
  }

  try {
    const result = await app.openFinanceService.renewConnection(app.config.appId, connectionId);
    app.state.setOpenFinanceConnections(result?.connections || []);
    handleAuthorizationUrl(app, result?.authorizationUrl);
    app.persistTransactionsCache();
    app.refreshDashboard();
    app.authView.showMessage('Consentimento renovado com sucesso.', 'success');
  } catch (error) {
    app.authView.showMessage(getErrorMessage(error), 'error');
  }
}

export async function revokeOpenFinanceConnection(app, connectionId) {
  if (!app.state.user || !app.openFinanceService) {
    return;
  }

  const confirmed = window.confirm('Deseja realmente desconectar esta conta Open Finance?');
  if (!confirmed) {
    return;
  }

  try {
    const result = await app.openFinanceService.revokeConnection(app.config.appId, connectionId);
    app.state.setOpenFinanceConnections(result?.connections || []);
    app.persistTransactionsCache();
    app.refreshDashboard();
    app.authView.showMessage('Conexão revogada.', 'success');
  } catch (error) {
    app.authView.showMessage(getErrorMessage(error), 'error');
  }
}
