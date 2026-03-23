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
    this.loginButton.addEventListener('click', () => {
      handlers.onLogin(this.getCredentials());
    });

    this.registerButton.addEventListener('click', () => {
      handlers.onRegister(this.getCredentials());
    });

    this.googleButton.addEventListener('click', () => {
      handlers.onGoogleLogin();
    });

    this.resetPasswordButton.addEventListener('click', () => {
      handlers.onPasswordReset(this.emailInput.value.trim());
    });

    this.logoutButton.addEventListener('click', () => {
      handlers.onLogout();
    });

    this.authForm.addEventListener('submit', (event) => {
      event.preventDefault();
      handlers.onLogin(this.getCredentials());
    });
  }

  getCredentials() {
    return {
      email: this.emailInput.value.trim(),
      password: this.passwordInput.value
    };
  }

  setAuthenticated(user) {
    const isAuthenticated = Boolean(user);
    const normalizedEmail = String(user?.email || '').trim().toLowerCase();
    const isAdmin = this.allowedAdminEmails.has(normalizedEmail);

    this.authScreen.classList.toggle('hidden', isAuthenticated);
    this.appScreen.classList.toggle('hidden', !isAuthenticated);
    this.logoutButton.classList.toggle('hidden', !isAuthenticated);
    if (this.adminPanelButton) {
      this.adminPanelButton.classList.toggle('hidden', !isAuthenticated || !isAdmin);
    }

    if (isAuthenticated) {
      this.authStatus.innerText = 'Online';
      this.userEmail.innerText = user.email || 'Sessão autenticada';
      this.clearMessage();
      return;
    }

    this.authStatus.innerText = 'Offline';
    this.userEmail.innerText = 'Faça login para acessar seus dados';
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
      element.disabled = isBusy;
    });

    const action = String(options?.action || '').trim().toLowerCase();
    if (isBusy) {
      this.loginButton.innerText = action === 'login' ? 'Entrando...' : this.defaultButtonLabels.login;
      this.registerButton.innerText = action === 'register' ? 'Criando...' : this.defaultButtonLabels.register;
      this.googleButton.innerText = action === 'google' ? 'Conectando...' : this.defaultButtonLabels.google;
      this.resetPasswordButton.innerText =
        action === 'reset-password' ? 'Enviando...' : this.defaultButtonLabels.resetPassword;
      this.authForm.classList.add('auth-form-busy');

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

    this.loginButton.innerText = this.defaultButtonLabels.login;
    this.registerButton.innerText = this.defaultButtonLabels.register;
    this.googleButton.innerText = this.defaultButtonLabels.google;
    this.resetPasswordButton.innerText = this.defaultButtonLabels.resetPassword;
    this.authForm.classList.remove('auth-form-busy');
    if (this.loadingIndicator) {
      this.loadingIndicator.classList.add('hidden');
    }
  }

  showMessage(text, type = 'info') {
    this.message.innerText = text;
    this.message.dataset.type = type;
    this.message.classList.remove('hidden');
  }

  clearMessage() {
    this.message.innerText = '';
    this.message.dataset.type = '';
    this.message.classList.add('hidden');
  }
}
