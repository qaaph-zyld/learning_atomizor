const express = require('express');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('./LoggerService');
const redis = require('./CacheService');
const TenantService = require('./TenantService');

class APIGatewayService {
  constructor() {
    this.integrations = new Map();
    this.rateLimiters = new Map();
    
    this.config = {
      defaultRateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100 // limit each IP to 100 requests per windowMs
      },
      tokenExpiration: '1h',
      cacheExpiration: 3600, // 1 hour in seconds
      retryAttempts: 3,
      timeout: 30000 // 30 seconds
    };
  }

  /**
   * Initialize API Gateway
   */
  async initialize() {
    try {
      // Load registered integrations from database
      await this.loadIntegrations();
      
      // Initialize rate limiters
      this.initializeRateLimiters();
      
      // Start health check monitor
      this.startHealthCheck();
      
      logger.info('API Gateway Service initialized successfully');
    } catch (error) {
      logger.error('Error initializing API Gateway Service:', error);
      throw error;
    }
  }

  /**
   * Load registered integrations
   */
  async loadIntegrations() {
    try {
      const integrations = await TenantService.getAllIntegrations();
      
      integrations.forEach(integration => {
        this.integrations.set(integration.id, {
          ...integration,
          status: 'active',
          lastCheck: null,
          metrics: {
            requests: 0,
            errors: 0,
            latency: []
          }
        });
      });
      
      logger.info(`Loaded ${integrations.length} integrations`);
    } catch (error) {
      logger.error('Error loading integrations:', error);
      throw error;
    }
  }

  /**
   * Initialize rate limiters
   */
  initializeRateLimiters() {
    this.integrations.forEach((integration, id) => {
      const limit = integration.rateLimit || this.config.defaultRateLimit;
      
      this.rateLimiters.set(id, rateLimit({
        windowMs: limit.windowMs,
        max: limit.max,
        keyGenerator: (req) => {
          return req.tenant ? `${req.tenant.id}:${req.ip}` : req.ip;
        }
      }));
    });
  }

  /**
   * Start integration health check monitor
   */
  startHealthCheck() {
    setInterval(async () => {
      for (const [id, integration] of this.integrations) {
        try {
          const status = await this.checkIntegrationHealth(integration);
          integration.status = status;
          integration.lastCheck = new Date();
        } catch (error) {
          logger.error(`Health check failed for integration ${id}:`, error);
        }
      }
    }, 300000); // Every 5 minutes
  }

  /**
   * Check integration health
   */
  async checkIntegrationHealth(integration) {
    try {
      const response = await axios({
        method: 'get',
        url: integration.healthCheckUrl || integration.baseUrl,
        timeout: 5000,
        headers: this.getIntegrationHeaders(integration)
      });

      return response.status === 200 ? 'active' : 'degraded';
    } catch (error) {
      return 'inactive';
    }
  }

  /**
   * Register new integration
   */
  async registerIntegration(integrationData) {
    try {
      // Validate integration data
      this.validateIntegrationData(integrationData);

      // Generate integration credentials
      const credentials = this.generateIntegrationCredentials();

      const integration = {
        ...integrationData,
        ...credentials,
        status: 'active',
        createdAt: new Date(),
        metrics: {
          requests: 0,
          errors: 0,
          latency: []
        }
      };

      // Save to database
      const savedIntegration = await TenantService.createIntegration(integration);

      // Set up rate limiter
      this.rateLimiters.set(savedIntegration.id, rateLimit({
        windowMs: integration.rateLimit?.windowMs || this.config.defaultRateLimit.windowMs,
        max: integration.rateLimit?.max || this.config.defaultRateLimit.max
      }));

      // Add to local cache
      this.integrations.set(savedIntegration.id, savedIntegration);

      logger.info(`Registered new integration: ${savedIntegration.id}`);
      return savedIntegration;
    } catch (error) {
      logger.error('Error registering integration:', error);
      throw error;
    }
  }

  /**
   * Validate integration data
   */
  validateIntegrationData(data) {
    const requiredFields = ['name', 'baseUrl', 'type', 'methods'];
    
    requiredFields.forEach(field => {
      if (!data[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    });

    if (!Array.isArray(data.methods)) {
      throw new Error('Methods must be an array');
    }

    if (data.methods.some(m => !['GET', 'POST', 'PUT', 'DELETE'].includes(m))) {
      throw new Error('Invalid HTTP method specified');
    }
  }

  /**
   * Generate integration credentials
   */
  generateIntegrationCredentials() {
    return {
      apiKey: crypto.randomBytes(32).toString('hex'),
      apiSecret: crypto.randomBytes(48).toString('hex')
    };
  }

  /**
   * Route API request through gateway
   */
  async routeRequest(req, res, next) {
    const startTime = Date.now();
    const integrationId = req.params.integrationId;
    const integration = this.integrations.get(integrationId);

    try {
      // Validate integration
      if (!integration || integration.status !== 'active') {
        throw new Error('Integration not found or inactive');
      }

      // Apply rate limiting
      const rateLimiter = this.rateLimiters.get(integrationId);
      await new Promise((resolve, reject) => {
        rateLimiter(req, res, (err) => {
          if (err) reject(new Error('Rate limit exceeded'));
          resolve();
        });
      });

      // Validate request
      this.validateRequest(req, integration);

      // Check cache
      const cacheKey = this.generateCacheKey(req);
      const cachedResponse = await this.getCachedResponse(cacheKey);
      if (cachedResponse) {
        return res.json(cachedResponse);
      }

      // Forward request
      const response = await this.forwardRequest(req, integration);

      // Cache response
      if (req.method === 'GET') {
        await this.cacheResponse(cacheKey, response.data);
      }

      // Update metrics
      this.updateMetrics(integration, startTime, null);

      return res.status(response.status).json(response.data);
    } catch (error) {
      this.updateMetrics(integration, startTime, error);
      next(error);
    }
  }

  /**
   * Validate API request
   */
  validateRequest(req, integration) {
    // Validate HTTP method
    if (!integration.methods.includes(req.method)) {
      throw new Error('HTTP method not allowed');
    }

    // Validate authentication
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== integration.apiKey) {
      throw new Error('Invalid API key');
    }

    // Validate tenant access
    if (integration.tenantId && req.tenant.id !== integration.tenantId) {
      throw new Error('Tenant not authorized for this integration');
    }
  }

  /**
   * Forward request to integration endpoint
   */
  async forwardRequest(req, integration) {
    const config = {
      method: req.method,
      url: `${integration.baseUrl}${req.path}`,
      headers: this.getIntegrationHeaders(integration),
      params: req.query,
      data: req.body,
      timeout: this.config.timeout
    };

    // Implement retry logic
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        return await axios(config);
      } catch (error) {
        if (attempt === this.config.retryAttempts) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  /**
   * Get integration-specific headers
   */
  getIntegrationHeaders(integration) {
    return {
      'Authorization': `Bearer ${integration.apiSecret}`,
      'User-Agent': 'Learning-Atomizer-API-Gateway/1.0',
      'X-Integration-ID': integration.id,
      ...integration.headers
    };
  }

  /**
   * Generate cache key for request
   */
  generateCacheKey(req) {
    const components = [
      req.tenant.id,
      req.method,
      req.path,
      JSON.stringify(req.query),
      JSON.stringify(req.body)
    ];

    return crypto
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex');
  }

  /**
   * Get cached response
   */
  async getCachedResponse(key) {
    try {
      const cached = await redis.get(`api:${key}`);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.error('Cache retrieval error:', error);
      return null;
    }
  }

  /**
   * Cache API response
   */
  async cacheResponse(key, data) {
    try {
      await redis.set(
        `api:${key}`,
        JSON.stringify(data),
        'EX',
        this.config.cacheExpiration
      );
    } catch (error) {
      logger.error('Cache storage error:', error);
    }
  }

  /**
   * Update integration metrics
   */
  updateMetrics(integration, startTime, error) {
    if (!integration) return;

    const latency = Date.now() - startTime;
    integration.metrics.requests++;
    
    if (error) {
      integration.metrics.errors++;
    }

    integration.metrics.latency.push(latency);
    if (integration.metrics.latency.length > 100) {
      integration.metrics.latency.shift();
    }
  }

  /**
   * Get integration metrics
   */
  async getIntegrationMetrics(integrationId) {
    const integration = this.integrations.get(integrationId);
    if (!integration) {
      throw new Error('Integration not found');
    }

    const metrics = integration.metrics;
    const avgLatency = metrics.latency.reduce((a, b) => a + b, 0) / metrics.latency.length;

    return {
      status: integration.status,
      totalRequests: metrics.requests,
      errorRate: metrics.errors / metrics.requests,
      avgLatency,
      lastCheck: integration.lastCheck,
      uptime: integration.status === 'active' ? 100 : 0 // Simplified uptime calculation
    };
  }

  /**
   * Revoke integration access
   */
  async revokeIntegration(integrationId) {
    try {
      const integration = this.integrations.get(integrationId);
      if (!integration) {
        throw new Error('Integration not found');
      }

      // Update integration status
      integration.status = 'revoked';
      
      // Remove rate limiter
      this.rateLimiters.delete(integrationId);
      
      // Update in database
      await TenantService.updateIntegration(integrationId, { status: 'revoked' });
      
      logger.info(`Revoked integration: ${integrationId}`);
    } catch (error) {
      logger.error('Error revoking integration:', error);
      throw error;
    }
  }
}

module.exports = new APIGatewayService();
