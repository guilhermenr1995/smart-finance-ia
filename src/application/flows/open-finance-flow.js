function getErrorMessage(error) {
  return error?.message || 'Falha na operação de Open Finance.';
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

  app.dashboardView.setBusy(true);
  app.overlayView.show('Conectando banco via Open Finance...');
  try {
    const result = await app.openFinanceService.connectBank(app.config.appId, bankCode);
    app.state.setOpenFinanceConnections(result?.connections || []);
    handleAuthorizationUrl(app, result?.authorizationUrl);
    if (Array.isArray(result?.transactions) && result.transactions.length > 0) {
      app.setTransactionsAndRefresh([...app.state.transactions, ...result.transactions]);
    } else {
      app.refreshDashboard();
    }
    app.persistTransactionsCache();
    app.overlayView.log('Conexão criada com sucesso.');
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