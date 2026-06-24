export class AuthView {
  constructor() {
    this.allowedAdminEmails = new Set(['guilhermenr1995@gmail.com']);
    this.authScreen = document.getElementById('auth-screen');
    this.appScreen = document.getElementById('app-screen');

    this.authForm = document.getElementById('auth-form');
    this.emailInput = document.getElementById('auth-email');
    this.passwordInput = document.getElementById('auth-password');

    this.loginButton = document.getElementById('btn-login');
    this.registerButton = document.getElementById('btn-register');
    this.googleButton = document.getElementById('btn-google');
    this.resetPasswordButton = document.getElementById('btn-reset-password');
    this.logoutButton = document.getElementById('btn-logout');
    this.adminPanelButton = document.getElementById('btn-admin-panel');
    this.familyBudgetButton = document.getElementById('btn-family-budget');

    this.authStatus = document.getElementById('auth-status');
    this.userEmail = document.getElementById('user-email');
    this.message = document.getElementById('auth-message');
    this.loadingIndicator = document.getElementById('auth-loading-indicator');
    this.loadingText = document.getElementById('auth-loading-text');
    this.defaultButtonLabels = {
      login: this.loginButton?.innerText || 'Entrar',
      register: this.registerButton?.innerText || 'Criar conta',
      google: this.googleButton?.innerText || 'Google',
      resetPassword: this.resetPasswordButton?.innerText || 'Esqueci senha'
    };
  }

  bindEvents(handlers) {
    if (this.loginButton && typeof handlers?.onLogin === 'function') {
      this.loginButton.addEventListener('click', () => {
        handlers.onLogin(this.getCredentials());
      });
    }

    if (this.registerButton && typeof handlers?.onRegister === 'function') {
      this.registerButton.addEventListener('click', () => {
        handlers.onRegister(this.getCredentials());
      });
    }

    if (this.googleButton && typeof handlers?.onGoogleLogin === 'function') {
      this.googleButton.addEventListener('click', () => {
        handlers.onGoogleLogin();
      });
    }

    if (this.resetPasswordButton && typeof handlers?.onPasswordReset === 'function') {
      this.resetPasswordButton.addEventListener('click', () => {
        handlers.onPasswordReset(String(this.emailInput?.value || '').trim());
      });
    }

    if (this.logoutButton && typeof handlers?.onLogout === 'function') {
      this.logoutButton.addEventListener('click', () => {
        handlers.onLogout();
      });
    }

    if (this.authForm && typeof handlers?.onLogin === 'function') {
      this.authForm.addEventListener('submit', (event) => {
        event.preventDefault();
        handlers.onLogin(this.getCredentials());
      });
    }
  }

  getCredentials() {
    return {
      email: String(this.emailInput?.value || '').trim(),
      password: String(this.passwordInput?.value || '')
    };
  }

  setAuthenticated(user) {
    const isAuthenticated = Boolean(user);
    const normalizedEmail = String(user?.email || '').trim().toLowerCase();
    const isAdmin = this.allowedAdminEmails.has(normalizedEmail);
    const showAuthScreen = !isAuthenticated;
    const showAppScreen = isAuthenticated;
    const hasAuthShell = Boolean(this.authScreen);

    if (this.authScreen) {
      this.authScreen.classList.toggle('hidden', !showAuthScreen);
      this.authScreen.style.display = showAuthScreen ? '' : 'none';
      this.authScreen.setAttribute('aria-hidden', String(!showAuthScreen));
    }

    if (this.appScreen) {
      if (hasAuthShell) {
        this.appScreen.classList.toggle('hidden', !showAppScreen);
        this.appScreen.style.display = showAppScreen ? '' : 'none';
        this.appScreen.setAttribute('aria-hidden', String(!showAppScreen));
      } else {
        this.appScreen.classList.remove('hidden');
        this.appScreen.style.display = '';
        this.appScreen.setAttribute('aria-hidden', 'false');
      }
    }

    if (this.logoutButton) {
      this.logoutButton.classList.toggle('hidden', !isAuthenticated);
    }
    if (this.familyBudgetButton) {
      this.familyBudgetButton.classList.toggle('hidden', !isAuthenticated);
    }
    if (this.adminPanelButton) {
      this.adminPanelButton.classList.toggle('hidden', !isAuthenticated || !isAdmin);
    }

    if (isAuthenticated) {
      if (this.authStatus) {
        this.authStatus.innerText = 'Online';
      }
      if (this.userEmail) {
        this.userEmail.innerText = user.email || 'Sessão autenticada';
      }
      this.clearMessage();
      return;
    }

    if (this.authStatus) {
      this.authStatus.innerText = 'Offline';
    }
    if (this.userEmail) {
      this.userEmail.innerText = 'Acesse pelo painel principal para continuar';
    }
  }

  setBusy(isBusy, options = {}) {
    const controls = [
      this.loginButton,
      this.registerButton,
      this.googleButton,
      this.resetPasswordButton,
      this.logoutButton,
      this.emailInput,
      this.passwordInput
    ];

    controls.forEach((element) => {
      if (element) {
        element.disabled = isBusy;
      }
    });

    const action = String(options?.action || '').trim().toLowerCase();
    if (isBusy) {
      if (this.loginButton) {
        this.loginButton.innerText = action === 'login' ? 'Entrando...' : this.defaultButtonLabels.login;
      }
      if (this.registerButton) {
        this.registerButton.innerText = action === 'register' ? 'Criando...' : this.defaultButtonLabels.register;
      }
      if (this.googleButton) {
        this.googleButton.innerText = action === 'google' ? 'Conectando...' : this.defaultButtonLabels.google;
      }
      if (this.resetPasswordButton) {
        this.resetPasswordButton.innerText =
          action === 'reset-password' ? 'Enviando...' : this.defaultButtonLabels.resetPassword;
      }
      if (this.authForm) {
        this.authForm.classList.add('auth-form-busy');
      }

      const loadingMessage = String(options?.message || 'Processando autenticação...').trim();
      if (this.loadingIndicator) {
        this.loadingIndicator.classList.remove('hidden');
      }
      if (this.loadingText) {
        this.loadingText.innerText = loadingMessage || 'Processando autenticação...';
      }
      if (loadingMessage) {
        this.showMessage(loadingMessage, 'info');
      }
      return;
    }

    if (this.loginButton) {
      this.loginButton.innerText = this.defaultButtonLabels.login;
    }
    if (this.registerButton) {
      this.registerButton.innerText = this.defaultButtonLabels.register;
    }
    if (this.googleButton) {
      this.googleButton.innerText = this.defaultButtonLabels.google;
    }
    if (this.resetPasswordButton) {
      this.resetPasswordButton.innerText = this.defaultButtonLabels.resetPassword;
    }
    if (this.authForm) {
      this.authForm.classList.remove('auth-form-busy');
    }
    if (this.loadingIndicator) {
      this.loadingIndicator.classList.add('hidden');
    }
  }

  showMessage(text, type = 'info') {
    if (!this.message) {
      return;
    }

    this.message.innerText = text;
    this.message.dataset.type = type;
    this.message.classList.remove('hidden');
  }

  clearMessage() {
    if (!this.message) {
      return;
    }

    this.message.innerText = '';
    this.message.dataset.type = '';
    this.message.classList.add('hidden');
  }
}
