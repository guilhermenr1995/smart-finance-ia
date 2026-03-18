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
    model: 'gemini-3.1-flash-lite',
    chunkSize: 14,
    maxRetries: 3,
    baseRetryDelayMs: 450,
    interChunkDelayMs: 180
  },
  cache: {
    maxAgeMs: 1000 * 60 * 15
  }
};
