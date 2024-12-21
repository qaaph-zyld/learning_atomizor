const logger = require('./LoggerService');

class MemoryStore {
  constructor() {
    this.store = new Map();
    logger.info('Memory store initialized');
  }

  async hset(key, value) {
    try {
      if (typeof value === 'object') {
        // If value is an object, store each field separately
        if (!this.store.has(key)) {
          this.store.set(key, new Map());
        }
        const hash = this.store.get(key);
        for (const [field, val] of Object.entries(value)) {
          hash.set(field, val);
        }
      } else {
        // If value is not an object, store it directly
        this.store.set(key, value);
      }
      return 'OK';
    } catch (error) {
      logger.error('Memory store hset error:', error);
      throw error;
    }
  }

  async hget(key, field) {
    try {
      const hash = this.store.get(key);
      if (!hash) return null;
      return hash.get(field);
    } catch (error) {
      logger.error('Memory store hget error:', error);
      throw error;
    }
  }

  async hgetall(key) {
    try {
      const hash = this.store.get(key);
      if (!hash) return null;
      return Object.fromEntries(hash);
    } catch (error) {
      logger.error('Memory store hgetall error:', error);
      throw error;
    }
  }

  async set(key, value) {
    try {
      this.store.set(key, value);
      return 'OK';
    } catch (error) {
      logger.error('Memory store set error:', error);
      throw error;
    }
  }

  async get(key) {
    try {
      return this.store.get(key);
    } catch (error) {
      logger.error('Memory store get error:', error);
      throw error;
    }
  }

  async del(key) {
    try {
      return this.store.delete(key);
    } catch (error) {
      logger.error('Memory store del error:', error);
      throw error;
    }
  }

  async disconnect() {
    try {
      this.store.clear();
      logger.info('Memory store disconnected');
    } catch (error) {
      logger.error('Memory store disconnect error:', error);
      throw error;
    }
  }
}

module.exports = MemoryStore;
