export class FirebaseService {
  constructor(firebaseNamespace, appConfig) {
    this.firebase = firebaseNamespace;
    this.appConfig = appConfig;
    this.app = null;
    this.auth = null;
    this.db = null;
  }

  init() {
    if (!this.firebase) {
      throw new Error('Firebase SDK is not available.');
    }

    this.assertFirebaseConfig();

    if (!this.firebase.apps.length) {
      this.app = this.firebase.initializeApp(this.appConfig.firebase);
    } else {
      this.app = this.firebase.app();
    }

    this.auth = this.firebase.auth();
    this.db = this.firebase.firestore();

    return {
      app: this.app,
      auth: this.auth,
      db: this.db,
      firebase: this.firebase
    };
  }

  assertFirebaseConfig() {
    const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
    const missingKeys = requiredKeys.filter((key) => !this.appConfig.firebase?.[key]);

    if (missingKeys.length > 0) {
      throw new Error(
        `Missing Firebase config keys: ${missingKeys.join(', ')}. Update runtime-config.js with your project values.`
      );
    }
  }
}
