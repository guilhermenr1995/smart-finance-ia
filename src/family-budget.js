import { loadAppConfig } from './config/app-config.js';
import { AuthService } from './services/auth-service.js';
import { FirebaseService } from './services/firebase-service.js';
import { OverlayView } from './ui/overlay-view.js';
import { AuthView } from './ui/auth-view.js';
import { PwaService } from './services/pwa-service.js';
import { FamilyBudgetRepository } from './features/family-budget/services/family-budget-repository/family-budget-repository.js';
import { FamilyBudgetState } from './state/family-budget-state.js';
import { FamilyBudgetApp } from './features/family-budget/family-budget-app.js';

function updateInstallButtonVisibility(isVisible) {
  const button = document.getElementById('btn-install-app');
  if (button) {
    button.classList.toggle('hidden', !isVisible);
  }
}

function bootstrap() {
  const config = loadAppConfig();
  const state = new FamilyBudgetState();

  let firebaseContext;
  try {
    firebaseContext = new FirebaseService(window.firebase, config).init();
  } catch (error) {
    const message = document.getElementById('auth-message');
    if (message) {
      message.innerText = error.message;
      message.classList.remove('hidden');
      message.dataset.type = 'error';
    }
    return;
  }

  const app = new FamilyBudgetApp({
    config,
    state,
    authService: new AuthService(firebaseContext.auth, firebaseContext.firebase),
    repository: new FamilyBudgetRepository(firebaseContext.db, config.appId),
    authView: new AuthView(),
    overlayView: new OverlayView(),
    pwaService: new PwaService({
      onInstallAvailabilityChanged: updateInstallButtonVisibility
    })
  });

  app.init();
}

bootstrap();
