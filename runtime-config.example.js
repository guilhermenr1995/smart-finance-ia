window.SMART_FINANCE_CONFIG = {
  appId: 'your-app-id',
  firebase: {
    apiKey: 'YOUR_FIREBASE_API_KEY',
    authDomain: 'your-project.firebaseapp.com',
    projectId: 'your-project-id',
    storageBucket: 'your-project.appspot.com',
    messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
    appId: 'YOUR_FIREBASE_APP_ID',
    measurementId: 'YOUR_MEASUREMENT_ID'
  },
  ai: {
    proxyUrl: 'https://YOUR_PROXY_URL.a.run.app',
    consultantProxyUrl: 'https://YOUR_CONSULTANT_PROXY_URL.a.run.app',
    allowDirectRequest: false,
    directApiKey: '',
    model: 'gemini-2.5-flash-lite',
    chunkSize: 14,
    maxRetries: 3,
    baseRetryDelayMs: 450,
    interChunkDelayMs: 180
  },
  openFinance: {
    proxyUrl: 'https://YOUR_OPEN_FINANCE_PROXY_URL.a.run.app',
    supportedBanks: ['meu-pluggy']
  },
  push: {
    enabled: true,
    vapidKey: 'YOUR_FIREBASE_WEB_PUSH_VAPID_KEY'
  },
  admin: {
    dashboardProxyUrl: 'https://YOUR_ADMIN_DASHBOARD_PROXY_URL.a.run.app',
    maintenanceProxyUrl: 'https://YOUR_MAINTENANCE_PROXY_URL.a.run.app',
    maintenanceResetProxyUrl: 'https://YOUR_RESET_USER_JOURNEY_PROXY_URL.a.run.app',
    maintenanceOpenFinanceDeleteProxyUrl: 'https://YOUR_DELETE_OPEN_FINANCE_TRANSACTIONS_PROXY_URL.a.run.app',
    allowedEmails: ['guilhermenr1995@gmail.com']
  },
  cache: {
    maxAgeMs: 1000 * 60 * 15
  }
};
