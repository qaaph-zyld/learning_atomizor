const geoip = require('geoip-lite');
const Redis = require('ioredis');
const AWS = require('aws-sdk');
const logger = require('./LoggerService');
const LoadBalancerService = require('./LoadBalancerService');

class RegionalOptimizationService {
  constructor() {
    this.config = {
      updateInterval: process.env.REGION_UPDATE_INTERVAL || 3600000, // 1 hour
      cacheExpiration: process.env.REGION_CACHE_EXPIRATION || 86400, // 24 hours
      minRegionTraffic: process.env.MIN_REGION_TRAFFIC || 1000, // requests per day
      maxLatency: process.env.MAX_LATENCY || 200, // milliseconds
      regions: process.env.AWS_REGIONS ? 
        process.env.AWS_REGIONS.split(',') : 
        ['us-east-1', 'eu-west-1', 'ap-southeast-1']
    };

    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD
    });

    this.cloudfront = new AWS.CloudFront({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION
    });

    this.regionalMetrics = new Map();
    this.routingRules = new Map();
  }

  /**
   * Initialize regional optimization service
   */
  async initialize() {
    try {
      // Load regional configurations
      await this.loadRegionalConfigs();
      
      // Start optimization cycle
      this.startOptimizationCycle();
      
      // Initialize metrics collection
      await this.initializeMetrics();
      
      logger.info('Regional Optimization Service initialized successfully');
    } catch (error) {
      logger.error('Error initializing Regional Optimization Service:', error);
      throw error;
    }
  }

  /**
   * Load regional configurations
   */
  async loadRegionalConfigs() {
    try {
      // Load existing routing rules from Redis
      const rules = await this.redis.hgetall('routing:rules');
      
      for (const [region, rule] of Object.entries(rules)) {
        this.routingRules.set(region, JSON.parse(rule));
      }

      logger.info(`Loaded ${this.routingRules.size} regional routing rules`);
    } catch (error) {
      logger.error('Error loading regional configs:', error);
      throw error;
    }
  }

  /**
   * Start optimization cycle
   */
  startOptimizationCycle() {
    setInterval(async () => {
      try {
        await this.optimizeRegions();
      } catch (error) {
        logger.error('Region optimization failed:', error);
      }
    }, this.config.updateInterval);
  }

  /**
   * Initialize metrics collection
   */
  async initializeMetrics() {
    for (const region of this.config.regions) {
      this.regionalMetrics.set(region, {
        requests: 0,
        errors: 0,
        latency: [],
        bandwidth: 0,
        activeUsers: new Set(),
        lastUpdate: new Date()
      });
    }
  }

  /**
   * Route request to optimal region
   */
  async routeRequest(req) {
    try {
      const clientIp = req.ip || req.connection.remoteAddress;
      const geo = geoip.lookup(clientIp);

      if (!geo) {
        return this.getDefaultRegion();
      }

      // Check cache first
      const cachedRegion = await this.redis.get(`route:${geo.country}`);
      if (cachedRegion) {
        return cachedRegion;
      }

      // Get optimal region based on location and metrics
      const optimalRegion = await this.getOptimalRegion(geo);

      // Cache the result
      await this.redis.set(
        `route:${geo.country}`,
        optimalRegion,
        'EX',
        this.config.cacheExpiration
      );

      return optimalRegion;
    } catch (error) {
      logger.error('Error routing request:', error);
      return this.getDefaultRegion();
    }
  }

  /**
   * Get optimal region based on location and metrics
   */
  async getOptimalRegion(geo) {
    let bestRegion = null;
    let bestScore = -1;

    for (const [region, metrics] of this.regionalMetrics) {
      const score = this.calculateRegionScore(region, geo, metrics);
      
      if (score > bestScore) {
        bestScore = score;
        bestRegion = region;
      }
    }

    return bestRegion || this.getDefaultRegion();
  }

  /**
   * Calculate region score based on multiple factors
   */
  calculateRegionScore(region, geo, metrics) {
    // Calculate distance score (0-1)
    const distanceScore = this.calculateDistanceScore(region, geo);

    // Calculate performance score (0-1)
    const performanceScore = this.calculatePerformanceScore(metrics);

    // Calculate capacity score (0-1)
    const capacityScore = this.calculateCapacityScore(metrics);

    // Calculate cost score (0-1)
    const costScore = this.calculateCostScore(region);

    // Weighted average of scores
    return (
      distanceScore * 0.4 +
      performanceScore * 0.3 +
      capacityScore * 0.2 +
      costScore * 0.1
    );
  }

  /**
   * Calculate distance score
   */
  calculateDistanceScore(region, geo) {
    const regionCoords = this.getRegionCoordinates(region);
    const distance = this.calculateDistance(
      geo.ll[0], geo.ll[1],
      regionCoords.latitude, regionCoords.longitude
    );

    // Convert distance to score (closer is better)
    return Math.max(0, 1 - (distance / 20000)); // 20000km as max distance
  }

  /**
   * Calculate performance score
   */
  calculatePerformanceScore(metrics) {
    if (metrics.requests === 0) return 0;

    // Calculate average latency
    const avgLatency = metrics.latency.reduce((a, b) => a + b, 0) / metrics.latency.length;
    
    // Calculate error rate
    const errorRate = metrics.requests > 0 ? metrics.errors / metrics.requests : 0;

    // Combine metrics into score
    const latencyScore = Math.max(0, 1 - (avgLatency / this.config.maxLatency));
    const reliabilityScore = 1 - errorRate;

    return (latencyScore + reliabilityScore) / 2;
  }

  /**
   * Calculate capacity score
   */
  calculateCapacityScore(metrics) {
    // Get current load from LoadBalancer
    const workerStats = LoadBalancerService.getWorkerStats();
    
    // Calculate load percentage
    const loadPercentage = workerStats.activeWorkers / workerStats.totalWorkers;
    
    // Convert to score (lower load is better)
    return 1 - loadPercentage;
  }

  /**
   * Calculate cost score
   */
  calculateCostScore(region) {
    // Define relative costs for each region
    const regionCosts = {
      'us-east-1': 1.0,    // baseline
      'us-west-2': 1.1,
      'eu-west-1': 1.2,
      'ap-southeast-1': 1.3
    };

    const cost = regionCosts[region] || 1.5;
    return 1 - ((cost - 1) / 0.5); // Normalize to 0-1
  }

  /**
   * Calculate distance between two points
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convert degrees to radians
   */
  toRad(degrees) {
    return degrees * Math.PI / 180;
  }

  /**
   * Get region coordinates
   */
  getRegionCoordinates(region) {
    const coordinates = {
      'us-east-1': { latitude: 37.7749, longitude: -122.4194 },
      'us-west-2': { latitude: 47.6062, longitude: -122.3321 },
      'eu-west-1': { latitude: 51.5074, longitude: -0.1278 },
      'ap-southeast-1': { latitude: 1.3521, longitude: 103.8198 }
    };

    return coordinates[region] || coordinates['us-east-1'];
  }

  /**
   * Get default region
   */
  getDefaultRegion() {
    return this.config.regions[0];
  }

  /**
   * Update regional metrics
   */
  async updateMetrics(region, metrics) {
    const regionalMetrics = this.regionalMetrics.get(region);
    if (!regionalMetrics) return;

    // Update metrics
    regionalMetrics.requests += metrics.requests || 0;
    regionalMetrics.errors += metrics.errors || 0;
    regionalMetrics.bandwidth += metrics.bandwidth || 0;
    
    if (metrics.latency) {
      regionalMetrics.latency.push(metrics.latency);
      if (regionalMetrics.latency.length > 1000) {
        regionalMetrics.latency.shift();
      }
    }

    if (metrics.userId) {
      regionalMetrics.activeUsers.add(metrics.userId);
    }

    regionalMetrics.lastUpdate = new Date();

    // Store in Redis
    await this.redis.hset(
      `metrics:${region}`,
      {
        requests: regionalMetrics.requests,
        errors: regionalMetrics.errors,
        bandwidth: regionalMetrics.bandwidth,
        activeUsers: regionalMetrics.activeUsers.size,
        avgLatency: regionalMetrics.latency.reduce((a, b) => a + b, 0) / regionalMetrics.latency.length
      }
    );
  }

  /**
   * Optimize regions based on collected metrics
   */
  async optimizeRegions() {
    try {
      logger.info('Starting region optimization');

      for (const [region, metrics] of this.regionalMetrics) {
        // Skip regions with insufficient traffic
        if (metrics.requests < this.config.minRegionTraffic) {
          continue;
        }

        // Calculate optimization metrics
        const performance = this.calculatePerformanceScore(metrics);
        const capacity = this.calculateCapacityScore(metrics);
        const cost = this.calculateCostScore(region);

        // Generate new routing rules
        const rules = this.generateRoutingRules(region, {
          performance,
          capacity,
          cost
        });

        // Update routing rules
        this.routingRules.set(region, rules);
        await this.redis.hset(
          'routing:rules',
          region,
          JSON.stringify(rules)
        );

        // Update CloudFront distribution if needed
        await this.updateCloudFrontDistribution(region, rules);
      }

      logger.info('Region optimization completed');
    } catch (error) {
      logger.error('Region optimization failed:', error);
      throw error;
    }
  }

  /**
   * Generate routing rules based on metrics
   */
  generateRoutingRules(region, scores) {
    return {
      region,
      priority: Math.round((scores.performance + scores.capacity) * 100),
      threshold: {
        maxLatency: this.config.maxLatency,
        maxLoad: 0.8,
        minPerformance: 0.7
      },
      weights: {
        performance: scores.performance,
        capacity: scores.capacity,
        cost: scores.cost
      },
      updatedAt: new Date()
    };
  }

  /**
   * Update CloudFront distribution
   */
  async updateCloudFrontDistribution(region, rules) {
    try {
      const params = {
        Id: process.env.CLOUDFRONT_DISTRIBUTION_ID,
        DistributionConfig: {
          Origins: {
            Items: [{
              Id: region,
              DomainName: `${region}.example.com`,
              CustomOriginConfig: {
                HTTPPort: 80,
                HTTPSPort: 443,
                OriginProtocolPolicy: 'https-only'
              }
            }],
            Quantity: 1
          },
          DefaultCacheBehavior: {
            TargetOriginId: region,
            ViewerProtocolPolicy: 'redirect-to-https',
            MinTTL: 0,
            DefaultTTL: 3600,
            MaxTTL: 86400,
            ForwardedValues: {
              QueryString: true,
              Cookies: {
                Forward: 'all'
              }
            }
          },
          Enabled: true
        }
      };

      await this.cloudfront.updateDistribution(params).promise();
      logger.info(`Updated CloudFront distribution for region ${region}`);
    } catch (error) {
      logger.error(`Failed to update CloudFront distribution for region ${region}:`, error);
      throw error;
    }
  }

  /**
   * Get regional metrics
   */
  async getRegionalMetrics() {
    const metrics = {};
    
    for (const [region, regionalMetrics] of this.regionalMetrics) {
      metrics[region] = {
        requests: regionalMetrics.requests,
        errors: regionalMetrics.errors,
        bandwidth: regionalMetrics.bandwidth,
        activeUsers: regionalMetrics.activeUsers.size,
        avgLatency: regionalMetrics.latency.reduce((a, b) => a + b, 0) / regionalMetrics.latency.length,
        lastUpdate: regionalMetrics.lastUpdate
      };
    }

    return metrics;
  }

  /**
   * Get routing rules
   */
  getRoutingRules() {
    return Array.from(this.routingRules.entries()).map(([region, rules]) => ({
      region,
      ...rules
    }));
  }
}

module.exports = new RegionalOptimizationService();
