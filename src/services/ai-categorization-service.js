export class AiCategorizationService {
  constructor(config, categories) {
    this.categories = categories;
    this.proxyUrl = config.proxyUrl;
    this.apiKey = config.directApiKey;
    this.model = config.model;
    this.chunkSize = config.chunkSize || 8;
    this.allowDirectRequest = Boolean(config.allowDirectRequest);
    this.getAuthToken = config.getAuthToken || null;
    this.maxRetries = config.maxRetries || 3;
    this.baseRetryDelayMs = config.baseRetryDelayMs || 450;
    this.interChunkDelayMs = config.interChunkDelayMs || 180;
  }

  async categorizeTransactions(transactions, options = {}) {
    const updates = [];
    const failedChunks = [];
    const onChunkProgress = options.onChunkProgress || (() => {});
    const onChunkError = options.onChunkError || (() => {});

    for (let index = 0; index < transactions.length; index += this.chunkSize) {
      const chunk = transactions.slice(index, index + this.chunkSize);
      let mapping;
      try {
        mapping = await this.categorizeChunk(chunk);
      } catch (error) {
        failedChunks.push({
          chunkStart: index,
          chunkEnd: Math.min(index + this.chunkSize, transactions.length),
          reason: error?.message || 'unknown error'
        });
        onChunkError(error, index, transactions.length);
        onChunkProgress(Math.min(index + this.chunkSize, transactions.length), transactions.length);
        continue;
      }

      for (const [position, category] of Object.entries(mapping)) {
        const transactionIndex = Number.parseInt(position, 10);
        const transaction = chunk[transactionIndex];
        if (!transaction) {
          continue;
        }

        const safeCategory = this.categories.includes(category) ? category : 'Outros';
        updates.push({
          docId: transaction.docId,
          category: safeCategory
        });
      }

      onChunkProgress(Math.min(index + this.chunkSize, transactions.length), transactions.length);

      if (index + this.chunkSize < transactions.length) {
        await this.sleep(this.interChunkDelayMs);
      }
    }

    return {
      updates,
      failedChunks
    };
  }

  async categorizeChunk(chunk) {
    if (this.proxyUrl) {
      return this.callProxy(chunk);
    }

    if (this.allowDirectRequest && this.apiKey) {
      return this.callDirectGemini(chunk);
    }

    throw new Error(
      'AI categorization is not configured. Set SMART_FINANCE_CONFIG.ai.proxyUrl for production or enable direct request for local development.'
    );
  }

  async callProxy(chunk) {
    const authToken = this.getAuthToken ? await this.getAuthToken() : '';

    const response = await this.fetchWithRetry(this.proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
      },
      body: JSON.stringify({
        categories: this.categories,
        items: chunk.map((transaction, index) => ({
          index,
          title: transaction.title
        }))
      })
    });

    const data = await response.json();
    const mapping = data?.mapping;
    if (!mapping || typeof mapping !== 'object') {
      throw new Error('Invalid proxy response format. Expected { mapping: { "0": "Categoria" } }.');
    }

    return mapping;
  }

  async callDirectGemini(chunk) {
    const promptList = chunk
      .map((transaction, index) => `${index}: "${transaction.title}"`)
      .join('\n');

    const response = await this.fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: promptList }]
            }
          ],
          systemInstruction: {
            parts: [
              {
                text: `Categorize each item strictly using one of these categories: ${this.categories.join(', ')}. Return only JSON in the format {"index": "category"}.`
              }
            ]
          },
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new Error('Gemini returned an empty response.');
    }

    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    return JSON.parse(cleaned);
  }

  async fetchWithRetry(url, options) {
    let lastError = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await fetch(url, options);
        if (response.ok) {
          return response;
        }

        const errorText = await response.text();
        const error = new Error(`Request failed (${response.status}): ${errorText.slice(0, 250)}`);
        error.status = response.status;
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

    throw lastError || new Error('Request failed after retries.');
  }

  isRetryableStatus(status) {
    return [0, 429, 500, 502, 503, 504].includes(status);
  }

  getRetryDelay(attempt) {
    const jitter = Math.floor(Math.random() * 300);
    const exponential = this.baseRetryDelayMs * (2 ** attempt);
    return Math.min(exponential + jitter, 2600);
  }

  sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }
}
