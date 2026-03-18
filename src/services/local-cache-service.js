export class LocalCacheService {
  constructor(config = {}) {
    this.keyPrefix = config.keyPrefix || 'smart-finance-cache-v1';
    this.maxAgeMs = config.maxAgeMs || 1000 * 60 * 15;
  }

  getCacheKey(userId) {
    return `${this.keyPrefix}:${userId}`;
  }

  load(userId) {
    if (!userId) {
      return {
        transactions: [],
        categories: [],
        lastSyncedAt: 0
      };
    }

    try {
      const raw = window.localStorage.getItem(this.getCacheKey(userId));
      if (!raw) {
        return {
          transactions: [],
          categories: [],
          lastSyncedAt: 0
        };
      }

      const parsed = JSON.parse(raw);
      const transactions = Array.isArray(parsed?.transactions) ? parsed.transactions : [];
      const categories = Array.isArray(parsed?.categories) ? parsed.categories : [];
      const lastSyncedAt = Number(parsed?.lastSyncedAt || 0);

      return {
        transactions,
        categories,
        lastSyncedAt
      };
    } catch (error) {
      console.warn('Failed to load local cache:', error);
      return {
        transactions: [],
        categories: [],
        lastSyncedAt: 0
      };
    }
  }

  save(userId, data) {
    if (!userId) {
      return;
    }

    const transactions = Array.isArray(data?.transactions) ? data.transactions : [];
    const categories = Array.isArray(data?.categories) ? data.categories : [];

    const cachePayload = {
      transactions,
      categories,
      lastSyncedAt: Date.now()
    };

    try {
      window.localStorage.setItem(this.getCacheKey(userId), JSON.stringify(cachePayload));
    } catch (error) {
      console.warn('Failed to save local cache:', error);
    }
  }

  isFresh(lastSyncedAt) {
    return Boolean(lastSyncedAt) && Date.now() - lastSyncedAt <= this.maxAgeMs;
  }

  clear(userId) {
    if (!userId) {
      return;
    }

    try {
      window.localStorage.removeItem(this.getCacheKey(userId));
    } catch (error) {
      console.warn('Failed to clear local cache:', error);
    }
  }
}
