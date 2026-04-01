export class OpenFinanceService {
  constructor(config = {}) {
    this.proxyUrl = String(config.proxyUrl || '').trim();
    this.getAuthToken = typeof config.getAuthToken === 'function' ? config.getAuthToken : null;
  }

  assertConfigured() {
    if (!this.proxyUrl) {
      throw new Error('Open Finance não configurado. Defina SMART_FINANCE_CONFIG.openFinance.proxyUrl.');
    }
  }

  async request(action, payload = {}) {
    this.assertConfigured();
    const authToken = this.getAuthToken ? await this.getAuthToken() : '';
    const response = await fetch(this.proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
      },
      body: JSON.stringify({
        action,
        ...payload
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const details = String(data?.details || '').trim();
      const message = String(data?.message || data?.error || '').trim();
      const finalMessage = details || message || `Falha Open Finance (${response.status})`;
      const error = new Error(finalMessage);
      error.statusCode = response.status;
      throw error;
    }

    return data;
  }

  async listConnections(appId) {
    return this.request('list-connections', { appId });
  }

  async connectBank(appId, bankCode) {
    return this.request('connect-bank', { appId, bankCode });
  }

  async syncConnection(appId, connectionId) {
    return this.request('sync-connection', { appId, connectionId });
  }

  async revokeConnection(appId, connectionId) {
    return this.request('revoke-connection', { appId, connectionId });
  }

  async renewConnection(appId, connectionId) {
    return this.request('renew-connection', { appId, connectionId });
  }
}