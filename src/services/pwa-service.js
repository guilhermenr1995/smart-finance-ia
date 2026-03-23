export class PwaService {
  constructor({ onInstallAvailabilityChanged }) {
    this.onInstallAvailabilityChanged = onInstallAvailabilityChanged;
    this.deferredPrompt = null;
    this.hasReloadedForNewWorker = false;
  }

  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register('./service-worker.js');
      await registration.update();

      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        if (!installingWorker) {
          return;
        }

        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            installingWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (this.hasReloadedForNewWorker) {
          return;
        }

        this.hasReloadedForNewWorker = true;
        window.location.reload();
      });
    } catch (error) {
      console.error('Service worker registration failed:', error);
    }
  }

  setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferredPrompt = event;
      this.onInstallAvailabilityChanged(true);
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.onInstallAvailabilityChanged(false);
    });
  }

  async promptInstall() {
    if (!this.deferredPrompt) {
      return false;
    }

    this.deferredPrompt.prompt();
    await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    this.onInstallAvailabilityChanged(false);
    return true;
  }
}
