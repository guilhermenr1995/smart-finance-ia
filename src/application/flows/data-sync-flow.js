export function persistTransactionsCache(app) {
  if (!app.state.user) {
    return;
  }

  app.localCacheService.save(app.state.user.uid, {
    transactions: app.state.transactions,
    categories: app.state.userCategories,
    bankAccounts: app.state.userBankAccounts,
    consultantInsights: Object.values(app.state.aiConsultant.historyByKey || {}),
    monthlyGoals: app.state.monthlyGoals
  });
}

export function setTransactionsAndRefresh(app, transactions) {
  app.state.setTransactions(transactions);
  persistTransactionsCache(app);
  app.refreshDashboard();
}

export async function syncDataFromCloud(app, options = {}) {
  if (!app.state.user) {
    return false;
  }

  const force = Boolean(options.force);
  const showOverlay = Boolean(options.showOverlay);

  const cached = app.localCacheService.load(app.state.user.uid);
  if (!force && app.localCacheService.isFresh(cached.lastSyncedAt)) {
    return false;
  }

  if (showOverlay) {
    app.overlayView.show('Sincronizando dados...');
  }

  try {
    const consultantInsightsPromise = app.repository.fetchConsultantInsights(app.state.user.uid).catch((error) => {
      console.warn('Consultant insights sync skipped:', error);
      return [];
    });

    const [transactions, categories, bankAccounts, consultantInsights, monthlyGoals] = await Promise.all([
      app.repository.fetchAll(app.state.user.uid),
      app.repository.fetchCategories(app.state.user.uid),
      app.repository.fetchBankAccounts(app.state.user.uid),
      consultantInsightsPromise,
      app.repository.fetchMonthlyGoals(app.state.user.uid).catch((error) => {
        console.warn('Monthly goals sync skipped:', error);
        return [];
      })
    ]);
    app.state.setUserCategories(categories);
    app.state.setUserBankAccounts(bankAccounts);
    app.state.setAiConsultantHistory(consultantInsights);
    app.state.setMonthlyGoals(monthlyGoals);
    setTransactionsAndRefresh(app, transactions);
    if (showOverlay) {
      app.overlayView.hide();
    }
    return true;
  } catch (error) {
    if (showOverlay) {
      app.overlayView.showError(app.normalizeError(error));
    } else {
      app.authView.showMessage(app.normalizeError(error), 'error');
    }
    return false;
  }
}
