export class PwaService {
  constructor({ onInstallAvailabilityChanged }) {
    this.onInstallAvailabilityChanged = onInstallAvailabilityChanged;
    this.deferredPrompt = null;
  }

  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    try {
      await navigator.serviceWorker.register('./service-worker.js');
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
