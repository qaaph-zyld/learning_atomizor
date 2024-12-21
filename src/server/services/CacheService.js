const Redis = require('ioredis');
const config = require('../config');
const logger = require('./LoggerService');

class CacheService {
  constructor() {
    // Redis Cluster Configuration
    const nodes = process.env.REDIS_CLUSTER_NODES ? 
      JSON.parse(process.env.REDIS_CLUSTER_NODES) :
      [{
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379
      }];

    const options = {
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      clusterRetryStrategy: (times) => {
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      redisOptions: {
        password: process.env.REDIS_PASSWORD,
        tls: process.env.REDIS_TLS === 'true' ? {} : undefined
      }
    };

    // Initialize Redis in cluster or standalone mode
    this.redis = nodes.length > 1 ? 
      new Redis.Cluster(nodes, options) : 
      new Redis({ ...nodes[0], ...options });

    this.defaultTTL = 3600; // 1 hour
    this.prefix = 'atomizer:';

    // Enhanced error handling
    this.redis.on('error', (error) => {
      logger.error('Redis connection error:', error);
    });

    this.redis.on('connect', () => {
      logger.info('Connected to Redis');
    });

    this.redis.on('ready', () => {
      logger.info('Redis is ready to receive commands');
    });

    this.redis.on('close', () => {
      logger.warn('Redis connection closed');
    });

    this.redis.on('reconnecting', () => {
      logger.info('Reconnecting to Redis');
    });

    if (nodes.length > 1) {
      this.redis.on('node error', (error, node) => {
        logger.error(`Redis Cluster Node ${node.options.host}:${node.options.port} error:`, error);
      });

      this.redis.on('+node', (node) => {
        logger.info(`New node added to Redis Cluster: ${node.options.host}:${node.options.port}`);
      });

      this.redis.on('-node', (node) => {
        logger.warn(`Node removed from Redis Cluster: ${node.options.host}:${node.options.port}`);
      });
    }
  }

  /**
   * Generate cache key with prefix and optional tenant ID
   */
  generateKey(key, tenantId = '') {
    return `${this.prefix}${tenantId ? `tenant:${tenantId}:` : ''}${key}`;
  }

  /**
   * Set cache with optional TTL and tenant isolation
   */
  async set(key, value, ttl = this.defaultTTL, tenantId = '') {
    try {
      const cacheKey = this.generateKey(key, tenantId);
      const serializedValue = JSON.stringify(value);
      
      if (ttl) {
        await this.redis.setex(cacheKey, ttl, serializedValue);
      } else {
        await this.redis.set(cacheKey, serializedValue);
      }
      
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  /**
   * Get cached value with tenant isolation
   */
  async get(key, tenantId = '') {
    try {
      const cacheKey = this.generateKey(key, tenantId);
      const value = await this.redis.get(cacheKey);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Delete cache entry with tenant isolation
   */
  async delete(key, tenantId = '') {
    try {
      const cacheKey = this.generateKey(key, tenantId);
      await this.redis.del(cacheKey);
      return true;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  }

  /**
   * Clear cache by pattern with tenant isolation
   */
  async clearByPattern(pattern, tenantId = '') {
    try {
      const cachePattern = this.generateKey(pattern, tenantId);
      const keys = await this.redis.keys(cachePattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      
      return true;
    } catch (error) {
      logger.error('Cache clear error:', error);
      return false;
    }
  }

  /**
   * Set multiple cache entries in a pipeline
   */
  async mset(entries, ttl = this.defaultTTL) {
    const pipeline = this.redis.pipeline();
    
    try {
      entries.forEach(({ key, value, tenantId = '' }) => {
        const cacheKey = this.generateKey(key, tenantId);
        const serializedValue = JSON.stringify(value);
        
        if (ttl) {
          pipeline.setex(cacheKey, ttl, serializedValue);
        } else {
          pipeline.set(cacheKey, serializedValue);
        }
      });
      
      await pipeline.exec();
      return true;
    } catch (error) {
      logger.error('Cache mset error:', error);
      return false;
    }
  }

  /**
   * Get multiple cache entries
   */
  async mget(keys, tenantId = '') {
    try {
      const cacheKeys = keys.map(key => this.generateKey(key, tenantId));
      const values = await this.redis.mget(cacheKeys);
      
      return values.map(value => value ? JSON.parse(value) : null);
    } catch (error) {
      logger.error('Cache mget error:', error);
      return keys.map(() => null);
    }
  }

  /**
   * Increment a counter
   */
  async increment(key, tenantId = '', amount = 1) {
    try {
      const cacheKey = this.generateKey(key, tenantId);
      return await this.redis.incrby(cacheKey, amount);
    } catch (error) {
      logger.error('Cache increment error:', error);
      return null;
    }
  }

  /**
   * Add to sorted set
   */
  async zadd(key, score, member, tenantId = '') {
    try {
      const cacheKey = this.generateKey(key, tenantId);
      return await this.redis.zadd(cacheKey, score, JSON.stringify(member));
    } catch (error) {
      logger.error('Cache zadd error:', error);
      return false;
    }
  }

  /**
   * Get range from sorted set
   */
  async zrange(key, start, stop, tenantId = '') {
    try {
      const cacheKey = this.generateKey(key, tenantId);
      const members = await this.redis.zrange(cacheKey, start, stop);
      return members.map(member => JSON.parse(member));
    } catch (error) {
      logger.error('Cache zrange error:', error);
      return [];
    }
  }

  /**
   * Get cluster health status
   */
  async getHealth() {
    try {
      if (this.redis.nodes) {
        // Cluster mode
        const nodes = await Promise.all(
          this.redis.nodes().map(async (node) => {
            const info = await node.info();
            return {
              host: node.options.host,
              port: node.options.port,
              status: 'active',
              info
            };
          })
        );
        return { mode: 'cluster', nodes };
      } else {
        // Standalone mode
        const info = await this.redis.info();
        return {
          mode: 'standalone',
          nodes: [{
            host: this.redis.options.host,
            port: this.redis.options.port,
            status: 'active',
            info
          }]
        };
      }
    } catch (error) {
      logger.error('Cache health check error:', error);
      return { mode: 'unknown', error: error.message };
    }
  }

  /**
   * Close Redis connection
   */
  async close() {
    try {
      await this.redis.quit();
      logger.info('Redis connection closed gracefully');
    } catch (error) {
      logger.error('Error closing Redis connection:', error);
    }
  }
}

module.exports = new CacheService();
