const DEFAULT_CONFIG = {
  appId: 'smart-finance-production-v1',
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  },
  ai: {
    proxyUrl: '',
    consultantProxyUrl: '',
    allowDirectRequest: false,
    directApiKey: '',
    model: 'gemini-2.5-flash',
    chunkSize: 14,
    maxRetries: 3,
    baseRetryDelayMs: 450,
    interChunkDelayMs: 180
  },
  openFinance: {
    proxyUrl: '',
    webhookUrl: '',
    supportedBanks: ['meu-pluggy']
  },
  push: {
    enabled: true,
    vapidKey: ''
  },
  admin: {
    dashboardProxyUrl: '',
    maintenanceProxyUrl: '',
    maintenanceResetProxyUrl: '',
    allowedEmails: ['guilhermenr1995@gmail.com']
  },
  cache: {
    maxAgeMs: 1000 * 60 * 15
  }
};

function parseGeminiFirebaseConfig() {
  if (typeof window.__firebase_config === 'string' && window.__firebase_config.trim()) {
    try {
      return JSON.parse(window.__firebase_config);
    } catch (error) {
      console.warn('Invalid __firebase_config payload:', error);
      return null;
    }
  }

  if (typeof window.__firebase_config === 'object' && window.__firebase_config !== null) {
    return window.__firebase_config;
  }

  return null;
}

export function loadAppConfig() {
  const runtimeConfig = window.SMART_FINANCE_CONFIG || {};
  const geminiFirebase = parseGeminiFirebaseConfig();

  return {
    ...DEFAULT_CONFIG,
    ...runtimeConfig,
    appId: runtimeConfig.appId || window.__app_id || DEFAULT_CONFIG.appId,
    firebase: {
      ...DEFAULT_CONFIG.firebase,
      ...(geminiFirebase || {}),
      ...(runtimeConfig.firebase || {})
    },
    ai: {
      ...DEFAULT_CONFIG.ai,
      ...(runtimeConfig.ai || {}),
      directApiKey:
        runtimeConfig.ai?.directApiKey ||
        runtimeConfig.ai?.apiKey ||
        window.__gemini_api_key ||
        DEFAULT_CONFIG.ai.directApiKey
    },
    openFinance: {
      ...DEFAULT_CONFIG.openFinance,
      ...(runtimeConfig.openFinance || {}),
      supportedBanks: Array.isArray(runtimeConfig.openFinance?.supportedBanks)
        ? runtimeConfig.openFinance.supportedBanks
        : DEFAULT_CONFIG.openFinance.supportedBanks
    },
    push: {
      ...DEFAULT_CONFIG.push,
      ...(runtimeConfig.push || {})
    },
    admin: {
      ...DEFAULT_CONFIG.admin,
      ...(runtimeConfig.admin || {}),
      allowedEmails: Array.isArray(runtimeConfig.admin?.allowedEmails)
        ? runtimeConfig.admin.allowedEmails
        : DEFAULT_CONFIG.admin.allowedEmails
    },
    cache: {
      ...DEFAULT_CONFIG.cache,
      ...(runtimeConfig.cache || {})
    }
  };
}
