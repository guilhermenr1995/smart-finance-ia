const AUTH_ERROR_MESSAGES = {
  'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/user-not-found': 'Usuário não encontrado.',
  'auth/wrong-password': 'Senha incorreta.',
  'auth/weak-password': 'A senha deve ter pelo menos 6 caracteres.',
  'auth/popup-closed-by-user': 'Login com Google cancelado.',
  'auth/popup-blocked': 'O navegador bloqueou o popup de login. Tente novamente.',
  'auth/operation-not-supported-in-this-environment': 'Este ambiente não suporta popup. Redirecionando para login...',
  'auth/network-request-failed': 'Falha de rede. Verifique sua conexão.'
};

export async function handleAuthState(app, user) {
  app.state.setUser(user);
  app.authView.setAuthenticated(user);

  if (!user) {
    app.state.setTransactions([]);
    app.state.setUserCategories([]);
    app.state.setUserBankAccounts(['Padrão']);
    app.state.updateSearch({ mode: 'description', term: '', useGlobalBase: false });
    app.state.setAiConsultantReport(null);
    app.state.setAiConsultantUsage({ limit: 3, used: 0, remaining: 3, dateKey: '' });
    app.state.setAiConsultantHistory([]);
    app.refreshDashboard();
    app.authView.setBusy(false);
    return;
  }

  try {
    await app.repository.upsertUserProfile(user);
  } catch (profileError) {
    console.warn('Falha ao atualizar perfil de uso do usuário:', profileError);
  }

  const cached = app.localCacheService.load(user.uid);
  const hasCachedSnapshot =
    cached.transactions.length > 0 ||
    (cached.categories || []).length > 0 ||
    (cached.bankAccounts || []).length > 0 ||
    (cached.consultantInsights || []).length > 0;

  if (hasCachedSnapshot) {
    app.state.setTransactions(cached.transactions);
    app.state.setUserCategories(cached.categories || []);
    app.state.setUserBankAccounts(cached.bankAccounts || ['Padrão']);
    app.state.setAiConsultantHistory(cached.consultantInsights || []);
    app.refreshDashboard();
  }

  const shouldSyncCloud = !app.localCacheService.isFresh(cached.lastSyncedAt);
  await app.syncDataFromCloud({ force: shouldSyncCloud, showOverlay: shouldSyncCloud });
  app.authView.setBusy(false);
}

export async function runAuthOperation(app, action, options = {}) {
  app.authView.setBusy(true, options);
  let succeeded = false;
  try {
    await action();
    succeeded = true;
    app.authView.clearMessage();
  } catch (error) {
    app.authView.showMessage(normalizeAuthError(app, error), 'error');
  } finally {
    const holdBusyUntilAuthState = Boolean(options?.holdBusyUntilAuthState);
    if (!holdBusyUntilAuthState || !succeeded) {
      app.authView.setBusy(false);
    }
  }
}

export async function handleEmailLogin(app, { email, password }) {
  await runAuthOperation(
    app,
    async () => {
      assertEmailAndPassword(email, password);
      await app.authService.signInWithEmail(email, password);
    },
    {
      action: 'login',
      message: 'Entrando na sua conta...'
    }
  );
}

export async function handleEmailRegister(app, { email, password }) {
  await runAuthOperation(
    app,
    async () => {
      assertEmailAndPassword(email, password);
      await app.authService.registerWithEmail(email, password);
      app.authView.showMessage('Conta criada com sucesso.', 'success');
    },
    {
      action: 'register',
      message: 'Criando sua conta...'
    }
  );
}

export async function handleGoogleLogin(app) {
  await runAuthOperation(
    app,
    async () => {
      await app.authService.signInWithGoogle();
    },
    {
      action: 'google',
      message: 'Abrindo login do Google...',
      holdBusyUntilAuthState: true
    }
  );
}

export async function handlePasswordReset(app, email) {
  await runAuthOperation(
    app,
    async () => {
      if (!email) {
        throw new Error('Informe seu e-mail para redefinir a senha.');
      }

      await app.authService.sendPasswordReset(email);
      app.authView.showMessage('E-mail de redefinição enviado.', 'success');
    },
    {
      action: 'reset-password',
      message: 'Enviando e-mail de redefinição...'
    }
  );
}

export async function handleLogout(app) {
  await runAuthOperation(
    app,
    async () => {
      await app.authService.signOut();
    },
    {
      action: 'logout',
      message: 'Encerrando sua sessão...'
    }
  );
}

export function assertEmailAndPassword(email, password) {
  if (!email || !password) {
    throw new Error('Informe e-mail e senha.');
  }

  if (password.length < 6) {
    throw new Error('A senha deve ter no mínimo 6 caracteres.');
  }
}

export function normalizeAuthError(app, error) {
  if (error?.message && !error?.code) {
    return error.message;
  }

  return AUTH_ERROR_MESSAGES[error?.code] || app.normalizeError(error);
}
