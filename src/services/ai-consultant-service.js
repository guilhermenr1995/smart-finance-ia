export class AiConsultantService {
  constructor(config = {}) {
    this.consultantProxyUrl = config.consultantProxyUrl || '';
    this.categorizationProxyUrl = config.proxyUrl || '';
    this.getAuthToken = config.getAuthToken || null;
    this.maxRetries = config.maxRetries || 2;
    this.baseRetryDelayMs = config.baseRetryDelayMs || 500;
  }

  resolveProxyUrl() {
    if (this.consultantProxyUrl) {
      return this.consultantProxyUrl;
    }

    if (this.categorizationProxyUrl) {
      return this.categorizationProxyUrl.replace(/categorizetransactions/gi, 'analyzespendinginsights');
    }

    return '';
  }

  async analyzeSpending(payload) {
    const url = this.resolveProxyUrl();
    if (!url) {
      throw new Error('AI consultant is not configured. Set SMART_FINANCE_CONFIG.ai.consultantProxyUrl.');
    }

    const authToken = this.getAuthToken ? await this.getAuthToken() : '';
    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!data?.insights || typeof data.insights !== 'object') {
      throw new Error('Invalid AI consultant response format.');
    }

    return {
      insights: data.insights,
      usage: data.usage || null,
      storedInsight: data.storedInsight || null
    };
  }

  async fetchWithRetry(url, options) {
    let lastError = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await fetch(url, options);
        if (response.ok) {
          return response;
        }

        const rawErrorText = await response.text();
        let parsedError = null;
        try {
          parsedError = JSON.parse(rawErrorText);
        } catch (parseError) {
          parsedError = null;
        }

        const errorMessage =
          parsedError?.message ||
          parsedError?.error ||
          `Request failed (${response.status})`;
        const error = new Error(errorMessage);
        error.status = response.status;
        error.details = parsedError || rawErrorText;

        lastError = error;
        if (!this.isRetryableStatus(response.status) || attempt === this.maxRetries) {
          throw error;
        }
      } catch (error) {
        lastError = error;
        const status = error?.status || 0;
        if (!this.isRetryableStatus(status) || attempt === this.maxRetries) {
          throw error;
        }
      }

      await this.sleep(this.getRetryDelay(attempt));
    }

    throw lastError || new Error('AI consultant request failed after retries.');
  }

  isRetryableStatus(status) {
    return [0, 500, 502, 503, 504].includes(status);
  }

  getRetryDelay(attempt) {
    const jitter = Math.floor(Math.random() * 250);
    return Math.min(this.baseRetryDelayMs * (2 ** attempt) + jitter, 2600);
  }

  sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }
}
