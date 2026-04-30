const DEFAULT_STORAGE_PREFIX = 'smart-finance-open-finance-push';

function isPromiseLike(value) {
  return value && typeof value.then === 'function';
}

export class PushNotificationService {
  constructor(config = {}) {
    this.appId = String(config.appId || '').trim();
    this.firebase = config.firebase || null;
    this.openFinanceService = config.openFinanceService || null;
    this.enabled = config.enabled !== false;
    this.vapidKey = String(config.vapidKey || '').trim();
    this.storagePrefix = String(config.storagePrefix || DEFAULT_STORAGE_PREFIX).trim();
    this.onMessageUnsubscribe = null;
  }

  isConfigured() {
    return Boolean(this.enabled && this.appId && this.firebase && this.openFinanceService);
  }

  isBrowserSupported() {
    return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
  }

  getStorageKey(suffix) {
    return `${this.storagePrefix}:${this.appId}:${suffix}`;
  }

  getStoredToken() {
    return String(window.localStorage.getItem(this.getStorageKey('token')) || '').trim();
  }

  getStoredOwnerUid() {
    return String(window.localStorage.getItem(this.getStorageKey('ownerUid')) || '').trim();
  }

  setStoredToken(token, ownerUid) {
    window.localStorage.setItem(this.getStorageKey('token'), String(token || '').trim());
    window.localStorage.setItem(this.getStorageKey('ownerUid'), String(ownerUid || '').trim());
  }

  clearStoredToken() {
    window.localStorage.removeItem(this.getStorageKey('token'));
    window.localStorage.removeItem(this.getStorageKey('ownerUid'));
  }

  async isMessagingSupported() {
    if (!this.firebase || typeof this.firebase.messaging !== 'function') {
      return false;
    }

    const probe = this.firebase.messaging?.isSupported;
    if (typeof probe !== 'function') {
      return true;
    }

    try {
      const result = probe();
      if (isPromiseLike(result)) {
        return Boolean(await result);
      }
      return Boolean(result);
    } catch (_error) {
      return false;
    }
  }

  async ensurePermission() {
    if (Notification.permission === 'granted') {
      return 'granted';
    }

    if (Notification.permission === 'denied') {
      return 'denied';
    }

    try {
      return await Notification.requestPermission();
    } catch (_error) {
      return Notification.permission;
    }
  }

  getMessagingInstance() {
    if (!this.firebase || typeof this.firebase.messaging !== 'function') {
      return null;
    }

    try {
      return this.firebase.messaging();
    } catch (_error) {
      return null;
    }
  }

  async requestToken(options = {}) {
    const messaging = this.getMessagingInstance();
    if (!messaging || typeof messaging.getToken !== 'function') {
      return '';
    }

    const tokenOptions = {};
    if (options.serviceWorkerRegistration) {
      tokenOptions.serviceWorkerRegistration = options.serviceWorkerRegistration;
    }

    if (this.vapidKey) {
      tokenOptions.vapidKey = this.vapidKey;
    }

    const token = await messaging.getToken(tokenOptions);
    return String(token || '').trim();
  }

  attachForegroundListener() {
    if (this.onMessageUnsubscribe) {
      return;
    }

    const messaging = this.getMessagingInstance();
    if (!messaging || typeof messaging.onMessage !== 'function') {
      return;
    }

    this.onMessageUnsubscribe = messaging.onMessage((payload = {}) => {
      if (Notification.permission !== 'granted') {
        return;
      }

      const notification = payload.notification || {};
      const title = String(notification.title || '').trim();
      const body = String(notification.body || '').trim();
      const icon = String(notification.icon || '').trim();

      if (!title && !body) {
        return;
      }

      try {
        const instance = new Notification(title || 'Open Finance', {
          body,
          icon: icon || undefined
        });
        instance.onclick = () => {
          window.focus();
          instance.close();
        };
      } catch (_error) {
        // Browser may block direct Notification call in some contexts.
      }
    });
  }

  async syncForUser(user, options = {}) {
    if (!this.isConfigured() || !this.isBrowserSupported()) {
      return {
        synced: false,
        reason: 'not-configured-or-unsupported'
      };
    }

    const safeUserId = String(user?.uid || '').trim();
    if (!safeUserId) {
      return {
        synced: false,
        reason: 'missing-user'
      };
    }

    if (!options.hasOpenFinanceConnections) {
      return {
        synced: false,
        reason: 'no-open-finance-connections'
      };
    }

    const messagingSupported = await this.isMessagingSupported();
    if (!messagingSupported) {
      return {
        synced: false,
        reason: 'messaging-not-supported'
      };
    }

    const permission = await this.ensurePermission();
    if (permission !== 'granted') {
      return {
        synced: false,
        reason: `permission-${permission}`
      };
    }

    const previousToken = this.getStoredToken();
    const previousOwnerUid = this.getStoredOwnerUid();
    const token = await this.requestToken({
      serviceWorkerRegistration: options.serviceWorkerRegistration
    });

    if (!token) {
      return {
        synced: false,
        reason: 'empty-token'
      };
    }

    const registerPayload = {
      token,
      platform: 'web',
      userAgent: String(window.navigator.userAgent || ''),
      language: String(window.navigator.language || ''),
      timezone: String(Intl.DateTimeFormat().resolvedOptions().timeZone || '')
    };
    if (typeof this.openFinanceService.registerPushSubscription === 'function') {
      await this.openFinanceService.registerPushSubscription(this.appId, registerPayload);
    } else {
      await this.openFinanceService.request('register-push-subscription', {
        appId: this.appId,
        ...registerPayload
      });
    }

    this.setStoredToken(token, safeUserId);
    this.attachForegroundListener();

    return {
      synced: true,
      tokenChanged: token !== previousToken || safeUserId !== previousOwnerUid
    };
  }

  async unregisterForUser(user, options = {}) {
    if (!this.isConfigured()) {
      return {
        unregistered: false,
        reason: 'not-configured'
      };
    }

    const safeUserId = String(user?.uid || '').trim();
    const token = this.getStoredToken();
    if (!safeUserId || !token) {
      this.clearStoredToken();
      return {
        unregistered: false,
        reason: 'missing-user-or-token'
      };
    }

    try {
      const unregisterPayload = {
        token,
        reason: String(options.reason || 'user-sign-out').trim() || 'user-sign-out'
      };
      if (typeof this.openFinanceService.unregisterPushSubscription === 'function') {
        await this.openFinanceService.unregisterPushSubscription(this.appId, unregisterPayload);
      } else {
        await this.openFinanceService.request('unregister-push-subscription', {
          appId: this.appId,
          ...unregisterPayload
        });
      }
    } finally {
      this.clearStoredToken();
    }

    return {
      unregistered: true
    };
  }
}
