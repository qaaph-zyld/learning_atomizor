const mongoose = require('mongoose');
const logger = require('./LoggerService');
const cache = require('./CacheService');

class QueryOptimizerService {
  constructor() {
    this.queryCache = new Map();
    this.indexCache = new Map();
    this.queryStats = new Map();
    this.SLOW_QUERY_THRESHOLD = 100; // ms
  }

  /**
   * Optimize and execute a query
   */
  async optimizeQuery(model, query, options = {}) {
    const startTime = Date.now();
    const queryKey = this.generateQueryKey(model, query, options);

    try {
      // Check cache first
      const cachedResult = await this.getCachedResult(queryKey);
      if (cachedResult) {
        return cachedResult;
      }

      // Analyze and optimize query
      const optimizedQuery = this.analyzeAndOptimizeQuery(query);
      
      // Execute query with optimized parameters
      const result = await this.executeQuery(model, optimizedQuery, options);
      
      // Cache result if appropriate
      await this.cacheResultIfNeeded(queryKey, result, options);
      
      // Log query performance
      this.logQueryPerformance(model, query, startTime);
      
      return result;
    } catch (error) {
      logger.error('Query optimization error:', error);
      throw error;
    }
  }

  /**
   * Generate unique key for query caching
   */
  generateQueryKey(model, query, options) {
    return `${model.modelName}:${JSON.stringify(query)}:${JSON.stringify(options)}`;
  }

  /**
   * Get cached query result
   */
  async getCachedResult(queryKey) {
    const cachedResult = await cache.get(queryKey);
    if (cachedResult) {
      logger.debug('Cache hit for query:', { queryKey });
      return cachedResult;
    }
    return null;
  }

  /**
   * Analyze and optimize query
   */
  analyzeAndOptimizeQuery(query) {
    const optimizedQuery = { ...query };

    // Add query optimizations
    this.optimizeSelectionCriteria(optimizedQuery);
    this.optimizeProjection(optimizedQuery);
    this.optimizeSortCriteria(optimizedQuery);
    
    return optimizedQuery;
  }

  /**
   * Optimize selection criteria
   */
  optimizeSelectionCriteria(query) {
    if (!query.conditions) return;

    // Convert inefficient $ne to $in where possible
    if (query.conditions.$ne) {
      const neValues = Array.isArray(query.conditions.$ne) 
        ? query.conditions.$ne 
        : [query.conditions.$ne];
      
      delete query.conditions.$ne;
      query.conditions.$nin = neValues;
    }

    // Optimize range queries
    if (query.conditions.$gt && query.conditions.$lt) {
      query.conditions.$and = [
        { [query.field]: { $gt: query.conditions.$gt } },
        { [query.field]: { $lt: query.conditions.$lt } }
      ];
      delete query.conditions.$gt;
      delete query.conditions.$lt;
    }
  }

  /**
   * Optimize projection
   */
  optimizeProjection(query) {
    if (!query.projection) return;

    // Remove unnecessary fields
    const projection = {};
    for (const [field, include] of Object.entries(query.projection)) {
      if (include) {
        projection[field] = 1;
      }
    }
    
    query.projection = projection;
  }

  /**
   * Optimize sort criteria
   */
  optimizeSortCriteria(query) {
    if (!query.sort) return;

    // Ensure sort fields are indexed
    const sortFields = Object.keys(query.sort);
    this.ensureIndexes(query.model, sortFields);
  }

  /**
   * Execute optimized query
   */
  async executeQuery(model, query, options) {
    const { lean = true, timeout = 30000 } = options;

    const queryBuilder = model.find(query.conditions);

    if (query.projection) {
      queryBuilder.select(query.projection);
    }

    if (query.sort) {
      queryBuilder.sort(query.sort);
    }

    if (query.populate) {
      query.populate.forEach(populateOptions => {
        queryBuilder.populate(populateOptions);
      });
    }

    if (query.skip) {
      queryBuilder.skip(query.skip);
    }

    if (query.limit) {
      queryBuilder.limit(query.limit);
    }

    queryBuilder.lean(lean);
    queryBuilder.maxTimeMS(timeout);

    return queryBuilder.exec();
  }

  /**
   * Cache query result if needed
   */
  async cacheResultIfNeeded(queryKey, result, options) {
    const { cache: shouldCache = true, ttl } = options;
    
    if (shouldCache && result) {
      await cache.set(queryKey, result, ttl);
    }
  }

  /**
   * Log query performance
   */
  logQueryPerformance(model, query, startTime) {
    const duration = Date.now() - startTime;
    const queryKey = this.generateQueryKey(model, query, {});

    // Update query statistics
    this.updateQueryStats(queryKey, duration);

    // Log slow queries
    if (duration > this.SLOW_QUERY_THRESHOLD) {
      logger.warn('Slow query detected:', {
        model: model.modelName,
        query,
        duration
      });
    }

    logger.debug('Query performance:', {
      model: model.modelName,
      duration,
      query
    });
  }

  /**
   * Update query statistics
   */
  updateQueryStats(queryKey, duration) {
    const stats = this.queryStats.get(queryKey) || {
      count: 0,
      totalDuration: 0,
      avgDuration: 0,
      minDuration: duration,
      maxDuration: duration
    };

    stats.count++;
    stats.totalDuration += duration;
    stats.avgDuration = stats.totalDuration / stats.count;
    stats.minDuration = Math.min(stats.minDuration, duration);
    stats.maxDuration = Math.max(stats.maxDuration, duration);

    this.queryStats.set(queryKey, stats);
  }

  /**
   * Ensure indexes exist for fields
   */
  async ensureIndexes(model, fields) {
    const modelName = model.modelName;
    const indexKey = `${modelName}:${fields.join(',')}`;

    if (this.indexCache.has(indexKey)) {
      return;
    }

    try {
      const indexes = await model.collection.getIndexes();
      const missingIndexes = fields.filter(field => 
        !indexes.some(index => index[field])
      );

      if (missingIndexes.length > 0) {
        logger.warn('Missing indexes:', {
          model: modelName,
          fields: missingIndexes
        });
      }

      this.indexCache.set(indexKey, true);
    } catch (error) {
      logger.error('Index check error:', error);
    }
  }

  /**
   * Get query statistics
   */
  getQueryStats() {
    return Array.from(this.queryStats.entries()).map(([key, stats]) => ({
      query: key,
      ...stats
    }));
  }

  /**
   * Clear query statistics
   */
  clearQueryStats() {
    this.queryStats.clear();
  }

  /**
   * Clear query cache
   */
  async clearQueryCache() {
    await cache.clearByPattern('query:*');
    this.queryCache.clear();
  }
}

module.exports = new QueryOptimizerService();
