export class AuthService {
  constructor(authInstance, firebaseNamespace) {
    this.auth = authInstance;
    this.firebase = firebaseNamespace;
  }

  subscribe(callback) {
    return this.auth.onAuthStateChanged(callback);
  }

  async bootstrapSession() {
    await this.auth.getRedirectResult().catch(() => null);

    if (typeof window.__initial_auth_token !== 'undefined' && window.__initial_auth_token) {
      await this.auth.signInWithCustomToken(window.__initial_auth_token);
    }
  }

  async signInWithEmail(email, password) {
    return this.auth.signInWithEmailAndPassword(email, password);
  }

  async registerWithEmail(email, password) {
    return this.auth.createUserWithEmailAndPassword(email, password);
  }

  async signInWithGoogle() {
    const provider = new this.firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      return await this.auth.signInWithPopup(provider);
    } catch (error) {
      if (error?.code === 'auth/popup-blocked' || error?.code === 'auth/operation-not-supported-in-this-environment') {
        return this.auth.signInWithRedirect(provider);
      }

      throw error;
    }
  }

  async sendPasswordReset(email) {
    return this.auth.sendPasswordResetEmail(email);
  }

  async signOut() {
    return this.auth.signOut();
  }
}
